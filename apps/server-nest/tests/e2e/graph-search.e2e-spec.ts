import request from 'supertest';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { AppModule } from '../modules/app.module';

// NOTE: This is a lightweight placeholder e2e test. Real auth & scope population TBD.
// Test notes: executed via `npm run test:e2e` which uses Vitest; Jest globals available due to @types/jest.

describe('GraphSearchController (e2e)', () => {
    let app: INestApplication;

    beforeAll(async () => {
        const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
        app = moduleRef.createNestApplication();
        app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
        await app.init();
    });

    afterAll(async () => { await app.close(); });

    it('POST /graph/search returns prototype response', async () => {
        const res = await request(app.getHttpServer())
            .post('/graph/search')
            .send({ query: 'test query' })
            .expect(200); // expecting OK
        expect(res.body.query).toBe('test query');
        expect(Array.isArray(res.body.items)).toBe(true);
    });

    it('POST /graph/search debug without scope => 403', async () => {
        await request(app.getHttpServer())
            .post('/graph/search?debug=true')
            .send({ query: 'debug attempt', includeDebug: true })
            .expect(403);
    });
});
