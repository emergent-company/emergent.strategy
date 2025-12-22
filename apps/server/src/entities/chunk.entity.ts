import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import type { Document } from './document.entity';

/**
 * Metadata stored with each chunk to track chunking strategy and offsets.
 */
export interface ChunkMetadata {
  /** The chunking strategy used: 'character' | 'sentence' | 'paragraph' */
  strategy: 'character' | 'sentence' | 'paragraph';
  /** Character offset in original document where this chunk starts */
  startOffset: number;
  /** Character offset in original document where this chunk ends */
  endOffset: number;
  /** The type of boundary that ended this chunk */
  boundaryType: 'sentence' | 'paragraph' | 'character' | 'section';
}

@Entity({ schema: 'kb', name: 'chunks' })
@Index(['documentId', 'chunkIndex'], { unique: true })
@Index(['documentId'])
export class Chunk {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'document_id', type: 'uuid' })
  documentId!: string;

  @Column({ name: 'chunk_index', type: 'int' })
  chunkIndex!: number;

  @Column({ type: 'text' })
  text!: string;

  @Column({ type: 'vector', length: 768, nullable: true })
  embedding!: number[] | null;

  @Column({ type: 'tsvector', nullable: true })
  tsv!: any | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: ChunkMetadata | null;

  // Relations
  @ManyToOne('Document', 'chunks', {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'document_id' })
  document!: Document;
}
