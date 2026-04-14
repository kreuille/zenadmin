import type { FastifyInstance } from 'fastify';

// BUSINESS RULE [R67]: Health check endpoints
export async function healthRoutes(app: FastifyInstance) {
  // Liveness probe - is the process running?
  app.get('/health', async () => {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  });

  // Readiness probe - is the service ready to handle requests?
  app.get('/ready', async (_request, reply) => {
    const checks: Record<string, string> = {};
    let healthy = true;

    // Check DB connection (will be enabled when DB is connected)
    // try {
    //   await prisma.$queryRaw`SELECT 1`;
    //   checks.database = 'ok';
    // } catch {
    //   checks.database = 'error';
    //   healthy = false;
    // }

    checks['server'] = 'ok';

    const statusCode = healthy ? 200 : 503;
    return reply.status(statusCode).send({
      status: healthy ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      checks,
    });
  });
}
