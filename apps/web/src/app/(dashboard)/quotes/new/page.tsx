'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { QuoteEditor } from '@/components/quote/quote-editor';
import { QuoteClientSelect } from '@/components/quote/quote-client-select';

export default function NewQuotePage() {
  const [title, setTitle] = useState('');
  const [clientId, setClientId] = useState('');
  const [validityDays, setValidityDays] = useState(30);
  const [notes, setNotes] = useState('');

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link href="/quotes" className="text-sm text-gray-500 hover:text-gray-700">
            &larr; Retour aux devis
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 mt-1">Nouveau devis</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline">Apercu</Button>
          <Button>Enregistrer</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardContent className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Titre du devis</label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ex: Renovation salle de bain"
                />
              </div>
              <QuoteClientSelect value={clientId} onChange={setClientId} />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <h2 className="text-sm font-semibold text-gray-700 mb-4">Lignes du devis</h2>
              <QuoteEditor />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardContent className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Validite (jours)</label>
                <Input
                  type="number"
                  value={validityDays}
                  onChange={(e) => setValidityDays(parseInt(e.target.value, 10) || 30)}
                  min={1}
                  max={365}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes / Conditions</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  rows={4}
                  placeholder="Conditions particulieres..."
                />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
