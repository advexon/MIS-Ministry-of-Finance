BEGIN;

ALTER TABLE public.guarantee_report_audit ENABLE ROW LEVEL SECURITY;
-- A retained event identifies a historical report even after the live report is deleted.
-- Cascading deletion destroyed that history and made the AFTER DELETE audit insert fail.
ALTER TABLE public.guarantee_report_audit DROP CONSTRAINT IF EXISTS guarantee_report_audit_report_id_fkey;

REVOKE ALL ON public.guarantee_report_audit FROM PUBLIC, anon, authenticated;
DO $permissions$
DECLARE column_names text;
BEGIN
  SELECT string_agg(quote_ident(attname), ', ') INTO column_names FROM pg_attribute
    WHERE attrelid = 'public.guarantee_report_audit'::regclass AND attnum > 0 AND NOT attisdropped;
  EXECUTE format('REVOKE ALL (%s) ON public.guarantee_report_audit FROM PUBLIC, anon, authenticated', column_names);
END;
$permissions$;
GRANT SELECT ON public.guarantee_report_audit TO authenticated;
DROP POLICY IF EXISTS "Users can view audit for their reports" ON public.guarantee_report_audit;
DROP POLICY IF EXISTS cgf_report_audit_fund_read ON public.guarantee_report_audit;
CREATE POLICY cgf_report_audit_fund_read ON public.guarantee_report_audit
  FOR SELECT TO authenticated USING ((SELECT public.is_prsf_staff()));

COMMIT;
