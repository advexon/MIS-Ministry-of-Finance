begin;
do $$
declare
 analyst uuid; risk uuid; compliance uuid; director uuid; administrator uuid; auditor uuid; bank_user uuid;
 bank uuid; borrower uuid; loan uuid; claim uuid; sitting uuid; member record; candidate uuid;
 original_terms jsonb; fixture text:='CLAIM-CHECK-'||gen_random_uuid()::text;
begin
 select p.id into analyst from public.profiles p join public.roles r on r.id=p.role_id where p.is_active and r.is_active and p.bank_id is null and r.code='prsf_analyst' order by p.created_at,p.id limit 1;
 select p.id into risk from public.profiles p join public.roles r on r.id=p.role_id where p.is_active and r.is_active and p.bank_id is null and r.code='credit_risk_officer' limit 1;
 select p.id into compliance from public.profiles p join public.roles r on r.id=p.role_id where p.is_active and r.is_active and p.bank_id is null and r.code='compliance_officer' limit 1;
 select p.id into director from public.profiles p join public.roles r on r.id=p.role_id where p.is_active and r.is_active and r.code='fkg_management' limit 1;
 select p.id into administrator from public.profiles p join public.roles r on r.id=p.role_id where p.is_active and r.is_active and r.code='super_admin' limit 1;
 select p.id into auditor from public.profiles p join public.roles r on r.id=p.role_id where p.is_active and r.is_active and r.code='auditor' limit 1;
 select p.id into bank_user from public.profiles p join public.roles r on r.id=p.role_id where p.is_active and r.is_active and r.code in ('bank_admin','bank_officer') and p.bank_id is not null limit 1;
 assert analyst is not null and risk is not null and compliance is not null and director is not null and administrator is not null and auditor is not null and bank_user is not null,'Required test roles unavailable';
 select l.bank_id,l.borrower_id into bank,borrower from public.loan_applications l limit 1;
 assert bank is not null and borrower is not null,'Required parent fixture unavailable';
 update public.profiles set is_claims_committee_member=true where id in (analyst,risk,compliance);
 update public.profiles set is_committee_secretary=true where id=analyst;
 insert into public.loan_applications(loan_request_id,bank_id,borrower_id,status,currency,approved_amount,guarantee_amount) values(fixture,bank,borrower,'active','TJS',2000000,1000000) returning id into loan;
 original_terms:=jsonb_build_object('loan_id',loan,'bank_id',bank,'currency','TJS','approved_amount',2000000,'guarantee_amount',1000000);
 insert into public.guarantee_letters(loan_id,guarantee_number,metadata) values(loan,fixture,jsonb_build_object('terms',original_terms));
 insert into public.claims(loan_id,loan_application_id,bank_id,claim_amount,claim_date,status) values(loan,loan,bank,1000,current_date,'pending') returning id into claim;
 update public.system_settings set value='1000000' where key='committee_director_threshold_tjs';
 foreach candidate in array array[administrator,auditor,bank_user] loop
   perform set_config('request.jwt.claim.sub',candidate::text,true);
   begin
     perform public.cgf_claim_committee_action('create',null,jsonb_build_object('claim_id',claim,'meeting_no',fixture,'recommended_amount',500));
     raise exception 'Unauthorized role created a claims sitting';
   exception when insufficient_privilege then null; end;
 end loop;
 perform set_config('request.jwt.claim.sub',analyst::text,true);
 begin
   perform public.cgf_claim_committee_action('create',null,jsonb_build_object('claim_id',claim,'meeting_no',fixture,'recommended_amount',1001));
   raise exception 'Oversized proposed claim was accepted';
 exception when invalid_parameter_value then null; end;
 update public.profiles set is_claims_committee_member=false where id=compliance;
 begin
   perform public.cgf_claim_committee_action('create',null,jsonb_build_object('claim_id',claim,'meeting_no',fixture,'recommended_amount',500));
   raise exception 'Missing mandatory role was accepted';
 exception when check_violation then null; end;
 assert not exists(select 1 from public.claim_committee_sittings where claim_id=claim),'Failed composition was not atomic';
 update public.profiles set is_claims_committee_member=true where id=compliance;
 update public.loan_applications set approved_amount=100 where id=loan;
 execute 'set local role authenticated';
 sitting:=public.cgf_claim_committee_action('create',null,jsonb_build_object('claim_id',claim,'meeting_no',fixture,'recommended_amount',500));
 execute 'reset role';
 assert (select count(*)=4 from public.claim_committee_members where sitting_id=sitting),'Original loan threshold must add Director despite tiny claim and changed loan amount';
 assert (select count(distinct role_code)=4 from public.claim_committee_members where sitting_id=sitting),'Separate Risk Compliance Analyst Director membership required';
 begin
   perform public.cgf_claim_committee_action('create',null,jsonb_build_object('claim_id',claim,'meeting_no',fixture,'recommended_amount',500));
   raise exception 'Duplicate open sitting was accepted';
 exception when unique_violation then null; end;
 execute 'set local role authenticated';
 begin
   update public.claims set status='approved',approved_amount=500 where id=claim;
   raise exception 'Direct claim approval succeeded';
 exception when insufficient_privilege then null; end;
 begin
   update public.claims set status='paid',paid_amount=500 where id=claim;
   raise exception 'Direct claim payment succeeded';
 exception when insufficient_privilege then null; end;
 begin
   insert into public.claim_committee_votes(sitting_id,member_id,vote) values(sitting,analyst,'for');
   raise exception 'Direct committee vote succeeded';
 exception when insufficient_privilege then null; end;
 execute 'reset role';
 begin
   perform public.cgf_claim_committee_action('issue',sitting);
   raise exception 'Unsigned issue succeeded';
 exception when check_violation then null; end;
 for member in select member_id from public.claim_committee_members where sitting_id=sitting loop
   perform public.cgf_claim_committee_action('attendance',sitting,jsonb_build_object('member_id',member.member_id,'attended',true));
 end loop;
 for member in select member_id from public.claim_committee_members where sitting_id=sitting loop
   perform set_config('request.jwt.claim.sub',member.member_id::text,true);
   perform public.cgf_claim_committee_action('vote',sitting,jsonb_build_object('vote',case when member.member_id=director then 'against' else 'for' end));
 end loop;
 perform set_config('request.jwt.claim.sub',analyst::text,true);
 begin
   perform public.cgf_claim_committee_action('prepare',sitting,jsonb_build_object('protocol_no',fixture));
   raise exception 'Non-unanimous protocol prepared';
 exception when check_violation then null; end;
 perform set_config('request.jwt.claim.sub',director::text,true);
 perform public.cgf_claim_committee_action('vote',sitting,jsonb_build_object('vote','for'));
 perform set_config('request.jwt.claim.sub',analyst::text,true);
 perform public.cgf_claim_committee_action('prepare',sitting,jsonb_build_object('protocol_no',fixture,'notes','Rolled-back regression'));
 begin
   update public.claim_committee_votes set vote='against' where sitting_id=sitting;
   raise exception 'Frozen votes changed';
 exception when check_violation then null; end;
 begin
   perform public.cgf_claim_committee_action('issue',sitting);
   raise exception 'Issue without all signatures succeeded';
 exception when check_violation then null; end;
 for member in select member_id from public.claim_committee_members where sitting_id=sitting loop
   perform set_config('request.jwt.claim.sub',member.member_id::text,true);
   execute 'set local role authenticated';
   perform public.cgf_claim_committee_action('sign',sitting);
   execute 'reset role';
 end loop;
 perform set_config('request.jwt.claim.sub',analyst::text,true);
 update public.claims set claim_amount=1001 where id=claim;
 begin
   perform public.cgf_claim_committee_action('issue',sitting);
   raise exception 'Changed claim terms were accepted';
 exception when serialization_failure then null; end;
 update public.claims set claim_amount=1000 where id=claim;
 execute 'set local role authenticated';
 perform public.cgf_claim_committee_action('issue',sitting);
 execute 'reset role';
 assert (select status='approved' and approved_amount=500 and paid_amount is null and payment_date is null from public.claims where id=claim),'Claim was not approved independently of payment';
 assert exists(select 1 from public.audit_trail where record_id=sitting and action='CLAIM_COMMITTEE_ISSUE'),'Issue audit missing';
 assert (select status='closed' from public.claim_committee_sittings where id=sitting),'Sitting not closed atomically';
 begin
   update public.claim_committee_sittings set protocol_notes='tampered' where id=sitting;
   raise exception 'Final protocol mutated';
 exception when check_violation then null; end;
 perform set_config('request.jwt.claim.sub',bank_user::text,true);
 execute 'set local role authenticated';
 assert not exists(select 1 from public.claim_committee_sittings where id=sitting),'Bank can read internal claim protocol';
 execute 'reset role';
 perform set_config('request.jwt.claim.sub',auditor::text,true);
 execute 'set local role authenticated';
 assert exists(select 1 from public.claim_committee_sittings where id=sitting),'Auditor cannot read protocol';
 execute 'reset role';
 perform set_config('request.jwt.claim.sub',analyst::text,true);
 execute 'set local role authenticated';
 begin
   update public.loan_applications set status='claim_paid' where id=loan;
   raise exception 'Direct loan claim payment succeeded';
 exception when insufficient_privilege then null; end;
 begin
   insert into public.claims(loan_id,loan_application_id,bank_id,claim_amount,claim_date,status,approved_amount) values(loan,loan,bank,1000,current_date,'approved',500);
   raise exception 'Preapproved claim insert succeeded';
 exception when insufficient_privilege then null; end;
 execute 'reset role';
 original_terms:=original_terms||jsonb_build_object('approved_amount',1000000);
 update public.guarantee_letters set metadata=jsonb_build_object('terms',original_terms) where loan_id=loan;
 update public.loan_applications set status='claim_pending' where id=loan;
 insert into public.claims(loan_id,loan_application_id,bank_id,claim_amount,claim_date,status) values(loan,loan,bank,1000,current_date,'pending') returning id into claim;
 sitting:=public.cgf_claim_committee_action('create',null,jsonb_build_object('claim_id',claim,'meeting_no',fixture||'-small','recommended_amount',500));
 assert (select count(*)=3 from public.claim_committee_members where sitting_id=sitting),'Threshold-equal original loan should have exactly Risk Compliance and Analyst';
 for member in select member_id from public.claim_committee_members where sitting_id=sitting loop
   perform public.cgf_claim_committee_action('attendance',sitting,jsonb_build_object('member_id',member.member_id,'attended',true));
 end loop;
 for member in select member_id from public.claim_committee_members where sitting_id=sitting loop
   perform set_config('request.jwt.claim.sub',member.member_id::text,true);
   perform public.cgf_claim_committee_action('vote',sitting,jsonb_build_object('vote','against'));
 end loop;
 perform set_config('request.jwt.claim.sub',analyst::text,true);
 perform public.cgf_claim_committee_action('prepare',sitting,jsonb_build_object('protocol_no',fixture||'-reject'));
 for member in select member_id from public.claim_committee_members where sitting_id=sitting loop
   perform set_config('request.jwt.claim.sub',member.member_id::text,true);
   perform public.cgf_claim_committee_action('sign',sitting);
 end loop;
 perform set_config('request.jwt.claim.sub',analyst::text,true);
 execute 'set local role authenticated';
 perform public.cgf_claim_committee_action('issue',sitting);
 execute 'reset role';
 assert (select status='rejected' and approved_amount is null from public.claims where id=claim),'Unanimous signed rejection failed';
 assert (select status='claim_rejected' from public.loan_applications where id=loan),'Rejected claim loan not updated atomically';
 assert exists(select 1 from public.loan_application_history where loan_id=loan and new_status='claim_rejected'),'Rejected claim loan history missing';
 sitting:=public.cgf_claim_committee_action('create',null,jsonb_build_object('claim_id',claim,'meeting_no',fixture||'-retry','recommended_amount',500));
 assert (select status='under_review' from public.claims where id=claim),'Reconsideration did not use a new sitting';
 perform public.cgf_claim_committee_action('cancel',sitting);
 assert (select status='cancelled' from public.claim_committee_sittings where id=sitting),'Cancellation failed';
end $$;
rollback;
select 'Claims committee regression passed; fixtures and flag changes rolled back' as result;
