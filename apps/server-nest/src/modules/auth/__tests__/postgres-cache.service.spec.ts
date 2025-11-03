import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { PostgresCacheService } from '../postgres-cache.service';
import { DatabaseService } from '../../../common/database/database.service';

describe('PostgresCacheService', () => {
    let service: PostgresCacheService;
    let mockDatabaseService: {
        query: ReturnType<typeof vi.fn>;
        isOnline: ReturnType<typeof vi.fn>;
    };

    beforeEach(async () => {
        // Create fresh mocks for each test
        mockDatabaseService = {
            query: vi.fn(),
            isOnline: vi.fn().mockReturnValue(true), // Default: database is online
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                PostgresCacheService,
                {
                    provide: DatabaseService,
                    useValue: mockDatabaseService,
                },
            ],
        }).compile();

        service = module.get<PostgresCacheService>(PostgresCacheService);
        
        // Ensure private field is populated in case Nest injection metadata is stripped during unit tests
        (service as any).db = mockDatabaseService;
    });

    describe('get', () => {
        it('should return null if database is offline', async () => {
            mockDatabaseService.isOnline.mockReturnValue(false);

            const result = await service.get('test-token');

            expect(result).toBeNull();
            expect(mockDatabaseService.query).not.toHaveBeenCalled();
        });

        it('should return null if cache miss (no rows)', async () => {
            mockDatabaseService.query.mockResolvedValue({ rows: [] });

            const result = await service.get('test-token');

            expect(result).toBeNull();
            expect(mockDatabaseService.query).toHaveBeenCalledWith(
                expect.stringContaining('SELECT introspection_data, expires_at'),
                expect.arrayContaining([expect.any(String)])
            );
        });

        it('should return cached data if cache hit', async () => {
            const mockData = {
                active: true,
                sub: 'user-123',
                email: 'test@example.com',
            };
            const mockExpiresAt = new Date('2025-11-04T00:00:00Z');

            mockDatabaseService.query.mockResolvedValue({
                rows: [
                    {
                        introspection_data: mockData,
                        expires_at: mockExpiresAt.toISOString(),
                    },
                ],
            });

            const result = await service.get('test-token');

            expect(result).toEqual({
                data: mockData,
                expiresAt: mockExpiresAt,
            });
        });

        it('should return null on query error', async () => {
            mockDatabaseService.query.mockRejectedValue(new Error('Database error'));

            const result = await service.get('test-token');

            expect(result).toBeNull();
        });

        it('should hash token before querying', async () => {
            mockDatabaseService.query.mockResolvedValue({ rows: [] });

            await service.get('my-secret-token');

            // Verify that query was called with a hash (128 hex characters)
            expect(mockDatabaseService.query).toHaveBeenCalledWith(
                expect.any(String),
                [expect.stringMatching(/^[a-f0-9]{128}$/)]
            );
        });
    });

    describe('set', () => {
        it('should not cache if database is offline', async () => {
            mockDatabaseService.isOnline.mockReturnValue(false);

            await service.set(
                'test-token',
                { active: true },
                new Date('2025-11-04T00:00:00Z')
            );

            expect(mockDatabaseService.query).not.toHaveBeenCalled();
        });

        it('should insert cache entry with correct data', async () => {
            const mockData = { active: true, sub: 'user-123' };
            const mockExpiresAt = new Date('2025-11-04T00:00:00Z');

            mockDatabaseService.query.mockResolvedValue({ rows: [] });

            await service.set('test-token', mockData, mockExpiresAt);

            expect(mockDatabaseService.query).toHaveBeenCalledWith(
                expect.stringContaining('INSERT INTO kb.auth_introspection_cache'),
                expect.arrayContaining([
                    expect.stringMatching(/^[a-f0-9]{128}$/), // token hash
                    JSON.stringify(mockData),
                    mockExpiresAt,
                ])
            );
        });

        it('should handle upsert (ON CONFLICT DO UPDATE)', async () => {
            mockDatabaseService.query.mockResolvedValue({ rows: [] });

            await service.set(
                'test-token',
                { active: true },
                new Date('2025-11-04T00:00:00Z')
            );

            expect(mockDatabaseService.query).toHaveBeenCalledWith(
                expect.stringContaining('ON CONFLICT (token_hash) DO UPDATE'),
                expect.any(Array)
            );
        });

        it('should not throw on query error', async () => {
            mockDatabaseService.query.mockRejectedValue(new Error('Database error'));

            await expect(
                service.set('test-token', { active: true }, new Date())
            ).resolves.not.toThrow();
        });
    });

    describe('invalidate', () => {
        it('should not delete if database is offline', async () => {
            mockDatabaseService.isOnline.mockReturnValue(false);

            await service.invalidate('test-token');

            expect(mockDatabaseService.query).not.toHaveBeenCalled();
        });

        it('should delete cache entry by token hash', async () => {
            mockDatabaseService.query.mockResolvedValue({ rows: [] });

            await service.invalidate('test-token');

            expect(mockDatabaseService.query).toHaveBeenCalledWith(
                expect.stringContaining('DELETE FROM kb.auth_introspection_cache'),
                [expect.stringMatching(/^[a-f0-9]{128}$/)]
            );
        });

        it('should not throw on query error', async () => {
            mockDatabaseService.query.mockRejectedValue(new Error('Database error'));

            await expect(
                service.invalidate('test-token')
            ).resolves.not.toThrow();
        });
    });

    describe('cleanupExpired', () => {
        it('should return 0 if database is offline', async () => {
            mockDatabaseService.isOnline.mockReturnValue(false);

            const result = await service.cleanupExpired();

            expect(result).toBe(0);
            expect(mockDatabaseService.query).not.toHaveBeenCalled();
        });

        it('should delete expired entries and return count', async () => {
            mockDatabaseService.query.mockResolvedValue({
                rows: [
                    { token_hash: 'hash1' },
                    { token_hash: 'hash2' },
                    { token_hash: 'hash3' },
                ],
            });

            const result = await service.cleanupExpired();

            expect(result).toBe(3);
            expect(mockDatabaseService.query).toHaveBeenCalledTimes(1);
            
            // Verify the single query contains all necessary parts
            const actualQuery = mockDatabaseService.query.mock.calls[0][0];
            expect(actualQuery).toContain('DELETE FROM kb.auth_introspection_cache');
            expect(actualQuery).toContain('WHERE expires_at <= NOW()');
            expect(actualQuery).toContain('RETURNING token_hash');
        });

        it('should return 0 if no expired entries', async () => {
            mockDatabaseService.query.mockResolvedValue({ rows: [] });

            const result = await service.cleanupExpired();

            expect(result).toBe(0);
        });

        it('should return 0 on query error', async () => {
            mockDatabaseService.query.mockRejectedValue(new Error('Database error'));

            const result = await service.cleanupExpired();

            expect(result).toBe(0);
        });
    });

    describe('token hashing', () => {
        it('should produce consistent hashes for the same token', async () => {
            mockDatabaseService.query.mockResolvedValue({ rows: [] });

            await service.get('my-token');
            const firstCallHash = mockDatabaseService.query.mock.calls[0][1][0];

            mockDatabaseService.query.mockClear();

            await service.get('my-token');
            const secondCallHash = mockDatabaseService.query.mock.calls[0][1][0];

            expect(firstCallHash).toBe(secondCallHash);
        });

        it('should produce different hashes for different tokens', async () => {
            mockDatabaseService.query.mockResolvedValue({ rows: [] });

            await service.get('token-1');
            const hash1 = mockDatabaseService.query.mock.calls[0][1][0];

            mockDatabaseService.query.mockClear();

            await service.get('token-2');
            const hash2 = mockDatabaseService.query.mock.calls[0][1][0];

            expect(hash1).not.toBe(hash2);
        });

        it('should produce SHA-512 hash (128 hex characters)', async () => {
            mockDatabaseService.query.mockResolvedValue({ rows: [] });

            await service.get('test-token');

            const hash = mockDatabaseService.query.mock.calls[0][1][0];
            expect(hash).toHaveLength(128);
            expect(hash).toMatch(/^[a-f0-9]{128}$/);
        });
    });
});
