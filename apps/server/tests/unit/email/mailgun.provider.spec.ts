import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MailgunProvider } from '../../../src/modules/email/mailgun.provider';
import { EmailConfig } from '../../../src/modules/email/email.config';

// Hoist mock functions so they're available throughout the test file
const mockCreate = vi.hoisted(() => vi.fn());
const mockClient = vi.hoisted(() =>
  vi.fn(() => ({
    messages: {
      create: mockCreate,
    },
  }))
);

// Mock mailgun.js module
vi.mock('mailgun.js', () => ({
  default: vi.fn().mockImplementation(() => ({
    client: mockClient,
  })),
}));

// Import after mock setup
import Mailgun from 'mailgun.js';

// Mock factories
function createMockConfig(overrides: Partial<EmailConfig> = {}): EmailConfig {
  return {
    enabled: true,
    mailgunApiKey: 'test-api-key',
    mailgunDomain: 'mg.test.com',
    mailgunApiUrl: 'https://api.mailgun.net',
    fromEmail: 'noreply@test.com',
    fromName: 'Test App',
    workerIntervalMs: 10000,
    workerBatchSize: 5,
    maxRetries: 3,
    retryDelaySec: 60,
    validate: vi.fn().mockReturnValue([]),
    ...overrides,
  } as unknown as EmailConfig;
}

describe('MailgunProvider', () => {
  let provider: MailgunProvider;
  let mockConfig: EmailConfig;

  beforeEach(() => {
    vi.clearAllMocks();
    mockConfig = createMockConfig();
    provider = new MailgunProvider(mockConfig);
  });

  describe('send', () => {
    const validOptions = {
      to: 'user@example.com',
      toName: 'Test User',
      subject: 'Welcome!',
      html: '<html><body>Welcome!</body></html>',
      text: 'Welcome!',
    };

    describe('when email is disabled', () => {
      it('returns success=false with disabled error', async () => {
        mockConfig = createMockConfig({ enabled: false });
        provider = new MailgunProvider(mockConfig);

        const result = await provider.send(validOptions);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Email sending is disabled');
        expect(result.messageId).toBeUndefined();
      });

      it('does not call Mailgun API', async () => {
        mockConfig = createMockConfig({ enabled: false });
        provider = new MailgunProvider(mockConfig);

        await provider.send(validOptions);

        expect(mockCreate).not.toHaveBeenCalled();
      });
    });

    describe('when config validation fails', () => {
      it('returns success=false with validation errors', async () => {
        mockConfig = createMockConfig({
          validate: vi
            .fn()
            .mockReturnValue([
              'MAILGUN_API_KEY is required',
              'MAILGUN_DOMAIN is required',
            ]),
        });
        provider = new MailgunProvider(mockConfig);

        const result = await provider.send(validOptions);

        expect(result.success).toBe(false);
        expect(result.error).toBe(
          'MAILGUN_API_KEY is required; MAILGUN_DOMAIN is required'
        );
        expect(result.messageId).toBeUndefined();
      });

      it('does not call Mailgun API', async () => {
        mockConfig = createMockConfig({
          validate: vi.fn().mockReturnValue(['Missing config']),
        });
        provider = new MailgunProvider(mockConfig);

        await provider.send(validOptions);

        expect(mockCreate).not.toHaveBeenCalled();
      });
    });

    describe('when sending successfully', () => {
      beforeEach(() => {
        mockCreate.mockResolvedValue({
          id: '<message-id@mg.test.com>',
          message: 'Queued. Thank you.',
        });
      });

      it('returns success=true with messageId', async () => {
        const result = await provider.send(validOptions);

        expect(result.success).toBe(true);
        expect(result.messageId).toBe('<message-id@mg.test.com>');
        expect(result.error).toBeUndefined();
      });

      it('formats sender with fromName and fromEmail', async () => {
        await provider.send(validOptions);

        expect(mockCreate).toHaveBeenCalledWith(
          'mg.test.com',
          expect.objectContaining({
            from: 'Test App <noreply@test.com>',
          })
        );
      });

      it('formats recipient with toName when provided', async () => {
        await provider.send(validOptions);

        expect(mockCreate).toHaveBeenCalledWith(
          'mg.test.com',
          expect.objectContaining({
            to: 'Test User <user@example.com>',
          })
        );
      });

      it('uses plain email when toName not provided', async () => {
        await provider.send({
          to: 'user@example.com',
          subject: 'Test',
          html: '<html></html>',
        });

        expect(mockCreate).toHaveBeenCalledWith(
          'mg.test.com',
          expect.objectContaining({
            to: 'user@example.com',
          })
        );
      });

      it('includes subject and html', async () => {
        await provider.send(validOptions);

        expect(mockCreate).toHaveBeenCalledWith(
          'mg.test.com',
          expect.objectContaining({
            subject: 'Welcome!',
            html: '<html><body>Welcome!</body></html>',
          })
        );
      });

      it('includes text when provided', async () => {
        await provider.send(validOptions);

        expect(mockCreate).toHaveBeenCalledWith(
          'mg.test.com',
          expect.objectContaining({
            text: 'Welcome!',
          })
        );
      });

      it('omits text when not provided', async () => {
        await provider.send({
          to: 'user@example.com',
          subject: 'Test',
          html: '<html></html>',
        });

        const callArgs = mockCreate.mock.calls[0][1];
        expect(callArgs.text).toBeUndefined();
      });
    });

    describe('when Mailgun API fails', () => {
      it('returns success=false with error message', async () => {
        mockCreate.mockRejectedValue(new Error('API rate limit exceeded'));

        const result = await provider.send(validOptions);

        expect(result.success).toBe(false);
        expect(result.error).toBe('API rate limit exceeded');
        expect(result.messageId).toBeUndefined();
      });

      it('handles non-Error throws', async () => {
        mockCreate.mockRejectedValue('Unknown error');

        const result = await provider.send(validOptions);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Unknown error');
      });

      it('handles network errors', async () => {
        mockCreate.mockRejectedValue(new Error('ECONNREFUSED'));

        const result = await provider.send(validOptions);

        expect(result.success).toBe(false);
        expect(result.error).toBe('ECONNREFUSED');
      });

      it('handles authentication errors', async () => {
        mockCreate.mockRejectedValue(
          new Error('Unauthorized - Invalid API key')
        );

        const result = await provider.send(validOptions);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Unauthorized - Invalid API key');
      });
    });

    describe('client initialization', () => {
      it('initializes client lazily on first send', async () => {
        mockCreate.mockResolvedValue({ id: 'msg-1' });

        // First send
        await provider.send(validOptions);
        expect(Mailgun).toHaveBeenCalledTimes(1);

        // Second send - should reuse client
        await provider.send(validOptions);
        expect(Mailgun).toHaveBeenCalledTimes(1);
      });

      it('passes API key and URL to Mailgun client', async () => {
        mockCreate.mockResolvedValue({ id: 'msg-1' });

        await provider.send(validOptions);

        expect(mockClient).toHaveBeenCalledWith({
          username: 'api',
          key: 'test-api-key',
          url: 'https://api.mailgun.net',
        });
      });
    });
  });
});
