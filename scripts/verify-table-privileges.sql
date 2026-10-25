begin;
do $$
declare
  target record;
  client_role text;
  privilege_name text;
  probe text := 'cgf_privilege_probe_' || replace(gen_random_uuid()::text, '-', '');
  affected integer;
begin
  for target in
    select c.oid, c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind in ('r','p')
  loop
    foreach client_role in array array['anon','authenticated'] loop
      foreach privilege_name in array array['TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'] loop
        assert not has_table_privilege(client_role,target.oid,privilege_name),
          format('%s retains %s on %s',client_role,privilege_name,target.relname);
      end loop;
    end loop;
    assert has_table_privilege('service_role',target.oid,'TRUNCATE'),
      format('Trusted service privilege changed on %s',target.relname);
  end loop;
  foreach privilege_name in array array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'] loop
    assert not has_table_privilege('anon','public.loan_applications',privilege_name),
      format('Anonymous loan privilege remains: %s',privilege_name);
  end loop;
  assert not exists (
    select 1 from pg_attribute a where a.attrelid='public.loan_applications'::regclass
    and a.attnum>0 and not a.attisdropped
    and (has_column_privilege('anon',a.attrelid,a.attnum,'SELECT')
      or has_column_privilege('anon',a.attrelid,a.attnum,'INSERT')
      or has_column_privilege('anon',a.attrelid,a.attnum,'UPDATE')
      or has_column_privilege('anon',a.attrelid,a.attnum,'REFERENCES'))
  ), 'Anonymous loan column privilege remains';
  foreach privilege_name in array array['SELECT','INSERT','UPDATE','DELETE'] loop
    assert has_table_privilege('authenticated','public.loan_applications',privilege_name),
      format('Authenticated loan privilege removed: %s',privilege_name);
  end loop;
  assert not has_table_privilege('authenticated','public.audit_trail','UPDATE')
    and not has_table_privilege('authenticated','public.audit_trail','DELETE'), 'Audit immutability grants regressed';
  assert not has_table_privilege('authenticated','public.committee_votes','INSERT')
    and not has_table_privilege('authenticated','public.committee_votes','UPDATE'), 'Committee direct-write restrictions regressed';

  execute 'set local role anon';
  begin
    perform id from public.loan_applications where false;
    raise exception 'Anonymous loan read permitted';
  exception when insufficient_privilege then null; end;
  begin
    update public.loan_applications set status=status where false;
    raise exception 'Anonymous loan update permitted';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.loan_applications where false;
    raise exception 'Anonymous loan delete permitted';
  exception when insufficient_privilege then null; end;
  execute 'reset role';

  execute format('create table public.%I (id integer)',probe);
  foreach client_role in array array['anon','authenticated'] loop
    foreach privilege_name in array array['TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'] loop
      assert not has_table_privilege(client_role,format('public.%I',probe),privilege_name),
        format('Unsafe postgres default: %s %s',client_role,privilege_name);
    end loop;
  end loop;
  assert not has_table_privilege('anon',format('public.%I',probe),'SELECT'), 'Anonymous read default remains';
  execute format('grant select, insert, update, delete on public.%I to authenticated',probe);
  execute format('insert into public.%I values (1)',probe);
  foreach client_role in array array['anon','authenticated'] loop
    execute format('set local role %I',client_role);
    begin
      execute format('truncate table public.%I',probe);
      raise exception '% truncated the disposable probe',client_role;
    exception when insufficient_privilege then null; end;
    execute 'reset role';
  end loop;
  execute 'set local role authenticated';
  execute format('insert into public.%I values (2)',probe);
  execute format('update public.%I set id=3 where id=2',probe);
  get diagnostics affected = row_count;
  assert affected=1, 'Authenticated update failed';
  execute format('delete from public.%I where id=3',probe);
  get diagnostics affected = row_count;
  assert affected=1, 'Authenticated delete failed';
  execute 'reset role';
  execute 'set local role service_role';
  execute format('truncate table public.%I',probe);
  execute 'reset role';
end $$;
rollback;
select 'table privilege regression passed; disposable probe and changes rolled back' as result;
