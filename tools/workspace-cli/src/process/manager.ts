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
  /**
   * How long to wait (ms) before declaring the process started.
   * During this period, if the process exits, it's considered a startup failure.
   * Default: 2000ms
   */
  readonly startupWaitMs?: number;
  /**
   * Port to wait for during restart (ensures old process releases the socket)
   */
  readonly port?: number;
  /**
   * How long to wait (ms) for the port to become free during restart.
   * Default: 3000ms
   */
  readonly waitForPortMs?: number;
}

export interface StartProcessResult {
  readonly pid: number;
  readonly startedSuccessfully: boolean;
  readonly errorMessage?: string;
}

export interface ProcessStatus {
  readonly name: string;
  readonly running: boolean;
  readonly pid: number | null;
  readonly metadata: ProcessMetadata | null;
  readonly uptime?: number; // milliseconds
}

async function ensureLogDirectory(serviceDir: string): Promise<void> {
  await mkdir(serviceDir, { recursive: true });
}

function getLogFilePaths(name: string) {
  // Each service gets its own subdirectory: logs/{service}/
  const serviceDir = path.join(LOG_DIR, name);
  return {
    dir: serviceDir,
    out: path.join(serviceDir, `${name}.out.log`),
    error: path.join(serviceDir, `${name}.error.log`),
  };
}

export async function startProcess(
  options: StartProcessOptions
): Promise<StartProcessResult> {
  const {
    name,
    command,
    args = [],
    cwd = process.cwd(),
    env = {},
    startupWaitMs = 2000,
  } = options;

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

  const logFiles = getLogFilePaths(name);

  // Ensure service log directory exists
  await ensureLogDirectory(logFiles.dir);

  // Open log files
  const outFd = await open(logFiles.out, 'a');
  const errorFd = await open(logFiles.error, 'a');

  try {
    // Merge environment variables
    const processEnv = {
      ...process.env,
      ...env,
    };

    // Track if process exited during startup
    let exitedDuringStartup = false;
    let exitCode: number | null = null;

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

    // Listen for early exit during startup period
    child.on('exit', (code) => {
      exitedDuringStartup = true;
      exitCode = code;
    });

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
      logFiles: {
        out: logFiles.out,
        error: logFiles.error,
      },
    });

    // Detach the child process so it continues running after parent exits
    child.unref();

    // Wait for startup period to detect early failures
    // Check periodically during startup wait
    const checkInterval = 200;
    const checks = Math.ceil(startupWaitMs / checkInterval);

    for (let i = 0; i < checks; i++) {
      await new Promise((resolve) => setTimeout(resolve, checkInterval));

      // Check if process exited during startup
      if (exitedDuringStartup || !isPidRunning(pid)) {
        await deletePidFile(name);
        await deleteMetadata(name);
        const errorMsg =
          exitCode !== null
            ? `Process ${name} exited with code ${exitCode} during startup. Check logs at ${logFiles.error}`
            : `Process ${name} failed to start. Check logs at ${logFiles.error}`;
        return {
          pid,
          startedSuccessfully: false,
          errorMessage: errorMsg,
        };
      }
    }

    return {
      pid,
      startedSuccessfully: true,
    };
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
    // Kill the entire process group (negative PID kills the process group)
    // This ensures child processes spawned by npm/shell are also terminated
    const signal = force ? 'SIGKILL' : 'SIGTERM';

    try {
      // Try to kill process group first (negative pid)
      process.kill(-pid, signal);
    } catch (pgError) {
      // If process group kill fails (e.g., not a process group leader),
      // fall back to killing just the process
      process.kill(pid, signal);
    }

    if (!force) {
      // Wait for process to exit
      const startTime = Date.now();
      while (isPidRunning(pid)) {
        if (Date.now() - startTime > timeout) {
          // Timeout exceeded, force kill process group
          try {
            process.kill(-pid, 'SIGKILL');
          } catch {
            process.kill(pid, 'SIGKILL');
          }
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
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
): Promise<StartProcessResult> {
  const { name, waitForPortMs = 3000, port } = options;

  // Try to stop if running
  const status = await getProcessStatus(name);
  if (status.running) {
    await stopProcess(name);

    // If a port is specified, wait for it to become available
    // This ensures the old process has fully released the socket
    if (port) {
      const startTime = Date.now();
      while (Date.now() - startTime < waitForPortMs) {
        const isPortFree = await checkPortFree(port);
        if (isPortFree) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    } else {
      // Default wait to ensure socket cleanup
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  // Start the process
  return startProcess(options);
}

/**
 * Check if a port is free (not in use)
 */
async function checkPortFree(port: number): Promise<boolean> {
  const net = await import('node:net');
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => {
      resolve(false); // Port is in use
    });
    server.once('listening', () => {
      server.close();
      resolve(true); // Port is free
    });
    server.listen(port, '127.0.0.1');
  });
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
