-- ============================================================================
-- COMPREHENSIVE TEST ACCOUNT SETUP FOR ONBOARDING WORKFLOW
-- ============================================================================
-- This script creates test accounts at every stage of the onboarding journey:
-- 1. System Users (Bank Officer, PRSF Staff, Auditors)
-- 2. Borrower Profiles (Individual and Company)
-- 3. Loan Applications (at various approval stages)
-- 4. Approvals and Confirmations
-- ============================================================================

-- STAGE 1: CREATE TEST AUTH USERS (in Supabase Auth)
-- These would normally be created via Supabase dashboard, but the trigger will auto-create profiles
-- For manual setup, use Supabase console to create these auth users:
-- 1. banktest@test.tj (Bank Loan Officer)
-- 2. prsfanalyst@test.tj (PRSF Analyst)
-- 3. prsfreview@test.tj (PRSF Auditor)
-- 4. borrower1@test.tj (Borrower - Individual)
-- 5. borrower2@test.tj (Borrower - Company)

-- ============================================================================
-- STAGE 2: SET UP SYSTEM USER PROFILES
-- ============================================================================

-- Bank Loan Officer Profile (from Agroinvestbank)
INSERT INTO profiles (id, email, first_name, last_name, role_id, bank_id, position, phone, is_active)
VALUES (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
  'banktest@test.tj',
  'Miroj',
  'Khakberdiev',
  (SELECT id FROM roles WHERE code = 'bank_officer'),
  (SELECT id FROM banks WHERE code = 'AGROINVEST'),
  'Senior Loan Officer',
  '+992 372 221 1234',
  true
)
ON CONFLICT (id) DO NOTHING;

-- PRSF Analyst Profile
INSERT INTO profiles (id, email, first_name, last_name, role_id, position, phone, is_active)
VALUES (
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid,
  'prsfanalyst@test.tj',
  'Gulnar',
  'Saidbayeva',
  (SELECT id FROM roles WHERE code = 'prsf_analyst'),
  'Credit Analyst',
  '+992 372 221 5678',
  true
)
ON CONFLICT (id) DO NOTHING;

-- PRSF Auditor Profile
INSERT INTO profiles (id, email, first_name, last_name, role_id, position, phone, is_active)
VALUES (
  'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid,
  'prsfreview@test.tj',
  'Dilorom',
  'Rakhimova',
  (SELECT id FROM roles WHERE code = 'auditor'),
  'Portfolio Auditor',
  '+992 372 221 9999',
  true
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- STAGE 3: SET UP BORROWER PROFILES
-- ============================================================================

-- Individual Borrower Profile #1
INSERT INTO profiles (id, email, first_name, last_name, phone, is_active)
VALUES (
  'dddddddd-dddd-dddd-dddd-dddddddddddd'::uuid,
  'borrower1@test.tj',
  'Faridun',
  'Sharifov',
  '+992 919 123456',
  true
)
ON CONFLICT (id) DO NOTHING;

-- Company/Organization Borrower Profile #2
INSERT INTO profiles (id, email, first_name, last_name, phone, is_active)
VALUES (
  'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'::uuid,
  'borrower2@test.tj',
  'Nasrin',
  'Tajikova',
  '+992 919 654321',
  true
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- STAGE 4: CREATE BORROWER APPLICATIONS (Main data model for onboarding)
-- ============================================================================

-- Application #1: Individual - Just Submitted (status: submitted)
INSERT INTO borrower_applications (
  id,
  profile_id,
  legal_entity_type,
  organization_name,
  sector_id,
  annual_turnover,
  number_of_employees,
  year_established,
  business_registration_number,
  tax_id,
  address,
  contact_person_name,
  contact_person_position,
  contact_person_phone,
  contact_person_email,
  status,
  submitted_at,
  created_at,
  updated_at
)
VALUES (
  'app-00001-0000-0000-0000-000000000001'::uuid,
  'dddddddd-dddd-dddd-dddd-dddddddddddd'::uuid,
  'individual',
  'Faridun Trading Company',
  (SELECT id FROM sectors WHERE code = 'TRADE'),
  50000.00,
  5,
  2020,
  'REG-2020-001',
  'TAX-2020-001',
  'Dushanbe, Somoni Street 45',
  'Faridun Sharifov',
  'Owner',
  '+992 919 123456',
  'borrower1@test.tj',
  'submitted',
  NOW(),
  NOW(),
  NOW()
)
ON CONFLICT (id) DO NOTHING;

-- Application #2: Company - Under Review (status: under_review)
INSERT INTO borrower_applications (
  id,
  profile_id,
  legal_entity_type,
  organization_name,
  sector_id,
  annual_turnover,
  number_of_employees,
  year_established,
  business_registration_number,
  tax_id,
  address,
  contact_person_name,
  contact_person_position,
  contact_person_phone,
  contact_person_email,
  status,
  submitted_at,
  reviewed_by_id,
  reviewed_at,
  created_at,
  updated_at
)
VALUES (
  'app-00002-0000-0000-0000-000000000002'::uuid,
  'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'::uuid,
  'company',
  'Tajik Agricultural Solutions LLC',
  (SELECT id FROM sectors WHERE code = 'AGRI'),
  250000.00,
  25,
  2018,
  'REG-2018-045',
  'TAX-2018-045',
  'Khujand, Lenin Avenue 123',
  'Nasrin Tajikova',
  'General Director',
  '+992 919 654321',
  'borrower2@test.tj',
  'under_review',
  NOW() - INTERVAL '5 days',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid,
  NOW() - INTERVAL '2 days',
  NOW() - INTERVAL '5 days',
  NOW() - INTERVAL '2 days'
)
ON CONFLICT (id) DO NOTHING;

-- Application #3: Individual - Approved (status: approved)
-- (This would require additional verified documents - shown for completeness)
INSERT INTO borrower_applications (
  id,
  profile_id,
  legal_entity_type,
  organization_name,
  sector_id,
  annual_turnover,
  number_of_employees,
  year_established,
  business_registration_number,
  tax_id,
  address,
  contact_person_name,
  contact_person_position,
  contact_person_phone,
  contact_person_email,
  status,
  submitted_at,
  reviewed_by_id,
  reviewed_at,
  approved_by_id,
  approved_at,
  created_at,
  updated_at
)
VALUES (
  'app-00003-0000-0000-0000-000000000003'::uuid,
  'dddddddd-dddd-dddd-dddd-dddddddddddd'::uuid,
  'individual',
  'Faridun Advanced Trade',
  (SELECT id FROM sectors WHERE code = 'TRADE'),
  75000.00,
  8,
  2019,
  'REG-2019-089',
  'TAX-2019-089',
  'Dushanbe, Zarafshan 78',
  'Faridun Sharifov',
  'Owner',
  '+992 919 111222',
  'borrower1alt@test.tj',
  'approved',
  NOW() - INTERVAL '20 days',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid,
  NOW() - INTERVAL '15 days',
  'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid,
  NOW() - INTERVAL '10 days',
  NOW() - INTERVAL '20 days',
  NOW() - INTERVAL '10 days'
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- STAGE 5: CREATE LOAN APPLICATIONS (Linked to borrower applications)
-- ============================================================================

-- Loan Application #1: Just Submitted by Bank Officer
INSERT INTO loan_applications (
  id,
  borrower_application_id,
  bank_id,
  loan_product_id,
  bank_officer_id,
  requested_loan_amount,
  requested_loan_currency,
  loan_term_months,
  business_purpose,
  status,
  submitted_at,
  created_at,
  updated_at
)
VALUES (
  'loan-0001-0000-0000-0000-000000000001'::uuid,
  'app-00001-0000-0000-0000-000000000001'::uuid,
  (SELECT id FROM banks WHERE code = 'AGROINVEST'),
  (SELECT id FROM loan_products WHERE code = 'MSME_STANDARD'),
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
  50000.00,
  'TJS',
  24,
  'Working capital for trading business expansion',
  'submitted',
  NOW(),
  NOW(),
  NOW()
)
ON CONFLICT (id) DO NOTHING;

-- Loan Application #2: Under PRSF Review
INSERT INTO loan_applications (
  id,
  borrower_application_id,
  bank_id,
  loan_product_id,
  bank_officer_id,
  prsf_analyst_id,
  requested_loan_amount,
  requested_loan_currency,
  loan_term_months,
  business_purpose,
  status,
  submitted_at,
  prsf_review_started_at,
  created_at,
  updated_at
)
VALUES (
  'loan-0002-0000-0000-0000-000000000002'::uuid,
  'app-00002-0000-0000-0000-000000000002'::uuid,
  (SELECT id FROM banks WHERE code = 'AMONAT'),
  (SELECT id FROM loan_products WHERE code = 'MSME_AGRI'),
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
  150000.00,
  'TJS',
  36,
  'Agricultural equipment and machinery purchase',
  'under_prsf_review',
  NOW() - INTERVAL '3 days',
  NOW() - INTERVAL '1 day',
  NOW() - INTERVAL '3 days',
  NOW() - INTERVAL '1 day'
)
ON CONFLICT (id) DO NOTHING;

-- Loan Application #3: PRSF Approved, Awaiting Bank Confirmation
INSERT INTO loan_applications (
  id,
  borrower_application_id,
  bank_id,
  loan_product_id,
  bank_officer_id,
  prsf_analyst_id,
  requested_loan_amount,
  requested_loan_currency,
  loan_term_months,
  business_purpose,
  status,
  submitted_at,
  prsf_review_started_at,
  prsf_approved_at,
  created_at,
  updated_at
)
VALUES (
  'loan-0003-0000-0000-0000-000000000003'::uuid,
  'app-00003-0000-0000-0000-000000000003'::uuid,
  (SELECT id FROM banks WHERE code = 'ARVAND'),
  (SELECT id FROM loan_products WHERE code = 'MSME_WOMEN'),
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid,
  100000.00,
  'TJS',
  30,
  'Retail store inventory and renovation',
  'approved_by_prsf',
  NOW() - INTERVAL '15 days',
  NOW() - INTERVAL '12 days',
  NOW() - INTERVAL '7 days',
  NOW() - INTERVAL '15 days',
  NOW() - INTERVAL '7 days'
)
ON CONFLICT (id) DO NOTHING;

-- Loan Application #4: Fully Approved and Confirmed
INSERT INTO loan_applications (
  id,
  borrower_application_id,
  bank_id,
  loan_product_id,
  bank_officer_id,
  prsf_analyst_id,
  requested_loan_amount,
  requested_loan_currency,
  loan_term_months,
  business_purpose,
  status,
  submitted_at,
  prsf_review_started_at,
  prsf_approved_at,
  bank_confirmed_at,
  created_at,
  updated_at
)
VALUES (
  'loan-0004-0000-0000-0000-000000000004'::uuid,
  'app-00003-0000-0000-0000-000000000003'::uuid,
  (SELECT id FROM banks WHERE code = 'ESKHATA'),
  (SELECT id FROM loan_products WHERE code = 'MSME_GREEN'),
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid,
  120000.00,
  'TJS',
  24,
  'Green technology investment - solar panels',
  'confirmed',
  NOW() - INTERVAL '30 days',
  NOW() - INTERVAL '27 days',
  NOW() - INTERVAL '20 days',
  NOW() - INTERVAL '5 days',
  NOW() - INTERVAL '30 days',
  NOW() - INTERVAL '5 days'
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- STAGE 6: CREATE LOAN APPROVALS (Audit trail and approvals workflow)
-- ============================================================================

-- Approval #1: First loan submitted to PRSF
INSERT INTO loan_approvals (
  id,
  loan_application_id,
  approval_type,
  approved_by_id,
  approval_date,
  status,
  comments,
  created_at
)
VALUES (
  'appr-0001-0000-0000-0000-000000000001'::uuid,
  'loan-0002-0000-0000-0000-000000000002'::uuid,
  'prsf_analyst_review',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid,
  NOW() - INTERVAL '1 day',
  'under_review',
  'Pending document verification from bank',
  NOW()
)
ON CONFLICT (id) DO NOTHING;

-- Approval #2: Second loan approved by PRSF analyst
INSERT INTO loan_approvals (
  id,
  loan_application_id,
  approval_type,
  approved_by_id,
  approval_date,
  status,
  comments,
  created_at
)
VALUES (
  'appr-0002-0000-0000-0000-000000000002'::uuid,
  'loan-0003-0000-0000-0000-000000000003'::uuid,
  'prsf_analyst_review',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid,
  NOW() - INTERVAL '7 days',
  'approved',
  'All documentation complete and verified. Recommend approval.',
  NOW()
)
ON CONFLICT (id) DO NOTHING;

-- Approval #3: Auditor review for final approved loan
INSERT INTO loan_approvals (
  id,
  loan_application_id,
  approval_type,
  approved_by_id,
  approval_date,
  status,
  comments,
  created_at
)
VALUES (
  'appr-0003-0000-0000-0000-000000000003'::uuid,
  'loan-0004-0000-0000-0000-000000000004'::uuid,
  'auditor_review',
  'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid,
  NOW() - INTERVAL '5 days',
  'approved',
  'Portfolio audit passed. Loan parameters within acceptable risk range.',
  NOW()
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- VERIFY TEST DATA WAS CREATED
-- ============================================================================

SELECT 'TEST DATA CREATION SUMMARY' as section;

SELECT COUNT(*) as total_system_users FROM profiles WHERE role_id IS NOT NULL;
SELECT COUNT(*) as total_borrower_profiles FROM profiles WHERE role_id IS NULL AND is_active = true;
SELECT COUNT(*) as total_borrower_applications FROM borrower_applications;
SELECT COUNT(*) as total_loan_applications FROM loan_applications;
SELECT COUNT(*) as total_loan_approvals FROM loan_approvals;

-- Show created test users
SELECT 'SYSTEM USERS' as type, email, first_name, last_name, (SELECT name_en FROM roles WHERE id = profiles.role_id) as role
FROM profiles WHERE role_id IS NOT NULL ORDER BY created_at;

-- Show borrower applications at each stage
SELECT 'BORROWER APPLICATIONS BY STATUS' as type;
SELECT status, COUNT(*) as count FROM borrower_applications GROUP BY status;

-- Show loan applications at each stage
SELECT 'LOAN APPLICATIONS BY STATUS' as type;
SELECT status, COUNT(*) as count FROM loan_applications GROUP BY status;
