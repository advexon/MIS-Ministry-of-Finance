BEGIN;
DO $test$
DECLARE
  actor uuid;
  fixture_bank uuid := gen_random_uuid();
  other_bank uuid := gen_random_uuid();
  report uuid := gen_random_uuid();
  other_report uuid := gen_random_uuid();
  role_record record;
  bank_role uuid;
  role_count integer := 0;
  changed integer;
  confirmed uuid;
  confirmed_status text;
  outcome text;
  blocked boolean;
BEGIN
  SELECT p.id INTO actor FROM public.profiles p JOIN public.roles r ON r.id=p.role_id
    WHERE p.is_active IS TRUE AND r.is_active IS TRUE AND r.code IN ('bank_admin','bank_officer') LIMIT 1;
  ASSERT actor IS NOT NULL, 'Bank regression actor unavailable';
  INSERT INTO public.banks(id,code,name_en) VALUES
    (fixture_bank,'RS-'||left(fixture_bank::text,12),'Disposable report-submission regression'),
    (other_bank,'RS-'||left(other_bank::text,12),'Disposable report-submission regression other');
  INSERT INTO public.guarantee_reports(id,bank_id,report_month) VALUES
    (report,fixture_bank,'2099-01-01'), (other_report,other_bank,'2099-01-01');
  INSERT INTO public.guarantee_report_loans(report_id,loan_request_number,customer_name,approved_amount)
    VALUES(report,'RS-DISPOSABLE','Disposable regression',0);
  INSERT INTO public.guarantee_report_payments(report_id,loan_number,installment_number,payment_date)
    VALUES(report,'RS-DISPOSABLE',1,'2099-01-01');
  PERFORM set_config('request.jwt.claim.role','authenticated',true);
  PERFORM set_config('request.jwt.claim.sub',actor::text,true);

  -- Reuse a real Auth identity only inside this rolled-back transaction; never create Auth rows.
  FOR role_record IN SELECT id,code FROM public.roles WHERE is_active IS TRUE ORDER BY code LOOP
    role_count := role_count+1;
    UPDATE public.profiles SET bank_id=fixture_bank,role_id=role_record.id WHERE id=actor;
    UPDATE public.guarantee_reports SET status='draft',submission_date=NULL WHERE id=report;
    confirmed := NULL;
    confirmed_status := NULL;
    blocked := false;
    EXECUTE 'set local role authenticated';
    BEGIN
      UPDATE public.guarantee_reports SET status='submitted',submission_date=now()
        WHERE id=report AND status='draft' RETURNING id,status INTO confirmed,confirmed_status;
    EXCEPTION WHEN insufficient_privilege THEN blocked := true; END;
    EXECUTE 'reset role';
    IF role_record.code IN ('bank_admin','bank_officer','super_admin','prsf_admin') THEN
      ASSERT NOT blocked AND confirmed=report AND confirmed_status='submitted',
        'Authorized submission did not return the exact report and status';
      ASSERT (SELECT status='submitted' AND submission_date IS NOT NULL FROM public.guarantee_reports WHERE id=report),
        'Authorized submission was not persisted';
    ELSE
      ASSERT confirmed IS NULL, 'A non-bank/non-admin role gained a submission path';
      ASSERT (SELECT status='draft' AND submission_date IS NULL FROM public.guarantee_reports WHERE id=report),
        'Denied submission changed the report';
    END IF;

    IF role_record.code IN ('bank_admin','bank_officer') THEN
      EXECUTE 'set local role authenticated';
      UPDATE public.guarantee_reports SET total_loans=11 WHERE id=other_report;
      GET DIAGNOSTICS changed=ROW_COUNT;
      ASSERT changed=0, 'Bank updated another bank report';
      ASSERT NOT EXISTS(SELECT 1 FROM public.guarantee_reports WHERE id=other_report), 'Bank read another bank report';
      EXECUTE 'reset role';
      ASSERT (SELECT total_loans=0 AND status='draft' FROM public.guarantee_reports WHERE id=other_report),
        'Cross-bank denial changed the other report';

      FOREACH outcome IN ARRAY ARRAY['submitted','under_review','approved','rejected'] LOOP
        UPDATE public.guarantee_reports SET status=outcome WHERE id=report;
        EXECUTE 'set local role authenticated';
        UPDATE public.guarantee_reports SET status='draft',total_loans=11 WHERE id=report;
        GET DIAGNOSTICS changed=ROW_COUNT;
        ASSERT changed=0, 'Bank edited a locked report';
        UPDATE public.guarantee_report_loans SET approved_amount=11 WHERE report_id=report;
        GET DIAGNOSTICS changed=ROW_COUNT;
        ASSERT changed=0, 'Bank edited loans in a locked report';
        UPDATE public.guarantee_report_payments SET principal_amount=11 WHERE report_id=report;
        GET DIAGNOSTICS changed=ROW_COUNT;
        ASSERT changed=0, 'Bank edited payments in a locked report';
        EXECUTE 'reset role';
        ASSERT (SELECT status=outcome AND total_loans=0 FROM public.guarantee_reports WHERE id=report),
          'Denied locked-report edit changed values';
      END LOOP;
      ASSERT (SELECT approved_amount=0 FROM public.guarantee_report_loans WHERE report_id=report), 'Denied edit changed loan amount';
      ASSERT (SELECT principal_amount=0 FROM public.guarantee_report_payments WHERE report_id=report), 'Denied edit changed payment amount';

      UPDATE public.guarantee_reports SET status='draft' WHERE id=report;
      FOREACH outcome IN ARRAY ARRAY['approved','rejected','under_review'] LOOP
        EXECUTE 'set local role authenticated';
        blocked := false;
        BEGIN
          UPDATE public.guarantee_reports SET status=outcome WHERE id=report;
        EXCEPTION WHEN insufficient_privilege THEN blocked := true; END;
        ASSERT blocked, 'Bank gained a review-status write';
        EXECUTE 'reset role';
        ASSERT (SELECT status='draft' FROM public.guarantee_reports WHERE id=report), 'Denied review changed status';
      END LOOP;
      EXECUTE 'set local role authenticated';
      blocked := false;
      BEGIN
        UPDATE public.guarantee_reports SET bank_id=other_bank,report_month='2099-02-01',status='submitted' WHERE id=report;
      EXCEPTION WHEN insufficient_privilege THEN blocked := true; END;
      ASSERT blocked, 'Bank transferred a submitted report to another bank';
      EXECUTE 'reset role';
      ASSERT (SELECT bank_id=fixture_bank AND report_month='2099-01-01' AND status='draft' FROM public.guarantee_reports WHERE id=report),
        'Denied reassignment changed the report';

      UPDATE public.guarantee_reports SET status='revision_requested',review_notes='Keep review evidence',review_date=now() WHERE id=report;
      EXECUTE 'set local role authenticated';
      UPDATE public.guarantee_reports SET total_loans=0,total_outstanding_principal=NULL,total_guarantee_amount=0 WHERE id=report;
      GET DIAGNOSTICS changed=ROW_COUNT;
      ASSERT changed=1, 'Bank could not edit a revision-requested report';
      UPDATE public.guarantee_reports SET status='submitted',submission_date=now()
        WHERE id=report AND status='revision_requested' RETURNING id,status INTO confirmed,confirmed_status;
      ASSERT confirmed=report AND confirmed_status='submitted', 'Bank resubmission was not confirmed';
      UPDATE public.guarantee_reports SET status='submitted' WHERE id=report AND status='revision_requested';
      GET DIAGNOSTICS changed=ROW_COUNT;
      ASSERT changed=0, 'Stale resubmission unexpectedly updated a report';
      EXECUTE 'reset role';
      ASSERT (SELECT total_outstanding_principal IS NULL AND total_guarantee_amount=0 AND review_notes='Keep review evidence'
        FROM public.guarantee_reports WHERE id=report), 'Resubmission lost null/zero values or existing review notes';
    ELSIF role_record.code IN ('super_admin','prsf_admin') THEN
      EXECUTE 'set local role authenticated';
      UPDATE public.guarantee_reports SET status='under_review' WHERE id=other_report;
      GET DIAGNOSTICS changed=ROW_COUNT;
      ASSERT changed=1, 'Existing global administrator review access was lost';
      UPDATE public.guarantee_reports SET status='approved' WHERE id=other_report;
      GET DIAGNOSTICS changed=ROW_COUNT;
      ASSERT changed=1, 'Existing administrator approval access was lost';
      EXECUTE 'reset role';
      UPDATE public.guarantee_reports SET status='draft' WHERE id=other_report;
    END IF;
  END LOOP;
  ASSERT role_count=14, 'Active role coverage changed; review the role matrix';

  SELECT id INTO bank_role FROM public.roles WHERE code='bank_officer' AND is_active IS TRUE;
  ASSERT bank_role IS NOT NULL, 'Bank officer role unavailable';
  UPDATE public.profiles SET role_id=bank_role,bank_id=fixture_bank WHERE id=actor;
  UPDATE public.guarantee_reports SET status='draft' WHERE id=report;
  FOR changed IN 1..2 LOOP
    IF changed=1 THEN UPDATE public.profiles SET is_active=false WHERE id=actor;
    ELSE UPDATE public.roles SET is_active=false WHERE id=bank_role; END IF;
    EXECUTE 'set local role authenticated';
    UPDATE public.guarantee_reports SET status='submitted' WHERE id=report RETURNING id INTO confirmed;
    ASSERT confirmed IS NULL, 'Inactive user or role submitted a report';
    EXECUTE 'reset role';
    ASSERT (SELECT status='draft' FROM public.guarantee_reports WHERE id=report), 'Inactive submission changed report';
    UPDATE public.profiles SET is_active=true WHERE id=actor;
    UPDATE public.roles SET is_active=true WHERE id=bank_role;
  END LOOP;
  PERFORM set_config('request.jwt.claim.sub','',true);
  EXECUTE 'set local role authenticated';
  UPDATE public.guarantee_reports SET status='submitted' WHERE id=report RETURNING id INTO confirmed;
  ASSERT confirmed IS NULL, 'Missing identity submitted a report';
  EXECUTE 'reset role';
  PERFORM set_config('request.jwt.claim.role','anon',true);
  EXECUTE 'set local role anon';
  UPDATE public.guarantee_reports SET status='submitted' WHERE id=report RETURNING id INTO confirmed;
  ASSERT confirmed IS NULL, 'Anonymous caller submitted a report';
  EXECUTE 'reset role';
  ASSERT (SELECT status='draft' FROM public.guarantee_reports WHERE id=report), 'Identity denial changed the report';
END;
$test$;
ROLLBACK;
SELECT 'Report submission RLS regressions passed across all 14 active role codes, bank isolation, locked reports/children, revisions, inactive identities and anon; fixtures and identity changes rolled back.' AS result;
