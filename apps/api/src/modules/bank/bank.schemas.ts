import { z } from 'zod';

// BUSINESS RULE [CDC-2.3]: Validation schemas pour module bancaire

export const connectBankSchema = z.object({
  callback_url: z.string().url(),
});

export const bankAccountListQuerySchema = z.object({
  status: z.enum(['active', 'error', 'disconnected']).optional(),
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const transactionListQuerySchema = z.object({
  bank_account_id: z.string().uuid().optional(),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
  type: z.enum(['credit', 'debit']).optional(),
  category: z.string().optional(),
  matched: z.enum(['true', 'false']).optional(),
  search: z.string().optional(),
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const webhookPayloadSchema = z.object({
  type: z.string(),
  item_id: z.number(),
  user_uuid: z.string(),
  timestamp: z.number(),
});

export type ConnectBankInput = z.infer<typeof connectBankSchema>;
export type BankAccountListQuery = z.infer<typeof bankAccountListQuerySchema>;
export type TransactionListQuery = z.infer<typeof transactionListQuerySchema>;
