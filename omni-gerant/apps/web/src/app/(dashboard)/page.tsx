'use client';

import { useEffect, useState } from 'react';
import { ReceivablesWidget } from '@/components/dashboard/receivables-widget';
import { PayablesWidget } from '@/components/dashboard/payables-widget';
import { CashWidget } from '@/components/dashboard/cash-widget';
import { UpcomingPayments } from '@/components/dashboard/upcoming-payments';
import { RecentActivity } from '@/components/dashboard/recent-activity';
import { RevenueChart } from '@/components/dashboard/revenue-chart';
import { KpiCard } from '@/components/dashboard/kpi-card';
import { DashboardEmptyState } from '@/components/dashboard/empty-state';
import { api } from '@/lib/api-client';

// BUSINESS RULE [CDC-4]: Dashboard principal actionnable

interface DashboardKpis {
  receivables_cents: number;
  payables_cents: number;
  bank_balance_cents: number;
  real_cash_cents: number;
  revenue_month_cents: number;
  revenue_prev_month_cents: number;
  revenue_trend_pct: number;
}

interface UpcomingPaymentItem {
  id: string;
  type: 'receivable' | 'payable';
  entity_name: string;
  amount_cents: number;
  due_date: string;
  document_number: string;
}

interface RecentActivityItem {
  id: string;
  type: string;
  description: string;
  timestamp: string;
}

interface MonthlyRevenueItem {
  month: string;
  revenue_cents: number;
}

interface DashboardData {
  kpis: DashboardKpis;
  upcoming_payments: UpcomingPaymentItem[];
  recent_activity: RecentActivityItem[];
  monthly_revenue: MonthlyRevenueItem[];
}

const EMPTY_DATA: DashboardData = {
  kpis: {
    receivables_cents: 0,
    payables_cents: 0,
    bank_balance_cents: 0,
    real_cash_cents: 0,
    revenue_month_cents: 0,
    revenue_prev_month_cents: 0,
    revenue_trend_pct: 0,
  },
  upcoming_payments: [],
  recent_activity: [],
  monthly_revenue: [],
};

function formatCents(cents: number): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' })
    .format(cents / 100);
}

interface OnboardingStatus {
  has_profile: boolean;
  client_count: number;
  quote_count: number;
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData>(EMPTY_DATA);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [onboarding, setOnboarding] = useState<OnboardingStatus | null>(null);

  useEffect(() => {
    // P2-02 : determiner s'il faut afficher l'EmptyState
    Promise.all([
      api.get<{ naf_code: string | null }>('/api/tenants/me'),
      api.get<{ items: unknown[] }>('/api/clients?limit=1'),
      api.get<{ items: unknown[] }>('/api/quotes?limit=1'),
    ]).then(([t, c, q]) => {
      setOnboarding({
        has_profile: t.ok ? !!t.value.naf_code : false,
        client_count: c.ok ? (c.value.items?.length ?? 0) : 0,
        quote_count: q.ok ? (q.value.items?.length ?? 0) : 0,
      });
    }).catch(() => setOnboarding(null));
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    async function fetchDashboard() {
      setLoading(true);
      setError(null);

      const result = await api.get<DashboardData>('/api/dashboard', controller.signal);

      if (controller.signal.aborted) return;

      if (result.ok) {
        setData(result.value);
      } else {
        setError(result.error.message ?? 'Impossible de charger le tableau de bord');
        // Keep EMPTY_DATA as fallback — UI shows 0 values instead of crashing
      }
      setLoading(false);
    }

    fetchDashboard();

    return () => controller.abort();
  }, []);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg sm:text-xl md:text-2xl font-bold text-gray-900">Tableau de bord</h1>
        {loading && (
          <span className="text-sm text-gray-500 animate-pulse">Chargement...</span>
        )}
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* P2-02 : EmptyState pour les nouveaux comptes */}
      {onboarding && (!onboarding.has_profile || onboarding.client_count === 0 || onboarding.quote_count === 0) && (
        <DashboardEmptyState
          hasProfile={onboarding.has_profile}
          clientCount={onboarding.client_count}
          quoteCount={onboarding.quote_count}
        />
      )}

      {/* KPI principaux — toujours visibles */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <ReceivablesWidget amountCents={data.kpis.receivables_cents} />
        <PayablesWidget amountCents={data.kpis.payables_cents} />
        <CashWidget
          amountCents={data.kpis.real_cash_cents}
          bankBalanceCents={data.kpis.bank_balance_cents}
        />
      </div>

      {/* CA du mois */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <KpiCard
          title="CA du mois"
          value={formatCents(data.kpis.revenue_month_cents)}
          trend={data.kpis.revenue_trend_pct}
          subtitle="vs mois précédent"
          color="blue"
        />
        <RevenueChart
          data={data.monthly_revenue}
          trendPct={data.kpis.revenue_trend_pct}
        />
      </div>

      {/* Widgets secondaires */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <UpcomingPayments payments={data.upcoming_payments} />
        <RecentActivity activities={data.recent_activity} />
      </div>
    </div>
  );
}
