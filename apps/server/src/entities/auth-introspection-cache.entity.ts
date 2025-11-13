import {
  Entity,
  Column,
  PrimaryColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity({ schema: 'kb', name: 'auth_introspection_cache' })
@Index(['expiresAt'])
export class AuthIntrospectionCache {
  @PrimaryColumn({ name: 'token_hash', type: 'varchar', length: 128 })
  tokenHash!: string;

  @Column({ name: 'introspection_data', type: 'jsonb' })
  introspectionData!: Record<string, any>;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
