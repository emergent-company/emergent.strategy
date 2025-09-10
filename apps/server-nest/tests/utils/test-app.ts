import 'reflect-metadata';
import { INestApplication, ValidationPipe, UnprocessableEntityException } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
// Import from compiled dist to ensure decorator metadata (esbuild used by Vitest strips it)
// Tests should be run after a build step (see test:spec script)
import { AppModule } from '../../dist/modules/app.module';
import { GlobalHttpExceptionFilter } from '../../src/common/filters/http-exception.filter';

export interface BootstrappedApp {
    app: INestApplication;
    baseUrl: string;
    close: () => Promise<void>;
}

export async function bootstrapTestApp(): Promise<BootstrappedApp> {
    const app = await NestFactory.create(AppModule, { logger: false });
    app.useGlobalFilters(new GlobalHttpExceptionFilter());
    app.useGlobalPipes(
        new ValidationPipe({
            whitelist: true,
            transform: true,
            forbidUnknownValues: false,
            transformOptions: { enableImplicitConversion: true },
            validateCustomDecorators: true,
            exceptionFactory: (errors) => {
                const details = errors.reduce<Record<string, string[]>>((acc, err) => {
                    if (err.constraints) {
                        acc[err.property] = Object.values(err.constraints);
                    } else if (err.children?.length) {
                        acc[err.property] = ['invalid'];
                    }
                    return acc;
                }, {});
                return new UnprocessableEntityException({ message: 'Validation failed', details });
            },
        }),
    );
    await app.init();
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
