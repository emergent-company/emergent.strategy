import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuditService } from '../audit.service';
import { AuditEventType, AuditOutcome } from '../audit.types';
import { DatabaseService } from '../../../common/database/database.service';

describe('AuditService', () => {
    let auditService: AuditService;
    let mockDbService: DatabaseService;

    beforeEach(() => {
        // Mock database service
        mockDbService = {
            query: vi.fn().mockResolvedValue({ rows: [] }),
        } as any;

        // Create audit service with mocked dependencies
        auditService = new AuditService(mockDbService);
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

            expect(mockDbService.query).toHaveBeenCalledWith(
                expect.stringContaining('INSERT INTO kb.audit_log'),
                expect.arrayContaining([
                    entry.timestamp,
                    entry.event_type,
                    entry.outcome,
                    entry.user_id,
                    entry.user_email,
                ])
            );
        });

        it('should not throw on database error', async () => {
            vi.spyOn(mockDbService, 'query').mockRejectedValue(new Error('DB error'));

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

            expect(mockDbService.query).toHaveBeenCalled();
            const callArgs = (mockDbService.query as any).mock.calls[0];
            const values = callArgs[1];

            expect(values[1]).toBe(AuditEventType.AUTHZ_ALLOWED);
            expect(values[2]).toBe(AuditOutcome.SUCCESS);
            expect(values[3]).toBe('user-456');
            expect(values[4]).toBe('user@test.com');
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

            const callArgs = (mockDbService.query as any).mock.calls[0];
            const detailsJson = callArgs[1][16]; // details is the last parameter
            const details = JSON.parse(detailsJson);

            expect(details.required_scopes).toEqual(['documents:read']);
            expect(details.effective_scopes).toEqual(['documents:read', 'documents:write']);
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

            const callArgs = (mockDbService.query as any).mock.calls[0];
            const values = callArgs[1];

            expect(values[1]).toBe(AuditEventType.AUTHZ_DENIED);
            expect(values[2]).toBe(AuditOutcome.DENIED);
            expect(values[10]).toBe(403); // status_code
            expect(values[11]).toBe('forbidden'); // error_code

            const detailsJson = values[16];
            const details = JSON.parse(detailsJson);
            expect(details.missing_scopes).toEqual(['admin:write']);
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

            const callArgs = (mockDbService.query as any).mock.calls[0];
            const values = callArgs[1];

            expect(values[1]).toBe(AuditEventType.RESOURCE_READ);
            expect(values[5]).toBe('document'); // resource_type
            expect(values[6]).toBe('doc-123'); // resource_id
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

            const callArgs = (mockDbService.query as any).mock.calls[0];
            const detailsJson = callArgs[1][16];
            const details = JSON.parse(detailsJson);

            expect(details.metadata.query).toBe('test search');
            expect(details.metadata.mode).toBe('hybrid');
            expect(details.metadata.result_count).toBe(25);
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

            const callArgs = (mockDbService.query as any).mock.calls[0];
            const values = callArgs[1];

            expect(values[1]).toBe(AuditEventType.GRAPH_TRAVERSE);

            const detailsJson = values[16];
            const details = JSON.parse(detailsJson);
            expect(details.metadata.root_ids).toHaveLength(2);
            expect(details.metadata.total_nodes).toBe(150);
        });
    });

    describe('queryLogs', () => {
        beforeEach(() => {
            // Mock query results
            vi.spyOn(mockDbService, 'query').mockResolvedValue({
                rows: [
                    {
                        timestamp: new Date('2025-10-01'),
                        event_type: 'authz.allowed',
                        outcome: 'success',
                        user_id: 'user-1',
                        user_email: 'user1@test.com',
                        action: 'GET /search',
                        endpoint: '/search',
                        http_method: 'GET',
                        details: JSON.stringify({
                            required_scopes: ['documents:read'],
                            effective_scopes: ['documents:read'],
                        }),
                    },
                ],
            } as any);
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

            expect(mockDbService.query).toHaveBeenCalledWith(
                expect.stringContaining('timestamp >='),
                expect.arrayContaining([startDate, endDate])
            );
        });

        it('should query logs with event type filter', async () => {
            await auditService.queryLogs({
                eventType: AuditEventType.AUTHZ_DENIED,
                limit: 20,
            });

            expect(mockDbService.query).toHaveBeenCalledWith(
                expect.stringContaining('event_type ='),
                expect.arrayContaining([AuditEventType.AUTHZ_DENIED])
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
            const service = new AuditService(mockDbService);

            await service.log({
                timestamp: new Date(),
                event_type: AuditEventType.RESOURCE_READ,
                outcome: AuditOutcome.SUCCESS,
                action: 'test',
                endpoint: '/test',
                http_method: 'GET',
            });

            // Should not call database
            expect(mockDbService.query).not.toHaveBeenCalled();

            delete process.env.AUDIT_DATABASE_LOGGING;
        });
    });
});
