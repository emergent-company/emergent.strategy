// Minimal reproduction test
import { Test, TestingModule } from '@nestjs/testing';
import { TypeRegistryService } from './apps/server/src/modules/type-registry/type-registry.service';
import { DatabaseService } from './apps/server/src/common/database/database.service';
import { vi } from 'vitest';

async function testMockInjection() {
  const mockDb = {
    query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    transaction: vi.fn(),
  };

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      TypeRegistryService,
      {
        provide: DatabaseService,
        useValue: mockDb,
      },
    ],
  }).compile();

  const service = module.get<TypeRegistryService>(TypeRegistryService);

  console.log('Service:', service);
  console.log('Service.db:', (service as any).db);
  console.log('MockDb:', mockDb);

  try {
    const result = await service.getProjectTypes(
      'test-project',
      'test-org',
      {}
    );
    console.log('Success! Result:', result);
  } catch (error) {
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
  }
}

testMockInjection();
