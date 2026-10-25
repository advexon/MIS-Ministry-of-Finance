BEGIN;

CREATE FUNCTION cgf_private.claim_submission_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  application public.loan_applications%ROWTYPE;
  actor uuid := auth.uid();
  actor_role text := public.current_user_role_code();
BEGIN
  -- Trusted imports retain their existing path; Data API inserts must complete the whole submission.
  IF current_setting('role', true) NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;
  IF actor IS NULL OR actor_role IS NULL OR actor_role IN ('super_admin', 'prsf_admin', 'auditor') THEN
    RAISE EXCEPTION 'Active claim submission authority required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO application FROM public.loan_applications WHERE id = NEW.loan_id FOR UPDATE;
  IF NOT FOUND OR application.bank_id IS DISTINCT FROM NEW.bank_id
      OR NEW.loan_application_id IS DISTINCT FROM application.id THEN
    RAISE EXCEPTION 'Claim must reference its originating loan and bank' USING ERRCODE = '23514';
  END IF;
  IF NOT public.is_prsf_staff() AND (actor_role NOT IN ('bank_admin', 'bank_officer')
      OR public.current_user_bank_id() IS DISTINCT FROM application.bank_id) THEN
    RAISE EXCEPTION 'Claim is outside your authorized bank' USING ERRCODE = '42501';
  END IF;
  IF application.status IS NULL OR application.status NOT IN ('active', 'defaulted', 'claim_pending') THEN
    RAISE EXCEPTION 'Claims require an active or defaulted loan' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (SELECT 1 FROM public.claims c WHERE c.loan_id = application.id AND c.id <> NEW.id
      AND c.status IN ('pending', 'submitted', 'under_review', 'approved', 'paid')) THEN
    RAISE EXCEPTION 'This loan already has an outstanding or paid claim' USING ERRCODE = '23505';
  END IF;

  UPDATE public.loan_applications SET status = 'claim_pending' WHERE id = application.id;
  INSERT INTO public.audit_trail (table_name, record_id, action, new_data, changed_by)
    VALUES ('claims', NEW.id, 'INSERT', to_jsonb(NEW), actor);
  RETURN NEW;
END;
$function$;

CREATE TRIGGER cgf_claim_submission_events
AFTER INSERT ON public.claims
FOR EACH ROW EXECUTE FUNCTION cgf_private.claim_submission_events();
REVOKE ALL ON FUNCTION cgf_private.claim_submission_events() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION cgf_private.guard_loan_claim_decision()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  IF current_user IN ('anon', 'authenticated') AND (TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status)
      AND NEW.status IN ('claim_pending', 'claim_paid', 'claim_rejected') THEN
    RAISE EXCEPTION 'Claim submission and outcomes require their authorized transaction'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION cgf_private.guard_loan_claim_decision() FROM PUBLIC, anon, authenticated;

COMMIT;
