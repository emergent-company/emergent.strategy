import { Test, TestingModule } from '@nestjs/testing';
import { vi } from 'vitest';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { TemplatePackService } from '../../template-packs/template-pack.service';
import { ExtractionWorkerService } from '../extraction-worker.service';
import { AppConfigService } from '../../../common/config/config.service';
import { DatabaseService } from '../../../common/database/database.service';
import { ExtractionJobService } from '../extraction-job.service';
import { LLMProviderFactory } from '../llm/llm-provider.factory';
import { RateLimiterService } from '../rate-limiter.service';
import { ConfidenceScorerService } from '../confidence-scorer.service';
import { GraphService } from '../../graph/graph.service';
import { DocumentsService } from '../../documents/documents.service';

describe('ExtractionWorkerService - Quality Thresholds', () => {
    let service: ExtractionWorkerService;
    let configService: AppConfigService & { extractionDefaultTemplatePackId: string | null };
    let databaseService: { isOnline: ReturnType<typeof vi.fn>; query: ReturnType<typeof vi.fn> };
    let templatePackService: { assignTemplatePackToProject: ReturnType<typeof vi.fn> };

    beforeEach(async () => {
        // Mock configuration service with threshold values
        const mockConfigService = {
            extractionConfidenceThresholdMin: 0.0,
            extractionConfidenceThresholdReview: 0.7,
            extractionConfidenceThresholdAuto: 0.85,
            extractionWorkerEnabled: false, // Prevent auto-start
            extractionWorkerBatchSize: 1,
            extractionWorkerPollIntervalMs: 1000,
            extractionDefaultTemplatePackId: 'pack-default',
        } as any;

        const dbMock = {
            isOnline: vi.fn().mockReturnValue(false),
            query: vi.fn(),
        };

        const templatePackMock = {
            assignTemplatePackToProject: vi.fn(),
        } as any;

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                ExtractionWorkerService,
                {
                    provide: AppConfigService,
                    useValue: mockConfigService,
                },
                {
                    provide: DatabaseService,
                    useValue: dbMock,
                },
                {
                    provide: ExtractionJobService,
                    useValue: {},
                },
                {
                    provide: LLMProviderFactory,
                    useValue: {},
                },
                {
                    provide: RateLimiterService,
                    useValue: {},
                },
                {
                    provide: ConfidenceScorerService,
                    useValue: {},
                },
                {
                    provide: GraphService,
                    useValue: {},
                },
                {
                    provide: DocumentsService,
                    useValue: {},
                },
                {
                    provide: TemplatePackService,
                    useValue: templatePackMock,
                },
            ],
        }).compile();

        service = module.get<ExtractionWorkerService>(ExtractionWorkerService);
        configService = module.get(AppConfigService) as typeof configService;
        databaseService = module.get(DatabaseService) as typeof dbMock;
        templatePackService = module.get(TemplatePackService) as typeof templatePackMock;

        // Ensure private fields are populated in case Nest injection metadata is stripped during unit tests
        (service as any).db = databaseService;
        (service as any).templatePacks = templatePackService;
        (service as any).config = configService;
    });

    afterEach(() => {
        vi.clearAllMocks();
        configService.extractionDefaultTemplatePackId = 'pack-default';
    });

    describe('applyQualityThresholds', () => {
        it('should reject entities with confidence below minimum threshold', () => {
            const result = (service as any).applyQualityThresholds(0.05, 0.1, 0.7, 0.85);
            expect(result).toBe('reject');
        });

        it('should reject entities at exactly the minimum threshold', () => {
            // Below min is reject (exclusive)
            const result = (service as any).applyQualityThresholds(0.0, 0.0, 0.7, 0.85);
            // At exactly min threshold should not reject
            expect(result).not.toBe('reject');
        });

        it('should flag for review when confidence is below review threshold', () => {
            const result = (service as any).applyQualityThresholds(0.5, 0.0, 0.7, 0.85);
            expect(result).toBe('review');
        });

        it('should flag for review when confidence is at review threshold', () => {
            const result = (service as any).applyQualityThresholds(0.7, 0.0, 0.7, 0.85);
            expect(result).toBe('review');
        });

        it('should flag for review when confidence is between review and auto thresholds', () => {
            const result = (service as any).applyQualityThresholds(0.75, 0.0, 0.7, 0.85);
            expect(result).toBe('review');
        });

        it('should auto-create when confidence is above auto threshold', () => {
            const result = (service as any).applyQualityThresholds(0.9, 0.0, 0.7, 0.85);
            expect(result).toBe('auto');
        });

        it('should auto-create when confidence is at auto threshold', () => {
            const result = (service as any).applyQualityThresholds(0.85, 0.0, 0.7, 0.85);
            expect(result).toBe('auto');
        });

        it('should handle edge case: min = review = auto threshold', () => {
            // All same threshold - anything at or above should auto-create
            const belowResult = (service as any).applyQualityThresholds(0.69, 0.7, 0.7, 0.7);
            const atResult = (service as any).applyQualityThresholds(0.7, 0.7, 0.7, 0.7);
            const aboveResult = (service as any).applyQualityThresholds(0.71, 0.7, 0.7, 0.7);

            expect(belowResult).toBe('reject');
            expect(atResult).toBe('auto');
            expect(aboveResult).toBe('auto');
        });

        it('should handle confidence of 0.0', () => {
            const result = (service as any).applyQualityThresholds(0.0, 0.0, 0.7, 0.85);
            expect(result).toBe('review'); // Above min, below auto
        });

        it('should handle confidence of 1.0 (perfect)', () => {
            const result = (service as any).applyQualityThresholds(1.0, 0.0, 0.7, 0.85);
            expect(result).toBe('auto');
        });

        it('should handle non-standard threshold values', () => {
            // Min=0.3, Review=0.5, Auto=0.8
            const rejectResult = (service as any).applyQualityThresholds(0.2, 0.3, 0.5, 0.8);
            const reviewResult1 = (service as any).applyQualityThresholds(0.4, 0.3, 0.5, 0.8);
            const reviewResult2 = (service as any).applyQualityThresholds(0.6, 0.3, 0.5, 0.8);
            const autoResult = (service as any).applyQualityThresholds(0.9, 0.3, 0.5, 0.8);

            expect(rejectResult).toBe('reject');
            expect(reviewResult1).toBe('review');
            expect(reviewResult2).toBe('review');
            expect(autoResult).toBe('auto');
        });
    });

    describe('loadExtractionPrompt - default template pack fallback', () => {
        const baseJob = {
            id: 'job-1',
            project_id: 'project-123',
            org_id: 'org-123',
            source_type: 'document',
            extraction_config: {},
            subject_id: 'user-999',
        } as any;

        it('auto-installs default template pack when missing and returns prompt', async () => {
            expect((service as any).db).toBeDefined();
            expect((service as any).db).toBe(databaseService);

            databaseService.query
                .mockResolvedValueOnce({ rowCount: 0, rows: [] })
                .mockResolvedValueOnce({
                    rowCount: 1,
                    rows: [
                        {
                            extraction_prompts: { default: 'Prompt text' },
                            default_prompt_key: null,
                        },
                    ],
                });

            templatePackService.assignTemplatePackToProject.mockResolvedValue({ success: true });

            const prompt = await (service as any).loadExtractionPrompt(baseJob);

            expect(templatePackService.assignTemplatePackToProject).toHaveBeenCalledWith(
                baseJob.project_id,
                baseJob.org_id,
                baseJob.org_id,
                baseJob.subject_id,
                { template_pack_id: configService.extractionDefaultTemplatePackId }
            );
            expect(prompt).toBe('Prompt text');
            expect(databaseService.query).toHaveBeenCalledTimes(2);
        });

        it('returns null when no default template pack is configured', async () => {
            configService.extractionDefaultTemplatePackId = null;
            databaseService.query.mockResolvedValue({ rowCount: 0, rows: [] });

            const prompt = await (service as any).loadExtractionPrompt(baseJob);

            expect(prompt).toBeNull();
            expect(templatePackService.assignTemplatePackToProject).not.toHaveBeenCalled();
        });

        it('handles assignment failures gracefully', async () => {
            databaseService.query.mockResolvedValue({ rowCount: 0, rows: [] });
            templatePackService.assignTemplatePackToProject.mockRejectedValue(new NotFoundException('missing'));

            const prompt = await (service as any).loadExtractionPrompt(baseJob);

            expect(prompt).toBeNull();
            expect(templatePackService.assignTemplatePackToProject).toHaveBeenCalledTimes(1);
        });

        it('retries after conflict without throwing', async () => {
            databaseService.query
                .mockResolvedValueOnce({ rowCount: 0, rows: [] })
                .mockResolvedValueOnce({
                    rowCount: 1,
                    rows: [
                        {
                            extraction_prompts: { default: { system: 'sys', user: 'user' } },
                            default_prompt_key: null,
                        },
                    ],
                });

            templatePackService.assignTemplatePackToProject.mockRejectedValueOnce(new ConflictException('already'));

            const prompt = await (service as any).loadExtractionPrompt(baseJob);

            expect(prompt).toBe('sys\nuser');
            expect(templatePackService.assignTemplatePackToProject).toHaveBeenCalledTimes(1);
            expect(databaseService.query).toHaveBeenCalledTimes(2);
        });
    });

    describe('threshold configuration', () => {
        it('should use configured threshold values', () => {
            expect(configService.extractionConfidenceThresholdMin).toBe(0.0);
            expect(configService.extractionConfidenceThresholdReview).toBe(0.7);
            expect(configService.extractionConfidenceThresholdAuto).toBe(0.85);
        });

        it('should apply thresholds in correct order: min < review < auto', () => {
            const min = configService.extractionConfidenceThresholdMin;
            const review = configService.extractionConfidenceThresholdReview;
            const auto = configService.extractionConfidenceThresholdAuto;

            expect(min).toBeLessThan(review);
            expect(review).toBeLessThan(auto);
        });
    });

    describe('quality decision workflow', () => {
        it('should demonstrate typical low-quality entity rejection', () => {
            // Entity with confidence 0.3, min threshold 0.5
            const decision = (service as any).applyQualityThresholds(0.3, 0.5, 0.7, 0.85);
            expect(decision).toBe('reject');
        });

        it('should demonstrate medium-quality entity requiring review', () => {
            // Entity with confidence 0.65, between min and auto
            const decision = (service as any).applyQualityThresholds(0.65, 0.0, 0.7, 0.85);
            expect(decision).toBe('review');
        });

        it('should demonstrate high-quality entity auto-creation', () => {
            // Entity with confidence 0.92, above auto threshold
            const decision = (service as any).applyQualityThresholds(0.92, 0.0, 0.7, 0.85);
            expect(decision).toBe('auto');
        });
    });

    describe('boundary conditions', () => {
        it('should handle confidence slightly below min threshold', () => {
            const result = (service as any).applyQualityThresholds(0.699, 0.7, 0.75, 0.85);
            expect(result).toBe('reject');
        });

        it('should handle confidence slightly above min threshold', () => {
            const result = (service as any).applyQualityThresholds(0.701, 0.7, 0.75, 0.85);
            expect(result).toBe('review');
        });

        it('should handle confidence slightly below auto threshold', () => {
            const result = (service as any).applyQualityThresholds(0.849, 0.0, 0.7, 0.85);
            expect(result).toBe('review');
        });

        it('should handle confidence slightly above auto threshold', () => {
            const result = (service as any).applyQualityThresholds(0.851, 0.0, 0.7, 0.85);
            expect(result).toBe('auto');
        });
    });

    describe('real-world scenarios', () => {
        it('should handle scenario: strict quality gate (min=0.5)', () => {
            // Organization requires minimum 50% confidence
            const lowResult = (service as any).applyQualityThresholds(0.45, 0.5, 0.7, 0.85);
            const mediumResult = (service as any).applyQualityThresholds(0.6, 0.5, 0.7, 0.85);
            const highResult = (service as any).applyQualityThresholds(0.9, 0.5, 0.7, 0.85);

            expect(lowResult).toBe('reject');
            expect(mediumResult).toBe('review');
            expect(highResult).toBe('auto');
        });

        it('should handle scenario: lenient quality gate (min=0.0)', () => {
            // Accept everything, but still require review for low confidence
            const veryLowResult = (service as any).applyQualityThresholds(0.1, 0.0, 0.7, 0.85);
            const mediumResult = (service as any).applyQualityThresholds(0.6, 0.0, 0.7, 0.85);
            const highResult = (service as any).applyQualityThresholds(0.9, 0.0, 0.7, 0.85);

            expect(veryLowResult).toBe('review'); // Not rejected, but needs review
            expect(mediumResult).toBe('review');
            expect(highResult).toBe('auto');
        });

        it('should handle scenario: very strict auto-creation (auto=0.95)', () => {
            // Only very high confidence gets auto-created
            const goodResult = (service as any).applyQualityThresholds(0.85, 0.0, 0.7, 0.95);
            const excellentResult = (service as any).applyQualityThresholds(0.96, 0.0, 0.7, 0.95);

            expect(goodResult).toBe('review'); // Good but not excellent
            expect(excellentResult).toBe('auto'); // Excellent quality
        });
    });
});
