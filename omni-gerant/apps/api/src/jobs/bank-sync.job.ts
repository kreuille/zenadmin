// BUSINESS RULE [CDC-2.3]: Synchronisation bancaire quotidienne via BullMQ

export interface BankSyncJobConfig {
  cronExpression: string; // Default: '0 6 * * *' (daily at 6 AM)
  retryAttempts: number;
  retryDelay: number; // ms
}

export const DEFAULT_BANK_SYNC_CONFIG: BankSyncJobConfig = {
  cronExpression: '0 6 * * *',
  retryAttempts: 3,
  retryDelay: 60_000,
};

export const BANK_SYNC_QUEUE_NAME = 'bank-sync';

/**
 * Bank sync job processor
 * In production, this would:
 * 1. Fetch all tenants with active bank accounts
 * 2. For each tenant, sync all accounts via Bridge API
 * 3. Trigger auto-matching after sync
 */
export function createBankSyncJobProcessor() {
  return async (job: { data: { tenant_id: string; user_uuid: string } }) => {
    const { tenant_id, user_uuid } = job.data;

    // TODO: In production, inject syncService and call syncAllAccounts
    console.log(
      `[bank-sync] Syncing accounts for tenant ${tenant_id}, user ${user_uuid}`,
    );

    return { synced: true, tenant_id };
  };
}
