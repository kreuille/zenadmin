import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTenantMiddleware } from '../middleware/tenant.js';

type MiddlewareParams = {
  model?: string;
  action: string;
  args?: Record<string, unknown>;
};

const TENANT_ID = '550e8400-e29b-41d4-a716-446655440000';

describe('tenantMiddleware', () => {
  let next: ReturnType<typeof vi.fn>;
  let getTenantId: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    next = vi.fn().mockResolvedValue(undefined);
    getTenantId = vi.fn().mockReturnValue(TENANT_ID);
  });

  describe('create operations', () => {
    it('injects tenant_id on create', async () => {
      const middleware = createTenantMiddleware(getTenantId);
      const params: MiddlewareParams = {
        model: 'User',
        action: 'create',
        args: { data: { email: 'test@test.com', first_name: 'Test' } },
      };

      await middleware(params as never, next);

      expect(params.args?.['data']).toEqual({
        email: 'test@test.com',
        first_name: 'Test',
        tenant_id: TENANT_ID,
      });
    });

    it('injects tenant_id on createMany', async () => {
      const middleware = createTenantMiddleware(getTenantId);
      const params: MiddlewareParams = {
        model: 'User',
        action: 'createMany',
        args: {
          data: [
            { email: 'a@test.com' },
            { email: 'b@test.com' },
          ],
        },
      };

      await middleware(params as never, next);

      const data = params.args?.['data'] as Array<Record<string, unknown>>;
      expect(data[0]?.['tenant_id']).toBe(TENANT_ID);
      expect(data[1]?.['tenant_id']).toBe(TENANT_ID);
    });
  });

  describe('read operations', () => {
    it('adds tenant_id filter on findMany', async () => {
      const middleware = createTenantMiddleware(getTenantId);
      const params: MiddlewareParams = {
        model: 'User',
        action: 'findMany',
        args: { where: { role: 'owner' } },
      };

      await middleware(params as never, next);

      expect(params.args?.['where']).toEqual({ role: 'owner', tenant_id: TENANT_ID });
    });

    it('adds tenant_id filter on count', async () => {
      const middleware = createTenantMiddleware(getTenantId);
      const params: MiddlewareParams = {
        model: 'User',
        action: 'count',
        args: {},
      };

      await middleware(params as never, next);

      expect(params.args?.['where']).toEqual({ tenant_id: TENANT_ID });
    });
  });

  describe('tenant-free models', () => {
    it('does not add tenant_id for Tenant model', async () => {
      const middleware = createTenantMiddleware(getTenantId);
      const params: MiddlewareParams = {
        model: 'Tenant',
        action: 'findMany',
        args: {},
      };

      await middleware(params as never, next);

      expect(params.args?.['where']).toBeUndefined();
    });

    it('does not add tenant_id for RefreshToken model', async () => {
      const middleware = createTenantMiddleware(getTenantId);
      const params: MiddlewareParams = {
        model: 'RefreshToken',
        action: 'findFirst',
        args: { where: { token_hash: 'abc' } },
      };

      await middleware(params as never, next);

      expect(params.args?.['where']).toEqual({ token_hash: 'abc' });
    });
  });

  describe('no tenant context', () => {
    it('passes through when no tenant_id', async () => {
      getTenantId.mockReturnValue(null);
      const middleware = createTenantMiddleware(getTenantId);
      const params: MiddlewareParams = {
        model: 'User',
        action: 'findMany',
        args: { where: {} },
      };

      await middleware(params as never, next);

      // Should not add tenant_id
      expect(params.args?.['where']).toEqual({});
    });
  });

  describe('update/delete operations', () => {
    it('adds tenant_id filter on update', async () => {
      const middleware = createTenantMiddleware(getTenantId);
      const params: MiddlewareParams = {
        model: 'User',
        action: 'update',
        args: { where: { id: 'user-1' }, data: { first_name: 'Updated' } },
      };

      await middleware(params as never, next);

      expect(params.args?.['where']).toEqual({ id: 'user-1', tenant_id: TENANT_ID });
    });

    it('adds tenant_id filter on delete', async () => {
      const middleware = createTenantMiddleware(getTenantId);
      const params: MiddlewareParams = {
        model: 'User',
        action: 'delete',
        args: { where: { id: 'user-1' } },
      };

      await middleware(params as never, next);

      expect(params.args?.['where']).toEqual({ id: 'user-1', tenant_id: TENANT_ID });
    });
  });
});
