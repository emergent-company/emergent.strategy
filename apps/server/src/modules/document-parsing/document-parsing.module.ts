import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { DocumentParsingJob } from '../../entities/document-parsing-job.entity';
import { DocumentArtifact } from '../../entities/document-artifact.entity';
import { Project } from '../../entities/project.entity';
import { KreuzbergClientService } from './kreuzberg-client.service';
import { EmailFileParserService } from './email-file-parser.service';
import { DocumentParsingJobService } from './document-parsing-job.service';
import { DocumentParsingWorkerService } from './document-parsing-worker.service';
import { DocumentParsingController } from './document-parsing.controller';
import { AuthModule } from '../auth/auth.module';
import { StorageModule } from '../storage/storage.module';
import { AppConfigModule } from '../../common/config/config.module';
import { DocumentsModule } from '../documents/documents.module';
import { UtilsModule } from '../../common/utils/utils.module';

/**
 * Document Parsing Module
 *
 * Provides document parsing and text extraction capabilities using the
 * Kreuzberg service. This module handles:
 *
 * - Extracting text from PDFs, DOCX, images (OCR), and other formats
 * - Managing parsing job queues with retry logic
 * - Background worker for processing jobs
 * - Storing extracted artifacts (tables, images, charts)
 *
 * The module uses:
 * - KreuzbergClientService: HTTP client for Kreuzberg API
 * - DocumentParsingJobService: Job CRUD operations
 * - DocumentParsingWorkerService: Background processing worker
 *
 * @example
 * ```typescript
 * // Creating a parsing job
 * const job = await parsingJobService.createJob({
 *   organizationId: 'org-uuid',
 *   projectId: 'project-uuid',
 *   sourceType: 'upload',
 *   sourceFilename: 'document.pdf',
 *   mimeType: 'application/pdf',
 *   fileSizeBytes: 1024000,
 *   storageKey: 'projects/proj-123/documents/doc-456.pdf',
 * });
 * ```
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([DocumentParsingJob, DocumentArtifact, Project]),
    HttpModule.register({
      timeout: 300000, // 5 minute default timeout for large documents
      maxRedirects: 5,
    }),
    AuthModule,
    StorageModule,
    AppConfigModule,
    UtilsModule,
    forwardRef(() => DocumentsModule),
  ],
  controllers: [DocumentParsingController],
  providers: [
    KreuzbergClientService,
    EmailFileParserService,
    DocumentParsingJobService,
    DocumentParsingWorkerService,
  ],
  exports: [
    DocumentParsingJobService,
    KreuzbergClientService,
    EmailFileParserService,
  ],
})
export class DocumentParsingModule {}
