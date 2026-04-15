import type { FastifyInstance } from 'fastify';

// BUSINESS RULE [R68]: Graceful shutdown - drain connexions, ferme DB, timeout 10s
export function setupGracefulShutdown(app: FastifyInstance) {
  const SHUTDOWN_TIMEOUT_MS = 10_000;
  let isShuttingDown = false;

  async function shutdown(signal: string) {
    if (isShuttingDown) return;
    isShuttingDown = true;

    app.log.info(`Received ${signal}, starting graceful shutdown...`);

    const timer = setTimeout(() => {
      app.log.error('Graceful shutdown timed out, forcing exit');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);

    try {
      await app.close();
      app.log.info('Server closed successfully');
      clearTimeout(timer);
      process.exit(0);
    } catch (error) {
      app.log.error(error, 'Error during shutdown');
      clearTimeout(timer);
      process.exit(1);
    }
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}
