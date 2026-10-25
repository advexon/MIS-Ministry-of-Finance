BEGIN;

CREATE FUNCTION public.cgf_create_guarantee_report(
  p_id uuid, p_bank uuid, p_month date, p_type text,
  p_loans jsonb, p_payments jsonb, p_submit boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  actor uuid := auth.uid();
  actor_role text := public.current_user_role_code();
  saved uuid;
BEGIN
  IF actor IS NULL OR actor_role IS NULL OR actor_role NOT IN ('super_admin', 'prsf_admin', 'bank_admin', 'bank_officer') THEN
    RAISE EXCEPTION 'Active report creation authority required' USING ERRCODE = '42501';
  END IF;
  IF actor_role IN ('bank_admin', 'bank_officer') AND public.current_user_bank_id() IS DISTINCT FROM p_bank THEN
    RAISE EXCEPTION 'Report is outside your authorized bank' USING ERRCODE = '42501';
  END IF;
  IF p_id IS NULL OR p_bank IS NULL OR p_month IS NULL OR extract(day FROM p_month) <> 1
      OR p_type IS NULL OR p_type NOT IN ('monthly', 'quarterly', 'annual') OR p_submit IS NULL THEN
    RAISE EXCEPTION 'Valid report identity, period and type required' USING ERRCODE = '23514';
  END IF;
  IF p_loans IS NULL OR p_payments IS NULL OR jsonb_typeof(p_loans) <> 'array'
      OR jsonb_typeof(p_payments) <> 'array' THEN
    RAISE EXCEPTION 'Report rows must be arrays' USING ERRCODE = '23514';
  END IF;
  IF jsonb_array_length(p_loans) > 1000 OR jsonb_array_length(p_payments) > 1000 THEN
    RAISE EXCEPTION 'A report supports at most 1000 loans and 1000 payments' USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.guarantee_reports(id, bank_id, report_month, report_type, status, submitted_by)
    VALUES(p_id, p_bank, p_month, p_type, 'draft', actor);

  INSERT INTO public.guarantee_report_loans(
    report_id, row_number, loan_request_number, customer_name, customer_code, tin_number, sector,
    currency, approved_amount, disbursed_amount, outstanding_principal, interest_rate,
    loan_term_months, disbursement_date, maturity_date, guarantee_coverage, guarantee_amount,
    loan_status, days_overdue
  )
  SELECT p_id, row_number() OVER ()::integer, x.loan_request_number, x.customer_name,
    x.customer_code, x.tin_number, x.sector, x.currency, x.approved_amount, x.disbursed_amount,
    x.outstanding_principal, x.interest_rate, x.loan_term_months, x.disbursement_date,
    x.maturity_date, x.guarantee_coverage, x.guarantee_amount, x.loan_status, x.days_overdue
  FROM jsonb_to_recordset(p_loans) AS x(
    loan_request_number text, customer_name text, customer_code text, tin_number text, sector text,
    currency text, approved_amount numeric, disbursed_amount numeric, outstanding_principal numeric,
    interest_rate numeric, loan_term_months integer, disbursement_date date, maturity_date date,
    guarantee_coverage numeric, guarantee_amount numeric, loan_status text, days_overdue integer
  );

  INSERT INTO public.guarantee_report_payments(
    report_id, loan_number, installment_number, payment_date, principal_amount,
    interest_amount, total_amount, remaining_balance
  )
  SELECT p_id, x.loan_number, x.installment_number, x.payment_date, x.principal_amount,
    x.interest_amount, x.total_amount, x.remaining_balance
  FROM jsonb_to_recordset(p_payments) AS x(
    loan_number text, installment_number integer, payment_date date, principal_amount numeric,
    interest_amount numeric, total_amount numeric, remaining_balance numeric
  );

  IF EXISTS (
    SELECT 1 FROM public.guarantee_report_loans l WHERE l.report_id = p_id AND (
      nullif(btrim(l.loan_request_number), '') IS NULL OR nullif(btrim(l.customer_name), '') IS NULL
      OR l.currency IS NULL OR l.currency !~ '^[A-Z]{3}$'
      OR l.guarantee_coverage < 0 OR l.guarantee_coverage > 100
      OR l.loan_term_months < 0 OR l.days_overdue < 0
      OR EXISTS (SELECT 1 FROM unnest(ARRAY[l.approved_amount, l.disbursed_amount,
        l.outstanding_principal, l.interest_rate, l.guarantee_coverage, l.guarantee_amount]) n
        WHERE n < 0 OR n::text IN ('NaN', 'Infinity', '-Infinity'))
    )
  ) OR EXISTS (
    SELECT 1 FROM public.guarantee_report_payments p WHERE p.report_id = p_id AND (
      nullif(btrim(p.loan_number), '') IS NULL OR p.installment_number < 1
      OR EXISTS (SELECT 1 FROM unnest(ARRAY[p.principal_amount, p.interest_amount,
        p.total_amount, p.remaining_balance]) n
        WHERE n < 0 OR n::text IN ('NaN', 'Infinity', '-Infinity'))
    )
  ) THEN
    RAISE EXCEPTION 'Invalid report row values' USING ERRCODE = '23514';
  END IF;

  UPDATE public.guarantee_reports SET
    total_loans = (SELECT count(*) FROM public.guarantee_report_loans WHERE report_id = p_id),
    total_outstanding_principal = (SELECT coalesce(sum(outstanding_principal), 0) FROM public.guarantee_report_loans WHERE report_id = p_id),
    total_guarantee_amount = (SELECT coalesce(sum(guarantee_amount), 0) FROM public.guarantee_report_loans WHERE report_id = p_id),
    status = CASE WHEN p_submit THEN 'submitted' ELSE 'draft' END,
    submission_date = CASE WHEN p_submit THEN now() END
  WHERE id = p_id RETURNING id INTO saved;
  IF saved IS NULL THEN
    RAISE EXCEPTION 'Report save could not be confirmed' USING ERRCODE = '42501';
  END IF;
  RETURN saved;
END;
$function$;

REVOKE ALL ON FUNCTION public.cgf_create_guarantee_report(uuid, uuid, date, text, jsonb, jsonb, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cgf_create_guarantee_report(uuid, uuid, date, text, jsonb, jsonb, boolean) TO authenticated;

COMMIT;
