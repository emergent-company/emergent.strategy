import { Global, Module } from '@nestjs/common';
import * as path from 'node:path';
import * as fs from 'node:fs';
import dotenv from 'dotenv';
import { AppConfigService } from './config.service';
import { EnvVariables, validate } from './config.schema';

// Load .env (prioritizing process env already set). This runs once on module import.
(() => {
    const cwd = process.cwd();
    // Prefer app-specific .env first, then repo root .env
    const candidatePaths = [
        path.join(cwd, '.env.local'),
        path.join(cwd, '.env'),
        path.join(cwd, '..', '.env.local'),
        path.join(cwd, '..', '.env'),
    ];
    for (const p of candidatePaths) {
        if (fs.existsSync(p)) {
            dotenv.config({ path: p });
            break;
        }
    }
})();

const envProvider = {
    provide: EnvVariables,
    useFactory: (): EnvVariables => {
        // Load process.env directly (dotenv already loaded at root if needed)
        return validate(process.env as Record<string, unknown>);
    },
};

@Global()
@Module({
    providers: [envProvider, AppConfigService],
    exports: [AppConfigService, EnvVariables],
})
export class AppConfigModule { }
