import type { FastifyInstance } from 'fastify';
import {
  createDuerpService,
  type DuerpRepository,
  type DuerpDocument,
} from './duerp.service.js';
import { createDuerpSchema, updateDuerpSchema } from './duerp.schemas.js';
import { getRisksByNafCode, detectPurchaseRisks } from './risk-database.js';
import { generateDuerpHtml } from './duerp-pdf.js';
import { createDuerpAutoFill, type TenantProfile, type PurchaseInfo, type InsuranceInfo } from './duerp-autofill.js';
import { createTriggerService } from './duerp-trigger.service.js';
import { createSiretLookup } from '../../../lib/siret-lookup.js';
import { authenticate, requirePermission } from '../../../plugins/auth.js';
import { injectTenant } from '../../../plugins/tenant.js';

// BUSINESS RULE [CDC-2.4]: Routes DUERP avec auto-fill intelligent

export async function duerpRoutes(app: FastifyInstance) {
  // In-memory repo
  const documents = new Map<string, DuerpDocument>();

  // In-memory tenant profiles (simulated — will come from tenant module)
  const tenantProfiles = new Map<string, TenantProfile>();

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
  const triggerService = createTriggerService();
  const siretLookup = createSiretLookup();

  // Auto-fill orchestrator
  const autoFill = createDuerpAutoFill({
    lookupSiret: (siret) => siretLookup.lookup(siret),
    getTenantProfile: async (tenantId) => tenantProfiles.get(tenantId) ?? null,
    getRecentPurchases: async () => [] as PurchaseInfo[], // TODO: wire to purchases module
    getInsurances: async () => [] as InsuranceInfo[], // TODO: wire to insurance module
    getLatestDuerp: async (tenantId) => repo.findLatest(tenantId),
  });

  const preHandlers = [authenticate, injectTenant];

  // POST /api/legal/duerp/autofill — Generate auto-fill data for DUERP wizard
  // BUSINESS RULE [CDC-2.4]: Zero saisie — pre-remplissage automatique
  app.post(
    '/api/legal/duerp/autofill',
    { preHandler: [...preHandlers, requirePermission('legal', 'create')] },
    async (request, reply) => {
      const body = request.body as { siret?: string; naf_code?: string; company_name?: string; employee_count?: number } | undefined;
      // Normalize SIRET: strip spaces (accepts both "890 246 390 00029" and "89024639000029")
      const normalizedSiret = body?.siret?.replace(/\s/g, '') || undefined;

      // Store/update tenant profile for auto-fill
      const tenantId = request.auth.tenant_id;
      const existingProfile = tenantProfiles.get(tenantId);
      const profile: TenantProfile = {
        id: tenantId,
        name: body?.company_name ?? existingProfile?.name ?? 'Mon Entreprise',
        siret: normalizedSiret ?? existingProfile?.siret ?? null,
        siren: existingProfile?.siren ?? null,
        naf_code: body?.naf_code ?? existingProfile?.naf_code ?? null,
        address: existingProfile?.address ?? null,
        employee_count: body?.employee_count ?? existingProfile?.employee_count ?? 1,
        dirigeant_name: existingProfile?.dirigeant_name ?? null,
      };
      tenantProfiles.set(tenantId, profile);

      const result = await autoFill.generateAutoFill(tenantId);
      if (!result.ok) return reply.status(400).send({ error: result.error });
      return result.value;
    },
  );

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

      // Update tenant profile for future auto-fills
      const tenantId = request.auth.tenant_id;
      tenantProfiles.set(tenantId, {
        id: tenantId,
        name: parsed.data.company_name,
        siret: parsed.data.siret ?? null,
        siren: null,
        naf_code: parsed.data.naf_code ?? null,
        address: parsed.data.address ?? null,
        employee_count: parsed.data.employee_count,
        dirigeant_name: parsed.data.evaluator_name,
      });

      const result = await duerpService.generate(tenantId, parsed.data);
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

  // ═══════════════════════════════════════════════════════════════
  // E8 — Triggers de mise a jour DUERP
  // ═══════════════════════════════════════════════════════════════

  // GET /api/legal/duerp/triggers — Liste des triggers non resolus
  app.get(
    '/api/legal/duerp/triggers',
    { preHandler: [...preHandlers, requirePermission('legal', 'read')] },
    async (request) => {
      return triggerService.getUnresolved(request.auth.tenant_id);
    },
  );

  // GET /api/legal/duerp/triggers/history — Historique complet
  app.get(
    '/api/legal/duerp/triggers/history',
    { preHandler: [...preHandlers, requirePermission('legal', 'read')] },
    async (request) => {
      return triggerService.getHistory(request.auth.tenant_id);
    },
  );

  // POST /api/legal/duerp/triggers/:id/resolve — Marquer comme resolu
  app.post(
    '/api/legal/duerp/triggers/:id/resolve',
    { preHandler: [...preHandlers, requirePermission('legal', 'update')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = request.body as { duerpVersionAfter?: number } | undefined;
      const resolved = triggerService.resolve(
        id,
        request.auth.tenant_id,
        request.auth.user_id,
        body?.duerpVersionAfter,
      );
      if (!resolved) {
        return reply.status(404).send({ error: { code: 'TRIGGER_NOT_FOUND', message: 'Trigger not found' } });
      }
      return resolved;
    },
  );

  // GET /api/legal/duerp/update-status — Statut : a jour / mise a jour requise / urgente
  app.get(
    '/api/legal/duerp/update-status',
    { preHandler: [...preHandlers, requirePermission('legal', 'read')] },
    async (request) => {
      const tenantId = request.auth.tenant_id;
      const latestResult = await duerpService.getLatest(tenantId);
      const lastUpdateDate = latestResult.ok && latestResult.value ? latestResult.value.created_at : null;
      const profile = tenantProfiles.get(tenantId);
      const employeeCount = profile?.employee_count ?? 1;
      return triggerService.getUpdateStatus(tenantId, lastUpdateDate, employeeCount);
    },
  );

  // POST /api/legal/duerp/triggers/accident — Signaler un accident du travail
  app.post(
    '/api/legal/duerp/triggers/accident',
    { preHandler: [...preHandlers, requirePermission('legal', 'create')] },
    async (request, reply) => {
      const body = request.body as { description: string } | undefined;
      if (!body?.description) {
        return reply.status(400).send({
          error: { code: 'VALIDATION_ERROR', message: 'description is required' },
        });
      }
      const trigger = triggerService.reportWorkplaceAccident(request.auth.tenant_id, body.description);
      if (!trigger) {
        return reply.status(409).send({ error: { code: 'DUPLICATE_TRIGGER', message: 'Trigger already exists' } });
      }
      return reply.status(201).send(trigger);
    },
  );

  // POST /api/legal/duerp/triggers/check-purchase — Detecter les risques depuis un achat
  app.post(
    '/api/legal/duerp/triggers/check-purchase',
    { preHandler: [...preHandlers, requirePermission('legal', 'read')] },
    async (request, reply) => {
      const body = request.body as { purchaseId: string; description: string } | undefined;
      if (!body?.purchaseId || !body?.description) {
        return reply.status(400).send({
          error: { code: 'VALIDATION_ERROR', message: 'purchaseId and description are required' },
        });
      }
      const tenantId = request.auth.tenant_id;
      const chemTrigger = triggerService.detectChemicalFromPurchase(tenantId, body.purchaseId, body.description);
      const equipTrigger = triggerService.detectEquipmentFromPurchase(tenantId, body.purchaseId, body.description);
      return {
        chemical: chemTrigger,
        equipment: equipTrigger,
        triggersCreated: (chemTrigger ? 1 : 0) + (equipTrigger ? 1 : 0),
      };
    },
  );
}
