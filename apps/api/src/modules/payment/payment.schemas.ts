import { z } from 'zod';

export const createPaymentSchema = z.object({
  amount_cents: z.number().int().min(1),
  payment_date: z.coerce.date(),
  payment_method: z.enum(['bank_transfer', 'card', 'cash', 'check']),
  reference: z.string().max(200).optional(),
  notes: z.string().max(2000).optional(),
});

export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;
