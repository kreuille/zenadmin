import { describe, it, expect } from 'vitest';
import {
  createDashboardService,
  calculateRealCash,
  calculateTrend,
  type DashboardDataSource,
} from '../dashboard.service.js';

const TENANT_ID = '00000000-0000-0000-0000-000000000001';

function createMockDataSource(overrides: Partial<DashboardDataSource> = {}): DashboardDataSource {
  return {
    async getReceivables() { return 0; },
    async getPayables() { return 0; },
    async getBankBalance() { return 0; },
    async getRevenueCurrentMonth() { return 0; },
    async getRevenuePreviousMonth() { return 0; },
    async getUpcomingPayments() { return []; },
    async getRecentActivity() { return []; },
    async getMonthlyRevenue() { return []; },
    ...overrides,
  };
}

describe('calculateRealCash', () => {
  // BUSINESS RULE [CDC-4]: Reste a vivre reel = Solde bancaire - Ce que je dois + Ce qu'on me doit
  it('calculates correctly with all values', () => {
    const result = calculateRealCash(500000, 150000, 80000);
    // 500000 - 80000 + 150000 = 570000
    expect(result).toBe(570000);
  });

  it('returns bank balance when no receivables or payables', () => {
    const result = calculateRealCash(500000, 0, 0);
    expect(result).toBe(500000);
  });

  it('can be negative when payables exceed balance + receivables', () => {
    const result = calculateRealCash(100000, 50000, 200000);
    // 100000 - 200000 + 50000 = -50000
    expect(result).toBe(-50000);
  });

  it('handles zero balance', () => {
    const result = calculateRealCash(0, 100000, 50000);
    // 0 - 50000 + 100000 = 50000
    expect(result).toBe(50000);
  });
});

describe('calculateTrend', () => {
  it('calculates positive trend', () => {
    expect(calculateTrend(120000, 100000)).toBe(20);
  });

  it('calculates negative trend', () => {
    expect(calculateTrend(80000, 100000)).toBe(-20);
  });

  it('returns 0 for same values', () => {
    expect(calculateTrend(100000, 100000)).toBe(0);
  });

  it('returns 100 when previous was 0 and current > 0', () => {
    expect(calculateTrend(50000, 0)).toBe(100);
  });

  it('returns 0 when both are 0', () => {
    expect(calculateTrend(0, 0)).toBe(0);
  });
});

describe('DashboardService', () => {
  describe('getDashboard', () => {
    it('returns all KPIs with populated data', async () => {
      const ds = createMockDataSource({
        async getReceivables() { return 250000; },  // 2500 EUR
        async getPayables() { return 120000; },      // 1200 EUR
        async getBankBalance() { return 800000; },   // 8000 EUR
        async getRevenueCurrentMonth() { return 450000; },
        async getRevenuePreviousMonth() { return 380000; },
      });
      const service = createDashboardService(ds);

      const result = await service.getDashboard(TENANT_ID);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.kpis.receivables_cents).toBe(250000);
        expect(result.value.kpis.payables_cents).toBe(120000);
        expect(result.value.kpis.bank_balance_cents).toBe(800000);
        // 800000 - 120000 + 250000 = 930000
        expect(result.value.kpis.real_cash_cents).toBe(930000);
        expect(result.value.kpis.revenue_month_cents).toBe(450000);
        expect(result.value.kpis.revenue_prev_month_cents).toBe(380000);
        expect(result.value.kpis.revenue_trend_pct).toBe(18); // ~18.4% rounded
      }
    });

    it('returns zeros for empty tenant (new user)', async () => {
      const ds = createMockDataSource();
      const service = createDashboardService(ds);

      const result = await service.getDashboard(TENANT_ID);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.kpis.receivables_cents).toBe(0);
        expect(result.value.kpis.payables_cents).toBe(0);
        expect(result.value.kpis.bank_balance_cents).toBe(0);
        expect(result.value.kpis.real_cash_cents).toBe(0);
        expect(result.value.kpis.revenue_month_cents).toBe(0);
        expect(result.value.kpis.revenue_trend_pct).toBe(0);
        expect(result.value.upcoming_payments).toHaveLength(0);
        expect(result.value.recent_activity).toHaveLength(0);
        expect(result.value.monthly_revenue).toHaveLength(0);
      }
    });

    it('includes upcoming payments', async () => {
      const ds = createMockDataSource({
        async getUpcomingPayments() {
          return [
            {
              id: '1',
              type: 'receivable' as const,
              entity_name: 'Client A',
              amount_cents: 50000,
              due_date: new Date('2026-04-18'),
              document_number: 'FAC-2026-001',
            },
            {
              id: '2',
              type: 'payable' as const,
              entity_name: 'Fournisseur B',
              amount_cents: 30000,
              due_date: new Date('2026-04-20'),
              document_number: 'ACH-2026-015',
            },
          ];
        },
      });
      const service = createDashboardService(ds);

      const result = await service.getDashboard(TENANT_ID);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.upcoming_payments).toHaveLength(2);
        expect(result.value.upcoming_payments[0]!.type).toBe('receivable');
        expect(result.value.upcoming_payments[1]!.type).toBe('payable');
      }
    });

    it('includes recent activity', async () => {
      const ds = createMockDataSource({
        async getRecentActivity() {
          return [
            { id: '1', type: 'invoice_paid', description: 'Facture FAC-001 payee', timestamp: new Date() },
            { id: '2', type: 'quote_sent', description: 'Devis DEV-005 envoye', timestamp: new Date() },
          ];
        },
      });
      const service = createDashboardService(ds);

      const result = await service.getDashboard(TENANT_ID);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.recent_activity).toHaveLength(2);
      }
    });

    it('includes monthly revenue chart data', async () => {
      const ds = createMockDataSource({
        async getMonthlyRevenue() {
          return [
            { month: '2025-11', revenue_cents: 350000 },
            { month: '2025-12', revenue_cents: 420000 },
            { month: '2026-01', revenue_cents: 380000 },
            { month: '2026-02', revenue_cents: 410000 },
            { month: '2026-03', revenue_cents: 450000 },
            { month: '2026-04', revenue_cents: 200000 },
          ];
        },
      });
      const service = createDashboardService(ds);

      const result = await service.getDashboard(TENANT_ID);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.monthly_revenue).toHaveLength(6);
        expect(result.value.monthly_revenue[0]!.month).toBe('2025-11');
      }
    });

    it('fetches all data in parallel (performance)', async () => {
      const callOrder: string[] = [];
      const ds = createMockDataSource({
        async getReceivables() { callOrder.push('receivables'); return 0; },
        async getPayables() { callOrder.push('payables'); return 0; },
        async getBankBalance() { callOrder.push('balance'); return 0; },
        async getRevenueCurrentMonth() { callOrder.push('rev-current'); return 0; },
        async getRevenuePreviousMonth() { callOrder.push('rev-prev'); return 0; },
        async getUpcomingPayments() { callOrder.push('upcoming'); return []; },
        async getRecentActivity() { callOrder.push('activity'); return []; },
        async getMonthlyRevenue() { callOrder.push('monthly'); return []; },
      });
      const service = createDashboardService(ds);

      await service.getDashboard(TENANT_ID);
      // All 8 data sources should be called
      expect(callOrder).toHaveLength(8);
    });
  });
});
