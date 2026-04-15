import { describe, it, expect, beforeEach } from 'vitest';
import {
  createDuerpService,
  type DuerpRepository,
  type DuerpDocument,
} from '../duerp.service.js';
import { generateDuerpHtml } from '../duerp-pdf.js';

const TENANT_ID = '00000000-0000-0000-0000-000000000001';

function createMockRepo(): DuerpRepository {
  const documents = new Map<string, DuerpDocument>();

  return {
    async create(tenantId, data) {
      const id = crypto.randomUUID();
      const doc: DuerpDocument = {
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
    async findLatest(tenantId) {
      const docs = [...documents.values()]
        .filter((d) => d.tenant_id === tenantId && !d.deleted_at)
        .sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
      return docs[0] || null;
    },
    async update(id, tenantId, data) {
      const d = documents.get(id);
      if (!d || d.tenant_id !== tenantId || d.deleted_at) return null;
      const updated = { ...d, ...data, updated_at: new Date() } as DuerpDocument;
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
        .filter((d) => d.tenant_id === tenantId && !d.deleted_at);
    },
  };
}

describe('DuerpService', () => {
  let repo: DuerpRepository;
  let service: ReturnType<typeof createDuerpService>;

  beforeEach(() => {
    repo = createMockRepo();
    service = createDuerpService(repo);
  });

  describe('generate', () => {
    it('generates DUERP with NAF-based risks for BTP', async () => {
      const result = await service.generate(TENANT_ID, {
        company_name: 'BTP Martin',
        naf_code: '43.21A',
        evaluator_name: 'Jean Martin',
        employee_count: 5,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.company_name).toBe('BTP Martin');
        expect(result.value.naf_code).toBe('43.21A');
        expect(result.value.sector_name).toContain('BTP');
        expect(result.value.risks.length).toBeGreaterThan(3);
        expect(result.value.version).toBe(1);
        // Should have BTP-specific risks
        expect(result.value.risks.some((r) => r.name.includes('hauteur'))).toBe(true);
      }
    });

    it('generates DUERP with restauration risks', async () => {
      const result = await service.generate(TENANT_ID, {
        company_name: 'Restaurant Le Bon Plat',
        naf_code: '56.10A',
        evaluator_name: 'Marie Dupont',
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.risks.some((r) => r.name.includes('ulure'))).toBe(true);
        expect(result.value.risks.some((r) => r.name.includes('oupure'))).toBe(true);
      }
    });

    it('generates DUERP with custom risks', async () => {
      const result = await service.generate(TENANT_ID, {
        company_name: 'Test Co',
        evaluator_name: 'Evaluateur',
        risks: [
          {
            category: 'Custom',
            name: 'Risque specifique',
            gravity: 3,
            probability: 2,
            preventive_actions: ['Action 1'],
          },
        ],
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.risks).toHaveLength(1);
        expect(result.value.risks[0]!.name).toBe('Risque specifique');
        expect(result.value.risks[0]!.risk_level).toBe(6);
        expect(result.value.risks[0]!.risk_label).toBe('modere');
      }
    });

    it('calculates risk levels correctly', async () => {
      const result = await service.generate(TENANT_ID, {
        company_name: 'Test',
        evaluator_name: 'Test',
        risks: [
          { category: 'A', name: 'Low', gravity: 1, probability: 1, preventive_actions: [] },
          { category: 'B', name: 'Critical', gravity: 4, probability: 4, preventive_actions: [] },
        ],
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.risks[0]!.risk_label).toBe('faible');
        expect(result.value.risks[1]!.risk_label).toBe('critique');
      }
    });
  });

  describe('getById', () => {
    it('returns DUERP by id', async () => {
      const created = await service.generate(TENANT_ID, {
        company_name: 'Test',
        evaluator_name: 'Test',
      });
      if (!created.ok) throw new Error('Failed');

      const result = await service.getById(created.value.id, TENANT_ID);
      expect(result.ok).toBe(true);
    });

    it('returns NOT_FOUND for wrong tenant', async () => {
      const created = await service.generate(TENANT_ID, {
        company_name: 'Test',
        evaluator_name: 'Test',
      });
      if (!created.ok) throw new Error('Failed');

      const result = await service.getById(created.value.id, 'other-tenant');
      expect(result.ok).toBe(false);
    });
  });

  describe('update', () => {
    it('updates DUERP and increments version', async () => {
      const created = await service.generate(TENANT_ID, {
        company_name: 'Test',
        evaluator_name: 'Test',
      });
      if (!created.ok) throw new Error('Failed');

      const result = await service.update(created.value.id, TENANT_ID, {
        title: 'Updated DUERP',
        notes: 'Updated after incident',
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.title).toBe('Updated DUERP');
        expect(result.value.notes).toBe('Updated after incident');
        expect(result.value.version).toBe(2);
      }
    });
  });

  describe('delete', () => {
    it('soft deletes DUERP', async () => {
      const created = await service.generate(TENANT_ID, {
        company_name: 'Test',
        evaluator_name: 'Test',
      });
      if (!created.ok) throw new Error('Failed');

      const deleteResult = await service.delete(created.value.id, TENANT_ID);
      expect(deleteResult.ok).toBe(true);

      const getResult = await service.getById(created.value.id, TENANT_ID);
      expect(getResult.ok).toBe(false);
    });
  });
});

describe('generateDuerpHtml', () => {
  it('generates valid HTML with company info', () => {
    const doc: DuerpDocument = {
      id: 'test-id',
      tenant_id: TENANT_ID,
      title: 'DUERP Test',
      company_name: 'BTP Martin SARL',
      siret: '12345678901234',
      naf_code: '43.21A',
      naf_label: 'Travaux de maconnerie',
      sector_name: 'BTP - Travaux de construction',
      address: '12 rue du Chantier, 75001 Paris',
      employee_count: 5,
      evaluator_name: 'Jean Martin',
      evaluation_date: new Date('2026-04-14'),
      convention_collective: null,
      code_idcc: null,
      work_units: [],
      risks: [
        {
          id: 'r1',
          duerp_id: 'test-id',
          risk_id: 'btp-chute-hauteur',
          category: 'Chute',
          name: 'Chute de hauteur',
          description: 'Travaux en hauteur',
          gravity: 4,
          probability: 3,
          risk_level: 12,
          risk_label: 'critique',
          preventive_actions: ['Harnais', 'Echafaudage verifie'],
          existing_measures: null,
          responsible: 'Chef chantier',
          deadline: null,
        },
      ],
      version: 1,
      notes: null,
      created_at: new Date(),
      updated_at: new Date(),
      deleted_at: null,
    };

    const html = generateDuerpHtml(doc);

    expect(html).toContain('BTP Martin SARL');
    expect(html).toContain('43.21A');
    expect(html).toContain('Jean Martin');
    expect(html).toContain('Chute de hauteur');
    expect(html).toContain('Harnais');
    expect(html).toContain('DOCUMENT UNIQUE');
    expect(html).toContain('Articles R4121-1');
    expect(html).toContain('critique');
  });

  it('includes risk matrix', () => {
    const doc: DuerpDocument = {
      id: 'test-id',
      tenant_id: TENANT_ID,
      title: 'Test',
      company_name: 'Test',
      siret: null,
      naf_code: null,
      naf_label: null,
      sector_name: null,
      address: null,
      employee_count: 0,
      evaluator_name: 'Test',
      evaluation_date: new Date(),
      convention_collective: null,
      code_idcc: null,
      work_units: [],
      risks: [],
      version: 1,
      notes: null,
      created_at: new Date(),
      updated_at: new Date(),
      deleted_at: null,
    };

    const html = generateDuerpHtml(doc);
    expect(html).toContain('Matrice des risques');
    expect(html).toContain('Grav.');
    expect(html).toContain('Prob.');
  });

  it('escapes HTML in user content', () => {
    const doc: DuerpDocument = {
      id: 'test-id',
      tenant_id: TENANT_ID,
      title: 'Test <script>alert("xss")</script>',
      company_name: 'Company & "Fils"',
      siret: null,
      naf_code: null,
      naf_label: null,
      sector_name: null,
      address: null,
      employee_count: 0,
      evaluator_name: 'Test',
      evaluation_date: new Date(),
      convention_collective: null,
      code_idcc: null,
      work_units: [],
      risks: [],
      version: 1,
      notes: null,
      created_at: new Date(),
      updated_at: new Date(),
      deleted_at: null,
    };

    const html = generateDuerpHtml(doc);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&amp;');
    expect(html).toContain('&quot;');
  });
});
