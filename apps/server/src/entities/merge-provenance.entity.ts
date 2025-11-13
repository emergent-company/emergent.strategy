import { Entity, Column, PrimaryColumn, CreateDateColumn } from 'typeorm';

@Entity({ schema: 'kb', name: 'merge_provenance' })
export class MergeProvenance {
  @PrimaryColumn({ name: 'child_version_id', type: 'uuid' })
  childVersionId: string;

  @PrimaryColumn({ name: 'parent_version_id', type: 'uuid' })
  parentVersionId: string;

  @Column({ type: 'text' })
  role: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
