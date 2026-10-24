BEGIN;

-- Keep the existing USING clause: banks can target only draft/revision rows.
ALTER POLICY "Bank users can update draft reports"
ON public.guarantee_reports
WITH CHECK (
  (
    bank_id IN (
      SELECT p.bank_id FROM public.profiles p WHERE p.id = (SELECT auth.uid())
    )
    AND (
      status IN ('draft', 'revision_requested')
      OR (
        status = 'submitted'
        AND (SELECT public.current_user_role_code()) IN ('bank_admin', 'bank_officer')
      )
    )
  )
  OR EXISTS (
    SELECT 1 FROM public.profiles p
    JOIN public.roles r ON r.id = p.role_id
    WHERE p.id = (SELECT auth.uid()) AND r.code IN ('super_admin', 'prsf_admin')
  )
);

COMMIT;
