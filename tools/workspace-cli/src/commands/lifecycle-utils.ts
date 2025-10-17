import { setTimeout as delay } from 'node:timers/promises';

import type { ProcessDescription } from 'pm2';

import type { EnvironmentProfileId, RestartPolicy } from '../config/types.js';
import { describeProcess } from '../pm2/client.js';
import { WorkspaceCliError } from '../errors.js';

const DEFAULT_STABILITY_TIMEOUT_MS = 120_000;
const DEFAULT_STOP_TIMEOUT_MS = 60_000;
const POLL_INTERVAL_MS = 2_000;

interface StabilityCheckOptions {
    readonly serviceId: string;
    readonly processName: string;
    readonly profileId: EnvironmentProfileId;
    readonly namespace?: string;
    readonly policy: RestartPolicy;
    readonly action: 'start' | 'restart';
}

interface StopCheckOptions {
    readonly serviceId: string;
    readonly processName: string;
    readonly profileId: EnvironmentProfileId;
    readonly namespace?: string;
}

export async function ensureProcessDescription(processName: string, serviceId: string): Promise<ProcessDescription> {
    const description = await describeProcess(processName);

    if (!description) {
        throw new WorkspaceCliError(
            'PROCESS_NOT_FOUND',
            `PM2 process ${processName} is not registered. Start the service before attempting lifecycle actions.`,
            {
                serviceId,
                recommendation: 'Run nx run workspace:start -- --service=' + serviceId
            }
        );
    }

    return description;
}

export async function waitForProcessStability(options: StabilityCheckOptions): Promise<void> {
    const { serviceId, processName, profileId, policy, action, namespace } = options;
    const timeoutMs = Math.max(DEFAULT_STABILITY_TIMEOUT_MS, policy.minUptimeSec * 1000);
    const deadline = Date.now() + timeoutMs;
    let lastDescription: ProcessDescription | undefined;

    while (Date.now() <= deadline) {
        lastDescription = await describeProcess(processName);

        if (!lastDescription) {
            throw new WorkspaceCliError(
                'PROCESS_DISAPPEARED',
                `Service ${serviceId} (${processName}) is no longer registered after ${action}.`,
                {
                    serviceId,
                    profile: profileId,
                    action,
                    namespace,
                    recommendation: `Run nx run workspace:status --profile ${profileId}`
                }
            );
        }

        const pm2Env = lastDescription.pm2_env ?? {};
        const status = pm2Env.status ?? 'unknown';
        const unstableRestarts = pm2Env.unstable_restarts ?? 0;
        const restartCount = pm2Env.restart_time ?? 0;
        const lastExitCode = pm2Env.exit_code ?? null;

        if (status === 'online') {
            if (unstableRestarts >= policy.maxRestarts) {
                throw new WorkspaceCliError(
                    'RESTART_THRESHOLD_EXCEEDED',
                    `Service ${serviceId} exceeded restart limits during ${action}.`,
                    {
                        serviceId,
                        profile: profileId,
                        action,
                        attempts: unstableRestarts,
                        maxRestarts: policy.maxRestarts,
                        lastExitCode,
                        namespace,
                        recommendation: `Run nx run workspace:status --profile ${profileId}`
                    }
                );
            }

            return;
        }

        if (status === 'errored' || status === 'stopped') {
            throw new WorkspaceCliError(
                'PROCESS_NOT_ONLINE',
                `Service ${serviceId} reported ${status} status during ${action}.`,
                {
                    serviceId,
                    profile: profileId,
                    action,
                    status,
                    attempts: unstableRestarts,
                    maxRestarts: policy.maxRestarts,
                    lastExitCode,
                    namespace,
                    recommendation: `Inspect logs via nx run workspace:logs -- --service=${serviceId}`
                }
            );
        }

        await delay(POLL_INTERVAL_MS);
    }

    const lastStatus = lastDescription?.pm2_env?.status ?? 'unknown';
    throw new WorkspaceCliError(
        'PROCESS_START_TIMEOUT',
        `Service ${serviceId} did not reach online status within ${Math.round(timeoutMs / 1000)} seconds.`,
        {
            serviceId,
            profile: profileId,
            action,
            status: lastStatus,
            attempts: lastDescription?.pm2_env?.unstable_restarts ?? 0,
            maxRestarts: policy.maxRestarts,
            lastExitCode: lastDescription?.pm2_env?.exit_code ?? null,
            namespace,
            recommendation: `Run nx run workspace:status --profile ${profileId}`
        }
    );
}

export async function waitForProcessStop(options: StopCheckOptions): Promise<void> {
    const { serviceId, processName, profileId, namespace } = options;
    const deadline = Date.now() + DEFAULT_STOP_TIMEOUT_MS;

    while (Date.now() <= deadline) {
        const description = await describeProcess(processName);

        if (!description) {
            return;
        }

        const status = description.pm2_env?.status ?? 'unknown';

        if (status === 'stopped' || status === 'offline' || status === 'stopping') {
            return;
        }

        if (status === 'errored') {
            return;
        }

        await delay(POLL_INTERVAL_MS);
    }

    throw new WorkspaceCliError(
        'STOP_TIMEOUT',
        `Service ${serviceId} did not stop within ${Math.round(DEFAULT_STOP_TIMEOUT_MS / 1000)} seconds.`,
        {
            serviceId,
            profile: profileId,
            action: 'stop',
            namespace,
            recommendation: `Run nx run workspace:status --profile ${profileId}`
        }
    );
}
