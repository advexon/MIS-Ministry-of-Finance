import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'

const source=ts.createSourceFile('bank-directory-editor.tsx',readFileSync('components/admin/bank-directory-editor.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX)
const handlers={}
function visit(node){
  if(ts.isVariableDeclaration(node)&&ts.isIdentifier(node.name)&&['submit','changeOpen'].includes(node.name.text))handlers[node.name.text]=ts.transpileModule(`const ${node.getText(source)}`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText
  ts.forEachChild(node,visit)
}
visit(source)
assert.ok(handlers.submit);assert.ok(handlers.changeOpen)
const copy={invalid:'invalid',unconfirmed:'unconfirmed',failed:'failed',stale:'stale',deleteDescription:'linked',saved:'saved',refreshFailed:'refresh-failed'}
function harness(overrides={}){
  const calls=[],errors=[],busy=[],toasts=[],recorded=[],opens=[]
  const context={
    copy,confirmed:true,inFlight:{current:false},requestId:{current:'bank-1'},revision:{current:3},reason:' Approved change ',deleting:false,bankId:undefined,
    draft:{code:' BANK ',name_en:' Bank name ',name_ru:'',name_tj:'',city:'City',district:'District',is_active:true},
    missingFields:()=>[],setError:value=>errors.push(value),setSaving:value=>busy.push(value),toast:value=>toasts.push(value),setOpen:value=>opens.push(value),
    onSaved:async value=>recorded.push(value),
    createClient:()=>({rpc:async(name,input)=>{calls.push({name,input});return {data:{id:input.p_id,deleted:input.p_delete,record:input.p_delete?null:{id:input.p_id,administration_revision:input.p_expected_revision===null?0:input.p_expected_revision+1,bank_id:input.p_bank_id}}}}}),
    ...overrides,
  }
  return {context,calls,errors,busy,toasts,recorded,opens,submit:runInNewContext(`${handlers.submit}\nsubmit`,context)}
}
for(const overrides of [{confirmed:false},{inFlight:{current:true}},{reason:' '},{reason:'x'.repeat(2001)},{missingFields:()=>['Name']}]){
  const test=harness(overrides);await test.submit();assert.equal(test.calls.length,0)
}
for(const [revision,bankId,deleting] of [[null,undefined,false],[3,undefined,false],[0,'parent-bank',false],[0,'parent-bank',true]]){
  const test=harness({revision:{current:revision},bankId,deleting});await test.submit()
  assert.equal(test.calls.length,1);assert.equal(test.calls[0].name,'cgf_save_bank_directory')
  assert.equal(test.calls[0].input.p_resource,bankId?'bank_branches':'banks')
  assert.equal(test.calls[0].input.p_expected_revision,revision);assert.equal(test.calls[0].input.p_reason,'Approved change')
  assert.equal(test.calls[0].input.p_delete,deleting);assert.equal(test.recorded.length,1);assert.equal(test.toasts[0].title,'saved')
  assert.deepEqual(test.busy,[true,false]);assert.deepEqual(test.opens,[false])
  if(deleting)assert.deepEqual(Object.keys(test.calls[0].input.p_values),[])
  else{assert.equal(test.calls[0].input.p_values.code,'BANK');assert.equal(test.calls[0].input.p_values.name_ru,null);assert.equal('city' in test.calls[0].input.p_values,!!bankId)}
}
for(const failure of ['network','rpc','stale','linked','empty','id','deleted','record-id','revision','bank']){
  let attempts=0
  const test=harness({bankId:'parent-bank',createClient:()=>({rpc:async(_name,input)=>{
    attempts++
    if(failure==='network')throw new Error('network lost')
    if(['rpc','stale','linked'].includes(failure))return {error:{code:failure==='stale'?'40001':failure==='linked'?'23503':'23514',message:'rpc failed'}}
    if(failure==='empty')return {data:null}
    const data={id:input.p_id,deleted:false,record:{id:input.p_id,administration_revision:4,bank_id:'parent-bank'}}
    if(failure==='id')data.id='other';if(failure==='deleted')data.deleted=true;if(failure==='record-id')data.record.id='other';if(failure==='revision')data.record.administration_revision=9;if(failure==='bank')data.record.bank_id='other'
    return {data}
  }})})
  await test.submit();await test.submit()
  assert.equal(attempts,2);assert.equal(test.recorded.length,0);assert.equal(test.toasts.length,0);assert.deepEqual(test.opens,[])
  assert.equal(test.context.inFlight.current,false)
  if(failure==='stale')assert.equal(test.errors.at(-1),'stale')
  if(failure==='linked')assert.equal(test.errors.at(-1),'linked')
  assert.equal(test.context.requestId.current,'bank-1');assert.equal(test.context.revision.current,3)
}
{
  const test=harness({onSaved:async()=>{throw new Error('Refresh failed')}});await test.submit()
  assert.deepEqual(test.toasts.map(value=>value.title),['saved','refresh-failed']);assert.deepEqual(test.opens,[false]);assert.equal(test.context.inFlight.current,false)
}
{
  let resolve
  const pending=new Promise(done=>{resolve=done})
  let calls=0
  const test=harness({createClient:()=>({rpc:async()=>{calls++;await pending;return {error:{message:'failed'}}}})})
  const first=test.submit();await test.submit();assert.equal(calls,1);assert.equal(test.context.inFlight.current,true)
  resolve();await first;assert.equal(test.context.inFlight.current,false)
}
{
  const updates=[],context={inFlight:{current:true},setOpen:value=>updates.push(value)}
  const changeOpen=runInNewContext(`${handlers.changeOpen}\nchangeOpen`,context)
  changeOpen(false);assert.equal(updates.length,0)
}
const exports={}
runInNewContext(ts.transpileModule(readFileSync('lib/admin/bank-directory.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,{exports})
const allowed=exports.canAdministerBankDirectory
const profile={is_active:true,bank_id:null},role={code:'super_admin',tier:1,is_active:true}
assert.equal(allowed(profile,role),true);assert.equal(allowed(profile,{...role,code:'prsf_admin',tier:2}),true)
for(const [p,r] of [[null,role],[profile,null],[{...profile,is_active:false},role],[{...profile,bank_id:'bank'},role],[profile,{...role,is_active:false}],[profile,{...role,tier:2}],[profile,{...role,code:'prsf_analyst'}]])assert.equal(allowed(p,r),false)
console.log('Directory UI handlers passed: exact receipts, branch scope, create/edit/delete, required confirmation/reason, stale and lost responses, stable retry identity, pending/double-submit guards, refresh-after-save distinction and canonical administrator controls. This is not signed-in browser acceptance.')
