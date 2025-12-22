import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SuperadminGuard } from '../../../src/modules/superadmin/superadmin.guard';
import { Reflector } from '@nestjs/core';
import { ForbiddenException } from '@nestjs/common';

class MockSuperadminService {
  isSuperadmin = vi.fn();
}

function makeContext(user: { id?: string } | null) {
  const req: any = { user };
  return {
    switchToHttp: () => ({
      getRequest: () => req,
    }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as any;
}

describe('SuperadminGuard', () => {
  let reflector: Reflector;
  let superadminService: MockSuperadminService;
  let guard: SuperadminGuard;

  beforeEach(() => {
    reflector = new Reflector();
    superadminService = new MockSuperadminService();
    guard = new SuperadminGuard(reflector, superadminService as any);
  });

  describe('when @Superadmin() decorator is NOT present', () => {
    beforeEach(() => {
      (reflector as any).getAllAndOverride = () => false;
    });

    it('allows request without checking superadmin status', async () => {
      const ctx = makeContext({ id: 'user-123' });
      const result = await guard.canActivate(ctx);

      expect(result).toBe(true);
      expect(superadminService.isSuperadmin).not.toHaveBeenCalled();
    });

    it('allows unauthenticated request', async () => {
      const ctx = makeContext(null);
      const result = await guard.canActivate(ctx);

      expect(result).toBe(true);
      expect(superadminService.isSuperadmin).not.toHaveBeenCalled();
    });
  });

  describe('when @Superadmin() decorator IS present', () => {
    beforeEach(() => {
      (reflector as any).getAllAndOverride = () => true;
    });

    it('allows request when user is a superadmin', async () => {
      superadminService.isSuperadmin.mockResolvedValue(true);
      const req: any = { user: { id: 'admin-user' } };
      const ctx = {
        switchToHttp: () => ({ getRequest: () => req }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as any;

      const result = await guard.canActivate(ctx);

      expect(result).toBe(true);
      expect(superadminService.isSuperadmin).toHaveBeenCalledWith('admin-user');
      expect(req.isSuperadmin).toBe(true);
    });

    it('throws ForbiddenException when user is not a superadmin', async () => {
      superadminService.isSuperadmin.mockResolvedValue(false);
      const ctx = {
        switchToHttp: () => ({
          getRequest: () => ({ user: { id: 'regular-user' } }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as any;

      await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
      await expect(guard.canActivate(ctx)).rejects.toMatchObject({
        response: {
          error: {
            code: 'forbidden',
            message: 'Superadmin access required',
          },
        },
      });
    });

    it('throws ForbiddenException when user is not authenticated (no user object)', async () => {
      const ctx = {
        switchToHttp: () => ({ getRequest: () => ({ user: null }) }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as any;

      await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
      await expect(guard.canActivate(ctx)).rejects.toMatchObject({
        response: {
          error: {
            code: 'forbidden',
            message: 'Authentication required',
          },
        },
      });
      expect(superadminService.isSuperadmin).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException when user has no id', async () => {
      const ctx = {
        switchToHttp: () => ({
          getRequest: () => ({ user: { email: 'test@test.com' } }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as any;

      await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
      expect(superadminService.isSuperadmin).not.toHaveBeenCalled();
    });
  });

  describe('reflector integration', () => {
    it('checks both handler and class for SUPERADMIN_KEY metadata', async () => {
      const getAllAndOverrideSpy = vi.fn().mockReturnValue(true);
      (reflector as any).getAllAndOverride = getAllAndOverrideSpy;
      superadminService.isSuperadmin.mockResolvedValue(true);

      const handler = () => {};
      const classRef = class TestController {};
      const ctx = {
        switchToHttp: () => ({
          getRequest: () => ({ user: { id: 'user-1' } }),
        }),
        getHandler: () => handler,
        getClass: () => classRef,
      } as any;

      await guard.canActivate(ctx);

      expect(getAllAndOverrideSpy).toHaveBeenCalledWith('requires_superadmin', [
        handler,
        classRef,
      ]);
    });
  });
});
