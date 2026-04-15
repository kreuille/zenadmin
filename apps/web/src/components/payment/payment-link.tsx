'use client';

import { useState } from 'react';

// BUSINESS RULE [CDC-3.2]: Generation lien de paiement Stripe

interface PaymentLinkProps {
  invoiceId: string;
  invoiceNumber: string;
  amountCents: number;
  currency?: string;
}

function formatAmount(cents: number, currency = 'EUR'): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency,
  }).format(cents / 100);
}

export function PaymentLink({
  invoiceId,
  invoiceNumber,
  amountCents,
  currency = 'EUR',
}: PaymentLinkProps) {
  const [link, setLink] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generateLink() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/payment/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoice_id: invoiceId,
          invoice_number: invoiceNumber,
          amount_cents: amountCents,
          currency,
        }),
      });
      if (!res.ok) throw new Error('Erreur generation lien');
      const data = await res.json();
      setLink(data.checkout_url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  }

  async function copyLink() {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium">Paiement par carte</p>
          <p className="text-sm text-gray-500">
            {invoiceNumber} - {formatAmount(amountCents, currency)}
          </p>
        </div>
        <svg className="h-8 w-8 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
        </svg>
      </div>

      {!link ? (
        <button
          onClick={generateLink}
          disabled={loading}
          className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-white font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          {loading ? 'Generation...' : 'Generer un lien de paiement'}
        </button>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2 rounded bg-gray-50 p-2">
            <input
              type="text"
              readOnly
              value={link}
              className="flex-1 bg-transparent text-sm truncate outline-none"
            />
            <button
              onClick={copyLink}
              className="shrink-0 rounded bg-gray-200 px-3 py-1 text-sm hover:bg-gray-300 transition-colors"
            >
              {copied ? 'Copie !' : 'Copier'}
            </button>
          </div>
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-center text-sm text-indigo-600 hover:underline"
          >
            Ouvrir le lien de paiement
          </a>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
