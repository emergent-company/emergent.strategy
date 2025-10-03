/**
 * Unit tests for ExtractionJobService
 * Tests job lifecycle management: create, update, cancel, delete
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ExtractionJobService } from '../extraction-job.service';
import { DatabaseService } from '../../../common/database/database.service';
import {
    CreateExtractionJobDto,
    UpdateExtractionJobDto,
    ExtractionJobStatus,
    ExtractionSourceType,
} from '../dto/extraction-job.dto';

describe('ExtractionJobService', () => {
    let service: ExtractionJobService;
    let mockDb: any;

    const mockProjectId = 'test-project-123';
    const mockOrgId = 'test-org-456';
    const mockJobId = 'job-id-789';
    const mockUserId = 'user-id-abc';

    beforeEach(() => {
        mockDb = {
            query: vi.fn(),
        };

        service = new ExtractionJobService(mockDb as any);
    });

    describe('createJob', () => {
        it('should create a new extraction job with pending status', async () => {
            const createDto: any = {
                org_id: mockOrgId,
                project_id: mockProjectId,
                source_type: ExtractionSourceType.DOCUMENT,
                source_id: 'doc-123',
                source_metadata: { filename: 'test.pdf' },
                extraction_config: { target_types: ['Requirement'] },
                created_by: mockUserId,
            };

            const mockJobRow = {
                id: mockJobId,
                org_id: mockOrgId,
                project_id: mockProjectId,
                source_type: ExtractionSourceType.DOCUMENT,
                source_id: 'doc-123',
                source_metadata: { filename: 'test.pdf' },
                extraction_config: { target_types: ['Requirement'] },
                status: ExtractionJobStatus.PENDING,
                total_items: 0,
                processed_items: 0,
                successful_items: 0,
                failed_items: 0,
                discovered_types: [],
                created_objects: [],
                error_message: null,
                error_details: null,
                started_at: null,
                completed_at: null,
                created_at: new Date(),
                created_by: mockUserId,
                updated_at: new Date(),
            };

            mockDb.query.mockResolvedValue({
                rowCount: 1,
                rows: [mockJobRow],
            });

            const result = await service.createJob(createDto);

            expect(mockDb.query).toHaveBeenCalledWith(
                expect.stringContaining('INSERT INTO kb.object_extraction_jobs'),
                expect.arrayContaining([
                    mockOrgId,
                    mockProjectId,
                    ExtractionSourceType.DOCUMENT,
                    'doc-123',
                ])
            );
            expect(result.id).toBe(mockJobId);
            expect(result.status).toBe(ExtractionJobStatus.PENDING);
        });

        it('should throw BadRequestException if job creation fails', async () => {
            const createDto: any = {
                org_id: mockOrgId,
                project_id: mockProjectId,
                source_type: ExtractionSourceType.DOCUMENT,
                extraction_config: {},
            };

            mockDb.query.mockResolvedValue({ rowCount: 0, rows: [] });

            await expect(service.createJob(createDto)).rejects.toThrow(BadRequestException);
        });
    });

    describe('getJobById', () => {
        it('should retrieve a job by ID', async () => {
            const mockJobRow = {
                id: mockJobId,
                org_id: mockOrgId,
                project_id: mockProjectId,
                source_type: ExtractionSourceType.DOCUMENT,
                status: ExtractionJobStatus.PENDING,
                created_at: new Date(),
                updated_at: new Date(),
            };

            mockDb.query.mockResolvedValue({
                rowCount: 1,
                rows: [mockJobRow],
            });

            const result = await service.getJobById(mockJobId, mockProjectId, mockOrgId);

            expect(mockDb.query).toHaveBeenCalledWith(
                expect.stringContaining('SELECT * FROM kb.object_extraction_jobs'),
                [mockJobId, mockProjectId, mockOrgId]
            );
            expect(result.id).toBe(mockJobId);
        });

        it('should throw NotFoundException if job not found', async () => {
            mockDb.query.mockResolvedValue({ rowCount: 0, rows: [] });

            await expect(service.getJobById(mockJobId, mockProjectId, mockOrgId)).rejects.toThrow(
                NotFoundException
            );
        });
    });

    describe('listJobs', () => {
        it('should list jobs with pagination', async () => {
            const mockJobs = [
                {
                    id: 'job-1',
                    org_id: mockOrgId,
                    project_id: mockProjectId,
                    source_type: ExtractionSourceType.DOCUMENT,
                    status: ExtractionJobStatus.COMPLETED,
                    created_at: new Date(),
                    updated_at: new Date(),
                },
                {
                    id: 'job-2',
                    org_id: mockOrgId,
                    project_id: mockProjectId,
                    source_type: ExtractionSourceType.API,
                    status: ExtractionJobStatus.PENDING,
                    created_at: new Date(),
                    updated_at: new Date(),
                },
            ];

            mockDb.query
                .mockResolvedValueOnce({ rows: [{ count: '10' }] }) // Count query
                .mockResolvedValueOnce({ rows: mockJobs }); // Data query

            const result = await service.listJobs(mockProjectId, mockOrgId, {
                page: 1,
                limit: 20,
            });

            expect(result.jobs).toHaveLength(2);
            expect(result.total).toBe(10);
            expect(result.total_pages).toBe(1);
        });

        it('should filter jobs by status', async () => {
            mockDb.query
                .mockResolvedValueOnce({ rows: [{ count: '5' }] })
                .mockResolvedValueOnce({ rows: [] });

            await service.listJobs(mockProjectId, mockOrgId, {
                status: ExtractionJobStatus.COMPLETED,
                page: 1,
                limit: 20,
            });

            expect(mockDb.query).toHaveBeenCalledWith(
                expect.stringContaining('status = $3'),
                expect.arrayContaining([mockProjectId, mockOrgId, ExtractionJobStatus.COMPLETED])
            );
        });

        it('should filter jobs by source_type', async () => {
            mockDb.query
                .mockResolvedValueOnce({ rows: [{ count: '3' }] })
                .mockResolvedValueOnce({ rows: [] });

            await service.listJobs(mockProjectId, mockOrgId, {
                source_type: ExtractionSourceType.DOCUMENT,
                page: 1,
                limit: 20,
            });

            expect(mockDb.query).toHaveBeenCalledWith(
                expect.stringContaining('source_type = $3'),
                expect.arrayContaining([mockProjectId, mockOrgId, ExtractionSourceType.DOCUMENT])
            );
        });
    });

    describe('updateJob', () => {
        const mockJobRow = {
            id: mockJobId,
            org_id: mockOrgId,
            project_id: mockProjectId,
            source_type: ExtractionSourceType.DOCUMENT,
            status: ExtractionJobStatus.RUNNING,
            total_items: 100,
            processed_items: 50,
            successful_items: 45,
            failed_items: 5,
            created_at: new Date(),
            updated_at: new Date(),
        };

        it('should update job status', async () => {
            mockDb.query.mockResolvedValue({
                rowCount: 1,
                rows: [{ ...mockJobRow, status: ExtractionJobStatus.COMPLETED }],
            });

            const result = await service.updateJob(mockJobId, mockProjectId, mockOrgId, {
                status: ExtractionJobStatus.COMPLETED,
            });

            expect(mockDb.query).toHaveBeenCalledWith(
                expect.stringContaining('UPDATE kb.object_extraction_jobs'),
                expect.arrayContaining([ExtractionJobStatus.COMPLETED])
            );
            expect(result.status).toBe(ExtractionJobStatus.COMPLETED);
        });

        it('should update job progress', async () => {
            mockDb.query.mockResolvedValue({
                rowCount: 1,
                rows: [mockJobRow],
            });

            await service.updateJob(mockJobId, mockProjectId, mockOrgId, {
                processed_items: 75,
                successful_items: 70,
                failed_items: 5,
            });

            expect(mockDb.query).toHaveBeenCalledWith(
                expect.stringContaining('processed_items = $1'),
                expect.arrayContaining([75, 70, 5])
            );
        });

        it('should update discovered types and created objects', async () => {
            mockDb.query.mockResolvedValue({
                rowCount: 1,
                rows: [
                    {
                        ...mockJobRow,
                        discovered_types: ['Requirement', 'Feature'],
                        created_objects: ['obj-1', 'obj-2'],
                    },
                ],
            });

            await service.updateJob(mockJobId, mockProjectId, mockOrgId, {
                discovered_types: ['Requirement', 'Feature'],
                created_objects: ['obj-1', 'obj-2'],
            });

            expect(mockDb.query).toHaveBeenCalledWith(
                expect.stringContaining('discovered_types = $1'),
                expect.arrayContaining([
                    ['Requirement', 'Feature'],
                    ['obj-1', 'obj-2'],
                ])
            );
        });

        it('should update error information when job fails', async () => {
            mockDb.query.mockResolvedValue({
                rowCount: 1,
                rows: [
                    {
                        ...mockJobRow,
                        status: ExtractionJobStatus.FAILED,
                        error_message: 'Extraction failed',
                        error_details: { stack: '...' },
                    },
                ],
            });

            await service.updateJob(mockJobId, mockProjectId, mockOrgId, {
                status: ExtractionJobStatus.FAILED,
                error_message: 'Extraction failed',
                error_details: { stack: '...' },
            });

            expect(mockDb.query).toHaveBeenCalledWith(
                expect.stringContaining('status = $1'),
                expect.arrayContaining([
                    ExtractionJobStatus.FAILED,
                    'Extraction failed',
                    JSON.stringify({ stack: '...' }),
                ])
            );
        });

        it('should throw BadRequestException if no fields to update', async () => {
            await expect(
                service.updateJob(mockJobId, mockProjectId, mockOrgId, {})
            ).rejects.toThrow(BadRequestException);
        });

        it('should throw NotFoundException if job not found', async () => {
            mockDb.query.mockResolvedValue({ rowCount: 0, rows: [] });

            await expect(
                service.updateJob(mockJobId, mockProjectId, mockOrgId, {
                    status: ExtractionJobStatus.COMPLETED,
                })
            ).rejects.toThrow(NotFoundException);
        });
    });

    describe('cancelJob', () => {
        it('should cancel a pending job', async () => {
            const pendingJob = {
                id: mockJobId,
                org_id: mockOrgId,
                project_id: mockProjectId,
                source_type: ExtractionSourceType.DOCUMENT,
                status: ExtractionJobStatus.PENDING,
                created_at: new Date(),
                updated_at: new Date(),
            };

            mockDb.query
                .mockResolvedValueOnce({ rowCount: 1, rows: [pendingJob] }) // getJobById
                .mockResolvedValueOnce({
                    // updateJob
                    rowCount: 1,
                    rows: [{ ...pendingJob, status: ExtractionJobStatus.CANCELLED }],
                });

            const result = await service.cancelJob(mockJobId, mockProjectId, mockOrgId);

            expect(result.status).toBe(ExtractionJobStatus.CANCELLED);
        });

        it('should cancel a running job', async () => {
            const runningJob = {
                id: mockJobId,
                org_id: mockOrgId,
                project_id: mockProjectId,
                source_type: ExtractionSourceType.DOCUMENT,
                status: ExtractionJobStatus.RUNNING,
                created_at: new Date(),
                updated_at: new Date(),
            };

            mockDb.query
                .mockResolvedValueOnce({ rowCount: 1, rows: [runningJob] })
                .mockResolvedValueOnce({
                    rowCount: 1,
                    rows: [{ ...runningJob, status: ExtractionJobStatus.CANCELLED }],
                });

            const result = await service.cancelJob(mockJobId, mockProjectId, mockOrgId);

            expect(result.status).toBe(ExtractionJobStatus.CANCELLED);
        });

        it('should throw BadRequestException if job is already completed', async () => {
            const completedJob = {
                id: mockJobId,
                org_id: mockOrgId,
                project_id: mockProjectId,
                source_type: ExtractionSourceType.DOCUMENT,
                status: ExtractionJobStatus.COMPLETED,
                created_at: new Date(),
                updated_at: new Date(),
            };

            mockDb.query.mockResolvedValueOnce({ rowCount: 1, rows: [completedJob] });

            await expect(service.cancelJob(mockJobId, mockProjectId, mockOrgId)).rejects.toThrow(
                BadRequestException
            );
        });

        it('should throw BadRequestException if job is already failed', async () => {
            const failedJob = {
                id: mockJobId,
                org_id: mockOrgId,
                project_id: mockProjectId,
                source_type: ExtractionSourceType.DOCUMENT,
                status: ExtractionJobStatus.FAILED,
                created_at: new Date(),
                updated_at: new Date(),
            };

            mockDb.query.mockResolvedValueOnce({ rowCount: 1, rows: [failedJob] });

            await expect(service.cancelJob(mockJobId, mockProjectId, mockOrgId)).rejects.toThrow(
                BadRequestException
            );
        });
    });

    describe('deleteJob', () => {
        it('should delete a completed job', async () => {
            const completedJob = {
                id: mockJobId,
                org_id: mockOrgId,
                project_id: mockProjectId,
                source_type: ExtractionSourceType.DOCUMENT,
                status: ExtractionJobStatus.COMPLETED,
                created_at: new Date(),
                updated_at: new Date(),
            };

            mockDb.query
                .mockResolvedValueOnce({ rowCount: 1, rows: [completedJob] }) // getJobById
                .mockResolvedValueOnce({ rowCount: 1 }); // DELETE

            await service.deleteJob(mockJobId, mockProjectId, mockOrgId);

            expect(mockDb.query).toHaveBeenCalledWith(
                expect.stringContaining('DELETE FROM kb.object_extraction_jobs'),
                [mockJobId, mockProjectId, mockOrgId]
            );
        });

        it('should throw BadRequestException when deleting a running job', async () => {
            const runningJob = {
                id: mockJobId,
                org_id: mockOrgId,
                project_id: mockProjectId,
                source_type: ExtractionSourceType.DOCUMENT,
                status: ExtractionJobStatus.RUNNING,
                created_at: new Date(),
                updated_at: new Date(),
            };

            mockDb.query.mockResolvedValueOnce({ rowCount: 1, rows: [runningJob] });

            await expect(service.deleteJob(mockJobId, mockProjectId, mockOrgId)).rejects.toThrow(
                BadRequestException
            );
        });

        it('should throw BadRequestException when deleting a pending job', async () => {
            const pendingJob = {
                id: mockJobId,
                org_id: mockOrgId,
                project_id: mockProjectId,
                source_type: ExtractionSourceType.DOCUMENT,
                status: ExtractionJobStatus.PENDING,
                created_at: new Date(),
                updated_at: new Date(),
            };

            mockDb.query.mockResolvedValueOnce({ rowCount: 1, rows: [pendingJob] });

            await expect(service.deleteJob(mockJobId, mockProjectId, mockOrgId)).rejects.toThrow(
                BadRequestException
            );
        });

        it('should throw NotFoundException if job not found', async () => {
            mockDb.query.mockResolvedValue({ rowCount: 0, rows: [] });

            await expect(service.deleteJob(mockJobId, mockProjectId, mockOrgId)).rejects.toThrow(
                NotFoundException
            );
        });
    });

    describe('getJobStatistics', () => {
        it('should return aggregated statistics for project jobs', async () => {
            const mockStats = [
                {
                    status: ExtractionJobStatus.COMPLETED,
                    source_type: ExtractionSourceType.DOCUMENT,
                    count: '50',
                    avg_duration_ms: '30000',
                    total_objects: '500',
                    unique_types: '5',
                },
                {
                    status: ExtractionJobStatus.PENDING,
                    source_type: ExtractionSourceType.DOCUMENT,
                    count: '10',
                    avg_duration_ms: null,
                    total_objects: '0',
                    unique_types: '0',
                },
            ];

            const mockTypes = [
                { type_name: 'Requirement' },
                { type_name: 'Feature' },
                { type_name: 'Task' },
            ];

            mockDb.query
                .mockResolvedValueOnce({ rows: mockStats }) // Aggregated stats
                .mockResolvedValueOnce({ rows: mockTypes, rowCount: 3 }); // Unique types

            const result = await service.getJobStatistics(mockProjectId, mockOrgId);

            expect(result.total).toBe(60);
            expect(result.by_status[ExtractionJobStatus.COMPLETED]).toBe(50);
            expect(result.by_status[ExtractionJobStatus.PENDING]).toBe(10);
            expect(result.by_source_type[ExtractionSourceType.DOCUMENT]).toBe(60);
            expect(result.total_objects_created).toBe(500);
            expect(result.total_types_discovered).toBe(3);
        });
    });
});
