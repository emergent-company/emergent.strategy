import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { loadAndNormalizeOpenApi, diffObjects } from './utils/openapi-normalize';

/**
 * OpenAPI Snapshot Diff Test
 * Compares the normalized current openapi.json with a committed baseline snapshot.
 * Set UPDATE_OPENAPI_SNAPSHOT=1 to overwrite the baseline intentionally.
 */

const SNAPSHOT_PATH = join(__dirname, 'openapi.snapshot.json');

describe('openapi snapshot', () => {
    it('matches committed baseline (update with UPDATE_OPENAPI_SNAPSHOT=1)', () => {
        const current = loadAndNormalizeOpenApi(join(process.cwd(), 'openapi.json'));
        const baselineRaw = readFileSync(SNAPSHOT_PATH, 'utf8');
        const baseline = JSON.parse(baselineRaw);
        if (process.env.UPDATE_OPENAPI_SNAPSHOT === '1') {
            writeFileSync(SNAPSHOT_PATH, JSON.stringify(current, null, 2));
            // eslint-disable-next-line no-console
            console.log('[openapi] Baseline snapshot updated.');
            return; // Pass test after update
        }
        const { added, removed, changed } = diffObjects(baseline, current);
        const hasDiff = (added.length + removed.length + changed.length) > 0;
        if (hasDiff) {
            const summary = [
                'OpenAPI snapshot drift detected:',
                added.length ? `  Added:   ${added.slice(0, 10).join(', ')}${added.length > 10 ? '…' : ''}` : '',
                removed.length ? `  Removed: ${removed.slice(0, 10).join(', ')}${removed.length > 10 ? '…' : ''}` : '',
                changed.length ? `  Changed: ${changed.slice(0, 10).join(', ')}${changed.length > 10 ? '…' : ''}` : ''
            ].filter(Boolean).join('\n');
            const diffPath = join(process.cwd(), 'openapi.diff.current.json');
            writeFileSync(diffPath, JSON.stringify({ baseline, current }, null, 2));
            throw new Error(summary + `\nFull diff artifact written to ${diffPath}`);
        }
        expect(hasDiff).toBe(false);
    });
});
