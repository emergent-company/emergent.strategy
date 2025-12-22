import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  ViewAsMiddleware,
  VIEW_AS_HEADER,
  ViewAsUser,
} from '../../../src/common/middleware/view-as.middleware';
import { Request, Response, NextFunction } from 'express';

function createMockUserProfileRepository() {
  return {
    findOne: vi.fn(),
  };
}

function createMockSuperadminService() {
  return {
    isSuperadmin: vi.fn(),
  };
}

function createMockRequest(
  options: {
    user?: { id?: string; sub?: string; email?: string } | null;
    viewAsUserId?: string;
  } = {}
): Request {
  const headers: Record<string, string> = {};
  if (options.viewAsUserId) {
    headers[VIEW_AS_HEADER] = options.viewAsUserId;
  }
  return {
    user: options.user,
    headers,
  } as any;
}

function createMockResponse(): Response {
  return {} as Response;
}

function createMockUserProfile(id: string, name?: string) {
  return {
    id,
    displayName: name || null,
    firstName: 'Test',
    lastName: 'User',
    zitadelUserId: `zitadel-${id}`,
  };
}

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';
const TARGET_UUID = '660f9500-f39c-52e5-b827-557766551111';

describe('ViewAsMiddleware', () => {
  let middleware: ViewAsMiddleware;
  let mockRepository: ReturnType<typeof createMockUserProfileRepository>;
  let mockSuperadminService: ReturnType<typeof createMockSuperadminService>;
  let next: NextFunction;

  beforeEach(() => {
    mockRepository = createMockUserProfileRepository();
    mockSuperadminService = createMockSuperadminService();
    middleware = new ViewAsMiddleware(
      mockRepository as any,
      mockSuperadminService as any
    );
    next = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('no view-as header', () => {
    it('calls next() without setting view-as context when header is absent', async () => {
      const req = createMockRequest({ user: { id: VALID_UUID } });
      const res = createMockResponse();

      await middleware.use(req, res, next);

      expect(next).toHaveBeenCalled();
      expect((req as any).viewAsUser).toBeUndefined();
      expect((req as any).superadminUser).toBeUndefined();
      expect(mockSuperadminService.isSuperadmin).not.toHaveBeenCalled();
    });
  });

  describe('unauthenticated requests', () => {
    it('calls next() without setting context when no user present', async () => {
      const req = createMockRequest({
        user: null,
        viewAsUserId: TARGET_UUID,
      });
      const res = createMockResponse();

      await middleware.use(req, res, next);

      expect(next).toHaveBeenCalled();
      expect((req as any).viewAsUser).toBeUndefined();
      expect(mockSuperadminService.isSuperadmin).not.toHaveBeenCalled();
    });

    it('calls next() without setting context when user has no id', async () => {
      const req = createMockRequest({
        user: {},
        viewAsUserId: TARGET_UUID,
      });
      const res = createMockResponse();

      await middleware.use(req, res, next);

      expect(next).toHaveBeenCalled();
      expect((req as any).viewAsUser).toBeUndefined();
    });
  });

  describe('invalid UUID format', () => {
    it('calls next() without setting context for invalid UUID', async () => {
      const req = createMockRequest({
        user: { id: VALID_UUID },
        viewAsUserId: 'not-a-valid-uuid',
      });
      const res = createMockResponse();

      await middleware.use(req, res, next);

      expect(next).toHaveBeenCalled();
      expect((req as any).viewAsUser).toBeUndefined();
      expect(mockSuperadminService.isSuperadmin).not.toHaveBeenCalled();
    });

    it('calls next() without setting context for partial UUID', async () => {
      const req = createMockRequest({
        user: { id: VALID_UUID },
        viewAsUserId: '550e8400-e29b-41d4',
      });
      const res = createMockResponse();

      await middleware.use(req, res, next);

      expect(next).toHaveBeenCalled();
      expect((req as any).viewAsUser).toBeUndefined();
    });
  });

  describe('non-superadmin user', () => {
    it('calls next() without setting context when user is not superadmin', async () => {
      mockSuperadminService.isSuperadmin.mockResolvedValue(false);
      const req = createMockRequest({
        user: { id: VALID_UUID },
        viewAsUserId: TARGET_UUID,
      });
      const res = createMockResponse();

      await middleware.use(req, res, next);

      expect(mockSuperadminService.isSuperadmin).toHaveBeenCalledWith(
        VALID_UUID
      );
      expect(next).toHaveBeenCalled();
      expect((req as any).viewAsUser).toBeUndefined();
      expect((req as any).superadminUser).toBeUndefined();
    });
  });

  describe('target user not found', () => {
    it('calls next() without setting context when target user does not exist', async () => {
      mockSuperadminService.isSuperadmin.mockResolvedValue(true);
      mockRepository.findOne.mockResolvedValue(null);
      const req = createMockRequest({
        user: { id: VALID_UUID },
        viewAsUserId: TARGET_UUID,
      });
      const res = createMockResponse();

      await middleware.use(req, res, next);

      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { id: TARGET_UUID },
      });
      expect(next).toHaveBeenCalled();
      expect((req as any).viewAsUser).toBeUndefined();
    });
  });

  describe('successful view-as', () => {
    it('sets viewAsUser and superadminUser when all conditions met', async () => {
      const targetUser = createMockUserProfile(TARGET_UUID, 'John Doe');
      const authenticatedUser = { id: VALID_UUID, email: 'admin@test.com' };

      mockSuperadminService.isSuperadmin.mockResolvedValue(true);
      mockRepository.findOne.mockResolvedValue(targetUser);

      const req = createMockRequest({
        user: authenticatedUser,
        viewAsUserId: TARGET_UUID,
      });
      const res = createMockResponse();

      await middleware.use(req, res, next);

      expect(next).toHaveBeenCalled();
      expect((req as any).superadminUser).toBe(authenticatedUser);

      const viewAsUser: ViewAsUser = (req as any).viewAsUser;
      expect(viewAsUser).toBeDefined();
      expect(viewAsUser.id).toBe(TARGET_UUID);
      expect(viewAsUser.displayName).toBe('John Doe');
      expect(viewAsUser.firstName).toBe('Test');
      expect(viewAsUser.lastName).toBe('User');
      expect(viewAsUser.zitadelUserId).toBe(`zitadel-${TARGET_UUID}`);
    });

    it('handles target user without displayName', async () => {
      const targetUser = {
        id: TARGET_UUID,
        displayName: null,
        firstName: 'Jane',
        lastName: 'Smith',
        zitadelUserId: `zitadel-${TARGET_UUID}`,
      };

      mockSuperadminService.isSuperadmin.mockResolvedValue(true);
      mockRepository.findOne.mockResolvedValue(targetUser);

      const req = createMockRequest({
        user: { id: VALID_UUID },
        viewAsUserId: TARGET_UUID,
      });
      const res = createMockResponse();

      await middleware.use(req, res, next);

      const viewAsUser: ViewAsUser = (req as any).viewAsUser;
      expect(viewAsUser.displayName).toBeNull();
      expect(viewAsUser.firstName).toBe('Jane');
      expect(viewAsUser.lastName).toBe('Smith');
    });
  });

  describe('VIEW_AS_HEADER constant', () => {
    it('exports the correct header name', () => {
      expect(VIEW_AS_HEADER).toBe('x-view-as-user-id');
    });
  });
});
