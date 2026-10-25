import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { ROLE_PERMISSION_RESOURCES, ROLE_PERMISSION_ACTIONS, isEditableRoleGrant } from '../lib/admin/role-permissions.ts'

for (const { key } of ROLE_PERMISSION_RESOURCES) {
  for (const action of ROLE_PERMISSION_ACTIONS) {
    assert.equal(isEditableRoleGrant('super_admin',key,action),false)
    assert.equal(isEditableRoleGrant('auditor',key,action),action==='view')
    assert.equal(isEditableRoleGrant('legal_officer',key,action),action==='view' && ['loans','claims'].includes(key))
    assert.equal(isEditableRoleGrant('prsf_admin',key,action),!['loans','claims'].includes(key) || ['view','update'].includes(action))
  }
}
const editor = readFileSync('app/dashboard/roles/page.tsx','utf8')
assert.match(editor,/rpc\('cgf_save_role_permissions'/)
assert.doesNotMatch(editor,/\.upsert\(|\.from\('audit_trail'\)/)
assert.match(editor,/saveInFlight\.current = true/)
assert.match(editor,/error\.code === '40001'/)
assert.match(editor,/p_expected_revision: selectedRole\.permission_revision/)

const db = new PGlite()
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
await db.exec(`
create role anon;create role authenticated;create schema auth;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create table roles(id uuid primary key,code text,tier integer,is_active boolean);
create table profiles(id uuid primary key,role_id uuid references roles,bank_id uuid,is_active boolean);
create table role_permissions(id uuid primary key default gen_random_uuid(),role_id uuid references roles,resource text,can_view boolean not null default false,can_create boolean not null default false,can_update boolean not null default false,can_delete boolean not null default false,can_approve boolean not null default false,created_at timestamptz default now(),updated_at timestamptz default now(),unique(role_id,resource));
create table audit_trail(id uuid default gen_random_uuid(),table_name text,record_id uuid,action text,changed_by uuid,old_data jsonb,new_data jsonb);
grant all on roles,role_permissions to anon,authenticated;
`)
await db.exec(readFileSync('scripts/058_cgf_role_permission_administration.sql','utf8'))
for (const [n, code, tier] of [[1,'super_admin',1],[2,'prsf_admin',2],[3,'auditor',5],[4,'legal_officer',4],[5,'prsf_analyst',4],[6,'bank_officer',7]]) {
  await db.query('insert into roles(id,code,tier,is_active) values($1,$2,$3,true)',[id(n),code,tier])
  await db.query('insert into profiles values($1,$2,$3,true)',[id(n+10),id(n),n===6?id(90):null])
}
const resources = ['users','roles','loans','claims','fees','banks','reports','audit_logs','access_logs']
assert.deepEqual(ROLE_PERMISSION_RESOURCES.map(({key})=>key),resources)
const blank = resources.map(resource=>({resource,can_view:false,can_create:false,can_update:false,can_delete:false,can_approve:false}))
const actor = async (n) => db.query("select set_config('request.jwt.claim.sub',$1,false)",[n?id(n+10):''])
const save = async (role=5, permissions=blank, revision=0, reason='Fixture permission administration') => (await db.query('select cgf_save_role_permissions($1,$2,$3,$4) receipt',[id(role),JSON.stringify(permissions),revision,reason])).rows[0].receipt
await actor(1)
const permissions=structuredClone(blank);permissions[0].can_view=true
assert.deepEqual(await save(5,permissions),{role_id:id(5),revision:1})
const audit=(await db.query('select changed_by,old_data,new_data from audit_trail')).rows[0]
assert.equal(audit.changed_by,id(11));assert.equal(audit.old_data.revision,0);assert.equal(audit.new_data.revision,1)
assert.equal(audit.new_data.permissions.length,9);assert.equal(audit.new_data.reason,'Fixture permission administration')
await assert.rejects(save(),/reload the role/)
await assert.rejects(save(5,blank,1,''),/change reason/)
await assert.rejects(save(1),/cannot be edited/)
await assert.rejects(save(5,blank.slice(1),1),/Complete registered/)
await assert.rejects(save(5,[blank[0],...blank.slice(0,8)],1),/Duplicate/)
await assert.rejects(save(5,[{...blank[0],can_view:'true'},...blank.slice(1)],1),/invalid permission flags/)
await assert.rejects(save(5,[{...blank[0],resource:'unregistered'},...blank.slice(1)],1),/Unknown resource/)
await assert.rejects(save(3,[{...blank[0],can_update:true},...blank.slice(1)]),/business restrictions/)
await assert.rejects(save(4,permissions),/business restrictions/)
const prsf=structuredClone(blank);prsf[2].can_approve=true
await assert.rejects(save(2,prsf),/business restrictions/)
await actor(2);assert.equal((await save(5,blank,1)).revision,2)
await assert.rejects(save(1),/cannot be edited/)
for (const n of [3,4,5,6,0]) {await actor(n);await assert.rejects(save(5,blank,2),/administrator required/)}
await actor(1)
await db.query('update profiles set is_active=false where id=$1',[id(11)])
await assert.rejects(save(5,blank,2),/administrator required/)
await db.query('update profiles set is_active=true,bank_id=$2 where id=$1',[id(11),id(90)])
await assert.rejects(save(5,blank,2),/administrator required/)
await db.query('update profiles set bank_id=null where id=$1',[id(11)])
await db.exec(`create function reject_test_audit() returns trigger language plpgsql as $$begin raise exception 'Forced audit failure';end$$;
create trigger reject_test_audit before insert on audit_trail for each row execute function reject_test_audit();`)
await assert.rejects(save(5,permissions,2),/Forced audit failure/)
assert.equal((await db.query('select permission_revision from roles where id=$1',[id(5)])).rows[0].permission_revision,2)
assert.equal((await db.query('select can_view from role_permissions where role_id=$1 and resource=$2',[id(5),'users'])).rows[0].can_view,false)
assert.equal((await db.query('select count(*)::int n from audit_trail')).rows[0].n,2)
for (const table of ['roles','role_permissions']) {
  for (const privilege of ['INSERT','UPDATE','DELETE','TRUNCATE']) {
    assert.equal((await db.query('select has_table_privilege($1,$2,$3) allowed',['authenticated',table,privilege])).rows[0].allowed,false)
  }
}
assert.equal((await db.query("select has_function_privilege('anon','public.cgf_save_role_permissions(uuid,jsonb,bigint,text)','EXECUTE') allowed")).rows[0].allowed,false)
await db.close()
console.log('Role permission administration passed: atomic full-set save/audit, reason, revision conflicts, validation, inherent authority, restricted grants, administrator/disabled/bank/anonymous boundaries and forced-audit rollback. Simultaneous concurrency and production RLS are separate checks.')
