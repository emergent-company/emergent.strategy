// This script now reuses the same bootstrap logic as main.ts to stay aligned
// with official NestJS Swagger docs. It imports the application, builds the
// document, writes JSON/YAML, and exits.
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './modules/app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';

async function run() {
    const app = await NestFactory.create(AppModule, { logger: false });

    const config = new DocumentBuilder()
        .setTitle('Spec Server API')
        .setDescription('Generated OpenAPI spec (code-first)')
        .setVersion('0.2.0')
        .addBearerAuth()
        .build();

    const document = SwaggerModule.createDocument(app, config);
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
    await app.close();
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});
