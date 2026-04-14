import pino from 'pino';
import { getConfig } from '../config.js';

// BUSINESS RULE [R12]: Logging structure JSON avec correlation_id, tenant_id, user_id
export function createLogger() {
  const config = getConfig();

  return pino({
    level: config.LOG_LEVEL,
    transport:
      config.NODE_ENV === 'development'
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined,
    serializers: {
      req: (req) => ({
        method: req.method,
        url: req.url,
        correlation_id: req.headers?.['x-correlation-id'],
      }),
      res: (res) => ({
        statusCode: res.statusCode,
      }),
    },
  });
}

export type Logger = ReturnType<typeof createLogger>;
