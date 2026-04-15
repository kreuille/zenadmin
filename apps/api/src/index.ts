import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { setupGracefulShutdown } from './lib/shutdown.js';

async function start() {
  const config = loadConfig();
  const app = await buildApp();

  setupGracefulShutdown(app);

  try {
    await app.listen({ port: config.PORT, host: config.HOST });
    app.log.info(`API server running on ${config.HOST}:${config.PORT}`);
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

start();
