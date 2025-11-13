import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
} from 'typeorm';

@Entity({ schema: 'kb', name: 'object_extraction_logs' })
export class ObjectExtractionLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'extraction_job_id', type: 'uuid' })
  extractionJobId: string;

  @CreateDateColumn({ name: 'started_at', type: 'timestamptz' })
  startedAt: Date;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @Column({ name: 'step_index', type: 'int' })
  stepIndex: number;

  @Column({ name: 'operation_type', type: 'text' })
  operationType: string;

  @Column({ name: 'operation_name', type: 'text', nullable: true })
  operationName: string | null;

  @Column({ type: 'text' })
  step: string;

  @Column({ type: 'text' })
  status: string;

  @Column({ type: 'text', nullable: true })
  message: string | null;

  @Column({ name: 'input_data', type: 'jsonb', nullable: true })
  inputData: Record<string, any> | null;

  @Column({ name: 'output_data', type: 'jsonb', nullable: true })
  outputData: Record<string, any> | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string | null;

  @Column({ name: 'error_stack', type: 'text', nullable: true })
  errorStack: string | null;

  @Column({ name: 'error_details', type: 'jsonb', nullable: true })
  errorDetails: Record<string, any> | null;

  @Column({ name: 'duration_ms', type: 'int', nullable: true })
  durationMs: number | null;

  @Column({ name: 'tokens_used', type: 'int', nullable: true })
  tokensUsed: number | null;

  @Column({ name: 'entity_count', type: 'int', nullable: true })
  entityCount: number | null;

  @Column({ name: 'relationship_count', type: 'int', nullable: true })
  relationshipCount: number | null;
}
