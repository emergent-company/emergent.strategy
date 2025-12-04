/**
 * Entity representing a system process log entry
 */
export interface SystemProcessLog {
  id: string;
  processId: string;
  processType: string;
  level: 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  message: string;
  metadata?: Record<string, any>;
  timestamp: Date;
  orgId?: string;
  projectId?: string;
  langfuseTraceId?: string;
}

/**
 * Input for creating a system process log
 */
export interface CreateSystemProcessLogInput {
  processId: string;
  processType: string;
  level: 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  message: string;
  metadata?: Record<string, any>;
  orgId?: string;
  projectId?: string;
  langfuseTraceId?: string;
}
