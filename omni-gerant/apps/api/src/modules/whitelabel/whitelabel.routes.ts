import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import { authenticate, requirePermission } from '../../plugins/auth.js';
import { injectTenant } from '../../plugins/tenant.js';

// Vague Z : white-label
// Z1 : multi-domaine — TenantDomain, verification DNS TXT, CNAME Vercel
// Z2 : branding — TenantBranding (logo, couleurs, fontes), applique PDF/email
// Z3 : revendeur — Reseller + ResellerTenantLink, commission sur sous-tenants

const domainSchema = z.object({
  domain: z.string().regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/, 'Domaine invalide'),
  is_primary: z.boolean().default(false),
});

const brandingSchema = z.object({
  logo_url: z.string().url().optional().nullable(),
  logo_dark_url: z.string().url().optional().nullable(),
  primary_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional().nullable(),
  secondary_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional().nullable(),
  accent_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional().nullable(),
  font_family: z.enum(['Inter', 'Roboto', 'Poppins', 'serif', 'system']).optional().nullable(),
  email_sender_name: z.string().max(100).optional().nullable(),
  email_footer: z.string().max(5000).optional().nullable(),
  pdf_footer: z.string().max(2000).optional().nullable(),
  favicon_url: z.string().url().optional().nullable(),
  custom_css: z.string().max(50_000).optional().nullable(),
});

const resellerSchema = z.object({
  user_id: z.string().uuid(),
  commission_bp: z.number().int().min(0).max(10_000).default(2000),
  max_sub_tenants: z.number().int().min(1).optional().nullable(),
});

const linkSubTenantSchema = z.object({
  sub_tenant_id: z.string().uuid(),
  monthly_fee_cents: z.number().int().min(0).optional().nullable(),
});

export async function whitelabelRoutes(app: FastifyInstance) {
  const preHandlers = [authenticate, injectTenant];

  // ==== Z1 : Multi-domaine ====

  app.get('/api/whitelabel/domains', { preHandler: preHandlers }, async (request) => {
    if (!process.env['DATABASE_URL']) return { items: [] };
    const { prisma } = await import('@zenadmin/db');
    const items = await (prisma as unknown as { tenantDomain?: { findMany?: Function } })
      .tenantDomain?.findMany?.({
        where: { tenant_id: request.auth.tenant_id, deleted_at: null },
        orderBy: { created_at: 'desc' },
      }) ?? [];
    return { items };
  });

  app.post('/api/whitelabel/domains', { preHandler: [...preHandlers, requirePermission('tenant', 'update')] }, async (request, reply) => {
    const parsed = domainSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: 'Données invalides.', details: { issues: parsed.error.issues } } });
    }
    const token = `zen-verify=${randomBytes(16).toString('hex')}`;
    const { prisma } = await import('@zenadmin/db');
    try {
      const created = await (prisma as unknown as { tenantDomain?: { create?: Function } })
        .tenantDomain?.create?.({
          data: {
            tenant_id: request.auth.tenant_id,
            domain: parsed.data.domain.toLowerCase(),
            is_primary: parsed.data.is_primary,
            verification_token: token,
          },
        });
      return reply.status(201).send({
        ...(created as Record<string, unknown>),
        dns_instructions: {
          cname: { host: parsed.data.domain, target: 'cname.vercel-dns.com' },
          txt: { host: `_zen-verify.${parsed.data.domain}`, value: token },
        },
      });
    } catch (err) {
      const error = err as { code?: string };
      if (error.code === 'P2002') {
        return reply.status(409).send({ error: { code: 'DOMAIN_EXISTS', message: 'Domaine deja enregistre.' } });
      }
      throw err;
    }
  });

  app.post('/api/whitelabel/domains/:id/verify', { preHandler: preHandlers }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { prisma } = await import('@zenadmin/db');
    const domain = await (prisma as unknown as { tenantDomain?: { findFirst?: Function } })
      .tenantDomain?.findFirst?.({
        where: { id, tenant_id: request.auth.tenant_id, deleted_at: null },
      }) as { id: string; domain: string; verification_token: string; status: string } | null;
    if (!domain) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Domaine introuvable.' } });

    // Verification DNS TXT
    let verified = false;
    try {
      const dns = await import('node:dns/promises');
      const txtRecords = await dns.resolveTxt(`_zen-verify.${domain.domain}`);
      const flatValues = txtRecords.flat();
      verified = flatValues.some((v) => v.includes(domain.verification_token));
    } catch {
      verified = false;
    }

    const updated = await (prisma as unknown as { tenantDomain?: { update?: Function } })
      .tenantDomain?.update?.({
        where: { id },
        data: {
          status: verified ? 'verified' : 'pending',
          verified_at: verified ? new Date() : null,
        },
      });
    return { verified, domain: updated };
  });

  app.delete('/api/whitelabel/domains/:id', { preHandler: [...preHandlers, requirePermission('tenant', 'update')] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { prisma } = await import('@zenadmin/db');
    await (prisma as unknown as { tenantDomain?: { update?: Function } })
      .tenantDomain?.update?.({ where: { id }, data: { deleted_at: new Date() } });
    return reply.status(204).send();
  });

  // ==== Z2 : Branding ====

  app.get('/api/whitelabel/branding', { preHandler: preHandlers }, async (request) => {
    if (!process.env['DATABASE_URL']) return null;
    const { prisma } = await import('@zenadmin/db');
    const branding = await (prisma as unknown as { tenantBranding?: { findFirst?: Function } })
      .tenantBranding?.findFirst?.({
        where: { tenant_id: request.auth.tenant_id },
      });
    return branding;
  });

  app.put('/api/whitelabel/branding', { preHandler: [...preHandlers, requirePermission('tenant', 'update')] }, async (request, reply) => {
    const parsed = brandingSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: 'Données invalides.', details: { issues: parsed.error.issues } } });
    }
    const { prisma } = await import('@zenadmin/db');
    const existing = await (prisma as unknown as { tenantBranding?: { findFirst?: Function } })
      .tenantBranding?.findFirst?.({ where: { tenant_id: request.auth.tenant_id } }) as { id: string } | null;
    let branding;
    if (existing) {
      branding = await (prisma as unknown as { tenantBranding?: { update?: Function } })
        .tenantBranding?.update?.({
          where: { id: existing.id },
          data: parsed.data,
        });
    } else {
      branding = await (prisma as unknown as { tenantBranding?: { create?: Function } })
        .tenantBranding?.create?.({
          data: { tenant_id: request.auth.tenant_id, ...parsed.data },
        });
    }
    return branding;
  });

  // Public : fetch branding by domain (pour portail client)
  app.get('/api/public/branding/by-domain/:domain', async (request, reply) => {
    const { domain } = request.params as { domain: string };
    const { prisma } = await import('@zenadmin/db');
    const tenantDomain = await (prisma as unknown as { tenantDomain?: { findFirst?: Function } })
      .tenantDomain?.findFirst?.({
        where: { domain: domain.toLowerCase(), status: 'verified', deleted_at: null },
      }) as { tenant_id: string } | null;
    if (!tenantDomain) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Domaine inconnu.' } });
    const branding = await (prisma as unknown as { tenantBranding?: { findFirst?: Function } })
      .tenantBranding?.findFirst?.({ where: { tenant_id: tenantDomain.tenant_id } });
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantDomain.tenant_id },
      select: { id: true, name: true },
    });
    return { tenant, branding };
  });

  // ==== Z3 : Revendeur ====

  app.get('/api/whitelabel/resellers', { preHandler: preHandlers }, async (request) => {
    if (!process.env['DATABASE_URL']) return { items: [] };
    const { prisma } = await import('@zenadmin/db');
    const items = await (prisma as unknown as { reseller?: { findMany?: Function } })
      .reseller?.findMany?.({
        where: { tenant_id: request.auth.tenant_id, deleted_at: null },
        orderBy: { created_at: 'desc' },
      }) ?? [];
    return { items };
  });

  app.post('/api/whitelabel/resellers', { preHandler: [...preHandlers, requirePermission('tenant', 'update')] }, async (request, reply) => {
    const parsed = resellerSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: 'Données invalides.', details: { issues: parsed.error.issues } } });
    }
    const { prisma } = await import('@zenadmin/db');
    try {
      const created = await (prisma as unknown as { reseller?: { create?: Function } })
        .reseller?.create?.({
          data: {
            tenant_id: request.auth.tenant_id,
            ...parsed.data,
          },
        });
      return reply.status(201).send(created);
    } catch (err) {
      const error = err as { code?: string };
      if (error.code === 'P2002') {
        return reply.status(409).send({ error: { code: 'ALREADY_RESELLER', message: 'Utilisateur deja revendeur.' } });
      }
      throw err;
    }
  });

  app.post('/api/whitelabel/resellers/:id/sub-tenants', { preHandler: [...preHandlers, requirePermission('tenant', 'update')] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = linkSubTenantSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: 'Données invalides.' } });
    }
    const { prisma } = await import('@zenadmin/db');
    const reseller = await (prisma as unknown as { reseller?: { findFirst?: Function } })
      .reseller?.findFirst?.({ where: { id, tenant_id: request.auth.tenant_id, deleted_at: null } }) as
      { id: string; max_sub_tenants: number | null } | null;
    if (!reseller) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Revendeur introuvable.' } });

    if (reseller.max_sub_tenants) {
      const count = await (prisma as unknown as { resellerTenantLink?: { count?: Function } })
        .resellerTenantLink?.count?.({ where: { reseller_id: id, status: 'active' } }) as number;
      if (count >= reseller.max_sub_tenants) {
        return reply.status(409).send({ error: { code: 'LIMIT_REACHED', message: 'Limite de sous-tenants atteinte.' } });
      }
    }

    try {
      const link = await (prisma as unknown as { resellerTenantLink?: { create?: Function } })
        .resellerTenantLink?.create?.({
          data: {
            reseller_id: id,
            sub_tenant_id: parsed.data.sub_tenant_id,
            monthly_fee_cents: parsed.data.monthly_fee_cents ?? null,
          },
        });
      return reply.status(201).send(link);
    } catch (err) {
      const error = err as { code?: string };
      if (error.code === 'P2002') {
        return reply.status(409).send({ error: { code: 'ALREADY_LINKED', message: 'Sous-tenant deja lie.' } });
      }
      throw err;
    }
  });

  // Stats revendeur : commission estimee sur les sous-tenants
  app.get('/api/whitelabel/resellers/:id/stats', { preHandler: preHandlers }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { prisma } = await import('@zenadmin/db');
    const reseller = await (prisma as unknown as { reseller?: { findFirst?: Function } })
      .reseller?.findFirst?.({ where: { id, tenant_id: request.auth.tenant_id, deleted_at: null } }) as
      { id: string; commission_bp: number } | null;
    if (!reseller) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Revendeur introuvable.' } });

    const links = await (prisma as unknown as { resellerTenantLink?: { findMany?: Function } })
      .resellerTenantLink?.findMany?.({
        where: { reseller_id: id, status: 'active' },
      }) as Array<{ sub_tenant_id: string; monthly_fee_cents: number | null }> ?? [];

    const totalMonthlyCents = links.reduce((acc, l) => acc + (l.monthly_fee_cents ?? 0), 0);
    const commissionCents = Math.round((totalMonthlyCents * reseller.commission_bp) / 10_000);

    return {
      sub_tenants_count: links.length,
      total_monthly_cents: totalMonthlyCents,
      commission_bp: reseller.commission_bp,
      estimated_commission_cents: commissionCents,
    };
  });
}
