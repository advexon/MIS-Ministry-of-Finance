import assert from 'node:assert/strict'
import { createUserSchema, resetPasswordSchema } from '@/lib/admin/accounts'
import { notificationHref, validationAlertSchema } from '@/lib/notifications'

const userId = '00000000-0000-4000-8000-000000000001'
const account = { email: ' Staff@fund.tj ', password: 'valid-password', roleId: userId }
assert.equal(createUserSchema.parse(account).email, 'staff@fund.tj')
for (const change of [
  { email: 'not-an-email' }, { password: 'short' }, { password: 'x'.repeat(129) },
  { roleId: undefined }, { roleId: 'administrator' }, { bankId: 'other-bank' },
  { preferredLanguage: 'unknown' }, { app_metadata: { account_provisioning: 'administrator' } },
]) {
  assert.equal(createUserSchema.safeParse({ ...account, ...change }).success, false)
}
assert.equal(resetPasswordSchema.safeParse({ userId, password: 'valid-password' }).success, true)
for (const body of [
  { userId, password: 'short' }, { userId: 'someone-else', password: 'valid-password' },
  { userId, password: 'valid-password', roleId: userId },
]) assert.equal(resetPasswordSchema.safeParse(body).success, false)

const alert = { loanApplicationId: userId, validationErrors: [{ label: 'Amount', error: 'Required' }] }
assert.equal(validationAlertSchema.safeParse(alert).success, true)
for (const change of [
  { loanApplicationId: '../other' }, { validationErrors: [] }, { validationErrors: 'invalid' },
  { validationErrors: Array.from({ length: 101 }, () => ({})) },
  { assignedOfficerId: 'other-person' }, { reviewerNotes: 'x'.repeat(5001) },
]) assert.equal(validationAlertSchema.safeParse({ ...alert, ...change }).success, false)

assert.equal(notificationHref('/dashboard/loans/123'), '/dashboard/loans/123')
assert.equal(notificationHref('/dashboard/guarantee-reports/123'), '/dashboard/guarantee-reports/123')
for (const link of [null, '', 'https://external.test', '//external.test', 'javascript:alert(1)', '/dashboard\\external', '/dashboard/\nunsafe']) {
  assert.equal(notificationHref(link), '/dashboard')
}
console.log('Internal account, notification input, and safe-link checks passed')
