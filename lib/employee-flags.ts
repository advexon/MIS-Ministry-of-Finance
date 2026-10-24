import { z } from "zod"

export const employeeFlagKeys = [
  "specialist_level",
  "department",
  "is_department_head",
  "is_loan_committee_member",
  "is_claims_committee_member",
  "is_committee_secretary",
  "product_tags",
] as const

export const employeeFlagsSchema = z.object({
  specialist_level: z.enum(["specialist", "chief_specialist"]).nullable().optional(),
  department: z.string().trim().min(1).max(100).nullable().optional(),
  is_department_head: z.boolean().optional(),
  is_loan_committee_member: z.boolean().optional(),
  is_claims_committee_member: z.boolean().optional(),
  is_committee_secretary: z.boolean().optional(),
  product_tags: z.array(z.string().trim().min(1).max(80)).max(30)
    .transform((tags) => [...new Set(tags)]).optional(),
})

export const userUpdateSchema = employeeFlagsSchema.extend({
  userId: z.string().uuid(),
  first_name: z.string().trim().max(255).nullable().optional(),
  last_name: z.string().trim().max(255).nullable().optional(),
  phone: z.string().trim().max(50).nullable().optional(),
  role_id: z.string().uuid().optional(),
  bank_id: z.string().uuid().nullable().optional(),
  is_active: z.boolean().optional(),
}).strict().refine((value) => Object.keys(value).some((key) => key !== "userId"), {
  message: "At least one profile field is required",
})

export function employeeFlagUpdateError(
  update: z.input<typeof employeeFlagsSchema>,
  caller: { userId: string; roleCode: string; isBankScoped: boolean },
  targetUserId: string,
): string | null {
  if (!employeeFlagKeys.some((key) => update[key] !== undefined)) return null
  if (caller.isBankScoped || !["super_admin", "prsf_admin"].includes(caller.roleCode)) {
    return "Only system administrators can change employee flags."
  }
  if (caller.userId === targetUserId) return "You cannot change your own employee flags."
  return null
}
