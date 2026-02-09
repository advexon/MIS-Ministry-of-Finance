-- =============================================================
-- Guarantee Reports Schema
-- Based on the PRSF Blank Guarantee Report Format specification
-- =============================================================

-- 1. Parent table: guarantee_reports (report submissions)
CREATE TABLE IF NOT EXISTS guarantee_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_id UUID NOT NULL REFERENCES banks(id),
  report_month DATE NOT NULL,  -- first day of the reporting month
  report_type VARCHAR(20) NOT NULL CHECK (report_type IN ('monthly', 'quarterly', 'annual')),
  status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'under_review', 'approved', 'rejected', 'revision_requested')),
  submission_date TIMESTAMPTZ,
  submitted_by UUID REFERENCES profiles(id),
  reviewed_by UUID REFERENCES profiles(id),
  review_date TIMESTAMPTZ,
  review_notes TEXT,
  total_loans INTEGER DEFAULT 0,
  total_outstanding_principal NUMERIC(18,2) DEFAULT 0,
  total_guarantee_amount NUMERIC(18,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(bank_id, report_month)
);

-- 2. Detail table: guarantee_report_loans (Report 2: List of Guaranteed Loans - 27 fields)
CREATE TABLE IF NOT EXISTS guarantee_report_loans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES guarantee_reports(id) ON DELETE CASCADE,
  loan_application_id UUID REFERENCES loan_applications(id),
  
  -- Field 1: Loan request number
  loan_request_number VARCHAR(50) NOT NULL,
  -- Field 2: Bank branch
  branch_name VARCHAR(200),
  -- Field 3: Customer code
  customer_code VARCHAR(50),
  -- Field 4: Customer name
  customer_name VARCHAR(300) NOT NULL,
  -- Field 5: Customer legal type (Individual/Legal Entity/IE)
  customer_legal_type VARCHAR(50),
  -- Field 6: TIN number
  tin_number VARCHAR(50),
  -- Field 7: Business sector
  sector VARCHAR(200),
  -- Field 8: Loan purpose
  loan_purpose TEXT,
  -- Field 9: Currency
  currency VARCHAR(10) DEFAULT 'TJS',
  -- Field 10: Approved loan amount
  approved_amount NUMERIC(18,2) NOT NULL,
  -- Field 11: Disbursed loan amount
  disbursed_amount NUMERIC(18,2),
  -- Field 12: Outstanding principal balance
  outstanding_principal NUMERIC(18,2),
  -- Field 13: Interest rate (%)
  interest_rate NUMERIC(5,2),
  -- Field 14: Loan term (months)
  loan_term_months INTEGER,
  -- Field 15: Grace period (months)
  grace_period_months INTEGER,
  -- Field 16: Repayment frequency
  repayment_frequency VARCHAR(20),
  -- Field 17: Disbursement date
  disbursement_date DATE,
  -- Field 18: Maturity date
  maturity_date DATE,
  -- Field 19: Guarantee coverage (%)
  guarantee_coverage NUMERIC(5,2),
  -- Field 20: Guarantee amount
  guarantee_amount NUMERIC(18,2),
  -- Field 21: Guarantee start date
  guarantee_start_date DATE,
  -- Field 22: Guarantee end date
  guarantee_end_date DATE,
  -- Field 23: Loan status
  loan_status VARCHAR(50),
  -- Field 24: Days overdue
  days_overdue INTEGER DEFAULT 0,
  -- Field 25: Overdue principal
  overdue_principal NUMERIC(18,2) DEFAULT 0,
  -- Field 26: Overdue interest
  overdue_interest NUMERIC(18,2) DEFAULT 0,
  -- Field 27: Loan officer name
  loan_officer_name VARCHAR(200),
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Detail table: guarantee_report_payments (Report 1: Payment Schedule - 7 fields)
CREATE TABLE IF NOT EXISTS guarantee_report_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES guarantee_reports(id) ON DELETE CASCADE,
  report_loan_id UUID REFERENCES guarantee_report_loans(id) ON DELETE CASCADE,
  loan_application_id UUID REFERENCES loan_applications(id),
  
  -- Field 1: Loan number
  loan_number VARCHAR(50) NOT NULL,
  -- Field 2: Installment number
  installment_number INTEGER NOT NULL,
  -- Field 3: Scheduled payment date
  payment_date DATE NOT NULL,
  -- Field 4: Principal amount
  principal_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  -- Field 5: Interest amount
  interest_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  -- Field 6: Total payment amount
  total_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  -- Field 7: Remaining balance after payment
  remaining_balance NUMERIC(18,2) NOT NULL DEFAULT 0,
  
  -- Actual payment tracking
  is_paid BOOLEAN DEFAULT FALSE,
  actual_payment_date DATE,
  actual_amount_paid NUMERIC(18,2),
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_guarantee_reports_bank ON guarantee_reports(bank_id);
CREATE INDEX IF NOT EXISTS idx_guarantee_reports_month ON guarantee_reports(report_month);
CREATE INDEX IF NOT EXISTS idx_guarantee_reports_status ON guarantee_reports(status);
CREATE INDEX IF NOT EXISTS idx_guarantee_report_loans_report ON guarantee_report_loans(report_id);
CREATE INDEX IF NOT EXISTS idx_guarantee_report_loans_application ON guarantee_report_loans(loan_application_id);
CREATE INDEX IF NOT EXISTS idx_guarantee_report_payments_report ON guarantee_report_payments(report_id);
CREATE INDEX IF NOT EXISTS idx_guarantee_report_payments_loan ON guarantee_report_payments(report_loan_id);

-- Enable RLS
ALTER TABLE guarantee_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE guarantee_report_loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE guarantee_report_payments ENABLE ROW LEVEL SECURITY;

-- RLS Policies: authenticated users can read their bank's reports
CREATE POLICY "Users can view their bank reports" ON guarantee_reports
  FOR SELECT TO authenticated
  USING (
    bank_id IN (SELECT bank_id FROM profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles p JOIN roles r ON p.role_id = r.id WHERE p.id = auth.uid() AND r.code IN ('super_admin', 'prsf_admin', 'prsf_analyst', 'auditor'))
  );

CREATE POLICY "Bank users can insert reports" ON guarantee_reports
  FOR INSERT TO authenticated
  WITH CHECK (
    bank_id IN (SELECT bank_id FROM profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles p JOIN roles r ON p.role_id = r.id WHERE p.id = auth.uid() AND r.code IN ('super_admin', 'prsf_admin'))
  );

CREATE POLICY "Bank users can update their draft reports" ON guarantee_reports
  FOR UPDATE TO authenticated
  USING (
    (bank_id IN (SELECT bank_id FROM profiles WHERE id = auth.uid()) AND status IN ('draft', 'revision_requested'))
    OR EXISTS (SELECT 1 FROM profiles p JOIN roles r ON p.role_id = r.id WHERE p.id = auth.uid() AND r.code IN ('super_admin', 'prsf_admin'))
  );

-- Report loans follow parent report access
CREATE POLICY "Users can view report loans" ON guarantee_report_loans
  FOR SELECT TO authenticated
  USING (report_id IN (SELECT id FROM guarantee_reports));

CREATE POLICY "Users can manage report loans" ON guarantee_report_loans
  FOR ALL TO authenticated
  USING (report_id IN (SELECT id FROM guarantee_reports WHERE status IN ('draft', 'revision_requested')));

-- Report payments follow parent report access
CREATE POLICY "Users can view report payments" ON guarantee_report_payments
  FOR SELECT TO authenticated
  USING (report_id IN (SELECT id FROM guarantee_reports));

CREATE POLICY "Users can manage report payments" ON guarantee_report_payments
  FOR ALL TO authenticated
  USING (report_id IN (SELECT id FROM guarantee_reports WHERE status IN ('draft', 'revision_requested')));
