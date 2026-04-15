import { PrismaClient } from '@prisma/client';
import { softDeleteMiddleware } from './middleware/soft-delete.js';

function createPrismaClient(): PrismaClient {
  const client = new PrismaClient({
    log: process.env['NODE_ENV'] === 'development' ? ['query', 'warn', 'error'] : ['warn', 'error'],
  });

  // BUSINESS RULE [R04]: Soft delete uniquement (deleted_at)
  client.$use(softDeleteMiddleware);

  return client;
}

// Singleton pattern for Prisma client
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };
export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env['NODE_ENV'] !== 'production') {
  globalForPrisma.prisma = prisma;
}

export { PrismaClient };
