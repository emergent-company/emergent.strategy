export type WorkspaceAction =
  | 'setup'
  | 'start'
  | 'stop'
  | 'restart'
  | 'status'
  | 'logs'
  | 'test';

export interface WorkspaceCommandDescriptor {
  readonly commandId: string;
  readonly project: string;
  readonly action: WorkspaceAction;
  readonly executor: string;
  readonly script: string;
  readonly envProfile: EnvironmentProfileId;
  readonly dependsOn: readonly string[];
  readonly requiresDocker: boolean;
  readonly description: string;
}

export type EnvironmentProfileId = 'development' | 'staging' | 'production';

export interface EnvironmentProfile {
  readonly profileId: EnvironmentProfileId;
  readonly variables: Readonly<Record<string, string>>;
  readonly secretsRefs: readonly string[];
  readonly hostRequirements: readonly string[];
  readonly logRetentionDays: number;
}

export interface RestartPolicy {
  readonly maxRestarts: number;
  readonly minUptimeSec: number;
  readonly sleepBetweenMs: number;
  readonly expBackoffInitialMs: number;
  readonly expBackoffMaxMs: number;
}

export interface LogFileConfig {
  readonly outFile: string;
  readonly errorFile: string;
}

export interface HealthCheckConfig {
  readonly url?: string;
  readonly timeoutMs: number;
}

export interface ApplicationProcessProfile {
  readonly processId: string;
  readonly entryPoint: string;
  readonly cwd: string;
  readonly envProfile: EnvironmentProfileId;
  readonly args?: readonly string[];
  readonly interpreter?: string;
  readonly restartPolicy: RestartPolicy;
  readonly logs: LogFileConfig;
  readonly healthCheck?: HealthCheckConfig;
  readonly dependencies: readonly string[];
  readonly namespace: string;
  readonly defaultEnabled: boolean;
  readonly setupCommands: readonly string[];
  readonly exposedPorts?: readonly string[];
  readonly environmentOverrides?: Partial<Record<EnvironmentProfileId, Readonly<Record<string, string>>>>;
}

export type DependencyHealthCheckType = 'docker-healthcheck' | 'custom';

export interface DependencyHealthCheckConfig {
  readonly type: DependencyHealthCheckType;
  readonly command?: string;
  readonly timeoutSec: number;
}

export interface DependencyProcessProfile {
  readonly dependencyId: string;
  readonly composeService: string;
  readonly startScript: string;
  readonly stopScript: string;
  readonly envProfile: EnvironmentProfileId;
  readonly healthCheck: DependencyHealthCheckConfig;
  readonly logs: LogFileConfig;
  readonly restartPolicy: RestartPolicy;
  readonly exposedPorts?: readonly string[];
}

export type ManagedServiceType = 'application' | 'dependency';

export interface HealthSnapshotEntry {
  readonly serviceId: string;
  readonly type: ManagedServiceType;
  readonly status: 'online' | 'stopped' | 'starting' | 'failing' | 'degraded';
  readonly uptimeSec: number;
  readonly restartCount: number;
  readonly lastExitCode?: number;
  readonly healthDetail?: string;
  readonly exposedPorts?: readonly string[];
  readonly dependencyState?: readonly DependencyStateEntry[];
}

export interface DependencyStateEntry {
  readonly dependencyId: string;
  readonly status: 'online' | 'stopped' | 'starting' | 'failing' | 'degraded';
  readonly healthDetail?: string;
}

export interface UnifiedHealthSnapshot {
  readonly capturedAt: string;
  readonly services: readonly HealthSnapshotEntry[];
}

export interface LogRotationPolicy {
  readonly retentionDays: number;
  readonly maxSizeMb: number;
  readonly compress: boolean;
}

export interface SharedLogArchive {
  readonly serviceId: string;
  readonly stdoutPath: string;
  readonly stderrPath: string;
  readonly rotationPolicy: LogRotationPolicy;
  readonly archivePaths: readonly string[];
}
