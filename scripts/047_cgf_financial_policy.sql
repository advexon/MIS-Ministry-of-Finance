begin;

create table public.financial_policy_versions (
  id uuid primary key default gen_random_uuid(),
  revision bigint generated always as identity unique not null,
  policy jsonb not null,
  reason text not null check (length(btrim(reason)) between 3 and 2000),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
alter table public.financial_policy_versions enable row level security;
revoke all on public.financial_policy_versions from public, anon, authenticated;
grant select on public.financial_policy_versions to authenticated;
revoke all on sequence public.financial_policy_versions_revision_seq from public, anon, authenticated;
create policy financial_policy_staff_read on public.financial_policy_versions for select to authenticated using (
  public.current_user_role_code() in ('super_admin','prsf_admin','accountant','auditor','fkg_management','deputy_director','credit_risk_officer','compliance_officer','prsf_analyst','reporting_officer','business_development')
);

create function cgf_private.validate_financial_policy(p jsonb) returns void
language plpgsql set search_path = '' as $$
declare section jsonb; authority jsonb; key text; field text; seen text[] := '{}'; n numeric;
begin
  if jsonb_typeof(p) is distinct from 'object' or p->'schema_version' is distinct from '1'::jsonb
    or not (p ?& array['schema_version','currencies','settlement_currency','fx_date','claims','recoveries','fees'])
    or (p-array['schema_version','currencies','settlement_currency','fx_date','claims','recoveries','fees']) <> '{}'::jsonb then
    raise exception 'Invalid financial policy structure' using errcode='23514';
  end if;
  if jsonb_typeof(p->'currencies') is distinct from 'array' then raise exception 'Choose transaction currencies' using errcode='23514'; end if;
  if jsonb_array_length(p->'currencies') not between 1 and 4 then raise exception 'Choose 1 to 4 currencies' using errcode='23514'; end if;
  for section in select value from jsonb_array_elements(p->'currencies') loop
    if jsonb_typeof(section) is distinct from 'string' or (section #>> '{}') not in ('TJS','USD','EUR','RUB') or (section #>> '{}')=any(seen) then raise exception 'Currencies must be supported and unique' using errcode='23514'; end if;
    seen:=array_append(seen,section #>> '{}');
  end loop;
  if p->>'settlement_currency' is null or p->>'settlement_currency' not in ('loan_currency','TJS') or p->>'fx_date' is null or p->>'fx_date' not in ('transaction_date','period_end')
    or (p->>'settlement_currency'='TJS' and not (p->'currencies' ? 'TJS')) then raise exception 'Invalid currency or exchange-rate date policy' using errcode='23514'; end if;
  section:=p->'claims';
  if jsonb_typeof(section) is distinct from 'object' or not (section ?& array['allow_partial_payments','separate_payment_actor','authorities']) or section-array['allow_partial_payments','separate_payment_actor','authorities']<>'{}'::jsonb
    or jsonb_typeof(section->'allow_partial_payments') is distinct from 'boolean' or jsonb_typeof(section->'separate_payment_actor') is distinct from 'boolean' or jsonb_typeof(section->'authorities') is distinct from 'array' then raise exception 'Invalid claim-payment rules' using errcode='23514'; end if;
  if jsonb_array_length(section->'authorities')>12 then raise exception 'Too many payment authority rules' using errcode='23514'; end if;
  seen:='{}';
  for authority in select value from jsonb_array_elements(section->'authorities') loop
    if jsonb_typeof(authority) is distinct from 'object' or not (authority ?& array['role_code','currency','per_payment_limit','per_claim_limit']) or authority-array['role_code','currency','per_payment_limit','per_claim_limit']<>'{}'::jsonb
      or authority->>'role_code' is null or authority->>'role_code' not in ('accountant','deputy_director','fkg_management') or authority->>'currency' is null or not (p->'currencies' ? (authority->>'currency')) then raise exception 'Payment authorities must use eligible financial roles and enabled currencies; IT administrators and auditors cannot pay claims' using errcode='23514'; end if;
    key:=(authority->>'role_code')||':'||(authority->>'currency');
    if key=any(seen) then raise exception 'Duplicate role/currency authority' using errcode='23514'; end if;
    seen:=array_append(seen,key);
    foreach field in array array['per_payment_limit','per_claim_limit'] loop
      if jsonb_typeof(authority->field) is distinct from 'number' then raise exception 'Payment limits must be numbers' using errcode='23514'; end if;
      n:=(authority->>field)::numeric;
      if n<=0 or n>1000000000000 then raise exception 'Payment limits must be positive and at most 1000000000000' using errcode='23514'; end if;
    end loop;
    if (authority->>'per_payment_limit')::numeric>(authority->>'per_claim_limit')::numeric then raise exception 'Per-payment limit cannot exceed cumulative per-claim limit' using errcode='23514'; end if;
  end loop;
  section:=p->'recoveries';
  if jsonb_typeof(section) is distinct from 'object' or not (section ?& array['allocation','fund_share_percent','costs','cap_at_paid_amount']) or section-array['allocation','fund_share_percent','costs','cap_at_paid_amount']<>'{}'::jsonb
    or section->>'allocation' is null or section->>'allocation' not in ('fixed_percentage','coverage_pro_rata','fund_first') or section->>'costs' is null or section->>'costs' not in ('no_deduction','deduct_documented_costs') or section->'cap_at_paid_amount' is distinct from 'true'::jsonb then raise exception 'Invalid recovery-allocation rules' using errcode='23514'; end if;
  if section->>'allocation'='fixed_percentage' then
    if jsonb_typeof(section->'fund_share_percent') is distinct from 'number' then raise exception 'Enter the fixed fund share' using errcode='23514'; end if;
    n:=(section->>'fund_share_percent')::numeric;
    if n<0 or n>100 then raise exception 'Fund share must be between 0 and 100 percent' using errcode='23514'; end if;
  elsif section->'fund_share_percent' is distinct from 'null'::jsonb then raise exception 'Fund share is only used for fixed-percentage allocation' using errcode='23514'; end if;
  section:=p->'fees';
  if jsonb_typeof(section) is distinct from 'object' or not (section ?& array['base','upfront_rate_percent','recurring_rate_percent','recurring_rate_basis','proration','rounding','decimal_places','due_days']) or section-array['base','upfront_rate_percent','recurring_rate_percent','recurring_rate_basis','proration','rounding','decimal_places','due_days']<>'{}'::jsonb
    or section->>'base' is null or section->>'base' not in ('guarantee_amount','approved_loan_amount','outstanding_guaranteed_principal') or section->>'recurring_rate_basis' is null or section->>'recurring_rate_basis' not in ('annual','quarterly') or section->>'proration' is null or section->>'proration' not in ('none','actual_365','actual_actual') or section->>'rounding' is distinct from 'half_up' then raise exception 'Invalid fee calculation rules' using errcode='23514'; end if;
  foreach field in array array['upfront_rate_percent','recurring_rate_percent','decimal_places','due_days'] loop
    if jsonb_typeof(section->field) is distinct from 'number' then raise exception 'Fee rates and rounding settings must be numbers' using errcode='23514'; end if;
    n:=(section->>field)::numeric;
    if n<0 or (field in ('upfront_rate_percent','recurring_rate_percent') and n>100) or (field='decimal_places' and (n>4 or n<>trunc(n))) or (field='due_days' and (n>365 or n<>trunc(n))) then raise exception 'Fee rates, decimal places or due days are outside the allowed range' using errcode='23514'; end if;
  end loop;
  if section->>'recurring_rate_basis'='annual' and section->>'proration'='none' then raise exception 'Annual rates require day-count proration' using errcode='23514'; end if;
end $$;

create function cgf_private.financial_policy_append_only() returns trigger
language plpgsql set search_path='' as $$
begin raise exception 'Financial policy versions are immutable; save a new revision' using errcode='42501'; end $$;
create trigger financial_policy_append_only before update or delete on public.financial_policy_versions for each row execute function cgf_private.financial_policy_append_only();

create function public.cgf_save_financial_policy(p_policy jsonb, p_reason text, p_expected_revision bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare previous public.financial_policy_versions%rowtype; saved public.financial_policy_versions%rowtype;
begin
  if auth.uid() is null or coalesce(public.current_user_role_code(),'') not in ('super_admin','prsf_admin') then raise exception 'Only active PIUMOF administrators may configure financial policy' using errcode='42501'; end if;
  if p_expected_revision is null or p_expected_revision<0 or p_reason is null or length(btrim(p_reason)) not between 3 and 2000 then raise exception 'A valid expected revision and change reason are required' using errcode='23514'; end if;
  perform pg_advisory_xact_lock(474706391);
  select * into previous from public.financial_policy_versions order by revision desc limit 1;
  if coalesce(previous.revision,0)<>p_expected_revision then raise exception 'Financial policy changed; reload the latest revision before saving' using errcode='40001'; end if;
  perform cgf_private.validate_financial_policy(p_policy);
  insert into public.financial_policy_versions(policy,reason,created_by) values(p_policy,btrim(p_reason),auth.uid()) returning * into saved;
  insert into public.audit_trail(table_name,record_id,action,changed_by,old_data,new_data)
    values('financial_policy_versions',saved.id,'INSERT',auth.uid(),case when previous.id is not null then to_jsonb(previous) else null end,to_jsonb(saved));
  return jsonb_build_object('id',saved.id,'revision',saved.revision,'policy',saved.policy,'reason',saved.reason,'created_at',saved.created_at);
end $$;
revoke all on function cgf_private.validate_financial_policy(jsonb), cgf_private.financial_policy_append_only() from public, anon, authenticated;
revoke all on function public.cgf_save_financial_policy(jsonb,text,bigint) from public, anon, authenticated;
grant execute on function public.cgf_save_financial_policy(jsonb,text,bigint) to authenticated;

commit;
