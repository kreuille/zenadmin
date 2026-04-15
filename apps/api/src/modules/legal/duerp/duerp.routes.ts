import type { FastifyInstance } from 'fastify';
import {
  createDuerpService,
  type DuerpRepository,
  type DuerpDocument,
  type DuerpRisk,
} from './duerp.service.js';
import { createDuerpSchema, updateDuerpSchema } from './duerp.schemas.js';
import { getRisksByNafCode, detectPurchaseRisks } from './risk-database.js';
import { generateDuerpHtml } from './duerp-pdf.js';
import { authenticate, requirePermission } from '../../../plugins/auth.js';
import { injectTenant } from '../../../plugins/tenant.js';

// BUSINESS RULE [CDC-2.4]: Routes DUERP

export async function duerpRoutes(app: FastifyInstance) {
  // Placeholder in-memory repo
  const documents = new Map<string, DuerpDocument>();

  const repo: DuerpRepository = {
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
        .filter((d) => d.tenant_id === tenantId && !d.deleted_at)
        .sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
    },
  };

  const duerpService = createDuerpService(repo);
  const preHandlers = [authenticate, injectTenant];

  // POST /api/legal/duerp — Generate new DUERP
  app.post(
    '/api/legal/duerp',
    { preHandler: [...preHandlers, requirePermission('legal', 'create')] },
    async (request, reply) => {
      const parsed = createDuerpSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: { code: 'VALIDATION_ERROR', message: 'Invalid DUERP data', details: { issues: parsed.error.issues } },
        });
      }
      const result = await duerpService.generate(request.auth.tenant_id, parsed.data);
      if (!result.ok) return reply.status(400).send({ error: result.error });
      return reply.status(201).send(result.value);
    },
  );

  // GET /api/legal/duerp — Get latest DUERP
  app.get(
    '/api/legal/duerp',
    { preHandler: [...preHandlers, requirePermission('legal', 'read')] },
    async (request, reply) => {
      const result = await duerpService.getLatest(request.auth.tenant_id);
      if (!result.ok) return reply.status(500).send({ error: result.error });
      if (!result.value) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'No DUERP found' } });
      return result.value;
    },
  );

  // GET /api/legal/duerp/:id
  app.get(
    '/api/legal/duerp/:id',
    { preHandler: [...preHandlers, requirePermission('legal', 'read')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const result = await duerpService.getById(id, request.auth.tenant_id);
      if (!result.ok) return reply.status(404).send({ error: result.error });
      return result.value;
    },
  );

  // PUT /api/legal/duerp/:id
  app.put(
    '/api/legal/duerp/:id',
    { preHandler: [...preHandlers, requirePermission('legal', 'update')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = updateDuerpSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: { code: 'VALIDATION_ERROR', message: 'Invalid DUERP data', details: { issues: parsed.error.issues } },
        });
      }
      const result = await duerpService.update(id, request.auth.tenant_id, parsed.data);
      if (!result.ok) return reply.status(404).send({ error: result.error });
      return result.value;
    },
  );

  // DELETE /api/legal/duerp/:id
  app.delete(
    '/api/legal/duerp/:id',
    { preHandler: [...preHandlers, requirePermission('legal', 'delete')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const result = await duerpService.delete(id, request.auth.tenant_id);
      if (!result.ok) return reply.status(404).send({ error: result.error });
      return reply.status(204).send();
    },
  );

  // GET /api/legal/duerp/:id/pdf — Generate PDF HTML
  app.get(
    '/api/legal/duerp/:id/pdf',
    { preHandler: [...preHandlers, requirePermission('legal', 'read')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const result = await duerpService.getById(id, request.auth.tenant_id);
      if (!result.ok) return reply.status(404).send({ error: result.error });

      const html = generateDuerpHtml(result.value);
      return reply.type('text/html').send(html);
    },
  );

  // GET /api/legal/duerp/risks/:nafCode — Get risk templates for NAF code
  app.get(
    '/api/legal/duerp/risks/:nafCode',
    { preHandler: [...preHandlers, requirePermission('legal', 'read')] },
    async (request, reply) => {
      const { nafCode } = request.params as { nafCode: string };
      const profile = getRisksByNafCode(nafCode);
      return profile;
    },
  );

  // POST /api/legal/duerp/detect-risks — Detect risks from purchase description
  app.post(
    '/api/legal/duerp/detect-risks',
    { preHandler: [...preHandlers, requirePermission('legal', 'read')] },
    async (request, reply) => {
      const { description } = request.body as { description: string };
      if (!description) {
        return reply.status(400).send({
          error: { code: 'VALIDATION_ERROR', message: 'description is required' },
        });
      }
      const detected = detectPurchaseRisks(description);
      return { detected, should_update_duerp: detected.length > 0 };
    },
  );

  // GET /api/legal/duerp/history — List all DUERP versions
  app.get(
    '/api/legal/duerp/history',
    { preHandler: [...preHandlers, requirePermission('legal', 'read')] },
    async (request, reply) => {
      const result = await duerpService.list(request.auth.tenant_id);
      if (!result.ok) return reply.status(500).send({ error: result.error });
      return result.value;
    },
  );
}
