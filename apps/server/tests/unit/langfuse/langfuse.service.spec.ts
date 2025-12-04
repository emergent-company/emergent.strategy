import { Test, TestingModule } from '@nestjs/testing';
import { LangfuseService } from '../../../src/modules/langfuse/langfuse.service';
import { AppConfigService } from '../../../src/common/config/config.service';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { Langfuse } from 'langfuse-node';

// Mock the langfuse-node library
const mockLangfuseInstance = {
  trace: vi.fn().mockReturnValue({ id: 'trace-123', update: vi.fn() }),
  generation: vi.fn().mockReturnValue({ update: vi.fn() }),
  shutdownAsync: vi.fn().mockResolvedValue(undefined),
};

vi.mock('langfuse-node', () => {
  return {
    Langfuse: vi.fn().mockImplementation(() => mockLangfuseInstance),
  };
});

describe('LangfuseService', () => {
  let service: LangfuseService;
  let configService: AppConfigService;

  const mockConfigService = {
    langfuseEnabled: true,
    langfusePublicKey: 'pk-test',
    langfuseSecretKey: 'sk-test',
    langfuseHost: 'http://localhost:3000',
    langfuseFlushAt: 10,
    langfuseFlushInterval: 1000,
  };

  beforeEach(async () => {
    // Reset mocks
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LangfuseService,
        {
          provide: AppConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<LangfuseService>(LangfuseService);
    configService = module.get<AppConfigService>(AppConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('initialization', () => {
    it('should initialize Langfuse when enabled and config is present', () => {
      service.onModuleInit();
      expect(service.isEnabled()).toBe(true);
      expect(Langfuse).toHaveBeenCalledWith({
        publicKey: 'pk-test',
        secretKey: 'sk-test',
        baseUrl: 'http://localhost:3000',
        flushAt: 10,
        flushInterval: 1000,
      });
    });

    it('should NOT initialize when disabled', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          LangfuseService,
          {
            provide: AppConfigService,
            useValue: { ...mockConfigService, langfuseEnabled: false },
          },
        ],
      }).compile();

      const disabledService = module.get<LangfuseService>(LangfuseService);
      disabledService.onModuleInit();
      expect(disabledService.isEnabled()).toBe(false);
    });

    it('should NOT initialize when config is missing', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          LangfuseService,
          {
            provide: AppConfigService,
            useValue: { ...mockConfigService, langfusePublicKey: undefined },
          },
        ],
      }).compile();

      const invalidService = module.get<LangfuseService>(LangfuseService);
      invalidService.onModuleInit();
      expect(invalidService.isEnabled()).toBe(false);
    });
  });

  describe('trace creation', () => {
    beforeEach(() => {
      service.onModuleInit();
    });

    it('should create a job trace', () => {
      const traceId = service.createJobTrace('job-1', { type: 'extraction' });
      expect(traceId).toBe('trace-123');
      expect(mockLangfuseInstance.trace).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'job-1',
          metadata: { type: 'extraction' },
        })
      );
    });

    it('should return null if service is disabled', () => {
      // Create a disabled service instance
      (service as any).langfuse = null;
      const traceId = service.createJobTrace('job-1');
      expect(traceId).toBeNull();
    });
  });

  describe('observation creation', () => {
    beforeEach(() => {
      service.onModuleInit();
    });

    it('should create an observation', () => {
      service.createObservation('trace-1', 'llm-call', { prompt: 'hello' });
      expect(mockLangfuseInstance.generation).toHaveBeenCalledWith(
        expect.objectContaining({
          traceId: 'trace-1',
          name: 'llm-call',
          input: { prompt: 'hello' },
        })
      );
    });
  });

  describe('update observation', () => {
    beforeEach(() => {
      service.onModuleInit();
    });

    it('should update observation with output and usage', () => {
      const mockObservation = { update: vi.fn() };
      service.updateObservation(
        mockObservation,
        'response',
        { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        'gpt-4'
      );

      expect(mockObservation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          output: 'response',
          usage: {
            promptTokens: 10,
            completionTokens: 5,
            totalTokens: 15,
          },
          model: 'gpt-4',
        })
      );
    });
  });

  describe('shutdown', () => {
    beforeEach(() => {
      service.onModuleInit();
    });

    it('should call shutdownAsync on destruction', async () => {
      await service.onModuleDestroy();
      expect(mockLangfuseInstance.shutdownAsync).toHaveBeenCalled();
    });
  });
});
