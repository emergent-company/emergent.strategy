import {
  Injectable,
  Logger,
  HttpException,
  ServiceUnavailableException,
  RequestTimeoutException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { AxiosError, AxiosResponse } from 'axios';
import {
  firstValueFrom,
  timeout,
  catchError,
  throwError,
  Observable,
} from 'rxjs';
import FormData from 'form-data';
import { AppConfigService } from '../../common/config/config.service';
import {
  KreuzbergExtractResult,
  KreuzbergHealthResponse,
  KreuzbergExtractOptions,
} from './interfaces';
import {
  sanitizePptx,
  isPptxFile,
  needsPptxSanitization,
} from '../../common/utils/pptx-sanitize';

/**
 * Human-friendly error messages for common Kreuzberg parsing errors.
 */
const KREUZBERG_ERROR_MESSAGES: Record<string, string> = {
  // PPTX parsing errors
  'No txBody found':
    'This PowerPoint file contains shapes without text content that cannot be parsed. This is often caused by decorative elements in presentations created with Google Slides.',
  'Parsing error: No txBody found':
    'This PowerPoint file contains shapes without text content that cannot be parsed. This is often caused by decorative elements in presentations created with Google Slides.',

  // Common format errors
  'Unsupported file format':
    'This file format is not supported for text extraction. Please convert it to PDF, DOCX, or another supported format.',
  'Invalid PDF':
    'This PDF file appears to be corrupted or invalid. Please try re-exporting it from the original application.',
  'Invalid file':
    'This file appears to be corrupted or in an unrecognized format.',
  'Empty content':
    'No text content could be extracted from this file. It may contain only images or be empty.',

  // Resource errors
  'File too large':
    'This file exceeds the maximum size limit for processing. Please try splitting it into smaller parts.',
  'Processing timeout':
    'The file took too long to process. Large or complex files may require more time than allowed.',

  // Missing dependency errors (LibreOffice required for legacy formats)
  LibreOffice:
    'This file format requires LibreOffice for conversion. LibreOffice is not installed on the document processing server.',
  libreoffice:
    'This file format requires LibreOffice for conversion. LibreOffice is not installed on the document processing server.',
  MissingDependency:
    'A required system dependency is missing on the document processing server.',
  'soffice not found':
    'LibreOffice (soffice) is not installed. Legacy Office formats (.doc, .ppt, .xls) require LibreOffice for conversion.',

  // Server errors
  'Request failed with status code 500':
    'The document processing service encountered an internal error. Legacy formats like .doc or .ppt may require LibreOffice to be installed on the server.',
  'status code 500':
    'The document processing service encountered an internal error. This file format may not be fully supported.',
};

/**
 * Get a human-friendly error message for a Kreuzberg error.
 */
function getHumanFriendlyMessage(
  technicalMessage: string,
  detail?: string
): string {
  // Check if we have a mapped message for the technical error
  for (const [pattern, friendlyMessage] of Object.entries(
    KREUZBERG_ERROR_MESSAGES
  )) {
    if (
      technicalMessage.includes(pattern) ||
      (detail && detail.includes(pattern))
    ) {
      // Include technical detail if it provides additional context
      if (detail && !friendlyMessage.includes(detail)) {
        return `${friendlyMessage} (${detail})`;
      }
      return friendlyMessage;
    }
  }

  // For 422 errors without a specific mapping, provide a generic but helpful message
  if (
    technicalMessage.includes('422') ||
    technicalMessage.includes('Parsing')
  ) {
    return `The file could not be parsed: ${
      detail || technicalMessage
    }. This may be due to an unsupported format or corrupted file.`;
  }

  // For 500 errors with detail, include the detail
  if (technicalMessage.includes('500') && detail) {
    return `The document processing service encountered an error: ${detail}`;
  }

  // Return the original message with detail if available
  if (detail) {
    return `${technicalMessage} (${detail})`;
  }
  return technicalMessage;
}

/**
 * Custom exception for Kreuzberg service errors.
 * Includes both technical details and human-friendly messages.
 */
export class KreuzbergError extends HttpException {
  /** Human-friendly error message for display to users */
  public readonly userMessage: string;
  /** Technical detail from Kreuzberg (e.g., specific parsing issue) */
  public readonly detail?: string;
  /** Original technical error message */
  public readonly technicalMessage: string;

  constructor(message: string, statusCode: number, detail?: string) {
    const userMessage = getHumanFriendlyMessage(message, detail);
    super({ message: userMessage, detail, service: 'kreuzberg' }, statusCode);

    this.technicalMessage = message;
    this.detail = detail;
    this.userMessage = userMessage;
  }

  /**
   * Get a combined message with both user-friendly and technical details.
   */
  getFullMessage(): string {
    let msg = this.userMessage;
    if (this.detail && !this.userMessage.includes(this.detail)) {
      msg += ` (Technical detail: ${this.detail})`;
    }
    return msg;
  }
}

/**
 * HTTP client for Kreuzberg document extraction service.
 *
 * Kreuzberg is a document parsing service that extracts text, tables, and images
 * from various document formats (PDF, DOCX, images with OCR, etc.).
 *
 * @see https://github.com/Goldziher/kreuzberg
 */
@Injectable()
export class KreuzbergClientService {
  private readonly logger = new Logger(KreuzbergClientService.name);
  private readonly baseUrl: string;
  private readonly defaultTimeout: number;

  constructor(
    private readonly httpService: HttpService,
    private readonly config: AppConfigService
  ) {
    this.baseUrl = this.config.kreuzbergServiceUrl;
    this.defaultTimeout = this.config.kreuzbergServiceTimeout;

    this.logger.log(
      `Kreuzberg client initialized (url: ${this.baseUrl}, timeout: ${this.defaultTimeout}ms)`
    );
  }

  /**
   * Check if Kreuzberg service is enabled
   */
  get isEnabled(): boolean {
    return this.config.kreuzbergEnabled;
  }

  /**
   * Extract text and content from a document.
   *
   * @param buffer - Document content as Buffer
   * @param filename - Original filename (used for content-type detection)
   * @param mimeType - MIME type of the document
   * @param options - Extraction options
   * @returns Extraction result with text content and metadata
   */
  async extractText(
    buffer: Buffer,
    filename: string,
    mimeType: string,
    options: KreuzbergExtractOptions = {}
  ): Promise<KreuzbergExtractResult> {
    if (!this.isEnabled) {
      throw new ServiceUnavailableException(
        'Kreuzberg document parsing is not enabled'
      );
    }

    const timeoutMs = options.timeoutMs ?? this.defaultTimeout;
    const startTime = Date.now();

    this.logger.debug(
      `Extracting text from ${filename} (${mimeType}, ${buffer.length} bytes, timeout: ${timeoutMs}ms)`
    );

    try {
      // Sanitize PPTX files to work around Kreuzberg bug
      // (shapes without txBody cause "No txBody found" parsing error)
      let fileBuffer = buffer;
      if (isPptxFile(mimeType, filename)) {
        if (needsPptxSanitization(buffer)) {
          this.logger.debug(
            `PPTX file ${filename} needs sanitization (shapes without txBody detected)`
          );
          const sanitizeResult = sanitizePptx(buffer);
          if (sanitizeResult.modified) {
            this.logger.log(
              `Sanitized PPTX ${filename}: fixed ${sanitizeResult.shapesFixed} shapes in ${sanitizeResult.slidesModified.length} slides`
            );
            fileBuffer = sanitizeResult.buffer;
          }
        }
      }

      // Create form data with the file
      // NOTE: Kreuzberg expects the field name to be 'files' (plural), not 'file'
      const formData = new FormData();
      formData.append('files', fileBuffer, {
        filename: filename,
        contentType: mimeType,
      });

      // Make the extraction request
      // Kreuzberg returns an array of results (one per file uploaded)
      const response: AxiosResponse<KreuzbergExtractResult[]> =
        await firstValueFrom(
          this.httpService
            .post<KreuzbergExtractResult[]>(
              `${this.baseUrl}/extract`,
              formData,
              {
                headers: {
                  ...formData.getHeaders(),
                  Accept: 'application/json',
                },
                timeout: timeoutMs,
                maxContentLength: 100 * 1024 * 1024, // 100MB max response
                maxBodyLength: 100 * 1024 * 1024, // 100MB max request
              }
            )
            .pipe(
              timeout(timeoutMs),
              catchError((error: AxiosError) => {
                return throwError(() => this.handleAxiosError(error, filename));
              })
            )
        );

      const durationMs = Date.now() - startTime;

      // Extract the first result (we only upload one file at a time)
      const results = response.data;
      if (!results || !Array.isArray(results) || results.length === 0) {
        throw new KreuzbergError(
          'Kreuzberg returned empty results',
          500,
          'No extraction results returned from service'
        );
      }

      const result = results[0];
      const contentLength = result.content?.length ?? 0;

      this.logger.log(
        `Extraction completed: ${filename} -> ${contentLength} chars in ${durationMs}ms`
      );

      return result;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      const durationMs = Date.now() - startTime;
      this.logger.error(
        `Extraction failed for ${filename} after ${durationMs}ms: ${
          (error as Error).message
        }`,
        (error as Error).stack
      );

      throw new KreuzbergError(
        `Document extraction failed: ${(error as Error).message}`,
        500,
        (error as Error).stack
      );
    }
  }

  /**
   * Check the health status of the Kreuzberg service.
   *
   * @returns Health status response
   */
  async healthCheck(): Promise<KreuzbergHealthResponse> {
    try {
      const response: AxiosResponse<KreuzbergHealthResponse> =
        await firstValueFrom(
          this.httpService
            .get<KreuzbergHealthResponse>(`${this.baseUrl}/health`, {
              timeout: 5000, // Short timeout for health checks
            })
            .pipe(
              timeout(5000),
              catchError((error: AxiosError) => {
                return throwError(() => this.handleAxiosError(error, 'health'));
              })
            )
        );

      return response.data;
    } catch (error) {
      this.logger.warn(
        `Kreuzberg health check failed: ${(error as Error).message}`
      );

      return {
        status: 'unhealthy',
        details: {
          error: (error as Error).message,
        },
      };
    }
  }

  /**
   * Handle Axios errors and convert to appropriate HTTP exceptions
   */
  private handleAxiosError(error: AxiosError, context: string): HttpException {
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      return new RequestTimeoutException(
        `Kreuzberg request timed out for ${context}`
      );
    }

    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      return new ServiceUnavailableException(
        `Kreuzberg service unavailable at ${this.baseUrl}`
      );
    }

    const statusCode = error.response?.status ?? 500;
    const responseData = error.response?.data as
      | {
          error?: string;
          detail?: string;
          message?: string;
          type?: string;
          context?: Record<string, unknown>;
        }
      | string
      | undefined;

    // Log the full error response for debugging
    this.logger.warn(
      `Kreuzberg error for ${context}: status=${statusCode}, response=${JSON.stringify(
        responseData
      )}`
    );

    // Extract error message from various response formats
    let message: string;
    let detail: string | undefined;

    if (typeof responseData === 'string') {
      // Plain text error response
      message = responseData || error.message || 'Unknown Kreuzberg error';
    } else if (responseData) {
      // JSON error response - Kreuzberg may return { error, detail } or { message, type, context }
      message =
        responseData.error ||
        responseData.message ||
        error.message ||
        'Unknown Kreuzberg error';
      detail = responseData.detail;

      // Include type and context in detail if available
      if (responseData.type && !detail) {
        detail = `Error type: ${responseData.type}`;
      }
      if (responseData.context) {
        const contextStr = JSON.stringify(responseData.context);
        detail = detail ? `${detail}. Context: ${contextStr}` : contextStr;
      }
    } else {
      message = error.message ?? 'Unknown Kreuzberg error';
    }

    return new KreuzbergError(message, statusCode, detail);
  }
}
