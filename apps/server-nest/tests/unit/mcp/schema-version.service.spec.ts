import { Test, TestingModule } from '@nestjs/testing';
import { SchemaVersionService } from '../../../src/modules/mcp/services/schema-version.service';
import { TemplatePackService } from '../../../src/modules/mcp/../template-packs/template-pack.service';
import { vi } from 'vitest';

describe('SchemaVersionService', () => {
    let service: SchemaVersionService;
    let mockTemplatePackService: any;

    beforeEach(async () => {
        // Create mock template pack service
        mockTemplatePackService = {
            listTemplatePacks: vi.fn(),
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                SchemaVersionService,
                {
                    provide: TemplatePackService,
                    useValue: mockTemplatePackService,
                },
            ],
        }).compile();

        service = module.get<SchemaVersionService>(SchemaVersionService);

        // WORKAROUND: Manually assign the mock to fix DI issue
        (service as any).templatePackService = mockTemplatePackService;
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('getSchemaVersion', () => {
        it('should compute MD5 hash from template packs', async () => {
            // Arrange
            const mockPacks = [
                {
                    id: 'pack-1',
                    updated_at: '2025-01-15T10:00:00.000Z',
                },
                {
                    id: 'pack-2',
                    updated_at: '2025-01-18T14:30:00.000Z',
                },
            ];

            mockTemplatePackService.listTemplatePacks.mockResolvedValue({
                packs: mockPacks,
                total: 2,
            });

            // Act
            const version = await service.getSchemaVersion();

            // Assert
            expect(version).toBeDefined();
            expect(typeof version).toBe('string');
            expect(version.length).toBe(16); // First 16 chars of MD5
            expect(mockTemplatePackService.listTemplatePacks).toHaveBeenCalledWith({
                limit: 1000,
                page: 1,
            });
        });

        it('should return consistent hash for same input', async () => {
            // Arrange
            const mockPacks = [
                {
                    id: 'pack-1',
                    updated_at: '2025-01-15T10:00:00.000Z',
                },
            ];

            mockTemplatePackService.listTemplatePacks.mockResolvedValue({
                packs: mockPacks,
                total: 1,
            });

            // Act
            const version1 = await service.getSchemaVersion();

            // Clear cache to force recomputation
            service.invalidateCache();

            const version2 = await service.getSchemaVersion();

            // Assert
            expect(version1).toBe(version2);
        });

        it('should return different hash when pack updated_at changes', async () => {
            // Arrange
            const mockPacks1 = [
                {
                    id: 'pack-1',
                    updated_at: '2025-01-15T10:00:00.000Z',
                },
            ];

            const mockPacks2 = [
                {
                    id: 'pack-1',
                    updated_at: '2025-01-18T14:30:00.000Z', // Changed timestamp
                },
            ];

            mockTemplatePackService.listTemplatePacks
                .mockResolvedValueOnce({ packs: mockPacks1, total: 1 })
                .mockResolvedValueOnce({ packs: mockPacks2, total: 1 });

            // Act
            const version1 = await service.getSchemaVersion();
            service.invalidateCache();
            const version2 = await service.getSchemaVersion();

            // Assert
            expect(version1).not.toBe(version2);
        });

        it('should return different hash when pack added', async () => {
            // Arrange
            const mockPacks1 = [
                {
                    id: 'pack-1',
                    updated_at: '2025-01-15T10:00:00.000Z',
                },
            ];

            const mockPacks2 = [
                {
                    id: 'pack-1',
                    updated_at: '2025-01-15T10:00:00.000Z',
                },
                {
                    id: 'pack-2',
                    updated_at: '2025-01-18T14:30:00.000Z',
                },
            ];

            mockTemplatePackService.listTemplatePacks
                .mockResolvedValueOnce({ packs: mockPacks1, total: 1 })
                .mockResolvedValueOnce({ packs: mockPacks2, total: 2 });

            // Act
            const version1 = await service.getSchemaVersion();
            service.invalidateCache();
            const version2 = await service.getSchemaVersion();

            // Assert
            expect(version1).not.toBe(version2);
        });

        it('should sort packs by ID for stable ordering', async () => {
            // Arrange
            const mockPacksUnsorted = [
                {
                    id: 'pack-3',
                    updated_at: '2025-01-15T10:00:00.000Z',
                },
                {
                    id: 'pack-1',
                    updated_at: '2025-01-16T10:00:00.000Z',
                },
                {
                    id: 'pack-2',
                    updated_at: '2025-01-17T10:00:00.000Z',
                },
            ];

            const mockPacksSorted = [
                {
                    id: 'pack-1',
                    updated_at: '2025-01-16T10:00:00.000Z',
                },
                {
                    id: 'pack-2',
                    updated_at: '2025-01-17T10:00:00.000Z',
                },
                {
                    id: 'pack-3',
                    updated_at: '2025-01-15T10:00:00.000Z',
                },
            ];

            mockTemplatePackService.listTemplatePacks
                .mockResolvedValueOnce({ packs: mockPacksUnsorted, total: 3 })
                .mockResolvedValueOnce({ packs: mockPacksSorted, total: 3 });

            // Act
            const version1 = await service.getSchemaVersion();
            service.invalidateCache();
            const version2 = await service.getSchemaVersion();

            // Assert
            expect(version1).toBe(version2); // Same hash despite different order
        });

        it('should handle empty packs array', async () => {
            // Arrange
            mockTemplatePackService.listTemplatePacks.mockResolvedValue({
                packs: [],
                total: 0,
            });

            // Act
            const version = await service.getSchemaVersion();

            // Assert
            expect(version).toBeDefined();
            expect(typeof version).toBe('string');
            expect(version.length).toBe(16);
        });
    });

    describe('caching behavior', () => {
        it('should cache version for 60 seconds', async () => {
            // Arrange
            const mockPacks = [
                {
                    id: 'pack-1',
                    updated_at: '2025-01-15T10:00:00.000Z',
                },
            ];

            mockTemplatePackService.listTemplatePacks.mockResolvedValue({
                packs: mockPacks,
                total: 1,
            });

            // Act
            const version1 = await service.getSchemaVersion();
            const version2 = await service.getSchemaVersion();
            const version3 = await service.getSchemaVersion();

            // Assert
            expect(version1).toBe(version2);
            expect(version2).toBe(version3);
            expect(mockTemplatePackService.listTemplatePacks).toHaveBeenCalledTimes(1); // Only called once
        });

        it('should invalidate cache after expiry', async () => {
            // Arrange
            const mockPacks = [
                {
                    id: 'pack-1',
                    updated_at: '2025-01-15T10:00:00.000Z',
                },
            ];

            mockTemplatePackService.listTemplatePacks.mockResolvedValue({
                packs: mockPacks,
                total: 1,
            });

            // Mock Date.now() to simulate time passing
            const originalDateNow = Date.now;
            let currentTime = 1000000;

            Date.now = vi.fn(() => currentTime);

            // Act
            const version1 = await service.getSchemaVersion();

            // Simulate 61 seconds passing (beyond 60s cache TTL)
            currentTime += 61000;

            const version2 = await service.getSchemaVersion();

            // Assert
            expect(version1).toBe(version2);
            expect(mockTemplatePackService.listTemplatePacks).toHaveBeenCalledTimes(2); // Called twice due to expiry

            // Cleanup
            Date.now = originalDateNow;
        });

        it('should allow manual cache invalidation', async () => {
            // Arrange
            const mockPacks = [
                {
                    id: 'pack-1',
                    updated_at: '2025-01-15T10:00:00.000Z',
                },
            ];

            mockTemplatePackService.listTemplatePacks.mockResolvedValue({
                packs: mockPacks,
                total: 1,
            });

            // Act
            const version1 = await service.getSchemaVersion();

            service.invalidateCache(); // Manual invalidation

            const version2 = await service.getSchemaVersion();

            // Assert
            expect(version1).toBe(version2); // Same data, same hash
            expect(mockTemplatePackService.listTemplatePacks).toHaveBeenCalledTimes(2); // Called twice due to invalidation
        });
    });

    describe('getSchemaVersionDetails', () => {
        it('should return version with metadata', async () => {
            // Arrange
            const mockPacks = [
                {
                    id: 'pack-1',
                    updated_at: '2025-01-15T10:00:00.000Z',
                },
                {
                    id: 'pack-2',
                    updated_at: '2025-01-18T14:30:00.000Z',
                },
            ];

            mockTemplatePackService.listTemplatePacks.mockResolvedValue({
                packs: mockPacks,
                total: 2,
            });

            // Act
            const details = await service.getSchemaVersionDetails();

            // Assert
            expect(details).toHaveProperty('version');
            expect(details).toHaveProperty('computed_at');
            expect(details).toHaveProperty('pack_count');
            expect(details).toHaveProperty('latest_update');

            expect(typeof details.version).toBe('string');
            expect(details.version.length).toBe(16);
            expect(details.pack_count).toBe(2);
            expect(details.latest_update).toBe('2025-01-18T14:30:00.000Z'); // Latest timestamp
        });

        it('should identify latest update correctly', async () => {
            // Arrange
            const mockPacks = [
                {
                    id: 'pack-1',
                    updated_at: '2025-01-10T10:00:00.000Z',
                },
                {
                    id: 'pack-2',
                    updated_at: '2025-01-18T14:30:00.000Z', // Latest
                },
                {
                    id: 'pack-3',
                    updated_at: '2025-01-15T12:00:00.000Z',
                },
            ];

            mockTemplatePackService.listTemplatePacks.mockResolvedValue({
                packs: mockPacks,
                total: 3,
            });

            // Act
            const details = await service.getSchemaVersionDetails();

            // Assert
            expect(details.pack_count).toBe(3);
            expect(details.latest_update).toBe('2025-01-18T14:30:00.000Z');
        });

        it('should handle single pack', async () => {
            // Arrange
            const mockPacks = [
                {
                    id: 'pack-1',
                    updated_at: '2025-01-15T10:00:00.000Z',
                },
            ];

            mockTemplatePackService.listTemplatePacks.mockResolvedValue({
                packs: mockPacks,
                total: 1,
            });

            // Act
            const details = await service.getSchemaVersionDetails();

            // Assert
            expect(details.pack_count).toBe(1);
            expect(details.latest_update).toBe('2025-01-15T10:00:00.000Z');
        });
    });

    describe('hasVersionChanged', () => {
        it('should detect version change', () => {
            // Act & Assert
            expect(service.hasVersionChanged('abc123', 'def456')).toBe(true);
        });

        it('should detect no change', () => {
            // Act & Assert
            expect(service.hasVersionChanged('abc123', 'abc123')).toBe(false);
        });

        it('should handle empty strings', () => {
            // Act & Assert
            expect(service.hasVersionChanged('', 'abc123')).toBe(true);
            expect(service.hasVersionChanged('abc123', '')).toBe(true);
            expect(service.hasVersionChanged('', '')).toBe(false);
        });
    });

    describe('error handling', () => {
        it('should propagate errors from TemplatePackService', async () => {
            // Arrange
            const error = new Error('Database connection failed');
            mockTemplatePackService.listTemplatePacks.mockRejectedValue(error);

            // Act & Assert
            await expect(service.getSchemaVersion()).rejects.toThrow('Database connection failed');
        });

        it('should handle malformed pack data gracefully', async () => {
            // Arrange - pack with invalid updated_at
            const mockPacks = [
                {
                    id: 'pack-1',
                    updated_at: 'invalid-date',
                },
            ];

            mockTemplatePackService.listTemplatePacks.mockResolvedValue({
                packs: mockPacks,
                total: 1,
            });

            // Act
            const version = await service.getSchemaVersion();

            // Assert - should still compute version (NaN timestamp)
            expect(version).toBeDefined();
            expect(typeof version).toBe('string');
        });
    });

    describe('performance characteristics', () => {
        it('should handle large number of packs efficiently', async () => {
            // Arrange - 100 packs
            const mockPacks = Array.from({ length: 100 }, (_, i) => ({
                id: `pack-${i.toString().padStart(3, '0')}`,
                updated_at: new Date(Date.now() - i * 1000).toISOString(),
            }));

            mockTemplatePackService.listTemplatePacks.mockResolvedValue({
                packs: mockPacks,
                total: 100,
            });

            // Act
            const startTime = Date.now();
            const version = await service.getSchemaVersion();
            const endTime = Date.now();

            // Assert
            expect(version).toBeDefined();
            expect(endTime - startTime).toBeLessThan(100); // Should be fast (<100ms)
        });

        it('should respect 1000 pack limit in query', async () => {
            // Arrange
            mockTemplatePackService.listTemplatePacks.mockResolvedValue({
                packs: [],
                total: 0,
            });

            // Act
            await service.getSchemaVersion();

            // Assert
            expect(mockTemplatePackService.listTemplatePacks).toHaveBeenCalledWith({
                limit: 1000,
                page: 1,
            });
        });
    });
});
