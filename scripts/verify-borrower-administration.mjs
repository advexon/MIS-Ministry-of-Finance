import { PGlite } from '@electric-sql/pglite'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const db=new PGlite();let checks=0
const readinessTimeout=setTimeout(()=>{console.error('PGlite did not initialize; borrower assertions were not executed.');process.exit(1)},30000)
await db.waitReady
clearTimeout(readinessTimeout)
const equal=(a,b)=>{assert.deepEqual(a,b);checks++}
const rejects=async(fn,pattern)=>{await assert.rejects(fn,pattern);checks++}
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
await db.exec(`create role anon;create role authenticated;create schema auth;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create table roles(id uuid primary key,code text,tier integer,is_active boolean);
create table profiles(id uuid primary key,role_id uuid references roles,bank_id uuid,is_active boolean);
create table sectors(id uuid primary key,is_active boolean,is_prohibited boolean);
create table borrowers(id uuid primary key,customer_code varchar(50) unique,legal_type varchar(50) not null,name varchar(255) not null,tin_number varchar(50),registration_number varchar(100),sector_id uuid references sectors,address_street varchar(255),address_city varchar(100),address_district varchar(100),phone varchar(50),email varchar(255),legal_rep_surname varchar(100),legal_rep_name varchar(100),legal_rep_patronymic varchar(100),legal_rep_gender varchar(10),legal_rep_birthdate date,legal_rep_country_of_birth varchar(100),legal_rep_tin varchar(50),workforce_count integer default 0,created_by uuid,created_at timestamptz default now(),updated_at timestamptz default now());
create table loan_applications(id uuid primary key,borrower_id uuid references borrowers,intake_data jsonb);
create table audit_trail(id uuid default gen_random_uuid(),table_name text,record_id uuid,action text,changed_by uuid,old_data jsonb,new_data jsonb);
alter table borrowers enable row level security;create policy fixture_select on borrowers for select to authenticated using(auth.uid() is not null);
grant all on borrowers to anon,authenticated;grant usage on schema auth to authenticated;
`)
await db.exec(readFileSync('scripts/067_cgf_borrower_administration.sql','utf8'))
for(const [n,code,tier] of [[1,'super_admin',1],[2,'prsf_admin',2],[3,'auditor',5],[4,'legal_officer',4],[5,'bank_officer',7],[6,'prsf_analyst',4],[7,'super_admin',2],[8,'prsf_admin',1]]){
 await db.query('insert into roles values($1,$2,$3,true)',[id(n),code,tier]);await db.query('insert into profiles values($1,$2,null,true)',[id(n+10),id(n)])
}
await db.query('insert into sectors values($1,true,false),($2,false,false),($3,true,true)',[id(90),id(91),id(92)])
await db.query("insert into borrowers(id,name,legal_type,tin_number,legal_rep_birthdate,created_by) values($1,'Original','llc','123456789','1980-01-01',$2),($3,'Other','llc','987654321',null,$2)",[id(100),id(11),id(101)])
const fields={customer_code:null,legal_type:'llc',name:' Original ',tin_number:'123456789',registration_number:null,sector_id:id(90),address_street:null,address_city:' Dushanbe ',address_district:null,phone:'12345',email:null,legal_rep_surname:null,legal_rep_name:null,legal_rep_patronymic:null,legal_rep_gender:null,legal_rep_birthdate:'1980-01-01',legal_rep_country_of_birth:null,legal_rep_tin:null,workforce_count:0}
const actor=n=>db.query("select set_config('request.jwt.claim.sub',$1,false)",[n?id(n+10):''])
const save=async({record=100,values=fields,revision=0,reason='Directory acceptance',remove=false}={})=>(await db.query('select cgf_save_borrower($1,$2,$3,$4,$5) receipt',[id(record),JSON.stringify(values),revision,reason,remove])).rows[0].receipt
await actor(1)
const receipt=await save();equal(receipt.id,id(100));equal(receipt.record.name,'Original');equal(receipt.record.address_city,'Dushanbe');equal(receipt.record.administration_revision,1);equal(receipt.record.created_by,id(11));equal(receipt.deleted,false)
let audit=(await db.query('select changed_by,old_data,new_data from audit_trail')).rows[0]
equal(audit.changed_by,id(11));equal(audit.new_data.reason,'Directory acceptance');equal(audit.new_data.changes.address_city,'Dushanbe');equal(audit.new_data.changes.legal_rep_birthdate,undefined);equal(audit.old_data.legal_rep_birthdate,undefined)
await rejects(()=>save(),/changed or no longer exists/);await rejects(()=>save({record:999}),/changed or no longer exists/)
for(const values of [null,[],{...fields,unexpected:1},{...fields,name:null},{...fields,name:''},{...fields,name:'x'.repeat(256)},{...fields,phone:true},{...fields,workforce_count:'1'},{...fields,workforce_count:1.2},{...fields,workforce_count:-1},{...fields,workforce_count:2147483648},{...fields,legal_type:'bad'},{...fields,tin_number:'123'},{...fields,legal_rep_tin:'bad'},{...fields,email:'bad'},{...fields,legal_rep_gender:'bad'},{...fields,legal_rep_birthdate:'2026-02-30'},{...fields,legal_rep_birthdate:'9999-01-01'},{...fields,sector_id:id(91)},{...fields,sector_id:id(92)},{...fields,sector_id:id(93)}]) await rejects(()=>save({values,revision:1}),/object|fields|required|long|Malformed|Invalid|TIN|email|gender|birth|sector|date|range/)
await rejects(()=>save({values:{...fields,tin_number:'987654321'},revision:1}),/TIN already exists/)
for(const reason of ['', 'ab','x'.repeat(2001)])await rejects(()=>save({revision:1,reason}),/reason/)
for(const n of [0,3,4,5,6,7,8]){await actor(n);await rejects(()=>save({revision:1}),/administrator required/)}
await actor(1)
for(const change of ['update profiles set is_active=false where id=$1','update profiles set bank_id=gen_random_uuid() where id=$1']){await db.query(change,[id(11)]);await rejects(()=>save({revision:1}),/administrator required/);await db.query('update profiles set is_active=true,bank_id=null where id=$1',[id(11)])}
await db.query('update roles set is_active=false where id=$1',[id(1)]);await rejects(()=>save({revision:1}),/administrator required/);await db.query('update roles set is_active=true where id=$1',[id(1)])
await actor(2);equal((await save({revision:1,values:{...fields,phone:'23456'}})).record.administration_revision,2)
await db.query('insert into loan_applications values($1,$2,$3)',[id(200),id(100),JSON.stringify({clientName:'Original',phone:'historical'})])
for(const values of [{...fields,name:'Changed'},{...fields,tin_number:'111222333'},{...fields,legal_type:'jsc'},{...fields,registration_number:'new'}])await rejects(()=>save({revision:2,values}),/Linked borrower identity/)
await rejects(()=>save({revision:2,values:{},remove:true}),/has applications/)
equal((await save({revision:2,values:{...fields,phone:'34567'}})).record.administration_revision,3)
equal((await db.query('select intake_data from loan_applications')).rows[0].intake_data,{clientName:'Original',phone:'historical'})
await rejects(()=>db.query('update borrowers set created_by=$1 where id=$2',[id(12),id(100)]),/provenance/)
await db.exec(`create function reject_borrower_audit() returns trigger language plpgsql as $$begin raise exception 'Forced borrower audit failure';end$$;create trigger reject_borrower_audit before insert on audit_trail for each row execute function reject_borrower_audit();`)
await rejects(()=>save({revision:3,values:{...fields,phone:'rollback'}}),/Forced borrower audit failure/)
equal((await db.query('select phone,administration_revision from borrowers where id=$1',[id(100)])).rows[0],{phone:'34567',administration_revision:3})
await rejects(()=>save({record:101,values:{},remove:true}),/Forced borrower audit failure/)
equal((await db.query('select count(*)::int n from borrowers where id=$1',[id(101)])).rows[0].n,1)
await db.exec('drop trigger reject_borrower_audit on audit_trail;set role authenticated')
await actor(1);equal((await save({record:101,values:{},remove:true})).deleted,true)
for(const sql of ["insert into borrowers(id,name,legal_type) values(gen_random_uuid(),'Bad','llc')","update borrowers set phone='bad'",'delete from borrowers','truncate borrowers'])await rejects(()=>db.exec(sql),/permission denied/)
await db.exec('reset role')
for(const role of ['anon','authenticated'])for(const permission of ['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'])equal((await db.query('select has_table_privilege($1,$2,$3) allowed',[role,'borrowers',permission])).rows[0].allowed,false)
equal((await db.query("select has_function_privilege('anon','cgf_save_borrower(uuid,jsonb,bigint,text,boolean)','EXECUTE') allowed")).rows[0].allowed,false)
equal((await db.query("select has_table_privilege('anon','borrowers','SELECT') allowed")).rows[0].allowed,false)
audit=(await db.query("select old_data,new_data from audit_trail where action='DELETE_BORROWER'")).rows[0];equal(audit.old_data.id,id(101));equal(audit.new_data.changes,null)
await db.close();console.log(`Borrower administration: ${checks} actual-migration PostgreSQL assertions passed. Live RLS and simultaneous concurrency remain separate.`)
