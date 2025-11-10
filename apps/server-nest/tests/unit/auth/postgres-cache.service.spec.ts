import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PostgresCacheService } from '../../../src/modules/auth/postgres-cache.service';
import { DatabaseService } from '../../../src/common/database/database.service';
import { AuthIntrospectionCache } from '../../../src/entities/auth-introspection-cache.entity';

describe('PostgresCacheService', () => {
    let service: PostgresCacheService;
    let mockDatabaseService: {
        query: ReturnType<typeof vi.fn>;
        isOnline: ReturnType<typeof vi.fn>;
    };
    let mockRepository: any;

    beforeEach(async () => {
        // Create fresh mocks for each test
        mockDatabaseService = {
            query: vi.fn(),
            isOnline: vi.fn().mockReturnValue(true), // Default: database is online
        };

        // Create mock repository
        mockRepository = {
            findOne: vi.fn(),
            save: vi.fn(),
            delete: vi.fn(),
            create: vi.fn().mockImplementation((dto) => dto),
            createQueryBuilder: vi.fn(),
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                PostgresCacheService,
                {
                    provide: DatabaseService,
                    useValue: mockDatabaseService,
                },
                {
                    provide: getRepositoryToken(AuthIntrospectionCache),
                    useValue: mockRepository,
                },
            ],
        }).compile();

        service = module.get<PostgresCacheService>(PostgresCacheService);

        // Ensure private fields are populated
        (service as any).db = mockDatabaseService;
        (service as any).cacheRepository = mockRepository;
    });

    describe('get', () => {
        it('should return null if database is offline', async () => {
            mockDatabaseService.isOnline.mockReturnValue(false);

            const result = await service.get('test-token');

            expect(result).toBeNull();
            expect(mockRepository.findOne).not.toHaveBeenCalled();
        });

        it('should return null if cache miss (no rows)', async () => {
            mockRepository.findOne.mockResolvedValue(null);

            const result = await service.get('test-token');

            expect(result).toBeNull();
            expect(mockRepository.findOne).toHaveBeenCalledWith({
                where: {
                    tokenHash: expect.stringMatching(/^[a-f0-9]{128}$/),
                    expiresAt: expect.anything(),
                }
            });
        });

        it('should return cached data if cache hit', async () => {
            const mockData = {
                active: true,
                sub: 'user-123',
                email: 'test@example.com',
            };
            const mockExpiresAt = new Date('2025-11-04T00:00:00Z');

            mockRepository.findOne.mockResolvedValue({
                introspectionData: mockData,
                expiresAt: mockExpiresAt,
            });

            const result = await service.get('test-token');

            expect(result).toEqual({
                data: mockData,
                expiresAt: mockExpiresAt,
            });
        });

        it('should return null on query error', async () => {
            mockRepository.findOne.mockRejectedValue(new Error('Database error'));

            const result = await service.get('test-token');

            expect(result).toBeNull();
        });

        it('should hash token before querying', async () => {
            mockRepository.findOne.mockResolvedValue(null);

            await service.get('my-secret-token');

            // Verify that findOne was called with a hash (128 hex characters)
            expect(mockRepository.findOne).toHaveBeenCalledWith({
                where: {
                    tokenHash: expect.stringMatching(/^[a-f0-9]{128}$/),
                    expiresAt: expect.anything(),
                }
            });
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

            expect(mockRepository.save).not.toHaveBeenCalled();
        });

        it('should insert cache entry with correct data', async () => {
            const mockData = { active: true, sub: 'user-123' };
            const mockExpiresAt = new Date('2025-11-04T00:00:00Z');

            mockRepository.save.mockResolvedValue({});

            await service.set('test-token', mockData, mockExpiresAt);

            expect(mockRepository.save).toHaveBeenCalledWith(
                expect.objectContaining({
                    tokenHash: expect.stringMatching(/^[a-f0-9]{128}$/),
                    introspectionData: mockData,
                    expiresAt: mockExpiresAt,
                })
            );
        });

        it('should handle upsert (ON CONFLICT DO UPDATE)', async () => {
            mockRepository.save.mockResolvedValue({});

            await service.set(
                'test-token',
                { active: true },
                new Date('2025-11-04T00:00:00Z')
            );

            // TypeORM .save() automatically handles upserts based on entity key
            expect(mockRepository.save).toHaveBeenCalled();
        });

        it('should not throw on query error', async () => {
            mockRepository.save.mockRejectedValue(new Error('Database error'));

            await expect(
                service.set('test-token', { active: true }, new Date())
            ).resolves.not.toThrow();
        });
    });

    describe('invalidate', () => {
        it('should not delete if database is offline', async () => {
            mockDatabaseService.isOnline.mockReturnValue(false);

            await service.invalidate('test-token');

            expect(mockRepository.delete).not.toHaveBeenCalled();
        });

        it('should delete cache entry by token hash', async () => {
            mockRepository.delete.mockResolvedValue({ affected: 1, raw: [] });

            await service.invalidate('test-token');

            expect(mockRepository.delete).toHaveBeenCalledWith({
                tokenHash: expect.stringMatching(/^[a-f0-9]{128}$/),
            });
        });

        it('should not throw on query error', async () => {
            mockRepository.delete.mockRejectedValue(new Error('Database error'));

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
            expect(mockRepository.delete).not.toHaveBeenCalled();
        });

        it('should delete expired entries and return count', async () => {
            mockRepository.delete.mockResolvedValue({ affected: 3, raw: [] });

            const result = await service.cleanupExpired();

            expect(result).toBe(3);
            expect(mockRepository.delete).toHaveBeenCalledWith({
                expiresAt: expect.anything(), // LessThan(new Date())
            });
        });

        it('should return 0 if no expired entries', async () => {
            mockRepository.delete.mockResolvedValue({ affected: 0, raw: [] });

            const result = await service.cleanupExpired();

            expect(result).toBe(0);
        });

        it('should return 0 on query error', async () => {
            mockRepository.delete.mockRejectedValue(new Error('Database error'));

            const result = await service.cleanupExpired();

            expect(result).toBe(0);
        });
    });

    describe('token hashing', () => {
        it('should produce consistent hashes for the same token', async () => {
            mockRepository.findOne.mockResolvedValue(null);

            await service.get('my-token');
            const firstCallHash = mockRepository.findOne.mock.calls[0][0].where.tokenHash;

            mockRepository.findOne.mockClear();

            await service.get('my-token');
            const secondCallHash = mockRepository.findOne.mock.calls[0][0].where.tokenHash;

            expect(firstCallHash).toBe(secondCallHash);
        });

        it('should produce different hashes for different tokens', async () => {
            mockRepository.findOne.mockResolvedValue(null);

            await service.get('token-1');
            const hash1 = mockRepository.findOne.mock.calls[0][0].where.tokenHash;

            mockRepository.findOne.mockClear();

            await service.get('token-2');
            const hash2 = mockRepository.findOne.mock.calls[0][0].where.tokenHash;

            expect(hash1).not.toBe(hash2);
        });

        it('should produce SHA-512 hash (128 hex characters)', async () => {
            mockRepository.findOne.mockResolvedValue(null);

            await service.get('test-token');

            const hash = mockRepository.findOne.mock.calls[0][0].where.tokenHash;
            expect(hash).toHaveLength(128);
            expect(hash).toMatch(/^[a-f0-9]{128}$/);
        });
    });
});
