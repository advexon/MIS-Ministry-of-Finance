import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'

const db = new PGlite()
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
let assertions = 0
function equal(actual, expected) { assert.deepEqual(actual, expected); assertions++ }
async function rejected(operation, code) {
  await assert.rejects(operation, (error) => error.code === code)
  assertions++
}
try {
  await db.exec(`
    create role anon; create role authenticated; create schema auth; create schema cgf_private;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create table roles(id uuid primary key,code text,tier integer,is_active boolean);
    create table banks(id uuid primary key);
    create table profiles(id uuid primary key,role_id uuid references roles,bank_id uuid references banks,is_active boolean);
    create table loan_applications(id uuid primary key,status text,bank_id uuid references banks,currency text);
    create table claims(id uuid primary key,loan_id uuid references loan_applications,loan_application_id uuid references loan_applications,bank_id uuid references banks,status text,claim_amount numeric,approved_amount numeric,claim_date date,approved_date date,submitted_by uuid,reviewed_by uuid,paid_amount numeric,paid_date date,payment_date date,payment_reference text);
    create table financial_policy_versions(id uuid primary key default gen_random_uuid(),revision bigint generated always as identity,policy jsonb);
    create table claim_committee_sittings(id uuid primary key,claim_id uuid references claims,status text,outcome text,protocol_snapshot jsonb,closed_at timestamptz,protocol_no text,claim_terms jsonb,original_terms jsonb,recommended_amount numeric,original_amount_tjs numeric,director_threshold_tjs numeric,created_at timestamptz default now());
    create table claim_committee_members(sitting_id uuid references claim_committee_sittings,member_id uuid references profiles,attended boolean,signed_at timestamptz,primary key(sitting_id,member_id));
    create table claim_committee_votes(sitting_id uuid references claim_committee_sittings,member_id uuid references profiles,vote text,primary key(sitting_id,member_id));
    create table guarantee_letters(id uuid primary key,loan_id uuid references loan_applications,revoked boolean,metadata jsonb,issued_date timestamptz default now());
    create table loan_application_history(loan_id uuid,action text,old_status text,new_status text,performed_by uuid,notes text);
    create table audit_trail(table_name text,record_id uuid,action text,changed_by uuid,old_data jsonb,new_data jsonb);
    create table sectors(id uuid primary key,is_prohibited boolean);
    create table notifications(user_id uuid,title text,message text,type text,link text);
    create function public.cgf_is_super_admin() returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.profiles p join public.roles r on r.id=p.role_id where p.id=auth.uid() and p.is_active and r.is_active and r.code='super_admin' and r.tier=1 and p.bank_id is null)$$;
    create function public.current_user_role_code() returns text language sql stable security definer set search_path='' as $$select r.code from public.profiles p join public.roles r on r.id=p.role_id where p.id=auth.uid() and p.is_active and r.is_active$$;
    create function cgf_private.require_admin_reason(reason text) returns void language plpgsql as $$begin if public.cgf_is_super_admin() and length(btrim(coalesce(reason,''))) not between 3 and 2000 then raise exception 'Reason required' using errcode='23514'; end if; end$$;
    create function cgf_private.claim_terms(claim uuid) returns jsonb language sql stable set search_path='' as $$select jsonb_build_object('id',c.id,'claim_amount',c.claim_amount,'loan_id',c.loan_id) from public.claims c where c.id=claim$$;
    grant usage on schema auth to authenticated;
    grant select on roles,profiles to authenticated;
  `)
  await db.exec(readFileSync('scripts/048_cgf_claim_payments.sql', 'utf8'))
  await db.exec(readFileSync('scripts/051_cgf_admin_financial_authority.sql', 'utf8'))
  await db.query('insert into banks values($1),($2)', [id(90), id(91)])
  const roles = ['super_admin', 'prsf_admin', 'accountant', 'deputy_director', 'fkg_management', 'auditor', 'legal_officer', 'bank_officer', 'prsf_analyst', 'credit_risk_officer', 'compliance_officer']
  for (const [index, code] of roles.entries()) {
    await db.query('insert into roles values($1,$2,$3,true)', [id(index + 1), code, index + 1])
    await db.query('insert into profiles values($1,$2,$3,true)', [id(index + 21), id(index + 1), code === 'bank_officer' ? id(90) : null])
  }
  const actor = async (n = 21) => db.query("select set_config('request.jwt.claim.sub',$1,false)", [n ? id(n) : ''])
  const policy = { currencies: ['TJS'], settlement_currency: 'loan_currency', claims: { allow_partial_payments: true, separate_payment_actor: true, authorities: ['accountant', 'deputy_director', 'fkg_management'].map(role_code => ({ role_code, currency: 'TJS', per_payment_limit: 300, per_claim_limit: 500 })) } }
  const terms = { loan_id: id(100), bank_id: id(90), currency: 'TJS', approved_amount: 1000, guarantee_amount: 500 }
  await db.query("insert into loan_applications values($1,'claim_pending',$2,'TJS')", [id(100), id(90)])
  await db.query("insert into claims(id,loan_id,loan_application_id,bank_id,status,claim_amount,approved_amount,claim_date,approved_date,submitted_by,reviewed_by) values($1,$2,$2,$3,'approved',700,500,current_date,current_date,$4,$4)", [id(101), id(100), id(90), id(21)])
  const claimTerms = (await db.query('select cgf_private.claim_terms($1) terms', [id(101)])).rows[0].terms
  const protocol = { outcome: 'approved', claim_terms: claimTerms, original_terms: terms, recommended_amount: 500 }
  await db.query("insert into claim_committee_sittings(id,claim_id,status,outcome,protocol_snapshot,closed_at,protocol_no,claim_terms,original_terms,recommended_amount,original_amount_tjs,director_threshold_tjs) values($1,$2,'closed','approved',$3,now(),'ISOLATED-APPROVAL',$4,$5,500,1000,1000000)", [id(102), id(101), JSON.stringify(protocol), JSON.stringify(claimTerms), JSON.stringify(terms)])
  for (const n of [21, 29, 30]) {
    await db.query('insert into claim_committee_members values($1,$2,true,now())', [id(102), id(n)])
    await db.query("insert into claim_committee_votes values($1,$2,'for')", [id(102), id(n)])
  }
  await db.query("insert into guarantee_letters(id,loan_id,revoked,metadata) values($1,$2,false,$3)", [id(103), id(100), JSON.stringify({ terms })])
  let revision = 0
  async function savePolicy() {
    revision = Number((await db.query('insert into financial_policy_versions(policy) values($1) returning revision', [JSON.stringify(policy)])).rows[0].revision)
  }
  async function pay({ key = 110, amount = 200, currency = 'TJS', reference = 'ISOLATED-1', reason = 'Audited exception evidence', expected = revision, date = null } = {}) {
    return (await db.query('select cgf_record_claim_payment($1,$2,$3,$4,coalesce($5::date,current_date),$6,$7,$8) receipt', [id(key), id(101), amount, currency, date, reference, reason, expected])).rows[0].receipt
  }
  await actor()
  await rejected(pay({ expected: 1 }), '23514')
  await savePolicy()
  for (const n of [22, 26, 27, 28, 29, 30, 31, 0]) { await actor(n); await rejected(pay(), '42501') }
  for (const n of [23, 24, 25]) {
    await actor(n)
    await db.exec('begin; set local role authenticated')
    const authorized = await pay()
    equal(authorized.recorded_by, id(n))
    equal(authorized.recorded_role, roles[n - 21])
    await db.exec('rollback')
  }
  await actor()
  for (const amount of [0, -1, 0.001, 1000000000001, 'NaN', 'Infinity', '-Infinity']) await rejected(pay({ amount }), '23514')
  await rejected(pay({ reason: '' }), '23514')
  await rejected(pay({ currency: 'USD' }), '42501')
  await rejected(pay({ expected: 99 }), '40001')
  await rejected(pay({ amount: 501 }), '23514')
  for (const column of ['is_active', 'bank_id']) {
    await db.query(`update profiles set ${column}=$1 where id=$2`, [column === 'is_active' ? false : id(90), id(21)])
    await rejected(pay(), '42501')
    await db.query(`update profiles set ${column}=$1 where id=$2`, [column === 'is_active' ? true : null, id(21)])
  }
  await db.query('update roles set is_active=false where id=$1', [id(1)])
  await rejected(pay(), '42501')
  await db.query('update roles set is_active=true,tier=2 where id=$1', [id(1)])
  await rejected(pay(), '42501')
  await db.query('update roles set tier=1 where id=$1', [id(1)])
  await db.query('update claim_committee_members set signed_at=null where member_id=$1', [id(29)])
  await rejected(pay(), '23514')
  await db.query('update claim_committee_members set signed_at=now() where member_id=$1', [id(29)])
  await db.query('update guarantee_letters set revoked=true')
  await rejected(pay(), '23514')
  await db.query('update guarantee_letters set revoked=false')
  await db.query('update claims set paid_amount=1')
  await rejected(pay(), '23514')
  await db.query('update claims set paid_amount=null')
  await db.exec(`create function reject_payment_audit() returns trigger language plpgsql as $$begin raise exception 'Forced payment audit failure' using errcode='23514';end$$; create trigger reject_payment_audit before insert on audit_trail for each row execute function reject_payment_audit();`)
  await rejected(pay(), '23514')
  equal((await db.query('select count(*)::int n from claim_payments')).rows[0].n, 0)
  equal((await db.query('select paid_amount,status from claims')).rows[0], { paid_amount: null, status: 'approved' })
  equal((await db.query('select count(*)::int n from loan_application_history')).rows[0].n, 0)
  await db.exec('drop trigger reject_payment_audit on audit_trail')
  await db.exec('set role authenticated')
  const receipt = await pay()
  equal(receipt.recorded_by, id(21))
  equal(receipt.recorded_role, 'super_admin')
  equal(Number(receipt.cumulative_paid), 200)
  equal(receipt.policy_snapshot, policy)
  equal(receipt.evidence.protocol, protocol)
  equal(receipt.evidence.signatures.length, 3)
  equal(await pay(), receipt)
  await rejected(pay({ amount: 199 }), '23505')
  await rejected(pay({ key: 111, reference: ' isolated-1 ' }), '23505')
  await rejected(db.query('update claim_payments set amount=1'), '42501')
  await rejected(db.query('delete from claim_payments'), '42501')
  await db.exec('reset role')
  equal((await db.query('select changed_by,new_data from audit_trail')).rows[0], { changed_by: id(21), new_data: receipt })
  for (const n of [23, 24, 25]) {
    await actor(n)
    await rejected(pay({ key: 111, amount: 301, reference: 'LIMIT' }), '23514')
  }
  await db.query('update claims set reviewed_by=$1 where id=$2', [id(23), id(101)])
  await actor(23)
  await rejected(pay({ key: 111, amount: 100, reference: 'SEPARATION' }), '42501')
  await db.query('update claims set reviewed_by=$1 where id=$2', [id(21), id(101)])
  policy.claims.allow_partial_payments = false
  await savePolicy()
  await actor()
  equal(await pay({ expected: 1 }), receipt)
  await rejected(pay({ key: 111, amount: 299, reference: 'FINAL' }), '23514')
  await db.exec('set role authenticated')
  const final = await pay({ key: 111, amount: 300, reference: 'FINAL' })
  equal(final.claim_status, 'paid')
  equal(Number(final.cumulative_paid), 500)
  equal(await pay({ key: 111, amount: 300, reference: 'FINAL' }), final)
  await rejected(pay({ key: 112, amount: 1, reference: 'EXCESS' }), '23514')
  await db.exec('reset role')
  equal((await db.query('select status from loan_applications')).rows[0].status, 'claim_paid')
  equal((await db.query('select count(*)::int n,sum(amount)::numeric total from claim_payments')).rows[0], { n: 2, total: '500.00' })
  equal((await db.query("select count(*)::int n from loan_application_history where new_status='claim_paid'")).rows[0].n, 1)
  for (const [n, count] of [[21, 2], [22, 2], [26, 2], [27, 0], [28, 2], [0, 0]]) {
    await actor(n)
    await db.exec('set role authenticated')
    equal((await db.query('select count(*)::int n from claim_payments')).rows[0].n, count)
    await db.exec('reset role')
  }
  await db.query('update profiles set bank_id=$1 where id=$2', [id(91), id(28)])
  await actor(28)
  await db.exec('set role authenticated')
  equal((await db.query('select count(*)::int n from claim_payments')).rows[0].n, 0)
  await db.exec('reset role')
  await actor(22)
  await rejected(pay({ expected: 1 }), '42501')
  await db.exec('set role anon')
  await rejected(pay(), '42501')
  await rejected(db.query('select id from claim_payments'), '42501')
  await db.exec('reset role')
  for (const privilege of ['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) equal((await db.query("select has_table_privilege('authenticated','claim_payments',$1) allowed", [privilege])).rows[0].allowed, false)
  console.log(`Claim payment isolated PostgreSQL regression passed (${assertions} assertions); no production connections, triggers or records used. Concurrent multi-connection behavior and live RLS remain unverified.`)
} finally {
  await db.close()
}
