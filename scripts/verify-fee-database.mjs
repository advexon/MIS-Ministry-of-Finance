import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
const db = new PGlite()
await db.exec(`
create role anon;create role authenticated;create schema auth;create schema cgf_private;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create table public.roles(id uuid primary key,code text,tier int,is_active bool);
create table public.profiles(id uuid primary key,role_id uuid references roles,bank_id uuid,is_active bool);
create table public.loan_applications(id uuid primary key,status text,bank_id uuid,currency text);
create table public.guarantee_letters(id uuid primary key,loan_id uuid,revoked bool,issued_date timestamptz,valid_until_date timestamptz,metadata jsonb);
create table public.guarantee_reports(id uuid primary key,status text,reviewed_by uuid,review_date timestamptz,bank_id uuid,report_type text,report_month date);
create table public.guarantee_report_loans(id uuid primary key,report_id uuid,loan_application_id uuid,currency text,outstanding_principal numeric);
create table public.financial_policy_versions(id uuid primary key default gen_random_uuid(),revision bigint generated always as identity,policy jsonb,created_at timestamptz default now());
create table public.fees(id uuid primary key default gen_random_uuid(),loan_id uuid not null references loan_applications,loan_application_id uuid references loan_applications,bank_id uuid not null,fee_type text not null,amount numeric(18,2) not null,fee_amount numeric(20,2),base_amount numeric(20,2),fee_rate numeric(10,5),due_date date not null,paid_date date,period_start date,period_end date,status text default 'pending',notes text,invoice_number text,invoice_date date,payment_date date,payment_reference text,created_at timestamptz default now(),updated_at timestamptz default now());
create table public.audit_trail(id uuid default gen_random_uuid(),table_name text not null,record_id uuid,action text not null,changed_by uuid,old_data jsonb,new_data jsonb);
create function public.cgf_is_super_admin() returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.profiles p join public.roles r on r.id=p.role_id where p.id=auth.uid() and p.is_active and r.is_active and p.bank_id is null and r.code='super_admin' and r.tier=1) $$;
create function cgf_private.require_admin_reason(p_reason text default null) returns void language plpgsql set search_path='' as $$ begin if public.cgf_is_super_admin() and length(btrim(coalesce(p_reason,''))) not between 3 and 2000 then raise exception 'Reason required' using errcode='23514';end if;end $$;
`)
await db.exec(readFileSync('scripts/056_cgf_fee_execution.sql', 'utf8'))
await db.exec(readFileSync('scripts/057_cgf_fee_status_guard.sql', 'utf8'))
const arithmeticSuite = readFileSync('scripts/verify-fee-execution.sql', 'utf8')
await db.exec(
  arithmeticSuite.slice(
    arithmeticSuite.indexOf('do $$'),
    arithmeticSuite.indexOf('  if has_table_privilege'),
  ) + 'end $$;',
)
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const actor = id(1),
  bank = id(2),
  role = id(3),
  loan = id(4),
  guarantee = id(5),
  fee = id(6)
await db.query('insert into roles values($1,$2,1,true)', [role, 'super_admin'])
await db.query('insert into profiles values($1,$2,null,true)', [actor, role])
await db.query("select set_config('request.jwt.claim.sub',$1,false)", [actor])
await db.query("insert into loan_applications values($1,'active',$2,'TJS')", [
  loan,
  bank,
])
await db.query(
  "insert into guarantee_letters values($1,$2,false,'2024-01-01','2028-12-31',$3)",
  [
    guarantee,
    loan,
    JSON.stringify({
      terms: {
        loan_id: loan,
        bank_id: bank,
        currency: 'TJS',
        approved_amount: 100000,
        guarantee_amount: 50000,
      },
    }),
  ],
)
const policy = {
  currencies: ['TJS'],
  settlement_currency: 'loan_currency',
  fees: {
    base: 'guarantee_amount',
    upfront_rate_percent: 0.5,
    recurring_rate_percent: 2,
    recurring_rate_basis: 'annual',
    proration: 'actual_actual',
    rounding: 'half_up',
    decimal_places: 4,
    due_days: 30,
  },
}
await db.query('insert into financial_policy_versions(policy) values($1)', [
  JSON.stringify(policy),
])
async function create({
  key = fee,
  type = 'upfront',
  start = null,
  end = null,
  balance = null,
  revision = 1,
  notes = 'Fixture authority evidence',
} = {}) {
  const result = await db.query(
    'select public.cgf_create_fee($1,$2,$3,$4,$5,$6,$7,$8,$9) receipt',
    [key, loan, type, '2026-10-25', start, end, balance, notes, revision],
  )
  return result.rows[0].receipt
}
async function action(
  type,
  reference = null,
  reason = 'Fixture lifecycle evidence',
) {
  return (
    await db.query('select public.cgf_fee_action($1,$2,$3,$4,$5) receipt', [
      fee,
      type,
      '2026-10-25',
      reference,
      reason,
    ])
  ).rows[0].receipt
}
let result = await create()
assert.equal(Number(result.fee_amount), 250)
assert.equal(result.currency, 'TJS')
assert.equal(result.policy_revision, 1)
assert.equal((await create()).id, result.id)
await assert.rejects(
  create({ notes: 'Different request' }),
  /different request/,
)
await assert.rejects(create({ key: id(7) }), /upfront fee already exists/)
await assert.rejects(create({ key: id(7), revision: 2 }), /policy changed/)
await assert.rejects(action('pay', 'EARLY'), /Invoice the fee before/)
policy.fees.due_days = 60
await db.query('insert into financial_policy_versions(policy) values($1)', [
  JSON.stringify(policy),
])
result = await action('invoice')
assert.equal(result.due_date, '2026-11-24')
assert.equal(result.policy_revision, 1)
assert.equal((await action('invoice')).id, fee)
result = await action('pay', 'RECEIPT-1')
assert.equal(result.status, 'paid')
assert.equal(result.paid_date, result.payment_date)
await action('pay', 'RECEIPT-1')
await assert.rejects(action('pay', 'OTHER'), /Invoice the fee before/)
await assert.rejects(
  db.query('update fees set amount=1 where id=$1', [fee]),
  /immutable/,
)
await assert.rejects(
  db.query('delete from fees where id=$1', [fee]),
  /cannot be deleted/,
)
assert.equal(
  (
    await db.query(
      'select count(*)::int n from audit_trail where record_id=$1',
      [fee],
    )
  ).rows[0].n,
  3,
)
result = await create({
  key: id(8),
  type: 'quarterly',
  start: '2026-07-01',
  end: '2026-10-01',
  revision: 2,
})
assert.equal(Number(result.fee_amount), 252.0548)
await assert.rejects(
  create({
    key: id(9),
    type: 'quarterly',
    start: '2026-09-01',
    end: '2026-10-01',
    revision: 2,
  }),
  /overlapping/,
)
await db.query('update loan_applications set status=null where id=$1', [loan])
await assert.rejects(
  create({
    key: id(10),
    type: 'quarterly',
    start: '2026-04-01',
    end: '2026-07-01',
    revision: 2,
  }),
  /eligible parent/,
)
await db.query("update loan_applications set status='active' where id=$1", [
  loan,
])
policy.fees.base = 'outstanding_guaranteed_principal'
await db.query('insert into financial_policy_versions(policy) values($1)', [
  JSON.stringify(policy),
])
await db.query(
  "insert into guarantee_reports values($1,'approved',$2,'2026-10-02',$3,'monthly','2026-06-01')",
  [id(11), actor, bank],
)
await db.query(
  "insert into guarantee_report_loans values($1,$2,$3,'TJS',60000)",
  [id(12), id(11), loan],
)
await assert.rejects(
  create({
    key: id(13),
    type: 'quarterly',
    start: '2026-04-01',
    end: '2026-07-01',
    revision: 3,
  }),
  /approved report row/,
)
result = await create({
  key: id(13),
  type: 'quarterly',
  start: '2026-04-01',
  end: '2026-07-01',
  revision: 3,
  balance: id(12),
})
assert.equal(Number(result.base_amount), 30000)
assert.equal(Number(result.fee_amount), 149.589)
assert.equal(result.calculation_inputs.balance_evidence.row_id, id(12))
await db.query('update profiles set is_active=false where id=$1', [actor])
await assert.rejects(create({ key: id(14), revision: 3 }), /fee authority/)
await db.query('update profiles set is_active=true where id=$1', [actor])
await db.query("update roles set code='auditor' where id=$1", [role])
await assert.rejects(create({ key: id(14), revision: 3 }), /fee authority/)
await db.query("update roles set code='super_admin' where id=$1", [role])
policy.fees.base = 'approved_loan_amount'
await db.query('insert into financial_policy_versions(policy) values($1)', [
  JSON.stringify(policy),
])
await db.exec(
  `create function public.fail_test_audit() returns trigger language plpgsql as $$ begin raise exception 'Audit unavailable';end $$;create trigger fail_test_audit before insert on audit_trail for each row execute function public.fail_test_audit();`,
)
await assert.rejects(
  create({
    key: id(15),
    type: 'quarterly',
    start: '2026-01-01',
    end: '2026-04-01',
    revision: 4,
  }),
  /Audit unavailable/,
)
assert.equal(
  (await db.query('select count(*)::int n from fees where id=$1', [id(15)]))
    .rows[0].n,
  0,
)
await db.exec('drop trigger fail_test_audit on audit_trail')
result = await create({
  key: id(15),
  type: 'quarterly',
  start: '2026-01-01',
  end: '2026-04-01',
  revision: 4,
})
assert.equal(Number(result.base_amount), 100000)
assert.equal(
  (
    await db.query(
      "select has_table_privilege('authenticated','public.fees','INSERT') b",
    )
  ).rows[0].b,
  false,
)
assert.equal(
  (
    await db.query(
      "select has_function_privilege('anon','public.cgf_create_fee(uuid,uuid,text,date,date,date,uuid,text,bigint)','EXECUTE') b",
    )
  ).rows[0].b,
  false,
)
console.log(
  'Isolated PostgreSQL transaction checks passed: canonical assessment, three bases, signed evidence, revisions, frozen invoice due-date, invoice/payment, exact replay, duplicate/overlap and disabled/auditor denials, immutable history, atomic audit-failure rollback and grants. Live concurrency/RLS acceptance is separate.',
)
await db.close()
