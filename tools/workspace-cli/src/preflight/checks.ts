import { access, readFile } from 'node:fs/promises';
import { constants as fsConstants, existsSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import process from 'node:process';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { listEnvironmentProfiles } from '../config/env-profiles.js';
import {
    getApplicationProcess,
    listApplicationProcesses,
    listDefaultApplicationProcesses
} from '../config/application-processes.js';
import {
    listDefaultDependencyProcesses
} from '../config/dependency-processes.js';
import type { EnvironmentProfile, EnvironmentProfileId } from '../config/types.js';
import { describeProcess } from '../pm2/client.js';
import { WorkspaceCliError } from '../errors.js';
import { parseCliArgs } from '../utils/parse-args.js';

const execFileAsync = promisify(execFile);

const MIN_NODE_VERSION = { major: 20, minor: 19 } as const;
const ROOT_DIR = path.resolve(process.cwd());

const DEPENDENCY_PORT_MAP: Record<string, readonly number[]> = {
    postgres: [5432],
    zitadel: [8100, 8101]
};

interface PortConflict {
    readonly serviceId: string;
    readonly port: number;
    readonly type: 'application' | 'dependency';
}

interface EnvWarning {
    readonly message: string;
}

export async function runPreflightChecks(command: string, argv: readonly string[]): Promise<void> {
    const args = parseCliArgs(argv);
    const profile = resolveProfile(args.profile);

    await ensureHostTooling(
        command,
        profile,
        args.includeDependencies || args.dependenciesOnly || args.all || args.workspace
    );

    const warnings: EnvWarning[] = await collectEnvWarnings(command);

    if (warnings.length > 0) {
        for (const warning of warnings) {
            process.stdout.write(`⚠️  ${warning.message}\n`);
        }
    }

    if (command === 'start' || command === 'restart') {
        await enforcePortAvailability(command, argv, profile);
    }
}

function resolveProfile(profileId: EnvironmentProfileId): EnvironmentProfile {
    const profile = listEnvironmentProfiles().find((candidate) => candidate.profileId === profileId);

    if (!profile) {
        const available = listEnvironmentProfiles().map((candidate) => candidate.profileId).join(', ');
        throw new WorkspaceCliError(
            'PRECHECK_UNKNOWN_PROFILE',
            `Environment profile "${profileId}" is not registered. Available profiles: ${available}.`,
            {
                profile: profileId,
                recommendation: 'Pass --profile with one of the registered environment profiles.'
            }
        );
    }

    return profile;
}

async function ensureHostTooling(
    command: string,
    profile: EnvironmentProfile,
    dependenciesRequested: boolean
): Promise<void> {
    if (profile.hostRequirements.includes('node')) {
        ensureNodeVersion();
    }

    const requiresPm2 = new Set(['setup', 'start', 'stop', 'restart', 'status', 'logs']).has(command);

    if (requiresPm2 || profile.hostRequirements.includes('pm2')) {
        await ensureBinaryAvailable('pm2', ['--version'], 'PM2 process manager', 'npm install -g pm2');
    }

    const needsDocker =
        dependenciesRequested ||
        profile.hostRequirements.includes('docker') ||
        new Set(['start', 'restart', 'stop', 'status', 'logs']).has(command);

    if (needsDocker) {
        await ensureBinaryAvailable('docker', ['--version'], 'Docker CLI', 'Install Docker Desktop or docker CLI');
    }
}

function ensureNodeVersion(): void {
    const [majorStr, minorStr] = process.versions.node.split('.', 3);
    const major = Number.parseInt(majorStr ?? '0', 10);
    const minor = Number.parseInt(minorStr ?? '0', 10);

    if (Number.isNaN(major) || Number.isNaN(minor)) {
        return;
    }

    if (major < MIN_NODE_VERSION.major || (major === MIN_NODE_VERSION.major && minor < MIN_NODE_VERSION.minor)) {
        throw new WorkspaceCliError(
            'PRECHECK_NODE_VERSION_UNSUPPORTED',
            `Node.js ${MIN_NODE_VERSION.major}.${MIN_NODE_VERSION.minor}+ is required. Current version: ${process.versions.node}.`,
            {
                recommendation: 'Upgrade to Node.js 20.19 or later before running workspace commands.'
            }
        );
    }
}

async function ensureBinaryAvailable(
    binary: string,
    args: readonly string[],
    friendlyName: string,
    installHint: string
): Promise<void> {
    try {
        await execFileAsync(binary, [...args]);
    } catch (error) {
        const nodeError = error as NodeJS.ErrnoException;

        if (nodeError.code === 'ENOENT') {
            throw new WorkspaceCliError(
                'PRECHECK_TOOL_MISSING',
                `${friendlyName} is not available on PATH (missing executable: ${binary}).`,
                {
                    recommendation: `Install the tool and retry. Example: ${installHint}`
                }
            );
        }

        throw new WorkspaceCliError(
            'PRECHECK_TOOL_FAILED',
            `${friendlyName} check failed while running \\"${binary} ${args.join(' ')}\\": ${nodeError.message}`,
            {
                recommendation: `Verify the ${friendlyName} installation before retrying.`
            }
        );
    }
}

async function collectEnvWarnings(command: string): Promise<EnvWarning[]> {
    const warnings: EnvWarning[] = [];

    if (!new Set(['start', 'restart', 'setup', 'logs', 'status']).has(command)) {
        return warnings;
    }

    const rootEnvPath = path.join(ROOT_DIR, '.env');
    if (!existsSync(rootEnvPath)) {
        warnings.push({
            message: 'Root .env file not found. Copy .env.example to .env and supply database and Zitadel settings.'
        });
    }

    const adminEnvPath = path.join(ROOT_DIR, 'apps', 'admin', '.env');
    if (!existsSync(adminEnvPath)) {
        warnings.push({
            message: 'Admin SPA .env file missing. Copy apps/admin/.env.example to apps/admin/.env and configure Zitadel client details.'
        });
    }

    return warnings;
}

async function envFileContains(filePath: string, key: string): Promise<boolean> {
    try {
        await access(filePath, fsConstants.R_OK);
        const content = await readFile(filePath, 'utf-8');
        const lines = content.split(/\r?\n/);
        for (const rawLine of lines) {
            const line = rawLine.trim();
            if (line.startsWith('#') || line.length === 0) {
                continue;
            }

            const [entryKey] = line.split('=', 1);
            if (entryKey?.trim() === key) {
                return true;
            }
        }
    } catch (error) {
        const nodeError = error as NodeJS.ErrnoException;
        if (nodeError.code === 'ENOENT') {
            return false;
        }
    }

    return false;
}

async function enforcePortAvailability(
    command: string,
    argv: readonly string[],
    profile: EnvironmentProfile
): Promise<void> {
    const args = parseCliArgs(argv);
    const includeDependencies = args.includeDependencies || args.dependenciesOnly || args.all || args.workspace;
    const includeServices = !args.dependenciesOnly;
    const services = resolveTargetServices(args, includeServices);
    const dependencies = resolveTargetDependencies(args, includeDependencies);

    const conflicts: PortConflict[] = [];

    for (const serviceId of services) {
        const ports = getServicePortHints(serviceId);

        for (const port of ports) {
            if (await portInUseByForeignProcess(serviceId, port, 'application')) {
                conflicts.push({ serviceId, port, type: 'application' });
            }
        }
    }

    for (const dependencyId of dependencies) {
        const ports = DEPENDENCY_PORT_MAP[dependencyId] ?? [];

        for (const port of ports) {
            if (await portInUseByForeignProcess(`${dependencyId}-dependency`, port, 'dependency')) {
                conflicts.push({ serviceId: dependencyId, port, type: 'dependency' });
            }
        }
    }

    if (conflicts.length > 0) {
        const lines = conflicts.map((conflict) => `  • ${conflict.type} "${conflict.serviceId}" requires port ${conflict.port}`);
        throw new WorkspaceCliError(
            'PRECHECK_PORT_IN_USE',
            `Required ports are already in use:\n${lines.join('\n')}`,
            {
                recommendation: 'Stop the conflicting processes (lsof -ti:<port> | xargs kill -9) or adjust workspace configuration before retrying.',
                profile: profile.profileId
            }
        );
    }
}

function resolveTargetServices(args: ReturnType<typeof parseCliArgs>, includeServices: boolean): readonly string[] {
    if (!includeServices) {
        return [];
    }

    if (args.services.length > 0) {
        return args.services;
    }

    if (args.workspace || args.all) {
        return listDefaultApplicationProcesses().map((profile) => profile.processId);
    }

    return listDefaultApplicationProcesses().map((profile) => profile.processId);
}

function resolveTargetDependencies(args: ReturnType<typeof parseCliArgs>, includeDependencies: boolean): readonly string[] {
    if (!includeDependencies) {
        return [];
    }

    if (args.dependencies.length > 0) {
        return args.dependencies;
    }

    return listDefaultDependencyProcesses().map((profile) => profile.dependencyId);
}

function getServicePortHints(serviceId: string): readonly number[] {
    try {
        const profile = getApplicationProcess(serviceId);
        const url = profile.healthCheck?.url;

        if (!url) {
            return [];
        }

        try {
            const parsed = new URL(url);
            if (parsed.port) {
                return [Number.parseInt(parsed.port, 10)];
            }

            if (parsed.protocol === 'http:') {
                return [80];
            }

            if (parsed.protocol === 'https:') {
                return [443];
            }
        } catch {
            return [];
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new WorkspaceCliError('PRECHECK_UNKNOWN_SERVICE', `Unable to resolve service "${serviceId}": ${message}`);
    }

    return [];
}

async function portInUseByForeignProcess(
    pm2ProcessName: string,
    port: number,
    type: 'application' | 'dependency'
): Promise<boolean> {
    const managedProcess = await safeDescribeProcess(pm2ProcessName);

    if (managedProcess && managedProcess.pm2_env && managedProcess.pm2_env.status === 'online') {
        // Port belongs to a running PM2-managed process; treat as expected.
        return false;
    }

    return await isPortInUse(port);
}

async function safeDescribeProcess(name: string) {
    try {
        return await describeProcess(name);
    } catch (error) {
        // If PM2 fails, bubble up as workspace error to encourage resolution.
        const message = error instanceof Error ? error.message : String(error);
        throw new WorkspaceCliError('PRECHECK_PM2_QUERY_FAILED', `Failed to query PM2 for process "${name}": ${message}`);
    }
}

function isPortInUse(port: number): Promise<boolean> {
    return new Promise((resolve, reject) => {
        const tester = net.createServer();
        tester.unref();

        tester.once('error', (error: NodeJS.ErrnoException) => {
            if (error.code === 'EADDRINUSE') {
                resolve(true);
                return;
            }

            reject(error);
        });

        tester.listen({ host: '127.0.0.1', port, exclusive: true }, () => {
            tester.close(() => {
                resolve(false);
            });
        });
    });
}
