import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';

import {
    getApplicationProcess,
    listDefaultApplicationProcesses
} from '../config/application-processes.js';
import {
    getDependencyNamespace,
    getDependencyProcess,
    listDefaultDependencyProcesses
} from '../config/dependency-processes.js';
import type { DependencyProcessProfile, EnvironmentProfileId } from '../config/types.js';
import { WorkspaceCliError } from '../errors.js';
import { restartProcess } from '../pm2/client.js';
import { parseCliArgs } from '../utils/parse-args.js';
import { ensureProcessDescription, waitForProcessStability } from './lifecycle-utils.js';
import { runStatusCommand } from '../status/render.js';

const require = createRequire(import.meta.url);

interface EcosystemProcessConfig {
    readonly name: string;
    readonly namespace?: string;
}

interface EcosystemModule {
    readonly apps: readonly EcosystemProcessConfig[];
}

const ecosystemModule = require('../../pm2/ecosystem.apps.cjs') as EcosystemModule;

interface DependencyEcosystemProcessConfig extends EcosystemProcessConfig { }

interface DependencyEcosystemModule {
    readonly apps: readonly DependencyEcosystemProcessConfig[];
}

const dependencyEcosystemModule = require('../../pm2/ecosystem.dependencies.cjs') as DependencyEcosystemModule;

function resolveProcessName(serviceId: string): EcosystemProcessConfig {
    const namespace = process.env.NAMESPACE || 'workspace-cli';
    const expectedName = `${namespace}-${serviceId}`;
    const entry = ecosystemModule.apps.find((app) => app.name === expectedName);

    if (!entry) {
        throw new WorkspaceCliError(
            'ECOSYSTEM_ENTRY_MISSING',
            `No PM2 ecosystem configuration registered for ${serviceId} (expected name: ${expectedName}).`,
            {
                serviceId,
                recommendation: 'Add an entry to tools/workspace-cli/pm2/ecosystem.apps.cjs'
            }
        );
    }

    return entry;
}

function resolveDependencyProcessName(dependencyId: string): DependencyEcosystemProcessConfig {
    const namespace = process.env.NAMESPACE || 'workspace-cli';
    const expectedName = `${namespace}-${dependencyId}-dependency`;
    const entry = dependencyEcosystemModule.apps.find(
        (app) => app.name === expectedName
    );

    if (!entry) {
        throw new WorkspaceCliError(
            'ECOSYSTEM_ENTRY_MISSING',
            `No PM2 ecosystem configuration registered for dependency ${dependencyId} (expected name: ${expectedName}).`,
            {
                serviceId: dependencyId,
                recommendation: 'Add an entry to tools/workspace-cli/pm2/ecosystem.dependencies.cjs'
            }
        );
    }

    return entry;
}

function resolveTargetServices(
    requested: readonly string[],
    workspace: boolean,
    all: boolean,
    includeServices: boolean
): readonly string[] {
    if (requested.length > 0) {
        return requested;
    }

    if (!includeServices) {
        return [];
    }

    if (workspace || all) {
        return listDefaultApplicationProcesses().map((profile) => profile.processId);
    }

    return listDefaultApplicationProcesses().map((profile) => profile.processId);
}

function resolveTargetDependencies(
    requested: readonly string[],
    includeDependencies: boolean
): readonly string[] {
    if (requested.length > 0) {
        return requested;
    }

    if (!includeDependencies) {
        return [];
    }

    return listDefaultDependencyProcesses().map((profile) => profile.dependencyId);
}

export async function runRestartCommand(argv: readonly string[]): Promise<void> {
    const args = parseCliArgs(argv);
    const includeDependencies =
        args.includeDependencies || args.dependenciesOnly || args.all || args.workspace;
    const includeServices = !args.dependenciesOnly;
    const services = resolveTargetServices(args.services, args.workspace, args.all, includeServices);
    const dependencies = resolveTargetDependencies(args.dependencies, includeDependencies);

    if (services.length === 0 && dependencies.length === 0) {
        process.stdout.write('⚠️  No services or dependencies requested for restart command. Nothing to do.\n');
        return;
    }

    const profileId: EnvironmentProfileId = args.profile;

    if (dependencies.length > 0) {
        process.stdout.write(`🔄 Restarting dependencies [${dependencies.join(', ')}] with profile ${profileId}\n`);

        for (const dependencyId of dependencies) {
            const dependencyProfile: DependencyProcessProfile = getDependencyProcess(dependencyId);
            const ecosystemEntry = resolveDependencyProcessName(dependencyId);
            const processName = ecosystemEntry.name ?? `${dependencyId}-dependency`;
            const namespace = ecosystemEntry.namespace ?? getDependencyNamespace();

            if (args.dryRun) {
                process.stdout.write(`∙ [dry-run] pm2 restart ${processName} (namespace: ${namespace ?? '(default)'})\n`);
                continue;
            }

            const description = await ensureProcessDescription(processName, dependencyId);
            const existingNamespace = description.pm2_env?.namespace ?? namespace;

            if (existingNamespace !== namespace) {
                throw new WorkspaceCliError(
                    'PROCESS_NAMESPACE_MISMATCH',
                    `Process ${processName} is registered under namespace ${existingNamespace}, expected ${namespace}.`,
                    {
                        serviceId: dependencyId,
                        profile: profileId,
                        action: 'restart',
                        namespace: existingNamespace ?? '(none)',
                        recommendation: `Run nx run workspace:status --profile ${profileId}`
                    }
                );
            }

            const status = description.pm2_env?.status ?? 'unknown';
            process.stdout.write(`∙ Restarting ${processName} (current status: ${status})\n`);
            await restartProcess(processName, true);

            await waitForProcessStability({
                serviceId: dependencyId,
                processName,
                profileId,
                namespace,
                policy: dependencyProfile.restartPolicy,
                action: 'restart'
            });
        }
    }

    if (services.length > 0) {
        process.stdout.write(`🔁 Restarting services [${services.join(', ')}] with profile ${profileId}\n`);

        for (const serviceId of services) {
            const processProfile = getApplicationProcess(serviceId);
            const ecosystemEntry = resolveProcessName(serviceId);
            const processName = ecosystemEntry.name ?? processProfile.processId;
            const namespace = ecosystemEntry.namespace ?? processProfile.namespace;

            if (args.dryRun) {
                process.stdout.write(`∙ [dry-run] pm2 restart ${processName} (namespace: ${namespace ?? '(default)'})\n`);
                continue;
            }

            const description = await ensureProcessDescription(processName, serviceId);
            const existingNamespace = description.pm2_env?.namespace ?? namespace;

            if (existingNamespace !== namespace) {
                throw new WorkspaceCliError(
                    'PROCESS_NAMESPACE_MISMATCH',
                    `Process ${processName} is registered under namespace ${existingNamespace}, expected ${namespace}.`,
                    {
                        serviceId,
                        profile: profileId,
                        action: 'restart',
                        namespace: existingNamespace ?? '(none)',
                        recommendation: `Run nx run workspace:status --profile ${profileId}`
                    }
                );
            }

            const status = description.pm2_env?.status ?? 'unknown';
            process.stdout.write(`∙ Restarting ${processName} (current status: ${status})\n`);
            await restartProcess(processName, true);

            await waitForProcessStability({
                serviceId,
                processName,
                profileId,
                namespace,
                policy: processProfile.restartPolicy,
                action: 'restart'
            });
        }
    }

    process.stdout.write('✅ Restart command complete\n\n');
    
    // Display status after restarting
    await runStatusCommand(argv);
}
