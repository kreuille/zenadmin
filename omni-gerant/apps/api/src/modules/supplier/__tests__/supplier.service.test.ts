import { describe, it, expect, vi } from 'vitest';
import {
  createSupplierService,
  type Supplier,
  type SupplierRepository,
} from '../supplier.service.js';

const TENANT_ID = '550e8400-e29b-41d4-a716-446655440000';

const mockSupplier: Supplier = {
  id: '660e8400-e29b-41d4-a716-446655440001',
  tenant_id: TENANT_ID,
  name: 'Materiaux Pro',
  siret: '12345678901234',
  email: 'contact@materiauxpro.fr',
  phone: '0145678901',
  address: { line1: '10 Rue du Commerce', zip_code: '75015', city: 'Paris', country: 'FR' },
  iban: 'FR7630006000011234567890189',
  bic: 'BNPAFRPP',
  payment_terms: 30,
  category: 'materiaux',
  created_at: new Date(),
  updated_at: new Date(),
  deleted_at: null,
};

function createMockRepo(overrides?: Partial<SupplierRepository>): SupplierRepository {
  return {
    create: vi.fn().mockResolvedValue(mockSupplier),
    findById: vi.fn().mockResolvedValue(mockSupplier),
    update: vi.fn().mockResolvedValue(mockSupplier),
    softDelete: vi.fn().mockResolvedValue(true),
    list: vi.fn().mockResolvedValue({ items: [mockSupplier], total: 1 }),
    ...overrides,
  };
}

describe('SupplierService', () => {
  describe('createSupplier', () => {
    it('creates a supplier', async () => {
      const repo = createMockRepo();
      const service = createSupplierService(repo);

      const result = await service.createSupplier(TENANT_ID, {
        name: 'Materiaux Pro',
        email: 'contact@materiauxpro.fr',
        iban: 'FR7630006000011234567890189',
        bic: 'BNPAFRPP',
      });

      expect(result.ok).toBe(true);
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ tenant_id: TENANT_ID, name: 'Materiaux Pro' }),
      );
    });

    it('creates a supplier with minimal data', async () => {
      const repo = createMockRepo();
      const service = createSupplierService(repo);

      const result = await service.createSupplier(TENANT_ID, { name: 'Simple Supplier' });

      expect(result.ok).toBe(true);
    });
  });

  describe('getSupplier', () => {
    it('returns supplier when found', async () => {
      const repo = createMockRepo();
      const service = createSupplierService(repo);

      const result = await service.getSupplier(mockSupplier.id, TENANT_ID);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.name).toBe('Materiaux Pro');
      }
    });

    it('returns NOT_FOUND when supplier does not exist', async () => {
      const repo = createMockRepo({ findById: vi.fn().mockResolvedValue(null) });
      const service = createSupplierService(repo);

      const result = await service.getSupplier('nonexistent', TENANT_ID);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('NOT_FOUND');
      }
    });
  });

  describe('updateSupplier', () => {
    it('updates supplier successfully', async () => {
      const updated = { ...mockSupplier, name: 'New Name' };
      const repo = createMockRepo({ update: vi.fn().mockResolvedValue(updated) });
      const service = createSupplierService(repo);

      const result = await service.updateSupplier(mockSupplier.id, TENANT_ID, { name: 'New Name' });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.name).toBe('New Name');
      }
    });

    it('returns NOT_FOUND for nonexistent supplier', async () => {
      const repo = createMockRepo({ findById: vi.fn().mockResolvedValue(null) });
      const service = createSupplierService(repo);

      const result = await service.updateSupplier('nonexistent', TENANT_ID, { name: 'New Name' });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('NOT_FOUND');
      }
    });

    it('updates IBAN and BIC', async () => {
      const updated = { ...mockSupplier, iban: 'DE89370400440532013000', bic: 'COBADEFFXXX' };
      const repo = createMockRepo({ update: vi.fn().mockResolvedValue(updated) });
      const service = createSupplierService(repo);

      const result = await service.updateSupplier(mockSupplier.id, TENANT_ID, {
        iban: 'DE89370400440532013000',
        bic: 'COBADEFFXXX',
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.iban).toBe('DE89370400440532013000');
      }
    });
  });

  describe('deleteSupplier', () => {
    it('soft deletes supplier', async () => {
      const repo = createMockRepo();
      const service = createSupplierService(repo);

      const result = await service.deleteSupplier(mockSupplier.id, TENANT_ID);

      expect(result.ok).toBe(true);
      expect(repo.softDelete).toHaveBeenCalledWith(mockSupplier.id, TENANT_ID);
    });

    it('returns NOT_FOUND for nonexistent supplier', async () => {
      const repo = createMockRepo({ findById: vi.fn().mockResolvedValue(null) });
      const service = createSupplierService(repo);

      const result = await service.deleteSupplier('nonexistent', TENANT_ID);

      expect(result.ok).toBe(false);
    });
  });

  describe('listSuppliers', () => {
    it('returns paginated results', async () => {
      const repo = createMockRepo();
      const service = createSupplierService(repo);

      const result = await service.listSuppliers(TENANT_ID, { limit: 20, sort_by: 'name', sort_dir: 'asc' });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.items).toHaveLength(1);
        expect(result.value.has_more).toBe(false);
        expect(result.value.total).toBe(1);
      }
    });

    it('indicates has_more when items equal limit', async () => {
      const items = Array.from({ length: 20 }, (_, i) => ({
        ...mockSupplier,
        id: `id-${i}`,
      }));
      const repo = createMockRepo({
        list: vi.fn().mockResolvedValue({ items, total: 50 }),
      });
      const service = createSupplierService(repo);

      const result = await service.listSuppliers(TENANT_ID, { limit: 20, sort_by: 'name', sort_dir: 'asc' });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.has_more).toBe(true);
        expect(result.value.next_cursor).toBe('id-19');
      }
    });
  });
});
