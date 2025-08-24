import 'dotenv/config';
import { ensureSchema } from '../apps/server/src/db.js';

await ensureSchema();
console.log('Database schema ensured.');
