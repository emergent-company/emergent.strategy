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
import { SCOPES_KEY } from './modules/auth/scopes.decorator';

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
        .setDescription('Generated OpenAPI spec (code-first). All protected operations include x-required-scopes and 403 examples with missing_scopes.')
        .setVersion('0.2.0')
        .addBearerAuth()
        .build();
    // eslint-disable-next-line no-console
    console.log('[openapi] Generating document...');
    // Provide an explicit operationId factory so we have stable, predictable IDs
    // that include the controller name. Our scope injection logic below builds
    // keys in the form `${ControllerName}_${methodName}`. Without this factory
    // Nest/Swagger will default to using only the method name (which recently
    // caused all x-required-scopes metadata to disappear because the keys no
    // longer matched). If in the future we change the naming strategy again,
    // we also include a lightweight fallback matching pass further below.
    const document = SwaggerModule.createDocument(app, config);
    // Dynamically discover required scopes from controller method metadata (@Scopes decorator)
    const scopeMap: Record<string, string[]> = {};
    const modulesContainer: Map<any, any> = (app as any).container.getModules();
    for (const moduleRef of modulesContainer.values()) {
        for (const ctrlWrapper of moduleRef.controllers.values()) {
            const metatype = ctrlWrapper?.metatype;
            const instance = ctrlWrapper?.instance;
            if (!metatype || !instance) continue;
            const proto = metatype.prototype;
            for (const key of Object.getOwnPropertyNames(proto)) {
                if (key === 'constructor') continue;
                const handler = proto[key];
                if (typeof handler !== 'function') continue;
                const methodScopes: string[] | undefined = Reflect.getMetadata(SCOPES_KEY, handler);
                if (methodScopes && methodScopes.length) {
                    // Support both historical (method only) operationId naming
                    // and an explicit controller + method composite used in
                    // some earlier internal tooling, so we can inject scopes
                    // without changing existing public operationIds.
                    const composite = `${metatype.name}_${key}`;
                    scopeMap[composite] = methodScopes;
                    // Plain method name (most current @nestjs/swagger default)
                    if (!scopeMap[key]) scopeMap[key] = methodScopes;
                }
            }
        }
    }
    const SEC_EXAMPLE_TEMPLATE = (scopes: string[]) => ({
        error: {
            code: 'forbidden',
            message: 'Insufficient permissions',
            missing_scopes: scopes
        }
    });
    const UNAUTH_EXAMPLE = {
        error: { code: 'unauthorized', message: 'Missing or invalid credentials' }
    };
    // To guard against future changes to operationId naming, build an auxiliary
    // map from raw method name when it is *uniquely* associated to a scope set.
    const uniqueMethodScopes: Record<string, string[]> = {};
    const methodNameCounts: Record<string, number> = {};
    for (const key of Object.keys(scopeMap)) {
        const methodName = key.split('_').slice(-1)[0];
        methodNameCounts[methodName] = (methodNameCounts[methodName] || 0) + 1;
    }
    for (const key of Object.keys(scopeMap)) {
        const methodName = key.split('_').slice(-1)[0];
        if (methodNameCounts[methodName] === 1) {
            uniqueMethodScopes[methodName] = scopeMap[key];
        }
    }

    for (const [path, methods] of Object.entries((document as any).paths || {})) {
        const methodEntries = Object.entries(methods as Record<string, any>);
        for (const [, op] of methodEntries) {
            const operationId: string | undefined = op.operationId;
            if (!operationId) continue;
            let scopes = scopeMap[operationId];
            if (!scopes) {
                // fallback: look up by method name if unique
                scopes = uniqueMethodScopes[operationId];
            }
            if (!scopes || !scopes.length) continue; // public or unknown
            if (!op.security) {
                op.security = [{ bearer: [] }];
            }
            (op as any)['x-required-scopes'] = scopes;
            const responses = op.responses || {};
            if (responses['401']) {
                const c = responses['401'].content || (responses['401'].content = {});
                const appJson = c['application/json'] || (c['application/json'] = { schema: { example: UNAUTH_EXAMPLE } });
                if (!appJson.schema) appJson.schema = { example: UNAUTH_EXAMPLE };
                if (!appJson.schema.example) appJson.schema.example = UNAUTH_EXAMPLE;
            }
            if (responses['403']) {
                const c = responses['403'].content || (responses['403'].content = {});
                const appJson = c['application/json'] || c['text/event-stream'] || (c['application/json'] = { schema: { example: SEC_EXAMPLE_TEMPLATE(scopes) } });
                if (!appJson.schema) appJson.schema = { example: SEC_EXAMPLE_TEMPLATE(scopes) };
                if (!appJson.schema.example || !appJson.schema.example?.error?.missing_scopes) {
                    appJson.schema.example = SEC_EXAMPLE_TEMPLATE(scopes);
                }
            }
        }
    }
    // eslint-disable-next-line no-console
    console.log('[openapi] Document generated. Writing files...');
    (document as any)['x-tagGroups'] = [
        { name: 'Health & Auth', tags: ['Health', 'Auth'] },
        { name: 'Organizations & Projects', tags: ['Orgs', 'Projects'] },
        { name: 'Configuration', tags: ['Settings'] },
        { name: 'Content & Ingestion', tags: ['Ingestion', 'Documents', 'Chunks'] },
        { name: 'Search', tags: ['Search'] },
        { name: 'Chat', tags: ['Chat'] },
        { name: 'Knowledge Graph', tags: ['Graph'] }
    ];

    writeFileSync(join(process.cwd(), 'openapi.json'), JSON.stringify(document, null, 2), 'utf-8');
    writeFileSync(join(process.cwd(), 'openapi.yaml'), yaml.dump(document, { lineWidth: 120 }), 'utf-8');
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
