/**
 * Document Parsing Module
 *
 * Provides document parsing and text extraction capabilities using Kreuzberg.
 *
 * @module document-parsing
 */

// Module
export { DocumentParsingModule } from './document-parsing.module';

// Controller
export { DocumentParsingController } from './document-parsing.controller';

// Services
export { DocumentParsingJobService } from './document-parsing-job.service';
export {
  KreuzbergClientService,
  KreuzbergError,
} from './kreuzberg-client.service';
export { DocumentParsingWorkerService } from './document-parsing-worker.service';
export {
  EmailFileParserService,
  ParsedEmailFile,
  ParsedEmailAttachment,
  EmailAddress,
} from './email-file-parser.service';

// DTOs
export * from './dto';

// Interfaces
export * from './interfaces';
