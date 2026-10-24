BEGIN;
DO $test$
DECLARE
  actor uuid; bank uuid; report uuid := gen_random_uuid(); event uuid; role_record record; visible boolean;
  statement text; changed integer; original_events integer;
  fixture text := 'AUDIT-REPORT-' || left(gen_random_uuid()::text,12);
BEGIN
  SELECT p.id,p.bank_id INTO actor,bank FROM public.profiles p JOIN public.roles r ON r.id=p.role_id
    WHERE p.is_active AND r.is_active AND r.code IN ('bank_admin','bank_officer') AND p.bank_id IS NOT NULL LIMIT 1;
  ASSERT actor IS NOT NULL AND bank IS NOT NULL, 'Missing bank regression actor';
  PERFORM set_config('request.jwt.claim.role','authenticated',true);
  PERFORM set_config('request.jwt.claim.sub',actor::text,true);
  INSERT INTO public.guarantee_reports(id,bank_id,report_month) VALUES(report,bank,'2198-01-01');
  SELECT id INTO event FROM public.guarantee_report_audit WHERE report_id=report;
  ASSERT event IS NOT NULL, 'Report creation did not append audit';
  SELECT count(*) INTO original_events FROM public.guarantee_report_audit WHERE report_id=report;
  FOR role_record IN SELECT id,code FROM public.roles WHERE is_active LOOP
    UPDATE public.profiles SET role_id=role_record.id WHERE id=actor;
    visible := role_record.code NOT IN ('bank_admin','bank_officer','legal_officer');
    EXECUTE 'set local role authenticated';
    ASSERT (SELECT count(*) FROM public.guarantee_report_audit WHERE id=event)=CASE WHEN visible THEN 1 ELSE 0 END,
      'Incorrect report audit role visibility';
    FOREACH statement IN ARRAY ARRAY[
      format('INSERT INTO public.guarantee_report_audit(report_id,action) VALUES(%L,''forged'')',report),
      format('UPDATE public.guarantee_report_audit SET action=''forged'' WHERE id=%L',event),
      format('DELETE FROM public.guarantee_report_audit WHERE id=%L',event),
      'TRUNCATE public.guarantee_report_audit'
    ] LOOP
      BEGIN
        EXECUTE statement;
        RAISE EXCEPTION 'Client audit mutation accepted: %',role_record.code;
      EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    END LOOP;
    EXECUTE 'reset role';
    ASSERT EXISTS(SELECT 1 FROM public.guarantee_report_audit WHERE id=event AND action='create'), 'Denied write altered audit';
  END LOOP;
  UPDATE public.profiles SET is_active=false WHERE id=actor;
  EXECUTE 'set local role authenticated';
  ASSERT NOT EXISTS(SELECT 1 FROM public.guarantee_report_audit WHERE id=event), 'Inactive actor reads audit';
  EXECUTE 'reset role';
  UPDATE public.profiles SET is_active=true WHERE id=actor;
  PERFORM set_config('request.jwt.claim.sub','',true);
  EXECUTE 'set local role authenticated';
  ASSERT NOT EXISTS(SELECT 1 FROM public.guarantee_report_audit WHERE id=event), 'Missing identity reads audit';
  EXECUTE 'reset role';
  EXECUTE 'set local role anon';
  BEGIN
    PERFORM id FROM public.guarantee_report_audit WHERE id=event;
    RAISE EXCEPTION 'Anonymous audit read accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  EXECUTE 'reset role';

  -- Trusted retention/deletion authority is unchanged; no authenticated delete policy is introduced.
  EXECUTE 'set local role service_role';
  DELETE FROM public.guarantee_reports WHERE id=report;
  GET DIAGNOSTICS changed=ROW_COUNT;
  ASSERT changed=1, 'Trusted report deletion matched no row';
  EXECUTE 'reset role';
  ASSERT NOT EXISTS(SELECT 1 FROM public.guarantee_reports WHERE id=report), 'Trusted deletion not committed';
  ASSERT (SELECT count(*)=original_events+1 FROM public.guarantee_report_audit WHERE report_id=report), 'Delete lost prior audit events';
  ASSERT EXISTS(SELECT 1 FROM public.guarantee_report_audit WHERE report_id=report AND action='delete'
    AND performed_by IS NULL AND changes->>'id'=report::text AND changes->>'bank_id'=bank::text), 'Deleted report snapshot missing';
  ASSERT NOT has_table_privilege('anon','public.guarantee_report_audit','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'), 'Anonymous grant remains';
  ASSERT NOT has_table_privilege('authenticated','public.guarantee_report_audit','INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'), 'Client write grant remains';
END;
$test$;
ROLLBACK;
SELECT 'Report audit integrity checks passed across active roles; all fixtures and profile changes rolled back.' AS result;
