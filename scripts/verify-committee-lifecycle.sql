begin;
set local statement_timeout='30s';

create function pg_temp.committee_as(actor uuid, action text, meeting uuid, input jsonb default '{}'::jsonb) returns uuid
language plpgsql as $$
declare receipt uuid;
begin
 perform set_config('request.jwt.claim.sub',actor::text,true);
 perform set_config('request.jwt.claim.role','authenticated',true);
 execute 'set local role authenticated';
 receipt:=public.cgf_committee_action(action,meeting,input||jsonb_build_object('authority_reason','Rollback-only committee acceptance'));
 execute 'reset role';
 return receipt;
exception when others then execute 'reset role'; raise;
end $$;

do $$
declare
 admin_id uuid; loan uuid; bank uuid; borrower uuid; sitting uuid; next_sitting uuid; item uuid; member record; first_member uuid;
 expected integer; label text:='KKGQA_'||replace(gen_random_uuid()::text,'-',''); snapshot jsonb; denied integer:=0;
begin
 select p.id into admin_id from public.profiles p join public.roles r on r.id=p.role_id where p.is_active and r.is_active and p.bank_id is null and r.code='super_admin' and r.tier=1 limit 1;
 select bank_id,borrower_id into bank,borrower from public.loan_applications limit 1;
 select value::integer into expected from public.system_settings where key='committee_operations_members';
 assert admin_id is not null and bank is not null and expected in (2,3),'Acceptance parents or settings unavailable';
 assert (select count(*)>=expected from public.profiles p join public.roles r on r.id=p.role_id where p.is_active and r.is_active and p.bank_id is null and p.department='operations' and p.is_loan_committee_member and r.code in ('prsf_analyst','credit_risk_officer','compliance_officer')),'Insufficient already-configured real members; do not change staff flags for acceptance';
 perform set_config('request.jwt.claim.sub',admin_id::text,true);
 perform set_config('request.jwt.claim.role','authenticated',true);
 perform set_config('cgf.admin_reason','Rollback-only committee fixture staging',true);
 -- Skip intake only while staging a synthetic ready-for-committee loan; all committee assertions run with the real pipeline guard enabled.
 alter table public.loan_applications disable trigger cgf_pipeline_guard;
 insert into public.loan_applications(loan_request_id,bank_id,borrower_id,status,current_step,currency,approved_amount,guarantee_amount,guarantee_coverage)
 values(label,bank,borrower,'kkg_scheduled',7,'TJS',100,50,50) returning id into loan;
 alter table public.loan_applications enable trigger cgf_pipeline_guard;
 sitting:=pg_temp.committee_as(admin_id,'create',null,jsonb_build_object('loan_id',loan,'meeting_no',label));
 assert (select count(*)=expected and count(*) filter(where is_chair)=1 from public.committee_meeting_members where meeting_id=sitting),'System composition or senior chair failed';
 assert (select status='kkg_review' from public.loan_applications where id=loan),'Convening did not start review';
 assert (select due_at>now() from public.committee_meetings where id=sitting),'Working-day deadline missing';
 select id into item from public.committee_agenda_items where meeting_id=sitting;
 select member_id into first_member from public.committee_meeting_members where meeting_id=sitting order by member_id limit 1;
 begin perform pg_temp.committee_as(admin_id,'create',null,jsonb_build_object('loan_id',loan,'meeting_no',label||'-duplicate')); raise exception 'Duplicate open sitting accepted'; exception when check_violation then null; end;
 begin perform pg_temp.committee_as(first_member,'vote',sitting,jsonb_build_object('item_id',item,'vote','for')); raise exception 'Absent member voted'; exception when insufficient_privilege then null; end;
 begin perform pg_temp.committee_as(admin_id,'attendance',sitting,jsonb_build_object('member_id',first_member,'attended','true')); raise exception 'String attendance accepted'; exception when invalid_parameter_value then null; end;
 for member in select member_id from public.committee_meeting_members where meeting_id=sitting loop
  perform pg_temp.committee_as(admin_id,'attendance',sitting,jsonb_build_object('member_id',member.member_id,'attended',true));
 end loop;
 for member in select member_id from public.committee_meeting_members where meeting_id=sitting loop
  perform pg_temp.committee_as(member.member_id,'vote',sitting,jsonb_build_object('item_id',item,'vote',case when member.member_id=first_member then 'abstain' else 'for' end));
 end loop;
 begin perform pg_temp.committee_as(admin_id,'prepare',sitting,jsonb_build_object('protocol_no',label)); raise exception 'Abstention prepared protocol'; exception when check_violation then null; end;
 perform pg_temp.committee_as(first_member,'vote',sitting,jsonb_build_object('item_id',item,'vote','for'));
 assert (select count(*)=expected from public.committee_votes where agenda_item_id=item),'Repeated own vote duplicated a voter';
 perform set_config('request.jwt.claim.sub',admin_id::text,true);
 update public.loan_applications set status='verification' where id=loan;
 assert not exists(select 1 from public.committee_votes where agenda_item_id=item),'Verification did not invalidate prior votes';
 begin perform pg_temp.committee_as(first_member,'vote',sitting,jsonb_build_object('item_id',item,'vote','for')); raise exception 'Vote during verification accepted'; exception when check_violation then null; end;
 begin perform pg_temp.committee_as(admin_id,'prepare',sitting,jsonb_build_object('protocol_no',label)); raise exception 'Verification protocol prepared'; exception when check_violation then null; end;
 -- Only the verification evidence fixture is staged: a separate verification-authority acceptance suite owns that workflow.
 perform set_config('request.jwt.claim.sub',admin_id::text,true);
 insert into public.verifications(loan_id,assigned_to,status,outcome,authority_reason) values(loan,admin_id,'completed','confirmed','Rollback-only completed verification evidence');
 update public.loan_applications set status='kkg_review' where id=loan;
 for member in select member_id from public.committee_meeting_members where meeting_id=sitting loop
  perform pg_temp.committee_as(member.member_id,'vote',sitting,jsonb_build_object('item_id',item,'vote','against'));
 end loop;
 perform pg_temp.committee_as(admin_id,'prepare',sitting,jsonb_build_object('protocol_no',label,'notes','Unanimous rejection acceptance'));
 select protocol_snapshot into snapshot from public.committee_meetings where id=sitting;
 assert snapshot->'items'->0->'loan_terms'->>'loan_id'=loan::text,'Frozen loan evidence missing';
 begin update public.committee_meetings set protocol_notes='tampered' where id=sitting; raise exception 'Frozen protocol text changed'; exception when check_violation then null; end;
 begin perform pg_temp.committee_as(first_member,'vote',sitting,jsonb_build_object('item_id',item,'vote','for')); raise exception 'Frozen vote changed'; exception when check_violation then null; end;
 begin perform pg_temp.committee_as(admin_id,'issue',sitting); raise exception 'Unsigned issue accepted'; exception when check_violation then null; end;
 perform set_config('request.jwt.claim.sub',admin_id::text,true);
 begin update public.loan_applications set status='verification' where id=loan; raise exception 'Frozen protocol returned for verification'; exception when check_violation then null; end;
 for member in select member_id from public.committee_meeting_members where meeting_id=sitting loop
  perform pg_temp.committee_as(member.member_id,'sign',sitting);
 end loop;
 perform pg_temp.committee_as(admin_id,'issue',sitting);
 assert (select status='closed' and protocol_snapshot=snapshot from public.committee_meetings where id=sitting),'Issue changed frozen protocol or failed to close';
 assert (select status='rejected' from public.loan_applications where id=loan),'Signed rejection did not change loan';
 begin perform pg_temp.committee_as(admin_id,'cancel',sitting); raise exception 'Closed sitting mutated'; exception when check_violation then null; end;
 next_sitting:=pg_temp.committee_as(admin_id,'create',null,jsonb_build_object('loan_id',loan,'meeting_no',label||'-reconsider'));
 assert next_sitting<>sitting and (select status='kkg_review' from public.loan_applications where id=loan),'New-sitting reconsideration failed';
 assert not exists(select 1 from public.committee_votes v join public.committee_agenda_items i on i.id=v.agenda_item_id where i.meeting_id=next_sitting),'Reconsideration reused old votes';
 select id into item from public.committee_agenda_items where meeting_id=next_sitting;
 select member_id into first_member from public.committee_meeting_members where meeting_id=next_sitting order by member_id limit 1;
 perform set_config('request.jwt.claim.sub',admin_id::text,true);
 execute 'set local role authenticated';
 perform public.cgf_assume_committee_seat(false,next_sitting,first_member,'Rollback-only one-seat authority acceptance');
 execute 'reset role';
 begin
  execute 'set local role authenticated';
  perform public.cgf_assume_committee_seat(false,next_sitting,(select member_id from public.committee_meeting_members where meeting_id=next_sitting and member_id<>admin_id limit 1),'Rollback-only second-seat denial');
  raise exception 'Administrator took two seats';
 exception when check_violation then execute 'reset role'; end;
 for member in select member_id from public.committee_meeting_members where meeting_id=next_sitting loop
  perform pg_temp.committee_as(admin_id,'attendance',next_sitting,jsonb_build_object('member_id',member.member_id,'attended',true));
  perform pg_temp.committee_as(member.member_id,'vote',next_sitting,jsonb_build_object('item_id',item,'vote','for'));
 end loop;
 perform pg_temp.committee_as(admin_id,'prepare',next_sitting,jsonb_build_object('protocol_no',label||'-approve'));
 for member in select member_id from public.committee_meeting_members where meeting_id=next_sitting loop perform pg_temp.committee_as(member.member_id,'sign',next_sitting); end loop;
 perform pg_temp.committee_as(admin_id,'issue',next_sitting);
 assert (select status='kkg_protocol' from public.loan_applications where id=loan),'Signed approval failed';
 assert (select count(*)=2 from public.audit_trail where record_id in (sitting,next_sitting) and action='COMMITTEE_ISSUE'),'Exact attributed issue audits missing';
 assert exists(select 1 from public.loan_application_history where loan_id=loan and new_status='kkg_protocol'),'Approval history missing';
 for member in select p.id,r.code from public.profiles p join public.roles r on r.id=p.role_id where p.is_active and r.is_active and r.code in ('prsf_admin','auditor','bank_admin','bank_officer','legal_officer','accountant','reporting_officer','business_development','deputy_director') loop
  begin perform pg_temp.committee_as(member.id,'create',null,jsonb_build_object('loan_id',loan,'meeting_no',label)); raise exception 'Unauthorized % convened a sitting',member.code; exception when insufficient_privilege then denied:=denied+1; end;
 end loop;
 assert denied>0,'No negative-role identities checked';
 assert not has_table_privilege('authenticated','public.committee_votes','INSERT') and not has_table_privilege('authenticated','public.committee_meetings','TRUNCATE') and not has_table_privilege('anon','public.committee_meetings','SELECT'),'Committee grant regression';
end $$;

rollback;
select 'Committee acceptance passed: composition, attendance, verification invalidation, unanimity, frozen evidence, signatures, rejection, new-sitting reconsideration, approval, one-seat authority, role denials and grants; all fixtures rolled back' as result;
