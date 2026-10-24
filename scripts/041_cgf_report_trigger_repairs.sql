BEGIN;

CREATE OR REPLACE FUNCTION public.log_guarantee_report_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    INSERT INTO public.guarantee_report_audit (
      report_id, action, old_status, new_status, changes, performed_by
    ) VALUES (
      NEW.id, 'update', OLD.status, NEW.status,
      jsonb_build_object('old', to_jsonb(OLD), 'new', to_jsonb(NEW)), auth.uid()
    );
  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO public.guarantee_report_audit (
      report_id, action, new_status, changes, performed_by
    ) VALUES (
      NEW.id, 'create', NEW.status, to_jsonb(NEW), auth.uid()
    );
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.guarantee_report_audit (
      report_id, action, old_status, changes, performed_by
    ) VALUES (
      OLD.id, 'delete', OLD.status, to_jsonb(OLD), auth.uid()
    );
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.notify_report_submission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  bank_name text;
BEGIN
  IF NEW.status = 'submitted' AND OLD.status IN ('draft', 'revision_requested') THEN
    SELECT b.name_en INTO bank_name FROM public.banks b WHERE b.id = NEW.bank_id;
    INSERT INTO public.notifications (user_id, type, title, message, link)
    SELECT p.id, 'info', 'New Guarantee Report Submitted',
      bank_name || ' submitted a guarantee report for ' || to_char(NEW.report_month, 'FMMonth YYYY'),
      '/dashboard/guarantee-reports/' || NEW.id::text
    FROM public.profiles p
    JOIN public.roles r ON r.id = p.role_id
    WHERE p.is_active IS TRUE AND r.is_active IS TRUE
      AND r.code IN ('prsf_admin', 'prsf_analyst');
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.notify_report_review()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NEW.status IN ('approved', 'rejected', 'revision_requested')
      AND OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.notifications (user_id, type, title, message, link)
    SELECT p.id,
      CASE NEW.status WHEN 'approved' THEN 'success' WHEN 'rejected' THEN 'error' ELSE 'warning' END,
      'Guarantee Report ' || CASE NEW.status
        WHEN 'approved' THEN 'Approved'
        WHEN 'rejected' THEN 'Rejected'
        ELSE 'Requires Revision'
      END,
      'Your guarantee report for ' || to_char(NEW.report_month, 'FMMonth YYYY') || ' has been ' ||
      CASE NEW.status
        WHEN 'approved' THEN 'approved'
        WHEN 'rejected' THEN 'rejected'
        ELSE 'marked for revision'
      END || coalesce('. Note: ' || NEW.review_notes, '.'),
      '/dashboard/guarantee-reports/' || NEW.id::text
    FROM public.profiles p
    JOIN public.roles r ON r.id = p.role_id
    WHERE p.bank_id = NEW.bank_id AND p.is_active IS TRUE AND r.is_active IS TRUE;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.log_guarantee_report_changes(),
  public.notify_report_submission(), public.notify_report_review()
  FROM PUBLIC, anon, authenticated;

COMMIT;
