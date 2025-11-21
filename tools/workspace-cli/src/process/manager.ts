import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir, open } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {
  writePidFile,
  readPidFile,
  deletePidFile,
  writeMetadata,
  readMetadata,
  deleteMetadata,
  isPidRunning,
  type ProcessMetadata,
} from './pid-file.js';

const LOG_DIR = path.resolve(process.cwd(), 'logs');

export interface StartProcessOptions {
  readonly name: string;
  readonly command: string;
  readonly args?: readonly string[];
  readonly cwd?: string;
  readonly env?: Record<string, string>;
}

export interface ProcessStatus {
  readonly name: string;
  readonly running: boolean;
  readonly pid: number | null;
  readonly metadata: ProcessMetadata | null;
  readonly uptime?: number; // milliseconds
}

async function ensureLogDirectory(): Promise<void> {
  await mkdir(LOG_DIR, { recursive: true });
}

function getLogFilePaths(name: string) {
  return {
    out: path.join(LOG_DIR, `${name}.out.log`),
    error: path.join(LOG_DIR, `${name}.error.log`),
  };
}

export async function startProcess(
  options: StartProcessOptions
): Promise<number> {
  const { name, command, args = [], cwd = process.cwd(), env = {} } = options;

  // Check if already running
  const existingPid = await readPidFile(name);
  if (existingPid && isPidRunning(existingPid)) {
    throw new Error(
      `Process ${name} is already running with PID ${existingPid}`
    );
  }

  // Clean up stale PID files
  if (existingPid) {
    await deletePidFile(name);
    await deleteMetadata(name);
  }

  await ensureLogDirectory();

  const logFiles = getLogFilePaths(name);

  // Open log files
  const outFd = await open(logFiles.out, 'a');
  const errorFd = await open(logFiles.error, 'a');

  try {
    // Merge environment variables
    const processEnv = {
      ...process.env,
      ...env,
    };

    // Spawn the process
    const child: ChildProcess = spawn(command, [...args], {
      cwd,
      env: processEnv,
      detached: true,
      stdio: ['ignore', outFd.fd, errorFd.fd],
    });

    if (!child.pid) {
      throw new Error(`Failed to spawn process ${name}`);
    }

    const pid = child.pid;

    // Write PID and metadata
    await writePidFile(name, pid);
    await writeMetadata(name, {
      pid,
      name,
      command,
      args,
      cwd,
      env,
      startedAt: new Date().toISOString(),
      logFiles,
    });

    // Detach the child process so it continues running after parent exits
    child.unref();

    // Wait a bit to ensure process started successfully
    await new Promise((resolve) => setTimeout(resolve, 100));

    if (!isPidRunning(pid)) {
      await deletePidFile(name);
      await deleteMetadata(name);
      throw new Error(
        `Process ${name} failed to start. Check logs at ${logFiles.error}`
      );
    }

    return pid;
  } finally {
    // Close file descriptors
    await outFd.close();
    await errorFd.close();
  }
}

export async function stopProcess(
  name: string,
  options: { force?: boolean; timeout?: number } = {}
): Promise<void> {
  const { force = false, timeout = 10000 } = options;

  const pid = await readPidFile(name);

  if (!pid) {
    throw new Error(`No PID file found for process ${name}`);
  }

  if (!isPidRunning(pid)) {
    // Process is not running, clean up files
    await deletePidFile(name);
    await deleteMetadata(name);
    return;
  }

  try {
    // Send SIGTERM for graceful shutdown
    if (!force) {
      process.kill(pid, 'SIGTERM');

      // Wait for process to exit
      const startTime = Date.now();
      while (isPidRunning(pid)) {
        if (Date.now() - startTime > timeout) {
          // Timeout exceeded, force kill
          process.kill(pid, 'SIGKILL');
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    } else {
      // Force kill immediately
      process.kill(pid, 'SIGKILL');
    }

    // Wait a bit to ensure process is dead
    await new Promise((resolve) => setTimeout(resolve, 200));
  } catch (error: unknown) {
    // Process might already be dead
    if (error instanceof Error && 'code' in error && error.code !== 'ESRCH') {
      throw error;
    }
  } finally {
    // Clean up PID files
    await deletePidFile(name);
    await deleteMetadata(name);
  }
}

export async function getProcessStatus(name: string): Promise<ProcessStatus> {
  const pid = await readPidFile(name);
  const metadata = await readMetadata(name);

  if (!pid) {
    return {
      name,
      running: false,
      pid: null,
      metadata: null,
    };
  }

  const running = isPidRunning(pid);

  if (!running) {
    // Clean up stale files
    await deletePidFile(name);
    await deleteMetadata(name);
    return {
      name,
      running: false,
      pid,
      metadata,
    };
  }

  let uptime: number | undefined;
  if (metadata?.startedAt) {
    const startTime = new Date(metadata.startedAt).getTime();
    uptime = Date.now() - startTime;
  }

  return {
    name,
    running: true,
    pid,
    metadata,
    uptime,
  };
}

export async function restartProcess(
  options: StartProcessOptions
): Promise<number> {
  const { name } = options;

  // Try to stop if running
  const status = await getProcessStatus(name);
  if (status.running) {
    await stopProcess(name);
  }

  // Start the process
  return startProcess(options);
}

export async function listProcesses(): Promise<ProcessStatus[]> {
  const { readdir } = await import('node:fs/promises');
  const pidDir = path.resolve(process.cwd(), 'apps', 'pids');

  try {
    const files = await readdir(pidDir);
    const pidFiles = files.filter((file) => file.endsWith('.pid'));

    const statuses = await Promise.all(
      pidFiles.map(async (file) => {
        const name = file.replace('.pid', '');
        return getProcessStatus(name);
      })
    );

    return statuses;
  } catch (error) {
    // PID directory doesn't exist yet
    return [];
  }
}
