import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'

const editor=readFileSync('components/admin/bank-directory-editor.tsx','utf8')
assert.match(editor,/inFlight\.current \|\| !confirmed/)
assert.match(editor,/p_expected_revision: revision\.current/)
assert.match(editor,/data\?\.deleted !== deleting/)
assert.match(editor,/failure\.code === '40001'/)
assert.match(editor,/catch \{ toast\(\{ title: copy\.refreshFailed/)
assert.match(editor,/if \(inFlight\.current\) return/)
for(const path of ['app/dashboard/banks/page.tsx','app/dashboard/banks/[id]/page.tsx'])assert.doesNotMatch(readFileSync(path,'utf8'),/\.from\('banks'\)\.(insert|update|delete)\(/)
const live=readFileSync('scripts/verify-bank-directory.sql','utf8')
assert.match(live,/set_config\('request\.jwt\.claim\.role','authenticated',true\);\s*set local role authenticated;/)
assert.match(live,/rollback;\s*$/)

const db=new PGlite()
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
let assertions=0
const equal=(actual,expected)=>{assert.deepEqual(actual,expected);assertions++}
const rejects=async(fn,pattern)=>{await assert.rejects(fn,pattern);assertions++}
await db.exec(`
create role anon;create role authenticated;create schema auth;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create table roles(id uuid primary key,code text,tier integer,is_active boolean);
create table banks(id uuid primary key,code varchar(50) not null unique,name_en varchar(255) not null,name_ru varchar(255),name_tj varchar(255),is_active boolean default true,created_at timestamptz default now(),updated_at timestamptz default now());
create table bank_branches(id uuid primary key,bank_id uuid not null references banks on delete cascade,code varchar(50) not null,name_en varchar(255) not null,name_ru varchar(255),name_tj varchar(255),city varchar(100),district varchar(100),is_active boolean default true,created_at timestamptz default now(),updated_at timestamptz default now(),unique(bank_id,code));
create table profiles(id uuid primary key,role_id uuid references roles,bank_id uuid references banks,branch_id uuid references bank_branches on delete set null,is_active boolean);
create table loan_applications(id uuid primary key,bank_id uuid references banks,branch_id uuid references bank_branches);
create table audit_trail(id uuid default gen_random_uuid(),table_name text not null,record_id uuid,action text not null,changed_by uuid,old_data jsonb,new_data jsonb);
grant all on banks,bank_branches to anon,authenticated;
grant usage on schema auth to authenticated;grant select on banks,bank_branches to authenticated;
`)
await db.exec(readFileSync('scripts/059_cgf_bank_directory_administration.sql','utf8'))
for(const [n,code,tier] of [[1,'super_admin',1],[2,'prsf_admin',2],[3,'auditor',5],[4,'legal_officer',4],[5,'prsf_analyst',4],[6,'bank_officer',7],[7,'super_admin',2],[8,'prsf_admin',1]]){
  await db.query('insert into roles values($1,$2,$3,true)',[id(n),code,tier])
  await db.query('insert into profiles(id,role_id,is_active) values($1,$2,true)',[id(n+10),id(n)])
}
const actor=async n=>db.query("select set_config('request.jwt.claim.sub',$1,false)",[n?id(n+10):''])
const fields={code:' dir ',name_en:' Directory bank ',name_ru:null,name_tj:'',is_active:true}
const save=async({resource='banks',record=100,bank=null,values=fields,revision=null,reason='Directory fixture change',remove=false}={})=>(await db.query('select cgf_save_bank_directory($1,$2,$3,$4,$5,$6,$7) receipt',[resource,id(record),bank===null?null:id(bank),JSON.stringify(values),revision,reason,remove])).rows[0].receipt
await actor(1)
const receipt=await save();equal(receipt.id,id(100));equal(receipt.record.code,'DIR');equal(receipt.record.name_en,'Directory bank');equal(receipt.record.name_tj,null);equal(receipt.record.administration_revision,0)
let audit=(await db.query('select changed_by,old_data,new_data,action from audit_trail')).rows[0]
equal(audit.changed_by,id(11));equal(audit.old_data,null);equal(audit.new_data.reason,'Directory fixture change');equal(audit.action,'CREATE_DIRECTORY')
await rejects(()=>save(),/changed; reload/)
await rejects(()=>save({revision:2}),/changed; reload/)
await rejects(()=>save({record:101,values:{...fields,code:'dIr'}}),/code already exists/)
await rejects(()=>save({revision:0,reason:''}),/change reason/)
for(const values of [{...fields,id:id(900)},{...fields,is_active:'true'},{...fields,name_en:''},{...fields,code:null},{...fields,name_ru:5},null,[],{...fields,code:'x'.repeat(51)}])await rejects(()=>save({revision:0,values}),/fields|object|length|required/)
equal((await save({revision:0,values:{...fields,is_active:false}})).record.administration_revision,1)
equal((await db.query('select old_data,new_data from audit_trail order by ctid desc limit 1')).rows[0].old_data.is_active,true)
await rejects(()=>save({revision:0,remove:true,values:{}}),/changed; reload/)
const branchFields={...fields,code:'B1',city:' Dushanbe ',district:' Central '}
equal((await save({resource:'bank_branches',record:200,bank:100,values:branchFields})).record.city,'Dushanbe')
await rejects(()=>save({resource:'bank_branches',record:201,bank:999,values:branchFields}),/Parent bank not found/)
await rejects(()=>save({resource:'bank_branches',record:201,bank:100,values:{...branchFields,code:'b1'}}),/code already exists/)
await rejects(()=>save({resource:'bank_branches',record:201,bank:100,values:{...branchFields,city:'x'.repeat(101)}}),/length exceeded/)
await rejects(()=>save({revision:1,remove:true,values:{}}),/Bank has branches/)
await save({record:101,values:{...fields,code:'SECOND'}})
await rejects(()=>save({resource:'bank_branches',record:200,bank:101,revision:0,values:branchFields}),/cannot be moved/)
await db.query('update profiles set branch_id=$1 where id=$2',[id(200),id(16)])
await rejects(()=>save({resource:'bank_branches',record:200,bank:100,revision:0,remove:true,values:{}}),/assigned users/)
await db.query('update profiles set branch_id=null,bank_id=$1 where id=$2',[id(100),id(16)])
for(const n of [3,4,5,6,7,8,0]){await actor(n);await rejects(()=>save({revision:1}),/administrator required/)}
await actor(1)
await db.query('update profiles set is_active=false where id=$1',[id(11)])
await rejects(()=>save({revision:1}),/administrator required/)
await db.query('update profiles set is_active=true,bank_id=$2 where id=$1',[id(11),id(100)])
await rejects(()=>save({revision:1}),/administrator required/)
await db.query('update profiles set bank_id=null where id=$1',[id(11)])
await db.query('update roles set is_active=false where id=$1',[id(1)])
await rejects(()=>save({revision:1}),/administrator required/)
await db.query('update roles set is_active=true where id=$1',[id(1)])
await actor(2);equal((await save({revision:1})).record.administration_revision,2)
await actor(1)
await db.query('insert into loan_applications values($1,$2,$3)',[id(300),id(100),id(200)])
await rejects(()=>save({resource:'bank_branches',record:200,bank:100,revision:0,remove:true,values:{}}),/foreign key/)
await db.query('delete from loan_applications where id=$1',[id(300)])
await rejects(()=>save({resource:'bank_branches',record:200,bank:100,revision:0,remove:true}),/Deletion cannot include/)
await db.exec(`create function reject_test_audit() returns trigger language plpgsql as $$begin raise exception 'Forced audit failure';end$$;create trigger reject_test_audit before insert on audit_trail for each row execute function reject_test_audit();`)
const auditCount=(await db.query('select count(*)::int n from audit_trail')).rows[0].n
await rejects(()=>save({revision:2,values:{...fields,name_en:'Should roll back'}}),/Forced audit failure/)
equal((await db.query('select name_en,administration_revision from banks where id=$1',[id(100)])).rows[0],{name_en:'Directory bank',administration_revision:2})
await rejects(()=>save({record:102,values:{...fields,code:'ROLLBACK'}}),/Forced audit failure/)
equal((await db.query('select count(*)::int n from banks where id=$1',[id(102)])).rows[0].n,0)
await rejects(()=>save({resource:'bank_branches',record:200,bank:100,revision:0,remove:true,values:{}}),/Forced audit failure/)
equal((await db.query('select count(*)::int n from bank_branches where id=$1',[id(200)])).rows[0].n,1)
equal((await db.query('select count(*)::int n from audit_trail')).rows[0].n,auditCount)
await db.exec('drop trigger reject_test_audit on audit_trail')
equal((await save({resource:'bank_branches',record:200,bank:100,revision:0,remove:true,values:{}})).deleted,true)
equal((await db.query('select action,old_data from audit_trail order by ctid desc limit 1')).rows[0].old_data.id,id(200))
await rejects(()=>save({revision:2,remove:true,values:{}}),/foreign key/)
equal((await save({record:101,revision:0,remove:true,values:{}})).deleted,true)
for(const table of ['banks','bank_branches'])for(const role of ['anon','authenticated'])for(const privilege of ['INSERT','UPDATE','DELETE','TRUNCATE'])equal((await db.query('select has_table_privilege($1,$2,$3) allowed',[role,table,privilege])).rows[0].allowed,false)
equal((await db.query("select has_function_privilege('anon','public.cgf_save_bank_directory(text,uuid,uuid,jsonb,bigint,text,boolean)','EXECUTE') allowed")).rows[0].allowed,false)
await db.close()
console.log(`Bank directory: ${assertions} assertions passed against migration SQL, including authority, revisions, validation, parent scope, referenced-delete protection, audit attribution and audit-failure rollback. Production RLS and multi-connection concurrency are separate checks.`)
