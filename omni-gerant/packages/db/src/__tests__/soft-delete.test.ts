import { describe, it, expect, vi, beforeEach } from 'vitest';
import { softDeleteMiddleware } from '../middleware/soft-delete.js';

type MiddlewareParams = {
  model?: string;
  action: string;
  args?: Record<string, unknown>;
};

describe('softDeleteMiddleware', () => {
  let next: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    next = vi.fn().mockResolvedValue(undefined);
  });

  describe('delete → soft delete', () => {
    it('converts delete to update with deleted_at', async () => {
      const params: MiddlewareParams = {
        model: 'User',
        action: 'delete',
        args: { where: { id: 'user-1' } },
      };

      await softDeleteMiddleware(params as never, next);

      expect(params.action).toBe('update');
      expect(params.args?.['data']).toEqual({ deleted_at: expect.any(Date) });
      expect(next).toHaveBeenCalled();
    });

    it('converts deleteMany to updateMany with deleted_at', async () => {
      const params: MiddlewareParams = {
        model: 'User',
        action: 'deleteMany',
        args: { where: { role: 'member' } },
      };

      await softDeleteMiddleware(params as never, next);

      expect(params.action).toBe('updateMany');
      expect(params.args?.['data']).toEqual({ deleted_at: expect.any(Date) });
    });
  });

  describe('read operations filter deleted_at', () => {
    it('adds deleted_at: null to findMany', async () => {
      const params: MiddlewareParams = {
        model: 'User',
        action: 'findMany',
        args: { where: { role: 'owner' } },
      };

      await softDeleteMiddleware(params as never, next);

      expect(params.args?.['where']).toEqual({ role: 'owner', deleted_at: null });
    });

    it('adds deleted_at: null to findFirst', async () => {
      const params: MiddlewareParams = {
        model: 'Tenant',
        action: 'findFirst',
        args: {},
      };

      await softDeleteMiddleware(params as never, next);

      expect(params.args?.['where']).toEqual({ deleted_at: null });
    });

    it('adds deleted_at: null to count', async () => {
      const params: MiddlewareParams = {
        model: 'User',
        action: 'count',
        args: {},
      };

      await softDeleteMiddleware(params as never, next);

      expect(params.args?.['where']).toEqual({ deleted_at: null });
    });

    it('creates args and where if not present', async () => {
      const params: MiddlewareParams = {
        model: 'User',
        action: 'findMany',
      };

      await softDeleteMiddleware(params as never, next);

      expect(params.args?.['where']).toEqual({ deleted_at: null });
    });

    it('does not override explicit deleted_at query', async () => {
      const params: MiddlewareParams = {
        model: 'User',
        action: 'findMany',
        args: { where: { deleted_at: { not: null } } },
      };

      await softDeleteMiddleware(params as never, next);

      // Should keep the original deleted_at filter
      expect(params.args?.['where']).toEqual({ deleted_at: { not: null } });
    });
  });

  describe('non-soft-delete models', () => {
    it('passes through for models without soft delete', async () => {
      const params: MiddlewareParams = {
        model: 'AuditLog',
        action: 'delete',
        args: { where: { id: '1' } },
      };

      await softDeleteMiddleware(params as never, next);

      // Should remain as delete, not converted
      expect(params.action).toBe('delete');
    });

    it('passes through when no model', async () => {
      const params: MiddlewareParams = {
        action: 'findMany',
        args: {},
      };

      await softDeleteMiddleware(params as never, next);

      // Should not add deleted_at filter
      expect(params.args?.['where']).toBeUndefined();
    });
  });

  describe('update operations', () => {
    it('adds deleted_at: null to update', async () => {
      const params: MiddlewareParams = {
        model: 'User',
        action: 'update',
        args: { where: { id: 'user-1' }, data: { first_name: 'New' } },
      };

      await softDeleteMiddleware(params as never, next);

      expect(params.args?.['where']).toEqual({ id: 'user-1', deleted_at: null });
    });
  });
});
