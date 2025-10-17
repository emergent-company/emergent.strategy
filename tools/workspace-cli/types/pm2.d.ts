declare module 'pm2' {
    export interface ProcessDescription {
        readonly name?: string;
        readonly pm_id?: number;
        readonly monit?: {
            readonly cpu: number;
            readonly memory: number;
        };
        readonly pm2_env?: {
            readonly status?: string;
            readonly restart_time?: number;
            readonly unstable_restarts?: number;
            readonly version?: string;
            readonly pm_uptime?: number;
            readonly pm_exec_path?: string;
            readonly node_env?: string;
            readonly exit_code?: number;
        };
    }

    export interface StartOptions {
        script: string;
        name: string;
        cwd?: string;
        env?: Record<string, string>;
        max_restarts?: number;
        min_uptime?: number;
        restart_delay?: number;
        interpreter?: string;
        args?: readonly string[];
    }

    export type Pm2Callback<T = unknown> = (error: Error | null, result?: T) => void;

    export type StartCallback = Pm2Callback;

    export type DescribeCallback = Pm2Callback<ProcessDescription[]>;

    export type DeleteCallback = Pm2Callback;

    const pm2: {
        connect(callback: Pm2Callback<void>): void;
        disconnect(): void;
        start(options: StartOptions, callback: StartCallback): void;
        describe(name: string, callback: DescribeCallback): void;
        delete(name: string, callback: DeleteCallback): void;
    };

    export default pm2;
}
