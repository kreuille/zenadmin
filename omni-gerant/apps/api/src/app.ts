import Fastify from 'fastify';
import cors from '@fastify/cors';
import { loadConfig } from './config.js';
import { registerErrorHandler } from './plugins/error-handler.js';
import { registerRateLimiter } from './plugins/rate-limiter.js';
import { healthRoutes } from './routes/health.js';
import { createRequestContext, runWithContext } from './middleware/request-context.js';

export async function buildApp() {
  const config = loadConfig();

  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      transport:
        config.NODE_ENV === 'development'
          ? { target: 'pino-pretty', options: { colorize: true } }
          : undefined,
    },
    requestIdHeader: 'x-correlation-id',
    genReqId: () => crypto.randomUUID(),
  });

  // CORS
  await app.register(cors, {
    origin: config.CORS_ORIGIN.split(','),
    credentials: true,
  });

  // Request context (correlation_id, tenant_id, user_id)
  app.addHook('onRequest', (request, _reply, done) => {
    const context = createRequestContext({
      correlation_id: request.id,
    });
    runWithContext(context, () => done());
  });

  // Error handler
  registerErrorHandler(app);

  // Rate limiter
  await registerRateLimiter(app);

  // Routes
  await app.register(healthRoutes);

  return app;
}
