import type { FastifyInstance } from 'fastify';
import { createQuoteService, type QuoteRepository, type Quote, type QuoteLine } from './quote.service.js';
import { createQuoteSchema, updateQuoteSchema, quoteListSchema } from './quote.schemas.js';
import { createDocumentNumberGenerator, createInMemoryNumberRepo } from './document-number.js';
import { authenticate, requirePermission } from '../../plugins/auth.js';
import { injectTenant } from '../../plugins/tenant.js';
import { ok } from '@omni-gerant/shared';

// BUSINESS RULE [CDC-2.1]: Endpoints devis

export async function quoteRoutes(app: FastifyInstance) {
  // Placeholder repo - will use Prisma when DB connected
  const repo: QuoteRepository = {
    async create(data) {
      const id = crypto.randomUUID();
      return {
        id,
        tenant_id: data.tenant_id,
        client_id: data.client_id,
        number: data.number,
        status: 'draft',
        title: data.title ?? null,
        description: data.description ?? null,
        issue_date: new Date(),
        validity_date: data.validity_date,
        deposit_rate: data.deposit_rate ?? null,
        discount_type: data.discount_type ?? null,
        discount_value: data.discount_value ?? null,
        notes: data.notes ?? null,
        total_ht_cents: data.total_ht_cents,
        total_tva_cents: data.total_tva_cents,
        total_ttc_cents: data.total_ttc_cents,
        signed_at: null,
        created_at: new Date(),
        updated_at: new Date(),
        deleted_at: null,
        lines: data.lines.map((l, i) => ({
          id: crypto.randomUUID(),
          quote_id: id,
          product_id: l.product_id ?? null,
          position: l.position,
          type: l.type,
          label: l.label,
          description: l.description ?? null,
          quantity: l.quantity,
          unit: l.unit,
          unit_price_cents: l.unit_price_cents,
          tva_rate: l.tva_rate,
          discount_type: l.discount_type ?? null,
          discount_value: l.discount_value ?? null,
          total_ht_cents: l.total_ht_cents,
        })),
      };
    },
    async findById(_id, _tenantId) { return null; },
    async findMany(_params) { return { items: [], next_cursor: null, has_more: false }; },
    async update(_id, _tenantId, _data) { return null; },
    async delete(_id, _tenantId) { return true; },
  };

  const numberRepo = createInMemoryNumberRepo();
  const numberGen = createDocumentNumberGenerator(numberRepo);
  const quoteService = createQuoteService(repo, {
    generate: (tenantId: string) => numberGen.generate(tenantId, 'DEV'),
  });

  const preHandlers = [authenticate, injectTenant];

  // POST /api/quotes
  app.post(
    '/api/quotes',
    { preHandler: [...preHandlers, requirePermission('quote', 'create')] },
    async (request, reply) => {
      const parsed = createQuoteSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid quote data',
            details: { issues: parsed.error.issues },
          },
        });
      }

      const result = await quoteService.create(request.auth.tenant_id, parsed.data);
      if (!result.ok) {
        return reply.status(400).send({ error: result.error });
      }
      return reply.status(201).send(result.value);
    },
  );

  // GET /api/quotes
  app.get(
    '/api/quotes',
    { preHandler: [...preHandlers, requirePermission('quote', 'read')] },
    async (request, reply) => {
      const parsed = quoteListSchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.status(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid query parameters',
            details: { issues: parsed.error.issues },
          },
        });
      }

      const result = await quoteService.list(request.auth.tenant_id, parsed.data);
      if (!result.ok) {
        return reply.status(500).send({ error: result.error });
      }
      return result.value;
    },
  );

  // GET /api/quotes/:id
  app.get(
    '/api/quotes/:id',
    { preHandler: [...preHandlers, requirePermission('quote', 'read')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const result = await quoteService.getById(id, request.auth.tenant_id);
      if (!result.ok) {
        return reply.status(404).send({ error: result.error });
      }
      return result.value;
    },
  );

  // PATCH /api/quotes/:id
  app.patch(
    '/api/quotes/:id',
    { preHandler: [...preHandlers, requirePermission('quote', 'update')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = updateQuoteSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid quote data',
            details: { issues: parsed.error.issues },
          },
        });
      }

      const result = await quoteService.update(id, request.auth.tenant_id, parsed.data);
      if (!result.ok) {
        const status = result.error.code === 'NOT_FOUND' ? 404 : 403;
        return reply.status(status).send({ error: result.error });
      }
      return result.value;
    },
  );

  // DELETE /api/quotes/:id
  app.delete(
    '/api/quotes/:id',
    { preHandler: [...preHandlers, requirePermission('quote', 'delete')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const result = await quoteService.delete(id, request.auth.tenant_id);
      if (!result.ok) {
        const status = result.error.code === 'NOT_FOUND' ? 404 : 403;
        return reply.status(status).send({ error: result.error });
      }
      return reply.status(204).send();
    },
  );
}
