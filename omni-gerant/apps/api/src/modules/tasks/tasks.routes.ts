import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate, requirePermission } from '../../plugins/auth.js';
import { injectTenant } from '../../plugins/tenant.js';

// Vague L3 : Kanban taches (board par defaut + CRUD).

const taskSchema = z.object({
  board: z.string().default('default'),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional().nullable(),
  status: z.enum(['todo', 'doing', 'done']).default('todo'),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
  assignee_id: z.string().uuid().optional().nullable(),
  client_id: z.string().uuid().optional().nullable(),
  quote_id: z.string().uuid().optional().nullable(),
  invoice_id: z.string().uuid().optional().nullable(),
  due_at: z.coerce.date().optional().nullable(),
  labels: z.array(z.string().max(30)).default([]),
});

const reorderSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(['todo', 'doing', 'done']),
  position: z.number().int().min(0),
});

export async function tasksRoutes(app: FastifyInstance) {
  const preHandlers = [authenticate, injectTenant];

  // GET /api/tasks — renvoie groupes par status
  app.get('/api/tasks', { preHandler: preHandlers }, async (request) => {
    if (!process.env['DATABASE_URL']) return { todo: [], doing: [], done: [] };
    const { prisma } = await import('@zenadmin/db');
    const q = request.query as { board?: string; assignee_id?: string };
    const items = await (prisma as unknown as { task?: { findMany?: Function } })
      .task?.findMany?.({
        where: {
          tenant_id: request.auth.tenant_id,
          deleted_at: null,
          board: q.board ?? 'default',
          ...(q.assignee_id ? { assignee_id: q.assignee_id } : {}),
        },
        orderBy: [{ status: 'asc' }, { position: 'asc' }],
      }) ?? [];
    const buckets: Record<string, unknown[]> = { todo: [], doing: [], done: [] };
    for (const t of items as Array<{ status: string }>) {
      if (t.status in buckets) buckets[t.status]!.push(t);
    }
    return buckets;
  });

  app.post('/api/tasks', { preHandler: preHandlers }, async (request, reply) => {
    const parsed = taskSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: 'Données invalides.', details: { issues: parsed.error.issues } } });
    }
    const { prisma } = await import('@zenadmin/db');
    const created = await (prisma as unknown as { task?: { create?: Function } })
      .task?.create?.({
        data: {
          ...parsed.data,
          tenant_id: request.auth.tenant_id,
          created_by: request.auth.user_id,
          completed_at: parsed.data.status === 'done' ? new Date() : null,
        },
      });
    return reply.status(201).send(created);
  });

  app.patch('/api/tasks/:id', { preHandler: preHandlers }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = taskSchema.partial().safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: 'Données invalides.' } });
    }
    const { prisma } = await import('@zenadmin/db');
    const data = parsed.data as Record<string, unknown>;
    if (data.status === 'done' && !data.completed_at) data.completed_at = new Date();
    if (data.status && data.status !== 'done') data.completed_at = null;
    await (prisma as unknown as { task?: { updateMany?: Function } })
      .task?.updateMany?.({
        where: { id, tenant_id: request.auth.tenant_id },
        data,
      });
    const updated = await (prisma as unknown as { task?: { findFirst?: Function } })
      .task?.findFirst?.({ where: { id, tenant_id: request.auth.tenant_id } });
    return updated;
  });

  app.delete('/api/tasks/:id', { preHandler: preHandlers }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { prisma } = await import('@zenadmin/db');
    await (prisma as unknown as { task?: { updateMany?: Function } })
      .task?.updateMany?.({
        where: { id, tenant_id: request.auth.tenant_id },
        data: { deleted_at: new Date() },
      });
    return reply.status(204).send();
  });

  // POST /api/tasks/reorder — drag & drop kanban
  app.post('/api/tasks/reorder', { preHandler: preHandlers }, async (request, reply) => {
    const body = (request.body ?? {}) as { moves?: Array<z.infer<typeof reorderSchema>> };
    if (!body.moves || !Array.isArray(body.moves)) {
      return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: 'moves[] requis.' } });
    }
    const { prisma } = await import('@zenadmin/db');
    await prisma.$transaction(async (tx) => {
      for (const m of body.moves!) {
        const parsed = reorderSchema.safeParse(m);
        if (!parsed.success) continue;
        await (tx as unknown as { task?: { updateMany?: Function } })
          .task?.updateMany?.({
            where: { id: parsed.data.id, tenant_id: request.auth.tenant_id },
            data: {
              status: parsed.data.status,
              position: parsed.data.position,
              completed_at: parsed.data.status === 'done' ? new Date() : null,
            },
          });
      }
    });
    return { ok: true };
  });
}
