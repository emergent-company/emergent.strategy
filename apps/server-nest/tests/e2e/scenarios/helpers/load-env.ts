// Loads scenario-specific env file (.env.e2e.scenarios[.local]) before RUN gating.
// It only sets variables that are not already defined so explicit CLI env wins.
import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'dotenv';

function loadFile(p: string) {
    try {
        if (fs.existsSync(p)) {
            const parsed = parse(fs.readFileSync(p));
            for (const [k, v] of Object.entries(parsed)) {
                if (process.env[k] === undefined) process.env[k] = v;
            }
        }
    } catch { /* ignore */ }
}

// Always attempt loading (non-destructive) so model/env vars are available even when RUN_SCENARIO_E2E is passed inline.
const cwd = process.cwd();
const serverNestDir = path.join(cwd, 'apps', 'server-nest');
// Root first (allows override), then app-specific (acts as default if root missing)
loadFile(path.join(cwd, '.env.e2e.scenarios.local'));
loadFile(path.join(cwd, '.env.e2e.scenarios'));
loadFile(path.join(serverNestDir, '.env.e2e.scenarios.local'));
loadFile(path.join(serverNestDir, '.env.e2e.scenarios'));

if (process.env.E2E_DEBUG_CHAT === '1') {
    // eslint-disable-next-line no-console
    console.log('[load-env-debug] after load', {
        GOOGLE_API_KEY: !!process.env.GOOGLE_API_KEY,
        CHAT_MODEL_ENABLED: process.env.CHAT_MODEL_ENABLED,
        searchOrder: [cwd, serverNestDir],
    });
}
