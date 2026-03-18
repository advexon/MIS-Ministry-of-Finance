-- =============================================
-- Access Control System Migration
-- =============================================

-- 1. Create access_logs table for audit trail
CREATE TABLE IF NOT EXISTS access_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  action VARCHAR(50) NOT NULL,           -- 'login', 'logout', 'view', 'create', 'update', 'delete', 'access_denied'
  resource VARCHAR(100) NOT NULL,        -- 'loans', 'users', 'claims', 'banks', 'fees', 'reports', 'settings', 'auth'
  resource_id UUID,                      -- ID of the specific resource accessed
  ip_address INET,
  user_agent TEXT,
  success BOOLEAN DEFAULT true,
  failure_reason TEXT,
  metadata JSONB DEFAULT '{}',           -- Additional context (e.g., query params, changed fields)
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_access_logs_user_id ON access_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_access_logs_action ON access_logs(action);
CREATE INDEX IF NOT EXISTS idx_access_logs_resource ON access_logs(resource);
CREATE INDEX IF NOT EXISTS idx_access_logs_created_at ON access_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_access_logs_success ON access_logs(success) WHERE success = false;

-- 2. Create role_permissions table for fine-grained RBAC
CREATE TABLE IF NOT EXISTS role_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  resource VARCHAR(50) NOT NULL,         -- 'loans', 'users', 'claims', 'banks', 'fees', 'reports', 'settings', 'audit'
  can_view BOOLEAN DEFAULT false,
  can_create BOOLEAN DEFAULT false,
  can_update BOOLEAN DEFAULT false,
  can_delete BOOLEAN DEFAULT false,
  conditions JSONB DEFAULT '{}',         -- e.g., {"own_bank_only": true, "max_amount": 100000}
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(role_id, resource)
);

CREATE INDEX IF NOT EXISTS idx_role_permissions_role_id ON role_permissions(role_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_resource ON role_permissions(resource);

-- 3. Seed role permissions based on the tier system
-- First, get role IDs
DO $$
DECLARE
  v_super_admin_id UUID;
  v_prsf_admin_id UUID;
  v_prsf_analyst_id UUID;
  v_auditor_id UUID;
  v_bank_admin_id UUID;
  v_bank_officer_id UUID;
BEGIN
  SELECT id INTO v_super_admin_id FROM roles WHERE code = 'super_admin';
  SELECT id INTO v_prsf_admin_id FROM roles WHERE code = 'prsf_admin';
  SELECT id INTO v_prsf_analyst_id FROM roles WHERE code = 'prsf_analyst';
  SELECT id INTO v_auditor_id FROM roles WHERE code = 'auditor';
  SELECT id INTO v_bank_admin_id FROM roles WHERE code = 'bank_admin';
  SELECT id INTO v_bank_officer_id FROM roles WHERE code = 'bank_officer';

  -- Super Admin: Full access to everything
  INSERT INTO role_permissions (role_id, resource, can_view, can_create, can_update, can_delete, conditions)
  VALUES
    (v_super_admin_id, 'users', true, true, true, true, '{}'),
    (v_super_admin_id, 'loans', true, true, true, true, '{}'),
    (v_super_admin_id, 'claims', true, true, true, true, '{}'),
    (v_super_admin_id, 'fees', true, true, true, true, '{}'),
    (v_super_admin_id, 'banks', true, true, true, true, '{}'),
    (v_super_admin_id, 'products', true, true, true, true, '{}'),
    (v_super_admin_id, 'reports', true, true, true, true, '{}'),
    (v_super_admin_id, 'settings', true, true, true, true, '{}'),
    (v_super_admin_id, 'audit', true, false, false, false, '{}'),
    (v_super_admin_id, 'recoveries', true, true, true, true, '{}')
  ON CONFLICT (role_id, resource) DO NOTHING;

  -- PRSF Admin: Full access except settings delete, can manage lower tier users
  INSERT INTO role_permissions (role_id, resource, can_view, can_create, can_update, can_delete, conditions)
  VALUES
    (v_prsf_admin_id, 'users', true, true, true, true, '{"max_assignable_tier": 3}'),
    (v_prsf_admin_id, 'loans', true, true, true, true, '{}'),
    (v_prsf_admin_id, 'claims', true, true, true, true, '{}'),
    (v_prsf_admin_id, 'fees', true, true, true, true, '{}'),
    (v_prsf_admin_id, 'banks', true, true, true, true, '{}'),
    (v_prsf_admin_id, 'products', true, true, true, true, '{}'),
    (v_prsf_admin_id, 'reports', true, true, true, false, '{}'),
    (v_prsf_admin_id, 'settings', true, false, false, false, '{}'),
    (v_prsf_admin_id, 'audit', true, false, false, false, '{}'),
    (v_prsf_admin_id, 'recoveries', true, true, true, true, '{}')
  ON CONFLICT (role_id, resource) DO NOTHING;

  -- PRSF Analyst: Can view most things, create/update loans with amount limits
  INSERT INTO role_permissions (role_id, resource, can_view, can_create, can_update, can_delete, conditions)
  VALUES
    (v_prsf_analyst_id, 'users', true, false, false, false, '{}'),
    (v_prsf_analyst_id, 'loans', true, true, true, false, '{"max_approval_amount": 100000}'),
    (v_prsf_analyst_id, 'claims', true, true, true, false, '{}'),
    (v_prsf_analyst_id, 'fees', true, false, false, false, '{}'),
    (v_prsf_analyst_id, 'banks', true, false, false, false, '{}'),
    (v_prsf_analyst_id, 'products', true, false, false, false, '{}'),
    (v_prsf_analyst_id, 'reports', true, true, false, false, '{}'),
    (v_prsf_analyst_id, 'settings', false, false, false, false, '{}'),
    (v_prsf_analyst_id, 'audit', false, false, false, false, '{}'),
    (v_prsf_analyst_id, 'recoveries', true, true, true, false, '{}')
  ON CONFLICT (role_id, resource) DO NOTHING;

  -- Auditor: Read-only access to most things
  INSERT INTO role_permissions (role_id, resource, can_view, can_create, can_update, can_delete, conditions)
  VALUES
    (v_auditor_id, 'users', true, false, false, false, '{}'),
    (v_auditor_id, 'loans', true, false, false, false, '{}'),
    (v_auditor_id, 'claims', true, false, false, false, '{}'),
    (v_auditor_id, 'fees', true, false, false, false, '{}'),
    (v_auditor_id, 'banks', true, false, false, false, '{}'),
    (v_auditor_id, 'products', true, false, false, false, '{}'),
    (v_auditor_id, 'reports', true, false, false, false, '{}'),
    (v_auditor_id, 'settings', false, false, false, false, '{}'),
    (v_auditor_id, 'audit', true, false, false, false, '{}'),
    (v_auditor_id, 'recoveries', true, false, false, false, '{}')
  ON CONFLICT (role_id, resource) DO NOTHING;

  -- Bank Admin: Manage bank operations, limited to own bank
  INSERT INTO role_permissions (role_id, resource, can_view, can_create, can_update, can_delete, conditions)
  VALUES
    (v_bank_admin_id, 'users', true, true, true, false, '{"own_bank_only": true, "max_assignable_tier": 7}'),
    (v_bank_admin_id, 'loans', true, true, true, false, '{"own_bank_only": true, "max_approval_amount": 500000}'),
    (v_bank_admin_id, 'claims', true, false, false, false, '{"own_bank_only": true}'),
    (v_bank_admin_id, 'fees', true, false, false, false, '{}'),
    (v_bank_admin_id, 'banks', true, false, false, false, '{"own_bank_only": true}'),
    (v_bank_admin_id, 'products', true, false, false, false, '{}'),
    (v_bank_admin_id, 'reports', true, true, false, false, '{"own_bank_only": true}'),
    (v_bank_admin_id, 'settings', false, false, false, false, '{}'),
    (v_bank_admin_id, 'audit', false, false, false, false, '{}'),
    (v_bank_admin_id, 'recoveries', true, false, false, false, '{"own_bank_only": true}')
  ON CONFLICT (role_id, resource) DO NOTHING;

  -- Bank Officer: Submit and track loans for own bank
  INSERT INTO role_permissions (role_id, resource, can_view, can_create, can_update, can_delete, conditions)
  VALUES
    (v_bank_officer_id, 'users', false, false, false, false, '{}'),
    (v_bank_officer_id, 'loans', true, true, false, false, '{"own_bank_only": true}'),
    (v_bank_officer_id, 'claims', true, false, false, false, '{"own_bank_only": true}'),
    (v_bank_officer_id, 'fees', true, false, false, false, '{}'),
    (v_bank_officer_id, 'banks', true, false, false, false, '{"own_bank_only": true}'),
    (v_bank_officer_id, 'products', true, false, false, false, '{}'),
    (v_bank_officer_id, 'reports', true, false, false, false, '{"own_bank_only": true}'),
    (v_bank_officer_id, 'settings', false, false, false, false, '{}'),
    (v_bank_officer_id, 'audit', false, false, false, false, '{}'),
    (v_bank_officer_id, 'recoveries', true, false, false, false, '{"own_bank_only": true}')
  ON CONFLICT (role_id, resource) DO NOTHING;
END $$;

-- 4. Enable RLS on access_logs (only superadmin and auditor can view)
ALTER TABLE access_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmin and auditor can view access logs" ON access_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles p
      JOIN roles r ON p.role_id = r.id
      WHERE p.id = auth.uid()
      AND r.code IN ('super_admin', 'prsf_admin', 'auditor')
    )
  );

CREATE POLICY "System can insert access logs" ON access_logs
  FOR INSERT WITH CHECK (true);

-- 5. Enable RLS on role_permissions (only superadmin can modify)
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view role permissions" ON role_permissions
  FOR SELECT USING (true);

CREATE POLICY "Only superadmin can modify role permissions" ON role_permissions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles p
      JOIN roles r ON p.role_id = r.id
      WHERE p.id = auth.uid()
      AND r.code = 'super_admin'
    )
  );

-- 6. Create function to check permission
CREATE OR REPLACE FUNCTION check_permission(
  p_user_id UUID,
  p_resource VARCHAR,
  p_action VARCHAR
) RETURNS BOOLEAN AS $$
DECLARE
  v_role_tier INTEGER;
  v_role_code VARCHAR;
  v_permission RECORD;
BEGIN
  -- Get user's role info
  SELECT r.tier, r.code INTO v_role_tier, v_role_code
  FROM profiles p
  JOIN roles r ON p.role_id = r.id
  WHERE p.id = p_user_id;

  -- Superadmin bypasses all checks
  IF v_role_code = 'super_admin' THEN
    RETURN TRUE;
  END IF;

  -- Get permission for this role and resource
  SELECT * INTO v_permission
  FROM role_permissions rp
  JOIN roles r ON rp.role_id = r.id
  JOIN profiles p ON p.role_id = r.id
  WHERE p.id = p_user_id AND rp.resource = p_resource;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- Check specific action
  CASE p_action
    WHEN 'view' THEN RETURN v_permission.can_view;
    WHEN 'create' THEN RETURN v_permission.can_create;
    WHEN 'update' THEN RETURN v_permission.can_update;
    WHEN 'delete' THEN RETURN v_permission.can_delete;
    ELSE RETURN FALSE;
  END CASE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Create function to log access attempts
CREATE OR REPLACE FUNCTION log_access(
  p_user_id UUID,
  p_action VARCHAR,
  p_resource VARCHAR,
  p_resource_id UUID DEFAULT NULL,
  p_success BOOLEAN DEFAULT TRUE,
  p_failure_reason TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'
) RETURNS UUID AS $$
DECLARE
  v_log_id UUID;
BEGIN
  INSERT INTO access_logs (user_id, action, resource, resource_id, success, failure_reason, metadata)
  VALUES (p_user_id, p_action, p_resource, p_resource_id, p_success, p_failure_reason, p_metadata)
  RETURNING id INTO v_log_id;
  
  RETURN v_log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
