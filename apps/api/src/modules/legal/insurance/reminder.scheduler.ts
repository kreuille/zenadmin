import type { InsuranceRepository, InsuranceDocument } from './insurance.service.js';
import { INSURANCE_TYPE_LABELS } from './insurance.service.js';

// BUSINESS RULE [CDC-2.4]: Rappel automatique avant echeance assurance
// M-2 : "Votre assurance [X] expire dans 2 mois"
// M-1 : "Votre assurance [X] expire dans 1 mois - pensez a renouveler"
// J-7 : "URGENT : Votre assurance [X] expire dans 7 jours"

export interface ReminderNotification {
  insurance_id: string;
  tenant_id: string;
  type: string;
  insurer: string;
  contract_number: string;
  end_date: Date;
  level: 'info' | 'warning' | 'urgent';
  message: string;
  days_until_expiry: number;
}

export interface NotificationSender {
  send(notification: ReminderNotification): Promise<void>;
}

function daysBetween(a: Date, b: Date): number {
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.floor((b.getTime() - a.getTime()) / msPerDay);
}

function buildReminder(insurance: InsuranceDocument, today: Date): ReminderNotification | null {
  const daysUntil = daysBetween(today, insurance.end_date);
  const label = INSURANCE_TYPE_LABELS[insurance.type] ?? insurance.type;

  // J-7 : urgent
  if (daysUntil >= 0 && daysUntil <= 7) {
    return {
      insurance_id: insurance.id,
      tenant_id: insurance.tenant_id,
      type: insurance.type,
      insurer: insurance.insurer,
      contract_number: insurance.contract_number,
      end_date: insurance.end_date,
      level: 'urgent',
      message: `URGENT : Votre assurance ${label} expire dans ${daysUntil} jours`,
      days_until_expiry: daysUntil,
    };
  }

  // M-1 : warning (between 8 and 30 days)
  if (daysUntil > 7 && daysUntil <= 30) {
    return {
      insurance_id: insurance.id,
      tenant_id: insurance.tenant_id,
      type: insurance.type,
      insurer: insurance.insurer,
      contract_number: insurance.contract_number,
      end_date: insurance.end_date,
      level: 'warning',
      message: `Votre assurance ${label} expire dans 1 mois - pensez a renouveler`,
      days_until_expiry: daysUntil,
    };
  }

  // M-2 : info (between 31 and 60 days)
  if (daysUntil > 30 && daysUntil <= 60) {
    return {
      insurance_id: insurance.id,
      tenant_id: insurance.tenant_id,
      type: insurance.type,
      insurer: insurance.insurer,
      contract_number: insurance.contract_number,
      end_date: insurance.end_date,
      level: 'info',
      message: `Votre assurance ${label} expire dans 2 mois`,
      days_until_expiry: daysUntil,
    };
  }

  return null;
}

export function createReminderScheduler(
  repo: InsuranceRepository,
  notifier: NotificationSender,
) {
  return {
    /**
     * Check all insurances expiring within 60 days and send reminders
     */
    async checkAndNotify(today: Date = new Date()): Promise<ReminderNotification[]> {
      const futureDate = new Date(today);
      futureDate.setDate(futureDate.getDate() + 60);

      const expiring = await repo.findAllExpiring(futureDate);
      const reminders: ReminderNotification[] = [];

      for (const insurance of expiring) {
        const reminder = buildReminder(insurance, today);
        if (reminder) {
          await notifier.send(reminder);
          reminders.push(reminder);
        }
      }

      return reminders;
    },

    buildReminder,
  };
}
