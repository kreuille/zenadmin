import { z } from 'zod';

// BUSINESS RULE [CDC-2.2]: Validation schemas pour fournisseurs

export const createSupplierSchema = z.object({
  name: z.string().min(1).max(255),
  siret: z
    .string()
    .regex(/^\d{14}$/, 'SIRET must be 14 digits')
    .optional(),
  email: z.string().email().optional(),
  phone: z.string().max(20).optional(),
  address: z
    .object({
      line1: z.string().max(255).optional(),
      line2: z.string().max(255).optional(),
      zip_code: z.string().max(10).optional(),
      city: z.string().max(100).optional(),
      country: z.string().length(2).default('FR'),
    })
    .optional(),
  iban: z
    .string()
    .regex(/^[A-Z]{2}\d{2}[A-Z0-9]{4,30}$/, 'Invalid IBAN format')
    .optional(),
  bic: z
    .string()
    .regex(/^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/, 'Invalid BIC format')
    .optional(),
  payment_terms: z.number().int().min(0).max(365).default(30),
  category: z.string().max(100).optional(),
});

export const updateSupplierSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  siret: z.string().regex(/^\d{14}$/).optional().nullable(),
  email: z.string().email().optional().nullable(),
  phone: z.string().max(20).optional().nullable(),
  address: z
    .object({
      line1: z.string().max(255).optional(),
      line2: z.string().max(255).optional(),
      zip_code: z.string().max(10).optional(),
      city: z.string().max(100).optional(),
      country: z.string().length(2).optional(),
    })
    .optional()
    .nullable(),
  iban: z.string().regex(/^[A-Z]{2}\d{2}[A-Z0-9]{4,30}$/).optional().nullable(),
  bic: z.string().regex(/^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/).optional().nullable(),
  payment_terms: z.number().int().min(0).max(365).optional(),
  category: z.string().max(100).optional().nullable(),
});

export const supplierListQuerySchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().max(100).optional(),
  category: z.string().max(100).optional(),
  sort_by: z.enum(['name', 'created_at']).default('name'),
  sort_dir: z.enum(['asc', 'desc']).default('asc'),
});

export type CreateSupplierInput = z.infer<typeof createSupplierSchema>;
export type UpdateSupplierInput = z.infer<typeof updateSupplierSchema>;
export type SupplierListQuery = z.infer<typeof supplierListQuerySchema>;
