import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

export interface RequestContext {
  correlation_id: string;
  tenant_id: string | null;
  user_id: string | null;
}

const asyncLocalStorage = new AsyncLocalStorage<RequestContext>();

export function getRequestContext(): RequestContext | undefined {
  return asyncLocalStorage.getStore();
}

export function createRequestContext(
  overrides?: Partial<RequestContext>,
): RequestContext {
  return {
    correlation_id: overrides?.correlation_id ?? randomUUID(),
    tenant_id: overrides?.tenant_id ?? null,
    user_id: overrides?.user_id ?? null,
  };
}

export function runWithContext<T>(context: RequestContext, fn: () => T): T {
  return asyncLocalStorage.run(context, fn);
}

export { asyncLocalStorage };
