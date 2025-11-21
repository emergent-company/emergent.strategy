import { readFile, writeFile, unlink, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const PID_DIR = path.resolve(process.cwd(), 'apps', 'pids');

export interface ProcessMetadata {
  readonly pid: number;
  readonly name: string;
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly env: Record<string, string>;
  readonly startedAt: string;
  readonly logFiles: {
    readonly out: string;
    readonly error: string;
  };
}

async function ensurePidDirectory(): Promise<void> {
  await mkdir(PID_DIR, { recursive: true });
}

export async function writePidFile(name: string, pid: number): Promise<void> {
  await ensurePidDirectory();
  const pidFile = path.join(PID_DIR, `${name}.pid`);
  await writeFile(pidFile, String(pid), 'utf8');
}

export async function readPidFile(name: string): Promise<number | null> {
  const pidFile = path.join(PID_DIR, `${name}.pid`);

  if (!existsSync(pidFile)) {
    return null;
  }

  try {
    const content = await readFile(pidFile, 'utf8');
    const pid = Number.parseInt(content.trim(), 10);

    if (Number.isNaN(pid)) {
      return null;
    }

    return pid;
  } catch (error) {
    return null;
  }
}

export async function deletePidFile(name: string): Promise<void> {
  const pidFile = path.join(PID_DIR, `${name}.pid`);

  try {
    await unlink(pidFile);
  } catch (error) {
    // Ignore if file doesn't exist
  }
}

export async function writeMetadata(
  name: string,
  metadata: ProcessMetadata
): Promise<void> {
  await ensurePidDirectory();
  const metadataFile = path.join(PID_DIR, `${name}.json`);
  await writeFile(metadataFile, JSON.stringify(metadata, null, 2), 'utf8');
}

export async function readMetadata(
  name: string
): Promise<ProcessMetadata | null> {
  const metadataFile = path.join(PID_DIR, `${name}.json`);

  if (!existsSync(metadataFile)) {
    return null;
  }

  try {
    const content = await readFile(metadataFile, 'utf8');
    return JSON.parse(content) as ProcessMetadata;
  } catch (error) {
    return null;
  }
}

export async function deleteMetadata(name: string): Promise<void> {
  const metadataFile = path.join(PID_DIR, `${name}.json`);

  try {
    await unlink(metadataFile);
  } catch (error) {
    // Ignore if file doesn't exist
  }
}

export function isPidRunning(pid: number): boolean {
  try {
    // Signal 0 checks if process exists without actually sending a signal
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return false;
  }
}
