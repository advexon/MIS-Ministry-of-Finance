BEGIN;
DO $test$
DECLARE
  target record;
  signature text;
  probe text := 'cgf_function_probe_' || replace(gen_random_uuid()::text, '-', '');
  borrower uuid := gen_random_uuid();
  marker text := 'fs-' || gen_random_uuid()::text;
  matched integer;
BEGIN
  FOR target IN
    SELECT p.oid, p.oid::regprocedure::text AS signature, p.prosecdef, p.proconfig
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.prokind='f'
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid='pg_proc'::regclass AND d.objid=p.oid AND d.deptype='e')
  LOOP
    ASSERT target.proconfig @> ARRAY['search_path=""'], format('Unpinned function: %s',target.signature);
    IF target.prosecdef THEN
      ASSERT NOT has_function_privilege('anon',target.oid,'EXECUTE'), format('Anonymous definer access: %s',target.signature);
    END IF;
  END LOOP;

  FOREACH signature IN ARRAY ARRAY[
    'public.cleanup_expired_loan_drafts()', 'public.current_user_role_tier()',
    'public.find_borrower_for_intake(text,text)'
  ] LOOP
    ASSERT NOT has_function_privilege('anon',signature,'EXECUTE'), signature || ' anonymous access remains';
    ASSERT has_function_privilege('authenticated',signature,'EXECUTE'), signature || ' signed-in access removed';
    ASSERT has_function_privilege('service_role',signature,'EXECUTE'), signature || ' trusted access removed';
  END LOOP;

  FOREACH signature IN ARRAY ARRAY[
    'public.handle_new_user()', 'public.log_guarantee_report_changes()',
    'public.notify_report_review()', 'public.notify_report_submission()',
    'public.set_claim_number()', 'public.set_loan_number()',
    'public.update_loan_draft_timestamp()', 'public.update_updated_at()'
  ] LOOP
    ASSERT NOT has_function_privilege('anon',signature,'EXECUTE'), signature || ' anonymous trigger execution remains';
    ASSERT NOT has_function_privilege('authenticated',signature,'EXECUTE'), signature || ' signed-in trigger execution remains';
    ASSERT has_function_privilege('service_role',signature,'EXECUTE'), signature || ' trusted trigger access removed';
  END LOOP;

  EXECUTE 'set local role anon';
  BEGIN
    PERFORM public.find_borrower_for_intake(NULL,NULL);
    RAISE EXCEPTION 'Anonymous intake allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.current_user_role_tier();
    RAISE EXCEPTION 'Anonymous tier lookup allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.cleanup_expired_loan_drafts();
    RAISE EXCEPTION 'Anonymous cleanup allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  EXECUTE 'reset role';

  INSERT INTO public.borrowers(id,legal_type,name,customer_code)
    VALUES(borrower,'llc','Disposable function regression',marker);
  EXECUTE 'set local role authenticated';
  SELECT count(*) INTO matched FROM public.find_borrower_for_intake(NULL,marker) WHERE id=borrower AND matched_by='customer_code';
  ASSERT matched=1, 'Signed-in intake matching regressed';
  ASSERT public.current_user_role_tier()=99, 'Missing identity tier fallback changed';
  PERFORM public.cleanup_expired_loan_drafts();
  EXECUTE 'reset role';

  -- A disposable table proves trigger execution survives revoked direct EXECUTE.
  EXECUTE format('create table public.%I (claim_number text, loan_number text, created_at timestamptz default now(), updated_at timestamptz)',probe);
  EXECUTE format('grant select,insert,update on public.%I to authenticated',probe);
  EXECUTE format('create trigger claim_number before insert on public.%I for each row execute function public.set_claim_number()',probe);
  EXECUTE format('create trigger loan_number before insert on public.%I for each row execute function public.set_loan_number()',probe);
  EXECUTE format('create trigger timestamp_general before update on public.%I for each row execute function public.update_updated_at()',probe);
  EXECUTE format('create trigger timestamp_draft before update on public.%I for each row execute function public.update_loan_draft_timestamp()',probe);
  EXECUTE 'set local role authenticated';
  EXECUTE format('insert into public.%I(claim_number,loan_number) values (''existing-claim'',''existing-loan'')',probe);
  EXECUTE format('update public.%I set updated_at=null',probe);
  EXECUTE format('select count(*) from public.%I where updated_at is not null and claim_number=''existing-claim'' and loan_number=''existing-loan''',probe) INTO matched;
  ASSERT matched=1, 'Signed-in timestamp or supplied-number trigger regression';
  EXECUTE 'reset role';

  ASSERT strpos(pg_get_functiondef('public.set_claim_number()'::regprocedure),'''public.claim_number_seq''')>0, 'Claim sequence not qualified';
  ASSERT strpos(pg_get_functiondef('public.set_loan_number()'::regprocedure),'''public.loan_number_seq''')>0, 'Loan sequence not qualified';
END
$test$;
ROLLBACK;
SELECT 'function security regression passed; borrower and trigger probes rolled back; no sequence values consumed' AS result;
