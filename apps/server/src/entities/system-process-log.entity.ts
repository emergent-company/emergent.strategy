import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
} from 'typeorm';

@Entity({ schema: 'kb', name: 'system_process_logs' })
export class SystemProcessLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'process_id', type: 'text' })
  processId: string;

  @Column({ name: 'process_type', type: 'text' })
  processType: string;

  @Column({ type: 'text' })
  level: string;

  @Column({ type: 'text' })
  message: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any> | null;

  @Column({ name: 'langfuse_trace_id', type: 'text', nullable: true })
  langfuseTraceId: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  timestamp: Date;
}
