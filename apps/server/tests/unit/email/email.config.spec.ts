import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EmailConfig } from '../../../src/modules/email/email.config';

describe('EmailConfig', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };
    // Clear all email-related env vars
    delete process.env.EMAIL_ENABLED;
    delete process.env.MAILGUN_API_KEY;
    delete process.env.MAILGUN_DOMAIN;
    delete process.env.MAILGUN_API_URL;
    delete process.env.MAILGUN_FROM_EMAIL;
    delete process.env.MAILGUN_FROM_NAME;
    delete process.env.EMAIL_WORKER_INTERVAL_MS;
    delete process.env.EMAIL_WORKER_BATCH;
    delete process.env.EMAIL_MAX_RETRIES;
    delete process.env.EMAIL_RETRY_DELAY_SEC;
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('enabled', () => {
    it('returns false when EMAIL_ENABLED is not set', () => {
      const config = new EmailConfig();
      expect(config.enabled).toBe(false);
    });

    it('returns false when EMAIL_ENABLED is "false"', () => {
      process.env.EMAIL_ENABLED = 'false';
      const config = new EmailConfig();
      expect(config.enabled).toBe(false);
    });

    it('returns true when EMAIL_ENABLED is "true"', () => {
      process.env.EMAIL_ENABLED = 'true';
      const config = new EmailConfig();
      expect(config.enabled).toBe(true);
    });

    it('returns false for other values', () => {
      process.env.EMAIL_ENABLED = '1';
      const config = new EmailConfig();
      expect(config.enabled).toBe(false);
    });
  });

  describe('mailgunApiKey', () => {
    it('returns empty string when not set', () => {
      const config = new EmailConfig();
      expect(config.mailgunApiKey).toBe('');
    });

    it('returns value when set', () => {
      process.env.MAILGUN_API_KEY = 'key-12345';
      const config = new EmailConfig();
      expect(config.mailgunApiKey).toBe('key-12345');
    });
  });

  describe('mailgunDomain', () => {
    it('returns empty string when not set', () => {
      const config = new EmailConfig();
      expect(config.mailgunDomain).toBe('');
    });

    it('returns value when set', () => {
      process.env.MAILGUN_DOMAIN = 'mg.example.com';
      const config = new EmailConfig();
      expect(config.mailgunDomain).toBe('mg.example.com');
    });
  });

  describe('mailgunApiUrl', () => {
    it('returns default US URL when not set', () => {
      const config = new EmailConfig();
      expect(config.mailgunApiUrl).toBe('https://api.mailgun.net');
    });

    it('returns EU URL when configured', () => {
      process.env.MAILGUN_API_URL = 'https://api.eu.mailgun.net';
      const config = new EmailConfig();
      expect(config.mailgunApiUrl).toBe('https://api.eu.mailgun.net');
    });
  });

  describe('fromEmail', () => {
    it('returns default when not set', () => {
      const config = new EmailConfig();
      expect(config.fromEmail).toBe('noreply@example.com');
    });

    it('returns value when set', () => {
      process.env.MAILGUN_FROM_EMAIL = 'hello@myapp.com';
      const config = new EmailConfig();
      expect(config.fromEmail).toBe('hello@myapp.com');
    });
  });

  describe('fromName', () => {
    it('returns default when not set', () => {
      const config = new EmailConfig();
      expect(config.fromName).toBe('Emergent');
    });

    it('returns value when set', () => {
      process.env.MAILGUN_FROM_NAME = 'My App';
      const config = new EmailConfig();
      expect(config.fromName).toBe('My App');
    });
  });

  describe('workerIntervalMs', () => {
    it('returns default 10000 when not set', () => {
      const config = new EmailConfig();
      expect(config.workerIntervalMs).toBe(10000);
    });

    it('parses integer value', () => {
      process.env.EMAIL_WORKER_INTERVAL_MS = '5000';
      const config = new EmailConfig();
      expect(config.workerIntervalMs).toBe(5000);
    });
  });

  describe('workerBatchSize', () => {
    it('returns default 5 when not set', () => {
      const config = new EmailConfig();
      expect(config.workerBatchSize).toBe(5);
    });

    it('parses integer value', () => {
      process.env.EMAIL_WORKER_BATCH = '10';
      const config = new EmailConfig();
      expect(config.workerBatchSize).toBe(10);
    });
  });

  describe('maxRetries', () => {
    it('returns default 3 when not set', () => {
      const config = new EmailConfig();
      expect(config.maxRetries).toBe(3);
    });

    it('parses integer value', () => {
      process.env.EMAIL_MAX_RETRIES = '5';
      const config = new EmailConfig();
      expect(config.maxRetries).toBe(5);
    });
  });

  describe('retryDelaySec', () => {
    it('returns default 60 when not set', () => {
      const config = new EmailConfig();
      expect(config.retryDelaySec).toBe(60);
    });

    it('parses integer value', () => {
      process.env.EMAIL_RETRY_DELAY_SEC = '120';
      const config = new EmailConfig();
      expect(config.retryDelaySec).toBe(120);
    });
  });

  describe('validate', () => {
    it('returns empty array when disabled', () => {
      const config = new EmailConfig();
      expect(config.validate()).toEqual([]);
    });

    it('returns errors when enabled without API key', () => {
      process.env.EMAIL_ENABLED = 'true';
      process.env.MAILGUN_DOMAIN = 'mg.example.com';
      const config = new EmailConfig();
      const errors = config.validate();
      expect(errors).toContain(
        'MAILGUN_API_KEY is required when EMAIL_ENABLED=true'
      );
    });

    it('returns errors when enabled without domain', () => {
      process.env.EMAIL_ENABLED = 'true';
      process.env.MAILGUN_API_KEY = 'key-12345';
      const config = new EmailConfig();
      const errors = config.validate();
      expect(errors).toContain(
        'MAILGUN_DOMAIN is required when EMAIL_ENABLED=true'
      );
    });

    it('returns multiple errors when multiple required values missing', () => {
      process.env.EMAIL_ENABLED = 'true';
      const config = new EmailConfig();
      const errors = config.validate();
      expect(errors.length).toBe(2);
      expect(errors).toContain(
        'MAILGUN_API_KEY is required when EMAIL_ENABLED=true'
      );
      expect(errors).toContain(
        'MAILGUN_DOMAIN is required when EMAIL_ENABLED=true'
      );
    });

    it('returns empty array when enabled and configured', () => {
      process.env.EMAIL_ENABLED = 'true';
      process.env.MAILGUN_API_KEY = 'key-12345';
      process.env.MAILGUN_DOMAIN = 'mg.example.com';
      const config = new EmailConfig();
      expect(config.validate()).toEqual([]);
    });
  });
});
