'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

// BUSINESS RULE [CDC-2.4]: Carte assurance

interface InsuranceCardProps {
  id: string;
  type: string;
  insurer: string;
  contractNumber: string;
  startDate: string;
  endDate: string;
  premiumCents: number;
  documentUrl: string | null;
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
  onUpload?: (id: string) => void;
}

const TYPE_LABELS: Record<string, string> = {
  rc_pro: 'RC Pro',
  decennale: 'Decennale',
  multirisque: 'Multirisque',
  protection_juridique: 'Protection juridique',
  prevoyance: 'Prevoyance',
};

const TYPE_COLORS: Record<string, string> = {
  rc_pro: 'bg-blue-100 text-blue-800',
  decennale: 'bg-red-100 text-red-800',
  multirisque: 'bg-green-100 text-green-800',
  protection_juridique: 'bg-purple-100 text-purple-800',
  prevoyance: 'bg-orange-100 text-orange-800',
};

function formatCents(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',') + ' EUR';
}

function daysUntil(dateStr: string): number {
  const d = new Date(dateStr);
  const now = new Date();
  return Math.floor((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

export function InsuranceCard({
  id,
  type,
  insurer,
  contractNumber,
  startDate,
  endDate,
  premiumCents,
  documentUrl,
  onEdit,
  onDelete,
  onUpload,
}: InsuranceCardProps) {
  const days = daysUntil(endDate);
  const isExpiring = days <= 60 && days >= 0;
  const isExpired = days < 0;

  return (
    <Card className={isExpired ? 'border-red-300 bg-red-50' : isExpiring ? 'border-orange-300' : ''}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${TYPE_COLORS[type] ?? 'bg-gray-100 text-gray-800'}`}>
                {TYPE_LABELS[type] ?? type}
              </span>
              {isExpired && (
                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-600 text-white">
                  Expiree
                </span>
              )}
              {isExpiring && !isExpired && (
                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-orange-500 text-white">
                  Expire dans {days}j
                </span>
              )}
            </div>

            <h3 className="font-semibold text-gray-900">{insurer}</h3>
            <p className="text-sm text-gray-500">Contrat {contractNumber}</p>

            <div className="grid grid-cols-3 gap-4 mt-2 text-sm">
              <div>
                <span className="text-gray-500">Debut : </span>
                <span className="text-gray-700">{new Date(startDate).toLocaleDateString('fr-FR')}</span>
              </div>
              <div>
                <span className="text-gray-500">Fin : </span>
                <span className="text-gray-700">{new Date(endDate).toLocaleDateString('fr-FR')}</span>
              </div>
              <div>
                <span className="text-gray-500">Prime : </span>
                <span className="font-medium text-gray-900">{formatCents(premiumCents)}</span>
              </div>
            </div>

            <div className="mt-2 text-sm">
              {documentUrl ? (
                <span className="text-green-600">Attestation jointe</span>
              ) : (
                <span className="text-orange-500">Aucune attestation</span>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-1 ml-4">
            {!documentUrl && onUpload && (
              <Button variant="outline" size="sm" onClick={() => onUpload(id)}>
                Joindre PDF
              </Button>
            )}
            {onEdit && (
              <Button variant="outline" size="sm" onClick={() => onEdit(id)}>
                Modifier
              </Button>
            )}
            {onDelete && (
              <Button variant="outline" size="sm" onClick={() => onDelete(id)} className="text-red-600">
                Supprimer
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
