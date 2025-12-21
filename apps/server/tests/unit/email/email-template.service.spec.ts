import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import * as fs from 'fs';
import Handlebars from 'handlebars';

// Hoist mjml mock function so it's available throughout
const mockMjml2html = vi.hoisted(() =>
  vi.fn().mockReturnValue({
    html: '<html><body>Rendered HTML</body></html>',
    errors: [],
  })
);

// Mock the fs module
vi.mock('fs');
vi.mock('handlebars');
vi.mock('mjml', () => ({
  default: mockMjml2html,
}));

// Import after mocking
import { EmailTemplateService } from '../../../src/modules/email/email-template.service';

describe('EmailTemplateService', () => {
  let service: EmailTemplateService;
  let originalNodeEnv: string | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    originalNodeEnv = process.env.NODE_ENV;

    // Mock fs.existsSync to return true by default
    vi.mocked(fs.existsSync).mockReturnValue(true);

    // Mock fs.readdirSync to return empty arrays by default
    vi.mocked(fs.readdirSync).mockReturnValue([]);

    // Mock Handlebars.registerPartial
    vi.mocked(Handlebars.registerPartial).mockImplementation(() => {});

    // Mock Handlebars.compile to return a template function
    vi.mocked(Handlebars.compile).mockImplementation(
      () => ((context: any) => `Rendered: ${JSON.stringify(context)}`) as any
    );

    service = new EmailTemplateService();
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    vi.clearAllMocks();
  });

  describe('onModuleInit', () => {
    it('registers partials on initialization', () => {
      // Mock partials directory
      vi.mocked(fs.readdirSync).mockImplementation((dirPath: any) => {
        if (dirPath.toString().includes('partials')) {
          return ['button.mjml.hbs', 'footer.mjml.hbs'] as any;
        }
        return [] as any;
      });
      vi.mocked(fs.readFileSync).mockReturnValue('<mj-button>Test</mj-button>');

      service.onModuleInit();

      expect(Handlebars.registerPartial).toHaveBeenCalledWith(
        'button',
        '<mj-button>Test</mj-button>'
      );
      expect(Handlebars.registerPartial).toHaveBeenCalledWith(
        'footer',
        '<mj-button>Test</mj-button>'
      );
    });

    it('handles missing partials directory gracefully', () => {
      vi.mocked(fs.existsSync).mockImplementation((p: any) => {
        if (p.toString().includes('partials')) {
          return false;
        }
        return true;
      });

      // Should not throw
      service.onModuleInit();

      expect(Handlebars.registerPartial).not.toHaveBeenCalled();
    });

    it('preloads templates in production mode', () => {
      process.env.NODE_ENV = 'production';
      service = new EmailTemplateService();

      // Mock templates
      vi.mocked(fs.readdirSync).mockImplementation((dirPath: any) => {
        if (dirPath.toString().includes('layouts')) {
          return ['default.mjml.hbs'] as any;
        }
        if (dirPath.toString().includes('partials')) {
          return [] as any;
        }
        return ['invitation.mjml.hbs', 'notification.mjml.hbs'] as any;
      });
      vi.mocked(fs.readFileSync).mockReturnValue('<mjml>Test</mjml>');
      vi.mocked(fs.statSync).mockReturnValue({
        isDirectory: () => false,
      } as any);

      service.onModuleInit();

      // Handlebars.compile should have been called for templates
      expect(Handlebars.compile).toHaveBeenCalled();
    });

    it('does not preload templates in development mode', () => {
      process.env.NODE_ENV = 'development';
      service = new EmailTemplateService();

      vi.mocked(fs.readdirSync).mockImplementation((dirPath: any) => {
        if (dirPath.toString().includes('partials')) {
          return [] as any;
        }
        return [] as any;
      });

      service.onModuleInit();

      // In dev mode, templates are loaded on demand, not preloaded
      // So compile should only be called for partials registration, not template preloading
    });
  });

  describe('hasTemplate', () => {
    it('returns true when template file exists', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const result = service.hasTemplate('invitation');

      expect(result).toBe(true);
    });

    it('returns false when template file does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = service.hasTemplate('nonexistent');

      expect(result).toBe(false);
    });
  });

  describe('listTemplates', () => {
    it('returns list of template names without extension', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        'invitation.mjml.hbs',
        'notification.mjml.hbs',
        'welcome.mjml.hbs',
      ] as any);
      vi.mocked(fs.statSync).mockReturnValue({
        isDirectory: () => false,
      } as any);

      const result = service.listTemplates();

      expect(result).toEqual(['invitation', 'notification', 'welcome']);
    });

    it('filters out directories', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        'invitation.mjml.hbs',
        'layouts',
        'partials',
      ] as any);
      vi.mocked(fs.statSync).mockImplementation((p: any) => {
        if (
          p.toString().includes('layouts') ||
          p.toString().includes('partials')
        ) {
          return { isDirectory: () => true } as any;
        }
        return { isDirectory: () => false } as any;
      });

      const result = service.listTemplates();

      expect(result).toEqual(['invitation']);
    });

    it('returns empty array when template directory does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = service.listTemplates();

      expect(result).toEqual([]);
    });
  });

  describe('render', () => {
    beforeEach(() => {
      // Reset mjml mock to default behavior
      mockMjml2html.mockReturnValue({
        html: '<html><body>Rendered HTML</body></html>',
        errors: [],
      });
    });

    it('renders template with context', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(
        '<mjml><mj-body>{{name}}</mj-body></mjml>'
      );

      mockMjml2html.mockReturnValue({
        html: '<html><body>Test User</body></html>',
        errors: [],
      });

      // Create a real-ish compile mock
      vi.mocked(Handlebars.compile).mockImplementation(
        () =>
          ((ctx: any) => `<mjml><mj-body>${ctx.name}</mj-body></mjml>`) as any
      );

      const result = service.render('invitation', { name: 'Test User' });

      expect(result.html).toBe('<html><body>Test User</body></html>');
    });

    it('generates plain text from context fields', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('<mjml></mjml>');

      mockMjml2html.mockReturnValue({
        html: '<html></html>',
        errors: [],
      });

      const result = service.render('invitation', {
        title: 'Welcome!',
        message: 'You have been invited.',
        ctaUrl: 'https://example.com/accept',
      });

      expect(result.text).toContain('Welcome!');
      expect(result.text).toContain('You have been invited.');
      expect(result.text).toContain('https://example.com/accept');
    });

    it('uses plainText from context if provided', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('<mjml></mjml>');

      mockMjml2html.mockReturnValue({
        html: '<html></html>',
        errors: [],
      });

      const result = service.render('invitation', {
        plainText: 'Custom plain text version',
        title: 'Ignored',
      });

      expect(result.text).toBe('Custom plain text version');
    });

    it('throws error when template not found', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      expect(() => service.render('nonexistent', {})).toThrow(
        /Template not found/
      );
    });

    it('wraps content in layout when specified', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);

      // Track which files are being read
      const reads: string[] = [];
      vi.mocked(fs.readFileSync).mockImplementation((p: any) => {
        reads.push(p.toString());
        if (p.toString().includes('layouts')) {
          return '<mjml><mj-body>{{content}}</mj-body></mjml>';
        }
        return '<mj-section>Template Content</mj-section>';
      });

      // Mock compile to track calls
      let templateResult = '';
      let layoutResult = '';
      vi.mocked(Handlebars.compile).mockImplementation((source: string) => {
        if (source.includes('{{content}}')) {
          // Layout
          return ((ctx: any) => {
            layoutResult = source.replace('{{content}}', ctx.content);
            return layoutResult;
          }) as any;
        } else {
          // Template
          return ((ctx: any) => {
            templateResult = source;
            return templateResult;
          }) as any;
        }
      });

      mockMjml2html.mockReturnValue({
        html: '<html><body>Layout with Template Content</body></html>',
        errors: [],
      });

      const result = service.render('invitation', {}, 'default');

      expect(result.html).toContain('Layout with Template Content');
    });

    it('handles MJML validation warnings gracefully', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('<mjml></mjml>');

      mockMjml2html.mockReturnValue({
        html: '<html></html>',
        errors: [{ message: 'Warning: deprecated tag' }],
      });

      // Should not throw despite warnings
      const result = service.render('invitation', {});

      expect(result.html).toBe('<html></html>');
    });
  });
});
