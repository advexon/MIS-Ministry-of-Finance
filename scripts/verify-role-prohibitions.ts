import assert from 'node:assert/strict'
import { hasPermission, getResourcePermissions, type PermissionOverrides } from '@/lib/utils/permissions'
import type { Role } from '@/lib/types/database'

const role = (code: string, tier: number) => ({ code, tier } as Role)
const grants: PermissionOverrides = Object.fromEntries(['loans', 'claims', 'users', 'reports'].map(resource => [resource, {
  resource, can_view: true, can_create: true, can_update: true, can_delete: true, can_approve: true,
}]))
let assertions = 0
function check(actual: unknown, expected: unknown) {
  assert.equal(actual, expected)
  assertions++
}
for (const code of ['super_admin', 'prsf_admin']) {
  for (const resource of ['loans', 'claims']) {
    for (const overrides of [null, grants, {}]) {
      const admin = role(code, code === 'super_admin' ? 1 : 2)
      check(hasPermission(admin, resource, 'approve', overrides), false)
      check(getResourcePermissions(admin, resource, overrides)?.can_approve ?? false, false)
    }
  }
}
for (const tier of [1, 4]) {
  for (const resource of Object.keys(grants)) {
    for (const permission of ['create', 'update', 'delete', 'approve'] as const) {
      check(hasPermission(role('auditor', tier), resource, permission, grants), false)
    }
    check(hasPermission(role('auditor', tier), resource, 'view', grants), true)
  }
}
check(hasPermission(role('prsf_analyst', 3), 'loans', 'update', {}), false)
check(hasPermission(role('prsf_analyst', 3), 'loans', 'update', grants), true)
check(hasPermission(role('super_admin', 1), 'users', 'update', grants), true)
check(hasPermission(null, 'loans', 'view', grants), false)
console.log(`Role prohibition checks: ${assertions} assertions passed`)
