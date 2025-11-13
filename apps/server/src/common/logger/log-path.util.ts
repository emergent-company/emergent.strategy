import { join, sep } from 'node:path';

/**
 * Resolve the directory where logs should be written.
 *
 * Order of precedence:
 * 1. A specific environment variable (e.g. ERROR_LOG_DIR) if provided and set.
 * 2. The generic LOG_DIR environment variable if set.
 * 3. Project root `logs/` folder (works for both `npm --prefix apps/server` and root execution).
 */
export function resolveLogDir(envVar?: string): string {
  const candidates: Array<string | undefined> = [];
  if (envVar) {
    candidates.push(process.env[envVar]);
  }
  candidates.push(process.env.LOG_DIR);

  for (const candidate of candidates) {
    if (candidate && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }

  const cwd = process.cwd();
  const serverSuffix = `${sep}apps${sep}server`;

  if (cwd.endsWith(serverSuffix)) {
    return join(cwd, '..', '..', 'logs');
  }

  return join(cwd, 'logs');
}
