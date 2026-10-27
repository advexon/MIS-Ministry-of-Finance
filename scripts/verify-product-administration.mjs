import { PGlite } from '@electric-sql/pglite'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const db = new PGlite()
let assertions = 0
const equal = (actual, expected) => { assert.deepEqual(actual, expected); assertions++ }
const rejects = async (fn, pattern) => { await assert.rejects(fn, pattern); assertions++ }
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
await db.exec(`
create role anon; create role authenticated; create schema auth;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create table roles(id uuid primary key,code text,tier integer,is_active boolean);
create table profiles(id uuid primary key,role_id uuid references roles,bank_id uuid,is_active boolean);
create table loan_products(id uuid primary key,code varchar(50) not null unique,name_en varchar(255) not null,name_ru varchar(255),name_tj varchar(255),guarantee_coverage numeric(5,2) default 50,upfront_fee_rate numeric(5,4) default 0.01,quarterly_fee_rate numeric(5,4) default 0.0025,is_active boolean default true,created_at timestamptz default now(),updated_at timestamptz default now());
create table loan_applications(id uuid primary key,product_id uuid references loan_products);
create table audit_trail(id uuid default gen_random_uuid(),table_name text,record_id uuid,action text,changed_by uuid,old_data jsonb,new_data jsonb);
alter table loan_products enable row level security;
grant all on loan_products to anon,authenticated;
grant usage on schema auth to authenticated;
grant select on profiles,roles to authenticated;
`)
await db.exec(readFileSync('scripts/066_cgf_product_administration.sql', 'utf8'))
for (const [n,code,tier] of [[1,'super_admin',1],[2,'prsf_admin',2],[3,'auditor',5],[4,'legal_officer',4],[5,'prsf_analyst',4],[6,'bank_officer',7],[7,'super_admin',2],[8,'prsf_admin',1]]) {
  await db.query('insert into roles values($1,$2,$3,true)',[id(n),code,tier])
  await db.query('insert into profiles values($1,$2,null,true)',[id(n+10),id(n)])
}
const actor = n => db.query("select set_config('request.jwt.claim.sub',$1,false)",[n ? id(n+10) : ''])
const values = {code:' test ',name_en:' Test product ',name_ru:null,name_tj:'',guarantee_coverage:65.25,is_active:true}
const save = async ({record=100,fields=values,revision=null,reason='Product acceptance change',remove=false}={}) =>
  (await db.query('select cgf_save_product($1,$2,$3,$4,$5) receipt',[id(record),JSON.stringify(fields),revision,reason,remove])).rows[0].receipt
await actor(1)
const created = await save()
equal(created.id,id(100)); equal(created.record.code,'TEST'); equal(created.record.name_en,'Test product'); equal(created.record.guarantee_coverage,65.25)
equal(created.record.name_tj,null); equal(created.record.administration_revision,0); equal(created.record.upfront_fee_rate,null); equal(created.record.quarterly_fee_rate,null)
let audit = (await db.query('select changed_by,action,old_data,new_data from audit_trail')).rows[0]
equal(audit.changed_by,id(11)); equal(audit.action,'CREATE_PRODUCT'); equal(audit.old_data,null); equal(audit.new_data.reason,'Product acceptance change')
await rejects(()=>save(),/changed; reload/)
await rejects(()=>save({revision:8}),/changed; reload/)
await rejects(()=>save({record:101,fields:{...values,code:'tEsT'}}),/code already exists/)
for (const reason of ['', 'ab', 'x'.repeat(2001)]) await rejects(()=>save({revision:0,reason}),/reason/)
for (const fields of [null,[],{...values,id:id(999)},{...values,is_active:'true'},{...values,name_ru:7},{...values,code:null},{...values,name_en:''},{...values,code:'x'.repeat(51)},{...values,name_tj:'x'.repeat(256)},{...values,guarantee_coverage:null},{...values,guarantee_coverage:'50'},{...values,guarantee_coverage:0},{...values,guarantee_coverage:100.01},{...values,guarantee_coverage:50.001},{...values,upfront_fee_rate:0.99}]) await rejects(()=>save({revision:0,fields}),/object|fields|coverage/)
await db.query('update loan_products set upfront_fee_rate=0.021,quarterly_fee_rate=0.003 where id=$1',[id(100)])
await actor(2)
equal((await save({revision:0,fields:{...values,is_active:false,guarantee_coverage:100}})).record.administration_revision,1)
equal((await db.query('select upfront_fee_rate::text n from loan_products where id=$1',[id(100)])).rows[0].n,'0.0210')
await actor(1)
for (const n of [3,4,5,6,7,8,0]) { await actor(n); await rejects(()=>save({revision:1}),/administrator required/) }
await actor(1)
for (const change of ['update profiles set is_active=false where id=$1','update profiles set bank_id=gen_random_uuid() where id=$1']) {
  await db.query(change,[id(11)]); await rejects(()=>save({revision:1}),/administrator required/)
  await db.query('update profiles set is_active=true,bank_id=null where id=$1',[id(11)])
}
await db.query('update roles set is_active=false where id=$1',[id(1)]); await rejects(()=>save({revision:1}),/administrator required/)
await db.query('update roles set is_active=true where id=$1',[id(1)])
await db.query('insert into loan_applications values($1,$2)',[id(200),id(100)])
await rejects(()=>save({revision:1,remove:true,fields:{}}),/has applications/)
await rejects(()=>save({revision:1,remove:true}),/Deletion cannot include/)
await db.exec(`create function reject_product_audit() returns trigger language plpgsql as $$begin raise exception 'Forced product audit failure';end$$; create trigger reject_product_audit before insert on audit_trail for each row execute function reject_product_audit();`)
const auditCount = (await db.query('select count(*)::int n from audit_trail')).rows[0].n
await rejects(()=>save({record:101,fields:{...values,code:'ROLLBACK'}}),/Forced product audit failure/)
equal((await db.query('select count(*)::int n from loan_products where id=$1',[id(101)])).rows[0].n,0)
await rejects(()=>save({revision:1,fields:{...values,name_en:'Should roll back'}}),/Forced product audit failure/)
equal((await db.query('select name_en,administration_revision from loan_products where id=$1',[id(100)])).rows[0],{name_en:'Test product',administration_revision:1})
await db.query('delete from loan_applications where id=$1',[id(200)])
await rejects(()=>save({revision:1,remove:true,fields:{}}),/Forced product audit failure/)
equal((await db.query('select count(*)::int n from loan_products where id=$1',[id(100)])).rows[0].n,1)
equal((await db.query('select count(*)::int n from audit_trail')).rows[0].n,auditCount)
await db.exec('drop trigger reject_product_audit on audit_trail')
await db.exec('set role authenticated')
equal((await db.query('select count(*)::int n from loan_products')).rows[0].n,1)
await actor(3); equal((await db.query('select count(*)::int n from loan_products')).rows[0].n,1)
await actor(0); equal((await db.query('select count(*)::int n from loan_products')).rows[0].n,0)
await actor(1)
for (const statement of ["insert into loan_products(id,code,name_en) values(gen_random_uuid(),'BAD','Bad')","update loan_products set name_en='Bad'",'delete from loan_products','truncate loan_products']) await rejects(()=>db.exec(statement),/permission denied/)
equal((await save({revision:1,remove:true,fields:{}})).deleted,true)
await db.exec('reset role')
audit = (await db.query("select old_data,new_data from audit_trail where action='DELETE_PRODUCT'")).rows[0]
equal(audit.old_data.id,id(100)); equal(audit.new_data.record,null)
for (const role of ['anon','authenticated']) for (const privilege of ['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) equal((await db.query('select has_table_privilege($1,$2,$3) allowed',[role,'loan_products',privilege])).rows[0].allowed,false)
equal((await db.query("select has_function_privilege('anon','public.cgf_save_product(uuid,jsonb,bigint,text,boolean)','EXECUTE') allowed")).rows[0].allowed,false)
equal((await db.query("select has_table_privilege('anon','loan_products','SELECT') allowed")).rows[0].allowed,false)
await db.close()
console.log(`Products: ${assertions} actual-migration PostgreSQL checks passed: roles, validation, revisions, audit rollback, lifecycle, RLS and grants. Live production/concurrent acceptance is separate.`)
