import { Entity, Column, PrimaryColumn, CreateDateColumn } from 'typeorm';

@Entity({ schema: 'kb', name: 'product_version_members' })
export class ProductVersionMember {
  @PrimaryColumn({ name: 'product_version_id', type: 'uuid' })
  productVersionId: string;

  @PrimaryColumn({ name: 'object_canonical_id', type: 'uuid' })
  objectCanonicalId: string;

  @Column({ name: 'object_version_id', type: 'uuid' })
  objectVersionId: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
