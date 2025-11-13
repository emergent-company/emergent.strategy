import { ApiProperty } from '@nestjs/swagger';

export class ObjectVersionDto {
  @ApiProperty({ description: 'Version ID (unique for each version)' })
  id!: string;

  @ApiProperty({ description: 'Version number (incremental: 1, 2, 3...)' })
  version!: number;

  @ApiProperty({
    description: 'ID of the previous version (null for v1)',
    required: false,
  })
  supersedes_id?: string;

  @ApiProperty({
    description: 'Canonical ID (same for all versions of this object)',
  })
  canonical_id!: string;

  @ApiProperty({ description: 'Object type' })
  type!: string;

  @ApiProperty({
    description: 'Object key (business identifier)',
    required: false,
  })
  key?: string;

  @ApiProperty({ description: 'Object properties at this version' })
  properties!: Record<string, unknown>;

  @ApiProperty({ description: 'Labels at this version', type: [String] })
  labels!: string[];

  @ApiProperty({
    description: 'Summary of what changed in this version',
    required: false,
    example: {
      fields: ['role', 'email'],
      reason: 'User profile update',
      added: ['email'],
      modified: ['role'],
      removed: [],
    },
  })
  change_summary?: {
    fields?: string[]; // List of fields that changed
    reason?: string; // Why it changed
    added?: string[]; // Newly added fields
    modified?: string[]; // Changed fields
    removed?: string[]; // Deleted fields
  };

  @ApiProperty({
    description: 'Content hash for duplicate detection',
    required: false,
  })
  content_hash?: string;

  @ApiProperty({ description: 'When this version was created' })
  created_at!: string;

  @ApiProperty({
    description: 'When this version was soft-deleted',
    required: false,
  })
  deleted_at?: string | null;

  @ApiProperty({
    description: 'User who created this version',
    required: false,
  })
  created_by?: string;

  @ApiProperty({
    description: 'Extraction job that created this version',
    required: false,
  })
  extraction_job_id?: string;

  @ApiProperty({ description: 'True if this is the current (latest) version' })
  is_current!: boolean;
}
