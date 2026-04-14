import type { FastifyInstance } from 'fastify';
import { createStripeClient, type StripeEvent } from './stripe/stripe-client.js';
import { createCheckoutService } from './stripe/checkout.service.js';
import { createStripeWebhookHandler } from './stripe/stripe-webhooks.js';
import { createGoCardlessClient } from './gocardless/gocardless-client.js';
import { createMandateService, type MandateRepository, type MandateRecord } from './gocardless/mandate.service.js';
import { authenticate, requirePermission } from '../../plugins/auth.js';
import { injectTenant } from '../../plugins/tenant.js';

// BUSINESS RULE [CDC-3.2]: Routes integration paiements Stripe + GoCardless

export async function paymentIntegrationRoutes(app: FastifyInstance) {
  // Stripe client (placeholder config — real config from env)
  const stripeClient = createStripeClient({
    secret_key: process.env.STRIPE_SECRET_KEY ?? 'sk_test_placeholder',
    webhook_secret: process.env.STRIPE_WEBHOOK_SECRET ?? 'whsec_placeholder',
    connect_client_id: process.env.STRIPE_CONNECT_CLIENT_ID ?? 'ca_placeholder',
  });

  const checkoutService = createCheckoutService(stripeClient, process.env.APP_BASE_URL ?? 'http://localhost:3000');

  const webhookHandler = createStripeWebhookHandler({
    async markInvoicePaid(invoiceId, amountCents, paymentRef) {
      app.log.info({ invoiceId, amountCents, paymentRef }, 'Invoice marked as paid via Stripe');
    },
  });

  // GoCardless client (placeholder config)
  const gcClient = createGoCardlessClient({
    access_token: process.env.GOCARDLESS_ACCESS_TOKEN ?? 'sandbox_placeholder',
    environment: (process.env.GOCARDLESS_ENV as 'sandbox' | 'live') ?? 'sandbox',
    webhook_secret: process.env.GOCARDLESS_WEBHOOK_SECRET ?? 'whsec_placeholder',
  });

  // Placeholder mandate repo
  const mandateStore = new Map<string, MandateRecord>();
  const mandateRepo: MandateRepository = {
    async create(data) {
      const record: MandateRecord = {
        ...data,
        id: crypto.randomUUID(),
        created_at: new Date(),
      };
      mandateStore.set(`${data.tenant_id}-${data.client_id}`, record);
      return record;
    },
    async findByClientId(tenantId, clientId) {
      return mandateStore.get(`${tenantId}-${clientId}`) ?? null;
    },
    async updateStatus(id, status) {
      for (const [key, m] of mandateStore) {
        if (m.id === id) {
          mandateStore.set(key, { ...m, status });
          break;
        }
      }
    },
  };

  const mandateService = createMandateService(gcClient, mandateRepo, process.env.APP_BASE_URL ?? 'http://localhost:3000');
  const preHandlers = [authenticate, injectTenant];

  // --- Stripe Routes ---

  // POST /api/payment/stripe/connect — Initiate Stripe Connect onboarding
  app.post(
    '/api/payment/stripe/connect',
    { preHandler: [...preHandlers, requirePermission('payment', 'create')] },
    async (request, reply) => {
      try {
        const link = await stripeClient.createConnectAccountLink(
          request.auth.tenant_id,
          `${process.env.APP_BASE_URL}/settings/payments?stripe=success`,
          `${process.env.APP_BASE_URL}/settings/payments?stripe=refresh`,
        );
        return { url: link.url };
      } catch (error) {
        return reply.status(500).send({
          error: { code: 'STRIPE_ERROR', message: 'Failed to create connect link' },
        });
      }
    },
  );

  // POST /api/payment/stripe/checkout — Create checkout session
  app.post(
    '/api/payment/stripe/checkout',
    { preHandler: [...preHandlers, requirePermission('payment', 'create')] },
    async (request, reply) => {
      const body = request.body as {
        invoice_id: string;
        invoice_number: string;
        amount_cents: number;
        currency?: string;
      };
      const result = await checkoutService.createPaymentLink({
        invoice_id: body.invoice_id,
        invoice_number: body.invoice_number,
        amount_cents: body.amount_cents,
        currency: body.currency,
      });
      if (!result.ok) return reply.status(400).send({ error: result.error });
      return result.value;
    },
  );

  // POST /api/payment/stripe/webhook — Stripe webhook endpoint
  app.post(
    '/api/payment/stripe/webhook',
    async (request, reply) => {
      const signature = request.headers['stripe-signature'] as string;
      const payload = JSON.stringify(request.body);

      if (!stripeClient.verifyWebhookSignature(payload, signature ?? '')) {
        return reply.status(400).send({ error: { code: 'INVALID_SIGNATURE', message: 'Invalid webhook signature' } });
      }

      const event = request.body as StripeEvent;
      const result = await webhookHandler.handleEvent(event);
      return result;
    },
  );

  // --- GoCardless Routes ---

  // POST /api/payment/gocardless/mandate — Initiate mandate
  app.post(
    '/api/payment/gocardless/mandate',
    { preHandler: [...preHandlers, requirePermission('payment', 'create')] },
    async (request, reply) => {
      const { client_id } = request.body as { client_id: string };
      const result = await mandateService.initiateMandate(request.auth.tenant_id, client_id);
      if (!result.ok) return reply.status(400).send({ error: result.error });
      return result.value;
    },
  );

  // POST /api/payment/gocardless/mandate/complete — Complete mandate after redirect
  app.post(
    '/api/payment/gocardless/mandate/complete',
    { preHandler: [...preHandlers, requirePermission('payment', 'create')] },
    async (request, reply) => {
      const { client_id, flow_id, session_token } = request.body as {
        client_id: string;
        flow_id: string;
        session_token: string;
      };
      const result = await mandateService.completeMandate(request.auth.tenant_id, client_id, flow_id, session_token);
      if (!result.ok) return reply.status(400).send({ error: result.error });
      return reply.status(201).send(result.value);
    },
  );

  // POST /api/payment/gocardless/charge — Charge a mandate
  app.post(
    '/api/payment/gocardless/charge',
    { preHandler: [...preHandlers, requirePermission('payment', 'create')] },
    async (request, reply) => {
      const { client_id, invoice_id, invoice_number, amount_cents } = request.body as {
        client_id: string;
        invoice_id: string;
        invoice_number: string;
        amount_cents: number;
      };
      const result = await mandateService.chargeMandate(
        request.auth.tenant_id,
        client_id,
        invoice_id,
        invoice_number,
        amount_cents,
      );
      if (!result.ok) return reply.status(400).send({ error: result.error });
      return result.value;
    },
  );
}
