BEGIN;
DO $test$
DECLARE
  actor uuid; bank uuid; other_bank uuid; borrower uuid; loan uuid; failed_loan uuid; cross_loan uuid;
  claim uuid := gen_random_uuid(); denied_claim uuid := gen_random_uuid();
  role_record record; bank_role uuid; target text; changed integer; allowed boolean;
  fixture text := 'ATOMIC-CLAIM-' || left(gen_random_uuid()::text, 12);
BEGIN
  SELECT p.id,p.bank_id,p.role_id INTO actor,bank,bank_role FROM public.profiles p JOIN public.roles r ON r.id=p.role_id
    WHERE p.is_active AND r.is_active AND r.code IN ('bank_admin','bank_officer') AND p.bank_id IS NOT NULL LIMIT 1;
  SELECT id INTO other_bank FROM public.banks WHERE id<>bank LIMIT 1;
  SELECT borrower_id INTO borrower FROM public.loan_applications LIMIT 1;
  ASSERT actor IS NOT NULL AND other_bank IS NOT NULL AND borrower IS NOT NULL, 'Missing regression prerequisites';
  PERFORM set_config('request.jwt.claim.sub',actor::text,true);
  PERFORM set_config('request.jwt.claim.role','authenticated',true);
  INSERT INTO public.loan_applications(loan_request_id,loan_number,bank_id,borrower_id,status,currency)
    VALUES(fixture||'-A',fixture||'-A',bank,borrower,'draft','TJS') RETURNING id INTO loan;
  INSERT INTO public.loan_applications(loan_request_id,loan_number,bank_id,borrower_id,status,currency)
    VALUES(fixture||'-F',fixture||'-F',bank,borrower,'draft','TJS') RETURNING id INTO failed_loan;
  UPDATE public.profiles SET bank_id=other_bank WHERE id=actor;
  INSERT INTO public.loan_applications(loan_request_id,loan_number,bank_id,borrower_id,status,currency)
    VALUES(fixture||'-X',fixture||'-X',other_bank,borrower,'draft','TJS') RETURNING id INTO cross_loan;
  UPDATE public.profiles SET bank_id=bank WHERE id=actor;
  -- Only fixture staging bypasses the unrelated ordinary loan pipeline; all assertions use real triggers/RLS.
  ALTER TABLE public.loan_applications DISABLE TRIGGER cgf_pipeline_guard;
  UPDATE public.loan_applications SET status='active' WHERE id IN (loan,failed_loan,cross_loan);
  ALTER TABLE public.loan_applications ENABLE TRIGGER cgf_pipeline_guard;

  EXECUTE 'set local role authenticated';
  INSERT INTO public.claims(id,claim_number,loan_id,loan_application_id,bank_id,claim_amount,principal_claimed,interest_claimed,penalties_claimed,claim_date,status,submitted_by)
    VALUES(claim,fixture,loan,loan,bank,125,100,25,0,current_date,'pending',NULL);
  ASSERT (SELECT status='claim_pending' FROM public.loan_applications WHERE id=loan), 'Loan status did not commit with claim';
  ASSERT (SELECT submitted_by=actor FROM public.claims WHERE id=claim), 'Claim actor was not server-derived';
  BEGIN
    INSERT INTO public.claims(claim_number,loan_id,loan_application_id,bank_id,claim_amount,claim_date,status)
      VALUES(fixture||'-D',loan,loan,bank,1,current_date,'pending');
    RAISE EXCEPTION 'Duplicate outstanding claim accepted';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  BEGIN
    INSERT INTO public.claims(claim_number,loan_id,loan_application_id,bank_id,claim_amount,claim_date,status)
      VALUES(fixture||'-X',cross_loan,cross_loan,other_bank,1,current_date,'pending');
    RAISE EXCEPTION 'Cross-bank claim accepted';
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN NULL; END;
  FOREACH target IN ARRAY ARRAY['claim_pending','claim_paid','claim_rejected'] LOOP
    BEGIN
      UPDATE public.loan_applications SET status=target WHERE id=failed_loan;
      RAISE EXCEPTION 'Standalone claim status accepted: %',target;
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN
      PERFORM public.cgf_transition_loan(failed_loan,'active',target);
      RAISE EXCEPTION 'Generic RPC bypass accepted: %',target;
    EXCEPTION WHEN check_violation THEN NULL; END;
  END LOOP;
  EXECUTE 'reset role';
  ASSERT EXISTS(SELECT 1 FROM public.loan_application_history WHERE loan_id=loan AND old_status='active' AND new_status='claim_pending' AND performed_by=actor), 'Atomic history missing';
  ASSERT EXISTS(SELECT 1 FROM public.audit_trail WHERE record_id=claim AND table_name='claims' AND changed_by=actor
    AND (new_data->>'claim_amount')::numeric=125), 'Atomic audit missing';
  ASSERT (SELECT count(*)=1 FROM public.claims WHERE loan_id=loan), 'Duplicate denial changed claims';
  ASSERT (SELECT status='active' FROM public.loan_applications WHERE id=cross_loan), 'Denied cross-bank insert changed loan';

  EXECUTE format('ALTER TABLE public.audit_trail ADD CONSTRAINT cgf_test_claim_audit_failure CHECK (record_id IS DISTINCT FROM %L::uuid) NOT VALID',denied_claim);
  EXECUTE 'set local role authenticated';
  BEGIN
    INSERT INTO public.claims(id,claim_number,loan_id,loan_application_id,bank_id,claim_amount,claim_date,status)
      VALUES(denied_claim,fixture||'-FAIL',failed_loan,failed_loan,bank,1,current_date,'pending');
    RAISE EXCEPTION 'Forced audit failure unexpectedly succeeded';
  EXCEPTION WHEN check_violation THEN NULL; END;
  EXECUTE 'reset role';
  ALTER TABLE public.audit_trail DROP CONSTRAINT cgf_test_claim_audit_failure;
  ASSERT NOT EXISTS(SELECT 1 FROM public.claims WHERE id=denied_claim), 'Failed audit left a claim';
  ASSERT (SELECT status='active' FROM public.loan_applications WHERE id=failed_loan), 'Failed audit left a status update';
  ASSERT NOT EXISTS(SELECT 1 FROM public.loan_application_history WHERE loan_id=failed_loan AND new_status='claim_pending'), 'Failed audit left history';

  FOR role_record IN SELECT id,code FROM public.roles WHERE is_active LOOP
    UPDATE public.profiles SET role_id=role_record.id,bank_id=CASE WHEN role_record.code IN ('bank_admin','bank_officer') THEN bank END WHERE id=actor;
    allowed := role_record.code NOT IN ('super_admin','prsf_admin','auditor','legal_officer');
    EXECUTE 'set local role authenticated';
    BEGIN
      INSERT INTO public.claims(id,claim_number,loan_id,loan_application_id,bank_id,claim_amount,claim_date,status)
        VALUES(denied_claim,fixture||'-ROLE',failed_loan,failed_loan,bank,1,current_date,'pending');
      ASSERT allowed, 'Prohibited role created a claim';
      -- Deliberately roll successful fixtures back so every role tests the same active loan.
      RAISE EXCEPTION USING ERRCODE='P0099', MESSAGE='rollback successful role fixture';
    EXCEPTION WHEN SQLSTATE 'P0099' THEN NULL;
      WHEN insufficient_privilege OR check_violation THEN ASSERT NOT allowed, 'Existing allowed role lost claim submission';
    END;
    EXECUTE 'reset role';
    ASSERT NOT EXISTS(SELECT 1 FROM public.claims WHERE id=denied_claim), 'Role fixture leaked';
    ASSERT (SELECT status='active' FROM public.loan_applications WHERE id=failed_loan), 'Role fixture status leaked';
  END LOOP;
  UPDATE public.profiles SET role_id=bank_role,bank_id=bank,is_active=false WHERE id=actor;
  EXECUTE 'set local role authenticated';
  BEGIN
    INSERT INTO public.claims(claim_number,loan_id,loan_application_id,bank_id,claim_amount,claim_date,status)
      VALUES(fixture||'-OFF',failed_loan,failed_loan,bank,1,current_date,'pending');
    RAISE EXCEPTION 'Inactive actor created a claim';
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN NULL; END;
  EXECUTE 'reset role';
  ASSERT NOT has_function_privilege('authenticated','cgf_private.claim_submission_events()','EXECUTE'), 'Internal trigger exposed as RPC';
END;
$test$;
ROLLBACK;
SELECT 'Atomic claim submission checks passed; fixtures and temporary profile changes rolled back.' AS result;
