import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createBridgeClient, categorizeTransaction, type BridgeConfig } from '../bridge-client.js';

const config: BridgeConfig = {
  clientId: 'test-client-id',
  clientSecret: 'test-client-secret',
  baseUrl: 'https://api.test.bridge.io',
  webhookSecret: 'webhook-secret-key',
};

describe('BridgeClient', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('getConnectUrl', () => {
    it('returns connect URL on success', async () => {
      const mockResponse = { redirect_url: 'https://bridge.io/connect/abc123' };
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const client = createBridgeClient(config);
      const result = await client.getConnectUrl('user-123', 'https://app.test/callback');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.redirect_url).toBe('https://bridge.io/connect/abc123');
      }

      expect(fetch).toHaveBeenCalledWith(
        'https://api.test.bridge.io/v2/connect/items/add',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            user_uuid: 'user-123',
            redirect_url: 'https://app.test/callback',
          }),
        }),
      );
    });

    it('returns error on API failure', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: async () => 'Invalid credentials',
      } as Response);

      const client = createBridgeClient(config);
      const result = await client.getConnectUrl('user-123', 'https://app.test/callback');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('UNAUTHORIZED');
      }
    });

    it('returns error on network failure', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));

      const client = createBridgeClient(config);
      const result = await client.getConnectUrl('user-123', 'https://app.test/callback');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('SERVICE_UNAVAILABLE');
        expect(result.error.message).toContain('Network error');
      }
    });
  });

  describe('listAccounts', () => {
    it('returns list of accounts', async () => {
      const mockAccounts = {
        resources: [
          {
            id: 1001,
            name: 'Compte Courant',
            balance: 1542.30,
            iban: 'FR7630006000011234567890189',
            currency: 'EUR',
            bank_name: 'Credit Agricole',
            status: '0',
            updated_at: '2026-04-14T08:00:00Z',
          },
        ],
      };
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => mockAccounts,
      } as Response);

      const client = createBridgeClient(config);
      const result = await client.listAccounts('user-123');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(1);
        expect(result.value[0]!.name).toBe('Compte Courant');
        expect(result.value[0]!.balance).toBe(1542.30);
      }
    });
  });

  describe('listTransactions', () => {
    it('returns transactions with since parameter', async () => {
      const mockTransactions = {
        resources: [
          {
            id: 5001,
            account_id: 1001,
            date: '2026-04-14',
            value_date: '2026-04-14',
            amount: 250.00,
            currency_code: 'EUR',
            description: 'Virement client',
            raw_description: 'VIR DUPONT SARL',
            category_id: null,
            is_deleted: false,
          },
        ],
      };
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => mockTransactions,
      } as Response);

      const client = createBridgeClient(config);
      const result = await client.listTransactions('user-123', 1001, '2026-04-01');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(1);
        expect(result.value[0]!.amount).toBe(250.00);
      }

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('account_id=1001'),
        expect.anything(),
      );
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('since=2026-04-01'),
        expect.anything(),
      );
    });
  });

  describe('refreshItem', () => {
    it('refreshes item successfully', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({}),
      } as Response);

      const client = createBridgeClient(config);
      const result = await client.refreshItem('user-123', 42);

      expect(result.ok).toBe(true);
      expect(fetch).toHaveBeenCalledWith(
        'https://api.test.bridge.io/v2/items/42/refresh',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });
});

describe('categorizeTransaction', () => {
  it('categorizes by Bridge category ID', () => {
    expect(categorizeTransaction('some label', 1)).toBe('loyer');
    expect(categorizeTransaction('some label', 3)).toBe('telecom');
    expect(categorizeTransaction('some label', 4)).toBe('energie');
    expect(categorizeTransaction('some label', 9)).toBe('impots');
  });

  it('categorizes by label keywords', () => {
    expect(categorizeTransaction('PRELEVEMENT EDF SA FACTURE', null)).toBe('energie');
    expect(categorizeTransaction('CB ORANGE SA 11/04', null)).toBe('telecom');
    expect(categorizeTransaction('VIR LOYER BUREAUX', null)).toBe('loyer');
    expect(categorizeTransaction('PRELEVEMENT MAIF ASSURANCE', null)).toBe('assurance');
    expect(categorizeTransaction('PRELEVEMENT URSSAF', null)).toBe('impots');
    expect(categorizeTransaction('SNCF VOYAGE', null)).toBe('transport');
    expect(categorizeTransaction('VIR SALAIRE MARS', null)).toBe('salaires');
    expect(categorizeTransaction('FRAIS BANCAIRE TRIMESTRIEL', null)).toBe('bancaire');
  });

  it('returns null for unknown transactions', () => {
    expect(categorizeTransaction('VIREMENT DIVERS', null)).toBeNull();
    expect(categorizeTransaction('ACHAT DIVERS 123', null)).toBeNull();
  });

  it('prefers Bridge category over label', () => {
    // Bridge says "loyer" (1) even though label contains "EDF"
    expect(categorizeTransaction('EDF something', 1)).toBe('loyer');
  });
});
