/**
 * Workspace Client
 *
 * Self-contained module providing workspace management operations.
 * Includes health checks for services, databases, API keys, and test accounts.
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const execAsync = promisify(exec);

// =============================================================================
// Types
// =============================================================================

export interface ServiceStatus {
  readonly name: string;
  readonly type: 'application' | 'dependency' | 'external';
  readonly running: boolean;
  readonly healthy: boolean;
  readonly pid?: number | null;
  readonly port?: string;
  readonly url?: string;
  readonly uptime?: string;
  readonly latencyMs?: number;
  readonly error?: string;
  readonly details?: Record<string, unknown>;
}

export interface DependencyHealth {
  readonly name: string;
  readonly type: 'database' | 'auth' | 'ai' | 'observability' | 'external';
  readonly configured: boolean;
  readonly connected: boolean;
  readonly latencyMs?: number;
  readonly version?: string;
  readonly error?: string;
  readonly details?: Record<string, unknown>;
}

export interface ApiKeyStatus {
  readonly name: string;
  readonly configured: boolean;
  readonly valid?: boolean;
  readonly maskedValue?: string;
  readonly error?: string;
}

export interface TestAccountStatus {
  readonly name: string;
  readonly email?: string;
  readonly configured: boolean;
  readonly canAuthenticate?: boolean;
  readonly error?: string;
}

export interface WorkspaceHealth {
  readonly timestamp: string;
  readonly mode: 'local' | 'remote';
  readonly services: ServiceStatus[];
  readonly dependencies: DependencyHealth[];
  readonly apiKeys: ApiKeyStatus[];
  readonly testAccounts: TestAccountStatus[];
  readonly summary: {
    servicesHealthy: number;
    servicesTotal: number;
    dependenciesConnected: number;
    dependenciesTotal: number;
    apiKeysConfigured: number;
    apiKeysTotal: number;
    testAccountsConfigured: number;
    testAccountsTotal: number;
    overallHealthy: boolean;
  };
}

export interface ProcessInfo {
  readonly name: string;
  readonly pid: number | null;
  readonly running: boolean;
  readonly uptime?: number;
  readonly command?: string;
  readonly startedAt?: string;
}

export interface ServiceOperationResult {
  readonly service: string;
  readonly success: boolean;
  readonly message: string;
  readonly pid?: number;
  readonly error?: string;
}

// =============================================================================
// Environment Loading
// =============================================================================

/**
 * Infrastructure service .env files in emergent-infra/
 * These are loaded first (lower priority), then overridden by workspace .env files
 */
interface InfraEnvSource {
  readonly service: string;
  readonly path: string;
  readonly description: string;
}

const INFRA_ENV_SOURCES: InfraEnvSource[] = [
  {
    service: 'postgres',
    path: 'postgres/.env',
    description: 'PostgreSQL database credentials',
  },
  {
    service: 'zitadel',
    path: 'zitadel/.env',
    description: 'Zitadel auth service configuration',
  },
  {
    service: 'zitadel-local',
    path: 'zitadel/.env.local',
    description: 'Zitadel local overrides',
  },
  {
    service: 'langfuse',
    path: 'langfuse/.env',
    description: 'Langfuse observability configuration',
  },
];

export interface EnvLoadResult {
  readonly repoRoot: string | null;
  readonly infraRoot: string | null;
  readonly loadedFiles: string[];
  readonly errors: string[];
}

/**
 * Load environment variables from emergent-infra/ and workspace .env files
 *
 * Load order (later files override earlier):
 * 1. emergent-infra/postgres/.env
 * 2. emergent-infra/zitadel/.env
 * 3. emergent-infra/zitadel/.env.local
 * 4. emergent-infra/langfuse/.env
 * 5. workspace/.env
 * 6. workspace/.env.local
 */
export function loadEnvironmentVariables(): string | null {
  const result = loadAllEnvironmentVariables();
  return result.repoRoot;
}

/**
 * Load all environment variables with detailed result
 */
export function loadAllEnvironmentVariables(): EnvLoadResult {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);

  const loadedFiles: string[] = [];
  const errors: string[] = [];

  // Navigate to repo root (from dist/ or src/)
  let repoRoot = resolve(__dirname, '..', '..', '..', '..');

  // Check if we're in src/ directory during development
  if (!existsSync(resolve(repoRoot, '.env'))) {
    repoRoot = resolve(__dirname, '..', '..', '..');
  }

  // Find emergent-infra directory (sibling to repo root)
  const infraRoot = resolve(repoRoot, '..', 'emergent-infra');
  const infraExists = existsSync(infraRoot);

  // 1. Load infrastructure .env files first (lower priority)
  if (infraExists) {
    for (const source of INFRA_ENV_SOURCES) {
      const filePath = resolve(infraRoot, source.path);
      if (existsSync(filePath)) {
        try {
          loadEnvFile(filePath);
          loadedFiles.push(`infra:${source.service} (${filePath})`);
        } catch (err) {
          errors.push(
            `Failed to load ${source.service}: ${
              err instanceof Error ? err.message : String(err)
            }`
          );
        }
      }
    }
  }

  // 2. Load workspace .env files (higher priority - overrides infra)
  const envPath = resolve(repoRoot, '.env');
  const envLocalPath = resolve(repoRoot, '.env.local');

  if (existsSync(envPath)) {
    try {
      loadEnvFile(envPath);
      loadedFiles.push(`workspace:.env (${envPath})`);
    } catch (err) {
      errors.push(
        `Failed to load .env: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }

  if (existsSync(envLocalPath)) {
    try {
      loadEnvFile(envLocalPath);
      loadedFiles.push(`workspace:.env.local (${envLocalPath})`);
    } catch (err) {
      errors.push(
        `Failed to load .env.local: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }

  return {
    repoRoot: existsSync(resolve(repoRoot, '.env')) ? repoRoot : null,
    infraRoot: infraExists ? infraRoot : null,
    loadedFiles,
    errors,
  };
}

function loadEnvFile(filePath: string): void {
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      let value = match[2].trim();

      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      process.env[key] = value;
    }
  }
}

// =============================================================================
// Service Definitions
// =============================================================================

interface ServiceDefinition {
  readonly processId: string;
  readonly type: 'application' | 'dependency';
  readonly port?: string;
  readonly healthCheckUrl?: string;
  readonly cwd?: string;
}

function getServiceDefinitions(): ServiceDefinition[] {
  const adminPort = process.env.ADMIN_PORT || '5176';
  const serverPort = process.env.SERVER_PORT || '3002';

  return [
    {
      processId: 'admin',
      type: 'application',
      port: adminPort,
      healthCheckUrl: `http://localhost:${adminPort}/__workspace_health`,
      cwd: 'apps/admin',
    },
    {
      processId: 'server',
      type: 'application',
      port: serverPort,
      healthCheckUrl: `http://localhost:${serverPort}/health`,
      cwd: 'apps/server',
    },
  ];
}

// =============================================================================
// Health Check Functions
// =============================================================================

/**
 * Check HTTP endpoint health
 */
async function checkHttpHealth(
  url: string,
  timeoutMs: number = 5000
): Promise<{
  healthy: boolean;
  latencyMs: number;
  statusCode?: number;
  error?: string;
}> {
  const startTime = Date.now();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'workspace-mcp-health-check' },
    });

    clearTimeout(timeoutId);
    const latencyMs = Date.now() - startTime;

    return {
      healthy: response.ok,
      latencyMs,
      statusCode: response.status,
      error: response.ok ? undefined : `HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      healthy: false,
      latencyMs: Date.now() - startTime,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Check PostgreSQL database health
 */
async function checkPostgresHealth(): Promise<DependencyHealth> {
  const host = process.env.POSTGRES_HOST;
  const port = process.env.POSTGRES_PORT || '5432';
  const user = process.env.POSTGRES_USER;
  const password = process.env.POSTGRES_PASSWORD;
  const database = process.env.POSTGRES_DB;

  if (!host || !user || !database) {
    return {
      name: 'PostgreSQL',
      type: 'database',
      configured: false,
      connected: false,
      error: 'Missing POSTGRES_HOST, POSTGRES_USER, or POSTGRES_DB',
    };
  }

  const startTime = Date.now();

  try {
    // Use pg_isready for quick check (doesn't require password)
    const { stdout } = await execAsync(
      `pg_isready -h ${host} -p ${port} -U ${user} -d ${database} -t 5`,
      { timeout: 10000 }
    );

    const latencyMs = Date.now() - startTime;
    const accepting = stdout.includes('accepting connections');

    // Try to get version if connected
    let version: string | undefined;
    if (accepting && password) {
      try {
        const { stdout: versionOut } = await execAsync(
          `PGPASSWORD="${password}" psql -h ${host} -p ${port} -U ${user} -d ${database} -t -c "SELECT version();"`,
          { timeout: 5000 }
        );
        const match = versionOut.match(/PostgreSQL (\d+\.\d+)/);
        version = match ? match[1] : undefined;
      } catch {
        // Version check failed, but connection is ok
      }
    }

    return {
      name: 'PostgreSQL',
      type: 'database',
      configured: true,
      connected: accepting,
      latencyMs,
      version,
      details: {
        host,
        port,
        database,
        user,
      },
    };
  } catch (error) {
    return {
      name: 'PostgreSQL',
      type: 'database',
      configured: true,
      connected: false,
      latencyMs: Date.now() - startTime,
      error: error instanceof Error ? error.message : 'Connection failed',
      details: { host, port, database },
    };
  }
}

/**
 * Check Zitadel authentication service health
 */
async function checkZitadelHealth(): Promise<DependencyHealth> {
  const domain = process.env.ZITADEL_DOMAIN;
  const issuer = process.env.ZITADEL_ISSUER;

  if (!domain && !issuer) {
    return {
      name: 'Zitadel',
      type: 'auth',
      configured: false,
      connected: false,
      error: 'Missing ZITADEL_DOMAIN or ZITADEL_ISSUER',
    };
  }

  // Construct health check URL
  const baseUrl = issuer || `http://${domain}`;
  const healthUrl = `${baseUrl}/debug/healthz`;
  const oidcUrl = `${baseUrl}/.well-known/openid-configuration`;

  const startTime = Date.now();

  // Try health endpoint first
  const healthResult = await checkHttpHealth(healthUrl, 5000);

  if (healthResult.healthy) {
    return {
      name: 'Zitadel',
      type: 'auth',
      configured: true,
      connected: true,
      latencyMs: healthResult.latencyMs,
      details: { domain, issuer, healthUrl },
    };
  }

  // Fall back to OIDC discovery endpoint
  const oidcResult = await checkHttpHealth(oidcUrl, 5000);

  return {
    name: 'Zitadel',
    type: 'auth',
    configured: true,
    connected: oidcResult.healthy,
    latencyMs: oidcResult.latencyMs,
    error: oidcResult.healthy ? undefined : oidcResult.error,
    details: {
      domain,
      issuer,
      checkedUrl: oidcResult.healthy ? oidcUrl : healthUrl,
    },
  };
}

/**
 * Check Vertex AI / Google API health
 */
async function checkVertexAiHealth(): Promise<DependencyHealth> {
  const projectId = process.env.GCP_PROJECT_ID;
  const location = process.env.VERTEX_AI_LOCATION;
  const apiKey = process.env.GOOGLE_API_KEY;
  const credentials = process.env.GOOGLE_APPLICATION_CREDENTIALS;

  const hasCredentials = !!(apiKey || credentials);

  if (!projectId) {
    return {
      name: 'Vertex AI / Gemini',
      type: 'ai',
      configured: false,
      connected: false,
      error: 'Missing GCP_PROJECT_ID',
    };
  }

  // We can't easily test Vertex AI connectivity without making an API call
  // Just report configuration status
  return {
    name: 'Vertex AI / Gemini',
    type: 'ai',
    configured: hasCredentials,
    connected: hasCredentials, // Assume connected if configured
    details: {
      projectId,
      location: location || 'us-central1',
      model: process.env.VERTEX_AI_MODEL || 'gemini-2.5-flash-lite',
      hasApiKey: !!apiKey,
      hasServiceAccount: !!credentials,
    },
  };
}

/**
 * Check Langfuse observability health
 */
async function checkLangfuseHealth(): Promise<DependencyHealth> {
  const enabled = process.env.LANGFUSE_ENABLED === 'true';
  const host = process.env.LANGFUSE_HOST;
  const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
  const secretKey = process.env.LANGFUSE_SECRET_KEY;

  if (!enabled) {
    return {
      name: 'Langfuse',
      type: 'observability',
      configured: false,
      connected: false,
      details: { enabled: false },
    };
  }

  if (!host || !publicKey || !secretKey) {
    return {
      name: 'Langfuse',
      type: 'observability',
      configured: false,
      connected: false,
      error:
        'Missing LANGFUSE_HOST, LANGFUSE_PUBLIC_KEY, or LANGFUSE_SECRET_KEY',
    };
  }

  // Check Langfuse health endpoint
  const healthUrl = `${host}/api/public/health`;
  const result = await checkHttpHealth(healthUrl, 5000);

  return {
    name: 'Langfuse',
    type: 'observability',
    configured: true,
    connected: result.healthy,
    latencyMs: result.latencyMs,
    error: result.error,
    details: { host, healthUrl },
  };
}

/**
 * Check LangSmith observability health
 */
async function checkLangSmithHealth(): Promise<DependencyHealth> {
  const enabled = process.env.LANGSMITH_TRACING === 'true';
  const endpoint = process.env.LANGSMITH_ENDPOINT;
  const apiKey = process.env.LANGSMITH_API_KEY;

  if (!enabled) {
    return {
      name: 'LangSmith',
      type: 'observability',
      configured: false,
      connected: false,
      details: { enabled: false },
    };
  }

  if (!apiKey) {
    return {
      name: 'LangSmith',
      type: 'observability',
      configured: false,
      connected: false,
      error: 'Missing LANGSMITH_API_KEY',
    };
  }

  // LangSmith doesn't have a public health endpoint, just check config
  return {
    name: 'LangSmith',
    type: 'observability',
    configured: true,
    connected: true, // Assume connected if configured
    details: {
      endpoint: endpoint || 'https://api.smith.langchain.com',
      project: process.env.LANGSMITH_PROJECT,
    },
  };
}

// =============================================================================
// API Key Validation
// =============================================================================

function maskValue(value: string): string {
  if (value.length <= 8) return '***';
  return value.slice(0, 4) + '...' + value.slice(-4);
}

function getApiKeyStatuses(): ApiKeyStatus[] {
  const keys: ApiKeyStatus[] = [];

  // Google API Key
  const googleApiKey = process.env.GOOGLE_API_KEY;
  keys.push({
    name: 'GOOGLE_API_KEY',
    configured: !!googleApiKey,
    maskedValue: googleApiKey ? maskValue(googleApiKey) : undefined,
  });

  // Zitadel Client JWT
  const zitadelJwt = process.env.ZITADEL_CLIENT_JWT;
  keys.push({
    name: 'ZITADEL_CLIENT_JWT',
    configured: !!zitadelJwt,
    maskedValue: zitadelJwt ? maskValue(zitadelJwt) : undefined,
  });

  // Zitadel API JWT
  const zitadelApiJwt = process.env.ZITADEL_API_JWT;
  keys.push({
    name: 'ZITADEL_API_JWT',
    configured: !!zitadelApiJwt,
    maskedValue: zitadelApiJwt ? maskValue(zitadelApiJwt) : undefined,
  });

  // LangSmith API Key
  const langsmithKey = process.env.LANGSMITH_API_KEY;
  keys.push({
    name: 'LANGSMITH_API_KEY',
    configured: !!langsmithKey,
    maskedValue: langsmithKey ? maskValue(langsmithKey) : undefined,
  });

  // Langfuse Keys
  const langfusePublic = process.env.LANGFUSE_PUBLIC_KEY;
  const langfuseSecret = process.env.LANGFUSE_SECRET_KEY;
  keys.push({
    name: 'LANGFUSE_PUBLIC_KEY',
    configured: !!langfusePublic,
    maskedValue: langfusePublic ? maskValue(langfusePublic) : undefined,
  });
  keys.push({
    name: 'LANGFUSE_SECRET_KEY',
    configured: !!langfuseSecret,
    maskedValue: langfuseSecret ? maskValue(langfuseSecret) : undefined,
  });

  // Database Password
  const dbPassword = process.env.POSTGRES_PASSWORD;
  keys.push({
    name: 'POSTGRES_PASSWORD',
    configured: !!dbPassword,
    maskedValue: dbPassword ? '***' : undefined,
  });

  return keys;
}

// =============================================================================
// Test Account Validation
// =============================================================================

function getTestAccountStatuses(): TestAccountStatus[] {
  const accounts: TestAccountStatus[] = [];

  // Manual Test User
  const testEmail = process.env.TEST_USER_EMAIL;
  const testPassword = process.env.TEST_USER_PASSWORD;
  accounts.push({
    name: 'TEST_USER (Manual Testing)',
    email: testEmail,
    configured: !!(testEmail && testPassword),
  });

  // E2E Test User
  const e2eEmail = process.env.E2E_TEST_USER_EMAIL;
  const e2ePassword = process.env.E2E_TEST_USER_PASSWORD;
  accounts.push({
    name: 'E2E_TEST_USER (Automated Tests)',
    email: e2eEmail,
    configured: !!(e2eEmail && e2ePassword),
  });

  return accounts;
}

// =============================================================================
// Process Management
// =============================================================================

const PID_DIR = 'apps/pids';

async function readPidFile(name: string): Promise<number | null> {
  const pidPath = resolve(process.cwd(), PID_DIR, `${name}.pid`);

  if (!existsSync(pidPath)) {
    return null;
  }

  try {
    const content = readFileSync(pidPath, 'utf-8').trim();
    const pid = parseInt(content, 10);
    return isNaN(pid) ? null : pid;
  } catch {
    return null;
  }
}

function isPidRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function getProcessStatus(name: string): Promise<ProcessInfo> {
  const pid = await readPidFile(name);

  if (!pid) {
    return { name, pid: null, running: false };
  }

  const running = isPidRunning(pid);

  return {
    name,
    pid,
    running,
  };
}

// =============================================================================
// Main Health Check Function
// =============================================================================

/**
 * Get comprehensive workspace health status
 */
export async function getWorkspaceHealth(): Promise<WorkspaceHealth> {
  const isRemoteMode = process.env.SKIP_DOCKER_DEPS === 'true';
  const services: ServiceStatus[] = [];
  const dependencies: DependencyHealth[] = [];

  // Check application services
  const serviceDefinitions = getServiceDefinitions();

  for (const def of serviceDefinitions) {
    const processInfo = await getProcessStatus(def.processId);
    let healthy = false;
    let latencyMs: number | undefined;
    let error: string | undefined;

    if (processInfo.running && def.healthCheckUrl) {
      const healthResult = await checkHttpHealth(def.healthCheckUrl);
      healthy = healthResult.healthy;
      latencyMs = healthResult.latencyMs;
      error = healthResult.error;
    }

    services.push({
      name: def.processId,
      type: def.type,
      running: processInfo.running,
      healthy,
      pid: processInfo.pid,
      port: def.port,
      url: def.healthCheckUrl,
      latencyMs,
      error: processInfo.running ? error : 'Not running',
    });
  }

  // Check dependencies
  const [postgres, zitadel, vertexAi, langfuse, langsmith] = await Promise.all([
    checkPostgresHealth(),
    checkZitadelHealth(),
    checkVertexAiHealth(),
    checkLangfuseHealth(),
    checkLangSmithHealth(),
  ]);

  dependencies.push(postgres, zitadel, vertexAi, langfuse, langsmith);

  // Get API key statuses
  const apiKeys = getApiKeyStatuses();

  // Get test account statuses
  const testAccounts = getTestAccountStatuses();

  // Calculate summary
  const servicesHealthy = services.filter((s) => s.healthy).length;
  const dependenciesConnected = dependencies.filter((d) => d.connected).length;
  const apiKeysConfigured = apiKeys.filter((k) => k.configured).length;
  const testAccountsConfigured = testAccounts.filter(
    (a) => a.configured
  ).length;

  // Overall health: core services running and database connected
  const coreHealthy = services.some((s) => s.name === 'server' && s.healthy);
  const dbConnected = postgres.connected;
  const overallHealthy = coreHealthy && dbConnected;

  return {
    timestamp: new Date().toISOString(),
    mode: isRemoteMode ? 'remote' : 'local',
    services,
    dependencies,
    apiKeys,
    testAccounts,
    summary: {
      servicesHealthy,
      servicesTotal: services.length,
      dependenciesConnected,
      dependenciesTotal: dependencies.length,
      apiKeysConfigured,
      apiKeysTotal: apiKeys.length,
      testAccountsConfigured,
      testAccountsTotal: testAccounts.length,
      overallHealthy,
    },
  };
}

/**
 * Get status of a specific service
 */
export async function getServiceHealth(
  serviceName: string
): Promise<ServiceStatus | null> {
  const definitions = getServiceDefinitions();
  const def = definitions.find((d) => d.processId === serviceName);

  if (!def) {
    return null;
  }

  const processInfo = await getProcessStatus(serviceName);
  let healthy = false;
  let latencyMs: number | undefined;
  let error: string | undefined;

  if (processInfo.running && def.healthCheckUrl) {
    const healthResult = await checkHttpHealth(def.healthCheckUrl);
    healthy = healthResult.healthy;
    latencyMs = healthResult.latencyMs;
    error = healthResult.error;
  }

  return {
    name: def.processId,
    type: def.type,
    running: processInfo.running,
    healthy,
    pid: processInfo.pid,
    port: def.port,
    url: def.healthCheckUrl,
    latencyMs,
    error: processInfo.running ? error : 'Not running',
  };
}

/**
 * Check health of a specific dependency
 */
export async function getDependencyHealth(
  dependencyName: string
): Promise<DependencyHealth | null> {
  const normalizedName = dependencyName.toLowerCase();

  switch (normalizedName) {
    case 'postgres':
    case 'postgresql':
    case 'database':
    case 'db':
      return checkPostgresHealth();

    case 'zitadel':
    case 'auth':
    case 'authentication':
      return checkZitadelHealth();

    case 'vertex':
    case 'vertexai':
    case 'vertex-ai':
    case 'gemini':
    case 'ai':
      return checkVertexAiHealth();

    case 'langfuse':
      return checkLangfuseHealth();

    case 'langsmith':
      return checkLangSmithHealth();

    default:
      return null;
  }
}

/**
 * List all configured services (without checking health)
 */
export function listServices(): Array<{
  name: string;
  type: string;
  port?: string;
  healthCheckUrl?: string;
}> {
  return getServiceDefinitions().map((def) => ({
    name: def.processId,
    type: def.type,
    port: def.port,
    healthCheckUrl: def.healthCheckUrl,
  }));
}
