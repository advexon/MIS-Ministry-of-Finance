begin;
do $$
declare
  actor uuid;
  other_actor uuid;
  fixture uuid;
  appended uuid;
  role_row record;
  fund_reader boolean;
  visible boolean;
begin
  select p.id into actor from public.profiles p join public.roles r on r.id=p.role_id
    where p.is_active and r.is_active and r.code='super_admin' limit 1;
  select id into other_actor from public.profiles where id<>actor limit 1;
  assert actor is not null and other_actor is not null, 'Required regression actors unavailable';
  insert into public.audit_trail(table_name,action,changed_by,new_data)
    values('audit_integrity_regression','VERIFY',actor,'{"fixture":true}') returning id into fixture;

  for role_row in select id,code from public.roles where is_active loop
    perform set_config('request.jwt.claim.sub','',true);
    update public.profiles set role_id=role_row.id where id=actor;
    perform set_config('request.jwt.claim.sub',actor::text,true);
    execute 'set local role authenticated';
    fund_reader := role_row.code in ('super_admin','prsf_admin','prsf_analyst','auditor',
      'credit_risk_officer','compliance_officer','fkg_management','deputy_director',
      'accountant','reporting_officer','business_development');
    select exists(select 1 from public.audit_trail where id=fixture) into visible;
    assert visible=fund_reader, format('Audit read boundary failed for %s',role_row.code);

    if role_row.code='auditor' then
      begin
        insert into public.audit_trail(table_name,action,changed_by) values('audit_integrity_regression','FORGED',actor);
        raise exception 'Auditor appended audit event';
      exception when insufficient_privilege then null; end;
    else
      insert into public.audit_trail(table_name,action,changed_by)
        values('audit_integrity_regression','APPEND',actor);
    end if;
    begin
      insert into public.audit_trail(table_name,action,changed_by) values('audit_integrity_regression','FORGED',other_actor);
      raise exception 'Audit actor impersonation accepted for %',role_row.code;
    exception when insufficient_privilege then null; end;
    begin
      insert into public.audit_trail(table_name,action) values('audit_integrity_regression','FORGED');
      raise exception 'Missing audit actor accepted for %',role_row.code;
    exception when insufficient_privilege then null; end;
    begin
      update public.audit_trail set action='FORGED' where id=fixture;
      raise exception 'Audit update accepted for %',role_row.code;
    exception when insufficient_privilege then null; end;
    begin
      delete from public.audit_trail where id=fixture;
      raise exception 'Audit delete accepted for %',role_row.code;
    exception when insufficient_privilege then null; end;
    assert not has_table_privilege('authenticated','public.audit_trail','TRUNCATE'), 'Audit truncate grant retained';
    assert not has_table_privilege('authenticated','public.audit_trail','TRIGGER'), 'Audit trigger grant retained';
    assert not has_table_privilege('authenticated','public.audit_trail','REFERENCES'), 'Audit reference grant retained';
    execute 'reset role';
    assert (select action='VERIFY' and changed_by=actor from public.audit_trail where id=fixture), 'Denied audit mutation changed fixture';
  end loop;

  perform set_config('request.jwt.claim.sub','',true);
  update public.profiles set is_active=false where id=actor;
  perform set_config('request.jwt.claim.sub',actor::text,true);
  execute 'set local role authenticated';
  assert not exists(select 1 from public.audit_trail where id=fixture), 'Inactive user read audit';
  begin
    insert into public.audit_trail(table_name,action,changed_by) values('audit_integrity_regression','FORGED',actor);
    raise exception 'Inactive user appended audit';
  exception when insufficient_privilege then null; end;
  execute 'reset role';

  perform set_config('request.jwt.claim.sub','',true);
  update public.profiles set is_active=true where id=actor;
  update public.roles set is_active=false where id=role_row.id;
  perform set_config('request.jwt.claim.sub',actor::text,true);
  execute 'set local role authenticated';
  assert not exists(select 1 from public.audit_trail where id=fixture), 'Inactive role read audit';
  begin
    insert into public.audit_trail(table_name,action,changed_by) values('audit_integrity_regression','FORGED',actor);
    raise exception 'Inactive role appended audit';
  exception when insufficient_privilege then null; end;
  execute 'reset role';

  perform set_config('request.jwt.claim.sub','',true);
  execute 'set local role anon';
  begin
    perform id from public.audit_trail where id=fixture;
    raise exception 'Anonymous audit read accepted';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.audit_trail(table_name,action) values('audit_integrity_regression','FORGED');
    raise exception 'Anonymous audit append accepted';
  exception when insufficient_privilege then null; end;
  begin
    update public.audit_trail set action='FORGED' where id=fixture;
    raise exception 'Anonymous audit update accepted';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.audit_trail where id=fixture;
    raise exception 'Anonymous audit delete accepted';
  exception when insufficient_privilege then null; end;
  assert not has_table_privilege('anon','public.audit_trail','TRUNCATE'), 'Anonymous truncate grant retained';
  execute 'reset role';

  execute 'set local role service_role';
  insert into public.audit_trail(table_name,action,changed_by)
    values('audit_integrity_regression','SERVER_APPEND',other_actor) returning id into appended;
  execute 'reset role';
  assert exists(select 1 from public.audit_trail where id=appended and action='SERVER_APPEND'), 'Trusted server append failed';
  assert (select action='VERIFY' from public.audit_trail where id=fixture), 'Fixture corrupted';
end $$;
rollback;
select 'audit integrity regression passed across all active role codes; fixtures and account changes rolled back' as result;
