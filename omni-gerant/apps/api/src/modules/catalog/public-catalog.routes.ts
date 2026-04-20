import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate, requirePermission } from '../../plugins/auth.js';
import { injectTenant } from '../../plugins/tenant.js';

// Vague L2 : catalogue public / mini e-commerce.

const configSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]{3,40}$/),
  title: z.string().min(1).max(200),
  description: z.string().max(1000).optional().nullable(),
  primary_color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#2563eb'),
  is_active: z.boolean().default(false),
  published_product_ids: z.array(z.string().uuid()).default([]),
});

const orderItemSchema = z.object({
  product_id: z.string().uuid(),
  variant_id: z.string().uuid().optional(),
  qty: z.number().int().min(1).max(999),
});

const orderSchema = z.object({
  customer_name: z.string().min(1).max(200),
  customer_email: z.string().email(),
  customer_phone: z.string().max(30).optional(),
  customer_address: z.string().max(500).optional(),
  items: z.array(orderItemSchema).min(1).max(20),
});

export async function publicCatalogRoutes(app: FastifyInstance) {
  const preHandlers = [authenticate, injectTenant];

  // Cote tenant : config
  app.get('/api/catalog/config', { preHandler: preHandlers }, async (request) => {
    if (!process.env['DATABASE_URL']) return null;
    const { prisma } = await import('@zenadmin/db');
    return await (prisma as unknown as { publicCatalogConfig?: { findUnique?: Function } })
      .publicCatalogConfig?.findUnique?.({ where: { tenant_id: request.auth.tenant_id } });
  });

  app.put('/api/catalog/config', { preHandler: [...preHandlers, requirePermission('settings', 'update')] }, async (request, reply) => {
    const parsed = configSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: 'Données invalides.', details: { issues: parsed.error.issues } } });
    }
    const { prisma } = await import('@zenadmin/db');
    const result = await (prisma as unknown as { publicCatalogConfig?: { upsert?: Function } })
      .publicCatalogConfig?.upsert?.({
        where: { tenant_id: request.auth.tenant_id },
        update: parsed.data as Record<string, unknown>,
        create: { tenant_id: request.auth.tenant_id, ...parsed.data } as Record<string, unknown>,
      });
    return result;
  });

  // Cote tenant : liste des commandes
  app.get('/api/catalog/orders', { preHandler: preHandlers }, async (request) => {
    if (!process.env['DATABASE_URL']) return { items: [] };
    const { prisma } = await import('@zenadmin/db');
    const items = await (prisma as unknown as { publicOrder?: { findMany?: Function } })
      .publicOrder?.findMany?.({
        where: { tenant_id: request.auth.tenant_id },
        orderBy: { created_at: 'desc' },
        take: 100,
      }) ?? [];
    return { items };
  });

  // --- Public (slug + panier) ---

  app.get('/api/public/catalog/:slug', async (request, reply) => {
    if (!process.env['DATABASE_URL']) return reply.status(503).send({ error: { code: 'SERVICE_UNAVAILABLE', message: 'DB indisponible' } });
    const { slug } = request.params as { slug: string };
    const { prisma } = await import('@zenadmin/db');

    const config = await (prisma as unknown as { publicCatalogConfig?: { findUnique?: Function } })
      .publicCatalogConfig?.findUnique?.({ where: { slug } }) as
      | { tenant_id: string; title: string; description: string | null; primary_color: string; is_active: boolean; published_product_ids: string[] }
      | null;
    if (!config || !config.is_active) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Catalogue indisponible.' } });
    }

    const productWhere: Record<string, unknown> = {
      tenant_id: config.tenant_id,
      deleted_at: null,
      is_active: true,
    };
    if (config.published_product_ids.length > 0) {
      productWhere['id'] = { in: config.published_product_ids };
    }
    const products = await prisma.product.findMany({
      where: productWhere,
      orderBy: { name: 'asc' },
      select: {
        id: true, name: true, description: true, unit_price_cents: true,
        tva_rate: true, unit: true, reference: true, category: true,
      },
    });

    const tenant = await prisma.tenant.findUnique({ where: { id: config.tenant_id }, select: { name: true, siret: true } });

    return {
      config: {
        title: config.title,
        description: config.description,
        primary_color: config.primary_color,
      },
      company: tenant,
      products,
    };
  });

  app.post('/api/public/catalog/:slug/order', async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const parsed = orderSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: 'Données invalides.', details: { issues: parsed.error.issues } } });
    }

    const { prisma } = await import('@zenadmin/db');
    const config = await (prisma as unknown as { publicCatalogConfig?: { findUnique?: Function } })
      .publicCatalogConfig?.findUnique?.({ where: { slug } }) as
      | { tenant_id: string; is_active: boolean; published_product_ids: string[] }
      | null;
    if (!config || !config.is_active) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Catalogue indisponible.' } });
    }

    // Fetch produits pour calcul totaux authoritatif cote serveur
    const productIds = parsed.data.items.map((i) => i.product_id);
    const products = await prisma.product.findMany({
      where: { tenant_id: config.tenant_id, id: { in: productIds }, deleted_at: null, is_active: true },
    });
    const productMap = new Map(products.map((p) => [p.id, p]));

    let totalHt = 0;
    let totalTva = 0;
    const items = parsed.data.items.map((item) => {
      const p = productMap.get(item.product_id);
      if (!p) throw new Error(`Product ${item.product_id} indisponible`);
      const lineHt = p.unit_price_cents * item.qty;
      const lineTva = Math.round(lineHt * p.tva_rate / 10000);
      totalHt += lineHt;
      totalTva += lineTva;
      return {
        product_id: p.id,
        name: p.name,
        unit_price_cents: p.unit_price_cents,
        tva_rate: p.tva_rate,
        qty: item.qty,
        line_total_cents: lineHt,
      };
    });
    const totalTtc = totalHt + totalTva;

    const orderNumber = `CMD-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
    const order = await (prisma as unknown as { publicOrder?: { create?: Function } })
      .publicOrder?.create?.({
        data: {
          tenant_id: config.tenant_id,
          order_number: orderNumber,
          customer_name: parsed.data.customer_name,
          customer_email: parsed.data.customer_email,
          customer_phone: parsed.data.customer_phone ?? null,
          customer_address: parsed.data.customer_address ?? null,
          items: items as unknown as Record<string, unknown>,
          total_ht_cents: totalHt,
          total_tva_cents: totalTva,
          total_ttc_cents: totalTtc,
          status: 'pending',
        },
      });

    // Genere un Stripe Checkout si configure
    const stripeKey = process.env['STRIPE_SECRET_KEY'];
    let checkoutUrl: string | null = null;
    if (stripeKey) {
      try {
        const { createStripeClient } = await import('../payment/stripe/stripe-client.js');
        const { createCheckoutService } = await import('../payment/stripe/checkout.service.js');
        const stripeClient = createStripeClient({
          secret_key: stripeKey,
          webhook_secret: process.env['STRIPE_WEBHOOK_SECRET'] ?? '',
          connect_client_id: process.env['STRIPE_CONNECT_CLIENT_ID'] ?? '',
        });
        const svc = createCheckoutService(stripeClient, process.env['APP_BASE_URL'] ?? 'https://omni-gerant.vercel.app');
        const tenant = await prisma.tenant.findUnique({ where: { id: config.tenant_id }, select: { settings: true } });
        const tenantSettings = (tenant?.settings ?? {}) as Record<string, string | undefined>;
        const r = await svc.createPaymentLink({
          invoice_id: (order as { id: string }).id,
          invoice_number: orderNumber,
          amount_cents: totalTtc,
          currency: 'eur',
          tenant_stripe_account_id: tenantSettings['stripe_account_id'],
        });
        if (r.ok) checkoutUrl = r.value.checkout_url;
      } catch { /* noop */ }
    }

    return reply.status(201).send({
      order_id: (order as { id: string }).id,
      order_number: orderNumber,
      total_ttc_cents: totalTtc,
      checkout_url: checkoutUrl,
    });
  });
}
