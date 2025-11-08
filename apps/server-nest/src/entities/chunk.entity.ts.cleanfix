import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Document } from './document.entity';

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

  // Relations
  @ManyToOne(() => Document, (document) => document.chunks, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'document_id' })
  document!: Document;
}
