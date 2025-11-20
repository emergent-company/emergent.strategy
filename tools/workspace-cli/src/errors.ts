export interface WorkspaceCliErrorDetails {
  readonly serviceId?: string;
  readonly profile?: string;
  readonly action?: string;
  readonly attempts?: number;
  readonly maxRestarts?: number;
  readonly lastExitCode?: number | null;
  readonly recommendation?: string;
  readonly status?: string;
  readonly namespace?: string;
  readonly context?: string;
  readonly processName?: string;
  readonly expectedNamespace?: string;
  readonly ecosystemNamespace?: string;
}

export class WorkspaceCliError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: WorkspaceCliErrorDetails
  ) {
    super(message);
    this.name = 'WorkspaceCliError';
  }
}

export function isWorkspaceCliError(
  error: unknown
): error is WorkspaceCliError {
  return error instanceof WorkspaceCliError;
}
