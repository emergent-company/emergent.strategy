import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

const execAsync = promisify(exec);

// Default Docker Compose file path
const DEFAULT_COMPOSE_FILE = 'docker-compose.dev.yml';
// Default Docker Compose project name
const DEFAULT_PROJECT_NAME = 'spec-server-2';

export interface DockerContainerStatus {
  readonly name: string;
  readonly running: boolean;
  readonly containerId?: string;
  readonly status?: string; // 'running', 'exited', 'paused', etc.
  readonly uptime?: string;
  readonly ports?: string;
}

/**
 * Check if a Docker Compose service is running
 */
export async function getDockerComposeServiceStatus(
  serviceName: string,
  composeFile: string = DEFAULT_COMPOSE_FILE,
  projectName: string = DEFAULT_PROJECT_NAME,
  cwd?: string
): Promise<DockerContainerStatus> {
  try {
    // Use docker compose ps with format to get structured output
    const { stdout } = await execAsync(
      `docker compose -p ${projectName} -f ${composeFile} ps --format json ${serviceName}`,
      {
        cwd: cwd || process.cwd(),
      }
    );

    if (!stdout.trim()) {
      return {
        name: serviceName,
        running: false,
      };
    }

    // Parse JSON output (may be multiple lines if multiple containers)
    const lines = stdout.trim().split('\n');
    const containers = lines.map((line) => JSON.parse(line));

    // Get the first container (should only be one per service)
    const container = containers[0];

    if (!container) {
      return {
        name: serviceName,
        running: false,
      };
    }

    return {
      name: serviceName,
      running: container.State === 'running',
      containerId: container.ID,
      status: container.State,
      uptime: container.Status,
      ports: container.Ports,
    };
  } catch (error) {
    // Docker compose not available or service not found
    return {
      name: serviceName,
      running: false,
    };
  }
}

/**
 * Check multiple Docker Compose services at once
 */
export async function getDockerComposeServicesStatus(
  serviceNames: readonly string[],
  composeFile: string = DEFAULT_COMPOSE_FILE,
  projectName: string = DEFAULT_PROJECT_NAME,
  cwd?: string
): Promise<readonly DockerContainerStatus[]> {
  return Promise.all(
    serviceNames.map((name) =>
      getDockerComposeServiceStatus(name, composeFile, projectName, cwd)
    )
  );
}

/**
 * Check if Docker is available
 */
export async function isDockerAvailable(): Promise<boolean> {
  try {
    await execAsync('docker --version');
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if Docker Compose is available
 */
export async function isDockerComposeAvailable(): Promise<boolean> {
  try {
    await execAsync('docker compose version');
    return true;
  } catch {
    return false;
  }
}

/**
 * Start a Docker Compose service
 */
export async function startDockerComposeService(
  serviceName: string,
  options: {
    detached?: boolean;
    composeFile?: string;
    projectName?: string;
    cwd?: string;
  } = {}
): Promise<void> {
  const {
    detached = true,
    composeFile = DEFAULT_COMPOSE_FILE,
    projectName = DEFAULT_PROJECT_NAME,
    cwd = process.cwd(),
  } = options;
  const detachFlag = detached ? '-d' : '';

  await execAsync(
    `docker compose -p ${projectName} -f ${composeFile} up ${detachFlag} ${serviceName}`,
    {
      cwd,
    }
  );
}

/**
 * Stop a Docker Compose service
 */
export async function stopDockerComposeService(
  serviceName: string,
  options: {
    composeFile?: string;
    projectName?: string;
    cwd?: string;
    timeout?: number;
  } = {}
): Promise<void> {
  const {
    composeFile = DEFAULT_COMPOSE_FILE,
    projectName = DEFAULT_PROJECT_NAME,
    cwd = process.cwd(),
    timeout = 10,
  } = options;

  await execAsync(
    `docker compose -p ${projectName} -f ${composeFile} stop -t ${timeout} ${serviceName}`,
    {
      cwd,
    }
  );
}

/**
 * Restart a Docker Compose service
 */
export async function restartDockerComposeService(
  serviceName: string,
  options: {
    composeFile?: string;
    projectName?: string;
    cwd?: string;
    timeout?: number;
  } = {}
): Promise<void> {
  const {
    composeFile = DEFAULT_COMPOSE_FILE,
    projectName = DEFAULT_PROJECT_NAME,
    cwd = process.cwd(),
    timeout = 10,
  } = options;

  await execAsync(
    `docker compose -p ${projectName} -f ${composeFile} restart -t ${timeout} ${serviceName}`,
    {
      cwd,
    }
  );
}
