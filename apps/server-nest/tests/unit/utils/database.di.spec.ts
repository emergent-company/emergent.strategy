import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { AppConfigModule } from '../../../src/common/config/config.module';
import { DatabaseModule } from '../../../src/common/database/database.module';
import { DatabaseService } from '../../../src/common/database/database.service';

describe('DatabaseService DI', () => {
  test('AppConfigService is injected', async () => {
    process.env.NODE_ENV = 'test';
    process.env.DB_AUTOINIT = 'false';
    const mod = await Test.createTestingModule({
      imports: [AppConfigModule, DatabaseModule],
      // Fallback manual provider if decorator metadata fails
      providers: [
        {
          provide: 'AppConfigServiceManual',
          useFactory: () => ({
            skipDb: false,
            dbHost: 'localhost',
            dbPort: 5432,
            dbUser: 'spec',
            dbPassword: 'spec',
            dbName: 'spec',
            autoInitDb: false,
          }),
        },
      ],
    }).compile();
    const db = mod.get(DatabaseService);
    expect((db as any)['config']).toBeDefined();
  });
});
