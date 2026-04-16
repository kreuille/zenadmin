import type { FastifyInstance } from 'fastify';
import {
  createBankService,
  type BankAccountRepository,
  type BankTransactionRepository,
  type BankAccount,
  type BankTransaction,
  type CreateBankAccountData,
  type CreateTransactionData,
} from './bank.service.js';
import { createSyncService } from './sync.service.js';
import { createBridgeClient, type BridgeClient } from './bridge-client.js';
import {
  connectBankSchema,
  bankAccountListQuerySchema,
  transactionListQuerySchema,
  webhookPayloadSchema,
} from './bank.schemas.js';
import { authenticate, requirePermission } from '../../plugins/auth.js';
import { injectTenant } from '../../plugins/tenant.js';

// BUSINESS RULE [CDC-2.3]: Endpoints module bancaire

export async function bankRoutes(app: FastifyInstance) {
  // Placeholder in-memory repos
  const accounts = new Map<string, BankAccount>();
  const transactions = new Map<string, BankTransaction>();

  const accountRepo: BankAccountRepository = {
    async create(data: CreateBankAccountData) {
      const id = crypto.randomUUID();
      const account: BankAccount = {
        id,
        tenant_id: data.tenant_id,
        provider_id: data.provider_id ?? null,
        bank_name: data.bank_name,
        account_name: data.account_name ?? null,
        iban: data.iban ?? null,
        bic: data.bic ?? null,
        balance_cents: data.balance_cents ?? 0,
        currency: data.currency ?? 'EUR',
        last_sync_at: null,
        status: 'active',
        created_at: new Date(),
        updated_at: new Date(),
        deleted_at: null,
      };
      accounts.set(id, account);
      return account;
    },
    async findById(id, tenantId) {
      const a = accounts.get(id);
      if (!a || a.tenant_id !== tenantId || a.deleted_at) return null;
      return a;
    },
    async findByProviderId(providerId, tenantId) {
      for (const a of accounts.values()) {
        if (a.provider_id === providerId && a.tenant_id === tenantId && !a.deleted_at) return a;
      }
      return null;
    },
    async update(id, tenantId, data) {
      const a = accounts.get(id);
      if (!a || a.tenant_id !== tenantId || a.deleted_at) return null;
      const updated = { ...a, ...data, updated_at: new Date() } as BankAccount;
      accounts.set(id, updated);
      return updated;
    },
    async softDelete(id, tenantId) {
      const a = accounts.get(id);
      if (!a || a.tenant_id !== tenantId) return false;
      a.deleted_at = new Date();
      return true;
    },
    async list(tenantId, query) {
      let items = [...accounts.values()].filter(
        (a) => a.tenant_id === tenantId && !a.deleted_at,
      );
      if (query.status) items = items.filter((a) => a.status === query.status);
      items = items.slice(0, query.limit);
      const hasMore = items.length === query.limit;
      const nextCursor = hasMore && items.length > 0 ? items[items.length - 1]!.id : null;
      return { items, next_cursor: nextCursor, has_more: hasMore };
    },
  };

  const transactionRepo: BankTransactionRepository = {
    async create(data: CreateTransactionData) {
      const id = crypto.randomUUID();
      const tx: BankTransaction = {
        id,
        tenant_id: data.tenant_id,
        bank_account_id: data.bank_account_id,
        provider_id: data.provider_id ?? null,
        date: data.date,
        value_date: data.value_date ?? null,
        amount_cents: data.amount_cents,
        currency: data.currency ?? 'EUR',
        label: data.label,
        raw_label: data.raw_label ?? null,
        category: data.category ?? null,
        type: data.type ?? null,
        matched: false,
        invoice_id: null,
        purchase_id: null,
        created_at: new Date(),
      };
      transactions.set(id, tx);
      return tx;
    },
    async createMany(data: CreateTransactionData[]) {
      let count = 0;
      for (const d of data) {
        await this.create(d);
        count++;
      }
      return count;
    },
    async findById(id, tenantId) {
      const tx = transactions.get(id);
      if (!tx || tx.tenant_id !== tenantId) return null;
      return tx;
    },
    async findByProviderId(providerId, bankAccountId) {
      for (const tx of transactions.values()) {
        if (tx.provider_id === providerId && tx.bank_account_id === bankAccountId) return tx;
      }
      return null;
    },
    async update(id, tenantId, data) {
      const tx = transactions.get(id);
      if (!tx || tx.tenant_id !== tenantId) return null;
      const updated = { ...tx, ...data } as BankTransaction;
      transactions.set(id, updated);
      return updated;
    },
    async list(tenantId, query) {
      let items = [...transactions.values()].filter(
        (tx) => tx.tenant_id === tenantId,
      );
      if (query.bank_account_id) items = items.filter((tx) => tx.bank_account_id === query.bank_account_id);
      if (query.type) items = items.filter((tx) => tx.type === query.type);
      if (query.category) items = items.filter((tx) => tx.category === query.category);
      if (query.matched !== undefined) {
        const isMatched = query.matched === 'true';
        items = items.filter((tx) => tx.matched === isMatched);
      }
      if (query.search) {
        const term = query.search.toLowerCase();
        items = items.filter((tx) => tx.label.toLowerCase().includes(term));
      }
      if (query.date_from) {
        const from = new Date(query.date_from);
        items = items.filter((tx) => tx.date >= from);
      }
      if (query.date_to) {
        const to = new Date(query.date_to);
        items = items.filter((tx) => tx.date <= to);
      }
      // Sort by date descending
      items.sort((a, b) => b.date.getTime() - a.date.getTime());
      items = items.slice(0, query.limit);
      const hasMore = items.length === query.limit;
      const nextCursor = hasMore && items.length > 0 ? items[items.length - 1]!.id : null;
      return { items, next_cursor: nextCursor, has_more: hasMore };
    },
  };

  const bankService = createBankService(accountRepo, transactionRepo);

  // Bridge client (configured from env)
  const bridgeClient = createBridgeClient({
    clientId: process.env['BRIDGE_CLIENT_ID'] || '',
    clientSecret: process.env['BRIDGE_CLIENT_SECRET'] || '',
    baseUrl: process.env['BRIDGE_API_URL'] || 'https://api.bridgeapi.io',
    webhookSecret: process.env['BRIDGE_WEBHOOK_SECRET'],
  });

  const syncService = createSyncService(bridgeClient, accountRepo, transactionRepo);

  const preHandlers = [authenticate, injectTenant];

  // POST /api/bank/connect — Initiate bank connection
  app.post(
    '/api/bank/connect',
    { preHandler: [...preHandlers, requirePermission('bank', 'create')] },
    async (request, reply) => {
      const parsed = connectBankSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: { code: 'VALIDATION_ERROR', message: 'Invalid data', details: { issues: parsed.error.issues } },
        });
      }
      const result = await bridgeClient.getConnectUrl(
        request.auth.user_id,
        parsed.data.callback_url,
      );
      if (!result.ok) return reply.status(502).send({ error: result.error });
      return result.value;
    },
  );

  // POST /api/bank/callback — After user connects bank, import accounts
  app.post(
    '/api/bank/callback',
    { preHandler: [...preHandlers, requirePermission('bank', 'create')] },
    async (request, reply) => {
      const result = await syncService.importAccounts(
        request.auth.tenant_id,
        request.auth.user_id,
      );
      if (!result.ok) return reply.status(502).send({ error: result.error });
      return reply.status(201).send(result.value);
    },
  );

  // GET /api/bank/accounts
  app.get(
    '/api/bank/accounts',
    { preHandler: [...preHandlers, requirePermission('bank', 'read')] },
    async (request, reply) => {
      const parsed = bankAccountListQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.status(400).send({
          error: { code: 'VALIDATION_ERROR', message: 'Invalid query', details: { issues: parsed.error.issues } },
        });
      }
      const result = await bankService.listAccounts(request.auth.tenant_id, parsed.data);
      if (!result.ok) return reply.status(500).send({ error: result.error });
      return result.value;
    },
  );

  // GET /api/bank/accounts/:id
  app.get(
    '/api/bank/accounts/:id',
    { preHandler: [...preHandlers, requirePermission('bank', 'read')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const result = await bankService.getAccount(id, request.auth.tenant_id);
      if (!result.ok) return reply.status(404).send({ error: result.error });
      return result.value;
    },
  );

  // POST /api/bank/accounts — Create manual bank account
  app.post(
    '/api/bank/accounts',
    { preHandler: [...preHandlers, requirePermission('bank', 'create')] },
    async (request, reply) => {
      const body = request.body as { bank_name: string; account_name?: string; iban?: string; bic?: string; currency?: string };
      if (!body.bank_name) {
        return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: 'bank_name is required' } });
      }
      const account = await accountRepo.create({
        tenant_id: request.auth.tenant_id,
        bank_name: body.bank_name,
        account_name: body.account_name,
        iban: body.iban,
        bic: body.bic,
        currency: body.currency,
      });
      return reply.status(201).send(account);
    },
  );

  // POST /api/bank/accounts/:id/sync — Manual sync trigger
  app.post(
    '/api/bank/accounts/:id/sync',
    { preHandler: [...preHandlers, requirePermission('bank', 'update')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const accountResult = await bankService.getAccount(id, request.auth.tenant_id);
      if (!accountResult.ok) return reply.status(404).send({ error: accountResult.error });

      const result = await syncService.syncAccount(
        request.auth.tenant_id,
        accountResult.value,
        request.auth.user_id,
      );
      if (!result.ok) return reply.status(502).send({ error: result.error });
      return result.value;
    },
  );

  // POST /api/bank/accounts/:id/disconnect
  app.post(
    '/api/bank/accounts/:id/disconnect',
    { preHandler: [...preHandlers, requirePermission('bank', 'update')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const result = await bankService.disconnectAccount(id, request.auth.tenant_id);
      if (!result.ok) return reply.status(404).send({ error: result.error });
      return result.value;
    },
  );

  // DELETE /api/bank/accounts/:id
  app.delete(
    '/api/bank/accounts/:id',
    { preHandler: [...preHandlers, requirePermission('bank', 'delete')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const result = await bankService.deleteAccount(id, request.auth.tenant_id);
      if (!result.ok) return reply.status(404).send({ error: result.error });
      return reply.status(204).send();
    },
  );

  // GET /api/bank/transactions
  app.get(
    '/api/bank/transactions',
    { preHandler: [...preHandlers, requirePermission('bank', 'read')] },
    async (request, reply) => {
      const parsed = transactionListQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.status(400).send({
          error: { code: 'VALIDATION_ERROR', message: 'Invalid query', details: { issues: parsed.error.issues } },
        });
      }
      const result = await bankService.listTransactions(request.auth.tenant_id, parsed.data);
      if (!result.ok) return reply.status(500).send({ error: result.error });
      return result.value;
    },
  );

  // GET /api/bank/transactions/:id
  app.get(
    '/api/bank/transactions/:id',
    { preHandler: [...preHandlers, requirePermission('bank', 'read')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const result = await bankService.getTransaction(id, request.auth.tenant_id);
      if (!result.ok) return reply.status(404).send({ error: result.error });
      return result.value;
    },
  );

  // POST /api/bank/webhook — Bridge webhook endpoint
  app.post('/api/bank/webhook', async (request, reply) => {
    const signature = (request.headers['bridge-signature'] as string) || '';
    const rawBody = JSON.stringify(request.body);

    const parsed = webhookPayloadSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid webhook payload' } });
    }

    const result = await syncService.handleWebhook(rawBody, signature);
    if (!result.ok) {
      return reply.status(result.error.code === 'UNAUTHORIZED' ? 401 : 500).send({ error: result.error });
    }

    return reply.status(200).send({ received: true });
  });

  // POST /api/bank/sync-all — Sync all accounts (called by job)
  app.post(
    '/api/bank/sync-all',
    { preHandler: [...preHandlers, requirePermission('bank', 'update')] },
    async (request, reply) => {
      const result = await syncService.syncAllAccounts(
        request.auth.tenant_id,
        request.auth.user_id,
      );
      if (!result.ok) return reply.status(502).send({ error: result.error });
      return result.value;
    },
  );
}
