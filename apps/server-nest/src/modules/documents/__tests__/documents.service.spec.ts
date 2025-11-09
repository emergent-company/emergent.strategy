/**
 * DocumentsService Unit Tests
 * 
 * Testing Pattern 1: Simple CRUD Methods
 * Tests the TypeORM-migrated DocumentsService methods with mocked dependencies
 * 
 * Coverage Target: 90%
 * Priority: 1 (Core CRUD Service)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { BadRequestException } from '@nestjs/common';
import { DocumentsService } from '../documents.service';
import { Document } from '../../../entities/document.entity';
import { Chunk } from '../../../entities/chunk.entity';
import { Project } from '../../../entities/project.entity';
import { DatabaseService } from '../../../common/database/database.service';
import { HashService } from '../../../common/utils/hash.service';

describe('DocumentsService', () => {
    let service: DocumentsService;
    let documentRepository: any; // Use 'any' instead of jest.Mocked
    let chunkRepository: any;
    let projectRepository: any;
    let dataSource: any;
    let databaseService: any;
    let hashService: any;

    const mockDocument = {
        id: 'doc-123',
        organizationId: 'org-456',
        projectId: 'proj-789',
        filename: 'test-document.txt',
        sourceUrl: null,
        mimeType: 'text/plain',
        content: 'Test content',
        contentHash: 'abc123',
        createdAt: new Date('2025-01-01T00:00:00Z'),
        updatedAt: new Date('2025-01-01T00:00:00Z'),
        integrationMetadata: null,
        chunks: [],
    };

    const mockProject = {
        id: 'proj-789',
        organizationId: 'org-456',
        name: 'Test Project',
        kbPurpose: null,
        createdAt: new Date(),
        updatedAt: new Date(),
    };

    const mockDocumentRow = {
        id: 'doc-123',
        organization_id: 'org-456',
        project_id: 'proj-789',
        filename: 'test-document.txt',
        source_url: null,
        mime_type: 'text/plain',
        content: 'Test content',
        content_length: 12,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
        integration_metadata: null,
        chunks: 0,
        extraction_status: null,
        extraction_completed_at: null,
        extraction_objects_count: null,
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                DocumentsService,
                {
                    provide: getRepositoryToken(Document),
                    useValue: {
                        create: vi.fn(),
                        save: vi.fn(),
                        findOne: vi.fn(),
                        delete: vi.fn(),
                        count: vi.fn(),
                        createQueryBuilder: vi.fn(),
                    },
                },
                {
                    provide: getRepositoryToken(Chunk),
                    useValue: {
                        createQueryBuilder: vi.fn(),
                    },
                },
                {
                    provide: getRepositoryToken(Project),
                    useValue: {
                        findOne: vi.fn(),
                    },
                },
                {
                    provide: DataSource,
                    useValue: {
                        query: vi.fn(),
                    },
                },
                {
                    provide: DatabaseService,
                    useValue: {
                        query: vi.fn(),
                    },
                },
                {
                    provide: HashService,
                    useValue: {
                        sha256: vi.fn(),
                    },
                },
            ],
        }).compile();

        service = module.get<DocumentsService>(DocumentsService);
        documentRepository = module.get(getRepositoryToken(Document));
        chunkRepository = module.get(getRepositoryToken(Chunk));
        projectRepository = module.get(getRepositoryToken(Project));
        dataSource = module.get(DataSource);
        databaseService = module.get(DatabaseService);
        hashService = module.get(HashService);

        // Ensure query mock is a proper vi.fn() that can be chained
        if (!dataSource.query.mockResolvedValue) {
            dataSource.query = vi.fn();
        }
        if (!databaseService.query.mockResolvedValue) {
            databaseService.query = vi.fn();
        }

        // Manual mock assignment (Pattern 4 requirement for DataSource)
        (service as any).dataSource = dataSource;
        (service as any).db = databaseService;
        (service as any).hash = hashService;
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('get', () => {
        it('should return a document by ID successfully', async () => {
            // Arrange
            dataSource.query.mockResolvedValue([mockDocumentRow]);

            // Act
            const result = await service.get('doc-123');

            // Assert
            expect(result).toBeDefined();
            expect(result?.id).toBe('doc-123');
            expect(result?.name).toBe('test-document.txt');
            expect(result?.projectId).toBe('proj-789');
            expect(result?.chunks).toBe(0);
            expect(dataSource.query).toHaveBeenCalledWith(
                expect.stringContaining('SELECT d.id'),
                ['doc-123']
            );
        });

        it('should return null when document not found', async () => {
            // Arrange
            dataSource.query.mockResolvedValue([]);

            // Act
            const result = await service.get('nonexistent-id');

            // Assert
            expect(result).toBeNull();
            expect(dataSource.query).toHaveBeenCalledWith(
                expect.stringContaining('WHERE d.id = $1'),
                ['nonexistent-id']
            );
        });

        it('should include extraction status when available', async () => {
            // Arrange
            const rowWithExtraction = {
                ...mockDocumentRow,
                extraction_status: 'completed',
                extraction_completed_at: '2025-01-02T00:00:00Z',
                extraction_objects_count: 5,
            };
            dataSource.query.mockResolvedValue([rowWithExtraction]);

            // Act
            const result = await service.get('doc-123');

            // Assert
            expect(result?.extractionStatus).toBe('completed');
            expect(result?.extractionCompletedAt).toBe('2025-01-02T00:00:00Z');
            expect(result?.extractionObjectsCount).toBe(5);
        });
    });

    describe('create', () => {
        it('should create a document successfully', async () => {
            // Arrange
            projectRepository.findOne.mockResolvedValue(mockProject as any);
            hashService.sha256.mockReturnValue('abc123');
            documentRepository.create.mockReturnValue(mockDocument as any);
            documentRepository.save.mockResolvedValue(mockDocument as any);

            // Act
            const result = await service.create({
                filename: 'test-document.txt',
                projectId: 'proj-789',
                content: 'Test content',
                orgId: 'org-456',
            });

            // Assert
            expect(result).toBeDefined();
            expect(result.id).toBe('doc-123');
            expect(result.name).toBe('test-document.txt');
            expect(result.chunks).toBe(0);
            expect(projectRepository.findOne).toHaveBeenCalledWith({
                where: { id: 'proj-789' },
                select: ['id', 'organizationId'],
            });
            expect(hashService.sha256).toHaveBeenCalledWith('Test content');
            expect(documentRepository.create).toHaveBeenCalledWith({
                organizationId: 'org-456',
                projectId: 'proj-789',
                filename: 'test-document.txt',
                content: 'Test content',
                contentHash: 'abc123',
            });
            expect(documentRepository.save).toHaveBeenCalled();
        });

        it('should throw BadRequestException when projectId is missing', async () => {
            // Act & Assert
            await expect(
                service.create({
                    filename: 'test.txt',
                    content: 'content',
                })
            ).rejects.toThrow(BadRequestException);
            await expect(
                service.create({
                    filename: 'test.txt',
                    content: 'content',
                })
            ).rejects.toThrow('Unknown projectId');
        });

        it('should throw BadRequestException when project does not exist', async () => {
            // Arrange
            projectRepository.findOne.mockResolvedValue(null);

            // Act & Assert
            await expect(
                service.create({
                    filename: 'test.txt',
                    projectId: 'invalid-project',
                    content: 'content',
                })
            ).rejects.toThrow(BadRequestException);
            await expect(
                service.create({
                    filename: 'test.txt',
                    projectId: 'invalid-project',
                    content: 'content',
                })
            ).rejects.toThrow('Unknown projectId');
        });

        it('should use default filename when not provided', async () => {
            // Arrange
            projectRepository.findOne.mockResolvedValue(mockProject as any);
            hashService.sha256.mockReturnValue('abc123');
            documentRepository.create.mockReturnValue(mockDocument as any);
            documentRepository.save.mockResolvedValue(mockDocument as any);

            // Act
            await service.create({
                projectId: 'proj-789',
                content: 'content',
            });

            // Assert
            expect(documentRepository.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    filename: 'unnamed.txt',
                })
            );
        });

        it('should use empty string for content when not provided', async () => {
            // Arrange
            projectRepository.findOne.mockResolvedValue(mockProject as any);
            hashService.sha256.mockReturnValue('abc123');
            documentRepository.create.mockReturnValue(mockDocument as any);
            documentRepository.save.mockResolvedValue(mockDocument as any);

            // Act
            await service.create({
                projectId: 'proj-789',
                filename: 'test.txt',
            });

            // Assert
            expect(hashService.sha256).toHaveBeenCalledWith('');
            expect(documentRepository.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: '',
                })
            );
        });

        it('should use project organizationId when orgId not provided', async () => {
            // Arrange
            projectRepository.findOne.mockResolvedValue(mockProject as any);
            hashService.sha256.mockReturnValue('abc123');
            documentRepository.create.mockReturnValue(mockDocument as any);
            documentRepository.save.mockResolvedValue(mockDocument as any);

            // Act
            await service.create({
                projectId: 'proj-789',
                filename: 'test.txt',
                content: 'content',
                // orgId not provided
            });

            // Assert
            expect(documentRepository.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    organizationId: 'org-456', // From project
                })
            );
        });
    });

    describe('list', () => {
        it('should return list of documents without filters', async () => {
            // Arrange
            dataSource.query.mockResolvedValue([mockDocumentRow]);

            // Act
            const result = await service.list(100);

            // Assert
            expect(result.items).toHaveLength(1);
            expect(result.items[0].id).toBe('doc-123');
            expect(result.nextCursor).toBeNull();
            expect(dataSource.query).toHaveBeenCalledWith(
                expect.stringContaining('LIMIT $1'),
                [101] // limit + 1 for pagination check
            );
        });

        it('should filter by orgId', async () => {
            // Arrange
            dataSource.query.mockResolvedValue([mockDocumentRow]);

            // Act
            await service.list(100, undefined, { orgId: 'org-456' });

            // Assert
            expect(dataSource.query).toHaveBeenCalledWith(
                expect.stringContaining('d.organization_id = $2'),
                [101, 'org-456']
            );
        });

        it('should filter by projectId', async () => {
            // Arrange
            dataSource.query.mockResolvedValue([mockDocumentRow]);

            // Act
            await service.list(100, undefined, { projectId: 'proj-789' });

            // Assert
            expect(dataSource.query).toHaveBeenCalledWith(
                expect.stringContaining('d.project_id = $2'),
                [101, 'proj-789']
            );
        });

        it('should filter by both orgId and projectId', async () => {
            // Arrange
            dataSource.query.mockResolvedValue([mockDocumentRow]);

            // Act
            await service.list(100, undefined, { orgId: 'org-456', projectId: 'proj-789' });

            // Assert
            expect(dataSource.query).toHaveBeenCalledWith(
                expect.stringContaining('d.organization_id = $2'),
                [101, 'org-456', 'proj-789']
            );
            expect(dataSource.query).toHaveBeenCalledWith(
                expect.stringContaining('d.project_id = $3'),
                [101, 'org-456', 'proj-789']
            );
        });

        it('should return empty array when no documents found', async () => {
            // Arrange
            dataSource.query.mockResolvedValue([]);

            // Act
            const result = await service.list(100);

            // Assert
            expect(result.items).toHaveLength(0);
            expect(result.nextCursor).toBeNull();
        });

        it('should handle cursor-based pagination', async () => {
            // Arrange
            const cursor = { createdAt: '2025-01-01T00:00:00Z', id: 'doc-100' };
            dataSource.query.mockResolvedValue([mockDocumentRow]);

            // Act
            await service.list(100, cursor);

            // Assert
            expect(dataSource.query).toHaveBeenCalledWith(
                expect.stringContaining('d.created_at < $2 OR (d.created_at = $2 AND d.id < $3)'),
                [101, '2025-01-01T00:00:00Z', 'doc-100']
            );
        });

        it('should return nextCursor when more documents available', async () => {
            // Arrange
            const manyRows = Array.from({ length: 101 }, (_, i) => ({
                ...mockDocumentRow,
                id: `doc-${i}`,
            }));
            dataSource.query.mockResolvedValue(manyRows);

            // Act
            const result = await service.list(100);

            // Assert
            expect(result.items).toHaveLength(100);
            expect(result.nextCursor).toBeTruthy();
            expect(typeof result.nextCursor).toBe('string');
        });

        it('should map extraction status correctly', async () => {
            // Arrange
            const rowWithStatus = {
                ...mockDocumentRow,
                extraction_status: 'processing',
                chunks: 5,
            };
            dataSource.query.mockResolvedValue([rowWithStatus]);

            // Act
            const result = await service.list(100);

            // Assert
            expect(result.items[0].extractionStatus).toBe('processing');
            expect(result.items[0].chunks).toBe(5);
        });
    });

    describe('delete', () => {
        it('should delete a document successfully', async () => {
            // Arrange
            documentRepository.delete.mockResolvedValue({ affected: 1, raw: {} });

            // Act
            const result = await service.delete('doc-123');

            // Assert
            expect(result).toBe(true);
            expect(documentRepository.delete).toHaveBeenCalledWith('doc-123');
        });

        it('should return false when document not found', async () => {
            // Arrange
            documentRepository.delete.mockResolvedValue({ affected: 0, raw: {} });

            // Act
            const result = await service.delete('nonexistent-id');

            // Assert
            expect(result).toBe(false);
            expect(documentRepository.delete).toHaveBeenCalledWith('nonexistent-id');
        });

        it('should handle undefined affected count', async () => {
            // Arrange
            documentRepository.delete.mockResolvedValue({ affected: undefined, raw: {} });

            // Act
            const result = await service.delete('doc-123');

            // Assert
            expect(result).toBe(false);
        });
    });

    describe('getProjectOrg', () => {
        it('should return organization ID for valid project', async () => {
            // Arrange
            projectRepository.findOne.mockResolvedValue(mockProject as any);

            // Act
            const result = await service.getProjectOrg('proj-789');

            // Assert
            expect(result).toBe('org-456');
            expect(projectRepository.findOne).toHaveBeenCalledWith({
                where: { id: 'proj-789' },
                select: ['organizationId'],
            });
        });

        it('should return null when project not found', async () => {
            // Arrange
            projectRepository.findOne.mockResolvedValue(null);

            // Act
            const result = await service.getProjectOrg('invalid-project');

            // Assert
            expect(result).toBeNull();
        });
    });

    describe('decodeCursor', () => {
        it('should decode valid cursor', () => {
            // Arrange
            const cursor = Buffer.from(
                JSON.stringify({ createdAt: '2025-01-01T00:00:00Z', id: 'doc-123' })
            ).toString('base64url');

            // Act
            const result = service.decodeCursor(cursor);

            // Assert
            expect(result).toEqual({
                createdAt: '2025-01-01T00:00:00Z',
                id: 'doc-123',
            });
        });

        it('should return undefined for invalid cursor', () => {
            // Act
            const result = service.decodeCursor('invalid-cursor');

            // Assert
            expect(result).toBeUndefined();
        });

        it('should return undefined for cursor without required fields', () => {
            // Arrange
            const cursor = Buffer.from(JSON.stringify({ onlyId: 'doc-123' })).toString('base64url');

            // Act
            const result = service.decodeCursor(cursor);

            // Assert
            expect(result).toBeUndefined();
        });

        it('should return undefined when cursor is undefined', () => {
            // Act
            const result = service.decodeCursor(undefined);

            // Assert
            expect(result).toBeUndefined();
        });
    });

    describe('getCount', () => {
        it('should return document count', async () => {
            // Arrange
            documentRepository.count.mockResolvedValue(42);

            // Act
            const result = await service.getCount();

            // Assert
            expect(result).toBe(42);
            expect(documentRepository.count).toHaveBeenCalled();
        });

        it('should return zero when no documents', async () => {
            // Arrange
            documentRepository.count.mockResolvedValue(0);

            // Act
            const result = await service.getCount();

            // Assert
            expect(result).toBe(0);
        });
    });

    describe('findByIdWithChunks', () => {
        it('should return document with chunks', async () => {
            // Arrange
            const docWithChunks = {
                ...mockDocument,
                chunks: [
                    { id: 'chunk-1', text: 'chunk 1' },
                    { id: 'chunk-2', text: 'chunk 2' },
                ],
            };
            documentRepository.findOne.mockResolvedValue(docWithChunks as any);

            // Act
            const result = await service.findByIdWithChunks('doc-123');

            // Assert
            expect(result).toBeDefined();
            expect(result?.id).toBe('doc-123');
            expect(result?.chunks).toHaveLength(2);
            expect(documentRepository.findOne).toHaveBeenCalledWith({
                where: { id: 'doc-123' },
                relations: ['chunks'],
            });
        });

        it('should return null when document not found', async () => {
            // Arrange
            documentRepository.findOne.mockResolvedValue(null);

            // Act
            const result = await service.findByIdWithChunks('nonexistent-id');

            // Assert
            expect(result).toBeNull();
        });
    });

    describe('findRecent', () => {
        it('should return recent documents with default limit', async () => {
            // Arrange
            const queryBuilder = {
                leftJoinAndSelect: vi.fn().mockReturnThis(),
                orderBy: vi.fn().mockReturnThis(),
                take: vi.fn().mockReturnThis(),
                getMany: vi.fn().mockResolvedValue([mockDocument]),
            };
            documentRepository.createQueryBuilder.mockReturnValue(queryBuilder as any);

            // Act
            const result = await service.findRecent();

            // Assert
            expect(result).toHaveLength(1);
            expect(result[0].id).toBe('doc-123');
            expect(queryBuilder.leftJoinAndSelect).toHaveBeenCalledWith('doc.chunks', 'chunk');
            expect(queryBuilder.orderBy).toHaveBeenCalledWith('doc.createdAt', 'DESC');
            expect(queryBuilder.take).toHaveBeenCalledWith(10);
        });

        it('should respect custom limit', async () => {
            // Arrange
            const queryBuilder = {
                leftJoinAndSelect: vi.fn().mockReturnThis(),
                orderBy: vi.fn().mockReturnThis(),
                take: vi.fn().mockReturnThis(),
                getMany: vi.fn().mockResolvedValue([]),
            };
            documentRepository.createQueryBuilder.mockReturnValue(queryBuilder as any);

            // Act
            await service.findRecent(25);

            // Assert
            expect(queryBuilder.take).toHaveBeenCalledWith(25);
        });

        it('should return empty array when no documents', async () => {
            // Arrange
            const queryBuilder = {
                leftJoinAndSelect: vi.fn().mockReturnThis(),
                orderBy: vi.fn().mockReturnThis(),
                take: vi.fn().mockReturnThis(),
                getMany: vi.fn().mockResolvedValue([]),
            };
            documentRepository.createQueryBuilder.mockReturnValue(queryBuilder as any);

            // Act
            const result = await service.findRecent();

            // Assert
            expect(result).toHaveLength(0);
        });
    });
});
