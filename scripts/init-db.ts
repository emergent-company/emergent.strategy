import path from 'node:path';
import fs from 'node:fs';
import * as dotenv from 'dotenv';

// Load .env (same pattern as other scripts) early.
(() => {
    const envPath = process.env.DOTENV_PATH || path.resolve(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
        dotenv.config({ path: envPath });
        // eslint-disable-next-line no-console
        console.log(`[init-db] Loaded environment from ${envPath}`);
    }
})();
// Legacy simple server removed; reuse root-level db helper for schema init.
import { ensureSchema } from '../src/db.js';

await ensureSchema();
console.log('Database schema ensured.');
