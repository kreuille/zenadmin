'use client';

import Link from 'next/link';

// P2-02 : Dashboard vide sans CTA. Cet EmptyState apparait tant que le tenant
// n'a pas au moins 1 client + 1 devis + un profil entreprise complet.

interface EmptyStateProps {
  hasProfile: boolean;
  clientCount: number;
  quoteCount: number;
}

export function DashboardEmptyState({ hasProfile, clientCount, quoteCount }: EmptyStateProps) {
  const steps = [
    {
      done: hasProfile,
      title: 'Compléter mon profil entreprise',
      desc: 'SIRET, raison sociale, régime TVA. Nécessaire pour vos devis et factures.',
      href: '/settings/profile',
      cta: hasProfile ? 'Profil complet' : 'Compléter',
    },
    {
      done: clientCount > 0,
      title: 'Ajouter mon premier client',
      desc: 'Importez un CSV ou créez manuellement. Lookup SIRET auto.',
      href: '/clients/new',
      cta: clientCount > 0 ? `${clientCount} client(s)` : 'Ajouter',
    },
    {
      done: quoteCount > 0,
      title: 'Créer mon premier devis',
      desc: 'Factur-X 2026, mentions légales automatiques par secteur.',
      href: '/quotes/new',
      cta: quoteCount > 0 ? `${quoteCount} devis` : 'Créer',
    },
  ];

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
      <h2 className="text-lg font-bold text-gray-900 mb-2">Bienvenue sur zenAdmin 👋</h2>
      <p className="text-sm text-gray-600 mb-5">
        En 3 minutes vous êtes prêt à facturer. Suivez ces étapes pour démarrer :
      </p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {steps.map((s, i) => (
          <div
            key={i}
            className={`rounded-md border p-4 ${s.done ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-gray-50'}`}
          >
            <div className="flex items-center gap-2 mb-2">
              <span
                className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                  s.done ? 'bg-green-500 text-white' : 'bg-blue-500 text-white'
                }`}
              >
                {s.done ? '✓' : i + 1}
              </span>
              <h3 className="font-semibold text-sm text-gray-900">{s.title}</h3>
            </div>
            <p className="text-xs text-gray-600 mb-3">{s.desc}</p>
            <Link
              href={s.href}
              className={`inline-block text-xs font-medium px-3 py-1.5 rounded ${
                s.done
                  ? 'bg-white text-green-700 border border-green-300'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              {s.cta} →
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}
