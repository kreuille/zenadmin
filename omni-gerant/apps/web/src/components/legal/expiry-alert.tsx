'use client';

import { Card, CardContent } from '@/components/ui/card';

// BUSINESS RULE [CDC-2.4]: Alerte echeance assurance

interface ExpiryAlertProps {
  alerts: Array<{
    id: string;
    type: string;
    insurer: string;
    endDate: string;
    daysUntil: number;
    level: 'info' | 'warning' | 'urgent';
  }>;
}

const LEVEL_STYLES: Record<string, string> = {
  info: 'bg-blue-50 border-blue-200 text-blue-800',
  warning: 'bg-orange-50 border-orange-200 text-orange-800',
  urgent: 'bg-red-50 border-red-200 text-red-800',
};

const LEVEL_ICONS: Record<string, string> = {
  info: 'i',
  warning: '!',
  urgent: '!!',
};

const TYPE_LABELS: Record<string, string> = {
  rc_pro: 'RC Pro',
  decennale: 'Decennale',
  multirisque: 'Multirisque',
  protection_juridique: 'Protection juridique',
  prevoyance: 'Prevoyance',
};

export function ExpiryAlert({ alerts }: ExpiryAlertProps) {
  if (alerts.length === 0) return null;

  return (
    <div className="space-y-2 mb-6">
      {alerts.map((alert) => (
        <Card key={alert.id} className={`border ${LEVEL_STYLES[alert.level]}`}>
          <CardContent className="p-3 flex items-center gap-3">
            <span className="font-bold text-lg">{LEVEL_ICONS[alert.level]}</span>
            <div className="flex-1">
              <p className="text-sm font-medium">
                {alert.level === 'urgent' ? 'URGENT : ' : ''}
                {TYPE_LABELS[alert.type] ?? alert.type} — {alert.insurer}
              </p>
              <p className="text-xs">
                Expire le {new Date(alert.endDate).toLocaleDateString('fr-FR')}
                {' '}({alert.daysUntil} jour{alert.daysUntil > 1 ? 's' : ''} restant{alert.daysUntil > 1 ? 's' : ''})
              </p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
