import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate, requirePermission } from '../../../plugins/auth.js';
import { injectTenant } from '../../../plugins/tenant.js';

// Vague F1 : templates de devis/facture reutilisables

const lineSchema = z.object({
  position: z.number().int().min(0),
  type: z.enum(['line', 'section', 'subtotal', 'comment']).default('line'),
  label: z.string().min(1).max(500),
  description: z.string().max(2000).optional(),
  quantity: z.number().min(0).default(1),
  unit: z.string().max(20).default('unit'),
  unit_price_cents: z.number().int().min(0).default(0),
  tva_rate: z.number().int().refine((v) => [0, 210, 550, 1000, 2000].includes(v)).default(2000),
  discount_type: z.enum(['percentage', 'fixed']).optional(),
  discount_value: z.number().int().min(0).optional(),
});

const createTemplateSchema = z.object({
  name: z.string().min(2).max(200),
  description: z.string().max(500).optional(),
  scope: z.enum(['quote', 'invoice']).default('quote'),
  payload: z.object({
    title: z.string().max(500).optional(),
    description: z.string().max(5000).optional(),
    validity_days: z.number().int().min(1).max(365).optional(),
    deposit_rate: z.number().int().min(0).max(10000).optional(),
    discount_type: z.enum(['percentage', 'fixed']).optional(),
    discount_value: z.number().int().min(0).optional(),
    notes: z.string().max(5000).optional(),
    lines: z.array(lineSchema).min(1),
  }),
});

const updateTemplateSchema = createTemplateSchema.partial().extend({});

export async function quoteTemplateRoutes(app: FastifyInstance) {
  const preHandlers = [authenticate, injectTenant];

  // GET /api/quote-templates
  app.get(
    '/api/quote-templates',
    { preHandler: [...preHandlers, requirePermission('quote', 'read')] },
    async (request, reply) => {
      if (!process.env['DATABASE_URL']) return { items: [] };
      try {
        const { prisma } = await import('@zenadmin/db');
        const scope = (request.query as { scope?: string }).scope;
        const items = await (prisma as unknown as { quoteTemplate?: { findMany?: Function } })
          .quoteTemplate?.findMany?.({
            where: { tenant_id: request.auth.tenant_id, deleted_at: null, ...(scope ? { scope } : {}) },
            orderBy: [{ use_count: 'desc' }, { updated_at: 'desc' }],
          }) ?? [];
        return { items };
      } catch (e) {
        return reply.status(500).send({ error: { code: 'INTERNAL_ERROR', message: e instanceof Error ? e.message : 'unknown' } });
      }
    },
  );

  // POST /api/quote-templates
  app.post(
    '/api/quote-templates',
    { preHandler: [...preHandlers, requirePermission('quote', 'create')] },
    async (request, reply) => {
      const parsed = createTemplateSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: { code: 'VALIDATION_ERROR', message: 'Données invalides.', details: { issues: parsed.error.issues } },
        });
      }
      const { prisma } = await import('@zenadmin/db');
      const created = await (prisma as unknown as { quoteTemplate?: { create?: Function } })
        .quoteTemplate?.create?.({
          data: {
            tenant_id: request.auth.tenant_id,
            name: parsed.data.name,
            description: parsed.data.description ?? null,
            scope: parsed.data.scope,
            payload: parsed.data.payload as unknown as Record<string, unknown>,
          },
        });
      return reply.status(201).send(created);
    },
  );

  // GET /api/quote-templates/:id
  app.get(
    '/api/quote-templates/:id',
    { preHandler: [...preHandlers, requirePermission('quote', 'read')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const { prisma } = await import('@zenadmin/db');
      const t = await (prisma as unknown as { quoteTemplate?: { findFirst?: Function } })
        .quoteTemplate?.findFirst?.({
          where: { id, tenant_id: request.auth.tenant_id, deleted_at: null },
        });
      if (!t) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Template introuvable' } });
      return t;
    },
  );

  // PATCH /api/quote-templates/:id
  app.patch(
    '/api/quote-templates/:id',
    { preHandler: [...preHandlers, requirePermission('quote', 'update')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = updateTemplateSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: { code: 'VALIDATION_ERROR', message: 'Données invalides.', details: { issues: parsed.error.issues } },
        });
      }
      const { prisma } = await import('@zenadmin/db');
      const p = prisma as unknown as { quoteTemplate?: { updateMany?: Function; findFirst?: Function } };
      const data: Record<string, unknown> = {};
      if (parsed.data.name !== undefined) data.name = parsed.data.name;
      if (parsed.data.description !== undefined) data.description = parsed.data.description;
      if (parsed.data.scope !== undefined) data.scope = parsed.data.scope;
      if (parsed.data.payload !== undefined) data.payload = parsed.data.payload;
      await p.quoteTemplate?.updateMany?.({
        where: { id, tenant_id: request.auth.tenant_id },
        data,
      });
      const updated = await p.quoteTemplate?.findFirst?.({ where: { id, tenant_id: request.auth.tenant_id } });
      return updated;
    },
  );

  // DELETE /api/quote-templates/:id — soft delete (R04)
  app.delete(
    '/api/quote-templates/:id',
    { preHandler: [...preHandlers, requirePermission('quote', 'delete')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const { prisma } = await import('@zenadmin/db');
      await (prisma as unknown as { quoteTemplate?: { updateMany?: Function } })
        .quoteTemplate?.updateMany?.({
          where: { id, tenant_id: request.auth.tenant_id },
          data: { deleted_at: new Date() },
        });
      return reply.status(204).send();
    },
  );

  // POST /api/quote-templates/:id/use — increment use_count + return payload
  app.post(
    '/api/quote-templates/:id/use',
    { preHandler: [...preHandlers, requirePermission('quote', 'read')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const { prisma } = await import('@zenadmin/db');
      const p = prisma as unknown as { quoteTemplate?: { findFirst?: Function; update?: Function } };
      const t = await p.quoteTemplate?.findFirst?.({
        where: { id, tenant_id: request.auth.tenant_id, deleted_at: null },
      });
      if (!t) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Template introuvable' } });
      await p.quoteTemplate?.update?.({
        where: { id },
        data: { use_count: { increment: 1 } },
      });
      return { template: t, payload: (t as { payload: unknown }).payload };
    },
  );
}
