import type { FastifyInstance } from 'fastify';
import { createSupplierService, type SupplierRepository, type Supplier } from './supplier.service.js';
import { createSupplierSchema, updateSupplierSchema, supplierListQuerySchema } from './supplier.schemas.js';
import { authenticate, requirePermission } from '../../plugins/auth.js';
import { injectTenant } from '../../plugins/tenant.js';

// BUSINESS RULE [CDC-2.2]: Endpoints fournisseurs

export async function supplierRoutes(app: FastifyInstance) {
  // Placeholder in-memory repo
  const suppliers = new Map<string, Supplier>();

  const repo: SupplierRepository = {
    async create(data) {
      const id = crypto.randomUUID();
      const supplier: Supplier = {
        id,
        tenant_id: data.tenant_id,
        name: data.name,
        siret: data.siret ?? null,
        email: data.email ?? null,
        phone: data.phone ?? null,
        address: data.address ? (data.address as Record<string, unknown>) : null,
        iban: data.iban ?? null,
        bic: data.bic ?? null,
        payment_terms: data.payment_terms ?? 30,
        category: data.category ?? null,
        created_at: new Date(),
        updated_at: new Date(),
        deleted_at: null,
      };
      suppliers.set(id, supplier);
      return supplier;
    },
    async findById(id, tenantId) {
      const s = suppliers.get(id);
      if (!s || s.tenant_id !== tenantId || s.deleted_at) return null;
      return s;
    },
    async update(id, tenantId, data) {
      const s = suppliers.get(id);
      if (!s || s.tenant_id !== tenantId || s.deleted_at) return null;
      const updated = { ...s, ...data, updated_at: new Date() } as Supplier;
      suppliers.set(id, updated);
      return updated;
    },
    async softDelete(id, tenantId) {
      const s = suppliers.get(id);
      if (!s || s.tenant_id !== tenantId) return false;
      s.deleted_at = new Date();
      return true;
    },
    async list(tenantId, query) {
      let items = [...suppliers.values()].filter(
        (s) => s.tenant_id === tenantId && !s.deleted_at,
      );
      if (query.search) {
        const term = query.search.toLowerCase();
        items = items.filter((s) => s.name.toLowerCase().includes(term));
      }
      if (query.category) {
        items = items.filter((s) => s.category === query.category);
      }
      const total = items.length;
      items = items.slice(0, query.limit);
      return { items, total };
    },
  };

  const supplierService = createSupplierService(repo);
  const preHandlers = [authenticate, injectTenant];

  // POST /api/suppliers
  app.post(
    '/api/suppliers',
    { preHandler: [...preHandlers, requirePermission('purchase', 'create')] },
    async (request, reply) => {
      const parsed = createSupplierSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: { code: 'VALIDATION_ERROR', message: 'Invalid supplier data', details: { issues: parsed.error.issues } },
        });
      }
      const result = await supplierService.createSupplier(request.auth.tenant_id, parsed.data);
      if (!result.ok) return reply.status(400).send({ error: result.error });
      return reply.status(201).send(result.value);
    },
  );

  // GET /api/suppliers
  app.get(
    '/api/suppliers',
    { preHandler: [...preHandlers, requirePermission('purchase', 'read')] },
    async (request, reply) => {
      const parsed = supplierListQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.status(400).send({
          error: { code: 'VALIDATION_ERROR', message: 'Invalid query', details: { issues: parsed.error.issues } },
        });
      }
      const result = await supplierService.listSuppliers(request.auth.tenant_id, parsed.data);
      if (!result.ok) return reply.status(500).send({ error: result.error });
      return result.value;
    },
  );

  // GET /api/suppliers/:id
  app.get(
    '/api/suppliers/:id',
    { preHandler: [...preHandlers, requirePermission('purchase', 'read')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const result = await supplierService.getSupplier(id, request.auth.tenant_id);
      if (!result.ok) return reply.status(404).send({ error: result.error });
      return result.value;
    },
  );

  // PUT /api/suppliers/:id
  app.put(
    '/api/suppliers/:id',
    { preHandler: [...preHandlers, requirePermission('purchase', 'update')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = updateSupplierSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: { code: 'VALIDATION_ERROR', message: 'Invalid supplier data', details: { issues: parsed.error.issues } },
        });
      }
      const result = await supplierService.updateSupplier(id, request.auth.tenant_id, parsed.data);
      if (!result.ok) {
        const status = result.error.code === 'NOT_FOUND' ? 404 : 400;
        return reply.status(status).send({ error: result.error });
      }
      return result.value;
    },
  );

  // DELETE /api/suppliers/:id
  app.delete(
    '/api/suppliers/:id',
    { preHandler: [...preHandlers, requirePermission('purchase', 'delete')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const result = await supplierService.deleteSupplier(id, request.auth.tenant_id);
      if (!result.ok) return reply.status(404).send({ error: result.error });
      return reply.status(204).send();
    },
  );
}
