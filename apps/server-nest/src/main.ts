import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './modules/app.module';
import { ValidationPipe, UnprocessableEntityException } from '@nestjs/common';
import { GlobalHttpExceptionFilter } from './common/filters/http-exception.filter';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';

async function bootstrap() {
    const app = await NestFactory.create(AppModule, { cors: true });

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

    const config = new DocumentBuilder()
        .setTitle('Spec Server API')
        .setDescription('Generated OpenAPI spec (NestJS)')
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

    // Side-by-side copy into legacy server openapi folder (non-fatal if path missing)
    try {
        const legacyDir = join(process.cwd(), '..', 'server', 'openapi');
        writeFileSync(join(legacyDir, 'nest-openapi.yaml'), yaml.dump(document), 'utf-8');
    } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('Could not copy spec to legacy openapi dir (optional):', (e as Error).message);
    }

    SwaggerModule.setup('api', app, () => document);
    app.useGlobalFilters(new GlobalHttpExceptionFilter());

    const port = process.env.PORT || 4000;
    await app.listen(port);
    // eslint-disable-next-line no-console
    console.log(`API listening on http://localhost:${port} (Swagger UI: http://localhost:${port}/api)`);
}

bootstrap().catch((err) => {
    // eslint-disable-next-line no-console
    console.error('Bootstrap failure', err);
    process.exit(1);
});
