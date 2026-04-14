import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email().toLowerCase().trim(),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128)
    .regex(/[A-Z]/, 'Must contain uppercase letter')
    .regex(/[a-z]/, 'Must contain lowercase letter')
    .regex(/[0-9]/, 'Must contain digit'),
  first_name: z.string().min(1).max(100),
  last_name: z.string().min(1).max(100),
  company_name: z.string().min(1).max(255),
});

export const loginSchema = z.object({
  email: z.string().email().toLowerCase().trim(),
  password: z.string().min(1),
});

export const verify2faSchema = z.object({
  temporary_token: z.string(),
  code: z.string().length(6).regex(/^\d{6}$/),
});

export const refreshTokenSchema = z.object({
  refresh_token: z.string().min(1),
});

export const enable2faSchema = z.object({
  code: z.string().length(6).regex(/^\d{6}$/),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type Verify2faInput = z.infer<typeof verify2faSchema>;
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;
