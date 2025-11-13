import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuditService } from '../../../src/modules/auth/audit.service';
import {
  AuditEventType,
  AuditOutcome,
} from '../../../src/modules/auth/audit.types';

describe('AuditService', () => {
  let auditService: AuditService;
  let mockAuditLogRepo: any;

  beforeEach(() => {
    // Mock AuditLog repository (Pattern 5 Level 3)
    mockAuditLogRepo = {
      create: vi.fn((data: any) => data),
      save: vi.fn(async (entity: any) => entity),
      createQueryBuilder: vi.fn(() => ({
        andWhere: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        offset: vi.fn().mockReturnThis(),
        getMany: vi.fn(async () => []),
      })),
    };

    // Create audit service with mocked dependencies (only repository now)
    auditService = new AuditService(mockAuditLogRepo);
  });

  describe('log', () => {
    it('should persist audit entry to database', async () => {
      const entry = {
        timestamp: new Date(),
        event_type: AuditEventType.AUTHZ_ALLOWED,
        outcome: AuditOutcome.SUCCESS,
        user_id: 'user-123',
        user_email: 'test@example.com',
        action: 'GET /search',
        endpoint: '/search',
        http_method: 'GET',
      };

      await auditService.log(entry);

      // Verify repository.save() was called
      expect(mockAuditLogRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          timestamp: entry.timestamp,
          eventType: entry.event_type,
          outcome: entry.outcome,
          userId: entry.user_id,
          userEmail: entry.user_email,
          action: entry.action,
          endpoint: entry.endpoint,
          httpMethod: entry.http_method,
        })
      );
    });

    it('should not throw on database error', async () => {
      vi.spyOn(mockAuditLogRepo, 'save').mockRejectedValue(
        new Error('DB error')
      );

      const entry = {
        timestamp: new Date(),
        event_type: AuditEventType.RESOURCE_READ,
        outcome: AuditOutcome.SUCCESS,
        action: 'test',
        endpoint: '/test',
        http_method: 'GET',
      };

      // Should not throw
      await expect(auditService.log(entry)).resolves.not.toThrow();
    });
  });

  describe('logAuthzAllowed', () => {
    it('should log successful authorization with all details', async () => {
      await auditService.logAuthzAllowed({
        userId: 'user-456',
        userEmail: 'user@test.com',
        endpoint: '/graph/traverse',
        httpMethod: 'POST',
        action: 'POST /graph/traverse',
        requiredScopes: ['graph:read'],
        effectiveScopes: ['graph:read', 'graph:write'],
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
        requestId: 'req-123',
      });

      // Verify repository.save() was called with correct event type and outcome
      expect(mockAuditLogRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: AuditEventType.AUTHZ_ALLOWED,
          outcome: AuditOutcome.SUCCESS,
          userId: 'user-456',
          userEmail: 'user@test.com',
          endpoint: '/graph/traverse',
          httpMethod: 'POST',
          action: 'POST /graph/traverse',
          ipAddress: '192.168.1.1',
          userAgent: 'Mozilla/5.0',
          requestId: 'req-123',
        })
      );
    });

    it('should include required and effective scopes in details', async () => {
      await auditService.logAuthzAllowed({
        userId: 'user-789',
        endpoint: '/search',
        httpMethod: 'GET',
        action: 'GET /search',
        requiredScopes: ['documents:read'],
        effectiveScopes: ['documents:read', 'documents:write'],
      });

      // Verify save was called and check details structure
      expect(mockAuditLogRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-789',
          details: expect.objectContaining({
            required_scopes: ['documents:read'],
            effective_scopes: ['documents:read', 'documents:write'],
          }),
        })
      );
    });
  });

  describe('logAuthzDenied', () => {
    it('should log authorization denial with missing scopes', async () => {
      await auditService.logAuthzDenied({
        userId: 'user-999',
        userEmail: 'blocked@test.com',
        endpoint: '/admin',
        httpMethod: 'GET',
        action: 'GET /admin',
        requiredScopes: ['admin:read', 'admin:write'],
        effectiveScopes: ['admin:read'],
        missingScopes: ['admin:write'],
        ipAddress: '10.0.0.1',
        userAgent: 'curl/7.0',
        requestId: 'req-456',
        statusCode: 403,
      });

      // Verify repository.save() was called with denied event
      expect(mockAuditLogRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: AuditEventType.AUTHZ_DENIED,
          outcome: AuditOutcome.DENIED,
          userId: 'user-999',
          userEmail: 'blocked@test.com',
          statusCode: 403,
          errorCode: 'forbidden',
          errorMessage: 'Missing required scopes',
          details: expect.objectContaining({
            required_scopes: ['admin:read', 'admin:write'],
            effective_scopes: ['admin:read'],
            missing_scopes: ['admin:write'],
          }),
        })
      );
    });
  });

  describe('logResourceAccess', () => {
    it('should log resource read access', async () => {
      await auditService.logResourceAccess({
        eventType: AuditEventType.RESOURCE_READ,
        userId: 'user-111',
        userEmail: 'reader@test.com',
        resourceType: 'document',
        resourceId: 'doc-123',
        action: 'GET /documents/doc-123',
        endpoint: '/documents/:id',
        httpMethod: 'GET',
        outcome: AuditOutcome.SUCCESS,
        ipAddress: '172.16.0.1',
        userAgent: 'PostmanRuntime/7.0',
      });

      // Verify repository.save() was called with resource access details
      expect(mockAuditLogRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: AuditEventType.RESOURCE_READ,
          resourceType: 'document',
          resourceId: 'doc-123',
          userId: 'user-111',
          userEmail: 'reader@test.com',
        })
      );
    });

    it('should log search queries with metadata', async () => {
      await auditService.logResourceAccess({
        eventType: AuditEventType.SEARCH_QUERY,
        userId: 'user-222',
        resourceType: 'search',
        action: 'GET /search',
        endpoint: '/search',
        httpMethod: 'GET',
        outcome: AuditOutcome.SUCCESS,
        metadata: {
          query: 'test search',
          mode: 'hybrid',
          result_count: 25,
        },
      });

      // Verify metadata is included in details
      expect(mockAuditLogRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: AuditEventType.SEARCH_QUERY,
          details: expect.objectContaining({
            metadata: {
              query: 'test search',
              mode: 'hybrid',
              result_count: 25,
            },
          }),
        })
      );
    });

    it('should log graph traversal operations', async () => {
      await auditService.logResourceAccess({
        eventType: AuditEventType.GRAPH_TRAVERSE,
        userId: 'user-333',
        resourceType: 'graph',
        action: 'POST /graph/traverse',
        endpoint: '/graph/traverse',
        httpMethod: 'POST',
        outcome: AuditOutcome.SUCCESS,
        metadata: {
          root_ids: ['node-1', 'node-2'],
          max_depth: 3,
          total_nodes: 150,
        },
      });

      // Verify graph traversal metadata
      expect(mockAuditLogRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: AuditEventType.GRAPH_TRAVERSE,
          details: expect.objectContaining({
            metadata: expect.objectContaining({
              root_ids: ['node-1', 'node-2'],
              total_nodes: 150,
            }),
          }),
        })
      );
    });
  });

  describe('queryLogs', () => {
    beforeEach(() => {
      // Mock QueryBuilder to return test data
      const mockQueryBuilder = {
        andWhere: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        offset: vi.fn().mockReturnThis(),
        getMany: vi.fn(async () => [
          {
            timestamp: new Date('2025-10-01'),
            eventType: 'authz.allowed',
            outcome: 'success',
            userId: 'user-1',
            userEmail: 'user1@test.com',
            action: 'GET /search',
            endpoint: '/search',
            httpMethod: 'GET',
            details: {
              required_scopes: ['documents:read'],
              effective_scopes: ['documents:read'],
            },
          },
        ]),
      };
      mockAuditLogRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder);
    });

    it('should query logs with userId filter', async () => {
      const logs = await auditService.queryLogs({
        userId: 'user-1',
        limit: 10,
        offset: 0,
      });

      expect(logs).toHaveLength(1);
      expect(logs[0].user_id).toBe('user-1');
      expect(logs[0].event_type).toBe('authz.allowed');
    });

    it('should query logs with date range', async () => {
      const startDate = new Date('2025-10-01');
      const endDate = new Date('2025-10-02');

      await auditService.queryLogs({
        startDate,
        endDate,
        limit: 50,
      });

      // Verify QueryBuilder was called with date filters
      const queryBuilder = mockAuditLogRepo.createQueryBuilder();
      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        'audit.timestamp >= :startDate',
        { startDate }
      );
      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        'audit.timestamp <= :endDate',
        { endDate }
      );
    });

    it('should query logs with event type filter', async () => {
      await auditService.queryLogs({
        eventType: AuditEventType.AUTHZ_DENIED,
        limit: 20,
      });

      // Verify QueryBuilder was called with event type filter
      const queryBuilder = mockAuditLogRepo.createQueryBuilder();
      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        'audit.eventType = :eventType',
        { eventType: AuditEventType.AUTHZ_DENIED }
      );
    });

    it('should parse details JSONB field correctly', async () => {
      const logs = await auditService.queryLogs({ limit: 1 });

      expect(logs[0].required_scopes).toEqual(['documents:read']);
      expect(logs[0].effective_scopes).toEqual(['documents:read']);
    });
  });

  describe('environment configuration', () => {
    it('should respect AUDIT_DATABASE_LOGGING=false', async () => {
      process.env.AUDIT_DATABASE_LOGGING = 'false';
      const service = new AuditService(mockAuditLogRepo);

      await service.log({
        timestamp: new Date(),
        event_type: AuditEventType.RESOURCE_READ,
        outcome: AuditOutcome.SUCCESS,
        action: 'test',
        endpoint: '/test',
        http_method: 'GET',
      });

      // Should not call repository.save() when database logging disabled
      expect(mockAuditLogRepo.save).not.toHaveBeenCalled();

      delete process.env.AUDIT_DATABASE_LOGGING;
    });
  });
});
