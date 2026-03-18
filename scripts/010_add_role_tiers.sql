-- Add tier-based role system for hierarchical permissions
-- Tier 1 = highest authority (Superadmin), higher numbers = lower authority

-- Add tier column to roles table
ALTER TABLE roles ADD COLUMN IF NOT EXISTS tier INTEGER DEFAULT 99;

-- Add description column for role purposes
ALTER TABLE roles ADD COLUMN IF NOT EXISTS description TEXT;

-- Add is_active flag to roles
ALTER TABLE roles ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Add max_loan_approval_amount for amount-based workflow routing
ALTER TABLE roles ADD COLUMN IF NOT EXISTS max_loan_approval_amount DECIMAL(15,2);

-- Add can_approve_any_amount flag for superadmins
ALTER TABLE roles ADD COLUMN IF NOT EXISTS can_approve_any_amount BOOLEAN DEFAULT false;

-- Update existing roles with tier levels and descriptions
-- Tier 1: Superadmin (full system access)
UPDATE roles SET 
  tier = 1, 
  description = 'Full system access with all permissions. Can manage all users, roles, and system settings.',
  can_approve_any_amount = true
WHERE code = 'admin';

-- Tier 2: PRSF Director (executive oversight)
UPDATE roles SET 
  tier = 2, 
  description = 'PRSF executive with approval authority for high-value loans and claims. Can view all data and approve decisions.',
  max_loan_approval_amount = NULL, -- unlimited within PRSF scope
  can_approve_any_amount = true
WHERE code = 'prsf_director';

-- Tier 3: PRSF Management (operational management)
UPDATE roles SET 
  tier = 3, 
  description = 'PRSF accountant responsible for fee management, financial tracking, and reporting.',
  max_loan_approval_amount = 500000
WHERE code = 'prsf_accountant';

-- Tier 4: PRSF Analysts (operational staff)
UPDATE roles SET 
  tier = 4, 
  description = 'Credit analyst reviewing loan applications and providing recommendations.',
  max_loan_approval_amount = 100000
WHERE code = 'prsf_analyst';

UPDATE roles SET 
  tier = 4, 
  description = 'Reporter with access to generate and export system reports.',
  max_loan_approval_amount = NULL
WHERE code = 'prsf_reporter';

-- Tier 5: External oversight
UPDATE roles SET 
  tier = 5, 
  description = 'External auditor with read-only access to all records and audit trails.',
  max_loan_approval_amount = NULL
WHERE code = 'auditor';

-- Tier 6: Bank Management
UPDATE roles SET 
  tier = 6, 
  description = 'Bank manager who can submit loans, reports, and claims for their institution.',
  max_loan_approval_amount = NULL
WHERE code = 'bank_manager';

-- Tier 7: Bank Staff
UPDATE roles SET 
  tier = 7, 
  description = 'Bank employee who can view and submit loan applications for their bank.',
  max_loan_approval_amount = NULL
WHERE code = 'bank_employee';

-- Insert new superadmin role if it doesn't exist
INSERT INTO roles (code, name_en, name_ru, name_tj, permissions, tier, description, can_approve_any_amount) 
VALUES (
  'superadmin', 
  'Super Administrator', 
  'Суперадминистратор', 
  'Суперадминистратор', 
  '["all", "manage_roles", "manage_system", "manage_users", "view_audit", "delete_data"]',
  1,
  'Highest authority with complete system control including role management and system configuration.',
  true
)
ON CONFLICT (code) DO UPDATE SET
  tier = 1,
  description = EXCLUDED.description,
  can_approve_any_amount = true,
  permissions = EXCLUDED.permissions;

-- Insert viewer role for read-only access
INSERT INTO roles (code, name_en, name_ru, name_tj, permissions, tier, description) 
VALUES (
  'viewer', 
  'Viewer', 
  'Наблюдатель', 
  'Мушоҳидакунанда', 
  '["view_loans", "view_reports"]',
  8,
  'Read-only access to view loan data and reports without modification rights.'
)
ON CONFLICT (code) DO UPDATE SET
  tier = 8,
  description = EXCLUDED.description;

-- Create role_permissions reference table for granular permission definitions
CREATE TABLE IF NOT EXISTS role_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(100) UNIQUE NOT NULL,
  name_en VARCHAR(255) NOT NULL,
  name_ru VARCHAR(255),
  name_tj VARCHAR(255),
  description TEXT,
  category VARCHAR(50), -- 'loans', 'users', 'reports', 'system', 'claims', 'fees'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert permission definitions
INSERT INTO role_permissions (code, name_en, category, description) VALUES
  -- System permissions
  ('all', 'Full Access', 'system', 'Complete access to all system features'),
  ('manage_system', 'Manage System Settings', 'system', 'Configure system-wide settings'),
  ('manage_roles', 'Manage Roles', 'system', 'Create, edit, and delete user roles'),
  ('view_audit', 'View Audit Trail', 'system', 'Access to audit logs and activity history'),
  ('delete_data', 'Delete Data', 'system', 'Permanently delete records'),
  
  -- User permissions
  ('manage_users', 'Manage Users', 'users', 'Create, edit, and deactivate user accounts'),
  ('view_users', 'View Users', 'users', 'View user list and profiles'),
  
  -- Loan permissions
  ('view_all', 'View All Loans', 'loans', 'View all loan applications regardless of bank'),
  ('view_loans', 'View Loans', 'loans', 'View loan applications'),
  ('view_own_loans', 'View Own Bank Loans', 'loans', 'View only loans from own bank'),
  ('submit_loans', 'Submit Loans', 'loans', 'Submit new loan applications'),
  ('review_loans', 'Review Loans', 'loans', 'Review and provide recommendations on loans'),
  ('approve_loans', 'Approve Loans', 'loans', 'Final approval authority for loans'),
  ('reject_loans', 'Reject Loans', 'loans', 'Reject loan applications'),
  
  -- Claims permissions
  ('manage_claims', 'Manage Claims', 'claims', 'Full claim management including approval'),
  ('submit_claims', 'Submit Claims', 'claims', 'Submit new guarantee claims'),
  ('view_claims', 'View Claims', 'claims', 'View claim records'),
  
  -- Fee permissions
  ('manage_fees', 'Manage Fees', 'fees', 'Manage fee invoicing and payments'),
  ('view_fees', 'View Fees', 'fees', 'View fee records'),
  
  -- Report permissions
  ('view_reports', 'View Reports', 'reports', 'Access to reporting dashboards'),
  ('export_reports', 'Export Reports', 'reports', 'Export reports to various formats'),
  ('submit_reports', 'Submit Reports', 'reports', 'Submit periodic reports')
ON CONFLICT (code) DO NOTHING;

-- Create index for faster tier-based queries
CREATE INDEX IF NOT EXISTS idx_roles_tier ON roles(tier);

-- Add comment explaining the tier system
COMMENT ON COLUMN roles.tier IS 'Role hierarchy tier: 1=Superadmin (highest), incrementing for lower authority levels. Used for permission inheritance and access control.';
