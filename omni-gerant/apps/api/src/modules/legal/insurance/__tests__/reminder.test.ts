import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createReminderScheduler,
  type NotificationSender,
  type ReminderNotification,
} from '../reminder.scheduler.js';
import type { InsuranceRepository, InsuranceDocument } from '../insurance.service.js';

const TENANT_ID = '00000000-0000-0000-0000-000000000001';

function makeInsurance(overrides: Partial<InsuranceDocument> = {}): InsuranceDocument {
  return {
    id: crypto.randomUUID(),
    tenant_id: TENANT_ID,
    type: 'rc_pro',
    insurer: 'AXA',
    contract_number: 'RC-001',
    start_date: new Date('2026-01-01'),
    end_date: new Date('2027-01-01'),
    premium_cents: 120000,
    document_url: null,
    notes: null,
    created_at: new Date(),
    updated_at: new Date(),
    deleted_at: null,
    ...overrides,
  };
}

function createMockRepo(insurances: InsuranceDocument[]): InsuranceRepository {
  return {
    async create() { throw new Error('not implemented'); },
    async findById() { return null; },
    async update() { return null; },
    async softDelete() { return false; },
    async list() { return insurances; },
    async findExpiring(_tenantId, beforeDate) {
      const now = new Date();
      return insurances.filter((i) => !i.deleted_at && i.end_date >= now && i.end_date <= beforeDate);
    },
    async findAllExpiring(beforeDate) {
      const now = new Date();
      return insurances.filter((i) => !i.deleted_at && i.end_date >= now && i.end_date <= beforeDate);
    },
  };
}

function createMockNotifier(): NotificationSender & { notifications: ReminderNotification[] } {
  const notifications: ReminderNotification[] = [];
  return {
    notifications,
    async send(notification) {
      notifications.push(notification);
    },
  };
}

describe('ReminderScheduler', () => {
  describe('buildReminder', () => {
    it('returns urgent for J-7', () => {
      const today = new Date('2026-06-24');
      const insurance = makeInsurance({ end_date: new Date('2026-06-28') });

      const repo = createMockRepo([]);
      const notifier = createMockNotifier();
      const scheduler = createReminderScheduler(repo, notifier);

      const reminder = scheduler.buildReminder(insurance, today);
      expect(reminder).not.toBeNull();
      expect(reminder!.level).toBe('urgent');
      expect(reminder!.message).toContain('URGENT');
      expect(reminder!.days_until_expiry).toBe(4);
    });

    it('returns warning for M-1 (8-30 days)', () => {
      const today = new Date('2026-06-01');
      const insurance = makeInsurance({ end_date: new Date('2026-06-20') });

      const repo = createMockRepo([]);
      const notifier = createMockNotifier();
      const scheduler = createReminderScheduler(repo, notifier);

      const reminder = scheduler.buildReminder(insurance, today);
      expect(reminder).not.toBeNull();
      expect(reminder!.level).toBe('warning');
      expect(reminder!.message).toContain('1 mois');
      expect(reminder!.message).toContain('renouveler');
    });

    it('returns info for M-2 (31-60 days)', () => {
      const today = new Date('2026-05-01');
      const insurance = makeInsurance({ end_date: new Date('2026-06-20') });

      const repo = createMockRepo([]);
      const notifier = createMockNotifier();
      const scheduler = createReminderScheduler(repo, notifier);

      const reminder = scheduler.buildReminder(insurance, today);
      expect(reminder).not.toBeNull();
      expect(reminder!.level).toBe('info');
      expect(reminder!.message).toContain('2 mois');
    });

    it('returns null for insurance expiring in more than 60 days', () => {
      const today = new Date('2026-01-01');
      const insurance = makeInsurance({ end_date: new Date('2027-01-01') });

      const repo = createMockRepo([]);
      const notifier = createMockNotifier();
      const scheduler = createReminderScheduler(repo, notifier);

      const reminder = scheduler.buildReminder(insurance, today);
      expect(reminder).toBeNull();
    });

    it('returns null for already expired insurance', () => {
      const today = new Date('2026-06-01');
      const insurance = makeInsurance({ end_date: new Date('2026-05-01') });

      const repo = createMockRepo([]);
      const notifier = createMockNotifier();
      const scheduler = createReminderScheduler(repo, notifier);

      const reminder = scheduler.buildReminder(insurance, today);
      expect(reminder).toBeNull();
    });
  });

  describe('checkAndNotify', () => {
    it('sends notifications for expiring insurances', async () => {
      const today = new Date('2026-06-01');
      const insurances = [
        makeInsurance({
          type: 'rc_pro',
          end_date: new Date('2026-06-05'), // J-4 → urgent
        }),
        makeInsurance({
          type: 'decennale',
          end_date: new Date('2026-06-20'), // J-19 → warning
        }),
        makeInsurance({
          type: 'multirisque',
          end_date: new Date('2026-07-15'), // J-44 → info
        }),
      ];

      const repo = createMockRepo(insurances);
      const notifier = createMockNotifier();
      const scheduler = createReminderScheduler(repo, notifier);

      const reminders = await scheduler.checkAndNotify(today);

      expect(reminders).toHaveLength(3);
      expect(notifier.notifications).toHaveLength(3);

      expect(reminders[0]!.level).toBe('urgent');
      expect(reminders[1]!.level).toBe('warning');
      expect(reminders[2]!.level).toBe('info');
    });

    it('does not send for insurances expiring beyond 60 days', async () => {
      const today = new Date('2026-01-01');
      const insurances = [
        makeInsurance({ end_date: new Date('2027-01-01') }), // 365 days away
      ];

      const repo = createMockRepo(insurances);
      const notifier = createMockNotifier();
      const scheduler = createReminderScheduler(repo, notifier);

      const reminders = await scheduler.checkAndNotify(today);
      expect(reminders).toHaveLength(0);
      expect(notifier.notifications).toHaveLength(0);
    });

    it('handles empty insurance list', async () => {
      const repo = createMockRepo([]);
      const notifier = createMockNotifier();
      const scheduler = createReminderScheduler(repo, notifier);

      const reminders = await scheduler.checkAndNotify();
      expect(reminders).toHaveLength(0);
    });

    it('includes correct insurance details in notification', async () => {
      const today = new Date('2026-06-24');
      const insurances = [
        makeInsurance({
          type: 'decennale',
          insurer: 'MAAF',
          contract_number: 'DEC-042',
          end_date: new Date('2026-06-28'),
        }),
      ];

      const repo = createMockRepo(insurances);
      const notifier = createMockNotifier();
      const scheduler = createReminderScheduler(repo, notifier);

      const reminders = await scheduler.checkAndNotify(today);

      expect(reminders).toHaveLength(1);
      const r = reminders[0]!;
      expect(r.insurer).toBe('MAAF');
      expect(r.contract_number).toBe('DEC-042');
      expect(r.type).toBe('decennale');
      expect(r.tenant_id).toBe(TENANT_ID);
      expect(r.message).toContain('Decennale');
    });
  });
});
