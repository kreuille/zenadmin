import { describe, it, expect } from 'vitest';
import {
  createMandateService,
  type MandateRepository,
  type MandateRecord,
} from '../mandate.service.js';

const TENANT_ID = '00000000-0000-0000-0000-000000000001';

function createMockRepo(): MandateRepository & { mandates: Map<string, MandateRecord> } {
  const mandates = new Map<string, MandateRecord>();
  return {
    mandates,
    async create(data) {
      const record: MandateRecord = {
        ...data,
        id: crypto.randomUUID(),
        created_at: new Date(),
      };
      mandates.set(`${data.tenant_id}-${data.client_id}`, record);
      return record;
    },
    async findByClientId(tenantId, clientId) {
      return mandates.get(`${tenantId}-${clientId}`) ?? null;
    },
    async updateStatus(id, status) {
      for (const [key, m] of mandates) {
        if (m.id === id) {
          mandates.set(key, { ...m, status });
          break;
        }
      }
    },
  };
}

function createMockGcClient() {
  return {
    async createRedirectFlow(params: { description: string; session_token: string; success_redirect_url: string }) {
      return { id: 'flow-123', redirect_url: 'https://pay.gocardless.com/flow/123' };
    },
    async completeRedirectFlow(flowId: string, sessionToken: string) {
      return { mandate_id: `MD-${flowId}` };
    },
    async createPayment(params: { amount_cents: number; currency: string; mandate_id: string; description: string; invoice_id: string }) {
      return {
        id: `PM-${crypto.randomUUID().substring(0, 8)}`,
        amount: params.amount_cents,
        currency: params.currency,
        status: 'pending_submission',
        mandate_id: params.mandate_id,
        description: params.description,
        metadata: { invoice_id: params.invoice_id },
        charge_date: '2026-04-20',
      };
    },
    async getMandate(mandateId: string) {
      return {
        id: mandateId,
        status: 'active',
        reference: 'REF-001',
        scheme: 'sepa_core',
        next_possible_charge_date: '2026-04-20',
      };
    },
    async cancelMandate(mandateId: string) {
      return {
        id: mandateId,
        status: 'cancelled',
        reference: 'REF-001',
        scheme: 'sepa_core',
        next_possible_charge_date: '',
      };
    },
  };
}

describe('MandateService', () => {
  it('initiates mandate and returns redirect URL', async () => {
    const gcClient = createMockGcClient();
    const repo = createMockRepo();
    const service = createMandateService(gcClient, repo, 'https://app.test');

    const result = await service.initiateMandate(TENANT_ID, 'client-001');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.redirect_url).toContain('gocardless.com');
      expect(result.value.flow_id).toBe('flow-123');
    }
  });

  it('completes mandate and saves record', async () => {
    const gcClient = createMockGcClient();
    const repo = createMockRepo();
    const service = createMandateService(gcClient, repo, 'https://app.test');

    const result = await service.completeMandate(TENANT_ID, 'client-001', 'flow-123', 'session-token');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.tenant_id).toBe(TENANT_ID);
      expect(result.value.client_id).toBe('client-001');
      expect(result.value.gocardless_mandate_id).toBe('MD-flow-123');
      expect(result.value.status).toBe('active');
    }
  });

  it('charges mandate for invoice', async () => {
    const gcClient = createMockGcClient();
    const repo = createMockRepo();
    const service = createMandateService(gcClient, repo, 'https://app.test');

    // First complete a mandate
    await service.completeMandate(TENANT_ID, 'client-001', 'flow-123', 'session-token');

    // Then charge it
    const result = await service.chargeMandate(
      TENANT_ID,
      'client-001',
      'inv-001',
      'FAC-2026-001',
      120000,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.payment_id).toBeTruthy();
    }
  });

  it('returns NOT_FOUND when no mandate exists', async () => {
    const gcClient = createMockGcClient();
    const repo = createMockRepo();
    const service = createMandateService(gcClient, repo, 'https://app.test');

    const result = await service.chargeMandate(TENANT_ID, 'unknown-client', 'inv-001', 'FAC-001', 50000);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('NOT_FOUND');
    }
  });

  it('rejects charge on inactive mandate', async () => {
    const gcClient = createMockGcClient();
    const repo = createMockRepo();
    const service = createMandateService(gcClient, repo, 'https://app.test');

    await service.completeMandate(TENANT_ID, 'client-002', 'flow-456', 'session');
    // Simulate mandate becoming inactive
    const mandate = repo.mandates.get(`${TENANT_ID}-client-002`);
    if (mandate) {
      repo.mandates.set(`${TENANT_ID}-client-002`, { ...mandate, status: 'cancelled' });
    }

    const result = await service.chargeMandate(TENANT_ID, 'client-002', 'inv-002', 'FAC-002', 80000);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('MANDATE_INACTIVE');
    }
  });
});
