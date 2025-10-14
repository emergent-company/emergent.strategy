import 'reflect-metadata';
import { INestApplication, ValidationPipe, BadRequestException, HttpStatus } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
// Import from compiled dist to ensure decorator metadata (esbuild used by Vitest strips it)
// Tests should be run after a build step (see test:spec script)
// Import AppModule from built dist (tests now run `npm run build` first ensuring dist is fresh)
import { AppModule } from '../../dist/modules/app.module';
import { GlobalHttpExceptionFilter } from '../../src/common/filters/http-exception.filter';

// Central verbosity flag (used both for Nest logger levels and to suppress bootstrap noise)
const __e2eVerbose = process.env.E2E_DEBUG_VERBOSE === 'true';

// Intercept process.exit to surface origin during tests unless explicitly disabled
if (process.env.E2E_DISABLE_EXIT_INTERCEPT !== 'true') {
    if (!(global as any).__exitInterceptInstalled) {
        const origExit = process.exit;
        if (__e2eVerbose) {
            // eslint-disable-next-line no-console
            console.log('[e2e bootstrap] Installing process.exit interceptor');
        }
        (process as any).exit = ((code?: number) => {
            const stack = new Error('process.exit stack').stack;
            // eslint-disable-next-line no-console
            console.error('[e2e bootstrap] process.exit intercepted with code', code, '\n', stack);
            throw new Error(`process.exit called code=${code}`);
        }) as any;
        (global as any).__exitInterceptInstalled = true;
        (global as any).__origProcessExit = origExit;
    }
} else if ((global as any).__exitInterceptInstalled) {
    // If previously installed in same worker process, restore original for runs with flag disabled
    const orig = (global as any).__origProcessExit;
    if (orig) {
        if (__e2eVerbose) {
            // eslint-disable-next-line no-console
            console.log('[e2e bootstrap] Restoring original process.exit (interceptor disabled)');
        }
        (process as any).exit = orig;
    }
}

export interface BootstrappedApp {
    app: INestApplication;
    baseUrl: string;
    close: () => Promise<void>;
}

export async function bootstrapTestApp(): Promise<BootstrappedApp> {
    let app: INestApplication;
    try {
        // Allow verbose test logging to be toggled by E2E_DEBUG_VERBOSE (default off for cleaner output)
        const loggerLevels: any = __e2eVerbose ? ['error', 'warn', 'log', 'debug', 'verbose'] : ['error', 'warn'];
        app = await NestFactory.create(AppModule, { logger: loggerLevels });
    } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[e2e bootstrap] Failed to create Nest application:', err);
        throw err;
    }
    if (__e2eVerbose) {
        // eslint-disable-next-line no-console
        console.log('[e2e bootstrap] Effective DB env', {
            PGHOST: process.env.PGHOST,
            PGPORT: process.env.PGPORT,
            PGUSER: process.env.PGUSER,
            PGDATABASE: process.env.PGDATABASE,
            DB_AUTOINIT: process.env.DB_AUTOINIT,
        });
    }
    app.useGlobalFilters(new GlobalHttpExceptionFilter());
    app.useGlobalPipes(
        new ValidationPipe({
            whitelist: true,
            transform: true,
            forbidUnknownValues: false,
            transformOptions: { enableImplicitConversion: true },
            validateCustomDecorators: true,
            errorHttpStatusCode: HttpStatus.BAD_REQUEST,
            exceptionFactory: (errors) => {
                const details = errors.reduce<Record<string, string[]>>((acc, err) => {
                    if (err.constraints) {
                        acc[err.property] = Object.values(err.constraints);
                    } else if (err.children?.length) {
                        acc[err.property] = ['invalid'];
                    }
                    return acc;
                }, {});
                return new BadRequestException({ message: 'Validation failed', details });
            },
        }),
    );
    try {
        await app.init();
    } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[e2e bootstrap] app.init failed:', err);
        throw err;
    }
    const server = await app.listen(0);
    const address = server.address();
    if (!address || typeof address !== 'object') throw new Error('Failed to determine test server port');
    const baseUrl = `http://127.0.0.1:${address.port}`;
    return {
        app,
        baseUrl,
        close: async () => {
            await app.close();
        },
    };
}
