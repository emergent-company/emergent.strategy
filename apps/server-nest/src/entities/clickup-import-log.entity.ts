import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
} from 'typeorm';

@Entity({ schema: 'kb', name: 'clickup_import_logs' })
export class ClickUpImportLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'integration_id', type: 'uuid' })
  integrationId: string;

  @Column({ name: 'import_session_id', type: 'text' })
  importSessionId: string;

  @CreateDateColumn({ name: 'logged_at', type: 'timestamptz' })
  loggedAt: Date;

  @Column({ name: 'step_index', type: 'int' })
  stepIndex: number;

  @Column({ name: 'operation_type', type: 'text' })
  operationType: string;

  @Column({ name: 'operation_name', type: 'text', nullable: true })
  operationName: string | null;

  @Column({ type: 'text' })
  status: string;

  @Column({ name: 'input_data', type: 'jsonb', nullable: true })
  inputData: Record<string, any> | null;

  @Column({ name: 'output_data', type: 'jsonb', nullable: true })
  outputData: Record<string, any> | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string | null;

  @Column({ name: 'error_stack', type: 'text', nullable: true })
  errorStack: string | null;

  @Column({ name: 'duration_ms', type: 'int', nullable: true })
  durationMs: number | null;

  @Column({ name: 'items_processed', type: 'int', nullable: true })
  itemsProcessed: number | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
