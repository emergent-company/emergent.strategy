"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("reflect-metadata");
const core_1 = require("@nestjs/core");
const app_module_1 = require("./modules/app.module");
const swagger_1 = require("@nestjs/swagger");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const js_yaml_1 = __importDefault(require("js-yaml"));
async function generate() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule, { logger: false });
    const config = new swagger_1.DocumentBuilder()
        .setTitle('Spec Server API')
        .setDescription('Generated OpenAPI spec (code-first)')
        .setVersion('0.2.0')
        .addBearerAuth()
        .build();
    const document = swagger_1.SwaggerModule.createDocument(app, config);
    document['x-tagGroups'] = [
        { name: 'Health & Auth', tags: ['Health', 'Auth'] },
        { name: 'Organizations & Projects', tags: ['Orgs', 'Projects'] },
        { name: 'Configuration', tags: ['Settings'] },
        { name: 'Content & Ingestion', tags: ['Ingestion', 'Documents', 'Chunks'] },
        { name: 'Search', tags: ['Search'] },
        { name: 'Chat', tags: ['Chat'] }
    ];
    (0, node_fs_1.writeFileSync)((0, node_path_1.join)(process.cwd(), 'openapi.json'), JSON.stringify(document, null, 2));
    (0, node_fs_1.writeFileSync)((0, node_path_1.join)(process.cwd(), 'openapi.yaml'), js_yaml_1.default.dump(document));
    await app.close();
}
generate().catch((e) => {
    console.error(e); // eslint-disable-line no-console
    process.exit(1);
});
//# sourceMappingURL=openapi-generate.js.map