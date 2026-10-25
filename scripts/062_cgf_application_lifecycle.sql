begin;
create function cgf_private.guard_application_boundary() returns trigger language plpgsql security definer set search_path='' as $$
declare rc text; actor_bank uuid; allowed text[]; mutable text[];
begin
 select r.code,p.bank_id into rc,actor_bank from public.profiles p join public.roles r on r.id=p.role_id where p.id=auth.uid() and p.is_active and r.is_active;
 if rc is null then raise exception 'Active application authority required' using errcode='42501'; end if;
 if tg_op='INSERT' then
  if new.status is distinct from 'draft' then raise exception 'New applications must start as a draft' using errcode='23514'; end if;
 else
  if new.branch_id is distinct from old.branch_id and old.status not in ('draft','docs_incomplete') then raise exception 'Reviewed branch is frozen' using errcode='42501'; end if;
  if new.intake_data is distinct from old.intake_data or new.intake_revision is distinct from old.intake_revision then
   if old.status not in ('draft','docs_incomplete') or new.status is distinct from old.status or new.intake_revision<>old.intake_revision+1 then raise exception 'Intake can only be corrected in bank review or returned states' using errcode='42501'; end if;
  end if;
  if old.status in ('draft','docs_incomplete') and new.status in ('submitted','uko_registration','assessment') and not exists(select 1 from public.loan_documents where loan_id=old.id) then raise exception 'Attach the bank application package before submission' using errcode='23514'; end if;
  if old.status not in ('draft','docs_incomplete') and (to_jsonb(new)-array['status','updated_at','notes','authority_reason','current_step','assigned_analyst_id','bank_reviewed_by','bank_reviewed_at','stop_factor_reason','clarification_return_status','usd_rate','amount_usd','fx_rate_date','fx_rate_source','requires_assessment','uko_reference_no','uko_registered_at','uko_registered_by','guarantee_number','guarantee_issued_date','approved_by','loan_approval_date','disbursement_date','disbursed_amount','maturity_date','settlement_date','settlement_amount','reschedule_date','reschedule_reason','reschedule_approved_by','new_maturity_date','defaulted_date','cancellation_reason']) is distinct from (to_jsonb(old)-array['status','updated_at','notes','authority_reason','current_step','assigned_analyst_id','bank_reviewed_by','bank_reviewed_at','stop_factor_reason','clarification_return_status','usd_rate','amount_usd','fx_rate_date','fx_rate_source','requires_assessment','uko_reference_no','uko_registered_at','uko_registered_by','guarantee_number','guarantee_issued_date','approved_by','loan_approval_date','disbursement_date','disbursed_amount','maturity_date','settlement_date','settlement_amount','reschedule_date','reschedule_reason','reschedule_approved_by','new_maturity_date','defaulted_date','cancellation_reason']) then raise exception 'Reviewed application terms are immutable' using errcode='42501'; end if;
  if old.status in ('guarantee_issued','disbursed','active','rescheduled','extension_pending','defaulted','settled','claim_pending','claim_rejected','claim_paid','closed') then
   if new.status is not distinct from old.status then
    if (to_jsonb(new)-array['updated_at','notes']) is distinct from (to_jsonb(old)-array['updated_at','notes']) then raise exception 'Financial lifecycle fields require a valid transition' using errcode='42501'; end if;
    return new;
   end if;
   if old.status in ('active','defaulted') and new.status='claim_pending' then
    if not exists(select 1 from public.claims c where c.loan_id=old.id and c.loan_application_id=old.id and c.bank_id=old.bank_id and c.status in ('pending','submitted','under_review')) then raise exception 'Submit a claim through the claim operation' using errcode='23514'; end if;
   elsif old.status='claim_pending' and new.status in ('claim_paid','claim_rejected') then
    null;
   else
    if not public.cgf_is_super_admin() and (rc not in ('bank_admin','bank_officer') or actor_bank is distinct from old.bank_id) then raise exception 'Only the originating bank may record loan lifecycle events' using errcode='42501'; end if;
    if public.cgf_is_super_admin() then perform cgf_private.require_admin_reason(new.authority_reason); perform set_config('cgf.pipeline_reason',new.authority_reason,true); end if;
    allowed:=case old.status when 'guarantee_issued' then array['active','disbursed'] when 'active' then array['settled','rescheduled','defaulted'] when 'disbursed' then array['settled','rescheduled','defaulted'] when 'rescheduled' then array['settled','defaulted'] else '{}'::text[] end;
    if not coalesce(new.status=any(allowed),false) then raise exception 'Invalid post-issuance transition' using errcode='23514'; end if;
   end if;
   mutable:=array['status','updated_at','authority_reason'];
   if old.status='guarantee_issued' and new.status in ('active','disbursed') then
    if new.disbursement_date is null or new.disbursement_date>current_date or new.disbursement_date<coalesce(old.guarantee_issued_date,new.disbursement_date) or new.maturity_date is null or new.maturity_date<=new.disbursement_date or new.disbursed_amount is null or new.disbursed_amount<=0 or new.disbursed_amount>old.approved_amount or new.disbursed_amount::text in ('NaN','Infinity','-Infinity') then raise exception 'Enter valid disbursement amount, date and later maturity' using errcode='23514'; end if;
    mutable:=mutable||array['disbursement_date','disbursed_amount','maturity_date'];
   elsif new.status='settled' then
    if new.settlement_date is null or new.settlement_date>current_date or new.settlement_date<coalesce(old.disbursement_date,new.settlement_date) or new.settlement_amount is null or new.settlement_amount<0 or new.settlement_amount::text in ('NaN','Infinity','-Infinity') then raise exception 'Enter a valid settlement date and nonnegative final payment' using errcode='23514'; end if;
    mutable:=mutable||array['settlement_date','settlement_amount'];
   elsif new.status='rescheduled' then
    if new.reschedule_date is null or new.reschedule_date>current_date or new.reschedule_date<coalesce(old.disbursement_date,new.reschedule_date) or new.new_maturity_date is null or new.new_maturity_date<=greatest(new.reschedule_date,coalesce(old.new_maturity_date,old.maturity_date,new.reschedule_date)) or length(btrim(coalesce(new.reschedule_reason,'')))<3 then raise exception 'Enter a reason, valid reschedule date and a later maturity' using errcode='23514'; end if;
    new.reschedule_approved_by:=auth.uid(); mutable:=mutable||array['reschedule_date','reschedule_reason','new_maturity_date','reschedule_approved_by'];
   elsif new.status='defaulted' then
    if new.defaulted_date is null or new.defaulted_date>current_date or new.defaulted_date<coalesce(old.disbursement_date,new.defaulted_date) then raise exception 'Enter a valid default date' using errcode='23514'; end if;
    mutable:=mutable||array['defaulted_date','notes'];
   end if;
   if (to_jsonb(new)-mutable) is distinct from (to_jsonb(old)-mutable) then raise exception 'Only the fields for this lifecycle event may change' using errcode='42501'; end if;
  elsif new.status is not distinct from old.status and old.status not in ('draft','docs_incomplete') and (new.disbursement_date is distinct from old.disbursement_date or new.disbursed_amount is distinct from old.disbursed_amount or new.settlement_date is distinct from old.settlement_date or new.settlement_amount is distinct from old.settlement_amount) then raise exception 'Financial fields require their lifecycle operation' using errcode='42501'; end if;
 end if;
 if new.branch_id is not null and not exists(select 1 from public.bank_branches b where b.id=new.branch_id and b.bank_id=new.bank_id) then raise exception 'Branch must belong to the application bank' using errcode='23514'; end if;
 return new;
end $$;
create trigger cgf_application_boundary before insert or update on public.loan_applications for each row execute function cgf_private.guard_application_boundary();
revoke all on function cgf_private.guard_application_boundary() from public,anon,authenticated;
create function cgf_private.audit_application_lifecycle() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.status is distinct from new.status then insert into public.audit_trail(table_name,record_id,action,old_data,new_data,changed_by) values('loan_applications',new.id,'WORKFLOW',to_jsonb(old),jsonb_build_object('application',to_jsonb(new),'reason',nullif(current_setting('cgf.pipeline_reason',true),'')),auth.uid()); end if;
 return new;
end $$;
create trigger cgf_application_lifecycle_audit after update on public.loan_applications for each row execute function cgf_private.audit_application_lifecycle();
revoke all on function cgf_private.audit_application_lifecycle() from public,anon,authenticated;
commit;
