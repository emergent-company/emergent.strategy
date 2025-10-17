import pm2 from 'pm2';
import type { ProcessDescription, StartOptions } from 'pm2';

export interface StartProcessOptions {
    readonly script: string;
    readonly name: string;
    readonly cwd?: string;
    readonly env?: Record<string, string>;
    readonly maxRestarts?: number;
    readonly minUptime?: number;
    readonly restartDelay?: number;
    readonly expBackoffRestartDelay?: number;
    readonly interpreter?: string;
    readonly args?: readonly string[];
    readonly namespace?: string;
    readonly outFile?: string;
    readonly errorFile?: string;
    readonly mergeLogs?: boolean;
    readonly logDateFormat?: string;
    readonly autorestart?: boolean;
    readonly force?: boolean;
}

function pm2Connect(): Promise<void> {
    return new Promise((resolve, reject) => {
        pm2.connect((error: Error | null) => {
            if (error) {
                reject(error);
                return;
            }

            resolve();
        });
    });
}

function pm2Disconnect(): Promise<void> {
    return new Promise((resolve) => {
        pm2.disconnect();
        resolve();
    });
}

export async function withPm2<T>(operation: () => Promise<T>): Promise<T> {
    await pm2Connect();
    try {
        return await operation();
    } finally {
        await pm2Disconnect();
    }
}

export async function startProcess(options: StartProcessOptions): Promise<void> {
    await withPm2(async () => {
        const startOptions: StartOptions = {
            script: options.script,
            name: options.name,
            cwd: options.cwd,
            env: options.env,
            max_restarts: options.maxRestarts,
            min_uptime: options.minUptime,
            restart_delay: options.restartDelay,
            interpreter: options.interpreter,
            args: options.args ? [...options.args] : undefined,
            namespace: options.namespace,
            out_file: options.outFile,
            error_file: options.errorFile,
            merge_logs: options.mergeLogs,
            log_date_format: options.logDateFormat,
            autorestart: options.autorestart,
            force: options.force
        };

        if (options.expBackoffRestartDelay !== undefined) {
            (startOptions as StartOptions & Record<string, unknown>).exp_backoff_restart_delay = options.expBackoffRestartDelay;
        }

        await new Promise<void>((resolve, reject) => {
            pm2.start(startOptions, (error: Error | null) => {
                if (error) {
                    reject(error);
                    return;
                }

                resolve();
            });
        });
    });
}

export async function describeProcess(name: string): Promise<ProcessDescription | undefined> {
    return withPm2(async () => {
        const processList = await new Promise<ProcessDescription[]>((resolve, reject) => {
            pm2.describe(name, (error: Error | null, result?: ProcessDescription[]) => {
                if (error) {
                    reject(error);
                    return;
                }

                resolve(result ?? []);
            });
        });

        return processList[0];
    });
}

export async function listProcesses(): Promise<ProcessDescription[]> {
    return withPm2(async () => {
        return await new Promise<ProcessDescription[]>((resolve, reject) => {
            (pm2 as unknown as {
                list: (callback: (error: Error | null, processList?: ProcessDescription[]) => void) => void;
            }).list((error: Error | null, processList?: ProcessDescription[]) => {
                if (error) {
                    reject(error);
                    return;
                }

                resolve(processList ?? []);
            });
        });
    });
}

export async function deleteProcess(name: string): Promise<void> {
    await withPm2(async () => {
        await new Promise<void>((resolve, reject) => {
            pm2.delete(name, (error: Error | null) => {
                if (error) {
                    reject(error);
                    return;
                }

                resolve();
            });
        });
    });
}

export async function reloadProcess(name: string): Promise<void> {
    await withPm2(async () => {
        await new Promise<void>((resolve, reject) => {
            pm2.reload(name, (error: Error | null) => {
                if (error) {
                    reject(error);
                    return;
                }

                resolve();
            });
        });
    });
}

export async function restartProcess(name: string): Promise<void> {
    await withPm2(async () => {
        await new Promise<void>((resolve, reject) => {
            (pm2 as unknown as { restart: (target: string, callback: (error: Error | null) => void) => void }).restart(
                name,
                (error: Error | null) => {
                    if (error) {
                        reject(error);
                        return;
                    }

                    resolve();
                }
            );
        });
    });
}

export async function stopProcess(name: string): Promise<void> {
    await withPm2(async () => {
        await new Promise<void>((resolve, reject) => {
            (pm2 as unknown as { stop: (target: string, callback: (error: Error | null) => void) => void }).stop(
                name,
                (error: Error | null) => {
                    if (error) {
                        reject(error);
                        return;
                    }

                    resolve();
                }
            );
        });
    });
}
