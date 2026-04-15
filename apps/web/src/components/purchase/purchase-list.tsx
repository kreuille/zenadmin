'use client';

import Link from 'next/link';
import { Badge } from '@/components/ui/badge';

// BUSINESS RULE [CDC-2.2]: Visualisation factures d'achats a payer

interface PurchaseItem {
  id: string;
  number: string | null;
  supplier_name: string;
  status: string;
  total_ttc_cents: number;
  paid_cents: number;
  due_date: string | null;
}

interface PurchaseListProps {
  purchases: PurchaseItem[];
}

const STATUS_LABELS: Record<string, { label: string; variant: 'default' | 'success' | 'warning' | 'error' | 'info' }> = {
  pending: { label: 'En attente', variant: 'default' },
  validated: { label: 'Validee', variant: 'info' },
  paid: { label: 'Payee', variant: 'success' },
  disputed: { label: 'Litige', variant: 'error' },
};

function formatCents(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',') + ' EUR';
}

export function PurchaseList({ purchases }: PurchaseListProps) {
  if (purchases.length === 0) {
    return (
      <p className="text-center text-gray-500 py-8">
        Aucune facture d&apos;achat trouvee.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200">
            <th className="px-4 py-3 text-left font-medium text-gray-500">Numero</th>
            <th className="px-4 py-3 text-left font-medium text-gray-500">Fournisseur</th>
            <th className="px-4 py-3 text-left font-medium text-gray-500">Statut</th>
            <th className="px-4 py-3 text-right font-medium text-gray-500">Total TTC</th>
            <th className="px-4 py-3 text-right font-medium text-gray-500">Reste a payer</th>
            <th className="px-4 py-3 text-left font-medium text-gray-500">Echeance</th>
          </tr>
        </thead>
        <tbody>
          {purchases.map((purchase) => {
            const statusInfo = STATUS_LABELS[purchase.status] ?? STATUS_LABELS['pending']!;
            const remaining = purchase.total_ttc_cents - purchase.paid_cents;
            const isOverdue = purchase.due_date && new Date(purchase.due_date) < new Date() && purchase.status !== 'paid';

            return (
              <tr key={purchase.id} className={`border-b border-gray-100 hover:bg-gray-50 ${isOverdue ? 'bg-red-50' : ''}`}>
                <td className="px-4 py-3">
                  <Link href={`/purchases/${purchase.id}`} className="text-primary-600 hover:underline font-medium">
                    {purchase.number ?? '-'}
                  </Link>
                </td>
                <td className="px-4 py-3 text-gray-900">{purchase.supplier_name}</td>
                <td className="px-4 py-3">
                  <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                </td>
                <td className="px-4 py-3 text-right font-medium">{formatCents(purchase.total_ttc_cents)}</td>
                <td className="px-4 py-3 text-right">{formatCents(remaining)}</td>
                <td className={`px-4 py-3 ${isOverdue ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
                  {purchase.due_date ? new Date(purchase.due_date).toLocaleDateString('fr-FR') : '-'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
