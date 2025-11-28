import { DataSource } from 'typeorm';
import dotenv from 'dotenv';

dotenv.config();

const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5437'),
  username: process.env.POSTGRES_USER || 'spec',
  password: process.env.POSTGRES_PASSWORD || 'spec',
  database: process.env.POSTGRES_DB || 'spec',
  entities: ['apps/server/dist/entities/*.entity.js'],
  synchronize: false,
});

async function test() {
  console.log('Initializing TypeORM DataSource...');
  await AppDataSource.initialize();
  console.log('✓ TypeORM connected!');

  const documentRepo = AppDataSource.getRepository('Document');
  const count = await documentRepo.count();
  console.log(`✓ Document repository working - ${count} documents in database`);

  await AppDataSource.destroy();
  console.log('✓ TypeORM test complete!');
}

test().catch(console.error);
