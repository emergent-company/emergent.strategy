import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './modules/app.module';
import { AppConfigService } from './common/config/config.service';
import { ValidationPipe, HttpStatus, UnprocessableEntityException } from '@nestjs/common';
import { DatabaseReadinessInterceptor } from './common/interceptors/database-readiness.interceptor';
import { GlobalHttpExceptionFilter } from './common/filters/http-exception.filter';
import { FileLogger } from './common/logger/file-logger.service';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';

async function bootstrap() {
    // Create file logger instance
    const fileLogger = new FileLogger();

    const app = await NestFactory.create(AppModule, {
        cors: false,
        // Use both default logger (for console) and file logger
        bufferLogs: true,
    });

    // Set up file logger to capture all logs
    app.useLogger(fileLogger);

    // Fine-grained CORS: allow credentials for local dev origins only
    const allowedOrigins = new Set([
        'http://localhost:3000', // common alt
        'http://localhost:3001', // same-port (if ever served together)
        'http://localhost:5173', // Vite default
        'http://localhost:5174', // secondary
        'http://localhost:5175', // current admin dev port
    ]);
    app.enableCors({
        origin: (origin, cb) => {
            if (!origin) return cb(null, true); // non-browser or curl
            if (allowedOrigins.has(origin)) return cb(null, true);
            return cb(new Error(`CORS blocked for origin ${origin}`));
        },
        credentials: true,
        exposedHeaders: ['X-Request-ID'],
    });

    app.useGlobalPipes(new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidUnknownValues: false,
        transformOptions: { enableImplicitConversion: true },
        validateCustomDecorators: true,
        errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
        exceptionFactory: (errors) => {
            const messages = errors.flatMap(e => Object.values(e.constraints || {}));
            if (!messages.length) {
                return new UnprocessableEntityException({ message: 'Validation failed', code: 'validation-failed' });
            }
            return new UnprocessableEntityException({
                error: {
                    code: 'validation-failed',
                    message: messages[0],
                    details: { messages },
                },
            });
        }
    }));

    const config = new DocumentBuilder()
        .setTitle('Spec Server API')
        .setDescription('Generated OpenAPI spec (NestJS). NOTE: Each Document MUST belong to a Project and each Project belongs to an Organization. Users with no accessible Projects must create one before using ingestion or search features.')
        .setVersion('0.2.0')
        .addBearerAuth()
        .build();
    const documentFactory = () => SwaggerModule.createDocument(app, config, {
        operationIdFactory: (_controllerKey: string, methodKey: string) => methodKey,
    });

    // Inject x-tagGroups post-generation (placeholder groups)
    const document = documentFactory();
    (document as any)['x-tagGroups'] = [
        { name: 'Health & Auth', tags: ['Health', 'Auth'] },
        { name: 'Organizations & Projects', tags: ['Orgs', 'Projects'] },
        { name: 'Configuration', tags: ['Settings'] },
        { name: 'Content & Ingestion', tags: ['Ingestion', 'Documents', 'Chunks'] },
        { name: 'Search', tags: ['Search'] },
        { name: 'Chat', tags: ['Chat'] },
    ];

    const openapiJsonPath = join(process.cwd(), 'openapi.json');
    writeFileSync(openapiJsonPath, JSON.stringify(document, null, 2), 'utf-8');
    const openapiYamlPath = join(process.cwd(), 'openapi.yaml');
    writeFileSync(openapiYamlPath, yaml.dump(document), 'utf-8');

    // Legacy server directory removed; no longer attempt to copy spec there.

    SwaggerModule.setup('api', app, () => document);
    app.useGlobalFilters(new GlobalHttpExceptionFilter());
    app.useGlobalInterceptors(app.get(DatabaseReadinessInterceptor));

    const configService = app.get(AppConfigService);
    // Log chat model enablement state (always) for clarity during startup
    const chatEnabled = configService.chatModelEnabled;
    const embeddingProvider = process.env.EMBEDDING_PROVIDER || 'unset';
    const chatModelInfo = {
        enabled: chatEnabled,
        embeddingProvider: embeddingProvider,
        CHAT_MODEL_ENABLED_env: process.env.CHAT_MODEL_ENABLED || 'unset',
        GCP_PROJECT_ID: process.env.GCP_PROJECT_ID ? 'present' : 'missing',
    };

    fileLogger.log(`[startup] chat-model: ${JSON.stringify(chatModelInfo)}`, 'Bootstrap');
    // eslint-disable-next-line no-console
    console.log('[startup] chat-model:', chatModelInfo);

    const port = configService.port;
    await app.listen(port);

    const serverInfo = `API listening on http://localhost:${port} (default 3001) (Swagger UI: http://localhost:${port}/api)`;
    fileLogger.log(serverInfo, 'Bootstrap');
    // eslint-disable-next-line no-console
    console.log(serverInfo);
}

bootstrap().catch((err) => {
    // eslint-disable-next-line no-console
    console.error('Bootstrap failure', err);
    const fileLogger = new FileLogger();
    fileLogger.fatal('Bootstrap failure', err.stack, 'Bootstrap');
    process.exit(1);
});
