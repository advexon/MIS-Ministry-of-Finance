alter table public.loan_applications
  add column assigned_analyst_id uuid references public.profiles(id),
  add column bank_reviewed_by uuid references public.profiles(id),
  add column bank_reviewed_at timestamptz,
  add column stop_factor_reason text,
  add column clarification_return_status text;
alter table public.assessment_notes add column risk_rating text check (risk_rating in ('low','moderate','elevated','high'));
alter table public.sectors add column is_prohibited boolean not null default false;
insert into public.system_settings(key,value,description) values
 ('direct_officer_submission','false','Allow bank officers to submit without manager approval'),
 ('pipeline_max_guarantee_tjs','0','Maximum guarantee in TJS; zero means no configured monetary cap') on conflict(key) do nothing;

create function cgf_private.pipeline_stop_reason(l public.loan_applications) returns text
language plpgsql security definer set search_path='' as $$
declare cap numeric; reasons text[]:='{}';
begin
 if l.currency is distinct from 'TJS' then reasons:=array_append(reasons,'Only TJS applications are supported by the configured limits'); end if;
 if coalesce(l.approved_amount,0)<=0 or coalesce(l.guarantee_amount,0)<=0 or l.guarantee_amount>l.approved_amount or coalesce(l.guarantee_coverage,0)<=0 or l.guarantee_coverage>100 then reasons:=array_append(reasons,'Invalid loan amount, guarantee amount or coverage'); end if;
 if not exists(select 1 from public.banks where id=l.bank_id and is_active) then reasons:=array_append(reasons,'Partner bank is inactive'); end if;
 if l.sector_id is null or not exists(select 1 from public.sectors where id=l.sector_id and is_active and not is_prohibited) then reasons:=array_append(reasons,'Sector is missing, inactive or prohibited'); end if;
 if l.product_id is not null and not exists(select 1 from public.loan_products where id=l.product_id and is_active) then reasons:=array_append(reasons,'Guarantee product is inactive'); end if;
 select value::numeric into cap from public.system_settings where key='pipeline_max_guarantee_tjs';
 if cap>0 and l.guarantee_amount>cap then reasons:=array_append(reasons,'Guarantee exceeds the configured limit of '||cap||' TJS'); end if;
 if exists(select 1 from (select distinct on(m.loan_id) m.delinquency_days from public.monthly_reports m join public.loan_applications a on a.id=m.loan_id where a.borrower_id=l.borrower_id and a.id<>l.id and a.status not in ('settled','closed','cancelled','rejected','ineligible') order by m.loan_id,m.report_month desc,m.created_at desc) latest where latest.delinquency_days>0) or exists(select 1 from public.loan_applications a where a.borrower_id=l.borrower_id and a.id<>l.id and a.status in ('defaulted','claim_pending','claim_paid')) then reasons:=array_append(reasons,'Borrower has an overdue or defaulted exposure in MIS'); end if;
 return nullif(array_to_string(reasons,'; '),'');
end $$;
revoke all on function cgf_private.pipeline_stop_reason(public.loan_applications) from public,anon,authenticated;

create function cgf_private.guard_pipeline() returns trigger
language plpgsql security definer set search_path='' as $$
declare rc text; actor_bank uuid; sec boolean; target uuid; allowed text[]; e public.eligibility_checks%rowtype; a public.assessment_notes%rowtype; reason text; direct boolean; needs_risk boolean;
begin
 select r.code,p.bank_id,p.is_committee_secretary into rc,actor_bank,sec from public.profiles p join public.roles r on r.id=p.role_id where p.id=auth.uid() and p.is_active and r.is_active;
 if tg_op='INSERT' then
   if rc is null or rc not in ('bank_admin','bank_officer') or actor_bank is distinct from new.bank_id then raise exception 'Only active bank employees may create applications for their bank' using errcode='42501'; end if;
   if new.status not in ('draft','submitted') or new.status is null then raise exception 'Applications must start in bank review' using errcode='23514'; end if;
   new.created_by:=auth.uid(); new.assigned_analyst_id:=null; new.bank_reviewed_by:=null; new.bank_reviewed_at:=null; new.stop_factor_reason:=null; new.clarification_return_status:=null;
   if new.status='draft' then new.current_step:=1; return new; end if;
 else
   if new.bank_id is distinct from old.bank_id or new.borrower_id is distinct from old.borrower_id then raise exception 'Application bank and borrower cannot be reassigned' using errcode='42501'; end if;
   if old.status in ('draft','docs_incomplete') and (rc is null or rc not in ('bank_admin','bank_officer') or actor_bank is distinct from old.bank_id) then raise exception 'Only the originating bank may correct a returned file' using errcode='42501'; end if;
   if new.status is not distinct from old.status then
     if new.assigned_analyst_id is distinct from old.assigned_analyst_id or new.bank_reviewed_by is distinct from old.bank_reviewed_by or new.bank_reviewed_at is distinct from old.bank_reviewed_at or new.stop_factor_reason is distinct from old.stop_factor_reason or new.clarification_return_status is distinct from old.clarification_return_status or new.current_step is distinct from old.current_step then raise exception 'Workflow fields are system controlled' using errcode='42501'; end if;
     if (to_jsonb(new)-array['updated_at','notes']) is distinct from (to_jsonb(old)-array['updated_at','notes']) and old.status not in ('draft','docs_incomplete') and old.status not in ('guarantee_issued','disbursed','active','rescheduled','extension_pending','settled','defaulted','claim_pending','claim_rejected','claim_paid','closed') then raise exception 'Reviewed application terms are frozen; return the file to the bank for correction' using errcode='42501'; end if;
     return new;
   end if;
   if rc is null or rc in ('super_admin','prsf_admin','auditor') then raise exception 'Active workflow authority required' using errcode='42501'; end if;
   if old.status in ('guarantee_issued','disbursed','active','rescheduled','extension_pending','settled','defaulted','claim_pending','claim_rejected','claim_paid','closed') then return new; end if;
   allowed:=case old.status
     when 'draft' then array['submitted','cancelled'] when 'submitted' then array['uko_registration','cancelled']
     when 'under_review' then array['uko_registration','rejected','cancelled']
     when 'uko_registration' then array['eligibility_review','docs_incomplete','rejected','cancelled']
     when 'docs_incomplete' then array['uko_registration','assessment','cancelled']
     when 'eligibility_review' then array['assessment','ineligible','docs_incomplete','cancelled']
     when 'assessment' then array['risk_review','kkg_scheduled','ineligible','docs_incomplete','cancelled']
     when 'risk_review' then array['kkg_scheduled','ineligible','cancelled']
     when 'kkg_scheduled' then array['kkg_review','cancelled']
     when 'kkg_review' then array['verification','docs_incomplete','kkg_protocol','rejected','cancelled']
     when 'verification' then array['kkg_review','cancelled']
     when 'kkg_protocol' then array['formal_application','rejected','cancelled']
     when 'formal_application' then array['uko_reconciliation','cancelled']
     when 'uko_reconciliation' then array['compliance_check','kkg_review','rejected','cancelled']
     when 'compliance_check' then array['deputy_review','rejected','cancelled']
     when 'deputy_review' then array['management_review','rejected','cancelled']
     when 'management_review' then array['approved','rejected','cancelled']
     when 'approved' then array['guarantee_issued','cancelled'] else '{}'::text[] end;
   if not coalesce(new.status=any(allowed),false) then raise exception 'ILLEGAL_TRANSITION: % -> %',old.status,new.status using errcode='23514'; end if;
   if old.status in ('draft','docs_incomplete') then
     if rc not in ('bank_admin','bank_officer') or actor_bank is distinct from old.bank_id then raise exception 'Only the originating bank may submit or resubmit' using errcode='42501'; end if;
   elsif old.status in ('submitted','under_review','uko_registration','assessment','verification','formal_application','uko_reconciliation') then
     if rc<>'prsf_analyst' then raise exception 'Analyst authority required' using errcode='42501'; end if;
     if old.assigned_analyst_id is not null and old.assigned_analyst_id<>auth.uid() and old.status<>'verification' then raise exception 'This file belongs to its assigned analyst' using errcode='42501'; end if;
   elsif old.status='eligibility_review' then
     if rc not in ('prsf_analyst','compliance_officer') then raise exception 'Screening authority required' using errcode='42501'; end if;
   elsif old.status='risk_review' then
     if rc<>'credit_risk_officer' then raise exception 'Credit risk authority required' using errcode='42501'; end if;
   elsif old.status in ('kkg_scheduled','kkg_protocol') then
     if not coalesce(sec,false) or rc not in ('prsf_analyst','credit_risk_officer','compliance_officer') then raise exception 'Secretary authority required' using errcode='42501'; end if;
   elsif old.status='kkg_review' then
     if not exists(select 1 from public.committee_agenda_items i join public.committee_meetings m on m.id=i.meeting_id where i.loan_id=old.id and m.secretary_id=auth.uid() and m.status not in ('closed','protocol_issued') ) or not coalesce(sec,false) then raise exception 'Assigned secretary authority required' using errcode='42501'; end if;
   elsif old.status='compliance_check' and rc<>'compliance_officer' then raise exception 'Compliance authority required' using errcode='42501';
   elsif old.status='deputy_review' and rc<>'deputy_director' then raise exception 'Deputy authority required' using errcode='42501';
   elsif old.status='management_review' and rc<>'fkg_management' then raise exception 'Director authority required' using errcode='42501';
   elsif old.status='approved' and not public.cgf_has_signing_authority() then raise exception 'Signature authority required' using errcode='42501'; end if;
   if old.status not in ('draft','docs_incomplete') and (new.approved_amount is distinct from old.approved_amount or new.guarantee_amount is distinct from old.guarantee_amount or new.guarantee_coverage is distinct from old.guarantee_coverage or new.currency is distinct from old.currency or new.product_id is distinct from old.product_id or new.sector_id is distinct from old.sector_id or new.maturity_date is distinct from old.maturity_date) then raise exception 'Do not change reviewed terms during a transition' using errcode='42501'; end if;
   if new.status='docs_incomplete' and nullif(trim(current_setting('cgf.pipeline_reason',true)),'') is null then raise exception 'Use the workflow operation with a written document request' using errcode='23514'; end if;
   if new.status='docs_incomplete' and old.status='kkg_review' and not exists(select 1 from public.committee_agenda_items i join public.committee_meetings m on m.id=i.meeting_id where i.loan_id=old.id and m.secretary_id=auth.uid() and m.status='cancelled' and m.protocol_notes=current_setting('cgf.pipeline_reason',true)) then raise exception 'Use the committee clarification operation' using errcode='23514'; end if;
   new.assigned_analyst_id:=old.assigned_analyst_id; new.bank_reviewed_by:=old.bank_reviewed_by; new.bank_reviewed_at:=old.bank_reviewed_at; new.stop_factor_reason:=old.stop_factor_reason;
 end if;
 if new.status='submitted' then
   select value='true' into direct from public.system_settings where key='direct_officer_submission';
   if rc='bank_officer' and not coalesce(direct,false) then raise exception 'Bank manager approval is required before submission' using errcode='42501'; end if;
   if rc='bank_admin' then new.bank_reviewed_by:=auth.uid(); new.bank_reviewed_at:=now(); end if;
   reason:=cgf_private.pipeline_stop_reason(new);
   if reason is not null then new.status:='rejected'; new.stop_factor_reason:=reason; new.current_step:=1; return new; end if;
   perform pg_advisory_xact_lock(hashtext('cgf-analyst-assignment'));
   select p.id into target from public.profiles p join public.roles r on r.id=p.role_id where p.is_active and r.is_active and r.code='prsf_analyst' and p.department='operations' order by (select count(*) from public.loan_applications x where x.assigned_analyst_id=p.id and x.status not in ('rejected','ineligible','cancelled','guarantee_issued','settled','closed')),p.created_at,p.id limit 1;
   if target is null then raise exception 'No active operations analyst is available; ask an administrator to configure staff' using errcode='23514'; end if;
   new.assigned_analyst_id:=target;
 end if;
 if tg_op='UPDATE' then
   if old.status='docs_incomplete' then
     if new.status='assessment' and old.clarification_return_status is distinct from 'assessment' then raise exception 'No committee clarification is pending' using errcode='23514'; end if;
     reason:=cgf_private.pipeline_stop_reason(new);
     if reason is not null and new.status<>'cancelled' then new.status:='rejected'; new.stop_factor_reason:=reason; end if;
     new.clarification_return_status:=null;
   end if;
   if old.status='uko_registration' and new.status='eligibility_review' then
     if new.usd_rate is null or new.usd_rate<=0 then raise exception 'FX_MISSING: Record a positive exchange rate' using errcode='23514'; end if;
     new.amount_usd:=coalesce(new.guarantee_amount,new.approved_amount)/new.usd_rate; new.requires_assessment:=true;
     new.uko_registered_at:=now(); new.uko_registered_by:=auth.uid(); new.fx_rate_date:=current_date;
   end if;
   if old.status='eligibility_review' and new.status='assessment' then
     select * into e from public.eligibility_checks where loan_id=new.id order by created_at desc,id desc limit 1;
     if not found or e.decision<>'passed' or not coalesce(e.is_eligible and e.esms_passed and e.kyc_passed and e.docs_complete and e.sanctions_screened,false) then raise exception 'ELIGIBILITY_MISSING: All screening checks must pass' using errcode='23514'; end if;
   end if;
   if old.status='assessment' and new.status in ('risk_review','kkg_scheduled') then
     select * into a from public.assessment_notes where loan_id=new.id and status='submitted' order by created_at desc,id desc limit 1;
     if not found or nullif(trim(a.summary),'') is null or nullif(trim(a.financial_analysis),'') is null or a.risk_rating is null then raise exception 'ASSESSMENT_NOT_SUBMITTED: Submit the analyst assessment and risk rating' using errcode='23514'; end if;
     needs_risk:=new.amount_usd is null or new.amount_usd>=10000 or a.risk_rating in ('elevated','high');
     if new.status='kkg_scheduled' and needs_risk then raise exception 'RISK_REVIEW_MISSING: Large or elevated-risk cases require Credit Risk' using errcode='23514'; end if;
   end if;
   if old.status='risk_review' and new.status='kkg_scheduled' and not exists(select 1 from public.risk_reviews where loan_id=new.id and status='submitted') then raise exception 'RISK_REVIEW_MISSING: Submit the risk opinion first' using errcode='23514'; end if;
   if old.status='kkg_scheduled' and new.status='kkg_review' and not exists(select 1 from public.committee_agenda_items i join public.committee_meetings m on m.id=i.meeting_id where i.loan_id=new.id and m.status='scheduled') then raise exception 'QUORUM_NOT_MET: Convene a system-selected committee' using errcode='23514'; end if;
   if old.status in ('kkg_review','verification') and new.status in ('kkg_protocol','rejected') and not exists(select 1 from public.committee_agenda_items i join public.committee_meetings m on m.id=i.meeting_id where i.loan_id=new.id and m.status='held' and m.protocol_snapshot is not null and i.outcome=case when new.status='kkg_protocol' then 'recommend_approve' else 'recommend_reject' end and not exists(select 1 from public.committee_meeting_members mm where mm.meeting_id=m.id and mm.signed_at is null)) then raise exception 'UNANIMOUS_DECISION_REQUIRED: Issue the all-member signed protocol' using errcode='23514'; end if;
   if old.status='verification' and new.status='kkg_review' and not exists(select 1 from public.verifications where loan_id=new.id and status='completed') then raise exception 'VERIFICATION_MISSING: Complete the verification first' using errcode='23514'; end if;
   if old.status='formal_application' and new.status='uko_reconciliation' and not exists(select 1 from public.formal_applications where loan_id=new.id and nullif(trim(signed_by),'') is not null and signed_date is not null) then raise exception 'FORMAL_APPLICATION_MISSING: Record the signed application' using errcode='23514'; end if;
   if old.status='uko_reconciliation' and new.status='compliance_check' and not exists(select 1 from public.uko_reconciliations where loan_id=new.id and (is_consistent or nullif(trim(resolution),'') is not null)) then raise exception 'RECONCILIATION_MISSING: Record and resolve reconciliation' using errcode='23514'; end if;
   if old.status='compliance_check' and new.status='deputy_review' and not exists(select 1 from public.compliance_checks where loan_id=new.id and status='submitted' and outcome in ('cleared','cleared_with_conditions') and conditions_met and documents_verified and aml_cleared) then raise exception 'COMPLIANCE_MISSING: Complete and clear compliance first' using errcode='23514'; end if;
   if old.status='deputy_review' and new.status='management_review' and not public.cgf_deputy_confirmation_current(new.id) then raise exception 'Current Deputy confirmation required' using errcode='23514'; end if;
   if old.status='management_review' and new.status in ('approved','rejected') and not exists(select 1 from public.management_decisions where loan_id=new.id and decision=new.status and decided_by=auth.uid()) then raise exception 'MGMT_DECISION_MISSING: Record the Director decision' using errcode='23514'; end if;
 end if;
 new.current_step:=case new.status when 'draft' then 1 when 'submitted' then 1 when 'uko_registration' then 2 when 'docs_incomplete' then 3 when 'eligibility_review' then 4 when 'assessment' then 5 when 'risk_review' then 6 when 'kkg_scheduled' then 7 when 'kkg_review' then 8 when 'verification' then 9 when 'kkg_protocol' then 10 when 'formal_application' then 11 when 'uko_reconciliation' then 12 when 'compliance_check' then 13 when 'deputy_review' then 14 when 'management_review' then 15 when 'guarantee_issued' then 16 else new.current_step end;
 return new;
end $$;
create trigger cgf_pipeline_guard before insert or update on public.loan_applications for each row execute function cgf_private.guard_pipeline();
revoke all on function cgf_private.guard_pipeline() from public,anon,authenticated;

create function cgf_private.pipeline_events() returns trigger language plpgsql security definer set search_path='' as $$
declare msg text;
begin
 if tg_op='UPDATE' and new.status is not distinct from old.status then return new; end if;
 msg:=coalesce(new.stop_factor_reason,nullif(current_setting('cgf.pipeline_reason',true),''),'Application moved to '||new.status);
 insert into public.loan_application_history(loan_id,action,old_status,new_status,performed_by,notes) values(new.id,'pipeline_transition',case when tg_op='UPDATE' then old.status else null end,new.status,auth.uid(),msg);
 if new.status in ('draft','docs_incomplete','rejected','ineligible','approved','guarantee_issued') then
   insert into public.notifications(user_id,title,message,type,link) select p.id,case new.status when 'draft' then 'Bank manager review required' when 'docs_incomplete' then 'Additional documents or clarification required' when 'guarantee_issued' then 'Signed guarantee letter available' when 'rejected' then 'Guarantee application rejected' else 'Application status updated' end,msg,'info','/dashboard/loans/'||new.id from public.profiles p join public.roles r on r.id=p.role_id where p.is_active and r.is_active and p.bank_id=new.bank_id and r.code in ('bank_admin','bank_officer');
 end if;
 if new.status='submitted' and new.assigned_analyst_id is not null then
   insert into public.workflow_tasks(loan_id,step_no,assigned_to,assigned_at,status,notes) values(new.id,2,new.assigned_analyst_id,now(),'open','Assigned automatically from the operations queue');
   insert into public.notifications(user_id,title,message,type,link) values(new.assigned_analyst_id,'Application assigned',new.loan_number||' is ready for registration.','info','/dashboard/loans/'||new.id);
 end if;
 if tg_op='UPDATE' then update public.workflow_tasks set status='completed',completed_at=now(),completed_by=auth.uid() where loan_id=new.id and step_no=old.current_step and status in ('open','in_progress'); end if;
 return new;
end $$;
create trigger cgf_pipeline_events after insert or update on public.loan_applications for each row execute function cgf_private.pipeline_events();
revoke all on function cgf_private.pipeline_events() from public,anon,authenticated;

create function public.cgf_transition_loan(p_loan uuid,p_from text,p_to text,p_reason text default null,p_registration jsonb default null,p_screening jsonb default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare l public.loan_applications%rowtype; rc text; bank uuid;
begin
 select r.code,p.bank_id into rc,bank from public.profiles p join public.roles r on r.id=p.role_id where p.id=auth.uid() and p.is_active and r.is_active;
 if rc is null or rc in ('super_admin','prsf_admin','auditor') then raise exception 'READ_ONLY_ROLE: Active workflow authority required' using errcode='42501'; end if;
 select * into l from public.loan_applications where id=p_loan for update;
 if not found or (rc in ('bank_admin','bank_officer') and bank is distinct from l.bank_id) then raise exception 'Application not found' using errcode='42501'; end if;
 if l.status is distinct from p_from then raise exception 'TRANSITION_CONFLICT: Refresh the application before retrying' using errcode='40001'; end if;
 if length(coalesce(p_reason,''))>4000 then raise exception 'Reason is too long' using errcode='22023'; end if;
 if p_to in ('rejected','ineligible','docs_incomplete') and length(trim(coalesce(p_reason,'')))<3 then raise exception 'A written reason is required' using errcode='22023'; end if;
 if p_to in ('guarantee_issued','kkg_protocol') or (p_from='kkg_review' and p_to in ('rejected','docs_incomplete')) then raise exception 'Use the dedicated signing or committee operation' using errcode='23514'; end if;
 if p_registration is not null and not (p_from='uko_registration' and p_to='eligibility_review') then raise exception 'INVALID_PAYLOAD: Registration is only accepted during registration' using errcode='22023'; end if;
 if p_screening is not null then
   if p_from not in ('uko_registration','eligibility_review','assessment') or p_to not in ('assessment','ineligible','docs_incomplete') then raise exception 'INVALID_PAYLOAD: Screening is not valid for this transition' using errcode='22023'; end if;
   if rc not in ('prsf_analyst','compliance_officer') then raise exception 'Screening authority required' using errcode='42501'; end if;
   insert into public.eligibility_checks(loan_id,is_eligible,esms_passed,kyc_passed,sanctions_screened,docs_complete,findings,missing_documents,decision,checked_by,checked_at) values(p_loan,(p_screening->>'eligible')::boolean,(p_screening->>'esms')::boolean,(p_screening->>'kyc')::boolean,coalesce((p_screening->>'sanctions')::boolean,false),(p_screening->>'docs')::boolean,p_reason,case when p_to='docs_incomplete' then p_reason end,case when p_to='assessment' then 'passed' when p_to='docs_incomplete' then 'returned_to_bank' else 'rejected' end,auth.uid(),now());
 end if;
 perform set_config('cgf.pipeline_reason',coalesce(p_reason,''),true);
 update public.loan_applications set status=p_to,usd_rate=case when p_registration is not null then (p_registration->>'usd_rate')::numeric else usd_rate end,uko_reference_no=case when p_registration is not null then p_registration->>'uko_reference_no' else uko_reference_no end,fx_rate_source=case when p_registration is not null then 'Manual entry at registration' else fx_rate_source end where id=p_loan returning * into l;
 return jsonb_build_object('ok',true,'from',p_from,'to',l.status,'step',l.current_step,'stop_factor_reason',l.stop_factor_reason);
end $$;
revoke all on function public.cgf_transition_loan(uuid,text,text,text,jsonb,jsonb) from public,anon;
grant execute on function public.cgf_transition_loan(uuid,text,text,text,jsonb,jsonb) to authenticated;

create function public.cgf_request_clarification(p_loan uuid,p_reason text) returns uuid language plpgsql security definer set search_path='' as $$
declare l public.loan_applications%rowtype; m public.committee_meetings%rowtype;
begin
 select * into l from public.loan_applications where id=p_loan for update;
 if not found or l.status<>'kkg_review' then raise exception 'Application is not at committee review' using errcode='23514'; end if;
 select cm.* into m from public.committee_meetings cm join public.committee_agenda_items i on i.meeting_id=cm.id where i.loan_id=p_loan and cm.status in ('scheduled','in_progress') order by cm.created_at desc limit 1 for update of cm;
 if not found or m.secretary_id is distinct from auth.uid() or not exists(select 1 from public.profiles p join public.roles r on r.id=p.role_id where p.id=auth.uid() and p.is_active and r.is_active and p.is_committee_secretary and r.code in ('prsf_analyst','credit_risk_officer','compliance_officer')) then raise exception 'Assigned secretary required before protocol signing' using errcode='42501'; end if;
 if length(trim(coalesce(p_reason,'')))<3 or length(p_reason)>4000 then raise exception 'Explain what the bank must provide' using errcode='22023'; end if;
 perform set_config('cgf.pipeline_reason',p_reason,true);
 update public.committee_meetings set status='cancelled',protocol_notes=p_reason where id=m.id;
 update public.loan_applications set status='docs_incomplete',clarification_return_status='assessment' where id=p_loan;
 insert into public.audit_trail(table_name,record_id,action,changed_by,new_data) values('committee_meetings',m.id,'COMMITTEE_CLARIFICATION',auth.uid(),jsonb_build_object('loan_id',p_loan,'reason',p_reason));
 return m.id;
end $$;
revoke all on function public.cgf_request_clarification(uuid,text) from public,anon;
grant execute on function public.cgf_request_clarification(uuid,text) to authenticated;

create function cgf_private.guard_pipeline_artifact() returns trigger language plpgsql security definer set search_path='' as $$
declare rc text; l public.loan_applications%rowtype; actor_col text; expected text;
begin
 select r.code into rc from public.profiles p join public.roles r on r.id=p.role_id where p.id=auth.uid() and p.is_active and r.is_active;
 if rc is null then raise exception 'Active employee required' using errcode='42501'; end if;
 select * into l from public.loan_applications where id=new.loan_id;
 expected:=case tg_table_name when 'assessment_notes' then 'assessment' when 'risk_reviews' then 'risk_review' when 'verifications' then 'verification' when 'formal_applications' then 'formal_application' when 'uko_reconciliations' then 'uko_reconciliation' when 'compliance_checks' then 'compliance_check' end;
 if l.status is distinct from expected and not (tg_table_name='eligibility_checks' and l.status in ('uko_registration','eligibility_review','assessment')) then raise exception 'Artifact does not belong to the current workflow step' using errcode='23514'; end if;
 if (tg_table_name in ('assessment_notes','verifications','formal_applications','uko_reconciliations') and rc<>'prsf_analyst') or (tg_table_name='risk_reviews' and rc<>'credit_risk_officer') or (tg_table_name='compliance_checks' and rc<>'compliance_officer') or (tg_table_name='eligibility_checks' and rc not in ('prsf_analyst','compliance_officer')) then raise exception 'Wrong artifact authority' using errcode='42501'; end if;
 if tg_table_name='verifications' and exists(select 1 from public.assessment_notes where loan_id=new.loan_id and prepared_by=auth.uid()) then raise exception 'Assessment author cannot verify the same case' using errcode='42501'; end if;
 if tg_table_name in ('assessment_notes','formal_applications','uko_reconciliations') and l.assigned_analyst_id is not null and l.assigned_analyst_id<>auth.uid() then raise exception 'Assigned analyst required' using errcode='42501'; end if;
 actor_col:=case tg_table_name when 'assessment_notes' then 'prepared_by' when 'risk_reviews' then 'reviewed_by' when 'verifications' then 'assigned_to' when 'formal_applications' then 'submitted_by' when 'uko_reconciliations' then 'reconciled_by' else 'checked_by' end;
 new:=jsonb_populate_record(new,jsonb_build_object(actor_col,auth.uid(),'created_at',now()));
 return new;
end $$;
do $$ declare t text; begin foreach t in array array['assessment_notes','risk_reviews','verifications','formal_applications','uko_reconciliations','compliance_checks','eligibility_checks'] loop execute format('create trigger cgf_artifact_guard before insert or update on public.%I for each row execute function cgf_private.guard_pipeline_artifact()',t); end loop; end $$;
revoke all on function cgf_private.guard_pipeline_artifact() from public,anon,authenticated;

create function cgf_private.guard_pipeline_setting() returns trigger language plpgsql set search_path='' as $$
begin
 if new.key='direct_officer_submission' and new.value not in ('true','false') then raise exception 'Direct submission must be true or false' using errcode='23514'; end if;
 if new.key='pipeline_max_guarantee_tjs' and (new.value !~ '^[0-9]+(\.[0-9]+)?$') then raise exception 'Guarantee limit must be nonnegative' using errcode='23514'; end if;
 return new;
end $$;
create trigger cgf_pipeline_settings before insert or update on public.system_settings for each row execute function cgf_private.guard_pipeline_setting();
revoke all on function cgf_private.guard_pipeline_setting() from public,anon,authenticated;

create policy cgf_bank_insert_scope on public.loan_applications as restrictive for insert to authenticated with check (bank_id=public.current_user_bank_id() and public.current_user_role_code() in ('bank_admin','bank_officer'));
create policy cgf_loan_update_scope on public.loan_applications as restrictive for update to authenticated using (public.is_prsf_staff() or bank_id=public.current_user_bank_id()) with check (public.is_prsf_staff() or bank_id=public.current_user_bank_id());
create policy cgf_settings_admin_insert on public.system_settings as restrictive for insert to authenticated with check (public.current_user_role_code() in ('super_admin','prsf_admin'));
create policy cgf_settings_admin_update on public.system_settings as restrictive for update to authenticated using (public.current_user_role_code() in ('super_admin','prsf_admin')) with check (public.current_user_role_code() in ('super_admin','prsf_admin'));
create policy cgf_settings_admin_delete on public.system_settings as restrictive for delete to authenticated using (public.current_user_role_code() in ('super_admin','prsf_admin'));
create policy cgf_sector_admin_update on public.sectors as restrictive for update to authenticated using (public.current_user_role_code() in ('super_admin','prsf_admin')) with check (public.current_user_role_code() in ('super_admin','prsf_admin'));
