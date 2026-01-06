import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { ApiTokensService } from '../../../src/modules/api-tokens/api-tokens.service';
import { ApiToken } from '../../../src/entities/api-token.entity';
import { ApiTokenScope } from '../../../src/modules/api-tokens/dto/api-token.dto';

// Mock Repository
function createMockRepository() {
  return {
    create: vi.fn((data) => ({ ...data, id: 'mock-token-id' })),
    save: vi.fn(async (entity) => ({
      ...entity,
      createdAt: new Date(),
      lastUsedAt: null,
      revokedAt: null,
    })),
    find: vi.fn(async () => []),
    findOne: vi.fn(async () => null),
    update: vi.fn(async () => ({ affected: 1 })),
  } as any;
}

describe('ApiTokensService', () => {
  let service: ApiTokensService;
  let mockRepository: ReturnType<typeof createMockRepository>;

  beforeEach(() => {
    mockRepository = createMockRepository();
    service = new ApiTokensService(mockRepository);
  });

  describe('create', () => {
    it('should create a new token with valid inputs', async () => {
      const projectId = 'project-123';
      const userId = 'user-456';
      const name = 'Test Token';
      const scopes: ApiTokenScope[] = ['schema:read', 'data:read'];

      mockRepository.findOne.mockResolvedValue(null); // No existing token

      const result = await service.create(projectId, userId, name, scopes);

      expect(result).toBeDefined();
      expect(result.name).toBe(name);
      expect(result.scopes).toEqual(scopes);
      expect(result.token).toBeDefined();
      expect(result.token.startsWith('emt_')).toBe(true);
      expect(result.token.length).toBe(68); // emt_ (4) + 64 hex chars
      expect(result.tokenPrefix).toBe(result.token.substring(0, 12));
      expect(result.isRevoked).toBe(false);

      // Verify repository was called
      expect(mockRepository.create).toHaveBeenCalled();
      expect(mockRepository.save).toHaveBeenCalled();
    });

    it('should throw ConflictException if token name already exists', async () => {
      const projectId = 'project-123';
      const userId = 'user-456';
      const name = 'Existing Token';
      const scopes: ApiTokenScope[] = ['schema:read'];

      mockRepository.findOne.mockResolvedValue({
        id: 'existing-token-id',
        name,
        projectId,
      });

      await expect(
        service.create(projectId, userId, name, scopes)
      ).rejects.toThrow(ConflictException);
    });

    it('should generate unique tokens on each call', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      const result1 = await service.create('p1', 'u1', 'Token 1', [
        'schema:read',
      ]);
      const result2 = await service.create('p1', 'u1', 'Token 2', [
        'schema:read',
      ]);

      expect(result1.token).not.toBe(result2.token);
    });
  });

  describe('listByProject', () => {
    it('should return all tokens for a project', async () => {
      const projectId = 'project-123';
      const mockTokens: Partial<ApiToken>[] = [
        {
          id: 'token-1',
          name: 'Token 1',
          tokenPrefix: 'emt_abc12345',
          scopes: ['schema:read'],
          createdAt: new Date(),
          lastUsedAt: null,
          revokedAt: null,
        },
        {
          id: 'token-2',
          name: 'Token 2',
          tokenPrefix: 'emt_def67890',
          scopes: ['data:read', 'data:write'],
          createdAt: new Date(),
          lastUsedAt: new Date(),
          revokedAt: null,
        },
      ];

      mockRepository.find.mockResolvedValue(mockTokens);

      const result = await service.listByProject(projectId);

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Token 1');
      expect(result[1].name).toBe('Token 2');
      expect(result[0].isRevoked).toBe(false);
      expect(mockRepository.find).toHaveBeenCalledWith({
        where: { projectId },
        order: { createdAt: 'DESC' },
      });
    });

    it('should return empty array if no tokens exist', async () => {
      mockRepository.find.mockResolvedValue([]);

      const result = await service.listByProject('project-123');

      expect(result).toHaveLength(0);
    });

    it('should correctly map revoked tokens', async () => {
      const mockTokens: Partial<ApiToken>[] = [
        {
          id: 'token-1',
          name: 'Active Token',
          tokenPrefix: 'emt_abc12345',
          scopes: ['schema:read'],
          createdAt: new Date(),
          lastUsedAt: null,
          revokedAt: null,
        },
        {
          id: 'token-2',
          name: 'Revoked Token',
          tokenPrefix: 'emt_def67890',
          scopes: ['data:read'],
          createdAt: new Date(),
          lastUsedAt: null,
          revokedAt: new Date(),
        },
      ];

      mockRepository.find.mockResolvedValue(mockTokens);

      const result = await service.listByProject('project-123');

      expect(result[0].isRevoked).toBe(false);
      expect(result[1].isRevoked).toBe(true);
    });
  });

  describe('getById', () => {
    it('should return token when found', async () => {
      const mockToken: Partial<ApiToken> = {
        id: 'token-123',
        projectId: 'project-123',
        name: 'Test Token',
        tokenPrefix: 'emt_abc12345',
        scopes: ['schema:read'],
        createdAt: new Date(),
        lastUsedAt: null,
        revokedAt: null,
      };

      mockRepository.findOne.mockResolvedValue(mockToken);

      const result = await service.getById('token-123', 'project-123');

      expect(result).not.toBeNull();
      expect(result?.id).toBe('token-123');
      expect(result?.name).toBe('Test Token');
    });

    it('should return null when token not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      const result = await service.getById('nonexistent', 'project-123');

      expect(result).toBeNull();
    });
  });

  describe('revoke', () => {
    it('should revoke an active token', async () => {
      const mockToken: Partial<ApiToken> = {
        id: 'token-123',
        projectId: 'project-123',
        name: 'Test Token',
        tokenPrefix: 'emt_abc12345',
        scopes: ['schema:read'],
        createdAt: new Date(),
        lastUsedAt: null,
        revokedAt: null,
      };

      mockRepository.findOne.mockResolvedValue(mockToken);

      await service.revoke('token-123', 'project-123', 'user-456');

      expect(mockRepository.save).toHaveBeenCalled();
      expect(mockToken.revokedAt).not.toBeNull();
    });

    it('should throw NotFoundException if token does not exist', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(
        service.revoke('nonexistent', 'project-123', 'user-456')
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException if token is already revoked', async () => {
      const mockToken: Partial<ApiToken> = {
        id: 'token-123',
        projectId: 'project-123',
        name: 'Test Token',
        revokedAt: new Date(), // Already revoked
      };

      mockRepository.findOne.mockResolvedValue(mockToken);

      await expect(
        service.revoke('token-123', 'project-123', 'user-456')
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('validateToken', () => {
    it('should return token data for valid token', async () => {
      const rawToken =
        'emt_abc123def456abc123def456abc123def456abc123def456abc123def456';
      const mockToken: Partial<ApiToken> = {
        id: 'token-123',
        projectId: 'project-123',
        userId: 'user-456',
        scopes: ['schema:read', 'data:read'],
        revokedAt: null,
      };

      mockRepository.findOne.mockResolvedValue(mockToken);

      const result = await service.validateToken(rawToken);

      expect(result).not.toBeNull();
      expect(result?.projectId).toBe('project-123');
      expect(result?.userId).toBe('user-456');
      expect(result?.scopes).toEqual(['schema:read', 'data:read']);
    });

    it('should return null for token without emt_ prefix', async () => {
      const result = await service.validateToken('invalid_token_format');

      expect(result).toBeNull();
      expect(mockRepository.findOne).not.toHaveBeenCalled();
    });

    it('should return null for token not found in database', async () => {
      const rawToken =
        'emt_notfoundnotfoundnotfoundnotfoundnotfoundnotfoundnotfound';
      mockRepository.findOne.mockResolvedValue(null);

      const result = await service.validateToken(rawToken);

      expect(result).toBeNull();
    });

    it('should return null for revoked token (via IsNull query)', async () => {
      // Repository returns null because revokedAt IsNull() constraint
      mockRepository.findOne.mockResolvedValue(null);

      const result = await service.validateToken(
        'emt_revokedtokenrevokedtokenrevokedtokenrevokedtoken12345'
      );

      expect(result).toBeNull();
    });

    it('should update lastUsedAt timestamp', async () => {
      const rawToken =
        'emt_abc123def456abc123def456abc123def456abc123def456abc123def456';
      const mockToken: Partial<ApiToken> = {
        id: 'token-123',
        projectId: 'project-123',
        userId: 'user-456',
        scopes: ['schema:read'],
        revokedAt: null,
      };

      mockRepository.findOne.mockResolvedValue(mockToken);
      mockRepository.update.mockResolvedValue({ affected: 1 });

      await service.validateToken(rawToken);

      // Wait for fire-and-forget update
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockRepository.update).toHaveBeenCalledWith(
        { id: 'token-123' },
        expect.objectContaining({ lastUsedAt: expect.any(Date) })
      );
    });
  });

  describe('isApiToken (static)', () => {
    it('should return true for valid emt_ prefix', () => {
      expect(ApiTokensService.isApiToken('emt_abc123')).toBe(true);
    });

    it('should return false for invalid prefix', () => {
      expect(ApiTokensService.isApiToken('bearer_abc123')).toBe(false);
      expect(ApiTokensService.isApiToken('abc123')).toBe(false);
      expect(ApiTokensService.isApiToken('')).toBe(false);
    });
  });
});
