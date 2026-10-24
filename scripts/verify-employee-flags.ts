import assert from "node:assert/strict"
import { employeeFlagUpdateError, userUpdateSchema } from "@/lib/employee-flags"

const userId = "123e4567-e89b-42d3-a456-426614174000"
const admin = { userId: "another-user", roleCode: "super_admin", isBankScoped: false }
assert.equal(userUpdateSchema.safeParse({ userId }).success, false)
assert.equal(userUpdateSchema.safeParse({ userId, role_id: null }).success, false)
assert.equal(userUpdateSchema.safeParse({ userId, is_active: "false" }).success, false)
assert.equal(userUpdateSchema.safeParse({ userId, is_loan_committee_member: "true" }).success, false)
assert.equal(userUpdateSchema.safeParse({ userId, specialist_level: "director" }).success, false)
assert.equal(userUpdateSchema.safeParse({ userId, product_tags: [""] }).success, false)
assert.equal(userUpdateSchema.safeParse({ userId, unexpected_permission: true }).success, false)
assert.equal(userUpdateSchema.safeParse({ userId, first_name: "Jane" }).success, true)
assert.deepEqual(userUpdateSchema.parse({ userId, product_tags: [" SME ", "SME"] }).product_tags, ["SME"])
const flags = { is_loan_committee_member: true }
assert.equal(employeeFlagUpdateError(flags, admin, userId), null)
assert.ok(employeeFlagUpdateError(flags, { ...admin, userId }, userId))
assert.ok(employeeFlagUpdateError(flags, { ...admin, roleCode: "bank_admin", isBankScoped: true }, userId))
assert.ok(employeeFlagUpdateError(flags, { ...admin, roleCode: "prsf_analyst" }, userId))
assert.ok(employeeFlagUpdateError({ is_loan_committee_member: false }, { ...admin, roleCode: "auditor" }, userId))
assert.equal(employeeFlagUpdateError({}, { ...admin, roleCode: "bank_admin", isBankScoped: true }, userId), null)
console.log("Employee flag validation and authorization: 15 assertions passed")
