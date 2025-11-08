import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
} from 'typeorm';

@Entity({ schema: 'kb', name: 'audit_log' })
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @CreateDateColumn({ type: 'timestamptz' })
  timestamp: Date;

  @Column({ name: 'event_type', type: 'text' })
  eventType: string;

  @Column({ type: 'text' })
  outcome: string;

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId: string | null;

  @Column({ name: 'user_email', type: 'text', nullable: true })
  userEmail: string | null;

  @Column({ name: 'resource_type', type: 'text', nullable: true })
  resourceType: string | null;

  @Column({ name: 'resource_id', type: 'text', nullable: true })
  resourceId: string | null;

  @Column({ type: 'text' })
  action: string;

  @Column({ type: 'text' })
  endpoint: string;

  @Column({ name: 'http_method', type: 'text' })
  httpMethod: string;

  @Column({ name: 'status_code', type: 'int', nullable: true })
  statusCode: number | null;

  @Column({ name: 'error_code', type: 'text', nullable: true })
  errorCode: string | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string | null;

  @Column({ name: 'ip_address', type: 'text', nullable: true })
  ipAddress: string | null;

  @Column({ name: 'user_agent', type: 'text', nullable: true })
  userAgent: string | null;

  @Column({ name: 'request_id', type: 'text', nullable: true })
  requestId: string | null;

  @Column({ type: 'jsonb', nullable: true })
  details: Record<string, any> | null;
}
