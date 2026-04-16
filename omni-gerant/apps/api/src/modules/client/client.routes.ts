import type { FastifyInstance } from 'fastify';
import { createClientService, type ClientRepository, type Client, getClientDisplayName } from './client.service.js';
import { createClientSchema, updateClientSchema, clientListQuerySchema } from './client.schemas.js';
import { authenticate, requirePermission } from '../../plugins/auth.js';
import { injectTenant } from '../../plugins/tenant.js';

// BUSINESS RULE [CDC-2.1]: Endpoints clients

export async function clientRoutes(app: FastifyInstance) {
  // Placeholder in-memory repo
  const clients = new Map<string, Client>();

  const repo: ClientRepository = {
    async create(data) {
      const id = crypto.randomUUID();
      const client: Client = {
        id,
        tenant_id: data.tenant_id,
        type: data.type ?? 'company',
        company_name: data.company_name ?? null,
        siret: data.siret ?? null,
        first_name: data.first_name ?? null,
        last_name: data.last_name ?? null,
        email: data.email ?? null,
        phone: data.phone ?? null,
        address_line1: data.address_line1 ?? null,
        address_line2: data.address_line2 ?? null,
        zip_code: data.zip_code ?? null,
        city: data.city ?? null,
        country: data.country ?? 'FR',
        notes: data.notes ?? null,
        payment_terms: data.payment_terms ?? 30,
        created_at: new Date(),
        updated_at: new Date(),
        deleted_at: null,
      };
      clients.set(id, client);
      return client;
    },
    async findById(id, tenantId) {
      const c = clients.get(id);
      if (!c || c.tenant_id !== tenantId || c.deleted_at) return null;
      return c;
    },
    async update(id, tenantId, data) {
      const c = clients.get(id);
      if (!c || c.tenant_id !== tenantId || c.deleted_at) return null;
      const updated = { ...c, ...data, updated_at: new Date() } as Client;
      clients.set(id, updated);
      return updated;
    },
    async softDelete(id, tenantId) {
      const c = clients.get(id);
      if (!c || c.tenant_id !== tenantId) return false;
      c.deleted_at = new Date();
      return true;
    },
    async list(tenantId, query) {
      let items = [...clients.values()].filter(
        (c) => c.tenant_id === tenantId && !c.deleted_at,
      );
      if (query.search) {
        const term = query.search.toLowerCase();
        items = items.filter((c) => {
          const displayName = getClientDisplayName(c).toLowerCase();
          return displayName.includes(term);
        });
      }
      if (query.type) {
        items = items.filter((c) => c.type === query.type);
      }
      const total = items.length;
      items = items.slice(0, query.limit);
      return { items, total };
    },
  };

  const clientService = createClientService(repo);
  const preHandlers = [authenticate, injectTenant];

  // POST /api/clients
  app.post(
    '/api/clients',
    { preHandler: [...preHandlers, requirePermission('client', 'create')] },
    async (request, reply) => {
      const parsed = createClientSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: { code: 'VALIDATION_ERROR', message: 'Invalid client data', details: { issues: parsed.error.issues } },
        });
      }
      const result = await clientService.createClient(request.auth.tenant_id, parsed.data);
      if (!result.ok) return reply.status(400).send({ error: result.error });
      return reply.status(201).send(result.value);
    },
  );

  // GET /api/clients
  app.get(
    '/api/clients',
    { preHandler: [...preHandlers, requirePermission('client', 'read')] },
    async (request, reply) => {
      const parsed = clientListQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.status(400).send({
          error: { code: 'VALIDATION_ERROR', message: 'Invalid query', details: { issues: parsed.error.issues } },
        });
      }
      const result = await clientService.listClients(request.auth.tenant_id, parsed.data);
      if (!result.ok) return reply.status(500).send({ error: result.error });
      return result.value;
    },
  );

  // GET /api/clients/:id
  app.get(
    '/api/clients/:id',
    { preHandler: [...preHandlers, requirePermission('client', 'read')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const result = await clientService.getClient(id, request.auth.tenant_id);
      if (!result.ok) return reply.status(404).send({ error: result.error });
      return result.value;
    },
  );

  // PATCH /api/clients/:id
  app.patch(
    '/api/clients/:id',
    { preHandler: [...preHandlers, requirePermission('client', 'update')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = updateClientSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: { code: 'VALIDATION_ERROR', message: 'Invalid client data', details: { issues: parsed.error.issues } },
        });
      }
      const result = await clientService.updateClient(id, request.auth.tenant_id, parsed.data);
      if (!result.ok) {
        const status = result.error.code === 'NOT_FOUND' ? 404 : 400;
        return reply.status(status).send({ error: result.error });
      }
      return result.value;
    },
  );

  // DELETE /api/clients/:id
  app.delete(
    '/api/clients/:id',
    { preHandler: [...preHandlers, requirePermission('client', 'delete')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const result = await clientService.deleteClient(id, request.auth.tenant_id);
      if (!result.ok) return reply.status(404).send({ error: result.error });
      return reply.status(204).send();
    },
  );
}
