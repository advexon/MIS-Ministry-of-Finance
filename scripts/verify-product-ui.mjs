import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { mutate } from 'swr'
import ts from 'typescript'

const compile = text => ts.transpileModule(text,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText
const bankExports = {}
runInNewContext(compile(readFileSync('lib/admin/bank-directory.ts','utf8')),{exports:bankExports})
const contract = {}
runInNewContext(compile(readFileSync('lib/admin/product-administration.ts','utf8')),{exports:contract,require:()=>bankExports})
const { productValues, confirmsProductSave, PRODUCT_COPY } = contract
for (const language of ['ru','tj']) {
  assert.deepEqual(Object.keys(PRODUCT_COPY[language]),Object.keys(PRODUCT_COPY.en))
  for (const key of Object.keys(PRODUCT_COPY.en)) assert.notEqual(PRODUCT_COPY[language][key],PRODUCT_COPY.en[key])
}
const draft = {code:' product ',name_en:' Product ',name_ru:'',name_tj:'',guarantee_coverage:'65.25',is_active:true}
const values = productValues(draft)
assert.equal(values.code,'PRODUCT'); assert.equal(values.guarantee_coverage,65.25); assert.equal(values.name_ru,null)
for (const guarantee_coverage of ['', 'NaN','Infinity','0','-1','100.01','10.001','1e1']) assert.equal(productValues({...draft,guarantee_coverage}),null)
for (const guarantee_coverage of ['0.01','100','65.2']) assert.ok(productValues({...draft,guarantee_coverage}))
const confirmed = (id='product-1',revision=3) => ({id,deleted:false,record:{id,administration_revision:revision+1,...values}})
assert.equal(confirmsProductSave(confirmed(),'product-1',3,values,false),true)
for (const data of [null,{}, {...confirmed(),id:'other'},{...confirmed(),record:{...confirmed().record,guarantee_coverage:50}},{...confirmed(),record:{...confirmed().record,administration_revision:3}}]) assert.equal(confirmsProductSave(data,'product-1',3,values,false),false)
assert.equal(confirmsProductSave({id:'product-1',deleted:true,record:null},'product-1',3,null,true),true)
assert.equal(confirmsProductSave({id:'product-1',deleted:true,record:{}},'product-1',3,null,true),false)
function handlers(path,names) {
  const source=ts.createSourceFile(path,readFileSync(path,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX)
  const result={}
  function visit(node) { if(ts.isVariableDeclaration(node)&&ts.isIdentifier(node.name)&&names.includes(node.name.text)) result[node.name.text]=compile(`const ${node.getText(source)}`); ts.forEachChild(node,visit) }
  visit(source); for(const name of names)assert.ok(result[name]);return result
}
const editor=handlers('components/admin/product-editor.tsx',['submit','reload','changeOpen'])
function harness(overrides={}) {
  const calls=[],errors=[],toasts=[],opens=[],uncertain=[],busy=[]
  const context={
    inFlight:{current:false},allowed:true,available:true,refreshing:false,uncertain:false,stale:false,confirmed:true,draft:{...draft},reason:' Approved change ',deleting:false,record:{id:'product-1'},
    revision:3,requestId:{current:'product-1'},productValues,confirmsProductSave,copy:PRODUCT_COPY.en,
    setError:value=>errors.push(value),setUncertain:value=>{uncertain.push(value);context.uncertain=value},setBusy:value=>busy.push(value),setOpen:value=>opens.push(value),toast:value=>toasts.push(value),
    refresh:async()=>[],createClient:()=>({rpc:async(name,input)=>{calls.push({name,input});return {data:input.p_delete?{id:input.p_id,deleted:true,record:null}:confirmed(input.p_id,input.p_expected_revision??-1)}}}),
    ...overrides,
  }
  return {context,calls,errors,toasts,opens,uncertain,busy,submit:runInNewContext(`${editor.submit}\nsubmit`,context),reload:runInNewContext(`${editor.reload}\nreload`,context)}
}
for (const overrides of [{allowed:false},{available:false},{refreshing:true},{uncertain:true},{stale:true},{confirmed:false},{inFlight:{current:true}},{draft:{...draft,guarantee_coverage:'0'}},{reason:'ab'},{reason:'x'.repeat(2001)}]) {
  const t=harness(overrides);await t.submit();assert.equal(t.calls.length,0)
}
for (const overrides of [{},{deleting:true},{revision:null,record:undefined}]) {
  const t=harness(overrides);await t.submit();assert.equal(t.calls.length,1);assert.equal(t.calls[0].name,'cgf_save_product');assert.equal(t.calls[0].input.p_reason,'Approved change');assert.equal(t.toasts[0].title,PRODUCT_COPY.en.saved);assert.deepEqual(t.opens,[false]);assert.deepEqual(t.busy,[true,false])
}
for (const [code,key,locked] of [['40001','stale',true],['23503','linked',false],['23505','duplicate',false],['23514','failed',false],['42501','failed',false],['XX000','review',true]]) {
  const t=harness({createClient:()=>({rpc:async()=>({error:{code,message:'Private database detail'}})})});await t.submit();assert.equal(t.errors.at(-1),key);assert.equal(t.context.uncertain,locked);assert.equal(t.toasts.length,0);assert.equal(t.opens.length,0);assert.equal(t.context.draft.name_en,draft.name_en)
}
for (const rpc of [async()=>{throw new Error('Network')},async()=>({data:null}),async()=>({data:{...confirmed(),record:{...confirmed().record,name_en:'Other'}}})]) {
  const t=harness({createClient:()=>({rpc})});await t.submit();assert.equal(t.errors.at(-1),'review');assert.equal(t.context.uncertain,true);assert.deepEqual(t.opens,[])
}
{
  const t=harness({refresh:async()=>{throw new Error('Read failed')}});await t.submit();assert.deepEqual(t.toasts.map(value=>value.title),[PRODUCT_COPY.en.saved,PRODUCT_COPY.en.refreshFailed]);assert.equal(t.errors.at(-1),null);assert.deepEqual(t.opens,[false])
}
{
  let finish;const waiting=new Promise(resolve=>{finish=resolve});let calls=0
  const t=harness({createClient:()=>({rpc:async()=>{calls++;await waiting;return {data:confirmed()}}})});const first=t.submit();await t.submit();assert.equal(calls,1);finish();await first;assert.equal(t.context.inFlight.current,false)
}
for (const [rows,error,locked] of [[[{id:'product-1',administration_revision:3}],null,false],[[{id:'product-1',administration_revision:4}],'stale',true],[[],'stale',true]]) {
  const t=harness({uncertain:true,refresh:async()=>rows});await t.reload();assert.equal(t.errors.at(-1),error);assert.equal(t.context.uncertain,locked);assert.equal(t.context.reason,' Approved change ')
}
{
  const t=harness({record:undefined,refresh:async()=>[{id:'product-1',administration_revision:0}]});await t.reload();assert.equal(t.errors.at(-1),'review');assert.equal(t.context.uncertain,true)
}
{
  const t=harness({uncertain:true,refresh:async()=>{throw new Error('Read failed')}});await t.reload();assert.equal(t.errors.at(-1),'refreshFailedDraft');assert.equal(t.context.uncertain,true);assert.equal(t.context.inFlight.current,false)
}
const parent=handlers('components/admin/product-controls.tsx',['refresh'])
{
  const key=['product-refresh-regression',crypto.randomUUID()]
  const cached=[{id:'product-1',administration_revision:3}]
  await mutate(key,cached,{revalidate:false})
  const blocked=[],refreshing=[]
  const context={inFlight:{current:null},setRefreshing:v=>refreshing.push(v),setRefreshBlocked:v=>blocked.push(v),loadProducts:async()=>{throw new Error('Actual read rejected')},mutate:(promise,options)=>mutate(key,promise,options)}
  const refresh=runInNewContext(`${parent.refresh}\nrefresh`,context)
  await assert.rejects(refresh,/Actual read rejected/);assert.equal(blocked.at(-1),true);assert.equal(context.inFlight.current,null)
  context.loadProducts=async()=>[{id:'product-1',administration_revision:4}]
  const fresh=await refresh();assert.equal(fresh[0].administration_revision,4);assert.equal(blocked.at(-1),false)
  let finish;let reads=0;context.loadProducts=()=>{reads++;return new Promise(resolve=>{finish=resolve})}
  const first=refresh(),second=refresh();assert.equal(first,second);assert.equal(reads,1);finish(cached);await first
  await mutate(key,undefined,{revalidate:false})
}
const settings=readFileSync('app/dashboard/settings/page.tsx','utf8')
assert.match(settings,/TabsContent value="products"><ProductControls/)
const intake=readFileSync('components/workflow/application-form.tsx','utf8')
assert.match(intake,/coverageOverride \?\? \(product \? String\(product.guarantee_coverage\)/)
console.log('Product UI passed: multilingual contract, coverage validation, exact receipts, actual save/reload handlers, authorization/readiness, uncertain/stale locking, preserved drafts, duplicate requests and real SWR failed/successful refresh propagation.')
