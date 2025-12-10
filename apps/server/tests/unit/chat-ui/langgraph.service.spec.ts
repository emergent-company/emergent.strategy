import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LangGraphService } from '../../../src/modules/chat-ui/services/langgraph.service';
import { AppConfigService } from '../../../src/common/config/config.service';

// Create an async iterable for the stream mock
async function* mockAsyncIterable() {
  yield { messages: [{ content: 'Mock response' }] };
}

// Mock all external dependencies before imports are resolved
vi.mock('@langchain/langgraph/prebuilt', () => ({
  createReactAgent: vi.fn().mockReturnValue({
    stream: vi.fn().mockImplementation(() => mockAsyncIterable()),
  }),
}));

vi.mock('@langchain/google-vertexai', () => ({
  ChatVertexAI: vi.fn().mockImplementation(() => ({
    bindTools: vi.fn(),
    invoke: vi.fn().mockResolvedValue({ content: 'Mock response' }),
  })),
}));

vi.mock('@langchain/langgraph-checkpoint-postgres', () => ({
  PostgresSaver: vi.fn().mockImplementation(() => ({
    setup: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('pg', () => ({
  Pool: vi.fn().mockImplementation(() => ({})),
}));

// Mock config service with all required properties
const mockConfigService = {
  vertexAiProjectId: 'test-project',
  vertexAiLocation: 'us-central1',
  vertexAiModel: 'gemini-pro',
  dbHost: 'localhost',
  dbPort: 5432,
  dbUser: 'test',
  dbPassword: 'test',
  dbName: 'test',
};

describe('LangGraphService', () => {
  let service: LangGraphService;

  beforeEach(async () => {
    // Clear all mocks between tests
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LangGraphService,
        {
          provide: AppConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<LangGraphService>(LangGraphService);
    await service.onModuleInit();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should initialize with default agent', () => {
    expect(service.isReady()).toBe(true);
  });

  it('should stream conversation', async () => {
    const stream = await service.streamConversation({
      message: 'Hello',
      threadId: 'test-thread',
    });
    expect(stream).toBeDefined();

    // Consume the async iterable to verify it works
    const messages: any[] = [];
    for await (const chunk of stream) {
      messages.push(chunk);
    }
    expect(messages.length).toBeGreaterThan(0);
  });

  it('should return false for isReady when model is not initialized', async () => {
    // Create a new service without proper config to test the not-ready state
    const emptyConfigService = {
      vertexAiProjectId: '',
      vertexAiLocation: '',
      vertexAiModel: '',
      dbHost: 'localhost',
      dbPort: 5432,
      dbUser: 'test',
      dbPassword: 'test',
      dbName: 'test',
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LangGraphService,
        {
          provide: AppConfigService,
          useValue: emptyConfigService,
        },
      ],
    }).compile();

    const uninitializedService = module.get<LangGraphService>(LangGraphService);
    await uninitializedService.onModuleInit();

    expect(uninitializedService.isReady()).toBe(false);
  });

  it('should throw error when streaming without initialization', async () => {
    const emptyConfigService = {
      vertexAiProjectId: '',
      vertexAiLocation: '',
      vertexAiModel: '',
      dbHost: 'localhost',
      dbPort: 5432,
      dbUser: 'test',
      dbPassword: 'test',
      dbName: 'test',
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LangGraphService,
        {
          provide: AppConfigService,
          useValue: emptyConfigService,
        },
      ],
    }).compile();

    const uninitializedService = module.get<LangGraphService>(LangGraphService);
    await uninitializedService.onModuleInit();

    await expect(
      uninitializedService.streamConversation({
        message: 'Hello',
        threadId: 'test-thread',
      })
    ).rejects.toThrow('LangGraph not initialized');
  });
});
