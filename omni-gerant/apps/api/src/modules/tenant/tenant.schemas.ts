import { z } from 'zod';

// BUSINESS RULE [CDC-11.1]: Schemas Zod profil entreprise complet

export const legalFormEnum = z.enum([
  'auto_entrepreneur', 'ei', 'eirl', 'eurl', 'sarl', 'sas', 'sasu', 'sa', 'sci', 'scop', 'other',
]);

export const tvaRegimeEnum = z.enum([
  'franchise_base', 'reel_simplifie', 'reel_normal', 'mini_reel',
]);

export const addressSchema = z.object({
  line1: z.string().default(''),
  line2: z.string().optional(),
  zip_code: z.string().default(''),
  city: z.string().default(''),
  country: z.string().default('FR'),
});

export const qualificationSchema = z.object({
  type: z.enum(['qualibat', 'rge', 'qualifelec', 'qualipv', 'qualibois', 'other']),
  number: z.string().min(1),
  label: z.string().min(1),
  valid_until: z.string().optional(),
});

export const dirigeantSchema = z.object({
  nom: z.string(),
  prenom: z.string(),
  fonction: z.string(),
});

// Full profile update schema
export const updateTenantProfileSchema = z.object({
  // Auto-fill SIRET fields
  siret: z.string().regex(/^\d{14}$/, 'SIRET doit contenir 14 chiffres').optional(),
  siren: z.string().regex(/^\d{9}$/, 'SIREN doit contenir 9 chiffres').optional(),
  company_name: z.string().min(1).max(255).optional(),
  trade_name: z.string().max(255).optional(),
  legal_form: legalFormEnum.optional(),
  naf_code: z.string().max(10).optional(),
  naf_label: z.string().max(255).optional(),
  address: addressSchema.optional(),
  tva_number: z.string().max(20).optional(),
  creation_date: z.string().optional(),
  capital_cents: z.number().int().min(0).optional(),
  rcs_city: z.string().max(100).optional(),
  rm_number: z.string().max(50).optional(),
  rm_city: z.string().max(100).optional(),
  convention_collective: z.string().max(255).optional(),
  code_idcc: z.string().max(10).optional(),
  dirigeants: z.array(dirigeantSchema).optional(),
  effectif: z.number().int().min(0).optional(),

  // Manual fields
  email: z.string().email().optional(),
  phone: z.string().max(20).optional(),
  website: z.string().url().optional().or(z.literal('')),
  iban: z.string().max(34).optional(),
  bic: z.string().max(11).optional(),

  // TVA regime
  tva_regime: tvaRegimeEnum.optional(),
  current_year_revenue_cents: z.number().int().min(0).optional(),

  // Assurances (lien module 7.3)
  insurance_decennale_number: z.string().max(100).optional(),
  insurance_decennale_insurer: z.string().max(255).optional(),
  insurance_decennale_coverage: z.string().max(255).optional(),
  insurance_rc_pro_number: z.string().max(100).optional(),
  insurance_rc_pro_insurer: z.string().max(255).optional(),

  // Qualifications
  qualifications: z.array(qualificationSchema).optional(),
});

export type UpdateTenantProfileInput = z.infer<typeof updateTenantProfileSchema>;

// Legacy schema (backward compat for PATCH /api/tenants/me)
export const updateTenantSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  siret: z.string().regex(/^\d{14}$/, 'SIRET must be 14 digits').optional(),
  siren: z.string().regex(/^\d{9}$/, 'SIREN must be 9 digits').optional(),
  naf_code: z.string().max(10).optional(),
  legal_form: z.string().max(50).optional(),
  address: addressSchema.optional(),
  settings: z.record(z.unknown()).optional(),
});

export type UpdateTenantInput = z.infer<typeof updateTenantSchema>;

export const siretLookupSchema = z.object({
  siret: z.string().regex(/^\d{14}$/, 'SIRET must be 14 digits'),
});
