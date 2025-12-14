import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  Unique,
} from 'typeorm';
import { GraphObject } from './graph-object.entity';
import { Chunk } from './chunk.entity';
import { ObjectExtractionJob } from './object-extraction-job.entity';

/**
 * ObjectChunk entity - Join table for object-to-chunk provenance tracking
 *
 * This table links graph objects to the source chunks they were extracted from,
 * providing proper provenance tracking for the object refinement feature.
 *
 * Use cases:
 * - Track which chunks an object was extracted from
 * - Provide source context for object refinement chat
 * - Enable audit trail from objects back to source documents
 */
@Entity({ schema: 'kb', name: 'object_chunks' })
@Unique(['objectId', 'chunkId'])
@Index(['objectId'])
@Index(['chunkId'])
@Index(['extractionJobId'])
export class ObjectChunk {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'object_id', type: 'uuid' })
  objectId!: string;

  @Column({ name: 'chunk_id', type: 'uuid' })
  chunkId!: string;

  @Column({ name: 'extraction_job_id', type: 'uuid', nullable: true })
  extractionJobId!: string | null;

  @Column({ type: 'real', nullable: true })
  confidence!: number | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  // Relations
  @ManyToOne(() => GraphObject, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'object_id' })
  object!: GraphObject;

  @ManyToOne(() => Chunk, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'chunk_id' })
  chunk!: Chunk;

  @ManyToOne(() => ObjectExtractionJob, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'extraction_job_id' })
  extractionJob!: ObjectExtractionJob | null;
}
