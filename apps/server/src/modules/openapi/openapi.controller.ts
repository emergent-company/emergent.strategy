import { Controller, Get } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// This controller dynamically generates the OpenAPI document on demand.
// It is excluded from the Swagger UI itself to avoid self-listing.
@ApiExcludeController()
@Controller('openapi')
export class OpenApiController {
  @Get()
  json() {
    // Reuse the file emitted at bootstrap (apps/server/openapi.json)
    const path = join(process.cwd(), 'openapi.json');
    try {
      const raw = readFileSync(path, 'utf-8');
      const doc = JSON.parse(raw);
      if (doc?.paths && doc.paths['/'] && !doc.paths['/search']) {
        doc.paths['/search'] = doc.paths['/'];
        delete doc.paths['/'];
      }
      return doc;
    } catch (e) {
      return { error: 'openapi-not-generated', message: (e as Error).message };
    }
  }
}
