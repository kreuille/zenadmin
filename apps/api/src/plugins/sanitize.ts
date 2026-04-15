import type { FastifyInstance } from 'fastify';

// BUSINESS RULE [CDC-6]: Sanitization des inputs — XSS prevention

/**
 * Sanitize a string by escaping HTML special characters
 */
export function sanitizeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

/**
 * Deep sanitize an object — sanitize all string values recursively
 */
export function sanitizeObject<T>(obj: T): T {
  if (typeof obj === 'string') {
    return sanitizeHtml(obj) as T;
  }
  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeObject(item)) as T;
  }
  if (obj !== null && typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      result[key] = sanitizeObject(value);
    }
    return result as T;
  }
  return obj;
}

/**
 * Check if a string contains potential XSS patterns
 */
export function containsXss(input: string): boolean {
  const xssPatterns = [
    /<script[\s>]/i,
    /javascript:/i,
    /on\w+\s*=/i,            // onclick=, onerror=, etc.
    /<iframe/i,
    /<object/i,
    /<embed/i,
    /data:text\/html/i,
    /vbscript:/i,
  ];
  return xssPatterns.some((pattern) => pattern.test(input));
}

/**
 * Check all string values in an object for XSS
 */
export function detectXssInObject(obj: unknown): string[] {
  const violations: string[] = [];

  function walk(value: unknown, path: string) {
    if (typeof value === 'string' && containsXss(value)) {
      violations.push(path);
    } else if (Array.isArray(value)) {
      value.forEach((item, i) => walk(item, `${path}[${i}]`));
    } else if (value !== null && typeof value === 'object') {
      for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
        walk(v, path ? `${path}.${key}` : key);
      }
    }
  }

  walk(obj, '');
  return violations;
}

/**
 * Fastify plugin — sanitize request bodies
 */
export async function registerSanitizePlugin(app: FastifyInstance) {
  app.addHook('preHandler', (request, reply, done) => {
    if (request.body && typeof request.body === 'object') {
      const violations = detectXssInObject(request.body);
      if (violations.length > 0) {
        reply.status(400).send({
          error: {
            code: 'XSS_DETECTED',
            message: 'Potential XSS content detected in input',
            details: { fields: violations },
          },
        });
        return;
      }
    }
    done();
  });

  app.log.info('Sanitize plugin registered');
}
