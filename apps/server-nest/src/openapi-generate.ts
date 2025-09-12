// This script now reuses the same bootstrap logic as main.ts to stay aligned
// with official NestJS Swagger docs. It imports the application, builds the
// document, writes JSON/YAML, and exits.
import 'reflect-metadata';
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './modules/app.module';
import { Module } from '@nestjs/common';
import { AppConfigModule } from './common/config/config.module';

@Module({ imports: [AppConfigModule] })
class MinimalModule { }
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';

async function run() {
    let app;
    try {
        if (!process.env.SKIP_DB) {
            process.env.SKIP_DB = 'true';
        }
        // eslint-disable-next-line no-console
        console.log('[openapi] Bootstrapping Nest application...');
        const useMinimal = process.env.MINIMAL_OPENAPI === 'true';
        app = await NestFactory.create(useMinimal ? MinimalModule : AppModule, { logger: ['error', 'warn', 'log'] });
        if (useMinimal) {
            // eslint-disable-next-line no-console
            console.log('[openapi] Using minimal module mode');
        }
    } catch (e) {
        // eslint-disable-next-line no-console
        console.error('Failed to create Nest application for OpenAPI generation:', e);
        throw e;
    }

    const config = new DocumentBuilder()
        .setTitle('Spec Server API')
        .setDescription('Generated OpenAPI spec (code-first)')
        .setVersion('0.2.0')
        .addBearerAuth()
        .build();
    // eslint-disable-next-line no-console
    console.log('[openapi] Generating document...');
    const document = SwaggerModule.createDocument(app, config);
    // eslint-disable-next-line no-console
    console.log('[openapi] Document generated. Writing files...');
    (document as any)['x-tagGroups'] = [
        { name: 'Health & Auth', tags: ['Health', 'Auth'] },
        { name: 'Organizations & Projects', tags: ['Orgs', 'Projects'] },
        { name: 'Configuration', tags: ['Settings'] },
        { name: 'Content & Ingestion', tags: ['Ingestion', 'Documents', 'Chunks'] },
        { name: 'Search', tags: ['Search'] },
        { name: 'Chat', tags: ['Chat'] }
    ];

    writeFileSync(join(process.cwd(), 'openapi.json'), JSON.stringify(document, null, 2), 'utf-8');
    writeFileSync(join(process.cwd(), 'openapi.yaml'), yaml.dump(document), 'utf-8');
    // eslint-disable-next-line no-console
    console.log('[openapi] Files written. Closing app...');
    await app.close();
    // eslint-disable-next-line no-console
    console.log('[openapi] Done.');
}

run().catch(err => {
    // eslint-disable-next-line no-console
    console.error('OpenAPI generation failed:', err);
    process.exit(1);
});

process.on('unhandledRejection', (reason) => {
    // eslint-disable-next-line no-console
    console.error('[openapi] Unhandled rejection:', reason);
});

process.on('uncaughtException', (err) => {
    // eslint-disable-next-line no-console
    console.error('[openapi] Uncaught exception:', err);
});
