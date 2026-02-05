-- PRSF Loan Tracking and Management Information System
-- Database Schema

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- REFERENCE TABLES
-- =============================================

-- Banks/Partner Financial Institutions
CREATE TABLE IF NOT EXISTS banks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) UNIQUE NOT NULL,
  name_en VARCHAR(255) NOT NULL,
  name_ru VARCHAR(255),
  name_tj VARCHAR(255),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Bank Branches
CREATE TABLE IF NOT EXISTS bank_branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_id UUID NOT NULL REFERENCES banks(id) ON DELETE CASCADE,
  code VARCHAR(50) NOT NULL,
  name_en VARCHAR(255) NOT NULL,
  name_ru VARCHAR(255),
  name_tj VARCHAR(255),
  city VARCHAR(100),
  district VARCHAR(100),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(bank_id, code)
);

-- Economic Sectors
CREATE TABLE IF NOT EXISTS sectors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) UNIQUE NOT NULL,
  name_en VARCHAR(255) NOT NULL,
  name_ru VARCHAR(255),
  name_tj VARCHAR(255),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Loan Products/Programs
CREATE TABLE IF NOT EXISTS loan_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) UNIQUE NOT NULL,
  name_en VARCHAR(255) NOT NULL,
  name_ru VARCHAR(255),
  name_tj VARCHAR(255),
  guarantee_coverage DECIMAL(5,2) DEFAULT 50.00, -- Percentage
  upfront_fee_rate DECIMAL(5,4) DEFAULT 0.0100, -- 1%
  quarterly_fee_rate DECIMAL(5,4) DEFAULT 0.0025, -- 0.25%
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- User Roles
CREATE TABLE IF NOT EXISTS roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) UNIQUE NOT NULL,
  name_en VARCHAR(100) NOT NULL,
  name_ru VARCHAR(100),
  name_tj VARCHAR(100),
  permissions JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- USER MANAGEMENT
-- =============================================

-- User Profiles (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  phone VARCHAR(50),
  role_id UUID REFERENCES roles(id),
  bank_id UUID REFERENCES banks(id), -- NULL for PRSF staff
  branch_id UUID REFERENCES bank_branches(id),
  is_active BOOLEAN DEFAULT true,
  preferred_language VARCHAR(2) DEFAULT 'en', -- en, ru, tj
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- BORROWER/CLIENT MANAGEMENT
-- =============================================

-- Borrowers/Clients
CREATE TABLE IF NOT EXISTS borrowers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tin_number VARCHAR(50) UNIQUE NOT NULL, -- Tax Identification Number
  registration_number VARCHAR(100),
  legal_type VARCHAR(50) NOT NULL, -- 'individual', 'legal_entity', 'individual_entrepreneur'
  
  -- Company/Business Info
  company_name VARCHAR(255),
  company_name_ru VARCHAR(255),
  
  -- Individual/Representative Info
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  patronymic VARCHAR(100),
  gender VARCHAR(10), -- 'male', 'female'
  date_of_birth DATE,
  country_of_birth VARCHAR(100),
  passport_number VARCHAR(50),
  
  -- Contact & Address
  legal_address TEXT,
  actual_address TEXT,
  city VARCHAR(100),
  district VARCHAR(100),
  zip_code VARCHAR(20),
  phone VARCHAR(50),
  email VARCHAR(255),
  
  -- Business Details
  sector_id UUID REFERENCES sectors(id),
  business_description TEXT,
  establishment_year INTEGER,
  employee_count INTEGER,
  
  -- Metadata
  bank_customer_code VARCHAR(100),
  is_blacklisted BOOLEAN DEFAULT false,
  blacklist_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- LOAN APPLICATIONS & GUARANTEES
-- =============================================

-- Loan Applications
CREATE TABLE IF NOT EXISTS loan_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_number VARCHAR(50) UNIQUE NOT NULL,
  
  -- Bank & Branch
  bank_id UUID NOT NULL REFERENCES banks(id),
  branch_id UUID REFERENCES bank_branches(id),
  bank_loan_officer VARCHAR(255),
  
  -- Borrower
  borrower_id UUID NOT NULL REFERENCES borrowers(id),
  
  -- Loan Details
  product_id UUID REFERENCES loan_products(id),
  loan_purpose VARCHAR(50), -- 'working_capital', 'investment', 'operational'
  loan_purpose_details TEXT,
  
  -- Amounts
  requested_amount DECIMAL(18,2) NOT NULL,
  approved_amount DECIMAL(18,2),
  disbursed_amount DECIMAL(18,2),
  currency VARCHAR(3) DEFAULT 'TJS', -- TJS, USD
  exchange_rate DECIMAL(10,4),
  
  -- Terms
  loan_term_months INTEGER NOT NULL,
  grace_period_months INTEGER DEFAULT 0,
  interest_rate DECIMAL(5,2),
  repayment_frequency VARCHAR(20) DEFAULT 'monthly', -- monthly, quarterly
  repayment_method VARCHAR(50), -- 'annuity', 'declining_balance'
  
  -- Guarantee Details
  guarantee_coverage DECIMAL(5,2), -- Percentage covered
  guarantee_amount DECIMAL(18,2),
  
  -- Dates
  application_date DATE NOT NULL,
  bank_approval_date DATE,
  prsf_submission_date DATE,
  prsf_approval_date DATE,
  disbursement_date DATE,
  maturity_date DATE,
  
  -- Status
  status VARCHAR(50) DEFAULT 'draft', -- draft, submitted, under_review, approved, rejected, disbursed, active, closed, defaulted, claim_pending, claim_paid
  rejection_reason TEXT,
  
  -- PRSF Assignment
  assigned_analyst_id UUID REFERENCES profiles(id),
  
  -- Financial Summary
  total_exposure DECIMAL(18,2), -- Borrower's total exposure with bank
  annual_turnover DECIMAL(18,2),
  net_income DECIMAL(18,2),
  risk_rating VARCHAR(10),
  
  -- Collateral & Guarantors
  collateral_description TEXT,
  personal_guarantors JSONB DEFAULT '[]',
  
  -- Metadata
  covenants_bank TEXT,
  covenants_prsf TEXT,
  notes TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Loan Application Documents
CREATE TABLE IF NOT EXISTS loan_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_application_id UUID NOT NULL REFERENCES loan_applications(id) ON DELETE CASCADE,
  document_type VARCHAR(100) NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER,
  mime_type VARCHAR(100),
  uploaded_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Loan Application History/Audit Trail
CREATE TABLE IF NOT EXISTS loan_application_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_application_id UUID NOT NULL REFERENCES loan_applications(id) ON DELETE CASCADE,
  action VARCHAR(100) NOT NULL, -- status_change, field_update, document_upload, etc.
  old_value JSONB,
  new_value JSONB,
  notes TEXT,
  performed_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- PAYMENT SCHEDULES & TRACKING
-- =============================================

-- Payment Schedules (Generated from loan terms)
CREATE TABLE IF NOT EXISTS payment_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_application_id UUID NOT NULL REFERENCES loan_applications(id) ON DELETE CASCADE,
  installment_number INTEGER NOT NULL,
  due_date DATE NOT NULL,
  principal_amount DECIMAL(18,2) NOT NULL,
  interest_amount DECIMAL(18,2) NOT NULL,
  total_amount DECIMAL(18,2) NOT NULL,
  outstanding_principal DECIMAL(18,2) NOT NULL,
  is_paid BOOLEAN DEFAULT false,
  actual_payment_date DATE,
  actual_payment_amount DECIMAL(18,2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(loan_application_id, installment_number)
);

-- Monthly Loan Reports (from banks)
CREATE TABLE IF NOT EXISTS monthly_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_application_id UUID NOT NULL REFERENCES loan_applications(id),
  report_month DATE NOT NULL, -- First day of the month
  
  -- Balances
  outstanding_principal DECIMAL(18,2),
  outstanding_interest DECIMAL(18,2),
  outstanding_penalties DECIMAL(18,2),
  
  -- Payments in month
  principal_paid DECIMAL(18,2) DEFAULT 0,
  interest_paid DECIMAL(18,2) DEFAULT 0,
  penalties_paid DECIMAL(18,2) DEFAULT 0,
  
  -- Delinquency
  days_past_due INTEGER DEFAULT 0,
  
  -- Write-offs
  write_off_date DATE,
  write_off_principal DECIMAL(18,2),
  write_off_interest DECIMAL(18,2),
  write_off_penalties DECIMAL(18,2),
  
  -- Recoveries
  total_recovered DECIMAL(18,2) DEFAULT 0,
  last_recovery_date DATE,
  last_recovery_amount DECIMAL(18,2),
  
  last_payment_date DATE,
  submitted_by UUID REFERENCES profiles(id),
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(loan_application_id, report_month)
);

-- =============================================
-- CLAIMS & RECOVERIES
-- =============================================

-- Claims
CREATE TABLE IF NOT EXISTS claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_number VARCHAR(50) UNIQUE NOT NULL,
  loan_application_id UUID NOT NULL REFERENCES loan_applications(id),
  
  -- Claim Details
  claim_date DATE NOT NULL,
  claim_amount DECIMAL(18,2) NOT NULL,
  principal_claimed DECIMAL(18,2),
  interest_claimed DECIMAL(18,2),
  
  -- Status
  status VARCHAR(50) DEFAULT 'pending', -- pending, under_review, approved, rejected, paid
  
  -- Processing
  reviewed_by UUID REFERENCES profiles(id),
  review_date DATE,
  review_notes TEXT,
  
  -- Payment
  approved_amount DECIMAL(18,2),
  payment_date DATE,
  payment_reference VARCHAR(100),
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Recoveries (after claim payout)
CREATE TABLE IF NOT EXISTS recoveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id UUID NOT NULL REFERENCES claims(id),
  loan_application_id UUID NOT NULL REFERENCES loan_applications(id),
  
  recovery_date DATE NOT NULL,
  total_recovered DECIMAL(18,2) NOT NULL,
  prsf_share DECIMAL(18,2) NOT NULL,
  bank_share DECIMAL(18,2) NOT NULL,
  
  notes TEXT,
  reported_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- FEES & COMMISSIONS
-- =============================================

-- Fee Calculations
CREATE TABLE IF NOT EXISTS fees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_application_id UUID NOT NULL REFERENCES loan_applications(id),
  fee_type VARCHAR(50) NOT NULL, -- 'upfront', 'quarterly'
  period_start DATE,
  period_end DATE,
  base_amount DECIMAL(18,2) NOT NULL, -- Loan amount or outstanding balance
  fee_rate DECIMAL(5,4) NOT NULL,
  fee_amount DECIMAL(18,2) NOT NULL,
  
  status VARCHAR(50) DEFAULT 'pending', -- pending, invoiced, paid
  invoice_date DATE,
  invoice_number VARCHAR(50),
  payment_date DATE,
  payment_reference VARCHAR(100),
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- NOTIFICATIONS
-- =============================================

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  type VARCHAR(50) DEFAULT 'info', -- info, warning, success, error
  related_entity VARCHAR(50), -- loan_application, claim, report
  related_id UUID,
  is_read BOOLEAN DEFAULT false,
  is_email_sent BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- SYSTEM SETTINGS
-- =============================================

CREATE TABLE IF NOT EXISTS system_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key VARCHAR(100) UNIQUE NOT NULL,
  value JSONB NOT NULL,
  description TEXT,
  updated_by UUID REFERENCES profiles(id),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- ROW LEVEL SECURITY
-- =============================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE banks ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE sectors ENABLE ROW LEVEL SECURITY;
ALTER TABLE loan_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE borrowers ENABLE ROW LEVEL SECURITY;
ALTER TABLE loan_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE loan_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE loan_application_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE monthly_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE recoveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE fees ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view their own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update their own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Authenticated users can view all profiles" ON profiles FOR SELECT USING (auth.role() = 'authenticated');

-- Banks policies (all authenticated users can view)
CREATE POLICY "Authenticated users can view banks" ON banks FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can view branches" ON bank_branches FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can view sectors" ON sectors FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can view products" ON loan_products FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can view roles" ON roles FOR SELECT USING (auth.role() = 'authenticated');

-- Borrowers policies
CREATE POLICY "Authenticated users can view borrowers" ON borrowers FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can insert borrowers" ON borrowers FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can update borrowers" ON borrowers FOR UPDATE USING (auth.role() = 'authenticated');

-- Loan applications policies
CREATE POLICY "Authenticated users can view loan applications" ON loan_applications FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can insert loan applications" ON loan_applications FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can update loan applications" ON loan_applications FOR UPDATE USING (auth.role() = 'authenticated');

-- Documents policies
CREATE POLICY "Authenticated users can view documents" ON loan_documents FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can insert documents" ON loan_documents FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- History policies
CREATE POLICY "Authenticated users can view history" ON loan_application_history FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can insert history" ON loan_application_history FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Payment schedules policies
CREATE POLICY "Authenticated users can view schedules" ON payment_schedules FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can manage schedules" ON payment_schedules FOR ALL USING (auth.role() = 'authenticated');

-- Monthly reports policies
CREATE POLICY "Authenticated users can view reports" ON monthly_reports FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can manage reports" ON monthly_reports FOR ALL USING (auth.role() = 'authenticated');

-- Claims policies
CREATE POLICY "Authenticated users can view claims" ON claims FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can manage claims" ON claims FOR ALL USING (auth.role() = 'authenticated');

-- Recoveries policies
CREATE POLICY "Authenticated users can view recoveries" ON recoveries FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can manage recoveries" ON recoveries FOR ALL USING (auth.role() = 'authenticated');

-- Fees policies
CREATE POLICY "Authenticated users can view fees" ON fees FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can manage fees" ON fees FOR ALL USING (auth.role() = 'authenticated');

-- Notifications policies
CREATE POLICY "Users can view their own notifications" ON notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update their own notifications" ON notifications FOR UPDATE USING (auth.uid() = user_id);

-- System settings policies
CREATE POLICY "Authenticated users can view settings" ON system_settings FOR SELECT USING (auth.role() = 'authenticated');

-- =============================================
-- INDEXES
-- =============================================

CREATE INDEX IF NOT EXISTS idx_loan_applications_status ON loan_applications(status);
CREATE INDEX IF NOT EXISTS idx_loan_applications_bank ON loan_applications(bank_id);
CREATE INDEX IF NOT EXISTS idx_loan_applications_borrower ON loan_applications(borrower_id);
CREATE INDEX IF NOT EXISTS idx_loan_applications_dates ON loan_applications(application_date, disbursement_date);
CREATE INDEX IF NOT EXISTS idx_monthly_reports_month ON monthly_reports(report_month);
CREATE INDEX IF NOT EXISTS idx_claims_status ON claims(status);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_borrowers_tin ON borrowers(tin_number);

-- =============================================
-- TRIGGERS
-- =============================================

-- Auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, first_name, last_name, preferred_language)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'first_name', NULL),
    COALESCE(NEW.raw_user_meta_data ->> 'last_name', NULL),
    COALESCE(NEW.raw_user_meta_data ->> 'preferred_language', 'en')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Update timestamps
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_banks_updated_at BEFORE UPDATE ON banks FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_bank_branches_updated_at BEFORE UPDATE ON bank_branches FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_loan_products_updated_at BEFORE UPDATE ON loan_products FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_loan_applications_updated_at BEFORE UPDATE ON loan_applications FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_payment_schedules_updated_at BEFORE UPDATE ON payment_schedules FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_monthly_reports_updated_at BEFORE UPDATE ON monthly_reports FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_claims_updated_at BEFORE UPDATE ON claims FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_fees_updated_at BEFORE UPDATE ON fees FOR EACH ROW EXECUTE FUNCTION update_updated_at();
