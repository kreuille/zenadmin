import type { FastifyInstance } from 'fastify';
import {
  createDashboardService,
  type DashboardDataSource,
  type UpcomingPayment,
  type RecentActivity,
  type MonthlyRevenue,
} from './dashboard.service.js';
import { authenticate, requirePermission } from '../../plugins/auth.js';
import { injectTenant } from '../../plugins/tenant.js';

// BUSINESS RULE [CDC-4]: Routes Dashboard

export async function dashboardRoutes(app: FastifyInstance) {
  // Placeholder data source returning demo data
  const dataSource: DashboardDataSource = {
    async getReceivables() { return 0; },
    async getPayables() { return 0; },
    async getBankBalance() { return 0; },
    async getRevenueCurrentMonth() { return 0; },
    async getRevenuePreviousMonth() { return 0; },
    async getUpcomingPayments() { return []; },
    async getRecentActivity() { return []; },
    async getMonthlyRevenue() { return []; },
  };

  const dashboardService = createDashboardService(dataSource);
  const preHandlers = [authenticate, injectTenant];

  // GET /api/dashboard — Get all dashboard data in one query
  app.get(
    '/api/dashboard',
    { preHandler: [...preHandlers, requirePermission('dashboard', 'read')] },
    async (request, reply) => {
      const result = await dashboardService.getDashboard(request.auth.tenant_id);
      if (!result.ok) return reply.status(500).send({ error: result.error });
      return result.value;
    },
  );
}
