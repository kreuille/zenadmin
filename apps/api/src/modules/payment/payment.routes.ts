import type { FastifyInstance } from 'fastify';
import { createPaymentService, type PaymentRepository } from './payment.service.js';
import { createPaymentSchema } from './payment.schemas.js';
import { createInvoiceService, type InvoiceRepository } from '../invoice/invoice.service.js';
import { authenticate, requirePermission } from '../../plugins/auth.js';
import { injectTenant } from '../../plugins/tenant.js';

// BUSINESS RULE [CDC-2.1]: Endpoints paiements sur factures

export async function paymentRoutes(app: FastifyInstance) {
  // Placeholder repo
  const paymentRepo: PaymentRepository = {
    async create(data) {
      return {
        id: crypto.randomUUID(),
        ...data,
        reference: data.reference ?? null,
        notes: data.notes ?? null,
        created_at: new Date(),
      };
    },
    async findByInvoice(_invoiceId, _tenantId) { return []; },
  };

  const paymentService = createPaymentService(paymentRepo);
  const preHandlers = [authenticate, injectTenant];

  // POST /api/invoices/:invoiceId/payments
  app.post(
    '/api/invoices/:invoiceId/payments',
    { preHandler: [...preHandlers, requirePermission('invoice', 'update')] },
    async (request, reply) => {
      const { invoiceId } = request.params as { invoiceId: string };
      const parsed = createPaymentSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: { code: 'VALIDATION_ERROR', message: 'Invalid payment data', details: { issues: parsed.error.issues } },
        });
      }

      const result = await paymentService.create(request.auth.tenant_id, invoiceId, parsed.data);
      if (!result.ok) return reply.status(400).send({ error: result.error });
      return reply.status(201).send(result.value);
    },
  );

  // GET /api/invoices/:invoiceId/payments
  app.get(
    '/api/invoices/:invoiceId/payments',
    { preHandler: [...preHandlers, requirePermission('invoice', 'read')] },
    async (request, reply) => {
      const { invoiceId } = request.params as { invoiceId: string };
      const result = await paymentService.listByInvoice(invoiceId, request.auth.tenant_id);
      if (!result.ok) return reply.status(500).send({ error: result.error });
      return result.value;
    },
  );
}
