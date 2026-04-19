'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api-client';
import { HrNav } from '@/components/hr/hr-nav';

interface Filing {
  id: string; filingType: string; year: number; month: number;
  status: string; generatedAt: string | null;
  payslipsCount: number; totalGrossCents: number;
}

const MONTHS = ['Janvier','Fevrier','Mars','Avril','Mai','Juin','Juillet','Aout','Septembre','Octobre','Novembre','Decembre'];

export default function DsnPage() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [items, setItems] = useState<Filing[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    const r = await api.get<{ items: Filing[] }>('/api/hr/dsn');
    if (r.ok) setItems(r.value.items);
  }

  useEffect(() => { load(); }, []);

  async function genMonthly() {
    const r = await api.post<{ id: string }>(`/api/hr/dsn/monthly/${year}/${month}`, {});
    setMessage(r.ok ? `DSN mensuelle générée (${r.value.id.slice(0, 8)})` : 'Erreur : ' + r.error.message);
    await load();
  }

  function euro(c: number) { return (c / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2 }) + ' €'; }

  return (
    <div>
      <HrNav />
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">DSN — Déclaration Sociale Nominative</h1>
        <p className="text-sm text-gray-600 mt-1">
          Mensuelle obligatoire avant le 5 (mensualité M) ou 15 (M+1) via net-entreprises.fr. DSN événementielle sous 5 jours après sortie.
        </p>
      </div>

      <div className="flex flex-wrap gap-3 items-end mb-6">
        <select value={year} onChange={(e) => setYear(parseInt(e.target.value, 10))} className="border rounded px-3 py-1.5 text-sm">
          {[0, 1, 2].map((o) => { const y = today.getFullYear() - o; return <option key={y} value={y}>{y}</option>; })}
        </select>
        <select value={month} onChange={(e) => setMonth(parseInt(e.target.value, 10))} className="border rounded px-3 py-1.5 text-sm">
          {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
        </select>
        <button onClick={genMonthly} className="bg-primary-600 text-white px-4 py-1.5 rounded text-sm font-medium">Générer DSN mensuelle</button>
      </div>

      {message && <div className="mb-4 p-3 bg-blue-50 border border-blue-200 text-sm rounded">{message}</div>}

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        {items.length === 0 ? (
          <p className="p-8 text-center text-gray-500">Aucune DSN générée. Générez votre première déclaration mensuelle ci-dessus.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr className="text-left text-xs font-semibold text-gray-600 uppercase">
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Période</th>
                <th className="px-4 py-3">Statut</th>
                <th className="px-4 py-3 text-right">Bulletins</th>
                <th className="px-4 py-3 text-right">Brut total</th>
                <th className="px-4 py-3">Généré</th>
              </tr>
            </thead>
            <tbody>
              {items.map((f) => (
                <tr key={f.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-3"><span className="px-2 py-0.5 rounded text-xs font-semibold bg-blue-100 text-blue-800">{f.filingType}</span></td>
                  <td className="px-4 py-3">{MONTHS[f.month - 1]} {f.year}</td>
                  <td className="px-4 py-3 text-gray-600">{f.status}</td>
                  <td className="px-4 py-3 text-right">{f.payslipsCount}</td>
                  <td className="px-4 py-3 text-right">{euro(f.totalGrossCents)}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{f.generatedAt ? new Date(f.generatedAt).toLocaleString('fr-FR') : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
