# Comprehensive User Access Control (RBAC) System

## Overview
A production-ready Role-Based Access Control system has been implemented across the platform to enforce strict limitations on user permissions. Only users with the 'superadmin' role (Tier 1) have unrestricted access to all functionalities and sensitive data. All other user roles are assigned specific, limited permissions based on their designated responsibilities and tier levels.

## Architecture

### 1. Database Schema

#### access_logs Table
Immutable audit trail table that logs all access attempts:
- `id`: UUID (primary key)
- `user_id`: UUID (references profiles.id)
- `action`: VARCHAR(50) - HTTP method or action type (GET, POST, UPDATE, DELETE, APPROVE, etc.)
- `resource`: VARCHAR(100) - Resource being accessed (users, loans, claims, fees, banks, reports, audit_logs, access_logs)
- `resource_id`: UUID - Optional ID of specific resource being accessed
- `ip_address`: INET - User's IP address (for security tracking)
- `user_agent`: TEXT - Browser/client information
- `success`: BOOLEAN - Whether access was allowed
- `failure_reason`: TEXT - Reason for denial if denied
- `metadata`: JSONB - Additional context (path, query params, etc.)
- `created_at`: TIMESTAMPTZ - Timestamp of access attempt

**Indexes**: user_id, action, resource, created_at DESC
**RLS Policies**:
- Users can view their own logs; admins (tier ≤ 2) can view all
- Immutable: no updates/deletes allowed (audit trail integrity)

#### role_permissions Table
Links roles to specific resource permissions:
- `id`: UUID (primary key)
- `role_id`: UUID (references roles.id)
- `resource`: VARCHAR(100)
- `can_view`: BOOLEAN (default: false)
- `can_create`: BOOLEAN (default: false)
- `can_update`: BOOLEAN (default: false)
- `can_delete`: BOOLEAN (default: false)
- `can_approve`: BOOLEAN (default: false)
- `created_at`: TIMESTAMPTZ
- UNIQUE(role_id, resource)

**RLS Policies**: Only admins (tier ≤ 2) can view/modify

#### Updated roles Table
New columns added for tier-based access:
- `tier`: INTEGER (NOT NULL) - 1=highest authority (Superadmin), incrementing downward
- `description`: TEXT - Role description and purpose
- `is_active`: BOOLEAN - Soft-delete capability
- `max_loan_approval_amount`: NUMERIC(15,2) - Maximum loan amount user can approve (NULL = unlimited)
- `can_approve_any_amount`: BOOLEAN - Override max_loan_approval_amount

### 2. Role Tier Hierarchy

| Tier | Role Code | Name | Key Features |
|------|-----------|------|--------------|
| 1 | super_admin | Superadmin | Full system access, bypass all permission checks |
| 2 | prsf_admin | PRSF Admin | Manage PRSF operations, unlimited approvals |
| 4 | prsf_analyst | PRSF Analyst | Analyze loans, up to 100,000 TJS approval |
| 5 | auditor | Auditor | Read-only compliance access |
| 6 | bank_admin | Bank Admin | Manage bank staff, up to 500,000 TJS approval |
| 7 | bank_officer | Bank Officer | Submit loans, read-only access |

*Note: Tier 3 is reserved for future use (e.g., PRSF Manager)*

### 3. Permission Matrix

**Superadmin (Tier 1)**: All permissions on all resources
**PRSF Admin (Tier 2)**: 
- Users: view, create, update
- Loans: view, update, approve
- Claims: view, update, approve
- Fees: view, create, update
- Banks: view
- Reports: view, create
- Audit Logs: view

**PRSF Analyst (Tier 4)**:
- Loans: view, update
- Claims: view
- Reports: view, create

**Auditor (Tier 5)**:
- Loans, Claims, Banks, Users, Fees: view only
- Audit Logs, Access Logs: view

**Bank Admin (Tier 6)**:
- Users: view, create, update
- Loans: view, create, update
- Claims: view
- Reports: view

**Bank Officer (Tier 7)**:
- Loans: view, create
- Claims: view
- Reports: view

## Implementation Details

### 1. Core Utilities (`lib/utils/permissions.ts`)

**Key Functions:**

- `hasPermission(role, resource, permission)` - Check single permission
- `hasAllPermissions(role, resource, permissions)` - Check ALL required permissions
- `hasAnyPermission(role, resource, permissions)` - Check ANY permission
- `logAccessAttempt(...)` - Record access attempt in audit trail
- `canManageRole(userRole, targetRoleId, allRoles)` - Privilege escalation prevention
- `getAccessibleResources(role)` - Get all resources a role can access
- `getResourcePermissions(role, resource)` - Get full permission object for resource

**Superadmin Bypass**: `hasPermission()` automatically returns true for tier 1 users on all resources.

**Privilege Escalation Prevention**: `canManageRole()` ensures users can only assign roles with HIGHER tier numbers (lower authority) than their own.

### 2. API Protection (`lib/middleware/api-protection.ts`)

**`withPermission()` / `protect()` wrapper:**
- Authenticates user via Supabase
- Fetches user profile with role
- Checks permissions
- Logs all access attempts (success/failure)
- Returns 401 if not authenticated
- Returns 403 if insufficient permissions
- Automatically injects `user` and `profile` into handler context

**Usage:**
```typescript
export const POST = protect(
  { resource: 'loans', permission: 'approve' },
  async (req, { user, profile }) => {
    // Handler code with user context
  }
)
```

### 3. React Permission Context (`lib/contexts/permission-context.tsx`)

**PermissionProvider**: Wraps dashboard with permission context
**usePermissions()**: Hook to access permission context
**useCan(resource, permission)**: Check permission in component
**useResourcePermissions(resource)**: Get full permission object

**UI Components:**
- `<CanAccess resource="loans" permission="create">Content</CanAccess>` - Conditional rendering
- `<AdminOnly>Content</AdminOnly>` - Only tier 1
- `<PRSFStaffOnly>Content</PRSFStaffOnly>` - PRSF staff only
- `<BankStaffOnly>Content</BankStaffOnly>` - Bank staff only

### 4. Middleware Integration (`middleware.ts`)

Route protection matrix defines which resources each route protects. Actual permission checking is delegated to individual pages/components via `usePermissions()` hook for flexibility and better error handling.

### 5. Dashboard Layout (`app/dashboard/layout.tsx`)

Server-side layout component fetches user profile with role and wraps dashboard shell with PermissionProvider, making permissions available to all child components.

## Security Features

### 1. Privilege Escalation Prevention
- Users can only assign roles with tier numbers > their own (lower authority)
- Superadmin (tier 1) can assign any role
- Role creation/deletion requires tier ≤ 2

### 2. Immutable Audit Trail
- `access_logs` table cannot be updated/deleted (RLS policies enforce)
- All access attempts logged automatically by API wrapper
- Includes: user, action, resource, timestamp, IP, user-agent, success/failure reason

### 3. Multi-layer Permission Checking
- Database: RLS policies on sensitive tables
- API: Middleware checks before handler execution
- Frontend: UI components conditionally render based on permissions
- Components: Manual checks with clear fallback UI

### 4. Automatic Access Logging
- API wrapper logs all attempts (success/failure)
- Error messages include access denial reason
- Audit trail survives system restarts (database persistent)

## Usage Examples

### Frontend: Check Permission
```typescript
import { usePermissions, CanAccess } from '@/lib/contexts/permission-context'

function MyComponent() {
  const { can, role } = usePermissions()
  
  if (!can('loans', 'approve')) {
    return <div>Insufficient permissions</div>
  }
  
  return <CanAccess resource="loans" permission="create">
    <button>Create Loan</button>
  </CanAccess>
}
```

### API Route: Protected Endpoint
```typescript
import { protect } from '@/lib/middleware/api-protection'

export const POST = protect(
  { resource: 'loans', permission: 'create' },
  async (req, { user, profile }) => {
    // user: Supabase Auth user
    // profile: User profile with role
    // Request has been authenticated and authorized
  }
)
```

### Prevent Privilege Escalation
```typescript
import { canManageRole } from '@/lib/utils/permissions'

if (!canManageRole(currentUserRole, targetRoleId, allRoles)) {
  // User cannot assign this role
}
```

## Maintaining RBAC

### Adding New Roles
1. Insert into `roles` table with appropriate tier
2. Populate `role_permissions` for each resource
3. Update `ROLE_TIERS` and `ROLE_CODES` constants in `lib/types/database.ts`
4. Update `PERMISSION_MATRIX` in `lib/utils/permissions.ts`

### Adding New Resources
1. Add resource to `PERMISSION_MATRIX` for each role that needs access
2. Use `hasPermission(role, 'resource_name', permission)` in components
3. Protect API endpoints with `protect({ resource: 'resource_name', ... })`

### Auditing Access
Query `access_logs` table:
```sql
-- View all denied access attempts
SELECT * FROM access_logs WHERE success = false ORDER BY created_at DESC;

-- View user's access history
SELECT * FROM access_logs WHERE user_id = 'user_id' ORDER BY created_at DESC;

-- View approval actions
SELECT * FROM access_logs WHERE action = 'APPROVE' ORDER BY created_at DESC;
```

## Key Design Decisions

1. **Tier-based hierarchy**: Superadmin (tier 1) has implicit bypass; all checks use `tier ≤ X` comparison
2. **Permission matrix in code**: Single source of truth for permissions; easy to review and audit
3. **API wrapper pattern**: Automatic logging and permission checking; reduces boilerplate
4. **React context**: Permission context available to all components without prop drilling
5. **Immutable audit logs**: RLS policies prevent tampering; database-level enforcement
6. **Lazy privilege escalation checks**: Only checked when assigning roles, not on every action

## Future Enhancements

- Role-based field-level access control (hide sensitive columns from certain roles)
- Time-based permissions (e.g., approve only during business hours)
- Delegation system (temporarily grant permissions to another user)
- Permission analytics dashboard
- Rate limiting per role (e.g., max 100 approvals/day)
