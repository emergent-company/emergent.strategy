import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity({ schema: 'kb', name: 'graph_embedding_jobs' })
@Index(['objectId'])
@Index(['status'])
export class GraphEmbeddingJob {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'object_id', type: 'uuid' })
  objectId!: string;

  @Column({ type: 'text' })
  status!: string;

  @Column({ name: 'attempt_count', type: 'int', default: 0 })
  attemptCount!: number;

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError!: string | null;

  @Column({ type: 'int', default: 0 })
  priority!: number;

  @Column({ name: 'scheduled_at', type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  scheduledAt!: Date;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt!: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
