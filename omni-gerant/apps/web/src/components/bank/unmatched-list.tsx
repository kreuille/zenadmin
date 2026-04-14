'use client';

import { Button } from '@/components/ui/button';

// BUSINESS RULE [CDC-2.3]: Liste des transactions non rapprochees

interface UnmatchedTransaction {
  id: string;
  date: string;
  label: string;
  amount_cents: number;
  currency: string;
  type: string | null;
}

interface UnmatchedListProps {
  transactions: UnmatchedTransaction[];
  onManualMatch: (transactionId: string) => void;
}

function formatAmount(cents: number, currency: string): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency }).format(cents / 100);
}

export function UnmatchedList({ transactions, onManualMatch }: UnmatchedListProps) {
  if (transactions.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        Toutes les transactions sont rapprochees
      </div>
    );
  }

  return (
    <div className="divide-y divide-gray-200">
      {transactions.map((tx) => (
        <div key={tx.id} className="flex items-center justify-between py-3 px-4 hover:bg-gray-50">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
              tx.type === 'credit' ? 'bg-green-500' : 'bg-red-500'
            }`} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-gray-900 truncate">{tx.label}</p>
              <p className="text-xs text-gray-400">
                {new Date(tx.date).toLocaleDateString('fr-FR')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className={`text-sm font-semibold ${
              tx.amount_cents >= 0 ? 'text-green-600' : 'text-red-600'
            }`}>
              {tx.amount_cents >= 0 ? '+' : ''}{formatAmount(tx.amount_cents, tx.currency)}
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onManualMatch(tx.id)}
            >
              Rapprocher
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
