import { describe, it, expect, beforeEach } from 'vitest';
import {
  createInsuranceService,
  type InsuranceRepository,
  type InsuranceDocument,
} from '../insurance.service.js';

const TENANT_ID = '00000000-0000-0000-0000-000000000001';

function createMockRepo(): InsuranceRepository {
  const documents = new Map<string, InsuranceDocument>();

  return {
    async create(tenantId, data) {
      const id = crypto.randomUUID();
      const doc: InsuranceDocument = {
        ...data,
        id,
        created_at: new Date(),
        updated_at: new Date(),
        deleted_at: null,
      };
      documents.set(id, doc);
      return doc;
    },
    async findById(id, tenantId) {
      const d = documents.get(id);
      if (!d || d.tenant_id !== tenantId || d.deleted_at) return null;
      return d;
    },
    async update(id, tenantId, data) {
      const d = documents.get(id);
      if (!d || d.tenant_id !== tenantId || d.deleted_at) return null;
      const updated = { ...d, ...data, updated_at: new Date() } as InsuranceDocument;
      documents.set(id, updated);
      return updated;
    },
    async softDelete(id, tenantId) {
      const d = documents.get(id);
      if (!d || d.tenant_id !== tenantId) return false;
      d.deleted_at = new Date();
      return true;
    },
    async list(tenantId) {
      return [...documents.values()]
        .filter((d) => d.tenant_id === tenantId && !d.deleted_at)
        .sort((a, b) => a.end_date.getTime() - b.end_date.getTime());
    },
    async findExpiring(tenantId, beforeDate) {
      const now = new Date();
      return [...documents.values()]
        .filter((d) => d.tenant_id === tenantId && !d.deleted_at && d.end_date >= now && d.end_date <= beforeDate)
        .sort((a, b) => a.end_date.getTime() - b.end_date.getTime());
    },
    async findAllExpiring(beforeDate) {
      const now = new Date();
      return [...documents.values()]
        .filter((d) => !d.deleted_at && d.end_date >= now && d.end_date <= beforeDate)
        .sort((a, b) => a.end_date.getTime() - b.end_date.getTime());
    },
  };
}

describe('InsuranceService', () => {
  let repo: InsuranceRepository;
  let service: ReturnType<typeof createInsuranceService>;

  beforeEach(() => {
    repo = createMockRepo();
    service = createInsuranceService(repo);
  });

  describe('create', () => {
    it('creates an insurance with valid data', async () => {
      const result = await service.create(TENANT_ID, {
        type: 'rc_pro',
        insurer: 'AXA',
        contract_number: 'RC-2026-001',
        start_date: '2026-01-01',
        end_date: '2027-01-01',
        premium_cents: 120000,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.type).toBe('rc_pro');
        expect(result.value.insurer).toBe('AXA');
        expect(result.value.contract_number).toBe('RC-2026-001');
        expect(result.value.premium_cents).toBe(120000);
        expect(result.value.document_url).toBeNull();
      }
    });

    it('creates decennale insurance', async () => {
      const result = await service.create(TENANT_ID, {
        type: 'decennale',
        insurer: 'MAAF',
        contract_number: 'DEC-2026-042',
        start_date: '2026-04-01',
        end_date: '2036-04-01',
        premium_cents: 350000,
        document_url: '/uploads/decennale-2026.pdf',
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.type).toBe('decennale');
        expect(result.value.document_url).toBe('/uploads/decennale-2026.pdf');
      }
    });

    it('rejects end_date before start_date', async () => {
      const result = await service.create(TENANT_ID, {
        type: 'rc_pro',
        insurer: 'AXA',
        contract_number: 'RC-001',
        start_date: '2027-01-01',
        end_date: '2026-01-01',
        premium_cents: 100000,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('VALIDATION_ERROR');
      }
    });
  });

  describe('getById', () => {
    it('returns insurance by id', async () => {
      const created = await service.create(TENANT_ID, {
        type: 'multirisque',
        insurer: 'Allianz',
        contract_number: 'MR-001',
        start_date: '2026-01-01',
        end_date: '2027-01-01',
        premium_cents: 80000,
      });
      if (!created.ok) throw new Error('Failed');

      const result = await service.getById(created.value.id, TENANT_ID);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.insurer).toBe('Allianz');
      }
    });

    it('returns NOT_FOUND for wrong tenant', async () => {
      const created = await service.create(TENANT_ID, {
        type: 'rc_pro',
        insurer: 'AXA',
        contract_number: 'RC-001',
        start_date: '2026-01-01',
        end_date: '2027-01-01',
        premium_cents: 100000,
      });
      if (!created.ok) throw new Error('Failed');

      const result = await service.getById(created.value.id, 'other-tenant');
      expect(result.ok).toBe(false);
    });
  });

  describe('update', () => {
    it('updates insurance fields', async () => {
      const created = await service.create(TENANT_ID, {
        type: 'rc_pro',
        insurer: 'AXA',
        contract_number: 'RC-001',
        start_date: '2026-01-01',
        end_date: '2027-01-01',
        premium_cents: 100000,
      });
      if (!created.ok) throw new Error('Failed');

      const result = await service.update(created.value.id, TENANT_ID, {
        premium_cents: 130000,
        notes: 'Prime ajustee',
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.premium_cents).toBe(130000);
        expect(result.value.notes).toBe('Prime ajustee');
      }
    });
  });

  describe('delete', () => {
    it('soft deletes insurance', async () => {
      const created = await service.create(TENANT_ID, {
        type: 'prevoyance',
        insurer: 'Generali',
        contract_number: 'PV-001',
        start_date: '2026-01-01',
        end_date: '2027-01-01',
        premium_cents: 50000,
      });
      if (!created.ok) throw new Error('Failed');

      const deleteResult = await service.delete(created.value.id, TENANT_ID);
      expect(deleteResult.ok).toBe(true);

      const getResult = await service.getById(created.value.id, TENANT_ID);
      expect(getResult.ok).toBe(false);
    });
  });

  describe('list', () => {
    it('lists all insurances for tenant', async () => {
      await service.create(TENANT_ID, {
        type: 'rc_pro',
        insurer: 'AXA',
        contract_number: 'RC-001',
        start_date: '2026-01-01',
        end_date: '2027-01-01',
        premium_cents: 100000,
      });
      await service.create(TENANT_ID, {
        type: 'decennale',
        insurer: 'MAAF',
        contract_number: 'DEC-001',
        start_date: '2026-01-01',
        end_date: '2036-01-01',
        premium_cents: 350000,
      });

      const result = await service.list(TENANT_ID);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(2);
      }
    });
  });

  describe('uploadDocument', () => {
    it('attaches document URL to insurance', async () => {
      const created = await service.create(TENANT_ID, {
        type: 'rc_pro',
        insurer: 'AXA',
        contract_number: 'RC-001',
        start_date: '2026-01-01',
        end_date: '2027-01-01',
        premium_cents: 100000,
      });
      if (!created.ok) throw new Error('Failed');

      const result = await service.uploadDocument(
        created.value.id,
        TENANT_ID,
        '/uploads/attestation-rc-pro.pdf',
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.document_url).toBe('/uploads/attestation-rc-pro.pdf');
      }
    });

    it('returns NOT_FOUND for non-existent insurance', async () => {
      const result = await service.uploadDocument('non-existent', TENANT_ID, '/file.pdf');
      expect(result.ok).toBe(false);
    });
  });
});
