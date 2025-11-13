import { Entity, Column, PrimaryColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity({ schema: 'kb', name: 'settings' })
export class Setting {
  @PrimaryColumn({ type: 'text' })
  key: string;

  @Column({ type: 'jsonb', default: {} })
  value: Record<string, any>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
