import type { FastifyInstance } from 'fastify';

// BUSINESS RULE [CDC-6]: Headers securite et CORS strict

export async function registerSecurityPlugin(app: FastifyInstance) {
  // Security headers on every response
  app.addHook('onSend', (_request, reply, _payload, done) => {
    // HSTS — enforce HTTPS
    reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');

    // Prevent MIME type sniffing
    reply.header('X-Content-Type-Options', 'nosniff');

    // Prevent clickjacking
    reply.header('X-Frame-Options', 'DENY');

    // XSS protection (legacy browsers)
    reply.header('X-XSS-Protection', '1; mode=block');

    // Referrer policy
    reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');

    // Permissions policy — disable unnecessary browser features
    reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');

    // Content Security Policy
    reply.header(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: https:",
        "font-src 'self'",
        "connect-src 'self'",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ].join('; '),
    );

    done();
  });

  app.log.info('Security headers plugin registered');
}

/**
 * CSRF token generation and validation
 */
export function generateCsrfToken(): string {
  return crypto.randomUUID();
}

export function validateCsrfToken(token: string, expected: string): boolean {
  if (!token || !expected) return false;
  return token === expected;
}
