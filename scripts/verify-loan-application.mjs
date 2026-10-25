import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { runInNewContext } from 'node:vm'
const source = readFileSync('components/workflow/application-form.tsx','utf8')
assert.match(source, /rpc\('cgf_save_application'/)
assert.doesNotMatch(source, /\.from\("(?:borrowers|loan_applications|audit_trail)"\)\s*\.(?:insert|update)/)
assert.match(source, /if \(inFlight\.current \|\| !canCreateLoan\) return/)
assert.match(source, /await waitForSave\(\)/)
assert.match(source, /p_draft: editing \? null : getCurrentDraftId\(\)/)
const tree=ts.createSourceFile('form.tsx',source,99,true,4)
let inventory, stateCount=0
function visit(node){if(ts.isVariableDeclaration(node)&&node.name.getText(tree)==='formData')inventory=node.initializer.arguments[0].body.expression.properties.length;if(ts.isCallExpression(node)&&node.expression.getText(tree)==='useState'&&node.arguments[0]?.getText(tree).startsWith('initialData.'))stateCount++;ts.forEachChild(node,visit)}visit(tree)
assert.equal(stateCount,inventory)
const helper=readFileSync('lib/workflow/application-intake.ts','utf8')
const js=ts.transpileModule(helper,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText
const exports={};runInNewContext(js,{exports})
const {applicationActions,applicationToForm}=exports
for(const role of ['prsf_analyst','prsf_admin','auditor','legal_officer','compliance_officer'])for(const status of ['draft','submitted','approved','guarantee_issued','active','defaulted'])assert.equal(applicationActions(status,role).length,0)
assert.deepEqual(Array.from(applicationActions('guarantee_issued','super_admin')),['record_disbursement'])
assert.deepEqual(Array.from(applicationActions('approved','bank_officer')),[])
const form=applicationToForm({bank_id:'bank',currency:'TJS',approved_amount:0,guarantee_coverage:0,grace_period_months:0,intake_data:{clientName:'Snapshot',annualTurnover:'0',guarantors:[]},borrower:{name:'Directory',legal_type:'sole_proprietor'}})
assert.equal(form.clientName,'Snapshot');assert.equal(form.requestedAmount,'0');assert.equal(form.guaranteeCoverage,'0');assert.equal(form.annualTurnover,'0');assert.equal(form.legalEntityType,'individual_entrepreneur')
const detail=readFileSync('app/dashboard/loans/[id]/page.tsx','utf8')
assert.match(detail,/\.eq\('status', loan.status\)/)
assert.match(detail,/data\?\.id !== loan.id \|\| data\?\.status !== newStatus/)
assert.doesNotMatch(detail,/await transition\("claim_pending"/)
const register=readFileSync('app/dashboard/loans/page.tsx','utf8')
assert.match(register,/cgf_search_applications/);assert.doesNotMatch(register,/\.limit\(200\)/)
let submitNode
function findSubmit(node) { if (ts.isVariableDeclaration(node) && node.name.getText(tree) === 'handleSubmit') submitNode = node.initializer; ts.forEachChild(node, findSubmit) }
findSubmit(tree)
const compiled = ts.transpileModule(`const handler = ${submitNode.getText(tree)}`, {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText
function submitHarness(response, overrides={}) {
  const state={errors:[],success:false,navigations:[],calls:[],busy:[],retry:[]}
  const scope={inFlight:{current:false},canCreateLoan:true,retryLocked:false,isFormValid:true,allErrors:[],setTouchedFields:()=>{},setError:value=>state.errors.push(value),setIsSubmitting:value=>state.busy.push(value),stopAutoSave:()=>{},pendingSubmission:{current:null},formData:{clientName:'QA',annualTurnover:'0'},requestAuthorityReason:async()=> 'QA reason',waitForSave:async()=>{},applicationId:{current:'request-id'},initialLoan:undefined,editing:false,getCurrentDraftId:()=> 'draft-id',supabase:{rpc:async(name,args)=>{state.calls.push({name,args});if(response instanceof Error)throw response;return response}},setSuccess:value=>{state.success=value},router:{push:path=>state.navigations.push(path)},setRetryLocked:value=>state.retry.push(value),getDatabaseErrorMessage:error=>error.message??'Save failed',structuredClone,...overrides}
  return {state,scope,handler:runInNewContext(`${compiled}\nhandler`,scope)}
}
const ok=submitHarness({data:{id:'request-id',status:'draft',revision:0},error:null})
await ok.handler({preventDefault(){}})
assert.equal(ok.state.success,true);assert.deepEqual(ok.state.navigations,['/dashboard/loans/request-id']);assert.equal(ok.state.calls[0].name,'cgf_save_application');assert.equal(ok.state.calls[0].args.p_draft,'draft-id');assert.equal(ok.state.calls[0].args.p_form.annualTurnover,'0');assert.equal(ok.scope.inFlight.current,false)
for(const response of [{data:null,error:{code:'22023',message:'Invalid terms'}},{data:{id:'wrong',status:'draft',revision:0},error:null},new Error('Offline')]) {
  const h=submitHarness(response);await h.handler({preventDefault(){}});assert.equal(h.state.success,false);assert.equal(h.state.navigations.length,0);assert.equal(h.state.busy.at(-1),false);assert.equal(h.scope.inFlight.current,false);assert.ok(h.state.errors.at(-1))
}
const denied=submitHarness(null,{canCreateLoan:false});await denied.handler({preventDefault(){}});assert.equal(denied.state.calls.length,0)
const blocked=submitHarness(null,{inFlight:{current:true}});await blocked.handler({preventDefault(){}});assert.equal(blocked.state.calls.length,0)
const correction=submitHarness({data:{id:'request-id',status:'docs_incomplete',revision:3},error:null},{initialLoan:{status:'docs_incomplete',intake_revision:2},editing:true});await correction.handler({preventDefault(){}});assert.equal(correction.state.calls[0].args.p_expected_revision,2);assert.equal(correction.state.calls[0].args.p_draft,null)
console.log(`Loan application client regressions passed: ${inventory} initial/restored fields; actual handler success, validation/network/mismatched-receipt failures, permissions, in-flight blocking, correction revisions, draft retirement and zero preservation. Live SQL acceptance is separate.`)
