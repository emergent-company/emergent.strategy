import type { EnvironmentProfileId } from '../config/types.js';

export interface ParsedCliArgs {
  readonly profile: EnvironmentProfileId;
  readonly services: readonly string[];
  readonly dependencies: readonly string[];
  readonly workspace: boolean;
  readonly all: boolean;
  readonly includeDependencies: boolean;
  readonly dependenciesOnly: boolean;
  readonly dryRun: boolean;
  readonly json: boolean;
  readonly logLines: number;
  readonly follow: boolean;
  readonly skipHealthCheck: boolean;
  readonly unknown: readonly string[];
}

const PROFILE_ENV_KEY = 'WORKSPACE_PROFILE';
const DEFAULT_PROFILE: EnvironmentProfileId = 'development';

function normalizeFlag(flag: string): string {
  if (flag.startsWith('--')) {
    return flag.slice(2);
  }

  if (flag.startsWith('-')) {
    return flag.slice(1);
  }

  return flag;
}

export function parseCliArgs(argv: readonly string[]): ParsedCliArgs {
  const services: string[] = [];
  const dependencies: string[] = [];
  const unknown: string[] = [];

  let profile: EnvironmentProfileId | undefined;
  let workspace = false;
  let all = false;
  let includeDependencies = false;
  let dependenciesOnly = false;
  let dryRun = false;
  let json = false;
  let logLines = 100;
  let follow = false;
  let skipHealthCheck = false;

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (!token.startsWith('-')) {
      unknown.push(token);
      continue;
    }

    const [rawFlag, rawValue] = token.split('=', 2);
    const flag = normalizeFlag(rawFlag);

    switch (flag) {
      case 'profile': {
        let value = rawValue;

        if (value === undefined) {
          const candidate = argv[index + 1];
          if (candidate !== undefined && !candidate.startsWith('-')) {
            value = candidate;
            index += 1;
          }
        }

        if (value) {
          profile = value as EnvironmentProfileId;
        }
        break;
      }

      case 'service': {
        let value = rawValue;

        if (value === undefined) {
          const candidate = argv[index + 1];
          if (candidate !== undefined && !candidate.startsWith('-')) {
            value = candidate;
            index += 1;
          }
        }

        if (value) {
          services.push(value);
        }
        break;
      }

      case 'services': {
        let value = rawValue;

        if (value === undefined) {
          const candidate = argv[index + 1];
          if (candidate !== undefined && !candidate.startsWith('-')) {
            value = candidate;
            index += 1;
          }
        }

        if (value) {
          const parts = value
            .split(',')
            .map((part) => part.trim())
            .filter(Boolean);

          services.push(...parts);
        }
        break;
      }

      case 'dependency': {
        let value = rawValue;

        if (value === undefined) {
          const candidate = argv[index + 1];
          if (candidate !== undefined && !candidate.startsWith('-')) {
            value = candidate;
            index += 1;
          }
        }

        if (value) {
          dependencies.push(value);
        }
        break;
      }

      case 'dependencies':
      case 'deps':
        includeDependencies = true;
        break;

      case 'dependencies-only':
      case 'deps-only':
        includeDependencies = true;
        dependenciesOnly = true;
        break;

      case 'workspace':
        workspace = true;
        break;

      case 'all':
        all = true;
        break;

      case 'dry-run':
      case 'dryRun':
        dryRun = true;
        break;

      case 'json':
        json = true;
        break;

      case 'follow':
      case 'stream':
      case 'live':
        follow = true;
        break;

      case 'no-health-check':
      case 'skip-health-check':
      case 'noHealthCheck':
      case 'skipHealthCheck':
        skipHealthCheck = true;
        break;

      case 'lines':
      case 'n': {
        let value = rawValue;

        if (value === undefined) {
          const candidate = argv[index + 1];
          if (candidate !== undefined && !candidate.startsWith('-')) {
            value = candidate;
            index += 1;
          }
        }

        if (value) {
          const parsed = Number.parseInt(value, 10);
          if (!Number.isNaN(parsed) && parsed > 0) {
            logLines = parsed;
          }
        }

        break;
      }

      default:
        unknown.push(token);
        break;
    }
  }

  const envProfile =
    (process.env[PROFILE_ENV_KEY] as EnvironmentProfileId | undefined) ??
    DEFAULT_PROFILE;

  return {
    profile: profile ?? envProfile,
    services,
    dependencies,
    workspace,
    all,
    includeDependencies,
    dependenciesOnly,
    dryRun,
    json,
    logLines,
    follow,
    skipHealthCheck,
    unknown,
  };
}
