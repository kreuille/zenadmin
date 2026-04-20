'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api-client';

interface MonthRow { month: string; balanceCents: number; inCents: number; outCents: number }

function euro(c: number) { return (c / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2 }) + ' €'; }

const MONTH_LABELS = ['Jan','Fev','Mar','Avr','Mai','Jun','Jul','Aou','Sep','Oct','Nov','Dec'];

export default function BankHistoryPage() {
  const [months, setMonths] = useState<MonthRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<{ months: MonthRow[] }>('/api/bank/history/monthly?months=12').then((r) => {
      if (r.ok) setMonths(r.value.months);
      setLoading(false);
    });
  }, []);

  const maxBalance = Math.max(1, ...months.map((m) => Math.max(m.balanceCents, m.inCents, m.outCents)));
  const totalIn = months.reduce((s, m) => s + m.inCents, 0);
  const totalOut = months.reduce((s, m) => s + m.outCents, 0);

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Historique des soldes</h1>
      <p className="text-sm text-gray-600 mb-6">Évolution mensuelle reconstruite depuis les transactions importées (12 derniers mois).</p>

      {loading && <p className="text-gray-500">Chargement…</p>}

      {!loading && months.length === 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-gray-500">
          Aucune donnée — importez un relevé bancaire pour visualiser votre historique.
        </div>
      )}

      {!loading && months.length > 0 && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="text-xs uppercase text-gray-500">Total encaissements</div>
              <div className="text-2xl font-bold text-green-700 mt-1">{euro(totalIn)}</div>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="text-xs uppercase text-gray-500">Total décaissements</div>
              <div className="text-2xl font-bold text-red-700 mt-1">{euro(totalOut)}</div>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="text-xs uppercase text-gray-500">Flux net</div>
              <div className={`text-2xl font-bold mt-1 ${totalIn - totalOut >= 0 ? 'text-green-700' : 'text-red-700'}`}>{euro(totalIn - totalOut)}</div>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-5 mb-6">
            <h2 className="font-semibold mb-4">Évolution des soldes</h2>
            <div className="flex items-stretch gap-1 h-56">
              {months.map((m) => {
                const h = Math.max(2, (Math.abs(m.balanceCents) / maxBalance) * 100);
                const positive = m.balanceCents >= 0;
                const [year, mn] = m.month.split('-');
                return (
                  <div key={m.month} className="flex-1 flex flex-col items-center justify-end" title={`${m.month}: ${euro(m.balanceCents)}`}>
                    <span className="text-[10px] text-gray-700 mb-1">{(m.balanceCents / 100).toFixed(0)}</span>
                    <div className={`w-full rounded-t ${positive ? 'bg-primary-500' : 'bg-red-500'}`} style={{ height: `${h}%` }} />
                    <span className="text-xs text-gray-500 mt-1">{MONTH_LABELS[parseInt(mn!, 10) - 1]}</span>
                    <span className="text-[10px] text-gray-400">{year?.slice(2)}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr className="text-left text-xs font-semibold text-gray-600 uppercase">
                  <th className="px-4 py-3">Mois</th>
                  <th className="px-4 py-3 text-right">Encaissements</th>
                  <th className="px-4 py-3 text-right">Décaissements</th>
                  <th className="px-4 py-3 text-right">Flux net</th>
                  <th className="px-4 py-3 text-right">Solde fin de mois</th>
                </tr>
              </thead>
              <tbody>
                {months.map((m) => (
                  <tr key={m.month} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{m.month}</td>
                    <td className="px-4 py-3 text-right text-green-700">+{euro(m.inCents)}</td>
                    <td className="px-4 py-3 text-right text-red-700">-{euro(m.outCents)}</td>
                    <td className={`px-4 py-3 text-right ${m.inCents - m.outCents >= 0 ? 'text-green-700' : 'text-red-700'}`}>{euro(m.inCents - m.outCents)}</td>
                    <td className="px-4 py-3 text-right font-semibold">{euro(m.balanceCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
