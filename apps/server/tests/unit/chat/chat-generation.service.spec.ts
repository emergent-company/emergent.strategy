import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChatGenerationService } from '../../../src/modules/chat/chat-generation.service';

// Minimal config mock
class ConfigMock {
  private _enabled: boolean;
  private _key: string | null;
  constructor(enabled: boolean, key: string | null) {
    this._enabled = enabled;
    this._key = key;
  }
  get chatModelEnabled() {
    return this._enabled;
  }
  get googleApiKey() {
    return this._key;
  }
  get vertexAiProjectId() {
    return 'test-project';
  }
  get vertexAiModel() {
    return 'gemini-2.5-pro';
  }
  get vertexAiLocation() {
    return 'us-central1';
  }
}

// Minimal ProjectsService mock
class ProjectsServiceMock {
  async getById() {
    return null;
  }
}

describe('ChatGenerationService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('emits deterministic synthetic tokens when CHAT_TEST_DETERMINISTIC=1 (bypass external model)', async () => {
    process.env.CHAT_TEST_DETERMINISTIC = '1';
    const svc = new ChatGenerationService(
      new ConfigMock(true, 'k') as any,
      new ProjectsServiceMock() as any
    );
    const tokens: string[] = [];
    const full = await svc.generateStreaming(
      'Tell me something about planets',
      (t) => tokens.push(t)
    );
    // Tokens should include spaces as separate elements to match production behavior
    expect(tokens).toEqual([
      'token-0',
      ' ',
      'token-1',
      ' ',
      'token-2',
      ' ',
      'token-3',
      ' ',
      'token-4',
    ]);
    expect(full).toBe('token-0 token-1 token-2 token-3 token-4');
    delete process.env.CHAT_TEST_DETERMINISTIC;
  });

  it('throws when model disabled (chatModelEnabled=false)', async () => {
    const svc = new ChatGenerationService(
      new ConfigMock(false, 'k') as any,
      new ProjectsServiceMock() as any
    );
    await expect(svc.generateStreaming('prompt', () => {})).rejects.toThrow(
      /disabled/
    );
  });

  it('invokes real model path and streams tokens with logging enabled', async () => {
    delete process.env.CHAT_TEST_DETERMINISTIC;
    process.env.E2E_DEBUG_CHAT = '1';
    const mockInvoke = vi.fn().mockResolvedValue('alpha beta gamma');
    vi.resetModules();
    vi.doMock('@langchain/google-vertexai', () => ({
      ChatVertexAI: vi.fn().mockImplementation(() => ({ invoke: mockInvoke })),
    }));
    const { ChatGenerationService: FreshService } = await import(
      '../../../src/modules/chat/chat-generation.service'
    );
    const svc = new FreshService(
      new ConfigMock(true, 'fake-key') as any,
      new ProjectsServiceMock() as any
    );
    const tokens: string[] = [];
    const full = await svc.generateStreaming('hello world', (t) =>
      tokens.push(t)
    );
    expect(full).toBe('alpha beta gamma');
    // Tokenization preserves whitespace: "alpha beta gamma" becomes ['alpha', ' ', 'beta', ' ', 'gamma']
    expect(tokens).toEqual(['alpha', ' ', 'beta', ' ', 'gamma']);
    expect(mockInvoke).toHaveBeenCalled();
    delete process.env.E2E_DEBUG_CHAT;
  });

  it('logs warning and rethrows on model failure', async () => {
    delete process.env.CHAT_TEST_DETERMINISTIC;
    process.env.E2E_DEBUG_CHAT = '1';
    const error = new Error('network fail');
    const mockInvoke = vi.fn().mockRejectedValue(error);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.resetModules();
    vi.doMock('@langchain/google-vertexai', () => ({
      ChatVertexAI: vi.fn().mockImplementation(() => ({ invoke: mockInvoke })),
    }));
    const { ChatGenerationService: FreshService } = await import(
      '../../../src/modules/chat/chat-generation.service'
    );
    const svc = new FreshService(
      new ConfigMock(true, 'fake-key') as any,
      new ProjectsServiceMock() as any
    );
    await expect(
      svc.generateStreaming('hello world', () => {})
    ).rejects.toThrow('network fail');
    expect(mockInvoke).toHaveBeenCalled();
    warnSpy.mockRestore();
    delete process.env.E2E_DEBUG_CHAT;
  });
});
