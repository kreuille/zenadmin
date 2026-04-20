import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate, requirePermission } from '../../plugins/auth.js';
import { injectTenant } from '../../plugins/tenant.js';

// Vague L1 : Multi-entrepots + stock par location.

const warehouseSchema = z.object({
  name: z.string().min(1).max(100),
  address: z.string().max(500).optional().nullable(),
  is_default: z.boolean().default(false),
  is_active: z.boolean().default(true),
});

const stockSetSchema = z.object({
  product_id: z.string().uuid(),
  variant_id: z.string().uuid().optional().nullable(),
  quantity: z.number().int().min(0),
});

export async function warehouseRoutes(app: FastifyInstance) {
  const preHandlers = [authenticate, injectTenant];

  app.get('/api/warehouses', { preHandler: [...preHandlers, requirePermission('product', 'read')] }, async (request) => {
    if (!process.env['DATABASE_URL']) return { items: [] };
    const { prisma } = await import('@zenadmin/db');
    const items = await (prisma as unknown as { warehouse?: { findMany?: Function } })
      .warehouse?.findMany?.({
        where: { tenant_id: request.auth.tenant_id, deleted_at: null },
        orderBy: [{ is_default: 'desc' }, { name: 'asc' }],
      }) ?? [];
    return { items };
  });

  app.post('/api/warehouses', { preHandler: [...preHandlers, requirePermission('product', 'create')] }, async (request, reply) => {
    const parsed = warehouseSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: 'Données invalides.', details: { issues: parsed.error.issues } } });
    }
    const { prisma } = await import('@zenadmin/db');
    const p = prisma as unknown as { warehouse?: { updateMany?: Function; create?: Function } };
    if (parsed.data.is_default) {
      // Si on set un default, unset les autres
      await p.warehouse?.updateMany?.({
        where: { tenant_id: request.auth.tenant_id, is_default: true },
        data: { is_default: false },
      });
    }
    const created = await p.warehouse?.create?.({
      data: { ...parsed.data, tenant_id: request.auth.tenant_id },
    });
    return reply.status(201).send(created);
  });

  app.patch('/api/warehouses/:id', { preHandler: [...preHandlers, requirePermission('product', 'update')] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = warehouseSchema.partial().safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: 'Données invalides.' } });
    }
    const { prisma } = await import('@zenadmin/db');
    await (prisma as unknown as { warehouse?: { updateMany?: Function } })
      .warehouse?.updateMany?.({
        where: { id, tenant_id: request.auth.tenant_id },
        data: parsed.data as Record<string, unknown>,
      });
    return { ok: true };
  });

  app.delete('/api/warehouses/:id', { preHandler: [...preHandlers, requirePermission('product', 'delete')] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { prisma } = await import('@zenadmin/db');
    await (prisma as unknown as { warehouse?: { updateMany?: Function } })
      .warehouse?.updateMany?.({
        where: { id, tenant_id: request.auth.tenant_id },
        data: { deleted_at: new Date(), is_active: false },
      });
    return reply.status(204).send();
  });

  // Stock par entrepot
  app.get('/api/warehouses/:id/stocks', { preHandler: [...preHandlers, requirePermission('product', 'read')] }, async (request) => {
    const { id } = request.params as { id: string };
    if (!process.env['DATABASE_URL']) return { items: [] };
    const { prisma } = await import('@zenadmin/db');
    const items = await (prisma as unknown as { warehouseStock?: { findMany?: Function } })
      .warehouseStock?.findMany?.({
        where: { warehouse_id: id, tenant_id: request.auth.tenant_id },
      }) ?? [];
    return { items };
  });

  app.put('/api/warehouses/:id/stocks', { preHandler: [...preHandlers, requirePermission('product', 'update')] }, async (request, reply) => {
    const { id: warehouseId } = request.params as { id: string };
    const parsed = stockSetSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: 'Données invalides.' } });
    }
    const { prisma } = await import('@zenadmin/db');
    const p = prisma as unknown as { warehouseStock?: { upsert?: Function } };
    const result = await p.warehouseStock?.upsert?.({
      where: {
        warehouse_id_product_id_variant_id: {
          warehouse_id: warehouseId,
          product_id: parsed.data.product_id,
          variant_id: parsed.data.variant_id ?? null,
        },
      },
      update: { quantity: parsed.data.quantity },
      create: {
        tenant_id: request.auth.tenant_id,
        warehouse_id: warehouseId,
        product_id: parsed.data.product_id,
        variant_id: parsed.data.variant_id ?? null,
        quantity: parsed.data.quantity,
      },
    });
    return result;
  });

  // Transfer entre entrepots
  app.post('/api/warehouses/transfer', { preHandler: [...preHandlers, requirePermission('product', 'update')] }, async (request, reply) => {
    const body = (request.body ?? {}) as {
      from_warehouse_id?: string;
      to_warehouse_id?: string;
      product_id?: string;
      variant_id?: string | null;
      quantity?: number;
    };
    if (!body.from_warehouse_id || !body.to_warehouse_id || !body.product_id || !body.quantity) {
      return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: 'Champs requis manquants.' } });
    }
    if (body.from_warehouse_id === body.to_warehouse_id) {
      return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: 'Entrepôts source et cible identiques.' } });
    }
    const { prisma } = await import('@zenadmin/db');
    await prisma.$transaction(async (tx) => {
      const p = tx as unknown as { warehouseStock?: { update?: Function; upsert?: Function } };
      await p.warehouseStock?.update?.({
        where: {
          warehouse_id_product_id_variant_id: {
            warehouse_id: body.from_warehouse_id,
            product_id: body.product_id,
            variant_id: body.variant_id ?? null,
          },
        },
        data: { quantity: { decrement: body.quantity } },
      });
      await p.warehouseStock?.upsert?.({
        where: {
          warehouse_id_product_id_variant_id: {
            warehouse_id: body.to_warehouse_id,
            product_id: body.product_id,
            variant_id: body.variant_id ?? null,
          },
        },
        update: { quantity: { increment: body.quantity } },
        create: {
          tenant_id: request.auth.tenant_id,
          warehouse_id: body.to_warehouse_id,
          product_id: body.product_id,
          variant_id: body.variant_id ?? null,
          quantity: body.quantity,
        },
      });
    });
    return { ok: true };
  });
}
