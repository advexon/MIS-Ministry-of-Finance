import { z } from 'zod'

export const workflowRequestSchema = z.object({
  to: z.string().min(1).max(64),
  reason: z.string().trim().max(4000).optional(),
  payload: z.object({
    uko_reference_no: z.string().trim().max(255).nullable().optional(),
    usd_rate: z.number().finite().positive(),
  }).strict().optional(),
  screening: z.object({
    eligible: z.boolean(),
    esms: z.boolean(),
    kyc: z.boolean(),
    sanctions: z.boolean(),
    docs: z.boolean(),
  }).strict().optional(),
}).strict()
