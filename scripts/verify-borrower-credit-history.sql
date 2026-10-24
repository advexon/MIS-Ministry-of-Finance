begin;
do $$
declare
  actor uuid; bank_user uuid; bank_a uuid; bank_b uuid; fund_role uuid;
  borrower uuid; empty_borrower uuid; loan_a uuid; loan_b uuid;
  role_row record; fund_reader boolean; result jsonb;
  fixture text := 'CREDIT-HISTORY-' || left(gen_random_uuid()::text, 20);
begin
  select p.id, r.id into actor, fund_role from public.profiles p join public.roles r on r.id=p.role_id
    where p.is_active and r.is_active and r.code='super_admin' limit 1;
  select p.id,p.bank_id into bank_user,bank_a from public.profiles p join public.roles r on r.id=p.role_id
    where p.is_active and r.is_active and r.code in ('bank_admin','bank_officer') and p.bank_id is not null limit 1;
  select id into bank_b from public.banks where id<>bank_a limit 1;
  assert actor is not null and bank_user is not null and bank_b is not null, 'Required regression actors unavailable';
  perform set_config('request.jwt.claim.sub','',true);
  insert into public.borrowers(name,legal_type) values(fixture,'llc') returning id into borrower;
  insert into public.borrowers(name,legal_type) values(fixture||'-EMPTY','llc') returning id into empty_borrower;
  perform set_config('request.jwt.claim.sub',bank_user::text,true);
  insert into public.loan_applications(loan_request_id,bank_id,borrower_id,status,currency,approved_amount,created_at)
    values(fixture||'-A',bank_a,borrower,'draft','TJS',0,'2026-01-01') returning id into loan_a;
  update public.profiles set bank_id=bank_b where id=bank_user;
  insert into public.loan_applications(loan_request_id,bank_id,borrower_id,status,currency,created_at)
    values(fixture||'-B',bank_b,borrower,'draft','USD','2026-01-02') returning id into loan_b;
  update public.profiles set bank_id=bank_a where id=bank_user;

  for role_row in select id,code from public.roles where is_active loop
    perform set_config('request.jwt.claim.sub','',true);
    update public.profiles set role_id=role_row.id,bank_id=bank_a where id=actor;
    perform set_config('request.jwt.claim.sub',actor::text,true);
    execute 'set local role authenticated';
    fund_reader := role_row.code in ('super_admin','prsf_admin','prsf_analyst','auditor',
      'credit_risk_officer','compliance_officer','fkg_management','deputy_director',
      'accountant','reporting_officer','business_development');
    if fund_reader then
      result := public.cgf_borrower_credit_history(borrower);
      assert (result->>'total')::integer=2 and jsonb_array_length(result->'items')=2, format('Cross-bank history unavailable to %s',role_row.code);
      assert result#>>'{items,0,id}'=loan_b::text, 'History chronology incorrect';
      assert result#>'{items,0,approved_amount}'='null'::jsonb, 'Null amount coerced';
      assert (result#>>'{items,1,approved_amount}')::numeric=0, 'Zero amount coerced';
      assert not ((result#>'{items,0}') ? 'notes'), 'Unnecessary application notes returned';
    else
      begin
        perform public.cgf_borrower_credit_history(borrower);
        raise exception 'Restricted role % read credit history',role_row.code;
      exception when insufficient_privilege then null; end;
      begin
        perform public.cgf_borrower_credit_history(gen_random_uuid());
        raise exception 'Restricted role probed a borrower';
      exception when insufficient_privilege then null; end;
    end if;
    if role_row.code in ('bank_admin','bank_officer') then
      assert exists(select 1 from public.loan_applications where id=loan_a), 'Own-bank loan access regressed';
      assert not exists(select 1 from public.loan_applications where id=loan_b), 'Other bank loan leaked';
    end if;
    execute 'reset role';
  end loop;

  perform set_config('request.jwt.claim.sub','',true);
  update public.profiles set role_id=fund_role where id=actor;
  perform set_config('request.jwt.claim.sub',actor::text,true);
  execute 'set local role authenticated';
  result := public.cgf_borrower_credit_history(borrower,1,1);
  assert (result->>'total')::integer=2 and jsonb_array_length(result->'items')=1 and result#>>'{items,0,id}'=loan_a::text, 'Pagination failed';
  result := public.cgf_borrower_credit_history(borrower,1,2);
  assert result->'items'='[]'::jsonb and result->>'total'='2', 'Past-end pagination failed';
  assert public.cgf_borrower_credit_history(empty_borrower)='{"items":[],"total":0}'::jsonb, 'Empty borrower history failed';
  assert public.cgf_borrower_credit_history(gen_random_uuid())='{"items":[],"total":0}'::jsonb, 'Unknown borrower history failed';
  begin perform public.cgf_borrower_credit_history(null); raise exception 'Null borrower accepted'; exception when invalid_parameter_value then null; end;
  begin perform public.cgf_borrower_credit_history(borrower,0); raise exception 'Zero limit accepted'; exception when invalid_parameter_value then null; end;
  begin perform public.cgf_borrower_credit_history(borrower,51); raise exception 'Oversized limit accepted'; exception when invalid_parameter_value then null; end;
  begin perform public.cgf_borrower_credit_history(borrower,null); raise exception 'Null limit accepted'; exception when invalid_parameter_value then null; end;
  begin perform public.cgf_borrower_credit_history(borrower,20,-1); raise exception 'Negative offset accepted'; exception when invalid_parameter_value then null; end;
  begin perform public.cgf_borrower_credit_history(borrower,20,null); raise exception 'Null offset accepted'; exception when invalid_parameter_value then null; end;
  execute 'reset role';

  perform set_config('request.jwt.claim.sub','',true);
  update public.profiles set is_active=false where id=actor;
  perform set_config('request.jwt.claim.sub',actor::text,true);
  execute 'set local role authenticated';
  begin perform public.cgf_borrower_credit_history(borrower); raise exception 'Inactive user read history'; exception when insufficient_privilege then null; end;
  execute 'reset role';
  perform set_config('request.jwt.claim.sub','',true);
  update public.profiles set is_active=true where id=actor;
  update public.roles set is_active=false where id=fund_role;
  perform set_config('request.jwt.claim.sub',actor::text,true);
  execute 'set local role authenticated';
  begin perform public.cgf_borrower_credit_history(borrower); raise exception 'Inactive role read history'; exception when insufficient_privilege then null; end;
  execute 'reset role';
  perform set_config('request.jwt.claim.sub','',true);
  execute 'set local role authenticated';
  begin perform public.cgf_borrower_credit_history(borrower); raise exception 'Missing identity read history'; exception when insufficient_privilege then null; end;
  execute 'reset role';
  execute 'set local role anon';
  begin perform public.cgf_borrower_credit_history(borrower); raise exception 'Anonymous caller read history'; exception when insufficient_privilege then null; end;
  execute 'reset role';
  execute 'set local role service_role';
  begin perform public.cgf_borrower_credit_history(borrower); raise exception 'Service role received unnecessary history RPC access'; exception when insufficient_privilege then null; end;
  execute 'reset role';
  assert not (select prosecdef from pg_proc where oid='public.cgf_borrower_credit_history(uuid,integer,integer)'::regprocedure), 'History function bypasses RLS';
end $$;
rollback;
select 'borrower credit-history regression passed; all fixtures and temporary account changes rolled back' as result;
