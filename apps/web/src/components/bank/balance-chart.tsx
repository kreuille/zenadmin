'use client';

// BUSINESS RULE [CDC-2.3]: Graphique d'evolution du solde

interface BalanceChartProps {
  data: Array<{ date: string; balance_cents: number }>;
  currency: string;
}

function formatAmount(cents: number, currency: string): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency,
  }).format(cents / 100);
}

export function BalanceChart({ data, currency }: BalanceChartProps) {
  if (data.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        Pas assez de donnees pour afficher le graphique
      </div>
    );
  }

  const maxBalance = Math.max(...data.map((d) => d.balance_cents));
  const minBalance = Math.min(...data.map((d) => d.balance_cents));
  const range = maxBalance - minBalance || 1;
  const chartHeight = 200;

  return (
    <div className="w-full">
      <div className="flex justify-between text-xs text-gray-400 mb-2">
        <span>{formatAmount(maxBalance, currency)}</span>
        <span>{formatAmount(minBalance, currency)}</span>
      </div>
      <div className="relative bg-gray-50 rounded-lg p-4" style={{ height: chartHeight }}>
        <svg width="100%" height="100%" viewBox={`0 0 ${data.length * 40} ${chartHeight}`} preserveAspectRatio="none">
          {/* Area fill */}
          <path
            d={`M 0 ${chartHeight} ${data
              .map((d, i) => {
                const x = i * 40 + 20;
                const y = chartHeight - ((d.balance_cents - minBalance) / range) * (chartHeight - 20);
                return `L ${x} ${y}`;
              })
              .join(' ')} L ${(data.length - 1) * 40 + 20} ${chartHeight} Z`}
            fill="rgba(59, 130, 246, 0.1)"
          />
          {/* Line */}
          <polyline
            points={data
              .map((d, i) => {
                const x = i * 40 + 20;
                const y = chartHeight - ((d.balance_cents - minBalance) / range) * (chartHeight - 20);
                return `${x},${y}`;
              })
              .join(' ')}
            fill="none"
            stroke="#3b82f6"
            strokeWidth="2"
          />
        </svg>
      </div>
      <div className="flex justify-between text-xs text-gray-400 mt-2">
        {data.length > 0 && (
          <>
            <span>{new Date(data[0]!.date).toLocaleDateString('fr-FR')}</span>
            <span>{new Date(data[data.length - 1]!.date).toLocaleDateString('fr-FR')}</span>
          </>
        )}
      </div>
    </div>
  );
}
