import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { mutate } from 'swr'
import ts from 'typescript'
const compile=text=>ts.transpileModule(text,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText
const bank={};runInNewContext(compile(readFileSync('lib/admin/bank-directory.ts','utf8')),{exports:bank})
const contract={};runInNewContext(compile(readFileSync('lib/admin/borrower-administration.ts','utf8')),{exports:contract,require:()=>bank})
const {borrowerDraft,borrowerValues,confirmsBorrowerSave,BORROWER_COPY,borrowerSearchFilter}=contract
for(const locale of ['ru','tj']){assert.deepEqual(Object.keys(BORROWER_COPY[locale]),Object.keys(BORROWER_COPY.en));for(const key of Object.keys(BORROWER_COPY.en))assert.notEqual(BORROWER_COPY[locale][key],BORROWER_COPY.en[key])}
const record={id:'00000000-0000-4000-8000-000000000100',name:'Original',legal_type:'llc',tin_number:'123456789',registration_number:null,phone:'12345',administration_revision:3,applications:[{count:0}]}
const draft=borrowerDraft(record);draft.address_city=' Dushanbe ';draft.workforce_count='0'
const values=borrowerValues(draft,record);assert.equal(values.address_city,'Dushanbe');assert.equal(values.workforce_count,0);assert.equal(values.legal_rep_tin,null)
assert.equal(Object.keys(values).length,19)
for(const bad of [{name:''},{legal_type:'bad'},{tin_number:'123'},{legal_rep_tin:'bad'},{email:'bad'},{legal_rep_gender:'bad'},{legal_rep_birthdate:'2026-02-30'},{legal_rep_birthdate:'9999-01-01'},{workforce_count:'1.2'},{workforce_count:'-1'},{workforce_count:'2147483648'},{phone:'x'.repeat(51)},{sector_id:'wrong'}])assert.equal(borrowerValues({...draft,...bad},record),null)
assert.equal(borrowerValues({...draft,name:'Changed'},{...record,applications:[{count:1}]}),null)
assert.ok(borrowerValues({...draft,phone:'555'},{...record,applications:[{count:1}]}))
assert.equal(borrowerSearchFilter(' A,B%_"\\ '),'tin_number.ilike."%A,B\\%\\_\\"\\\\%",name.ilike."%A,B\\%\\_\\"\\\\%"')
const receipt=()=>({id:record.id,deleted:false,record:{id:record.id,administration_revision:4,...values}})
assert.ok(confirmsBorrowerSave(receipt(),record.id,3,values,false))
for(const data of [null,{}, {...receipt(),id:'wrong'},{...receipt(),record:{...receipt().record,phone:'changed'}},{...receipt(),record:{...receipt().record,administration_revision:3}}])assert.equal(confirmsBorrowerSave(data,record.id,3,values,false),false)
assert.ok(confirmsBorrowerSave({id:record.id,deleted:true,record:null},record.id,3,values,true))
function handlers(path,names){const ast=ts.createSourceFile(path,readFileSync(path,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),result={};function visit(node){if(ts.isVariableDeclaration(node)&&ts.isIdentifier(node.name)&&names.includes(node.name.text))result[node.name.text]=compile(`const ${node.getText(ast)}`);ts.forEachChild(node,visit)}visit(ast);for(const name of names)assert.ok(result[name]);return result}
const editor=handlers('components/borrowers/borrower-editor.tsx',['submit','reload'])
function harness(overrides={}){
 const calls=[],errors=[],uncertain=[],toasts=[],closed=[]
 const context={inFlight:{current:false},disabled:false,uncertain:false,stale:false,confirmed:true,deleting:false,linked:false,draft,record,revision:3,reason:' Approved correction ',borrowerValues,confirmsBorrowerSave,copy:BORROWER_COPY.en,
 setError:v=>errors.push(v),setUncertain:v=>{uncertain.push(v);context.uncertain=v},setBusy:()=>{},toast:v=>toasts.push(v),onClose:()=>closed.push(true),refresh:async()=>({borrowers:[record],total:1}),loadSectors:async()=>[],mutateSectors:async promise=>promise,
 createClient:()=>({rpc:async(name,input)=>{calls.push({name,input});return{data:input.p_delete?{id:record.id,deleted:true,record:null}:receipt()}}}),...overrides}
 return{context,calls,errors,uncertain,toasts,closed,submit:runInNewContext(`${editor.submit}\nsubmit`,context),reload:runInNewContext(`${editor.reload}\nreload`,context)}
}
for(const overrides of [{disabled:true},{uncertain:true},{stale:true},{confirmed:false},{inFlight:{current:true}},{deleting:true,linked:true},{reason:'ab'},{draft:{...draft,workforce_count:'0.5'}}]){const t=harness(overrides);await t.submit();assert.equal(t.calls.length,0)}
for(const overrides of [{},{deleting:true}]){const t=harness(overrides);await t.submit();assert.equal(t.calls.length,1);assert.equal(t.calls[0].name,'cgf_save_borrower');assert.equal(t.calls[0].input.p_expected_revision,3);assert.equal(t.calls[0].input.p_reason,'Approved correction');assert.deepEqual(t.closed,[true]);assert.equal(t.toasts[0].title,BORROWER_COPY.en.saved)}
for(const [code,key,locked] of [['40001','stale',true],['23503','linked',false],['23505','duplicate',false],['23514','failed',false],['42501','failed',false],['XX000','review',true]]){const t=harness({createClient:()=>({rpc:async()=>({error:{code,message:'Private details'}})})});await t.submit();assert.equal(t.errors.at(-1),key);assert.equal(t.context.uncertain,locked);assert.equal(t.closed.length,0);assert.equal(t.context.reason,' Approved correction ')}
for(const rpc of [async()=>{throw Error('Network')},async()=>({data:null}),async()=>({data:{...receipt(),record:{...receipt().record,administration_revision:5}}})]){const t=harness({createClient:()=>({rpc})});await t.submit();assert.equal(t.errors.at(-1),'review');assert.equal(t.context.uncertain,true);assert.equal(t.closed.length,0)}
{const t=harness({refresh:async()=>{throw Error('Refresh failed')}});await t.submit();assert.deepEqual(t.toasts.map(v=>v.title),[BORROWER_COPY.en.saved,BORROWER_COPY.en.refreshFailed]);assert.deepEqual(t.closed,[true])}
{let finish,calls=0;const waiting=new Promise(resolve=>{finish=resolve});const t=harness({createClient:()=>({rpc:async()=>{calls++;await waiting;return{data:receipt()}}})});const first=t.submit();await t.submit();assert.equal(calls,1);finish();await first;assert.equal(t.context.inFlight.current,false)}
for(const [rows,key] of [[{borrowers:[record],total:1},null],[{borrowers:[{...record,administration_revision:4}],total:1},'stale'],[{borrowers:[],total:0},'stale']]){const t=harness({uncertain:true,refresh:async()=>rows});await t.reload();assert.equal(t.errors.at(-1),key);assert.equal(t.context.uncertain,key!==null);assert.equal(t.context.reason,' Approved correction ')}
{const t=harness({mutateSectors:async()=>{throw Error('Read failed')}});await t.reload();assert.equal(t.errors.at(-1),'unavailable');assert.equal(t.context.uncertain,true)}
const parent=handlers('app/dashboard/borrowers/page.tsx',['refresh'])
{const key=['borrower-read-regression',crypto.randomUUID()],summaryKey=[...key,'summary'];await mutate(key,{borrowers:[record],total:1},{revalidate:false});await mutate(summaryKey,{totalCount:1},{revalidate:false});const blocked=[];const context={inFlight:{current:null},setRefreshing:()=>{},setRefreshBlocked:v=>blocked.push(v),loadBorrowers:async()=>{throw Error('Read failed')},loadSummary:async()=>({totalCount:1}),mutate:(promise,options)=>mutate(key,promise,options),mutateSummary:(promise,options)=>mutate(summaryKey,promise,options)};const refresh=runInNewContext(`${parent.refresh}\nrefresh`,{...context,Promise,Array,Error});await assert.rejects(refresh,/Read failed/);assert.equal(blocked.at(-1),true);context.loadBorrowers=async()=>({borrowers:[record],total:1});const recovered=runInNewContext(`${parent.refresh}\nrefresh`,{...context,Promise,Array,Error});assert.equal((await recovered()).total,1);assert.equal(blocked.at(-1),false);await mutate(key,undefined,{revalidate:false});await mutate(summaryKey,undefined,{revalidate:false})}
console.log('Borrower UI: multilingual fields, literal search, exact receipts, actual save/reload handlers, failure/duplicate/stale locking, history protection and real SWR read-failure recovery passed.')
