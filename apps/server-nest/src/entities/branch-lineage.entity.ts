import { Entity, Column, PrimaryColumn, CreateDateColumn } from 'typeorm';

@Entity({ schema: 'kb', name: 'branch_lineage' })
export class BranchLineage {
  @PrimaryColumn({ name: 'branch_id', type: 'uuid' })
  branchId: string;

  @PrimaryColumn({ name: 'ancestor_branch_id', type: 'uuid' })
  ancestorBranchId: string;

  @Column({ type: 'int' })
  depth: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
