# Comprehensive Test Account Setup Guide

## Overview
This guide walks you through setting up comprehensive test accounts that span the entire onboarding workflow from application submission to user confirmation.

## Step 1: Create Auth Users in Supabase Console

You need to create 5 test users in Supabase Auth (https://supabase.com/dashboard):

### System Users (Bank & PRSF Staff)

1. **Bank Loan Officer**
   - Email: `banktest@test.tj`
   - Password: `Test@1234567`
   - Role: Bank Loan Officer at Agroinvestbank

2. **PRSF Analyst**
   - Email: `prsfanalyst@test.tj`
   - Password: `Test@1234567`
   - Role: Credit Analyst

3. **PRSF Auditor**
   - Email: `prsfreview@test.tj`
   - Password: `Test@1234567`
   - Role: Portfolio Auditor

### Borrower Users

4. **Individual Borrower**
   - Email: `borrower1@test.tj`
   - Password: `Test@1234567`
   - Business: Faridun Trading Company

5. **Company Borrower**
   - Email: `borrower2@test.tj`
   - Password: `Test@1234567`
   - Business: Tajik Agricultural Solutions LLC

## Step 2: Get the Created User IDs

After creating the auth users, their profiles will be auto-created by the trigger. Get their IDs from the Supabase console or run:

```sql
SELECT id, email FROM auth.users WHERE email LIKE '%test.tj%' ORDER BY created_at;
```

## Step 3: Create Borrower Applications

Copy the user IDs from Step 2, then run this SQL with the actual IDs:

```sql
-- Replace these with actual IDs from auth.users
-- BANK_OFFICER_ID, PRSF_ANALYST_ID, PRSF_AUDITOR_ID, BORROWER1_ID, BORROWER2_ID

-- Application 1: Individual - Just Submitted
INSERT INTO borrower_applications (
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
  submitted_at
)
VALUES (
  'BORROWER1_ID'::uuid,
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
  NOW()
);

-- Application 2: Company - Under Review
INSERT INTO borrower_applications (
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
  reviewed_at
)
VALUES (
  'BORROWER2_ID'::uuid,
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
  'PRSF_ANALYST_ID'::uuid,
  NOW() - INTERVAL '2 days'
);

-- Application 3: Individual - Approved
INSERT INTO borrower_applications (
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
  approved_at
)
VALUES (
  'BORROWER1_ID'::uuid,
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
  'borrower1@test.tj',
  'approved',
  NOW() - INTERVAL '20 days',
  'PRSF_ANALYST_ID'::uuid,
  NOW() - INTERVAL '15 days',
  'PRSF_AUDITOR_ID'::uuid,
  NOW() - INTERVAL '10 days'
);
```

## Step 4: Create Loan Applications

After borrower applications are created, create loan applications:

```sql
-- Loan 1: Just Submitted
INSERT INTO loan_applications (
  borrower_application_id,
  bank_id,
  loan_product_id,
  bank_officer_id,
  requested_loan_amount,
  requested_loan_currency,
  loan_term_months,
  business_purpose,
  status,
  submitted_at
)
SELECT
  (SELECT id FROM borrower_applications WHERE organization_name = 'Faridun Trading Company' LIMIT 1),
  (SELECT id FROM banks WHERE code = 'AGROINVEST'),
  (SELECT id FROM loan_products WHERE code = 'MSME_STANDARD'),
  'BANK_OFFICER_ID'::uuid,
  50000.00,
  'TJS',
  24,
  'Working capital for trading business expansion',
  'submitted',
  NOW();

-- Loan 2: Under PRSF Review
INSERT INTO loan_applications (
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
  prsf_review_started_at
)
SELECT
  (SELECT id FROM borrower_applications WHERE organization_name = 'Tajik Agricultural Solutions LLC' LIMIT 1),
  (SELECT id FROM banks WHERE code = 'AMONAT'),
  (SELECT id FROM loan_products WHERE code = 'MSME_AGRI'),
  'BANK_OFFICER_ID'::uuid,
  'PRSF_ANALYST_ID'::uuid,
  150000.00,
  'TJS',
  36,
  'Agricultural equipment and machinery purchase',
  'under_prsf_review',
  NOW() - INTERVAL '3 days',
  NOW() - INTERVAL '1 day';

-- Loan 3: PRSF Approved, Awaiting Bank Confirmation
INSERT INTO loan_applications (
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
  prsf_approved_at
)
SELECT
  (SELECT id FROM borrower_applications WHERE organization_name = 'Faridun Advanced Trade' LIMIT 1),
  (SELECT id FROM banks WHERE code = 'ARVAND'),
  (SELECT id FROM loan_products WHERE code = 'MSME_WOMEN'),
  'BANK_OFFICER_ID'::uuid,
  'PRSF_ANALYST_ID'::uuid,
  100000.00,
  'TJS',
  30,
  'Retail store inventory and renovation',
  'approved_by_prsf',
  NOW() - INTERVAL '15 days',
  NOW() - INTERVAL '12 days',
  NOW() - INTERVAL '7 days';

-- Loan 4: Fully Approved and Confirmed
INSERT INTO loan_applications (
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
  bank_confirmed_at
)
SELECT
  (SELECT id FROM borrower_applications WHERE organization_name = 'Faridun Advanced Trade' LIMIT 1),
  (SELECT id FROM banks WHERE code = 'ESKHATA'),
  (SELECT id FROM loan_products WHERE code = 'MSME_GREEN'),
  'BANK_OFFICER_ID'::uuid,
  'PRSF_ANALYST_ID'::uuid,
  120000.00,
  'TJS',
  24,
  'Green technology investment - solar panels',
  'confirmed',
  NOW() - INTERVAL '30 days',
  NOW() - INTERVAL '27 days',
  NOW() - INTERVAL '20 days',
  NOW() - INTERVAL '5 days';
```

## Test Account Workflows

### Workflow 1: Bank Officer Submits New Application
1. Login as: `banktest@test.tj` / `Test@1234567`
2. See Loan 1 in "submitted" status
3. Can update status to "under_prsf_review"
4. Receives confirmation email on status change

### Workflow 2: PRSF Analyst Reviews Application
1. Login as: `prsfanalyst@test.tj` / `Test@1234567`
2. See Loan 2 in "under_prsf_review" status
3. Can request additional documents
4. Can approve or reject application
5. Sends notifications to bank officer

### Workflow 3: PRSF Auditor Provides Final Review
1. Login as: `prsfreview@test.tj` / `Test@1234567`
2. See approved loans in "approved_by_prsf" status
3. Can perform portfolio audit
4. Can confirm or reject loan
5. Sends final confirmation to bank

### Workflow 4: Borrower Views Application Status
1. Login as: `borrower1@test.tj` / `Test@1234567` or `borrower2@test.tj`
2. See their submitted application(s)
3. Track loan application progress
4. Receive status update notifications

## Test Data Summary

**System Users:**
- Bank Loan Officer (Bank: Agroinvestbank)
- PRSF Analyst (Credit Analyst)
- PRSF Auditor (Portfolio Auditor)

**Borrower Applications (3):**
1. Faridun Trading Company - Status: `submitted`
2. Tajik Agricultural Solutions LLC - Status: `under_review`
3. Faridun Advanced Trade - Status: `approved`

**Loan Applications (4):**
1. 50,000 TJS - Status: `submitted`
2. 150,000 TJS - Status: `under_prsf_review`
3. 100,000 TJS - Status: `approved_by_prsf`
4. 120,000 TJS - Status: `confirmed`

**Loan Products Used:**
- MSME Standard Guarantee (50% coverage)
- MSME Agriculture Guarantee (55% coverage)
- MSME Women Entrepreneur Guarantee (60% coverage)
- MSME Green Finance Guarantee (60% coverage)

**Banks Involved:**
- Agroinvestbank
- Amonatbonk
- Arvand
- Bank Eskhata

This comprehensive test setup allows you to verify:
✓ User registration and profile creation
✓ Borrower application submission workflow
✓ Multi-stage loan application reviews
✓ Email notifications at each stage
✓ Permission-based access controls
✓ Status tracking and updates
✓ Role-based dashboards
✓ Document management
✓ Approval workflows with audit trails
