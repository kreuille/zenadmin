import type { FastifyInstance } from 'fastify';
import { authenticate, requirePermission } from '../../plugins/auth.js';
import { injectTenant } from '../../plugins/tenant.js';
import { createDefaultSmsProvider, normalizePhoneFr } from '../../lib/sms.js';

// Vague F2 : API SMS ponctuelle (envoi manuel ex : "facture prête", "rdv confirmé").

export async function smsRoutes(app: FastifyInstance) {
  const preHandlers = [authenticate, injectTenant];
  const provider = createDefaultSmsProvider();

  // POST /api/sms/send
  app.post(
    '/api/sms/send',
    { preHandler: [...preHandlers, requirePermission('client', 'update')] },
    async (request, reply) => {
      const body = (request.body ?? {}) as { to?: string; text?: string; sender?: string };
      if (!body.to || !body.text) {
        return reply.status(400).send({
          error: { code: 'VALIDATION_ERROR', message: 'Champs requis : to, text.' },
        });
      }
      const normalized = normalizePhoneFr(body.to) ?? body.to;
      const r = await provider.send({
        to: normalized,
        text: body.text.slice(0, 459), // 3 SMS max (160 x 3 = 480)
        sender: body.sender?.slice(0, 11),
      });
      if (!r.ok) return reply.status(502).send({ error: r.error });
      return r.value;
    },
  );
}
