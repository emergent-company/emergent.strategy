import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Add API Tokens
 *
 * Creates core.api_tokens table for MCP programmatic access.
 *
 * Tokens are:
 * - Project-scoped (each token belongs to one project)
 * - User-owned (created by and associated with a user)
 * - Revocable (soft-delete via revoked_at timestamp)
 * - Hashed (raw token never stored, only SHA-256 hash)
 *
 * Token format: `emt_<32-byte-hex>` (68 chars total)
 */
export class AddApiTokens1767194000000 implements MigrationInterface {
  name = 'AddApiTokens1767194000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE core.api_tokens (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        project_id UUID NOT NULL REFERENCES kb.projects(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES core.user_profiles(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        token_hash VARCHAR(64) NOT NULL,
        token_prefix VARCHAR(12) NOT NULL,
        scopes TEXT[] NOT NULL DEFAULT '{}',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_used_at TIMESTAMPTZ,
        revoked_at TIMESTAMPTZ,

        CONSTRAINT api_tokens_token_hash_unique UNIQUE (token_hash),
        CONSTRAINT api_tokens_project_name_unique UNIQUE (project_id, name)
      );

      COMMENT ON TABLE core.api_tokens IS 'API tokens for programmatic MCP access';
      COMMENT ON COLUMN core.api_tokens.project_id IS 'Project this token grants access to';
      COMMENT ON COLUMN core.api_tokens.user_id IS 'User who created and owns this token';
      COMMENT ON COLUMN core.api_tokens.name IS 'Human-readable name (e.g., Claude Desktop, Cursor IDE)';
      COMMENT ON COLUMN core.api_tokens.token_hash IS 'SHA-256 hash of full token (hex, 64 chars)';
      COMMENT ON COLUMN core.api_tokens.token_prefix IS 'First 12 chars for identification (e.g., emt_a1b2c3d4)';
      COMMENT ON COLUMN core.api_tokens.scopes IS 'Granted scopes (schema:read, data:read, data:write)';
      COMMENT ON COLUMN core.api_tokens.last_used_at IS 'Last authentication timestamp';
      COMMENT ON COLUMN core.api_tokens.revoked_at IS 'Revocation timestamp (null = active)';

      CREATE INDEX idx_api_tokens_project_id ON core.api_tokens(project_id);
      CREATE INDEX idx_api_tokens_user_id ON core.api_tokens(user_id);
      CREATE INDEX idx_api_tokens_token_hash ON core.api_tokens(token_hash);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS core.idx_api_tokens_token_hash;
      DROP INDEX IF EXISTS core.idx_api_tokens_user_id;
      DROP INDEX IF EXISTS core.idx_api_tokens_project_id;
      DROP TABLE IF EXISTS core.api_tokens;
    `);
  }
}
