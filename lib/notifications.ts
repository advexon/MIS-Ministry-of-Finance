import { z } from 'zod'

export const validationAlertSchema = z.object({
  loanApplicationId: z.string().uuid(),
  loanNumber: z.string().max(100).nullish(),
  borrowerName: z.string().max(255).nullish(),
  validationErrors: z.array(z.object({
    field: z.string().max(255).optional(),
    label: z.string().max(255).optional(),
    error: z.string().max(2000).optional(),
  })).min(1).max(100),
  reviewerNotes: z.string().max(5000).nullish(),
  assignedOfficerId: z.string().uuid().nullish(),
}).strict()

export function notificationHref(link: string | null): string {
  if (link && (link === '/dashboard' || link.startsWith('/dashboard/')) && !/[\\\r\n]/.test(link)) {
    return link
  }
  return '/dashboard'
}
