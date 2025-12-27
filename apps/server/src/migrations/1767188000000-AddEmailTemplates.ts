import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Add Email Templates
 *
 * Creates database-backed email template management:
 * 1. kb.email_templates - stores current active version of each template
 * 2. kb.email_template_versions - version history for audit trail and rollback
 *
 * Templates use MJML + Handlebars for rendering, with variables defined per template.
 * Database templates take precedence over file-based templates when is_customized = true.
 */
export class AddEmailTemplates1767188000000 implements MigrationInterface {
  name = 'AddEmailTemplates1767188000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Create email_templates table
    await queryRunner.query(`
      CREATE TABLE kb.email_templates (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(100) NOT NULL UNIQUE,
        description TEXT,
        subject_template VARCHAR(500) NOT NULL,
        mjml_content TEXT NOT NULL,
        variables JSONB NOT NULL DEFAULT '[]',
        sample_data JSONB NOT NULL DEFAULT '{}',
        current_version_id UUID,
        is_customized BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_by UUID REFERENCES core.user_profiles(id) ON DELETE SET NULL
      );

      COMMENT ON TABLE kb.email_templates IS 'Database-backed email templates with MJML + Handlebars';
      COMMENT ON COLUMN kb.email_templates.name IS 'Template identifier (invitation, welcome, release-notification)';
      COMMENT ON COLUMN kb.email_templates.description IS 'Human-readable description of the template purpose';
      COMMENT ON COLUMN kb.email_templates.subject_template IS 'Handlebars template for email subject line';
      COMMENT ON COLUMN kb.email_templates.mjml_content IS 'MJML + Handlebars template for email body';
      COMMENT ON COLUMN kb.email_templates.variables IS 'Array of {name, type, description, required, defaultValue}';
      COMMENT ON COLUMN kb.email_templates.sample_data IS 'Default sample data for preview rendering';
      COMMENT ON COLUMN kb.email_templates.current_version_id IS 'FK to current active version (set after version created)';
      COMMENT ON COLUMN kb.email_templates.is_customized IS 'true if modified from file-based default';
      COMMENT ON COLUMN kb.email_templates.updated_by IS 'Superadmin who last edited the template';

      CREATE INDEX idx_email_templates_name ON kb.email_templates(name);
    `);

    // 2. Create email_template_versions table
    await queryRunner.query(`
      CREATE TABLE kb.email_template_versions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        template_id UUID NOT NULL REFERENCES kb.email_templates(id) ON DELETE CASCADE,
        version_number INTEGER NOT NULL,
        subject_template VARCHAR(500) NOT NULL,
        mjml_content TEXT NOT NULL,
        variables JSONB NOT NULL DEFAULT '[]',
        sample_data JSONB NOT NULL DEFAULT '{}',
        change_summary VARCHAR(500),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_by UUID REFERENCES core.user_profiles(id) ON DELETE SET NULL,

        UNIQUE(template_id, version_number)
      );

      COMMENT ON TABLE kb.email_template_versions IS 'Version history for email templates (audit trail and rollback)';
      COMMENT ON COLUMN kb.email_template_versions.template_id IS 'Parent template this version belongs to';
      COMMENT ON COLUMN kb.email_template_versions.version_number IS 'Auto-incremented version number per template';
      COMMENT ON COLUMN kb.email_template_versions.subject_template IS 'Subject template at this version';
      COMMENT ON COLUMN kb.email_template_versions.mjml_content IS 'MJML content at this version';
      COMMENT ON COLUMN kb.email_template_versions.variables IS 'Template variables at this version';
      COMMENT ON COLUMN kb.email_template_versions.sample_data IS 'Sample data at this version';
      COMMENT ON COLUMN kb.email_template_versions.change_summary IS 'Optional description of changes in this version';
      COMMENT ON COLUMN kb.email_template_versions.created_by IS 'Superadmin who created this version';

      CREATE INDEX idx_email_template_versions_template ON kb.email_template_versions(template_id);
      CREATE INDEX idx_email_template_versions_created ON kb.email_template_versions(created_at DESC);
    `);

    // 3. Add FK from email_templates to email_template_versions (circular reference)
    await queryRunner.query(`
      ALTER TABLE kb.email_templates
      ADD CONSTRAINT fk_email_templates_current_version
      FOREIGN KEY (current_version_id) REFERENCES kb.email_template_versions(id)
      ON DELETE SET NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop FK first to break circular dependency
    await queryRunner.query(`
      ALTER TABLE kb.email_templates
      DROP CONSTRAINT IF EXISTS fk_email_templates_current_version;
    `);

    // Drop indexes and tables in reverse order
    await queryRunner.query(`
      DROP INDEX IF EXISTS kb.idx_email_template_versions_created;
      DROP INDEX IF EXISTS kb.idx_email_template_versions_template;
      DROP TABLE IF EXISTS kb.email_template_versions;
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS kb.idx_email_templates_name;
      DROP TABLE IF EXISTS kb.email_templates;
    `);
  }
}
