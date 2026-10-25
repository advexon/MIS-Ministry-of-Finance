BEGIN;

-- Qualify only the legacy references observed in the live function definitions.
-- Refuse unknown definitions rather than silently pinning a broken search path.
DO $migration$
DECLARE
  item record;
  definition text;
BEGIN
  FOR item IN
    SELECT * FROM (VALUES
      ('public.cleanup_expired_loan_drafts()', 'DELETE FROM loan_drafts ', 'DELETE FROM public.loan_drafts '),
      ('public.log_guarantee_report_changes()', 'INSERT INTO guarantee_report_audit (', 'INSERT INTO public.guarantee_report_audit ('),
      ('public.notify_report_review()', 'FROM banks ', 'FROM public.banks '),
      ('public.notify_report_review()', 'FROM profiles ', 'FROM public.profiles '),
      ('public.notify_report_review()', 'INSERT INTO notifications (', 'INSERT INTO public.notifications ('),
      ('public.notify_report_submission()', 'FROM banks ', 'FROM public.banks '),
      ('public.notify_report_submission()', 'FROM profiles ', 'FROM public.profiles '),
      ('public.notify_report_submission()', 'JOIN roles ', 'JOIN public.roles '),
      ('public.notify_report_submission()', 'INSERT INTO notifications (', 'INSERT INTO public.notifications ('),
      ('public.set_claim_number()', 'nextval(''claim_number_seq'')', 'nextval(''public.claim_number_seq'')'),
      ('public.set_loan_number()', 'nextval(''loan_number_seq'')', 'nextval(''public.loan_number_seq'')')
    ) AS changes(signature, old_reference, new_reference)
  LOOP
    SELECT pg_get_functiondef(item.signature::regprocedure) INTO definition;
    IF strpos(definition, item.old_reference) > 0 THEN
      EXECUTE replace(definition, item.old_reference, item.new_reference);
    ELSIF strpos(definition, item.new_reference) = 0 THEN
      RAISE EXCEPTION 'Unexpected definition for %: missing %', item.signature, item.old_reference;
    END IF;
  END LOOP;
END
$migration$;

ALTER FUNCTION public.cleanup_expired_loan_drafts() SET search_path = '';
ALTER FUNCTION public.current_user_role_tier() SET search_path = '';
ALTER FUNCTION public.find_borrower_for_intake(text, text) SET search_path = '';
ALTER FUNCTION public.handle_new_user() SET search_path = '';
ALTER FUNCTION public.log_guarantee_report_changes() SET search_path = '';
ALTER FUNCTION public.notify_report_review() SET search_path = '';
ALTER FUNCTION public.notify_report_submission() SET search_path = '';
ALTER FUNCTION public.set_claim_number() SET search_path = '';
ALTER FUNCTION public.set_loan_number() SET search_path = '';
ALTER FUNCTION public.update_loan_draft_timestamp() SET search_path = '';
ALTER FUNCTION public.update_updated_at() SET search_path = '';

REVOKE EXECUTE ON FUNCTION
  public.cleanup_expired_loan_drafts(),
  public.current_user_role_tier(),
  public.find_borrower_for_intake(text, text),
  public.handle_new_user(),
  public.log_guarantee_report_changes(),
  public.notify_report_review(),
  public.notify_report_submission(),
  public.set_claim_number(),
  public.set_loan_number(),
  public.update_loan_draft_timestamp(),
  public.update_updated_at()
FROM PUBLIC, anon;

-- Keep existing signed-in RPC/RLS callers; triggers do not require caller EXECUTE.
GRANT EXECUTE ON FUNCTION
  public.cleanup_expired_loan_drafts(),
  public.current_user_role_tier(),
  public.find_borrower_for_intake(text, text)
TO authenticated;

REVOKE EXECUTE ON FUNCTION
  public.handle_new_user(),
  public.log_guarantee_report_changes(),
  public.notify_report_review(),
  public.notify_report_submission(),
  public.set_claim_number(),
  public.set_loan_number(),
  public.update_loan_draft_timestamp(),
  public.update_updated_at()
FROM authenticated;

COMMIT;
