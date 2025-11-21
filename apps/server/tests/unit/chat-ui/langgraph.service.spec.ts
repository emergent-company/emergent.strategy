import { Test, TestingModule } from '@nestjs/testing';
import { LangGraphService } from './langgraph.service';
import { AppConfigService } from '../../../common/config/config.service';
import { ChatVertexAI } from '@langchain/google-vertexai';

// Mock createReactAgent to avoid actual API calls and graph compilation issues during test
jest.mock('@langchain/langgraph/prebuilt', () => ({
  createReactAgent: jest.fn().mockReturnValue({
    stream: jest
      .fn()
      .mockResolvedValue([{ messages: [{ content: 'Mock response' }] }]),
  }),
}));

// Mock ChatVertexAI
jest.mock('@langchain/google-vertexai', () => ({
  ChatVertexAI: jest.fn().mockImplementation(() => ({
    bindTools: jest.fn(),
    invoke: jest.fn(),
  })),
}));

describe('LangGraphService', () => {
  let service: LangGraphService;
  let configService: AppConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LangGraphService,
        {
          provide: AppConfigService,
          useValue: {
            vertexAiProjectId: 'test-project',
            vertexAiLocation: 'us-central1',
            vertexAiModel: 'gemini-pro',
          },
        },
      ],
    }).compile();

    service = module.get<LangGraphService>(LangGraphService);
    configService = module.get<AppConfigService>(AppConfigService);
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
  });
});
