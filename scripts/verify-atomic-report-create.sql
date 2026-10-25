BEGIN;
DO $test$
DECLARE
  actor uuid; original_role uuid; bank uuid := gen_random_uuid(); other_bank uuid := gen_random_uuid();
  report uuid := gen_random_uuid(); failed uuid := gen_random_uuid(); rr record; allowed boolean; outcome uuid;
  loans jsonb := '[{"loan_request_number":"ATOMIC-REPORT-LOAN","customer_name":"Disposable test","currency":"TJS","approved_amount":0,"disbursed_amount":0,"outstanding_principal":125.25,"guarantee_coverage":0,"guarantee_amount":0,"days_overdue":0}]';
  payments jsonb := '[{"loan_number":"ATOMIC-REPORT-LOAN","installment_number":1,"payment_date":"2098-01-01","principal_amount":0,"interest_amount":0,"total_amount":0,"remaining_balance":0}]';
BEGIN
  SELECT p.id,p.role_id INTO actor,original_role FROM public.profiles p JOIN public.roles r ON r.id=p.role_id
    WHERE p.is_active AND r.is_active AND r.code IN ('bank_admin','bank_officer') LIMIT 1;
  ASSERT actor IS NOT NULL, 'Missing authenticated regression identity';
  INSERT INTO public.banks(id,code,name_en) VALUES
    (bank,'AR-'||left(bank::text,12),'Disposable atomic report regression'),
    (other_bank,'AR-'||left(other_bank::text,12),'Disposable atomic report regression other');
  UPDATE public.profiles SET bank_id=bank WHERE id=actor;
  PERFORM set_config('request.jwt.claim.sub',actor::text,true);
  PERFORM set_config('request.jwt.claim.role','authenticated',true);
  EXECUTE 'set local role authenticated';
  outcome := public.cgf_create_guarantee_report(report,bank,'2098-01-01','monthly',loans,payments,true);
  ASSERT outcome=report, 'Wrong report confirmation';
  ASSERT (SELECT status='submitted' AND total_loans=1 AND total_outstanding_principal=125.25 AND total_guarantee_amount=0 AND submitted_by=actor AND submission_date IS NOT NULL FROM public.guarantee_reports WHERE id=report), 'Header or totals mismatch';
  ASSERT (SELECT disbursed_amount=0 AND guarantee_coverage=0 AND interest_rate IS NULL FROM public.guarantee_report_loans WHERE report_id=report), 'Zero/null semantics lost';
  ASSERT (SELECT total_amount=0 FROM public.guarantee_report_payments WHERE report_id=report), 'Payment missing';
  BEGIN
    PERFORM public.cgf_create_guarantee_report(report,bank,'2098-01-01','monthly',loans,payments,true);
    RAISE EXCEPTION 'Duplicate request accepted';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  BEGIN
    PERFORM public.cgf_create_guarantee_report(failed,other_bank,'2098-01-01','monthly',loans,payments,false);
    RAISE EXCEPTION 'Cross-bank report accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.cgf_create_guarantee_report(failed,bank,'2098-02-01','monthly',loans,'[{"loan_number":"ATOMIC-REPORT-LOAN","installment_number":1,"payment_date":"invalid"}]',true);
    RAISE EXCEPTION 'Invalid child accepted';
  EXCEPTION WHEN invalid_datetime_format THEN NULL; END;
  BEGIN
    PERFORM public.cgf_create_guarantee_report(failed,bank,'2098-02-01','monthly',jsonb_set(loans,'{0,approved_amount}','-1'),payments,false);
    RAISE EXCEPTION 'Negative amount accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  EXECUTE 'reset role';
  ASSERT NOT EXISTS(SELECT 1 FROM public.guarantee_reports WHERE id=failed), 'Failed child left header';
  ASSERT NOT EXISTS(SELECT 1 FROM public.guarantee_report_loans WHERE report_id=failed), 'Failed child left loans';
  ASSERT NOT EXISTS(SELECT 1 FROM public.guarantee_report_audit WHERE report_id=failed), 'Failed child left audit';
  ASSERT NOT EXISTS(SELECT 1 FROM public.notifications WHERE link='/dashboard/guarantee-reports/'||failed::text), 'Failed child notified';
  ASSERT EXISTS(SELECT 1 FROM public.guarantee_report_audit WHERE report_id=report AND performed_by=actor), 'Audit actor missing';

  FOR rr IN SELECT id,code FROM public.roles WHERE is_active LOOP
    UPDATE public.profiles SET role_id=rr.id,bank_id=bank WHERE id=actor;
    allowed := rr.code IN ('bank_admin','bank_officer','super_admin','prsf_admin');
    EXECUTE 'set local role authenticated';
    BEGIN
      outcome := public.cgf_create_guarantee_report(failed,bank,'2098-02-01','monthly','[]','[]',false);
      ASSERT allowed AND outcome=failed, 'Unauthorized report role accepted';
      RAISE EXCEPTION USING ERRCODE='P0099',MESSAGE='rollback role fixture';
    EXCEPTION WHEN SQLSTATE 'P0099' THEN NULL;
      WHEN insufficient_privilege THEN ASSERT NOT allowed,'Allowed report role denied';
    END;
    EXECUTE 'reset role';
  END LOOP;
  UPDATE public.profiles SET role_id=original_role,is_active=false WHERE id=actor;
  EXECUTE 'set local role authenticated';
  BEGIN
    PERFORM public.cgf_create_guarantee_report(failed,bank,'2098-02-01','monthly','[]','[]',false);
    RAISE EXCEPTION 'Inactive actor accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  EXECUTE 'reset role';
  ASSERT NOT has_function_privilege('anon','public.cgf_create_guarantee_report(uuid,uuid,date,text,jsonb,jsonb,boolean)','EXECUTE'), 'Anonymous execution allowed';
END;
$test$;
ROLLBACK;
SELECT 'Atomic report creation checks passed; fixtures and profile changes rolled back.' AS result;
