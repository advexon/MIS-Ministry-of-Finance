-- Migration 018: Close the RLS gap on access_logs and guarantee_letters.
--
-- These were the only two tables in the public schema with row-level security
-- disabled. Every Supabase client in this app (browser, server, proxy) uses the
-- anon key, so there is no service-role bypass and RLS is the only access gate.
--
-- Already applied to the live database. Kept here so a fresh environment
-- reproduces the same protection.

-- ============================================================
-- access_logs (security audit log)
-- ============================================================
ALTER TABLE public.access_logs ENABLE ROW LEVEL SECURITY;

-- Inserts stay open (WITH CHECK true) so that FAILED and unauthenticated
-- access attempts can still be recorded. Blocking these would silently
-- destroy the security value of the log.
CREATE POLICY access_logs_insert ON public.access_logs
  FOR INSERT WITH CHECK (true);

-- Reads are restricted to the roles the app's permission matrix grants
-- 'access_logs: view'.
CREATE POLICY access_logs_select ON public.access_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.roles r ON r.id = p.role_id
      WHERE p.id = auth.uid()
        AND r.code::text IN ('super_admin', 'auditor')
    )
  );

-- No UPDATE/DELETE policies: an audit log must be append-only.

-- ============================================================
-- guarantee_letters (issued guarantee records)
-- ============================================================
ALTER TABLE public.guarantee_letters ENABLE ROW LEVEL SECURITY;

-- Bank users only see letters for loans belonging to their own bank;
-- PRSF-side roles see all. Mirrors the guarantee_report_audit policy.
CREATE POLICY guarantee_letters_select ON public.guarantee_letters
  FOR SELECT USING (
    loan_id IN (
      SELECT la.id FROM public.loan_applications la
      WHERE la.bank_id IN (
        SELECT p.bank_id FROM public.profiles p WHERE p.id = auth.uid()
      )
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.roles r ON r.id = p.role_id
      WHERE p.id = auth.uid()
        AND r.code::text IN ('super_admin', 'prsf_admin', 'prsf_analyst', 'auditor')
    )
  );

-- Issuance happens in the generate-guarantee API route, which performs its
-- own permission checks before inserting.
CREATE POLICY guarantee_letters_insert ON public.guarantee_letters
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Revocation (the `revoked` columns) is an administrative action only.
CREATE POLICY guarantee_letters_update ON public.guarantee_letters
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.roles r ON r.id = p.role_id
      WHERE p.id = auth.uid()
        AND r.code::text IN ('super_admin', 'prsf_admin')
    )
  );

-- No DELETE policies on either table: issued guarantees and access logs
-- must not be erasable from the client.
