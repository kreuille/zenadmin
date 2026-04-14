import { describe, it, expect, beforeEach } from 'vitest';
import {
  createBankService,
  type BankAccountRepository,
  type BankTransactionRepository,
  type BankAccount,
  type BankTransaction,
  type CreateBankAccountData,
  type CreateTransactionData,
} from '../bank.service.js';

// In-memory repos for testing
function createMockAccountRepo(): BankAccountRepository {
  const accounts = new Map<string, BankAccount>();

  return {
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
      return { items, next_cursor: null, has_more: false };
    },
  };
}

function createMockTransactionRepo(): BankTransactionRepository {
  const transactions = new Map<string, BankTransaction>();

  return {
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
    async createMany(data) {
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
      items = items.slice(0, query.limit);
      return { items, next_cursor: null, has_more: false };
    },
  };
}

const TENANT_ID = '00000000-0000-0000-0000-000000000001';

describe('BankService', () => {
  let accountRepo: BankAccountRepository;
  let transactionRepo: BankTransactionRepository;
  let service: ReturnType<typeof createBankService>;

  beforeEach(() => {
    accountRepo = createMockAccountRepo();
    transactionRepo = createMockTransactionRepo();
    service = createBankService(accountRepo, transactionRepo);
  });

  describe('createAccount', () => {
    it('creates a bank account', async () => {
      const result = await service.createAccount(TENANT_ID, {
        bank_name: 'Credit Agricole',
        account_name: 'Compte Courant',
        iban: 'FR7630006000011234567890189',
        balance_cents: 154230,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.bank_name).toBe('Credit Agricole');
        expect(result.value.balance_cents).toBe(154230);
        expect(result.value.status).toBe('active');
        expect(result.value.tenant_id).toBe(TENANT_ID);
      }
    });
  });

  describe('getAccount', () => {
    it('returns account by id', async () => {
      const created = await service.createAccount(TENANT_ID, {
        bank_name: 'BNP',
      });
      if (!created.ok) throw new Error('Failed to create');

      const result = await service.getAccount(created.value.id, TENANT_ID);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.bank_name).toBe('BNP');
      }
    });

    it('returns NOT_FOUND for missing account', async () => {
      const result = await service.getAccount('nonexistent', TENANT_ID);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('NOT_FOUND');
      }
    });

    it('enforces tenant isolation', async () => {
      const created = await service.createAccount(TENANT_ID, {
        bank_name: 'BNP',
      });
      if (!created.ok) throw new Error('Failed to create');

      const result = await service.getAccount(created.value.id, 'other-tenant');
      expect(result.ok).toBe(false);
    });
  });

  describe('listAccounts', () => {
    it('lists accounts for tenant', async () => {
      await service.createAccount(TENANT_ID, { bank_name: 'CA' });
      await service.createAccount(TENANT_ID, { bank_name: 'BNP' });
      await service.createAccount('other-tenant', { bank_name: 'SG' });

      const result = await service.listAccounts(TENANT_ID, { limit: 20 });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.items).toHaveLength(2);
      }
    });
  });

  describe('updateAccountStatus', () => {
    it('updates status', async () => {
      const created = await service.createAccount(TENANT_ID, { bank_name: 'CA' });
      if (!created.ok) throw new Error('Failed');

      const result = await service.updateAccountStatus(created.value.id, TENANT_ID, 'error');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.status).toBe('error');
      }
    });
  });

  describe('updateAccountBalance', () => {
    it('updates balance and sets last_sync_at', async () => {
      const created = await service.createAccount(TENANT_ID, { bank_name: 'CA', balance_cents: 100 });
      if (!created.ok) throw new Error('Failed');

      const result = await service.updateAccountBalance(created.value.id, TENANT_ID, 5000);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.balance_cents).toBe(5000);
        expect(result.value.last_sync_at).not.toBeNull();
      }
    });
  });

  describe('disconnectAccount', () => {
    it('sets status to disconnected', async () => {
      const created = await service.createAccount(TENANT_ID, { bank_name: 'CA' });
      if (!created.ok) throw new Error('Failed');

      const result = await service.disconnectAccount(created.value.id, TENANT_ID);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.status).toBe('disconnected');
      }
    });
  });

  describe('deleteAccount', () => {
    it('soft deletes account', async () => {
      const created = await service.createAccount(TENANT_ID, { bank_name: 'CA' });
      if (!created.ok) throw new Error('Failed');

      const deleteResult = await service.deleteAccount(created.value.id, TENANT_ID);
      expect(deleteResult.ok).toBe(true);

      // Should not be found anymore
      const getResult = await service.getAccount(created.value.id, TENANT_ID);
      expect(getResult.ok).toBe(false);
    });
  });

  describe('addTransaction', () => {
    it('adds a transaction to an account', async () => {
      const account = await service.createAccount(TENANT_ID, { bank_name: 'CA' });
      if (!account.ok) throw new Error('Failed');

      const result = await service.addTransaction(TENANT_ID, {
        bank_account_id: account.value.id,
        date: new Date('2026-04-14'),
        amount_cents: 25000,
        label: 'Virement client',
        type: 'credit',
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.amount_cents).toBe(25000);
        expect(result.value.type).toBe('credit');
        expect(result.value.matched).toBe(false);
      }
    });

    it('rejects transaction for nonexistent account', async () => {
      const result = await service.addTransaction(TENANT_ID, {
        bank_account_id: 'nonexistent',
        date: new Date(),
        amount_cents: 100,
        label: 'Test',
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('NOT_FOUND');
      }
    });
  });

  describe('addTransactions (batch)', () => {
    it('adds multiple transactions', async () => {
      const account = await service.createAccount(TENANT_ID, { bank_name: 'CA' });
      if (!account.ok) throw new Error('Failed');

      const result = await service.addTransactions(TENANT_ID, account.value.id, [
        { date: new Date('2026-04-14'), amount_cents: 25000, label: 'Tx 1' },
        { date: new Date('2026-04-13'), amount_cents: -5000, label: 'Tx 2' },
        { date: new Date('2026-04-12'), amount_cents: 10000, label: 'Tx 3' },
      ]);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(3);
      }
    });
  });

  describe('listTransactions', () => {
    it('lists transactions for tenant', async () => {
      const account = await service.createAccount(TENANT_ID, { bank_name: 'CA' });
      if (!account.ok) throw new Error('Failed');

      await service.addTransaction(TENANT_ID, {
        bank_account_id: account.value.id,
        date: new Date(),
        amount_cents: 100,
        label: 'Tx 1',
      });
      await service.addTransaction(TENANT_ID, {
        bank_account_id: account.value.id,
        date: new Date(),
        amount_cents: 200,
        label: 'Tx 2',
      });

      const result = await service.listTransactions(TENANT_ID, { limit: 50 });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.items).toHaveLength(2);
      }
    });
  });

  describe('markTransactionMatched', () => {
    it('marks transaction as matched with invoice', async () => {
      const account = await service.createAccount(TENANT_ID, { bank_name: 'CA' });
      if (!account.ok) throw new Error('Failed');

      const tx = await service.addTransaction(TENANT_ID, {
        bank_account_id: account.value.id,
        date: new Date(),
        amount_cents: 25000,
        label: 'Payment',
      });
      if (!tx.ok) throw new Error('Failed');

      const invoiceId = crypto.randomUUID();
      const result = await service.markTransactionMatched(tx.value.id, TENANT_ID, invoiceId);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.matched).toBe(true);
        expect(result.value.invoice_id).toBe(invoiceId);
      }
    });

    it('marks transaction as matched with purchase', async () => {
      const account = await service.createAccount(TENANT_ID, { bank_name: 'CA' });
      if (!account.ok) throw new Error('Failed');

      const tx = await service.addTransaction(TENANT_ID, {
        bank_account_id: account.value.id,
        date: new Date(),
        amount_cents: -5000,
        label: 'Facture fournisseur',
      });
      if (!tx.ok) throw new Error('Failed');

      const purchaseId = crypto.randomUUID();
      const result = await service.markTransactionMatched(tx.value.id, TENANT_ID, undefined, purchaseId);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.matched).toBe(true);
        expect(result.value.purchase_id).toBe(purchaseId);
      }
    });
  });

  describe('unmatchTransaction', () => {
    it('unmatches a previously matched transaction', async () => {
      const account = await service.createAccount(TENANT_ID, { bank_name: 'CA' });
      if (!account.ok) throw new Error('Failed');

      const tx = await service.addTransaction(TENANT_ID, {
        bank_account_id: account.value.id,
        date: new Date(),
        amount_cents: 25000,
        label: 'Payment',
      });
      if (!tx.ok) throw new Error('Failed');

      await service.markTransactionMatched(tx.value.id, TENANT_ID, crypto.randomUUID());
      const result = await service.unmatchTransaction(tx.value.id, TENANT_ID);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.matched).toBe(false);
        expect(result.value.invoice_id).toBeNull();
        expect(result.value.purchase_id).toBeNull();
      }
    });
  });
});
