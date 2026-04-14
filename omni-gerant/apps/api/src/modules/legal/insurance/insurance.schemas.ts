import { z } from 'zod';

// BUSINESS RULE [CDC-2.4]: Schemas validation Coffre-Fort Assurances

export const insuranceTypeEnum = z.enum([
  'rc_pro',
  'decennale',
  'multirisque',
  'protection_juridique',
  'prevoyance',
]);

export const createInsuranceSchema = z.object({
  type: insuranceTypeEnum,
  insurer: z.string().min(1),
  contract_number: z.string().min(1),
  start_date: z.string().min(1),
  end_date: z.string().min(1),
  premium_cents: z.number().int().min(0),
  document_url: z.string().optional(),
  notes: z.string().optional(),
});

export const updateInsuranceSchema = z.object({
  insurer: z.string().optional(),
  contract_number: z.string().optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  premium_cents: z.number().int().min(0).optional(),
  document_url: z.string().optional(),
  notes: z.string().optional(),
});

export type InsuranceType = z.infer<typeof insuranceTypeEnum>;
export type CreateInsuranceInput = z.infer<typeof createInsuranceSchema>;
export type UpdateInsuranceInput = z.infer<typeof updateInsuranceSchema>;
