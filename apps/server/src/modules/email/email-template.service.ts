import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import Handlebars from 'handlebars';
import mjml2html from 'mjml';

export interface TemplateRenderResult {
  html: string;
  text?: string;
}

export interface TemplateContext {
  [key: string]: any;
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
 * In development mode, templates are reloaded on each render for hot-reload.
 * In production, templates are cached after first load.
 */
@Injectable()
export class EmailTemplateService implements OnModuleInit {
  private readonly logger = new Logger(EmailTemplateService.name);
  private readonly templateDir: string;
  private readonly isDevelopment: boolean;

  // Cached compiled templates (production only)
  private templateCache: Map<string, Handlebars.TemplateDelegate> = new Map();
  private layoutCache: Map<string, Handlebars.TemplateDelegate> = new Map();

  constructor() {
    // Templates are in apps/server/templates/email
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
  render(
    templateName: string,
    context: TemplateContext = {},
    layoutName: string = 'default'
  ): TemplateRenderResult {
    try {
      // In development, re-register partials for hot-reload
      if (this.isDevelopment) {
        this.registerPartials();
      }

      // Render the main template with Handlebars
      const template = this.getTemplate(templateName);
      let mjmlContent = template(context);

      // Wrap in layout if specified
      if (layoutName) {
        try {
          const layout = this.getTemplate(layoutName, true);
          mjmlContent = layout({ ...context, content: mjmlContent });
        } catch (err) {
          // Layout not found - use template directly
          this.logger.debug(
            `Layout '${layoutName}' not found, using template directly`
          );
        }
      }

      // Convert MJML to HTML
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
        // TODO: Generate plain text from HTML if needed
        text: this.generatePlainText(context),
      };
    } catch (err) {
      this.logger.error(
        `Failed to render template '${templateName}': ${(err as Error).message}`
      );
      throw err;
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
