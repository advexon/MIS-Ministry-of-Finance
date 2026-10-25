begin;

alter table public.recoveries
 add column bank_id uuid references public.banks(id),
 add column currency text check(currency in ('TJS','USD','EUR','RUB')),
 add column payment_reference text,
 add column documented_costs numeric(18,2),
 add column cost_evidence text,
 add column policy_id uuid references public.financial_policy_versions(id),
 add column policy_revision bigint,
 add column policy_snapshot jsonb,
 add column calculation_inputs jsonb,
 add column execution_request jsonb;
create unique index recoveries_payment_reference on public.recoveries(bank_id,currency,upper(btrim(payment_reference))) where payment_reference is not null;
revoke insert,update,delete,truncate on public.recoveries from authenticated,anon;

create function cgf_private.allocate_recovery(p_rule jsonb,p_gross numeric,p_costs numeric,p_paid numeric,p_previously_recovered numeric,p_coverage numeric) returns jsonb
language plpgsql immutable set search_path='' as $$
declare net numeric; share numeric; allocation text:=p_rule->>'allocation'; fraction numeric;
begin
 if p_rule is null or p_gross is null or p_costs is null or p_paid is null or p_previously_recovered is null or p_coverage is null
 or p_gross::text in ('NaN','Infinity','-Infinity') or p_costs::text in ('NaN','Infinity','-Infinity') or p_paid::text in ('NaN','Infinity','-Infinity')
 or p_previously_recovered::text in ('NaN','Infinity','-Infinity') or p_coverage::text in ('NaN','Infinity','-Infinity')
 or p_gross<=0 or p_gross>1000000000000 or p_gross<>round(p_gross,2) or p_costs<0 or p_costs>p_gross or p_costs<>round(p_costs,2)
 or p_paid<=0 or p_previously_recovered<0 or p_previously_recovered>p_paid or p_coverage<=0 or p_coverage>1 then
  raise exception 'Invalid recovery amount, documented costs, paid balance or original coverage' using errcode='23514';
 end if;
 if p_rule->>'cap_at_paid_amount' is distinct from 'true' or coalesce(p_rule->>'costs','') not in ('no_deduction','deduct_documented_costs') or coalesce(allocation,'') not in ('fixed_percentage','coverage_pro_rata','fund_first') then
  raise exception 'Unsupported recovery policy' using errcode='23514';
 end if;
 if p_rule->>'costs'='no_deduction' and p_costs<>0 then raise exception 'This policy does not allow cost deductions' using errcode='23514'; end if;
 net:=p_gross-p_costs;
 if allocation='fixed_percentage' then
  fraction:=(p_rule->>'fund_share_percent')::numeric/100;
  if fraction is null or fraction::text in ('NaN','Infinity','-Infinity') or fraction<0 or fraction>1 then raise exception 'Invalid fixed allocation percentage' using errcode='23514'; end if;
 elsif allocation='coverage_pro_rata' then fraction:=p_coverage;
 else fraction:=1; end if;
 share:=least(round(net*fraction,2),p_paid-p_previously_recovered);
 return jsonb_build_object('gross',p_gross,'documented_costs',p_costs,'net',net,'fund_share',share,'bank_share',net-share,'cumulative_fund_share',p_previously_recovered+share,'rounding','half_up','decimal_places',2);
end $$;
revoke all on function cgf_private.allocate_recovery(jsonb,numeric,numeric,numeric,numeric,numeric) from public,anon,authenticated;

create function cgf_private.recovery_append_only() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'Recovery receipts are immutable; use a controlled reconciliation rather than editing financial history' using errcode='42501'; end $$;
revoke all on function cgf_private.recovery_append_only() from public,anon,authenticated;
create trigger cgf_recovery_append_only before update or delete on public.recoveries for each row execute function cgf_private.recovery_append_only();

create function public.cgf_record_recovery(p_recovery_id uuid,p_claim_id uuid,p_gross numeric,p_costs numeric,p_currency text,p_date date,p_reference text,p_cost_evidence text,p_notes text,p_expected_revision bigint) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); rc text; c public.claims%rowtype; policy public.financial_policy_versions%rowtype; receipt public.recoveries%rowtype;
 request jsonb; payment public.claim_payments%rowtype; paid numeric; previous numeric; coverage numeric; allocation jsonb; original_loan numeric; original_guarantee numeric;
begin
 select r.code into rc from public.profiles p join public.roles r on r.id=p.role_id
 where p.id=actor and p.is_active and r.is_active and p.bank_id is null for share of p,r;
 if actor is null or rc is null or (rc not in ('prsf_admin','accountant') and not public.cgf_is_super_admin()) then
  raise exception 'Active Fund recovery authority required' using errcode='42501';
 end if;
 if p_recovery_id is null or p_claim_id is null or p_expected_revision is null or p_expected_revision<1
 or p_gross is null or p_costs is null or p_gross::text in ('NaN','Infinity','-Infinity') or p_costs::text in ('NaN','Infinity','-Infinity')
 or p_gross<=0 or p_gross>1000000000000 or p_gross<>round(p_gross,2) or p_costs<0 or p_costs>p_gross or p_costs<>round(p_costs,2)
 or p_currency is null or p_currency not in ('TJS','USD','EUR','RUB') or p_date is null or p_date>current_date
 or p_reference is null or length(btrim(p_reference)) not between 1 and 200
 or p_notes is null or length(btrim(p_notes)) not between 3 and 2000
 or (p_costs>0 and (p_cost_evidence is null or length(btrim(p_cost_evidence)) not between 3 and 2000))
 or length(coalesce(p_cost_evidence,''))>2000 then
  raise exception 'Provide a positive two-decimal recovery, valid costs/evidence, currency, nonfuture date, reference, reason and policy revision' using errcode='23514';
 end if;
 perform cgf_private.require_admin_reason(p_notes);
 request:=jsonb_build_object('claim_id',p_claim_id,'gross',p_gross,'costs',p_costs,'currency',p_currency,'date',p_date,'reference',btrim(p_reference),'cost_evidence',nullif(btrim(p_cost_evidence),''),'notes',btrim(p_notes),'revision',p_expected_revision);
 perform pg_advisory_xact_lock(474706391);
 select * into receipt from public.recoveries where id=p_recovery_id;
 if found then
  if receipt.recorded_by is distinct from actor or receipt.execution_request is distinct from request then raise exception 'Recovery identifier already belongs to a different request' using errcode='23505'; end if;
  return to_jsonb(receipt);
 end if;
 select * into policy from public.financial_policy_versions order by revision desc limit 1;
 if not found then raise exception 'Save an approved financial policy before recording recoveries' using errcode='23514'; end if;
 if policy.revision<>p_expected_revision then raise exception 'Financial policy changed; reload before recording recovery' using errcode='40001'; end if;
 if not (policy.policy->'currencies' ? p_currency) or (policy.policy->>'settlement_currency'='TJS' and p_currency<>'TJS') then raise exception 'Unsupported settlement currency; reconciled FX conversion is not available' using errcode='23514'; end if;
 select * into c from public.claims where id=p_claim_id for update;
 if not found or c.status is distinct from 'paid' or c.loan_application_id is distinct from c.loan_id then raise exception 'A fully paid claim with a matching parent loan is required' using errcode='23514'; end if;
 if not exists(select 1 from public.loan_applications l where l.id=c.loan_id and l.bank_id=c.bank_id and l.currency=p_currency) then raise exception 'Claim, bank, parent loan and currency must match' using errcode='23514'; end if;
 select * into payment from public.claim_payments where claim_id=c.id order by created_at,id limit 1;
 if not found then raise exception 'Legacy paid claims must be reconciled to the immutable payment ledger before recoveries' using errcode='23514'; end if;
 select sum(amount) into paid from public.claim_payments where claim_id=c.id;
 if paid is distinct from c.paid_amount or paid is distinct from c.approved_amount or exists(select 1 from public.claim_payments p where p.claim_id=c.id and (p.currency<>p_currency or p.loan_id<>c.loan_id or p.bank_id<>c.bank_id or p.evidence->'original_terms' is distinct from payment.evidence->'original_terms' or p.payment_date>p_date)) then
  raise exception 'Payment evidence, totals, dates and original currency must reconcile before recovery' using errcode='23514';
 end if;
 if exists(select 1 from public.recoveries r where r.claim_id=c.id and (r.policy_id is null or r.prsf_share is null or r.currency is distinct from p_currency or r.recovery_date>p_date)) then raise exception 'Reconcile legacy recoveries and record recoveries in date order' using errcode='23514'; end if;
 original_loan:=(payment.evidence#>>'{original_terms,approved_amount}')::numeric;
 original_guarantee:=(payment.evidence#>>'{original_terms,guarantee_amount}')::numeric;
 if original_loan is null or original_guarantee is null or original_loan::text in ('NaN','Infinity','-Infinity') or original_guarantee::text in ('NaN','Infinity','-Infinity') or original_loan<=0 or original_guarantee<=0 or original_guarantee>original_loan then raise exception 'Original signed guarantee amounts are required' using errcode='23514'; end if;
 coverage:=original_guarantee/original_loan;
 select coalesce(sum(prsf_share),0) into previous from public.recoveries where claim_id=c.id;
 allocation:=cgf_private.allocate_recovery(policy.policy->'recoveries',p_gross,p_costs,paid,previous,coverage);
 insert into public.recoveries(id,claim_id,loan_id,loan_application_id,bank_id,currency,recovery_amount,total_recovered,recovery_date,prsf_share,bank_share,documented_costs,payment_reference,cost_evidence,notes,recorded_by,reported_by,policy_id,policy_revision,policy_snapshot,calculation_inputs,execution_request)
 values(p_recovery_id,c.id,c.loan_id,c.loan_id,c.bank_id,p_currency,p_gross,p_gross,p_date,(allocation->>'fund_share')::numeric,(allocation->>'bank_share')::numeric,p_costs,btrim(p_reference),nullif(btrim(p_cost_evidence),''),btrim(p_notes),actor,actor,policy.id,policy.revision,policy.policy,jsonb_build_object('allocation',allocation,'paid_amount',paid,'previous_fund_share',previous,'coverage',coverage,'original_terms',payment.evidence->'original_terms','payment_ids',(select jsonb_agg(id order by id) from public.claim_payments where claim_id=c.id),'fx',jsonb_build_object('conversion_applied',false,'original_currency',p_currency,'settlement_currency',p_currency)),request)
 returning * into receipt;
 insert into public.audit_trail(table_name,record_id,action,changed_by,new_data) values('recoveries',receipt.id,'RECOVERY_RECORDED',actor,to_jsonb(receipt));
 return to_jsonb(receipt);
end $$;
revoke all on function public.cgf_record_recovery(uuid,uuid,numeric,numeric,text,date,text,text,text,bigint) from public,anon;
grant execute on function public.cgf_record_recovery(uuid,uuid,numeric,numeric,text,date,text,text,text,bigint) to authenticated;

commit;
