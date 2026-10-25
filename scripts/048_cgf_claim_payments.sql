begin;

create table public.claim_payments (
  id uuid primary key,
  claim_id uuid not null references public.claims(id),
  loan_id uuid not null references public.loan_applications(id),
  bank_id uuid not null references public.banks(id),
  amount numeric(18,2) not null check (amount > 0 and amount <= 1000000000000),
  currency text not null check (currency in ('TJS','USD','EUR','RUB')),
  payment_date date not null,
  payment_reference text not null check (length(btrim(payment_reference)) between 1 and 200),
  notes text not null check (length(btrim(notes)) between 3 and 2000),
  recorded_by uuid not null references public.profiles(id),
  recorded_role text not null check (recorded_role in ('accountant','deputy_director','fkg_management')),
  policy_id uuid not null references public.financial_policy_versions(id),
  policy_revision bigint not null,
  policy_snapshot jsonb not null,
  sitting_id uuid not null references public.claim_committee_sittings(id),
  evidence jsonb not null,
  cumulative_paid numeric(18,2) not null,
  claim_status text not null check (claim_status in ('approved','paid')),
  created_at timestamptz not null default now()
);
create index claim_payments_claim on public.claim_payments(claim_id);
create unique index claim_payments_reference on public.claim_payments(bank_id,currency,upper(btrim(payment_reference)));
alter table public.claim_payments enable row level security;
revoke all on public.claim_payments from public,anon,authenticated;
grant select on public.claim_payments to authenticated;
create policy claim_payments_scoped_read on public.claim_payments for select to authenticated using (
  exists(select 1 from public.profiles p join public.roles r on r.id=p.role_id
    where p.id=auth.uid() and p.is_active and r.is_active and (
      (p.bank_id is null and r.code in ('super_admin','prsf_admin','accountant','auditor','fkg_management','deputy_director','credit_risk_officer','compliance_officer','prsf_analyst','reporting_officer','business_development'))
      or (r.code in ('bank_admin','bank_officer') and p.bank_id=claim_payments.bank_id)
    ))
);

create function cgf_private.claim_payment_append_only() returns trigger
language plpgsql set search_path='' as $$
begin raise exception 'Claim payment records are immutable; reconciliation requires a separate controlled action' using errcode='42501'; end $$;
create trigger claim_payment_append_only before update or delete on public.claim_payments for each row execute function cgf_private.claim_payment_append_only();
revoke all on function cgf_private.claim_payment_append_only() from public,anon,authenticated;

create function public.cgf_record_claim_payment(
  p_payment_id uuid, p_claim_id uuid, p_amount numeric, p_currency text,
  p_payment_date date, p_reference text, p_notes text, p_expected_revision bigint
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  actor uuid:=auth.uid(); rc text; c public.claims%rowtype; l public.loan_applications%rowtype;
  s public.claim_committee_sittings%rowtype; policy public.financial_policy_versions%rowtype;
  receipt public.claim_payments%rowtype; authority jsonb; total numeric; next_total numeric;
  original_currency text; guarantee_id uuid; next_status text;
begin
  select r.code into rc from public.profiles p join public.roles r on r.id=p.role_id
    where p.id=actor and p.is_active and r.is_active and p.bank_id is null for share of p,r;
  if actor is null or rc is null or rc not in ('accountant','deputy_director','fkg_management') then
    raise exception 'Active Fund payment authority required; administrators and auditors cannot record payments' using errcode='42501';
  end if;
  if p_payment_id is null or p_claim_id is null or p_expected_revision is null or p_expected_revision<1
    or p_amount is null or p_amount::text in ('NaN','Infinity','-Infinity') or p_amount<=0 or p_amount>1000000000000 or p_amount<>round(p_amount,2)
    or p_currency is null or p_currency not in ('TJS','USD','EUR','RUB')
    or p_payment_date is null or p_payment_date>current_date
    or p_reference is null or length(btrim(p_reference)) not between 1 and 200
    or p_notes is null or length(btrim(p_notes)) not between 3 and 2000 then
    raise exception 'Provide a positive two-decimal payment, currency, nonfuture date, reference, notes and policy revision' using errcode='23514';
  end if;

  -- Share the policy-save lock so a payment uses exactly the revision the actor reviewed.
  perform pg_advisory_xact_lock(474706391);
  select * into receipt from public.claim_payments where id=p_payment_id;
  if found then
    if receipt.recorded_by is distinct from actor or receipt.claim_id is distinct from p_claim_id
      or receipt.amount is distinct from p_amount or receipt.currency is distinct from p_currency
      or receipt.payment_date is distinct from p_payment_date or receipt.payment_reference is distinct from btrim(p_reference)
      or receipt.notes is distinct from btrim(p_notes) or receipt.policy_revision is distinct from p_expected_revision then
      raise exception 'Payment identifier already belongs to a different request' using errcode='23505';
    end if;
    return to_jsonb(receipt);
  end if;
  select * into policy from public.financial_policy_versions order by revision desc limit 1;
  if not found then raise exception 'PIUMOF administrator must save a financial policy before payments' using errcode='23514'; end if;
  if policy.revision<>p_expected_revision then raise exception 'Financial policy changed; reload before recording payment' using errcode='40001'; end if;
  select value into authority from jsonb_array_elements(policy.policy#>'{claims,authorities}')
    where value->>'role_code'=rc and value->>'currency'=p_currency;
  if authority is null or not (policy.policy->'currencies' ? p_currency) then raise exception 'No configured payment authority for this role and currency' using errcode='42501'; end if;

  select * into c from public.claims where id=p_claim_id for update;
  if not found or c.status is distinct from 'approved' then raise exception 'An approved, unpaid claim is required' using errcode='23514'; end if;
  select * into l from public.loan_applications where id=c.loan_id for update;
  if not found or l.status is distinct from 'claim_pending' or c.loan_application_id is distinct from l.id or c.bank_id is distinct from l.bank_id then
    raise exception 'Claim must match its bank and pending parent loan' using errcode='23514';
  end if;
  select * into s from public.claim_committee_sittings where claim_id=c.id order by created_at desc,id desc limit 1;
  if not found or s.status is distinct from 'closed' or s.outcome is distinct from 'approved' or s.protocol_snapshot is null or s.closed_at is null
    or s.protocol_no is null or s.claim_terms is distinct from cgf_private.claim_terms(c.id)
    or s.recommended_amount is distinct from c.approved_amount
    or s.protocol_snapshot->>'outcome' is distinct from 'approved'
    or s.protocol_snapshot->'claim_terms' is distinct from s.claim_terms
    or s.protocol_snapshot->'original_terms' is distinct from s.original_terms
    or s.protocol_snapshot->'recommended_amount' is distinct from to_jsonb(s.recommended_amount) then
    raise exception 'Current immutable signed approval evidence is required' using errcode='23514';
  end if;
  if (select count(*) from public.claim_committee_members where sitting_id=s.id)<>(case when s.original_amount_tjs>s.director_threshold_tjs then 4 else 3 end)
    or exists(select 1 from public.claim_committee_members m where m.sitting_id=s.id and (not m.attended or m.signed_at is null
      or not exists(select 1 from public.claim_committee_votes v where v.sitting_id=s.id and v.member_id=m.member_id and v.vote='for'))) then
    raise exception 'Every required committee member must attend, approve and sign' using errcode='23514';
  end if;
  if (policy.policy#>>'{claims,separate_payment_actor}')::boolean and (
    actor=c.submitted_by or actor=c.reviewed_by or exists(select 1 from public.claim_committee_members where sitting_id=s.id and member_id=actor)
  ) then raise exception 'Payment actor must be separate from claim submission and committee approval' using errcode='42501'; end if;
  select id into guarantee_id from public.guarantee_letters where loan_id=l.id and not revoked and metadata->'terms'=s.original_terms order by issued_date,id limit 1;
  if guarantee_id is null then raise exception 'Original issued guarantee is missing or revoked' using errcode='23514'; end if;
  original_currency:=s.original_terms->>'currency';
  if original_currency is distinct from p_currency or l.currency is distinct from original_currency
    or s.original_terms->>'loan_id' is distinct from l.id::text or s.original_terms->>'bank_id' is distinct from c.bank_id::text
    or (policy.policy->>'settlement_currency'='TJS' and original_currency is distinct from 'TJS') then
    raise exception 'Currency conversion requires reconciled FX evidence; only matching original and settlement currencies are supported' using errcode='23514';
  end if;
  if c.approved_amount is null or c.approved_amount<=0 or c.approved_amount::text in ('NaN','Infinity','-Infinity')
    or c.approved_amount>c.claim_amount or (s.original_terms->>'guarantee_amount') is null
    or (s.original_terms->>'guarantee_amount')::numeric::text in ('NaN','Infinity','-Infinity')
    or c.approved_amount>(s.original_terms->>'guarantee_amount')::numeric
    or c.approved_date is null or p_payment_date<greatest(c.claim_date,c.approved_date,s.closed_at::date) then
    raise exception 'Payment must follow approval and stay within the claim and original guarantee' using errcode='23514';
  end if;
  select coalesce(sum(amount),0) into total from public.claim_payments where claim_id=c.id;
  if coalesce(c.paid_amount,0)<>total or exists(select 1 from public.claim_payments where claim_id=c.id and currency<>p_currency) then
    raise exception 'Legacy payment totals must be reconciled to the immutable ledger before further payments' using errcode='23514';
  end if;
  if exists(select 1 from public.claim_payments where claim_id=c.id and payment_date>p_payment_date) then
    raise exception 'Payment dates must not precede an already recorded payment' using errcode='23514';
  end if;
  next_total:=total+p_amount;
  if next_total>c.approved_amount or p_amount>(authority->>'per_payment_limit')::numeric or next_total>(authority->>'per_claim_limit')::numeric then
    raise exception 'Payment exceeds approved outstanding amount or configured authority limits' using errcode='23514';
  end if;
  if not (policy.policy#>>'{claims,allow_partial_payments}')::boolean and next_total<>c.approved_amount then
    raise exception 'Policy requires payment of the entire outstanding approved amount' using errcode='23514';
  end if;
  next_status:=case when next_total=c.approved_amount then 'paid' else 'approved' end;
  insert into public.claim_payments(id,claim_id,loan_id,bank_id,amount,currency,payment_date,payment_reference,notes,recorded_by,recorded_role,policy_id,policy_revision,policy_snapshot,sitting_id,evidence,cumulative_paid,claim_status)
  values(p_payment_id,c.id,l.id,c.bank_id,p_amount,p_currency,p_payment_date,btrim(p_reference),btrim(p_notes),actor,rc,policy.id,policy.revision,policy.policy,s.id,
    jsonb_build_object('guarantee_id',guarantee_id,'original_terms',s.original_terms,'protocol',s.protocol_snapshot,
      'signatures',(select jsonb_agg(to_jsonb(m) order by m.member_id) from public.claim_committee_members m where m.sitting_id=s.id)),next_total,next_status)
  returning * into receipt;
  update public.claims set paid_amount=next_total,status=next_status,paid_date=p_payment_date,payment_date=p_payment_date,payment_reference=btrim(p_reference) where id=c.id;
  if next_status='paid' then update public.loan_applications set status='claim_paid' where id=l.id; end if;
  insert into public.loan_application_history(loan_id,action,old_status,new_status,performed_by,notes)
  values(l.id,case when next_status='paid' then 'status_change' else 'claim_payment' end,l.status,case when next_status='paid' then 'claim_paid' else l.status end,actor,
    'Claim payment '||receipt.id::text||'; policy revision '||policy.revision::text||'; reference '||btrim(p_reference));
  insert into public.audit_trail(table_name,record_id,action,changed_by,old_data,new_data)
  values('claim_payments',receipt.id,'CLAIM_PAYMENT_RECORDED',actor,jsonb_build_object('claim_id',c.id,'paid_amount',c.paid_amount,'claim_status',c.status,'loan_status',l.status),to_jsonb(receipt));
  return to_jsonb(receipt);
end $$;
revoke all on function public.cgf_record_claim_payment(uuid,uuid,numeric,text,date,text,text,bigint) from public,anon,authenticated;
grant execute on function public.cgf_record_claim_payment(uuid,uuid,numeric,text,date,text,text,bigint) to authenticated;

commit;
