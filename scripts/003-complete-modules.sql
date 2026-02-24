-- ============================================================
-- 003-complete-modules.sql
-- Ensures all tables exist with correct columns for all modules
-- ============================================================

-- Loan Applications table (ensure all columns present)
ALTER TABLE loan_applications
  ADD COLUMN IF NOT EXISTS annual_turnover numeric(20,2),
  ADD COLUMN IF NOT EXISTS net_income numeric(20,2),
  ADD COLUMN IF NOT EXISTS risk_rating text,
  ADD COLUMN IF NOT EXISTS collateral_description text,
  ADD COLUMN IF NOT EXISTS personal_guarantors jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS covenants_bank text,
  ADD COLUMN IF NOT EXISTS covenants_prsf text,
  ADD COLUMN IF NOT EXISTS total_exposure numeric(20,2),
  ADD COLUMN IF NOT EXISTS repayment_method text CHECK (repayment_method IN ('annuity','declining_balance')),
  ADD COLUMN IF NOT EXISTS exchange_rate numeric(10,4),
  ADD COLUMN IF NOT EXISTS bank_approval_date date,
  ADD COLUMN IF NOT EXISTS prsf_submission_date date,
  ADD COLUMN IF NOT EXISTS prsf_approval_date date,
  ADD COLUMN IF NOT EXISTS disbursement_date date,
  ADD COLUMN IF NOT EXISTS maturity_date date,
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS assigned_analyst_id uuid REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS approved_amount numeric(20,2),
  ADD COLUMN IF NOT EXISTS disbursed_amount numeric(20,2),
  ADD COLUMN IF NOT EXISTS guarantee_amount numeric(20,2),
  ADD COLUMN IF NOT EXISTS loan_purpose_details text;

-- Borrowers table (ensure all columns present)
ALTER TABLE borrowers
  ADD COLUMN IF NOT EXISTS company_name_ru text,
  ADD COLUMN IF NOT EXISTS patronymic text,
  ADD COLUMN IF NOT EXISTS passport_number text,
  ADD COLUMN IF NOT EXISTS legal_address text,
  ADD COLUMN IF NOT EXISTS actual_address text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS business_description text,
  ADD COLUMN IF NOT EXISTS establishment_year integer,
  ADD COLUMN IF NOT EXISTS bank_customer_code text,
  ADD COLUMN IF NOT EXISTS is_blacklisted boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS blacklist_reason text;

-- Claims table
CREATE TABLE IF NOT EXISTS claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_number text UNIQUE NOT NULL,
  loan_application_id uuid REFERENCES loan_applications(id) ON DELETE CASCADE,
  claim_date date NOT NULL,
  claim_amount numeric(20,2) NOT NULL,
  principal_claimed numeric(20,2),
  interest_claimed numeric(20,2),
  penalties_claimed numeric(20,2) DEFAULT 0,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','under_review','approved','rejected','paid')),
  reviewed_by uuid REFERENCES profiles(id),
  review_date date,
  review_notes text,
  approved_amount numeric(20,2),
  payment_date date,
  payment_reference text,
  supporting_docs jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Recoveries table
CREATE TABLE IF NOT EXISTS recoveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id uuid REFERENCES claims(id) ON DELETE CASCADE,
  loan_application_id uuid REFERENCES loan_applications(id) ON DELETE CASCADE,
  recovery_date date NOT NULL,
  total_recovered numeric(20,2) NOT NULL,
  prsf_share numeric(20,2) NOT NULL,
  bank_share numeric(20,2) NOT NULL,
  notes text,
  reported_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now()
);

-- Fees table
CREATE TABLE IF NOT EXISTS fees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_application_id uuid REFERENCES loan_applications(id) ON DELETE CASCADE,
  fee_type text NOT NULL CHECK (fee_type IN ('upfront','quarterly')),
  period_start date,
  period_end date,
  base_amount numeric(20,2) NOT NULL,
  fee_rate numeric(5,4) NOT NULL,
  fee_amount numeric(20,2) NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','invoiced','paid')),
  invoice_date date,
  invoice_number text,
  payment_date date,
  payment_reference text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- System settings table
CREATE TABLE IF NOT EXISTS system_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  description text,
  updated_by uuid REFERENCES profiles(id),
  updated_at timestamptz DEFAULT now()
);

-- Audit trail table
CREATE TABLE IF NOT EXISTS audit_trail (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  record_id uuid,
  action text NOT NULL CHECK (action IN ('INSERT','UPDATE','DELETE')),
  old_data jsonb,
  new_data jsonb,
  changed_by uuid REFERENCES profiles(id),
  changed_at timestamptz DEFAULT now(),
  ip_address text,
  user_agent text
);

-- RLS Policies for claims
ALTER TABLE claims ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "claims_select" ON claims;
DROP POLICY IF EXISTS "claims_insert" ON claims;
DROP POLICY IF EXISTS "claims_update" ON claims;
CREATE POLICY "claims_select" ON claims FOR SELECT USING (true);
CREATE POLICY "claims_insert" ON claims FOR INSERT WITH CHECK (true);
CREATE POLICY "claims_update" ON claims FOR UPDATE USING (true);

-- RLS Policies for fees
ALTER TABLE fees ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "fees_select" ON fees;
DROP POLICY IF EXISTS "fees_insert" ON fees;
DROP POLICY IF EXISTS "fees_update" ON fees;
CREATE POLICY "fees_select" ON fees FOR SELECT USING (true);
CREATE POLICY "fees_insert" ON fees FOR INSERT WITH CHECK (true);
CREATE POLICY "fees_update" ON fees FOR UPDATE USING (true);

-- RLS Policies for recoveries
ALTER TABLE recoveries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "recoveries_select" ON recoveries;
DROP POLICY IF EXISTS "recoveries_insert" ON recoveries;
CREATE POLICY "recoveries_select" ON recoveries FOR SELECT USING (true);
CREATE POLICY "recoveries_insert" ON recoveries FOR INSERT WITH CHECK (true);

-- RLS for audit_trail
ALTER TABLE audit_trail ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "audit_select" ON audit_trail;
DROP POLICY IF EXISTS "audit_insert" ON audit_trail;
CREATE POLICY "audit_select" ON audit_trail FOR SELECT USING (true);
CREATE POLICY "audit_insert" ON audit_trail FOR INSERT WITH CHECK (true);

-- RLS for system_settings
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "settings_all" ON system_settings;
CREATE POLICY "settings_all" ON system_settings USING (true) WITH CHECK (true);

-- Seed default system settings
INSERT INTO system_settings (key, value, description) VALUES
  ('loan_threshold', '{"amount": 1000000}', 'Loans above this amount require additional approval'),
  ('default_coverage', '{"percentage": 50}', 'Default guarantee coverage percentage'),
  ('report_deadline_day', '{"day": 10}', 'Day of month reports are due'),
  ('claim_processing_days', '{"days": 30}', 'Max days to process a claim'),
  ('upfront_fee_rate', '{"rate": 0.005}', 'Default upfront fee rate (0.5%)'),
  ('quarterly_fee_rate', '{"rate": 0.005}', 'Default quarterly fee rate (0.5%)'),
  ('session_timeout_minutes', '{"minutes": 30}', 'Session timeout in minutes'),
  ('max_failed_logins', '{"attempts": 5}', 'Max failed login attempts before lockout'),
  ('password_min_length', '{"length": 8}', 'Minimum password length'),
  ('password_expiry_days', '{"days": 90}', 'Password expiry in days')
ON CONFLICT (key) DO NOTHING;

-- Auto-generate claim numbers
CREATE OR REPLACE FUNCTION generate_claim_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.claim_number IS NULL OR NEW.claim_number = '' THEN
    NEW.claim_number := 'CLM-' || to_char(now(), 'YYYY') || '-' || LPAD(nextval('claim_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE SEQUENCE IF NOT EXISTS claim_seq START 1;

DROP TRIGGER IF EXISTS set_claim_number ON claims;
CREATE TRIGGER set_claim_number
  BEFORE INSERT ON claims
  FOR EACH ROW EXECUTE FUNCTION generate_claim_number();

-- Auto-generate fee invoice numbers
CREATE OR REPLACE FUNCTION generate_invoice_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.invoice_number IS NULL AND NEW.invoice_date IS NOT NULL THEN
    NEW.invoice_number := 'INV-' || to_char(NEW.invoice_date, 'YYYY') || '-' || LPAD(nextval('invoice_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE SEQUENCE IF NOT EXISTS invoice_seq START 1;

DROP TRIGGER IF EXISTS set_invoice_number ON fees;
CREATE TRIGGER set_invoice_number
  BEFORE INSERT OR UPDATE ON fees
  FOR EACH ROW EXECUTE FUNCTION generate_invoice_number();

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_claims_loan ON claims(loan_application_id);
CREATE INDEX IF NOT EXISTS idx_claims_status ON claims(status);
CREATE INDEX IF NOT EXISTS idx_fees_loan ON fees(loan_application_id);
CREATE INDEX IF NOT EXISTS idx_fees_status ON fees(status);
CREATE INDEX IF NOT EXISTS idx_recoveries_claim ON recoveries(claim_id);
CREATE INDEX IF NOT EXISTS idx_audit_table ON audit_trail(table_name, changed_at);
CREATE INDEX IF NOT EXISTS idx_audit_record ON audit_trail(record_id);
