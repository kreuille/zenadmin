import type { FastifyInstance } from 'fastify';
import {
  createPurchaseService,
  calculatePurchaseLineTotals,
  type PurchaseRepository,
  type Purchase,
  type PurchaseLine,
} from './purchase.service.js';
import {
  createPurchaseSchema,
  updatePurchaseSchema,
  purchaseListQuerySchema,
  validatePurchaseSchema,
} from './purchase.schemas.js';
import { authenticate, requirePermission } from '../../plugins/auth.js';
import { injectTenant } from '../../plugins/tenant.js';

// BUSINESS RULE [CDC-2.2]: Endpoints achats

export async function purchaseRoutes(app: FastifyInstance) {
  // Placeholder in-memory repo
  const purchases = new Map<string, Purchase>();

  const repo: PurchaseRepository = {
    async create(data) {
      const id = crypto.randomUUID();
      const lines: PurchaseLine[] = data.lines.map((l, i) => ({
        id: crypto.randomUUID(),
        purchase_id: id,
        position: l.position,
        label: l.label,
        quantity: l.quantity,
        unit_price_cents: l.unit_price_cents,
        tva_rate: l.tva_rate,
        total_ht_cents: Math.round(l.quantity * l.unit_price_cents),
      }));

      const purchase: Purchase = {
        id,
        tenant_id: data.tenant_id,
        supplier_id: data.supplier_id ?? null,
        number: data.number ?? null,
        status: 'pending',
        source: data.source,
        issue_date: data.issue_date ?? null,
        due_date: data.due_date ?? null,
        total_ht_cents: data.total_ht_cents,
        total_tva_cents: data.total_tva_cents,
        total_ttc_cents: data.total_ttc_cents,
        paid_cents: 0,
        category: data.category ?? null,
        notes: data.notes ?? null,
        document_url: data.document_url ?? null,
        ocr_data: null,
        ocr_confidence: null,
        created_at: new Date(),
        updated_at: new Date(),
        deleted_at: null,
        lines,
      };
      purchases.set(id, purchase);
      return purchase;
    },
    async findById(id, tenantId) {
      const p = purchases.get(id);
      if (!p || p.tenant_id !== tenantId || p.deleted_at) return null;
      return p;
    },
    async update(id, tenantId, data) {
      const p = purchases.get(id);
      if (!p || p.tenant_id !== tenantId || p.deleted_at) return null;
      const updated = { ...p, ...data, updated_at: new Date() } as Purchase;
      purchases.set(id, updated);
      return updated;
    },
    async updateStatus(id, tenantId, status) {
      const p = purchases.get(id);
      if (!p || p.tenant_id !== tenantId || p.deleted_at) return null;
      p.status = status;
      p.updated_at = new Date();
      return p;
    },
    async updatePayment(id, tenantId, paidCents) {
      const p = purchases.get(id);
      if (!p || p.tenant_id !== tenantId || p.deleted_at) return null;
      p.paid_cents = paidCents;
      p.updated_at = new Date();
      return p;
    },
    async softDelete(id, tenantId) {
      const p = purchases.get(id);
      if (!p || p.tenant_id !== tenantId) return false;
      p.deleted_at = new Date();
      return true;
    },
    async list(tenantId, query) {
      let items = [...purchases.values()].filter(
        (p) => p.tenant_id === tenantId && !p.deleted_at,
      );
      if (query.status) items = items.filter((p) => p.status === query.status);
      if (query.supplier_id) items = items.filter((p) => p.supplier_id === query.supplier_id);
      if (query.due_before) {
        const before = new Date(query.due_before);
        items = items.filter((p) => p.due_date && p.due_date <= before);
      }
      if (query.search) {
        const term = query.search.toLowerCase();
        items = items.filter((p) => p.number?.toLowerCase().includes(term));
      }
      items = items.slice(0, query.limit);
      const hasMore = items.length === query.limit;
      const nextCursor = hasMore && items.length > 0 ? items[items.length - 1]!.id : null;
      return { items, next_cursor: nextCursor, has_more: hasMore };
    },
  };

  const purchaseService = createPurchaseService(repo);
  const preHandlers = [authenticate, injectTenant];

  // POST /api/purchases
  app.post(
    '/api/purchases',
    { preHandler: [...preHandlers, requirePermission('purchase', 'create')] },
    async (request, reply) => {
      const parsed = createPurchaseSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: { code: 'VALIDATION_ERROR', message: 'Invalid purchase data', details: { issues: parsed.error.issues } },
        });
      }
      const result = await purchaseService.create(request.auth.tenant_id, parsed.data);
      if (!result.ok) return reply.status(400).send({ error: result.error });
      return reply.status(201).send(result.value);
    },
  );

  // GET /api/purchases
  app.get(
    '/api/purchases',
    { preHandler: [...preHandlers, requirePermission('purchase', 'read')] },
    async (request, reply) => {
      const parsed = purchaseListQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.status(400).send({
          error: { code: 'VALIDATION_ERROR', message: 'Invalid query', details: { issues: parsed.error.issues } },
        });
      }
      const result = await purchaseService.list(request.auth.tenant_id, parsed.data);
      if (!result.ok) return reply.status(500).send({ error: result.error });
      return result.value;
    },
  );

  // GET /api/purchases/:id
  app.get(
    '/api/purchases/:id',
    { preHandler: [...preHandlers, requirePermission('purchase', 'read')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const result = await purchaseService.getById(id, request.auth.tenant_id);
      if (!result.ok) return reply.status(404).send({ error: result.error });
      return result.value;
    },
  );

  // PUT /api/purchases/:id
  app.put(
    '/api/purchases/:id',
    { preHandler: [...preHandlers, requirePermission('purchase', 'update')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = updatePurchaseSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: { code: 'VALIDATION_ERROR', message: 'Invalid purchase data', details: { issues: parsed.error.issues } },
        });
      }
      const result = await purchaseService.update(id, request.auth.tenant_id, parsed.data);
      if (!result.ok) {
        const status = result.error.code === 'NOT_FOUND' ? 404 : result.error.code === 'FORBIDDEN' ? 403 : 400;
        return reply.status(status).send({ error: result.error });
      }
      return result.value;
    },
  );

  // POST /api/purchases/:id/validate
  app.post(
    '/api/purchases/:id/validate',
    { preHandler: [...preHandlers, requirePermission('purchase', 'update')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = validatePurchaseSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: { code: 'VALIDATION_ERROR', message: 'Invalid status', details: { issues: parsed.error.issues } },
        });
      }
      const result = await purchaseService.validate(id, request.auth.tenant_id, parsed.data.status);
      if (!result.ok) {
        const status = result.error.code === 'NOT_FOUND' ? 404 : 400;
        return reply.status(status).send({ error: result.error });
      }
      return result.value;
    },
  );

  // POST /api/purchases/:id/pay
  app.post(
    '/api/purchases/:id/pay',
    { preHandler: [...preHandlers, requirePermission('purchase', 'update')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = request.body as { amount_cents: number };
      if (!body.amount_cents || typeof body.amount_cents !== 'number') {
        return reply.status(400).send({
          error: { code: 'VALIDATION_ERROR', message: 'amount_cents is required' },
        });
      }
      const result = await purchaseService.markPaid(id, request.auth.tenant_id, body.amount_cents);
      if (!result.ok) {
        const status = result.error.code === 'NOT_FOUND' ? 404 : 400;
        return reply.status(status).send({ error: result.error });
      }
      return result.value;
    },
  );

  // GET /api/purchases/due-this-week
  app.get(
    '/api/purchases/due-this-week',
    { preHandler: [...preHandlers, requirePermission('purchase', 'read')] },
    async (request, reply) => {
      const result = await purchaseService.getDueThisWeek(request.auth.tenant_id);
      if (!result.ok) return reply.status(500).send({ error: result.error });
      return result.value;
    },
  );

  // DELETE /api/purchases/:id
  app.delete(
    '/api/purchases/:id',
    { preHandler: [...preHandlers, requirePermission('purchase', 'delete')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const result = await purchaseService.delete(id, request.auth.tenant_id);
      if (!result.ok) {
        const status = result.error.code === 'NOT_FOUND' ? 404 : 403;
        return reply.status(status).send({ error: result.error });
      }
      return reply.status(204).send();
    },
  );
}
