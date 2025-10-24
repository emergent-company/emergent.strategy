// Type declarations for ClickUp SDK
// This allows TypeScript to skip checking the .ts file

import type * as types from './types';

export interface ConfigOptions {
    timeout?: number;
}

export interface FetchResponse<Status extends number, Data> {
    status: Status;
    data: Data;
}

declare class SDK {
    spec: any;
    core: any;
    constructor();
    config(config: ConfigOptions): void;
    auth(...values: Array<string | number>): this;
    server(url: string, variables?: Record<string, any>): void;

    // Include method signatures from types
    [key: string]: any;
}

declare const sdk: SDK;
export default sdk;
export type * from './types';
