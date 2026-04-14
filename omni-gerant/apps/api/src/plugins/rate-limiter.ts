import type { FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { getConfig } from '../config.js';

// BUSINESS RULE [R20]: Rate limiting par tenant - 100 req/min (configurable)
export async function registerRateLimiter(app: FastifyInstance) {
  const config = getConfig();

  await app.register(rateLimit, {
    max: config.RATE_LIMIT_MAX,
    timeWindow: config.RATE_LIMIT_WINDOW_MS,
    keyGenerator: (request) => {
      // Rate limit by tenant_id if available, otherwise by IP
      const tenantId = (request as { tenant_id?: string }).tenant_id;
      return tenantId ?? request.ip;
    },
    errorResponseBuilder: (_request, context) => ({
      error: {
        code: 'RATE_LIMITED',
        message: `Rate limit exceeded. Try again in ${Math.ceil((context.ttl ?? 0) / 1000)} seconds`,
        details: {
          limit: context.max,
          remaining: 0,
          reset_at: new Date(Date.now() + (context.ttl ?? 0)).toISOString(),
        },
      },
    }),
  });
}
