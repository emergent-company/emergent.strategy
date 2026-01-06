import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ServiceUnavailableException,
  RequestTimeoutException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';
import { AxiosError, AxiosResponse } from 'axios';
import {
  KreuzbergClientService,
  KreuzbergError,
} from '../../../src/modules/document-parsing/kreuzberg-client.service';
import { AppConfigService } from '../../../src/common/config/config.service';
import { KreuzbergExtractResult } from '../../../src/modules/document-parsing/interfaces';

// Mock HttpService
function createMockHttpService(
  overrides: Partial<HttpService> = {}
): HttpService {
  return {
    post: vi.fn().mockReturnValue(
      of({
        data: {
          content: 'Extracted text content',
          metadata: { page_count: 5 },
        } as KreuzbergExtractResult,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: { headers: {} as any },
      } as AxiosResponse<KreuzbergExtractResult>)
    ),
    get: vi.fn().mockReturnValue(
      of({
        data: { status: 'healthy', version: '1.0.0' },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: { headers: {} as any },
      } as AxiosResponse)
    ),
    ...overrides,
  } as unknown as HttpService;
}

// Mock AppConfigService
function createMockConfig(
  overrides: Partial<AppConfigService> = {}
): AppConfigService {
  return {
    kreuzbergServiceUrl: 'http://localhost:8000',
    kreuzbergServiceTimeout: 300000,
    kreuzbergEnabled: true,
    ...overrides,
  } as unknown as AppConfigService;
}

describe('KreuzbergClientService', () => {
  let service: KreuzbergClientService;
  let mockHttpService: HttpService;
  let mockConfig: AppConfigService;

  beforeEach(() => {
    mockHttpService = createMockHttpService();
    mockConfig = createMockConfig();
    service = new KreuzbergClientService(mockHttpService, mockConfig);
  });

  describe('isEnabled', () => {
    it('returns true when kreuzberg is enabled', () => {
      expect(service.isEnabled).toBe(true);
    });

    it('returns false when kreuzberg is disabled', () => {
      mockConfig = createMockConfig({ kreuzbergEnabled: false });
      service = new KreuzbergClientService(mockHttpService, mockConfig);

      expect(service.isEnabled).toBe(false);
    });
  });

  describe('extractText', () => {
    const testBuffer = Buffer.from('test file content');
    const testFilename = 'test.pdf';
    const testMimeType = 'application/pdf';

    it('extracts text successfully', async () => {
      const result = await service.extractText(
        testBuffer,
        testFilename,
        testMimeType
      );

      expect(result.content).toBe('Extracted text content');
      expect(result.metadata?.page_count).toBe(5);
      expect(mockHttpService.post).toHaveBeenCalledTimes(1);
    });

    it('sends correct request with form data', async () => {
      await service.extractText(testBuffer, testFilename, testMimeType);

      const postCall = (mockHttpService.post as ReturnType<typeof vi.fn>).mock
        .calls[0];
      const url = postCall[0];

      expect(url).toBe('http://localhost:8000/extract');
    });

    it('throws ServiceUnavailableException when kreuzberg is disabled', async () => {
      mockConfig = createMockConfig({ kreuzbergEnabled: false });
      service = new KreuzbergClientService(mockHttpService, mockConfig);

      await expect(
        service.extractText(testBuffer, testFilename, testMimeType)
      ).rejects.toThrow(ServiceUnavailableException);
    });

    it('throws RequestTimeoutException on timeout', async () => {
      const timeoutError = new AxiosError('timeout', 'ECONNABORTED');
      mockHttpService = createMockHttpService({
        post: vi.fn().mockReturnValue(throwError(() => timeoutError)),
      });
      service = new KreuzbergClientService(mockHttpService, mockConfig);

      await expect(
        service.extractText(testBuffer, testFilename, testMimeType)
      ).rejects.toThrow(RequestTimeoutException);
    });

    it('throws RequestTimeoutException on ETIMEDOUT', async () => {
      const timeoutError = new AxiosError('timeout', 'ETIMEDOUT');
      mockHttpService = createMockHttpService({
        post: vi.fn().mockReturnValue(throwError(() => timeoutError)),
      });
      service = new KreuzbergClientService(mockHttpService, mockConfig);

      await expect(
        service.extractText(testBuffer, testFilename, testMimeType)
      ).rejects.toThrow(RequestTimeoutException);
    });

    it('throws ServiceUnavailableException on connection refused', async () => {
      const connectionError = new AxiosError(
        'connection refused',
        'ECONNREFUSED'
      );
      mockHttpService = createMockHttpService({
        post: vi.fn().mockReturnValue(throwError(() => connectionError)),
      });
      service = new KreuzbergClientService(mockHttpService, mockConfig);

      await expect(
        service.extractText(testBuffer, testFilename, testMimeType)
      ).rejects.toThrow(ServiceUnavailableException);
    });

    it('throws ServiceUnavailableException on host not found', async () => {
      const notFoundError = new AxiosError('host not found', 'ENOTFOUND');
      mockHttpService = createMockHttpService({
        post: vi.fn().mockReturnValue(throwError(() => notFoundError)),
      });
      service = new KreuzbergClientService(mockHttpService, mockConfig);

      await expect(
        service.extractText(testBuffer, testFilename, testMimeType)
      ).rejects.toThrow(ServiceUnavailableException);
    });

    it('throws KreuzbergError on 4xx response', async () => {
      const error = new AxiosError('Bad Request');
      error.response = {
        status: 400,
        data: { error: 'Invalid file format', detail: 'PDF is corrupted' },
        statusText: 'Bad Request',
        headers: {},
        config: { headers: {} as any },
      };
      mockHttpService = createMockHttpService({
        post: vi.fn().mockReturnValue(throwError(() => error)),
      });
      service = new KreuzbergClientService(mockHttpService, mockConfig);

      await expect(
        service.extractText(testBuffer, testFilename, testMimeType)
      ).rejects.toThrow(KreuzbergError);
    });

    it('throws KreuzbergError on 5xx response', async () => {
      const error = new AxiosError('Internal Server Error');
      error.response = {
        status: 500,
        data: { error: 'Internal error' },
        statusText: 'Internal Server Error',
        headers: {},
        config: { headers: {} as any },
      };
      mockHttpService = createMockHttpService({
        post: vi.fn().mockReturnValue(throwError(() => error)),
      });
      service = new KreuzbergClientService(mockHttpService, mockConfig);

      await expect(
        service.extractText(testBuffer, testFilename, testMimeType)
      ).rejects.toThrow(KreuzbergError);
    });

    it('uses custom timeout when provided', async () => {
      await service.extractText(testBuffer, testFilename, testMimeType, {
        timeoutMs: 60000,
      });

      const postCall = (mockHttpService.post as ReturnType<typeof vi.fn>).mock
        .calls[0];
      const requestConfig = postCall[2];

      expect(requestConfig.timeout).toBe(60000);
    });

    it('extracts tables and images when present', async () => {
      mockHttpService = createMockHttpService({
        post: vi.fn().mockReturnValue(
          of({
            data: {
              content: 'Text with tables',
              metadata: { page_count: 2 },
              tables: [
                {
                  page: 1,
                  data: [
                    ['A', 'B'],
                    ['1', '2'],
                  ],
                },
              ],
              images: [{ page: 1, data: 'base64...', mime_type: 'image/png' }],
            } as KreuzbergExtractResult,
            status: 200,
            statusText: 'OK',
            headers: {},
            config: { headers: {} as any },
          } as AxiosResponse<KreuzbergExtractResult>)
        ),
      });
      service = new KreuzbergClientService(mockHttpService, mockConfig);

      const result = await service.extractText(
        testBuffer,
        testFilename,
        testMimeType
      );

      expect(result.tables).toHaveLength(1);
      expect(result.images).toHaveLength(1);
    });
  });

  describe('healthCheck', () => {
    it('returns healthy status when service is up', async () => {
      const result = await service.healthCheck();

      expect(result.status).toBe('healthy');
      expect(result.version).toBe('1.0.0');
    });

    it('returns unhealthy status on connection error', async () => {
      const connectionError = new AxiosError(
        'connection refused',
        'ECONNREFUSED'
      );
      mockHttpService = createMockHttpService({
        get: vi.fn().mockReturnValue(throwError(() => connectionError)),
      });
      service = new KreuzbergClientService(mockHttpService, mockConfig);

      const result = await service.healthCheck();

      expect(result.status).toBe('unhealthy');
      expect(result.details?.error).toBeDefined();
    });

    it('returns unhealthy status on timeout', async () => {
      const timeoutError = new AxiosError('timeout', 'ECONNABORTED');
      mockHttpService = createMockHttpService({
        get: vi.fn().mockReturnValue(throwError(() => timeoutError)),
      });
      service = new KreuzbergClientService(mockHttpService, mockConfig);

      const result = await service.healthCheck();

      expect(result.status).toBe('unhealthy');
    });

    it('uses short timeout for health checks (5 seconds)', async () => {
      await service.healthCheck();

      const getCall = (mockHttpService.get as ReturnType<typeof vi.fn>).mock
        .calls[0];
      const requestConfig = getCall[1];

      expect(requestConfig.timeout).toBe(5000);
    });

    it('calls correct health endpoint', async () => {
      await service.healthCheck();

      const getCall = (mockHttpService.get as ReturnType<typeof vi.fn>).mock
        .calls[0];
      const url = getCall[0];

      expect(url).toBe('http://localhost:8000/health');
    });
  });
});
