begin;

alter table public.fees
  alter column amount type numeric(20,4),
  alter column fee_amount type numeric(20,4),
  alter column fee_rate type numeric(12,8),
  add column currency text,
  add column policy_id uuid references public.financial_policy_versions(id),
  add column policy_revision bigint,
  add column policy_snapshot jsonb,
  add column calculation_inputs jsonb,
  add column execution_request jsonb,
  add column recorded_by uuid references public.profiles(id),
  add column assessed_date date,
  add column last_action_reason text;

create unique index fees_upfront_once on public.fees(loan_id) where fee_type='upfront';
create unique index fees_payment_reference_unique on public.fees(bank_id,currency,lower(btrim(payment_reference))) where payment_reference is not null;
alter table public.fees enable row level security;
revoke all on public.fees from anon;
revoke insert,update,delete,truncate,references,trigger on public.fees from authenticated;
grant select on public.fees to authenticated;

create function cgf_private.calculate_fee(p_rule jsonb,p_base numeric,p_type text,p_start date,p_end date)
returns jsonb language plpgsql immutable set search_path='' as $$
declare rate numeric;factor numeric:=1;raw numeric;places integer;cursor_date date;boundary date;year_days integer;
begin
  if p_base is null or p_base::text in ('NaN','Infinity','-Infinity') or p_base<0 or p_base>1000000000000 or p_type is null or p_type not in ('upfront','quarterly') or p_rule is null then raise exception 'Invalid fee calculation inputs' using errcode='23514';end if;
  places:=(p_rule->>'decimal_places')::integer;
  rate:=(p_rule->>(case when p_type='upfront' then 'upfront_rate_percent' else 'recurring_rate_percent' end))::numeric/100;
  if places is null or places not between 0 and 4 or rate is null or rate::text in ('NaN','Infinity','-Infinity') or rate<0 or rate>1 or p_rule->>'rounding' is distinct from 'half_up' then raise exception 'Invalid fee policy' using errcode='23514';end if;
  if p_type='upfront' then
    if p_start is not null or p_end is not null then raise exception 'Upfront fees have no recurring period' using errcode='23514';end if;
  else
    if p_start is null or p_end is null or p_end<=p_start or p_end-p_start>366 then raise exception 'Recurring periods include start and exclude end; maximum 366 days' using errcode='23514';end if;
    if p_rule->>'recurring_rate_basis' not in ('annual','quarterly') or p_rule->>'proration' not in ('none','actual_365','actual_actual') then raise exception 'Invalid recurring fee policy' using errcode='23514';end if;
    if p_rule->>'proration'='none' then
      if p_rule->>'recurring_rate_basis'<>'quarterly' then raise exception 'Annual fees require proration' using errcode='23514';end if;
    else
      factor:=0;cursor_date:=p_start;
      while cursor_date<p_end loop
        boundary:=least(p_end,(date_trunc('year',cursor_date)+interval '1 year')::date);
        year_days:=case when p_rule->>'proration'='actual_365' then 365 else (date_trunc('year',cursor_date)+interval '1 year')::date-date_trunc('year',cursor_date)::date end;
        factor:=factor+(boundary-cursor_date)::numeric/year_days;cursor_date:=boundary;
      end loop;
      if p_rule->>'recurring_rate_basis'='quarterly' then factor:=factor*4;end if;
    end if;
  end if;
  raw:=p_base*rate*factor;
  return jsonb_build_object('base',p_base,'rate',rate,'factor',factor,'unrounded',raw,'amount',round(raw,places),'decimal_places',places,'rounding','half_up','period_start',p_start,'period_end_exclusive',p_end);
end $$;
revoke all on function cgf_private.calculate_fee(jsonb,numeric,text,date,date) from public,anon,authenticated;

create function cgf_private.guard_fee_history() returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='DELETE' then raise exception 'Fee history cannot be deleted; use a controlled correction' using errcode='23514';end if;
  if (to_jsonb(new)-array['status','invoice_number','invoice_date','due_date','payment_date','paid_date','payment_reference','last_action_reason','updated_at']) is distinct from (to_jsonb(old)-array['status','invoice_number','invoice_date','due_date','payment_date','paid_date','payment_reference','last_action_reason','updated_at']) or old.status='paid' then raise exception 'Fee calculation and paid history are immutable' using errcode='23514';end if;
  return new;
end $$;
revoke all on function cgf_private.guard_fee_history() from public,anon,authenticated;
create trigger cgf_fee_history before update or delete on public.fees for each row execute function cgf_private.guard_fee_history();

create function public.cgf_create_fee(p_fee_id uuid,p_loan_id uuid,p_type text,p_date date,p_start date,p_end date,p_balance_row_id uuid,p_notes text,p_expected_revision bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();rc text;policy public.financial_policy_versions%rowtype;l public.loan_applications%rowtype;g public.guarantee_letters%rowtype;receipt public.fees%rowtype;balance public.guarantee_report_loans%rowtype;report public.guarantee_reports%rowtype;request jsonb;terms jsonb;cur text;approved numeric;guaranteed numeric;base numeric;calculation jsonb;quarter_start date;
begin
  select r.code into rc from public.profiles p join public.roles r on r.id=p.role_id where p.id=actor and p.is_active and r.is_active and p.bank_id is null for share of p,r;
  if actor is null or rc is null or (rc not in ('prsf_admin','accountant') and not public.cgf_is_super_admin()) then raise exception 'Active Fund fee authority required' using errcode='42501';end if;
  if p_fee_id is null or p_loan_id is null or p_type is null or p_type not in ('upfront','quarterly') or p_date is null or not isfinite(p_date) or p_date>current_date or p_expected_revision is null or p_expected_revision<1 or p_notes is null or length(btrim(p_notes)) not between 3 and 2000 then raise exception 'Provide loan, fee type, nonfuture assessment date, reason and policy revision' using errcode='23514';end if;
  perform cgf_private.require_admin_reason(p_notes);
  request:=jsonb_build_object('loan_id',p_loan_id,'type',p_type,'date',p_date,'start',p_start,'end',p_end,'balance_row_id',p_balance_row_id,'notes',btrim(p_notes),'revision',p_expected_revision);
  perform pg_advisory_xact_lock(474706391);
  select * into receipt from public.fees where id=p_fee_id;
  if found then if receipt.recorded_by is distinct from actor or receipt.execution_request is distinct from request then raise exception 'Fee identifier belongs to a different request' using errcode='23505';end if;return to_jsonb(receipt);end if;
  select * into policy from public.financial_policy_versions order by revision desc limit 1;
  if not found then raise exception 'Save a financial policy before creating fees' using errcode='23514';end if;
  if policy.revision<>p_expected_revision then raise exception 'Financial policy changed; reload before creating a fee' using errcode='40001';end if;
  select * into l from public.loan_applications where id=p_loan_id for update;
  if not found or l.status not in ('guarantee_issued','approved','disbursed','active','defaulted','claim_pending','claim_paid','settled','closed') then raise exception 'An issued guarantee and eligible parent loan are required' using errcode='23514';end if;
  select * into g from public.guarantee_letters where loan_id=l.id and revoked=false order by issued_date,id limit 1 for share;
  if not found or g.issued_date::date>p_date then raise exception 'Original issued, unrevoked guarantee is required' using errcode='23514';end if;
  terms:=g.metadata->'terms';cur:=terms->>'currency';approved:=(terms->>'approved_amount')::numeric;guaranteed:=(terms->>'guarantee_amount')::numeric;
  if terms->>'loan_id' is distinct from l.id::text or terms->>'bank_id' is distinct from l.bank_id::text or cur is null or cur is distinct from l.currency or approved is null or guaranteed is null or approved::text in ('NaN','Infinity','-Infinity') or guaranteed::text in ('NaN','Infinity','-Infinity') or approved<=0 or approved>1000000000000 or guaranteed<=0 or guaranteed>approved then raise exception 'Signed original loan, bank, currency and amounts must reconcile' using errcode='23514';end if;
  if not (policy.policy->'currencies' ? cur) or (policy.policy->>'settlement_currency'='TJS' and cur<>'TJS') then raise exception 'Fee currency is disabled or requires unsupported FX conversion' using errcode='23514';end if;
  if p_type='upfront' then
    if p_start is not null or p_end is not null then raise exception 'Upfront fees have no period' using errcode='23514';end if;
    if exists(select 1 from public.fees where loan_id=l.id and fee_type='upfront') then raise exception 'An upfront fee already exists for this loan' using errcode='23505';end if;
  else
    if p_start is null or p_end is null or not isfinite(p_start) or not isfinite(p_end) or p_end<=p_start then raise exception 'A valid start-inclusive, end-exclusive billing period is required' using errcode='23514';end if;
    quarter_start:=date_trunc('quarter',p_start)::date;
    if p_end>(quarter_start+interval '3 months')::date or p_start<g.issued_date::date or p_end-1>p_date or (g.valid_until_date is not null and p_end-1>g.valid_until_date::date) or (policy.policy#>>'{fees,proration}'='none' and (p_start<>quarter_start or p_end<>(quarter_start+interval '3 months')::date)) then raise exception 'Use a completed period within one calendar quarter and guarantee validity; no-proration requires a full quarter' using errcode='23514';end if;
    if exists(select 1 from public.fees f where f.loan_id=l.id and f.fee_type in ('quarterly','annual') and (f.period_start is null or f.period_end is null or (f.period_start<p_end and (case when f.policy_id is null then f.period_end+1 else f.period_end end)>p_start))) then raise exception 'An overlapping recurring fee or unreconciled legacy period exists' using errcode='23505';end if;
  end if;
  case policy.policy#>>'{fees,base}'
    when 'guarantee_amount' then base:=guaranteed;
    when 'approved_loan_amount' then base:=approved;
    when 'outstanding_guaranteed_principal' then
      if p_type='upfront' or p_balance_row_id is null then raise exception 'Outstanding-balance fees require a recurring period and approved report row' using errcode='23514';end if;
      select * into balance from public.guarantee_report_loans where id=p_balance_row_id for share;
      if not found then raise exception 'Balance evidence was not found' using errcode='23514';end if;
      select * into report from public.guarantee_reports where id=balance.report_id for share;
      if not found or report.status<>'approved' or report.reviewed_by is null or report.review_date is null or report.review_date::date>p_date or report.bank_id<>l.bank_id or report.report_type<>'monthly' or ((date_trunc('month',report.report_month)+interval '1 month')::date-1)<>p_end-1 or balance.loan_application_id is distinct from l.id or balance.currency is distinct from cur or balance.outstanding_principal is null or balance.outstanding_principal::text in ('NaN','Infinity','-Infinity') or balance.outstanding_principal<0 or balance.outstanding_principal>approved then raise exception 'Approved month-end evidence must match the period, loan, bank, original currency and principal bounds' using errcode='23514';end if;
      base:=balance.outstanding_principal*guaranteed/approved;
    else raise exception 'Unsupported fee base' using errcode='23514';
  end case;
  if policy.policy#>>'{fees,base}'<>'outstanding_guaranteed_principal' and p_balance_row_id is not null then raise exception 'Balance evidence is only used by outstanding-balance policy' using errcode='23514';end if;
  calculation:=cgf_private.calculate_fee(policy.policy->'fees',base,p_type,p_start,p_end);
  insert into public.fees(id,loan_id,loan_application_id,bank_id,fee_type,amount,fee_amount,base_amount,fee_rate,currency,due_date,period_start,period_end,status,notes,recorded_by,assessed_date,policy_id,policy_revision,policy_snapshot,calculation_inputs,execution_request)
  values(p_fee_id,l.id,l.id,l.bank_id,p_type,(calculation->>'amount')::numeric,(calculation->>'amount')::numeric,round(base,2),(calculation->>'rate')::numeric,cur,p_date+(policy.policy#>>'{fees,due_days}')::integer,p_start,p_end,'pending',btrim(p_notes),actor,p_date,policy.id,policy.revision,policy.policy,jsonb_build_object('calculation',calculation,'guarantee_id',g.id,'original_terms',terms,'balance_evidence',case when p_balance_row_id is null then null else jsonb_build_object('row_id',balance.id,'report_id',report.id,'report_month',report.report_month,'reviewed_by',report.reviewed_by,'review_date',report.review_date,'outstanding_principal',balance.outstanding_principal) end,'fx',jsonb_build_object('conversion_applied',false,'original_currency',cur,'settlement_currency',cur)),request) returning * into receipt;
  insert into public.audit_trail(table_name,record_id,action,changed_by,new_data) values('fees',receipt.id,'FEE_ASSESSED',actor,to_jsonb(receipt));return to_jsonb(receipt);
end $$;
revoke all on function public.cgf_create_fee(uuid,uuid,text,date,date,date,uuid,text,bigint) from public,anon;
grant execute on function public.cgf_create_fee(uuid,uuid,text,date,date,date,uuid,text,bigint) to authenticated;

create function public.cgf_fee_action(p_fee_id uuid,p_action text,p_date date,p_reference text,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();rc text;before_row public.fees%rowtype;receipt public.fees%rowtype;
begin
  select r.code into rc from public.profiles p join public.roles r on r.id=p.role_id where p.id=actor and p.is_active and r.is_active and p.bank_id is null for share of p,r;
  if actor is null or rc is null or (rc not in ('prsf_admin','accountant') and not public.cgf_is_super_admin()) then raise exception 'Active Fund fee authority required' using errcode='42501';end if;
  if p_fee_id is null or p_action is null or p_action not in ('invoice','pay') or p_date is null or not isfinite(p_date) or p_date>current_date or p_reason is null or length(btrim(p_reason)) not between 3 and 2000 then raise exception 'Provide fee, action, nonfuture date and reason' using errcode='23514';end if;
  if p_action='pay' and (p_reference is null or length(btrim(p_reference)) not between 1 and 200) then raise exception 'A payment reference is required' using errcode='23514';end if;
  perform cgf_private.require_admin_reason(p_reason);perform pg_advisory_xact_lock(474706391);
  select * into before_row from public.fees where id=p_fee_id for update;
  if not found or before_row.policy_id is null then raise exception 'Policy-backed fee required; reconcile legacy fees before settlement' using errcode='23514';end if;
  if p_action='invoice' and before_row.status='invoiced' and before_row.invoice_date=p_date and before_row.last_action_reason=btrim(p_reason) then return to_jsonb(before_row);end if;
  if p_action='pay' and before_row.status='paid' and before_row.payment_date=p_date and before_row.payment_reference=btrim(p_reference) and before_row.last_action_reason=btrim(p_reason) then return to_jsonb(before_row);end if;
  if p_action='invoice' then
    if before_row.status<>'pending' or p_date<before_row.assessed_date then raise exception 'Only pending fees can be invoiced, on or after assessment' using errcode='23514';end if;
    update public.fees set status='invoiced',invoice_date=p_date,invoice_number='INV-'||id::text,due_date=p_date+(policy_snapshot#>>'{fees,due_days}')::integer,last_action_reason=btrim(p_reason) where id=p_fee_id returning * into receipt;
  else
    if before_row.status not in ('invoiced','overdue') or before_row.invoice_date is null or p_date<before_row.invoice_date then raise exception 'Invoice the fee before recording a payment dated on or after the invoice' using errcode='23514';end if;
    update public.fees set status='paid',payment_date=p_date,paid_date=p_date,payment_reference=btrim(p_reference),last_action_reason=btrim(p_reason) where id=p_fee_id returning * into receipt;
  end if;
  insert into public.audit_trail(table_name,record_id,action,changed_by,old_data,new_data) values('fees',receipt.id,case when p_action='invoice' then 'FEE_INVOICED' else 'FEE_PAID' end,actor,to_jsonb(before_row),to_jsonb(receipt));return to_jsonb(receipt);
end $$;
revoke all on function public.cgf_fee_action(uuid,text,date,text,text) from public,anon;
grant execute on function public.cgf_fee_action(uuid,text,date,text,text) to authenticated;
notify pgrst,'reload schema';
commit;
