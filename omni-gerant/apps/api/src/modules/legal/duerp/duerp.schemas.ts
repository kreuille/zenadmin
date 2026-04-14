import { z } from 'zod';

// BUSINESS RULE [CDC-2.4]: Schemas validation DUERP

export const riskEntrySchema = z.object({
  risk_id: z.string().optional(),
  category: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  gravity: z.number().int().min(1).max(4),
  probability: z.number().int().min(1).max(4),
  preventive_actions: z.array(z.string()).default([]),
  existing_measures: z.string().optional(),
  responsible: z.string().optional(),
  deadline: z.string().optional(),
});

export const createDuerpSchema = z.object({
  title: z.string().optional(),
  company_name: z.string().min(1),
  naf_code: z.string().optional(),
  address: z.string().optional(),
  employee_count: z.number().int().min(0).default(0),
  evaluator_name: z.string().min(1),
  evaluation_date: z.string().optional(),
  risks: z.array(riskEntrySchema).default([]),
});

export const updateDuerpSchema = z.object({
  title: z.string().optional(),
  risks: z.array(riskEntrySchema).optional(),
  evaluator_name: z.string().optional(),
  notes: z.string().optional(),
});

export type RiskEntry = z.infer<typeof riskEntrySchema>;
export type CreateDuerpInput = z.infer<typeof createDuerpSchema>;
export type UpdateDuerpInput = z.infer<typeof updateDuerpSchema>;
