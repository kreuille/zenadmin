import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { calculateForecast } from './forecast.service.js';
import { detectRecurringCharges, type RecurringCharge } from './recurrence-detector.js';
import { createPrismaForecastProvider, getMonthlyPayrollCents } from './forecast.provider.js';
import { authenticate, requirePermission } from '../../../plugins/auth.js';
import { injectTenant } from '../../../plugins/tenant.js';

// BUSINESS RULE [CDC-2.3]: Routes previsionnel de tresorerie

const forecastQuerySchema = z.object({
  days: z.coerce.number().int().min(7).max(365).default(90),
});

export async function forecastRoutes(app: FastifyInstance) {
  const preHandlers = [authenticate, injectTenant];

  // GET /api/bank/forecast
  app.get(
    '/api/bank/forecast',
    { preHandler: [...preHandlers, requirePermission('bank', 'read')] },
    async (request, reply) => {
      const parsed = forecastQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.status(400).send({
          error: { code: 'VALIDATION_ERROR', message: 'Invalid query', details: { issues: parsed.error.issues } },
        });
      }

      // B2 : donnees reelles depuis Prisma
      const provider = createPrismaForecastProvider();
      const tenantId = request.auth.tenant_id;
      const [balance, invoices, purchases, history, payrollMonthlyCents] = await Promise.all([
        provider.getCurrentBalance(tenantId),
        provider.getDueInvoices(tenantId),
        provider.getDuePurchases(tenantId),
        provider.getTransactionHistory(tenantId, 6),
        getMonthlyPayrollCents(tenantId),
      ]);

      const detectedRecurring = detectRecurringCharges(history);

      // Ajout salaires HR comme charge recurrente mensuelle si masse salariale > 0
      const allRecurring: RecurringCharge[] = [...detectedRecurring];
      if (payrollMonthlyCents > 0) {
        const projections: Date[] = [];
        const today = new Date();
        for (let i = 0; i < 4; i++) {
          const d = new Date(today.getFullYear(), today.getMonth() + i, 28);
          if (d >= today) projections.push(d);
        }
        allRecurring.push({
          label: 'Salaires (masse salariale + charges patronales)',
          amount_cents: -payrollMonthlyCents,
          frequency: 'monthly',
          category: 'salaires',
          confidence: 1.0,
          last_occurrence: new Date(today.getFullYear(), today.getMonth() - 1, 28),
          next_occurrences: projections,
        });
      }

      const forecast = calculateForecast(
        balance,
        invoices,
        purchases,
        allRecurring,
        parsed.data.days,
      );

      return forecast;
    },
  );

  // GET /api/bank/forecast/recurring
  app.get(
    '/api/bank/forecast/recurring',
    { preHandler: [...preHandlers, requirePermission('bank', 'read')] },
    async (request) => {
      const provider = createPrismaForecastProvider();
      const history = await provider.getTransactionHistory(request.auth.tenant_id, 6);
      const charges = detectRecurringCharges(history);
      return { charges };
    },
  );
}
