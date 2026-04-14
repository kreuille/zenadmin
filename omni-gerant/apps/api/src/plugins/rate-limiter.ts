import type { FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { getConfig } from '../config.js';

// BUSINESS RULE [R20]: Rate limiting par tenant - 100 req/min (configurable)
// BUSINESS RULE [CDC-6]: Rate limiting avance par type d'endpoint

/**
 * Advanced rate limit presets per endpoint category
 */
export const RATE_LIMIT_PRESETS = {
  /** Auth endpoints: 5 attempts / 15 min */
  auth: { max: 5, timeWindow: 15 * 60 * 1000 },
  /** General API: 100 req/min/tenant */
  api: { max: 100, timeWindow: 60 * 1000 },
  /** Upload endpoints: 10 req/min/user */
  upload: { max: 10, timeWindow: 60 * 1000 },
  /** Webhook endpoints: 200 req/min (incoming from payment providers) */
  webhook: { max: 200, timeWindow: 60 * 1000 },
} as const;

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

/**
 * Create route-specific rate limit config
 * Usage: app.post('/api/auth/login', { config: { rateLimit: authRateLimit() } }, handler)
 */
export function authRateLimit() {
  return {
    max: RATE_LIMIT_PRESETS.auth.max,
    timeWindow: RATE_LIMIT_PRESETS.auth.timeWindow,
    keyGenerator: (request: { ip: string }) => request.ip,
  };
}

export function uploadRateLimit() {
  return {
    max: RATE_LIMIT_PRESETS.upload.max,
    timeWindow: RATE_LIMIT_PRESETS.upload.timeWindow,
    keyGenerator: (request: { ip: string; auth?: { user_id?: string } }) =>
      request.auth?.user_id ?? request.ip,
  };
}
