import { z } from 'zod'

export const createUserSchema = z.object({
  email: z.string().trim().email().max(255).transform(value => value.toLowerCase()),
  password: z.string().min(8).max(128),
  firstName: z.string().trim().max(255).optional(),
  lastName: z.string().trim().max(255).optional(),
  roleId: z.string().uuid(),
  bankId: z.string().uuid().optional(),
  branchId: z.string().uuid().optional(),
  phone: z.string().trim().max(50).optional(),
  preferredLanguage: z.enum(['en', 'ru', 'tj']).optional(),
}).strict()

export const resetPasswordSchema = z.object({
  userId: z.string().uuid(),
  password: z.string().min(8).max(128),
}).strict()
