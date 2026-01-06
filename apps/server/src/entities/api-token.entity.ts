import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Project } from './project.entity';
import { UserProfile } from './user-profile.entity';

/**
 * API Token entity for programmatic MCP access.
 *
 * Tokens are:
 * - Project-scoped (each token belongs to one project)
 * - User-owned (created by and associated with a user)
 * - Revocable (soft-delete via revoked_at timestamp)
 * - Hashed (raw token never stored, only SHA-256 hash)
 *
 * Token format: `emt_<32-byte-hex>` (68 chars total)
 */
@Entity({ schema: 'core', name: 'api_tokens' })
@Index(['tokenHash'], { unique: true })
@Index(['projectId'])
@Index(['projectId', 'name'], { unique: true })
export class ApiToken {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'project_id', type: 'uuid' })
  projectId!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  /** Human-readable name for the token (e.g., "Claude Desktop", "Cursor IDE") */
  @Column({ type: 'varchar', length: 255 })
  name!: string;

  /** SHA-256 hash of the full token (hex-encoded, 64 chars) */
  @Column({ name: 'token_hash', type: 'varchar', length: 64 })
  tokenHash!: string;

  /** First 12 characters of the token for identification (e.g., "emt_a1b2c3d4") */
  @Column({ name: 'token_prefix', type: 'varchar', length: 12 })
  tokenPrefix!: string;

  /** Scopes granted to this token (e.g., ['schema:read', 'data:read']) */
  @Column({ type: 'text', array: true, default: '{}' })
  scopes!: string[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  /** Last time this token was used for authentication */
  @Column({ name: 'last_used_at', type: 'timestamptz', nullable: true })
  lastUsedAt!: Date | null;

  /** Revocation timestamp (null = active, timestamp = revoked) */
  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt!: Date | null;

  // Relations
  @ManyToOne(() => Project, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project!: Project;

  @ManyToOne(() => UserProfile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: UserProfile;
}
