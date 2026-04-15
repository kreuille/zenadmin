'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';

const STATUS_LABELS: Record<string, { label: string; variant: 'default' | 'success' | 'warning' | 'error' }> = {
  draft: { label: 'Brouillon', variant: 'default' },
  sent: { label: 'Envoye', variant: 'warning' },
  viewed: { label: 'Vu', variant: 'warning' },
  signed: { label: 'Signe', variant: 'success' },
  refused: { label: 'Refuse', variant: 'error' },
  expired: { label: 'Expire', variant: 'error' },
};

function formatCents(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',') + ' EUR';
}

export default function QuotesPage() {
  const [search, setSearch] = useState('');

  // Placeholder data - will be fetched from API
  const quotes: Array<{
    id: string;
    number: string;
    client_name: string;
    status: string;
    total_ttc_cents: number;
    issue_date: string;
    validity_date: string;
  }> = [];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Devis</h1>
        <Link href="/quotes/new">
          <Button>Nouveau devis</Button>
        </Link>
      </div>

      <div className="mb-4">
        <Input
          placeholder="Rechercher un devis..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
      </div>

      {quotes.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-gray-500">
            <p className="text-lg mb-2">Aucun devis pour le moment</p>
            <p className="text-sm">Creez votre premier devis pour commencer.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Numero</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Client</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Statut</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">Montant TTC</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Date</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Validite</th>
                </tr>
              </thead>
              <tbody>
                {quotes.map((quote) => {
                  const statusInfo = STATUS_LABELS[quote.status] ?? STATUS_LABELS['draft']!;
                  return (
                    <tr key={quote.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <Link href={`/quotes/${quote.id}`} className="text-primary-600 hover:underline font-medium">
                          {quote.number}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-gray-900">{quote.client_name}</td>
                      <td className="px-4 py-3">
                        <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                      </td>
                      <td className="px-4 py-3 text-right font-medium">{formatCents(quote.total_ttc_cents)}</td>
                      <td className="px-4 py-3 text-gray-500">{quote.issue_date}</td>
                      <td className="px-4 py-3 text-gray-500">{quote.validity_date}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
