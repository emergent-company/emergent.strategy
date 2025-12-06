import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * UserRecentItem Entity
 * Tracks recently accessed documents and objects per user for quick navigation.
 * Stored in the 'kb' schema as 'user_recent_items'.
 */
@Entity({ schema: 'kb', name: 'user_recent_items' })
@Index(['userId', 'projectId', 'accessedAt'])
@Index(['userId', 'projectId', 'resourceType', 'resourceId'], { unique: true })
export class UserRecentItem {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /**
   * Zitadel user ID - identifies which user accessed the resource
   */
  @Column({ name: 'user_id', type: 'text' })
  userId!: string;

  /**
   * Project scope - activity is tracked per project
   */
  @Column({ name: 'project_id', type: 'uuid' })
  projectId!: string;

  /**
   * Type of resource: 'document' or 'object'
   */
  @Column({ name: 'resource_type', type: 'varchar', length: 20 })
  resourceType!: 'document' | 'object';

  /**
   * UUID of the document or graph object
   */
  @Column({ name: 'resource_id', type: 'uuid' })
  resourceId!: string;

  /**
   * Denormalized resource name for display (filename or object name)
   * May become stale if resource is renamed - this is acceptable
   */
  @Column({ name: 'resource_name', type: 'text', nullable: true })
  resourceName!: string | null;

  /**
   * Additional type info: MIME type for documents, object type for objects
   */
  @Column({ name: 'resource_subtype', type: 'text', nullable: true })
  resourceSubtype!: string | null;

  /**
   * Type of action: 'viewed' or 'edited'
   */
  @Column({ name: 'action_type', type: 'varchar', length: 20 })
  actionType!: 'viewed' | 'edited';

  /**
   * When the resource was last accessed (updated on each access)
   */
  @Column({ name: 'accessed_at', type: 'timestamptz' })
  accessedAt!: Date;

  /**
   * When this record was first created
   */
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
