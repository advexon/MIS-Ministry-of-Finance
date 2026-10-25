begin;
do $$
declare
  bank_user uuid; auditor uuid; writer uuid; analyst uuid;
  bank_a uuid; bank_b uuid; borrower uuid; loan_a uuid; loan_b uuid;
  claim_a uuid; claim_b uuid; fee_a uuid; fee_b uuid; recovery_a uuid; recovery_b uuid;
  history_a uuid; history_b uuid; changed integer;
  fixture text := 'ISOLATION-' || left(gen_random_uuid()::text, 24);
begin
  select p.id,p.bank_id into bank_user,bank_a from public.profiles p join public.roles r on r.id=p.role_id
    where p.is_active and r.is_active and r.code in ('bank_admin','bank_officer') and p.bank_id is not null limit 1;
  select id into bank_b from public.banks where id<>bank_a limit 1;
  select borrower_id into borrower from public.loan_applications limit 1;
  select p.id into auditor from public.profiles p join public.roles r on r.id=p.role_id where p.is_active and r.is_active and r.code='auditor' limit 1;
  select p.id into writer from public.profiles p join public.roles r on r.id=p.role_id where p.is_active and r.is_active and r.code='super_admin' limit 1;
  select p.id into analyst from public.profiles p join public.roles r on r.id=p.role_id where p.is_active and r.is_active and r.code='prsf_analyst' limit 1;
  assert bank_user is not null and bank_b is not null and borrower is not null and auditor is not null and writer is not null and analyst is not null, 'Required regression actors unavailable';

  perform set_config('request.jwt.claim.sub',bank_user::text,true);
  insert into public.loan_applications(loan_request_id,bank_id,borrower_id,status,currency)
    values(fixture||'-A',bank_a,borrower,'draft','TJS') returning id into loan_a;
  update public.profiles set bank_id=bank_b where id=bank_user;
  insert into public.loan_applications(loan_request_id,bank_id,borrower_id,status,currency)
    values(fixture||'-B',bank_b,borrower,'draft','TJS') returning id into loan_b;
  update public.profiles set bank_id=bank_a where id=bank_user;
  perform set_config('request.jwt.claim.sub','',true);
  insert into public.claims(loan_id,loan_application_id,bank_id,claim_amount,claim_date,status)
    values(loan_a,loan_a,bank_a,100,current_date,'pending') returning id into claim_a;
  insert into public.claims(loan_id,loan_application_id,bank_id,claim_amount,claim_date,status)
    values(loan_b,loan_b,bank_b,100,current_date,'pending') returning id into claim_b;
  insert into public.fees(loan_id,loan_application_id,bank_id,fee_type,amount,due_date)
    values(loan_a,loan_a,bank_a,'upfront',10,current_date) returning id into fee_a;
  insert into public.fees(loan_id,loan_application_id,bank_id,fee_type,amount,due_date)
    values(loan_b,loan_b,bank_b,'upfront',10,current_date) returning id into fee_b;
  insert into public.recoveries(claim_id,loan_id,loan_application_id,recovery_amount,recovery_date)
    values(claim_a,loan_a,loan_a,10,current_date) returning id into recovery_a;
  insert into public.recoveries(claim_id,loan_id,loan_application_id,recovery_amount,recovery_date)
    values(claim_b,loan_b,loan_b,10,current_date) returning id into recovery_b;
  insert into public.loan_application_history(loan_id,action,notes) values(loan_a,'regression',fixture) returning id into history_a;
  insert into public.loan_application_history(loan_id,action,notes) values(loan_b,'regression',fixture) returning id into history_b;

  perform set_config('request.jwt.claim.sub',bank_user::text,true);
  execute 'set local role authenticated';
  assert (select count(*)=1 from public.fees where id in(fee_a,fee_b)), 'Bank fee isolation failed';
  assert exists(select 1 from public.fees where id=fee_a), 'Own bank fee hidden';
  assert not exists(select 1 from public.fees where id=fee_b), 'Other bank fee visible by ID';
  assert exists(select 1 from public.recoveries where id=recovery_a), 'Own bank recovery hidden';
  assert not exists(select 1 from public.recoveries where id=recovery_b), 'Other bank recovery visible';
  assert exists(select 1 from public.loan_application_history where id=history_a), 'Own loan history hidden';
  assert not exists(select 1 from public.loan_application_history where id=history_b), 'Other bank history visible';
  update public.fees set amount=999 where id in(fee_a,fee_b);
  get diagnostics changed=row_count;
  assert changed=0, 'Bank modified financial ledger';
  begin
    insert into public.fees(loan_id,bank_id,fee_type,amount,due_date) values(loan_b,bank_b,'upfront',999,current_date);
    raise exception 'Bank inserted financial record';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.recoveries(claim_id,loan_id,recovery_amount,recovery_date) values(claim_b,loan_b,999,current_date);
    raise exception 'Bank inserted recovery';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.loan_application_history(loan_id,action,performed_by) values(loan_a,'forged',writer);
    raise exception 'Bank forged history';
  exception when insufficient_privilege then null; end;
  execute 'reset role';
  assert (select bool_and(amount=10) from public.fees where id in(fee_a,fee_b)), 'Denied write changed fee';

  perform set_config('request.jwt.claim.sub',auditor::text,true);
  execute 'set local role authenticated';
  assert (select count(*)=2 from public.fees where id in(fee_a,fee_b)), 'Auditor fees unavailable';
  assert (select count(*)=2 from public.recoveries where id in(recovery_a,recovery_b)), 'Auditor recoveries unavailable';
  assert (select count(*)=2 from public.loan_application_history where id in(history_a,history_b)), 'Auditor history unavailable';
  update public.fees set amount=999 where id=fee_a;
  get diagnostics changed=row_count;
  assert changed=0, 'Auditor changed fees';
  execute 'reset role';

  perform set_config('request.jwt.claim.sub',analyst::text,true);
  execute 'set local role authenticated';
  begin
    insert into public.fees(loan_id,bank_id,fee_type,amount,due_date) values(loan_a,bank_a,'upfront',999,current_date);
    raise exception 'Analyst wrote financial record';
  exception when insufficient_privilege then null; end;
  execute 'reset role';

  perform set_config('request.jwt.claim.sub',writer::text,true);
  execute 'set local role authenticated';
  update public.fees set amount=20 where id=fee_a;
  get diagnostics changed=row_count;
  assert changed=1, 'Authorized financial writer matched no rows';
  assert (select amount=20 from public.fees where id=fee_a), 'Authorized fee update not persisted';
  begin
    update public.fees set bank_id=bank_b where id=fee_a;
    raise exception 'Mismatched fee bank accepted';
  exception when insufficient_privilege then null; end;
  begin
    update public.fees set loan_application_id=loan_b where id=fee_a;
    raise exception 'Mismatched fee alias accepted';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.recoveries(claim_id,loan_id,recovery_amount,recovery_date) values(claim_a,loan_b,999,current_date);
    raise exception 'Mismatched claim loan accepted';
  exception when insufficient_privilege then null; end;
  insert into public.fees(loan_id,loan_application_id,bank_id,fee_type,amount,due_date)
    values(loan_a,loan_a,bank_a,'upfront',1,current_date);
  insert into public.recoveries(claim_id,loan_id,loan_application_id,recovery_amount,recovery_date)
    values(claim_a,loan_a,loan_a,1,current_date);
  begin
    delete from public.fees where id=fee_a;
    raise exception 'Ledger deletion accepted';
  exception when insufficient_privilege then null; end;
  begin
    update public.loan_application_history set notes='forged' where id=history_a;
    raise exception 'History mutation accepted';
  exception when insufficient_privilege then null; end;
  execute 'reset role';
  assert (select bank_id=bank_a and loan_application_id=loan_a and amount=20 from public.fees where id=fee_a), 'Denied retargeting corrupted fee';
  assert (select notes=fixture from public.loan_application_history where id=history_a), 'Denied history mutation changed row';

  perform set_config('request.jwt.claim.sub','',true);
  update public.profiles set is_active=false where id=bank_user;
  perform set_config('request.jwt.claim.sub',bank_user::text,true);
  execute 'set local role authenticated';
  assert public.current_user_bank_id() is null, 'Inactive bank affiliation retained';
  assert not exists(select 1 from public.fees where id in(fee_a,fee_b)), 'Inactive user read fees';
  assert not exists(select 1 from public.recoveries where id in(recovery_a,recovery_b)), 'Inactive user read recoveries';
  assert not exists(select 1 from public.loan_application_history where id in(history_a,history_b)), 'Inactive user read history';
  execute 'reset role';
  perform set_config('request.jwt.claim.sub','',true);
  execute 'set local role anon';
  begin
    perform id from public.fees limit 1;
    raise exception 'Anonymous fee read accepted';
  exception when insufficient_privilege then null; end;
  begin
    perform id from public.recoveries limit 1;
    raise exception 'Anonymous recovery read accepted';
  exception when insufficient_privilege then null; end;
  begin
    perform id from public.loan_application_history limit 1;
    raise exception 'Anonymous history read accepted';
  exception when insufficient_privilege then null; end;
  execute 'reset role';
end $$;
rollback;
select 'financial/history RLS regression passed; all fixtures and profile changes rolled back' as result;
