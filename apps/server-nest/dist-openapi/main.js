"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("reflect-metadata");
const core_1 = require("@nestjs/core");
const app_module_1 = require("./modules/app.module");
const common_1 = require("@nestjs/common");
const http_exception_filter_1 = require("./common/filters/http-exception.filter");
const swagger_1 = require("@nestjs/swagger");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const js_yaml_1 = __importDefault(require("js-yaml"));
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule, { cors: true });
    app.useGlobalPipes(new common_1.ValidationPipe({
        whitelist: true,
        transform: true,
        forbidUnknownValues: false,
        transformOptions: { enableImplicitConversion: true },
        validateCustomDecorators: true,
    }));
    const config = new swagger_1.DocumentBuilder()
        .setTitle('Spec Server API')
        .setDescription('Generated OpenAPI spec (NestJS)')
        .setVersion('0.2.0')
        .addBearerAuth()
        .build();
    const document = swagger_1.SwaggerModule.createDocument(app, config);
    // Inject x-tagGroups post-generation (placeholder groups)
    document['x-tagGroups'] = [
        { name: 'Health & Auth', tags: ['Health', 'Auth'] },
        { name: 'Organizations & Projects', tags: ['Orgs', 'Projects'] },
        { name: 'Configuration', tags: ['Settings'] },
        { name: 'Content & Ingestion', tags: ['Ingestion', 'Documents', 'Chunks'] },
        { name: 'Search', tags: ['Search'] },
        { name: 'Chat', tags: ['Chat'] },
    ];
    const openapiJsonPath = (0, node_path_1.join)(process.cwd(), 'openapi.json');
    (0, node_fs_1.writeFileSync)(openapiJsonPath, JSON.stringify(document, null, 2), 'utf-8');
    const openapiYamlPath = (0, node_path_1.join)(process.cwd(), 'openapi.yaml');
    (0, node_fs_1.writeFileSync)(openapiYamlPath, js_yaml_1.default.dump(document), 'utf-8');
    // Side-by-side copy into legacy server openapi folder (non-fatal if path missing)
    try {
        const legacyDir = (0, node_path_1.join)(process.cwd(), '..', 'server', 'openapi');
        (0, node_fs_1.writeFileSync)((0, node_path_1.join)(legacyDir, 'nest-openapi.yaml'), js_yaml_1.default.dump(document), 'utf-8');
    }
    catch (e) {
        // eslint-disable-next-line no-console
        console.warn('Could not copy spec to legacy openapi dir (optional):', e.message);
    }
    swagger_1.SwaggerModule.setup('/docs-swagger', app, document);
    app.useGlobalFilters(new http_exception_filter_1.GlobalHttpExceptionFilter());
    await app.listen(process.env.PORT || 4000);
}
bootstrap().catch((err) => {
    // eslint-disable-next-line no-console
    console.error('Bootstrap failure', err);
    process.exit(1);
});
//# sourceMappingURL=main.js.map