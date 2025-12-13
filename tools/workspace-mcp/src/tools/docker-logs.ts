/**
 * Docker Logs Tool
 *
 * Query logs from Docker containers running infrastructure dependencies.
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

export const dockerLogsSchema = {
  type: 'object' as const,
  properties: {
    container: {
      type: 'string',
      description:
        'Container name or alias. Aliases: "postgres", "zitadel", "langfuse", "langfuse-worker", "redis", "clickhouse", "minio", "nli-verifier". Or use full container name.',
    },
    lines: {
      type: 'number',
      description: 'Number of lines to retrieve (default: 100)',
    },
    since: {
      type: 'string',
      description:
        'Show logs since timestamp (e.g., "10m", "1h", "2024-01-01T00:00:00")',
    },
    grep: {
      type: 'string',
      description: 'Filter logs by pattern (case-insensitive)',
    },
  },
  required: ['container'],
};

export interface DockerLogsInput {
  container: string;
  lines?: number;
  since?: string;
  grep?: string;
}

// Map friendly names to actual container names
const CONTAINER_ALIASES: Record<string, string[]> = {
  postgres: ['emergent-postgres', 'langfuse-postgres-1'],
  'emergent-db': ['emergent-postgres'],
  zitadel: ['zitadel-zitadel-1'],
  'zitadel-login': ['zitadel-login-1'],
  'zitadel-db': ['zitadel-db-1'],
  langfuse: ['langfuse-langfuse-web-1'],
  'langfuse-web': ['langfuse-langfuse-web-1'],
  'langfuse-worker': ['langfuse-langfuse-worker-1'],
  'langfuse-postgres': ['langfuse-postgres-1'],
  redis: ['langfuse-redis-1'],
  clickhouse: ['langfuse-clickhouse-1'],
  minio: ['langfuse-minio-1'],
  'nli-verifier': ['nli-verifier'],
  nli: ['nli-verifier'],
};

async function getRunningContainers(): Promise<string[]> {
  try {
    const { stdout } = await execAsync('docker ps --format "{{.Names}}"', {
      timeout: 5000,
    });
    return stdout.trim().split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

function resolveContainerName(
  alias: string,
  runningContainers: string[]
): string | null {
  // Check if it's a direct container name
  if (runningContainers.includes(alias)) {
    return alias;
  }

  // Check aliases
  const candidates = CONTAINER_ALIASES[alias.toLowerCase()];
  if (candidates) {
    for (const candidate of candidates) {
      if (runningContainers.includes(candidate)) {
        return candidate;
      }
    }
  }

  // Fuzzy match - find container that includes the alias
  const fuzzyMatch = runningContainers.find(
    (c) =>
      c.toLowerCase().includes(alias.toLowerCase()) ||
      alias.toLowerCase().includes(c.toLowerCase())
  );

  return fuzzyMatch || null;
}

export async function dockerLogsTool(input: DockerLogsInput): Promise<string> {
  const { container, lines = 100, since, grep } = input;

  const runningContainers = await getRunningContainers();

  if (runningContainers.length === 0) {
    return `# Docker Logs Error

No Docker containers are running, or Docker is not available.

**Troubleshooting:**
- Check if Docker daemon is running: \`systemctl status docker\`
- Check Docker connectivity: \`docker ps\``;
  }

  const resolvedContainer = resolveContainerName(container, runningContainers);

  if (!resolvedContainer) {
    const availableAliases = Object.keys(CONTAINER_ALIASES).join(', ');
    return `# Docker Logs Error

Container "${container}" not found.

**Running containers:**
${runningContainers.map((c) => `- ${c}`).join('\n')}

**Available aliases:**
${availableAliases}

**Usage examples:**
- \`container: "postgres"\` - Emergent PostgreSQL
- \`container: "zitadel"\` - Zitadel auth service
- \`container: "langfuse"\` - Langfuse web UI
- \`container: "langfuse-worker"\` - Langfuse background worker`;
  }

  // Build docker logs command
  const args: string[] = ['docker', 'logs'];

  if (lines) {
    args.push('--tail', String(lines));
  }

  if (since) {
    args.push('--since', since);
  }

  args.push(resolvedContainer);

  try {
    const { stdout, stderr } = await execAsync(args.join(' '), {
      timeout: 30000,
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
    });

    // Combine stdout and stderr (many containers log to stderr)
    let logs = (stdout + '\n' + stderr).trim();

    // Apply grep filter if specified
    if (grep && logs) {
      const pattern = new RegExp(grep, 'i');
      const filteredLines = logs
        .split('\n')
        .filter((line) => pattern.test(line));
      logs = filteredLines.join('\n');

      if (filteredLines.length === 0) {
        return `# Docker Logs: ${resolvedContainer}

No logs matching pattern "${grep}" found in the last ${lines} lines.`;
      }
    }

    if (!logs) {
      return `# Docker Logs: ${resolvedContainer}

(no logs available)`;
    }

    const header = `# Docker Logs: ${resolvedContainer}

**Container:** ${resolvedContainer}
**Lines:** ${lines}${since ? `\n**Since:** ${since}` : ''}${
      grep ? `\n**Filter:** ${grep}` : ''
    }

---

`;

    return header + logs;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `# Docker Logs Error

Failed to get logs for container "${resolvedContainer}".

**Error:** ${message}

**Troubleshooting:**
- Check if container is running: \`docker ps | grep ${resolvedContainer}\`
- Check container status: \`docker inspect ${resolvedContainer}\``;
  }
}

export const listContainersSchema = {
  type: 'object' as const,
  properties: {
    all: {
      type: 'boolean',
      description: 'Include stopped containers (default: false)',
    },
  },
  required: [],
};

export interface ListContainersInput {
  all?: boolean;
}

export async function listContainersTool(
  input: ListContainersInput
): Promise<string> {
  const { all = false } = input;

  const args = [
    'docker',
    'ps',
    '--format',
    '"{{.Names}}\\t{{.Image}}\\t{{.Status}}"',
  ];
  if (all) {
    args.splice(2, 0, '-a');
  }

  try {
    const { stdout } = await execAsync(args.join(' '), { timeout: 10000 });
    const lines = stdout.trim().split('\n').filter(Boolean);

    if (lines.length === 0) {
      return `# Docker Containers

No ${all ? '' : 'running '}containers found.`;
    }

    const result: string[] = ['# Docker Containers', ''];

    if (!all) {
      result.push(
        '*Showing running containers only. Use `all: true` to include stopped.*'
      );
      result.push('');
    }

    result.push('| Container | Image | Status |');
    result.push('|-----------|-------|--------|');

    for (const line of lines) {
      const cleaned = line.replace(/"/g, '');
      const [name, image, ...statusParts] = cleaned.split('\t');
      const status = statusParts.join(' ');
      result.push(`| ${name} | ${image} | ${status} |`);
    }

    result.push('');
    result.push('## Quick Aliases');
    result.push('');
    result.push('Use these aliases with the `docker_logs` tool:');
    result.push('- `postgres` - Emergent PostgreSQL database');
    result.push('- `zitadel` - Zitadel authentication service');
    result.push('- `langfuse` - Langfuse web UI');
    result.push('- `langfuse-worker` - Langfuse background worker');
    result.push('- `redis` - Langfuse Redis cache');
    result.push('- `clickhouse` - Langfuse ClickHouse analytics');
    result.push('- `nli-verifier` - NLI verification service');

    return result.join('\n');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `# Docker Error

Failed to list containers.

**Error:** ${message}

**Troubleshooting:**
- Check if Docker daemon is running: \`systemctl status docker\`
- Check Docker permissions: \`docker ps\``;
  }
}
