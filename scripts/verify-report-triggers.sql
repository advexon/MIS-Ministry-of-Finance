BEGIN;
DO $test$
DECLARE
  actor uuid;
  bank_user uuid;
  admin_role uuid;
  bank_role uuid;
  fixture_bank uuid := gen_random_uuid();
  other_bank uuid := gen_random_uuid();
  report uuid;
  report_link text;
  outcome text;
  expected integer;
  before_count integer;
  audit_count integer;
  signature text;
BEGIN
  SELECT p.id INTO actor FROM public.profiles p JOIN public.roles r ON r.id=p.role_id
    WHERE p.is_active IS TRUE AND r.is_active IS TRUE AND r.code IN ('super_admin','prsf_admin') LIMIT 1;
  SELECT p.id INTO bank_user FROM public.profiles p JOIN public.roles r ON r.id=p.role_id
    WHERE p.is_active IS TRUE AND r.is_active IS TRUE AND r.code IN ('bank_admin','bank_officer') LIMIT 1;
  SELECT id INTO admin_role FROM public.roles WHERE code='prsf_admin' AND is_active IS TRUE;
  SELECT id INTO bank_role FROM public.roles WHERE code='bank_officer' AND is_active IS TRUE;
  ASSERT actor IS NOT NULL AND bank_user IS NOT NULL AND admin_role IS NOT NULL AND bank_role IS NOT NULL,
    'Required regression actors unavailable';

  -- Existing identities are reassigned only inside this rolled-back transaction; no Auth users are created.
  INSERT INTO public.banks(id,code,name_en) VALUES
    (fixture_bank,'RT-'||left(fixture_bank::text,12),'Disposable report-trigger regression'),
    (other_bank,'RT-'||left(other_bank::text,12),'Disposable report-trigger regression other');
  UPDATE public.profiles p SET bank_id=other_bank, role_id=admin_role WHERE p.id=actor;
  UPDATE public.profiles p SET bank_id=fixture_bank, role_id=bank_role WHERE p.id=bank_user;

  PERFORM set_config('request.jwt.claim.role','authenticated',true);
  FOREACH outcome IN ARRAY ARRAY['approved','rejected','revision_requested'] LOOP
    report := gen_random_uuid();
    report_link := '/dashboard/guarantee-reports/'||report::text;
    PERFORM set_config('request.jwt.claim.sub',bank_user::text,true);
    EXECUTE 'set local role authenticated';
    INSERT INTO public.guarantee_reports(id,bank_id,report_month,submitted_by)
      VALUES(report,fixture_bank,CASE outcome WHEN 'approved' THEN '2099-01-01'::date WHEN 'rejected' THEN '2099-02-01'::date ELSE '2099-03-01'::date END,actor);
    UPDATE public.guarantee_reports SET total_loans=0,total_outstanding_principal=NULL WHERE id=report;
    EXECUTE 'reset role';
    ASSERT (SELECT count(*)=2 FROM public.guarantee_report_audit WHERE report_id=report AND performed_by=bank_user),
      'Create/update audit actor must come from auth.uid(), not supplied submitted_by';
    ASSERT NOT EXISTS(SELECT 1 FROM public.notifications n WHERE n.link=report_link), 'Draft edits emitted notifications';
    ASSERT EXISTS(SELECT 1 FROM public.guarantee_report_audit WHERE report_id=report AND action='update'
      AND changes#>'{new,total_outstanding_principal}'='null'::jsonb AND (changes#>>'{new,total_loans}')::integer=0),
      'Audit lost zero/null report amounts';

    EXECUTE 'set local role authenticated';
    UPDATE public.guarantee_reports SET status='submitted',submission_date=now() WHERE id=report;
    GET DIAGNOSTICS expected=ROW_COUNT;
    ASSERT expected=1, 'Authenticated bank submission did not update one report';
    EXECUTE 'reset role';
    ASSERT (SELECT status='submitted' FROM public.guarantee_reports WHERE id=report),
      'Bank submission did not persist the submitted status';
    ASSERT EXISTS(SELECT 1 FROM public.guarantee_report_audit WHERE report_id=report
      AND old_status='draft' AND new_status='submitted' AND performed_by=bank_user),
      'Bank submission audit actor/status incorrect';
    SELECT count(*) INTO expected FROM public.profiles p JOIN public.roles r ON r.id=p.role_id
      WHERE p.is_active IS TRUE AND r.is_active IS TRUE AND r.code IN ('prsf_admin','prsf_analyst');
    ASSERT (SELECT count(*)=expected FROM public.notifications n WHERE n.link=report_link AND n.type='info'),
      'Submission recipient count incorrect';
    ASSERT NOT EXISTS(SELECT 1 FROM public.notifications n JOIN public.profiles p ON p.id=n.user_id
      JOIN public.roles r ON r.id=p.role_id WHERE n.link=report_link
      AND (p.is_active IS DISTINCT FROM TRUE OR r.is_active IS DISTINCT FROM TRUE OR r.code NOT IN ('prsf_admin','prsf_analyst'))),
      'Submission notified an ineligible recipient';
    ASSERT EXISTS(SELECT 1 FROM public.notifications n WHERE n.link=report_link AND n.user_id=actor
      AND n.message LIKE 'Disposable report-trigger regression submitted a guarantee report for %'),
      'Submission bank name or recipient missing';

    PERFORM set_config('request.jwt.claim.sub',actor::text,true);
    EXECUTE 'set local role authenticated';
    UPDATE public.guarantee_reports SET status='under_review' WHERE id=report;
    UPDATE public.guarantee_reports SET status=outcome,review_notes='Regression review note',reviewed_by=bank_user WHERE id=report;
    EXECUTE 'reset role';
    ASSERT (SELECT count(*)=1 FROM public.notifications n WHERE n.link=report_link AND n.user_id=bank_user
      AND n.type=CASE outcome WHEN 'approved' THEN 'success' WHEN 'rejected' THEN 'error' ELSE 'warning' END
      AND n.message LIKE '%. Note: Regression review note'), 'Review notification missing or malformed';
    ASSERT NOT EXISTS(SELECT 1 FROM public.notifications n JOIN public.profiles p ON p.id=n.user_id
      WHERE n.link=report_link AND n.type<>'info' AND p.bank_id IS DISTINCT FROM fixture_bank), 'Review notified another bank';
    ASSERT EXISTS(SELECT 1 FROM public.guarantee_report_audit WHERE report_id=report AND new_status=outcome
      AND old_status='under_review' AND performed_by=actor), 'Review audit actor/status incorrect';
    SELECT count(*) INTO before_count FROM public.notifications n WHERE n.link=report_link;
    EXECUTE 'set local role authenticated';
    UPDATE public.guarantee_reports SET review_notes='Changed note without status change' WHERE id=report;
    EXECUTE 'reset role';
    ASSERT (SELECT count(*)=before_count FROM public.notifications n WHERE n.link=report_link), 'Unchanged status duplicated notifications';

    IF outcome='revision_requested' THEN
      UPDATE public.profiles SET is_active=false WHERE id=actor;
      PERFORM set_config('request.jwt.claim.sub',bank_user::text,true);
      EXECUTE 'set local role authenticated';
      UPDATE public.guarantee_reports SET status='submitted',submission_date=now() WHERE id=report;
      GET DIAGNOSTICS expected=ROW_COUNT;
      ASSERT expected=1, 'Authenticated bank resubmission did not update one report';
      EXECUTE 'reset role';
      ASSERT (SELECT count(*)=1 FROM public.notifications n WHERE n.link=report_link AND n.user_id=actor AND n.type='info'),
        'Inactive administrator received resubmission';
      SELECT count(*) INTO expected FROM public.profiles p JOIN public.roles r ON r.id=p.role_id
        WHERE p.is_active IS TRUE AND r.is_active IS TRUE AND r.code IN ('prsf_admin','prsf_analyst');
      ASSERT (SELECT count(*)=before_count+expected FROM public.notifications n WHERE n.link=report_link), 'Revision resubmission notification count incorrect';
      UPDATE public.profiles SET is_active=true WHERE id=actor;
      UPDATE public.roles SET is_active=false WHERE id=bank_role;
      PERFORM set_config('request.jwt.claim.sub',actor::text,true);
      EXECUTE 'set local role authenticated';
      UPDATE public.guarantee_reports SET status='approved',review_notes=NULL WHERE id=report;
      EXECUTE 'reset role';
      ASSERT NOT EXISTS(SELECT 1 FROM public.notifications n WHERE n.link=report_link AND n.type='success'), 'Inactive bank role received review';
      UPDATE public.roles SET is_active=true WHERE id=bank_role;
    END IF;

    -- The legacy DELETE audit FK cannot reference its already-deleted parent; do not hide this with a skipped audit.
    SELECT count(*) INTO audit_count FROM public.guarantee_report_audit WHERE report_id=report;
    BEGIN
      DELETE FROM public.guarantee_reports WHERE id=report;
      RAISE EXCEPTION 'Report deletion unexpectedly bypassed its unresolved audit FK';
    EXCEPTION WHEN foreign_key_violation THEN NULL; END;
    ASSERT (SELECT count(*)=audit_count FROM public.guarantee_report_audit WHERE report_id=report), 'Failed delete altered audit rows';
  END LOOP;

  PERFORM set_config('request.jwt.claim.sub','',true);
  EXECUTE 'set local role service_role';
  UPDATE public.guarantee_reports SET total_loans=0 WHERE id=report;
  EXECUTE 'reset role';
  ASSERT EXISTS(SELECT 1 FROM public.guarantee_report_audit WHERE report_id=report AND action='update' AND performed_by IS NULL),
    'Trusted background update invented an end-user actor';

  FOREACH signature IN ARRAY ARRAY['public.log_guarantee_report_changes()','public.notify_report_submission()','public.notify_report_review()'] LOOP
    ASSERT NOT has_function_privilege('anon',signature,'EXECUTE') AND NOT has_function_privilege('authenticated',signature,'EXECUTE'),
      'Report trigger function is directly executable';
    ASSERT (SELECT proconfig @> ARRAY['search_path=""'] FROM pg_proc WHERE oid=signature::regprocedure), 'Report function search path changed';
  END LOOP;
END;
$test$;
ROLLBACK;
SELECT 'Report trigger regressions passed through authenticated bank submission/resubmission and admin review; all fixtures and temporary identity changes rolled back. Delete-audit FK remains unresolved.' AS result;
