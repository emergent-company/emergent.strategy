import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Chunk } from './chunk.entity';

@Entity({ schema: 'kb', name: 'chunk_embedding_jobs' })
@Index(['chunkId'])
@Index(['status'])
export class ChunkEmbeddingJob {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'chunk_id', type: 'uuid' })
  chunkId!: string;

  @ManyToOne(() => Chunk, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'chunk_id' })
  chunk?: Chunk;

  @Column({ type: 'text', default: 'pending' })
  status!: string;

  @Column({ name: 'attempt_count', type: 'int', default: 0 })
  attemptCount!: number;

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError!: string | null;

  @Column({ type: 'int', default: 0 })
  priority!: number;

  @Column({
    name: 'scheduled_at',
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
  })
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
