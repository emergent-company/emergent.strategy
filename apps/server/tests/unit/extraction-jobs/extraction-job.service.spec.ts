/**
 * Unit tests for ExtractionJobService
 * Tests job lifecycle management: create, update, cancel, delete
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ExtractionJobService } from '../../../src/modules/extraction-jobs/extraction-job.service';
import { DatabaseService } from '../../../src/common/database/database.service';
import { AppConfigService } from '../../../src/common/config/config.service';
import {
  CreateExtractionJobDto,
  UpdateExtractionJobDto,
  ExtractionJobStatus,
  ExtractionSourceType,
} from '../../../src/modules/extraction-jobs/dto/extraction-job.dto';

type MockQueryHandler = (sql: string, params?: any[]) => any;

describe('ExtractionJobService', () => {
  let service: ExtractionJobService;
  let mockDb: {
    query: ReturnType<typeof vi.fn>;
    setTenantContext: ReturnType<typeof vi.fn>;
    isOnline: ReturnType<typeof vi.fn>;
  };
  let mockConfig: AppConfigService;
  let queuedResponses: MockQueryHandler[];

  const mockProjectId = 'test-project-123';
  const mockOrganizationId = 'test-org-456';
  const mockJobId = 'job-id-789';
  const mockUserId = 'user-id-abc';

  const schemaRows = [
    { column_name: 'id', data_type: 'uuid' },
    { column_name: 'project_id', data_type: 'uuid' },
    { column_name: 'source_type', data_type: 'text' },
    { column_name: 'source_id', data_type: 'uuid' },
    { column_name: 'source_metadata', data_type: 'jsonb' },
    { column_name: 'extraction_config', data_type: 'jsonb' },
    { column_name: 'status', data_type: 'text' },
    { column_name: 'total_items', data_type: 'integer' },
    { column_name: 'processed_items', data_type: 'integer' },
    { column_name: 'successful_items', data_type: 'integer' },
    { column_name: 'failed_items', data_type: 'integer' },
    { column_name: 'discovered_types', data_type: 'ARRAY' },
    { column_name: 'created_objects', data_type: 'ARRAY' },
    { column_name: 'error_details', data_type: 'jsonb' },
    { column_name: 'debug_info', data_type: 'jsonb' },
    { column_name: 'subject_id', data_type: 'uuid' },
    { column_name: 'created_at', data_type: 'timestamp' },
    { column_name: 'updated_at', data_type: 'timestamp' },
  ];

  const buildJobRow = (overrides: Partial<Record<string, any>> = {}) => ({
    id: mockJobId,
    project_id: mockProjectId,
    source_type: ExtractionSourceType.DOCUMENT,
    source_id: 'doc-123',
    source_metadata: { filename: 'test.pdf' },
    extraction_config: { target_types: ['Requirement'] },
    status: ExtractionJobStatus.QUEUED,
    total_items: 0,
    processed_items: 0,
    successful_items: 0,
    failed_items: 0,
    discovered_types: [],
    created_objects: [],
    error_message: null,
    error_details: null,
    debug_info: null,
    started_at: null,
    completed_at: null,
    created_at: new Date(),
    subject_id: mockUserId,
    updated_at: new Date(),
    ...overrides,
  });

  beforeEach(() => {
    queuedResponses = [];
    mockConfig = {
      get googleApiKey() {
        return undefined;
      },
      get vertexAiModel() {
        return 'test-model';
      },
    } as unknown as AppConfigService;

    const queryMock = vi.fn(async (sql: string, params?: any[]) => {
      if (
        typeof sql === 'string' &&
        sql.includes('information_schema.columns')
      ) {
        return { rows: schemaRows, rowCount: schemaRows.length };
      }
      // Mock the organization lookup query (getOrganizationIdFromProject)
      if (
        typeof sql === 'string' &&
        sql.includes('SELECT organization_id FROM kb.projects')
      ) {
        return { rows: [{ organization_id: mockOrganizationId }], rowCount: 1 };
      }
      if (!queuedResponses.length) {
        throw new Error(`Unexpected query: ${sql}`);
      }
      const handler = queuedResponses.shift()!;
      const value = handler(sql, params);
      return value instanceof Promise ? await value : value;
    });

    const setTenantContextMock = vi.fn().mockResolvedValue(undefined);
    const isOnlineMock = vi.fn().mockReturnValue(true);

    mockDb = {
      query: queryMock,
      setTenantContext: setTenantContextMock,
      isOnline: isOnlineMock,
    };

    // Create mock repository
    const mockRepository = {
      save: vi.fn(),
      find: vi.fn(),
      findOne: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    };

    // Create mock DataSource
    const mockDataSource = {
      query: queryMock,
      createQueryRunner: vi.fn(),
    };

    // Constructor expects: (repository, dataSource, db, config)
    service = new ExtractionJobService(
      mockRepository as any,
      mockDataSource as any,
      mockDb as unknown as DatabaseService,
      mockConfig
    );
  });

  const enqueueQueryResult = (result: any) => {
    queuedResponses.push(() => result);
  };

  describe('createJob', () => {
    it('creates a new extraction job with pending status', async () => {
      const createDto: CreateExtractionJobDto = {
        project_id: mockProjectId,
        source_type: ExtractionSourceType.DOCUMENT,
        source_id: 'doc-123',
        source_metadata: { filename: 'test.pdf' },
        extraction_config: { target_types: ['Requirement'] },
        subject_id: mockUserId,
      };

      // organization_id lookup is handled by global mock

      const jobRow = buildJobRow();
      enqueueQueryResult({ rowCount: 1, rows: [jobRow] });

      const result = await service.createJob(createDto);

      expect(mockDb.setTenantContext).toHaveBeenCalledWith(
        mockOrganizationId,
        mockProjectId
      );

      const insertCall = mockDb.query.mock.calls.find(
        ([sql]) =>
          typeof sql === 'string' &&
          sql.startsWith('INSERT INTO kb.object_extraction_jobs')
      );
      expect(insertCall).toBeTruthy();
      const [, params] = insertCall!;
      // Note: organization_id is NOT included because the mock schema doesn't have orgColumn
      expect(params).toEqual([
        mockProjectId,
        ExtractionSourceType.DOCUMENT,
        ExtractionJobStatus.QUEUED,
        JSON.stringify(createDto.extraction_config),
        JSON.stringify(createDto.source_metadata),
        'doc-123',
        mockUserId,
      ]);
      expect(result.id).toBe(mockJobId);
      expect(result.status).toBe(ExtractionJobStatus.QUEUED);
    });

    it('throws when insert fails', async () => {
      const createDto = {
        project_id: mockProjectId,
        source_type: ExtractionSourceType.DOCUMENT,
        extraction_config: {},
      } as CreateExtractionJobDto;

      enqueueQueryResult({ rowCount: 0, rows: [] });

      await expect(service.createJob(createDto)).rejects.toThrow(
        BadRequestException
      );
    });

    it('requires project_id', async () => {
      await expect(
        service.createJob({
          source_type: ExtractionSourceType.DOCUMENT,
          extraction_config: {},
        } as CreateExtractionJobDto)
      ).rejects.toThrow('project_id is required to create an extraction job');
    });
  });

  describe('getJobById', () => {
    it('returns job when found', async () => {
      enqueueQueryResult({ rowCount: 1, rows: [buildJobRow()] });

      const result = await service.getJobById(mockJobId, mockProjectId);

      expect(mockDb.setTenantContext).toHaveBeenCalledWith(
        mockOrganizationId,
        mockProjectId
      );
      expect(result.id).toBe(mockJobId);
    });

    it('throws NotFoundException for missing job', async () => {
      enqueueQueryResult({ rowCount: 0, rows: [] });

      await expect(
        service.getJobById(mockJobId, mockProjectId)
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('listJobs', () => {
    it('returns paginated jobs', async () => {
      enqueueQueryResult({ rows: [{ count: '4' }], rowCount: 1 });
      enqueueQueryResult({
        rows: [buildJobRow({ id: 'job-1' }), buildJobRow({ id: 'job-2' })],
      });

      const result = await service.listJobs(mockProjectId, {
        page: 1,
        limit: 2,
      });

      expect(mockDb.setTenantContext).toHaveBeenCalledWith(
        mockOrganizationId,
        mockProjectId
      );
      expect(result.total).toBe(4);
      expect(result.jobs).toHaveLength(2);
    });

    it('applies status filter', async () => {
      enqueueQueryResult({ rows: [{ count: '0' }], rowCount: 1 });
      enqueueQueryResult({ rows: [] });

      await service.listJobs(mockProjectId, {
        status: ExtractionJobStatus.COMPLETED,
      });

      const selectCall = mockDb.query.mock.calls.find(
        ([sql]) =>
          typeof sql === 'string' &&
          sql.startsWith('SELECT * FROM kb.object_extraction_jobs')
      );
      expect(selectCall?.[0]).toContain('status = $2');
    });
  });

  describe('updateJob', () => {
    it('updates job status', async () => {
      enqueueQueryResult({
        rowCount: 1,
        rows: [buildJobRow({ status: ExtractionJobStatus.COMPLETED })],
      });

      const result = await service.updateJob(mockJobId, mockProjectId, {
        status: ExtractionJobStatus.COMPLETED,
      });

      expect(mockDb.setTenantContext).toHaveBeenCalledWith(
        mockOrganizationId,
        mockProjectId
      );
      expect(result.status).toBe(ExtractionJobStatus.COMPLETED);
    });

    it('supports progress updates', async () => {
      enqueueQueryResult({
        rowCount: 1,
        rows: [buildJobRow({ processed_items: 10, total_items: 20 })],
      });

      const dto: UpdateExtractionJobDto = {
        processed_items: 10,
        total_items: 20,
      };

      await service.updateJob(mockJobId, mockProjectId, dto);

      const updateCall = mockDb.query.mock.calls.find(
        ([sql]) =>
          typeof sql === 'string' &&
          sql.startsWith('UPDATE kb.object_extraction_jobs')
      );
      expect(updateCall?.[0]).toContain('processed_items');
      expect(updateCall?.[0]).toContain('total_items');
    });

    it('throws BadRequest when dto empty', async () => {
      await expect(
        service.updateJob(mockJobId, mockProjectId, {})
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFound when no rows affected', async () => {
      enqueueQueryResult({ rowCount: 0, rows: [] });

      await expect(
        service.updateJob(mockJobId, mockProjectId, {
          status: ExtractionJobStatus.COMPLETED,
        })
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('cancelJob', () => {
    it('cancels pending job', async () => {
      enqueueQueryResult({
        rowCount: 1,
        rows: [buildJobRow({ status: ExtractionJobStatus.QUEUED })],
      });
      enqueueQueryResult({
        rowCount: 1,
        rows: [buildJobRow({ status: ExtractionJobStatus.CANCELLED })],
      });

      const result = await service.cancelJob(mockJobId, mockProjectId);

      expect(result.status).toBe(ExtractionJobStatus.CANCELLED);
    });

    it('rejects cancelling completed job', async () => {
      enqueueQueryResult({
        rowCount: 1,
        rows: [buildJobRow({ status: ExtractionJobStatus.COMPLETED })],
      });

      await expect(service.cancelJob(mockJobId, mockProjectId)).rejects.toThrow(
        BadRequestException
      );
    });
  });

  describe('deleteJob', () => {
    it('deletes completed job', async () => {
      enqueueQueryResult({
        rowCount: 1,
        rows: [buildJobRow({ status: ExtractionJobStatus.COMPLETED })],
      });
      enqueueQueryResult({ rowCount: 1 });

      await service.deleteJob(mockJobId, mockProjectId);

      const deleteCall = mockDb.query.mock.calls.find(
        ([sql]) =>
          typeof sql === 'string' &&
          sql.startsWith('DELETE FROM kb.object_extraction_jobs')
      );
      expect(deleteCall?.[1]).toEqual([mockJobId, mockProjectId]);
    });

    it('throws when deleting running job', async () => {
      enqueueQueryResult({
        rowCount: 1,
        rows: [buildJobRow({ status: ExtractionJobStatus.RUNNING })],
      });

      await expect(service.deleteJob(mockJobId, mockProjectId)).rejects.toThrow(
        BadRequestException
      );
    });

    it('throws NotFound if job missing', async () => {
      enqueueQueryResult({ rowCount: 0, rows: [] });

      await expect(service.deleteJob(mockJobId, mockProjectId)).rejects.toThrow(
        NotFoundException
      );
    });
  });

  describe('getJobStatistics', () => {
    it('aggregates project statistics', async () => {
      enqueueQueryResult({
        rows: [
          {
            status: ExtractionJobStatus.COMPLETED,
            source_type: ExtractionSourceType.DOCUMENT,
            count: '2',
            avg_duration_ms: '1000',
            total_objects: '5',
          },
        ],
      });
      enqueueQueryResult({
        rows: [{ type_name: 'Requirement' }, { type_name: 'Feature' }],
        rowCount: 2,
      });

      const result = await service.getJobStatistics(mockProjectId);

      expect(mockDb.setTenantContext).toHaveBeenCalledWith(
        mockOrganizationId,
        mockProjectId
      );
      expect(result.total).toBe(2);
      expect(result.total_objects_created).toBe(5);
      expect(result.total_types_discovered).toBe(2);
    });
  });
});
