import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import Handlebars from 'handlebars';
import mjml2html from 'mjml';
import { EmailTemplate } from '../../entities/email-template.entity';

export interface TemplateRenderResult {
  html: string;
  text?: string;
}

export interface TemplateContext {
  [key: string]: any;
}

export interface MjmlValidationResult {
  valid: boolean;
  errors: Array<{
    line: number;
    message: string;
    tagName: string;
  }>;
}

/**
 * Cached database template entry with TTL tracking
 */
interface CachedDbTemplate {
  template: EmailTemplate;
  cachedAt: number;
}

/**
 * EmailTemplateService
 *
 * Handles email template rendering using MJML for responsive HTML
 * and Handlebars for variable interpolation.
 *
 * Templates are loaded from the templates/email directory with the structure:
 * - layouts/default.mjml.hbs - Base layouts that wrap content
 * - partials/*.mjml.hbs - Reusable template parts (buttons, footers, etc.)
 * - *.mjml.hbs - Main email templates
 *
 * Database-backed templates:
 * - Customized templates (is_customized = true) are loaded from database
 * - Non-customized templates fall back to file-based templates
 * - Database templates are cached in memory with 5-minute TTL
 *
 * In development mode, templates are reloaded on each render for hot-reload.
 * In production, templates are cached after first load.
 */
@Injectable()
export class EmailTemplateService implements OnModuleInit {
  private readonly logger = new Logger(EmailTemplateService.name);
  private readonly templateDir: string;
  private readonly isDevelopment: boolean;

  private templateCache: Map<string, Handlebars.TemplateDelegate> = new Map();
  private layoutCache: Map<string, Handlebars.TemplateDelegate> = new Map();
  private dbTemplateCache: Map<string, CachedDbTemplate> = new Map();
  private readonly DB_CACHE_TTL_MS = 5 * 60 * 1000;

  constructor(
    @Optional()
    @InjectRepository(EmailTemplate)
    private readonly emailTemplateRepository?: Repository<EmailTemplate>
  ) {
    this.templateDir = path.join(
      __dirname,
      '..',
      '..',
      '..',
      'templates',
      'email'
    );
    this.isDevelopment = process.env.NODE_ENV !== 'production';
  }

  onModuleInit() {
    this.registerPartials();

    if (!this.isDevelopment) {
      this.preloadTemplates();
    }
  }

  /**
   * Register Handlebars partials from the partials directory.
   * Partials can be used in templates with {{> partialName}}
   */
  private registerPartials(): void {
    const partialsDir = path.join(this.templateDir, 'partials');

    if (!fs.existsSync(partialsDir)) {
      this.logger.warn(`Partials directory not found: ${partialsDir}`);
      return;
    }

    const files = fs.readdirSync(partialsDir);
    for (const file of files) {
      if (file.endsWith('.mjml.hbs')) {
        const name = file.replace('.mjml.hbs', '');
        const content = fs.readFileSync(path.join(partialsDir, file), 'utf-8');
        Handlebars.registerPartial(name, content);
        this.logger.debug(`Registered partial: ${name}`);
      }
    }
  }

  /**
   * Preload and cache all templates (production optimization).
   */
  private preloadTemplates(): void {
    if (!fs.existsSync(this.templateDir)) {
      this.logger.warn(`Template directory not found: ${this.templateDir}`);
      return;
    }

    // Load layouts
    const layoutsDir = path.join(this.templateDir, 'layouts');
    if (fs.existsSync(layoutsDir)) {
      const layoutFiles = fs.readdirSync(layoutsDir);
      for (const file of layoutFiles) {
        if (file.endsWith('.mjml.hbs')) {
          const name = file.replace('.mjml.hbs', '');
          const content = fs.readFileSync(path.join(layoutsDir, file), 'utf-8');
          this.layoutCache.set(name, Handlebars.compile(content));
          this.logger.debug(`Cached layout: ${name}`);
        }
      }
    }

    // Load main templates
    const files = fs.readdirSync(this.templateDir);
    for (const file of files) {
      if (
        file.endsWith('.mjml.hbs') &&
        !fs.statSync(path.join(this.templateDir, file)).isDirectory()
      ) {
        const name = file.replace('.mjml.hbs', '');
        const content = fs.readFileSync(
          path.join(this.templateDir, file),
          'utf-8'
        );
        this.templateCache.set(name, Handlebars.compile(content));
        this.logger.debug(`Cached template: ${name}`);
      }
    }

    this.logger.log(
      `Preloaded ${this.templateCache.size} templates and ${this.layoutCache.size} layouts`
    );
  }

  /**
   * Load a template file and compile it.
   * In development, always reads from disk. In production, uses cache.
   */
  private getTemplate(
    name: string,
    isLayout = false
  ): Handlebars.TemplateDelegate {
    const cache = isLayout ? this.layoutCache : this.templateCache;

    // In production, use cached template
    if (!this.isDevelopment && cache.has(name)) {
      return cache.get(name)!;
    }

    // Load from disk
    const dir = isLayout
      ? path.join(this.templateDir, 'layouts')
      : this.templateDir;
    const filePath = path.join(dir, `${name}.mjml.hbs`);

    if (!fs.existsSync(filePath)) {
      throw new Error(`Template not found: ${name} (looked for ${filePath})`);
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const compiled = Handlebars.compile(content);

    // Cache in production
    if (!this.isDevelopment) {
      cache.set(name, compiled);
    }

    return compiled;
  }

  /**
   * Render an email template to HTML.
   *
   * @param templateName Template name (without .mjml.hbs extension)
   * @param context Data to pass to the template
   * @param layoutName Optional layout to wrap the template (default: 'default')
   * @returns Rendered HTML and optional plain text version
   */
  async render(
    templateName: string,
    context: TemplateContext = {},
    layoutName: string = 'default'
  ): Promise<TemplateRenderResult> {
    try {
      if (this.isDevelopment) {
        this.registerPartials();
      }

      const dbTemplate = await this.getDbTemplate(templateName);
      if (dbTemplate && dbTemplate.isCustomized) {
        return this.renderFromContent(
          dbTemplate.mjmlContent,
          context,
          layoutName
        );
      }

      const template = this.getTemplate(templateName);
      let mjmlContent = template(context);

      if (layoutName) {
        try {
          const layout = this.getTemplate(layoutName, true);
          mjmlContent = layout({ ...context, content: mjmlContent });
        } catch (err) {
          this.logger.debug(
            `Layout '${layoutName}' not found, using template directly`
          );
        }
      }

      const result = mjml2html(mjmlContent, {
        validationLevel: 'soft',
        minify: !this.isDevelopment,
      });

      if (result.errors && result.errors.length > 0) {
        for (const error of result.errors) {
          this.logger.warn(
            `MJML validation warning in ${templateName}: ${error.message}`
          );
        }
      }

      return {
        html: result.html,
        text: this.generatePlainText(context),
      };
    } catch (err) {
      this.logger.error(
        `Failed to render template '${templateName}': ${(err as Error).message}`
      );
      throw err;
    }
  }

  renderFromContent(
    mjmlContent: string,
    context: TemplateContext = {},
    layoutName?: string
  ): TemplateRenderResult {
    try {
      if (this.isDevelopment) {
        this.registerPartials();
      }

      const compiled = Handlebars.compile(mjmlContent);
      let renderedMjml = compiled(context);

      if (layoutName) {
        try {
          const layout = this.getTemplate(layoutName, true);
          renderedMjml = layout({ ...context, content: renderedMjml });
        } catch (err) {
          this.logger.debug(
            `Layout '${layoutName}' not found, using content directly`
          );
        }
      }

      const result = mjml2html(renderedMjml, {
        validationLevel: 'soft',
        minify: !this.isDevelopment,
      });

      if (result.errors && result.errors.length > 0) {
        for (const error of result.errors) {
          this.logger.warn(`MJML validation warning: ${error.message}`);
        }
      }

      return {
        html: result.html,
        text: this.generatePlainText(context),
      };
    } catch (err) {
      this.logger.error(`Failed to render content: ${(err as Error).message}`);
      throw err;
    }
  }

  validateMjml(mjmlContent: string): MjmlValidationResult {
    try {
      const result = mjml2html(mjmlContent, {
        validationLevel: 'strict',
      });

      const errors = (result.errors || []).map((error) => ({
        line: error.line,
        message: error.message,
        tagName: error.tagName || '',
      }));

      return {
        valid: errors.length === 0,
        errors,
      };
    } catch (err) {
      return {
        valid: false,
        errors: [
          {
            line: 0,
            message: (err as Error).message,
            tagName: '',
          },
        ],
      };
    }
  }

  /**
   * Validates body-only MJML content (mj-text, mj-button, etc. without <mjml> wrapper).
   * This wraps the content in a minimal MJML structure for validation purposes.
   * Used for validating AI-generated suggestions and file-based templates.
   */
  validateBodyMjml(bodyContent: string): MjmlValidationResult {
    // Check if content is already a complete MJML document
    const trimmedContent = bodyContent.trim();
    if (trimmedContent.startsWith('<mjml')) {
      // Already complete MJML, validate as-is
      return this.validateMjml(bodyContent);
    }

    // Wrap body-only content in minimal MJML structure for validation
    const wrappedMjml = `<mjml>
  <mj-body>
    <mj-section>
      <mj-column>
        ${bodyContent}
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>`;

    try {
      const result = mjml2html(wrappedMjml, {
        validationLevel: 'strict',
      });

      // Adjust line numbers to account for wrapper lines (5 lines added before content)
      const wrapperLineOffset = 5;
      const errors = (result.errors || []).map((error) => ({
        line: Math.max(0, error.line - wrapperLineOffset),
        message: error.message,
        tagName: error.tagName || '',
      }));

      return {
        valid: errors.length === 0,
        errors,
      };
    } catch (err) {
      return {
        valid: false,
        errors: [
          {
            line: 0,
            message: (err as Error).message,
            tagName: '',
          },
        ],
      };
    }
  }

  private async getDbTemplate(name: string): Promise<EmailTemplate | null> {
    // If repository is not available (e.g., in tests), skip database lookup
    if (!this.emailTemplateRepository) {
      return null;
    }

    const cached = this.dbTemplateCache.get(name);
    const now = Date.now();

    if (cached && now - cached.cachedAt < this.DB_CACHE_TTL_MS) {
      return cached.template;
    }

    try {
      const template = await this.emailTemplateRepository.findOne({
        where: { name },
      });

      if (template) {
        this.dbTemplateCache.set(name, { template, cachedAt: now });
      } else {
        this.dbTemplateCache.delete(name);
      }

      return template;
    } catch (err) {
      this.logger.warn(
        `Failed to load template '${name}' from database: ${
          (err as Error).message
        }`
      );
      return null;
    }
  }

  clearDbCache(templateName?: string): void {
    if (templateName) {
      this.dbTemplateCache.delete(templateName);
    } else {
      this.dbTemplateCache.clear();
    }
  }

  /**
   * Generate a plain text version from the context.
   * This is a simple implementation - override for specific templates if needed.
   */
  private generatePlainText(context: TemplateContext): string | undefined {
    // If context has a plainText field, use it
    if (context.plainText) {
      return context.plainText;
    }

    // Simple text generation from common fields
    const parts: string[] = [];

    if (context.title) {
      parts.push(context.title);
      parts.push('');
    }

    if (context.previewText) {
      parts.push(context.previewText);
      parts.push('');
    }

    if (context.message) {
      parts.push(context.message);
      parts.push('');
    }

    if (context.ctaUrl) {
      parts.push(`Link: ${context.ctaUrl}`);
      parts.push('');
    }

    return parts.length > 0 ? parts.join('\n') : undefined;
  }

  /**
   * Check if a template exists.
   */
  hasTemplate(templateName: string): boolean {
    const filePath = path.join(this.templateDir, `${templateName}.mjml.hbs`);
    return fs.existsSync(filePath);
  }

  /**
   * List available templates.
   */
  listTemplates(): string[] {
    if (!fs.existsSync(this.templateDir)) {
      return [];
    }

    return fs
      .readdirSync(this.templateDir)
      .filter(
        (f) =>
          f.endsWith('.mjml.hbs') &&
          !fs.statSync(path.join(this.templateDir, f)).isDirectory()
      )
      .map((f) => f.replace('.mjml.hbs', ''));
  }
}
