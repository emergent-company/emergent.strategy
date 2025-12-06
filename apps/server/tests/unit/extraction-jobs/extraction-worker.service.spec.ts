import { Test, TestingModule } from '@nestjs/testing';
import { vi } from 'vitest';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { TemplatePackService } from '../../../src/modules/extraction-jobs/../template-packs/template-pack.service';
import { ExtractionWorkerService } from '../../../src/modules/extraction-jobs/extraction-worker.service';
import { AppConfigService } from '../../../src/common/config/config.service';
import { DatabaseService } from '../../../src/common/database/database.service';
import { ExtractionJobService } from '../../../src/modules/extraction-jobs/extraction-job.service';
import { LLMProviderFactory } from '../../../src/modules/extraction-jobs/llm/llm-provider.factory';
import { RateLimiterService } from '../../../src/modules/extraction-jobs/rate-limiter.service';
import { ConfidenceScorerService } from '../../../src/modules/extraction-jobs/confidence-scorer.service';
import { GraphService } from '../../../src/modules/extraction-jobs/../graph/graph.service';
import { DocumentsService } from '../../../src/modules/extraction-jobs/../documents/documents.service';
import { LangfuseService } from '../../../src/modules/langfuse/langfuse.service';

describe('ExtractionWorkerService - Quality Thresholds', () => {
  let service: ExtractionWorkerService;
  let configService: AppConfigService & {
    extractionDefaultTemplatePackId: string | null;
  };
  let databaseService: {
    isOnline: ReturnType<typeof vi.fn>;
    query: ReturnType<typeof vi.fn>;
    runWithTenantContext: ReturnType<typeof vi.fn>;
  };
  let templatePackService: {
    assignTemplatePackToProject: ReturnType<typeof vi.fn>;
    getProjectTemplatePacks: ReturnType<typeof vi.fn>;
  };

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
      extractionBasePrompt: 'Default base prompt', // Used as fallback when kb.settings is empty
    } as any;

    const dbMock = {
      isOnline: vi.fn().mockReturnValue(false),
      query: vi.fn(),
      runWithTenantContext: vi.fn(
        async (
          _org: string | null,
          _project: string | null,
          fn: () => Promise<any>
        ) => {
          return fn();
        }
      ),
    } as any;

    const templatePackMock = {
      assignTemplatePackToProject: vi.fn(),
      getProjectTemplatePacks: vi.fn().mockResolvedValue([]),
    } as any;

    const langfuseServiceMock = {
      createJobTrace: vi.fn(),
      finalizeTrace: vi.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExtractionWorkerService,
        {
          provide: AppConfigService,
          useValue: mockConfigService,
        },
        {
          provide: LangfuseService,
          useValue: langfuseServiceMock,
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
    templatePackService = module.get(
      TemplatePackService
    ) as typeof templatePackMock;

    // Ensure private fields are populated in case Nest injection metadata is stripped during unit tests
    (service as any).db = databaseService;
    (service as any).templatePacks = templatePackService;
    (service as any).config = configService;
  });

  afterEach(() => {
    vi.clearAllMocks();
    configService.extractionDefaultTemplatePackId = 'pack-default';
  });

  describe('recoverOrphanedJobs', () => {
    it('resets orphaned jobs using tenant context', async () => {
      // Phase 6: organization_id removed from object_extraction_jobs
      // Now we only have project_id on the job, and derive org_id from projects table
      const orphanJob = {
        id: 'job-orphan-1',
        source_type: 'document',
        started_at: '2025-10-16T15:59:53.465Z',
        project_id: 'project-123',
      };

      const orgId = 'org-123';

      databaseService.query
        // First call: SELECT orphaned jobs
        .mockResolvedValueOnce({ rowCount: 1, rows: [orphanJob] })
        // Second call: SELECT organization_id FROM projects WHERE id = project_id
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [{ organization_id: orgId }],
        })
        // Third call: UPDATE job within tenant context
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: orphanJob.id }] });

      databaseService.runWithTenantContext.mockImplementation(
        async (_project, fn) => fn()
      );

      await (service as any).recoverOrphanedJobs();

      expect(databaseService.runWithTenantContext).toHaveBeenCalledWith(
        orphanJob.project_id,
        expect.any(Function)
      );

      expect(databaseService.query).toHaveBeenCalledTimes(3);
      const updateQuery = databaseService.query.mock.calls[2][0];
      const updateParams = databaseService.query.mock.calls[2][1];

      expect(updateQuery).toContain('UPDATE kb.object_extraction_jobs');
      expect(updateQuery).toContain('started_at = NULL');
      expect(updateQuery).toContain('error_message = CASE');
      expect(updateQuery).toContain("ILIKE '%has been reset to queued.%'");
      expect(updateParams).toEqual([orphanJob.id]);
    });

    it('skips orphaned jobs without tenant context', async () => {
      // Phase 6: Jobs without project_id can't derive organization_id
      databaseService.query.mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            id: 'job-orphan-2',
            source_type: 'document',
            started_at: null,
            project_id: null,
          },
        ],
      });

      await (service as any).recoverOrphanedJobs();

      expect(databaseService.runWithTenantContext).not.toHaveBeenCalled();
      expect(databaseService.query).toHaveBeenCalledTimes(1);
    });

    it('skips job when organization_id cannot be derived from project', async () => {
      // Phase 6: organization_id is derived from projects table
      const orphanJob = {
        id: 'job-orphan-3',
        source_type: 'document',
        started_at: '2025-10-16T15:59:53.465Z',
        project_id: 'project-789',
      };

      databaseService.query
        // First call: SELECT orphaned jobs
        .mockResolvedValueOnce({ rowCount: 1, rows: [orphanJob] })
        // Second call: SELECT organization_id from projects - returns no rows (project not found)
        .mockResolvedValueOnce({ rowCount: 0, rows: [] });

      databaseService.runWithTenantContext.mockImplementation(
        async (_org, _project, fn) => fn()
      );

      await (service as any).recoverOrphanedJobs();

      // Should NOT call runWithTenantContext when organization_id cannot be derived
      expect(databaseService.runWithTenantContext).not.toHaveBeenCalled();
    });
  });

  describe('applyQualityThresholds', () => {
    it('should reject entities with confidence below minimum threshold', () => {
      const result = (service as any).applyQualityThresholds(
        0.05,
        0.1,
        0.7,
        0.85
      );
      expect(result).toBe('reject');
    });

    it('should reject entities at exactly the minimum threshold', () => {
      // Below min is reject (exclusive)
      const result = (service as any).applyQualityThresholds(
        0.0,
        0.0,
        0.7,
        0.85
      );
      // At exactly min threshold should not reject
      expect(result).not.toBe('reject');
    });

    it('should flag for review when confidence is below review threshold', () => {
      const result = (service as any).applyQualityThresholds(
        0.5,
        0.0,
        0.7,
        0.85
      );
      expect(result).toBe('review');
    });

    it('should flag for review when confidence is at review threshold', () => {
      const result = (service as any).applyQualityThresholds(
        0.7,
        0.0,
        0.7,
        0.85
      );
      expect(result).toBe('review');
    });

    it('should flag for review when confidence is between review and auto thresholds', () => {
      const result = (service as any).applyQualityThresholds(
        0.75,
        0.0,
        0.7,
        0.85
      );
      expect(result).toBe('review');
    });

    it('should auto-create when confidence is above auto threshold', () => {
      const result = (service as any).applyQualityThresholds(
        0.9,
        0.0,
        0.7,
        0.85
      );
      expect(result).toBe('auto');
    });

    it('should auto-create when confidence is at auto threshold', () => {
      const result = (service as any).applyQualityThresholds(
        0.85,
        0.0,
        0.7,
        0.85
      );
      expect(result).toBe('auto');
    });

    it('should handle edge case: min = review = auto threshold', () => {
      // All same threshold - anything at or above should auto-create
      const belowResult = (service as any).applyQualityThresholds(
        0.69,
        0.7,
        0.7,
        0.7
      );
      const atResult = (service as any).applyQualityThresholds(
        0.7,
        0.7,
        0.7,
        0.7
      );
      const aboveResult = (service as any).applyQualityThresholds(
        0.71,
        0.7,
        0.7,
        0.7
      );

      expect(belowResult).toBe('reject');
      expect(atResult).toBe('auto');
      expect(aboveResult).toBe('auto');
    });

    it('should handle confidence of 0.0', () => {
      const result = (service as any).applyQualityThresholds(
        0.0,
        0.0,
        0.7,
        0.85
      );
      expect(result).toBe('review'); // Above min, below auto
    });

    it('should handle confidence of 1.0 (perfect)', () => {
      const result = (service as any).applyQualityThresholds(
        1.0,
        0.0,
        0.7,
        0.85
      );
      expect(result).toBe('auto');
    });

    it('should handle non-standard threshold values', () => {
      // Min=0.3, Review=0.5, Auto=0.8
      const rejectResult = (service as any).applyQualityThresholds(
        0.2,
        0.3,
        0.5,
        0.8
      );
      const reviewResult1 = (service as any).applyQualityThresholds(
        0.4,
        0.3,
        0.5,
        0.8
      );
      const reviewResult2 = (service as any).applyQualityThresholds(
        0.6,
        0.3,
        0.5,
        0.8
      );
      const autoResult = (service as any).applyQualityThresholds(
        0.9,
        0.3,
        0.5,
        0.8
      );

      expect(rejectResult).toBe('reject');
      expect(reviewResult1).toBe('review');
      expect(reviewResult2).toBe('review');
      expect(autoResult).toBe('auto');
    });
  });

  describe('loadExtractionConfig - default template pack fallback', () => {
    const baseJob = {
      id: 'job-1',
      project_id: 'project-123',
      organization_id: 'org-123',
      source_type: 'document',
      extraction_config: {},
      subject_id: 'user-999',
    } as any;

    it('auto-installs default template pack when missing and returns prompt', async () => {
      expect((service as any).db).toBeDefined();
      expect((service as any).db).toBe(databaseService);

      // First call: no packs
      // Second call: returns the installed pack
      templatePackService.getProjectTemplatePacks
        .mockResolvedValueOnce([]) // First call: no packs
        .mockResolvedValueOnce([
          {
            id: 'assignment-1',
            active: true,
            template_pack: {
              id: 'pack-default',
              name: 'Default Pack',
              extraction_prompts: { default: 'Prompt text' },
              object_type_schemas: {},
              default_prompt_key: null,
            },
          },
        ]); // After install

      // First query: getOrganizationId from projects table
      // Second query: base prompt from kb.settings
      databaseService.query
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [{ organization_id: baseJob.organization_id }],
        })
        .mockResolvedValueOnce({ rowCount: 0, rows: [] });

      templatePackService.assignTemplatePackToProject.mockResolvedValue({
        success: true,
      });

      const result = await (service as any).loadExtractionConfig(baseJob);

      expect(
        templatePackService.assignTemplatePackToProject
      ).toHaveBeenCalledWith(
        baseJob.project_id,
        baseJob.organization_id,
        baseJob.subject_id,
        { template_pack_id: configService.extractionDefaultTemplatePackId }
      );
      // basePrompt comes from config.extractionBasePrompt when kb.settings is empty
      expect(result.prompt).toBe('Default base prompt');
      expect(result.objectSchemas).toBeDefined();
      expect(databaseService.query).toHaveBeenCalledTimes(2);
    });

    it('returns null when no default template pack is configured', async () => {
      configService.extractionDefaultTemplatePackId = null;
      // First query: getOrganizationId from projects table
      // Second query: base prompt from kb.settings
      databaseService.query
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [{ organization_id: baseJob.organization_id }],
        })
        .mockResolvedValueOnce({ rowCount: 0, rows: [] });

      const result = await (service as any).loadExtractionConfig(baseJob);

      expect(result.prompt).toBeNull();
      expect(result.objectSchemas).toEqual({});
      expect(
        templatePackService.assignTemplatePackToProject
      ).not.toHaveBeenCalled();
    });

    it('handles assignment failures gracefully', async () => {
      // First query: getOrganizationId from projects table
      // Second query: base prompt from kb.settings (not reached due to error)
      databaseService.query.mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ organization_id: baseJob.organization_id }],
      });
      templatePackService.assignTemplatePackToProject.mockRejectedValue(
        new NotFoundException('missing')
      );

      const result = await (service as any).loadExtractionConfig(baseJob);

      expect(result.prompt).toBeNull();
      expect(result.objectSchemas).toEqual({});
      expect(
        templatePackService.assignTemplatePackToProject
      ).toHaveBeenCalledTimes(1);
    });

    it('retries after conflict without throwing', async () => {
      // First call: no packs
      // Second call: returns the installed pack (after ConflictException is caught)
      templatePackService.getProjectTemplatePacks
        .mockResolvedValueOnce([]) // First call: no packs
        .mockResolvedValueOnce([
          {
            id: 'assignment-1',
            active: true,
            template_pack: {
              id: 'pack-default',
              name: 'Default Pack',
              extraction_prompts: { default: { system: 'sys', user: 'user' } },
              object_type_schemas: {},
              default_prompt_key: null,
            },
          },
        ]); // After conflict handled

      // First query: getOrganizationId from projects table
      // Second query: base prompt from kb.settings
      databaseService.query
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [{ organization_id: baseJob.organization_id }],
        })
        .mockResolvedValueOnce({ rowCount: 0, rows: [] });

      templatePackService.assignTemplatePackToProject.mockRejectedValueOnce(
        new ConflictException('already')
      );

      const result = await (service as any).loadExtractionConfig(baseJob);

      // basePrompt comes from config.extractionBasePrompt when kb.settings is empty
      expect(result.prompt).toBe('Default base prompt');
      expect(result.objectSchemas).toBeDefined();
      expect(
        templatePackService.assignTemplatePackToProject
      ).toHaveBeenCalledTimes(1);
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
      const decision = (service as any).applyQualityThresholds(
        0.3,
        0.5,
        0.7,
        0.85
      );
      expect(decision).toBe('reject');
    });

    it('should demonstrate medium-quality entity requiring review', () => {
      // Entity with confidence 0.65, between min and auto
      const decision = (service as any).applyQualityThresholds(
        0.65,
        0.0,
        0.7,
        0.85
      );
      expect(decision).toBe('review');
    });

    it('should demonstrate high-quality entity auto-creation', () => {
      // Entity with confidence 0.92, above auto threshold
      const decision = (service as any).applyQualityThresholds(
        0.92,
        0.0,
        0.7,
        0.85
      );
      expect(decision).toBe('auto');
    });
  });

  describe('boundary conditions', () => {
    it('should handle confidence slightly below min threshold', () => {
      const result = (service as any).applyQualityThresholds(
        0.699,
        0.7,
        0.75,
        0.85
      );
      expect(result).toBe('reject');
    });

    it('should handle confidence slightly above min threshold', () => {
      const result = (service as any).applyQualityThresholds(
        0.701,
        0.7,
        0.75,
        0.85
      );
      expect(result).toBe('review');
    });

    it('should handle confidence slightly below auto threshold', () => {
      const result = (service as any).applyQualityThresholds(
        0.849,
        0.0,
        0.7,
        0.85
      );
      expect(result).toBe('review');
    });

    it('should handle confidence slightly above auto threshold', () => {
      const result = (service as any).applyQualityThresholds(
        0.851,
        0.0,
        0.7,
        0.85
      );
      expect(result).toBe('auto');
    });
  });

  describe('real-world scenarios', () => {
    it('should handle scenario: strict quality gate (min=0.5)', () => {
      // Organization requires minimum 50% confidence
      const lowResult = (service as any).applyQualityThresholds(
        0.45,
        0.5,
        0.7,
        0.85
      );
      const mediumResult = (service as any).applyQualityThresholds(
        0.6,
        0.5,
        0.7,
        0.85
      );
      const highResult = (service as any).applyQualityThresholds(
        0.9,
        0.5,
        0.7,
        0.85
      );

      expect(lowResult).toBe('reject');
      expect(mediumResult).toBe('review');
      expect(highResult).toBe('auto');
    });

    it('should handle scenario: lenient quality gate (min=0.0)', () => {
      // Accept everything, but still require review for low confidence
      const veryLowResult = (service as any).applyQualityThresholds(
        0.1,
        0.0,
        0.7,
        0.85
      );
      const mediumResult = (service as any).applyQualityThresholds(
        0.6,
        0.0,
        0.7,
        0.85
      );
      const highResult = (service as any).applyQualityThresholds(
        0.9,
        0.0,
        0.7,
        0.85
      );

      expect(veryLowResult).toBe('review'); // Not rejected, but needs review
      expect(mediumResult).toBe('review');
      expect(highResult).toBe('auto');
    });

    it('should handle scenario: very strict auto-creation (auto=0.95)', () => {
      // Only very high confidence gets auto-created
      const goodResult = (service as any).applyQualityThresholds(
        0.85,
        0.0,
        0.7,
        0.95
      );
      const excellentResult = (service as any).applyQualityThresholds(
        0.96,
        0.0,
        0.7,
        0.95
      );

      expect(goodResult).toBe('review'); // Good but not excellent
      expect(excellentResult).toBe('auto'); // Excellent quality
    });
  });
});

describe('ExtractionWorkerService - Relationship Processing', () => {
  let service: ExtractionWorkerService;
  let databaseService: {
    isOnline: ReturnType<typeof vi.fn>;
    query: ReturnType<typeof vi.fn>;
    runWithTenantContext: ReturnType<typeof vi.fn>;
  };
  let graphService: {
    createRelationship: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    const mockConfigService = {
      extractionConfidenceThresholdMin: 0.0,
      extractionConfidenceThresholdReview: 0.7,
      extractionConfidenceThresholdAuto: 0.85,
      extractionWorkerEnabled: false,
      extractionWorkerBatchSize: 1,
      extractionWorkerPollIntervalMs: 1000,
      extractionDefaultTemplatePackId: 'pack-default',
      extractionBasePrompt: 'Default base prompt',
    } as any;

    const dbMock = {
      isOnline: vi.fn().mockReturnValue(false),
      query: vi.fn(),
      runWithTenantContext: vi.fn(
        async (_project: string | null, fn: () => Promise<any>) => {
          return fn();
        }
      ),
    } as any;

    const templatePackMock = {
      assignTemplatePackToProject: vi.fn(),
      getProjectTemplatePacks: vi.fn().mockResolvedValue([]),
    } as any;

    const langfuseServiceMock = {
      createJobTrace: vi.fn(),
      finalizeTrace: vi.fn(),
    } as any;

    const graphServiceMock = {
      createRelationship: vi.fn().mockResolvedValue({ id: 'rel-123' }),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExtractionWorkerService,
        {
          provide: AppConfigService,
          useValue: mockConfigService,
        },
        {
          provide: LangfuseService,
          useValue: langfuseServiceMock,
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
          useValue: graphServiceMock,
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
    databaseService = module.get(DatabaseService) as typeof dbMock;
    graphService = module.get(GraphService) as typeof graphServiceMock;

    // Ensure private fields are populated
    (service as any).db = databaseService;
    (service as any).graphService = graphService;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('resolveEntityReference', () => {
    const projectId = 'project-123';

    it('should resolve entity by valid UUID', async () => {
      const validUuid = '550e8400-e29b-41d4-a716-446655440000';
      const batchEntityMap = new Map<string, string>();

      // Mock database to return the entity
      databaseService.query.mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: validUuid }],
      });

      const result = await (service as any).resolveEntityReference(
        { id: validUuid },
        batchEntityMap,
        projectId
      );

      expect(result).toBe(validUuid);
      expect(databaseService.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT id FROM kb.graph_objects'),
        [validUuid, projectId]
      );
    });

    it('should return null for invalid UUID format', async () => {
      const invalidUuid = 'not-a-valid-uuid';
      const batchEntityMap = new Map<string, string>();

      const result = await (service as any).resolveEntityReference(
        { id: invalidUuid },
        batchEntityMap,
        projectId
      );

      expect(result).toBeNull();
      // Should not query database for invalid UUID
      expect(databaseService.query).not.toHaveBeenCalled();
    });

    it('should return null when UUID not found in database', async () => {
      const validUuid = '550e8400-e29b-41d4-a716-446655440000';
      const batchEntityMap = new Map<string, string>();

      // Mock database to return no results
      databaseService.query.mockResolvedValueOnce({
        rowCount: 0,
        rows: [],
      });

      const result = await (service as any).resolveEntityReference(
        { id: validUuid },
        batchEntityMap,
        projectId
      );

      expect(result).toBeNull();
    });

    it('should resolve entity by name from batch map', async () => {
      const entityName = 'User Service';
      const entityId = '550e8400-e29b-41d4-a716-446655440001';
      const batchEntityMap = new Map<string, string>();
      batchEntityMap.set('user service', entityId);

      const result = await (service as any).resolveEntityReference(
        { name: entityName },
        batchEntityMap,
        projectId
      );

      expect(result).toBe(entityId);
      // Should not query database if found in batch map
      expect(databaseService.query).not.toHaveBeenCalled();
    });

    it('should resolve entity by name from database when not in batch map', async () => {
      const entityName = 'Auth Database';
      const entityId = '550e8400-e29b-41d4-a716-446655440002';
      const batchEntityMap = new Map<string, string>();

      // Mock database to return the entity
      databaseService.query.mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: entityId }],
      });

      const result = await (service as any).resolveEntityReference(
        { name: entityName },
        batchEntityMap,
        projectId
      );

      expect(result).toBe(entityId);
      expect(databaseService.query).toHaveBeenCalledWith(
        expect.stringContaining("properties->>'name' ILIKE"),
        [projectId, entityName]
      );
      // Should cache the result in batch map
      expect(batchEntityMap.get('auth database')).toBe(entityId);
    });

    it('should return null when name not found in batch map or database', async () => {
      const entityName = 'Unknown Entity';
      const batchEntityMap = new Map<string, string>();

      // Mock database to return no results
      databaseService.query.mockResolvedValueOnce({
        rowCount: 0,
        rows: [],
      });

      const result = await (service as any).resolveEntityReference(
        { name: entityName },
        batchEntityMap,
        projectId
      );

      expect(result).toBeNull();
    });

    it('should prefer id over name when both are provided', async () => {
      const entityId = '550e8400-e29b-41d4-a716-446655440003';
      const entityName = 'Some Entity';
      const batchEntityMap = new Map<string, string>();

      // Mock database to return the entity by ID
      databaseService.query.mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: entityId }],
      });

      const result = await (service as any).resolveEntityReference(
        { id: entityId, name: entityName },
        batchEntityMap,
        projectId
      );

      expect(result).toBe(entityId);
      // Should query by ID, not name
      expect(databaseService.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE id = $1'),
        [entityId, projectId]
      );
    });

    it('should handle database query errors gracefully', async () => {
      const entityName = 'Failing Entity';
      const batchEntityMap = new Map<string, string>();

      // Mock database to throw error
      databaseService.query.mockRejectedValueOnce(
        new Error('DB connection lost')
      );

      const result = await (service as any).resolveEntityReference(
        { name: entityName },
        batchEntityMap,
        projectId
      );

      expect(result).toBeNull();
    });

    it('should return null when both id and name are empty', async () => {
      const batchEntityMap = new Map<string, string>();

      const result = await (service as any).resolveEntityReference(
        {},
        batchEntityMap,
        projectId
      );

      expect(result).toBeNull();
    });

    it('should handle case-insensitive name matching in batch map', async () => {
      const entityId = '550e8400-e29b-41d4-a716-446655440004';
      const batchEntityMap = new Map<string, string>();
      batchEntityMap.set('my component', entityId);

      // Test with different case
      const result = await (service as any).resolveEntityReference(
        { name: 'My COMPONENT' },
        batchEntityMap,
        projectId
      );

      expect(result).toBe(entityId);
    });

    it('should trim whitespace from entity names', async () => {
      const entityId = '550e8400-e29b-41d4-a716-446655440005';
      const batchEntityMap = new Map<string, string>();
      batchEntityMap.set('trimmed name', entityId);

      // Test with extra whitespace
      const result = await (service as any).resolveEntityReference(
        { name: '  Trimmed Name  ' },
        batchEntityMap,
        projectId
      );

      expect(result).toBe(entityId);
    });
  });
});
