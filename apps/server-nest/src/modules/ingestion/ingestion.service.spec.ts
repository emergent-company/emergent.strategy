import { Test, TestingModule } from '@nestjs/testing';
import { IngestionService } from './ingestion.service';
import { VectorService } from '../vector/vector.service';
import { DocumentsService } from '../documents/documents.service';
import { ExtractionJobService } from '../extraction-jobs/extraction-job.service';

describe('IngestionService - Auto-Extraction', () => {
    let service: IngestionService;
    let extractionJobService: ExtractionJobService;

    const mockVectorService = {
        generateEmbedding: jest.fn(),
        storeChunks: jest.fn(),
    };

    const mockDocumentsService = {
        query: jest.fn(),
        insert: jest.fn(),
    };

    const mockExtractionJobService = {
        createJob: jest.fn(),
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                IngestionService,
                {
                    provide: VectorService,
                    useValue: mockVectorService,
                },
                {
                    provide: DocumentsService,
                    useValue: mockDocumentsService,
                },
                {
                    provide: ExtractionJobService,
                    useValue: mockExtractionJobService,
                },
            ],
        }).compile();

        service = module.get<IngestionService>(IngestionService);
        extractionJobService = module.get<ExtractionJobService>(ExtractionJobService);

        // Reset mocks
        jest.clearAllMocks();
    });

    describe('shouldAutoExtract', () => {
        it('should return null when project does not exist', async () => {
            jest.spyOn(service as any, 'query').mockResolvedValue([]);

            const result = await (service as any).shouldAutoExtract('project-123');

            expect(result).toBeNull();
        });

        it('should return null when auto_extract_objects is false', async () => {
            jest.spyOn(service as any, 'query').mockResolvedValue([
                {
                    auto_extract_objects: false,
                    auto_extract_config: { enabled: true },
                },
            ]);

            const result = await (service as any).shouldAutoExtract('project-123');

            expect(result).toBeNull();
        });

        it('should return config when auto_extract_objects is true', async () => {
            const config = {
                enabled_types: ['Requirement', 'Decision'],
                min_confidence: 0.75,
                require_review: false,
                notify_on_complete: true,
            };

            jest.spyOn(service as any, 'query').mockResolvedValue([
                {
                    auto_extract_objects: true,
                    auto_extract_config: config,
                },
            ]);

            const result = await (service as any).shouldAutoExtract('project-123');

            expect(result).toEqual({ enabled: true, ...config });
        });
    });

    describe('ingestText - Auto-Extraction Integration', () => {
        const mockOrgId = 'org-123';
        const mockProjectId = 'project-123';
        const mockDocumentId = 'doc-123';
        const mockUserId = 'user-123';
        const mockText = 'Sample document text for testing';

        beforeEach(() => {
            // Mock document doesn't exist (new document)
            mockDocumentsService.query.mockResolvedValue([]);

            // Mock document insertion
            mockDocumentsService.insert.mockResolvedValue({
                id: mockDocumentId,
                name: 'test-doc.txt',
            });

            // Mock embedding generation
            mockVectorService.generateEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);

            // Mock chunk storage
            mockVectorService.storeChunks.mockResolvedValue(undefined);
        });

        it('should create extraction job when auto-extraction is enabled', async () => {
            const mockJobId = 'job-123';
            const extractionConfig = {
                enabled: true,
                enabled_types: null,
                min_confidence: 0.7,
                require_review: false,
                notify_on_complete: true,
            };

            // Mock auto-extraction enabled
            jest.spyOn(service as any, 'shouldAutoExtract').mockResolvedValue(extractionConfig);

            // Mock job creation
            mockExtractionJobService.createJob.mockResolvedValue({
                id: mockJobId,
                status: 'pending',
            });

            const result = await service.ingestText({
                org_id: mockOrgId,
                project_id: mockProjectId,
                document_id: mockDocumentId,
                name: 'test-doc.txt',
                text: mockText,
                metadata: {},
                user_id: mockUserId,
            });

            // Verify extraction job was created
            expect(mockExtractionJobService.createJob).toHaveBeenCalledWith({
                org_id: mockOrgId,
                project_id: mockProjectId,
                source_type: 'DOCUMENT',
                source_id: mockDocumentId,
                source_metadata: {
                    document_name: 'test-doc.txt',
                    ingested_by: mockUserId,
                },
                extraction_config: extractionConfig,
                user_id: mockUserId,
            });

            // Verify job ID is in result
            expect(result.extractionJobId).toBe(mockJobId);
        });

        it('should NOT create extraction job when auto-extraction is disabled', async () => {
            // Mock auto-extraction disabled
            jest.spyOn(service as any, 'shouldAutoExtract').mockResolvedValue(null);

            const result = await service.ingestText({
                org_id: mockOrgId,
                project_id: mockProjectId,
                document_id: mockDocumentId,
                name: 'test-doc.txt',
                text: mockText,
                metadata: {},
                user_id: mockUserId,
            });

            // Verify extraction job was NOT created
            expect(mockExtractionJobService.createJob).not.toHaveBeenCalled();

            // Verify no job ID in result
            expect(result.extractionJobId).toBeUndefined();
        });

        it('should gracefully handle extraction job creation failure', async () => {
            const extractionConfig = {
                enabled: true,
                enabled_types: null,
                min_confidence: 0.7,
            };

            // Mock auto-extraction enabled
            jest.spyOn(service as any, 'shouldAutoExtract').mockResolvedValue(extractionConfig);

            // Mock job creation failure
            mockExtractionJobService.createJob.mockRejectedValue(
                new Error('Job creation failed'),
            );

            // Mock logger to verify error logging
            const loggerSpy = jest.spyOn(service['logger'], 'error');

            // Should NOT throw error, ingestion should continue
            const result = await service.ingestText({
                org_id: mockOrgId,
                project_id: mockProjectId,
                document_id: mockDocumentId,
                name: 'test-doc.txt',
                text: mockText,
                metadata: {},
                user_id: mockUserId,
            });

            // Verify error was logged
            expect(loggerSpy).toHaveBeenCalledWith(
                'Failed to create extraction job after ingestion',
                expect.any(Error),
            );

            // Verify no job ID in result
            expect(result.extractionJobId).toBeUndefined();

            // Verify document was still ingested
            expect(result.documentId).toBe(mockDocumentId);
        });

        it('should include extraction config in job creation', async () => {
            const extractionConfig = {
                enabled: true,
                enabled_types: ['Requirement', 'Decision'],
                min_confidence: 0.85,
                require_review: true,
                notify_on_complete: true,
            };

            jest.spyOn(service as any, 'shouldAutoExtract').mockResolvedValue(extractionConfig);

            mockExtractionJobService.createJob.mockResolvedValue({
                id: 'job-123',
                status: 'pending',
            });

            await service.ingestText({
                org_id: mockOrgId,
                project_id: mockProjectId,
                document_id: mockDocumentId,
                name: 'test-doc.txt',
                text: mockText,
                metadata: {},
                user_id: mockUserId,
            });

            // Verify extraction config was passed to job
            expect(mockExtractionJobService.createJob).toHaveBeenCalledWith(
                expect.objectContaining({
                    extraction_config: extractionConfig,
                }),
            );
        });
    });
});
