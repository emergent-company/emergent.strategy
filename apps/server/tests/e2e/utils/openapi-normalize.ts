import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Load the current root-level generated openapi.json and return a normalized
 * object suitable for deterministic snapshot diffing. We aggressively sort keys
 * and strip/transform any fields known to vary (timestamps, empty arrays ordering, etc.).
 */
export function loadAndNormalizeOpenApi(filePath: string = join(process.cwd(), 'openapi.json')): any {
    const raw = readFileSync(filePath, 'utf8');
    const doc = JSON.parse(raw);
    return deepSort(prune(doc));
}

// Recursively sort object keys; leave arrays order intact (OpenAPI arrays are semantically ordered)
function deepSort<T>(value: T): T {
    if (Array.isArray(value)) return value.map(v => deepSort(v)) as any;
    if (value && typeof value === 'object') {
        const out: Record<string, any> = {};
        for (const key of Object.keys(value as any).sort()) {
            out[key] = deepSort((value as any)[key]);
        }
        return out as any;
    }
    return value;
}

// Remove / rewrite volatile fields if any arise (placeholder for future needs)
function prune<T>(value: T): T {
    if (Array.isArray(value)) return value.map(v => prune(v)) as any;
    if (value && typeof value === 'object') {
        const out: Record<string, any> = {};
        for (const [k, v] of Object.entries(value as any)) {
            // Example: strip empty description fields if they appear later
            if (v === undefined) continue;
            out[k] = prune(v);
        }
        return out as any;
    }
    return value;
}

export function diffObjects(a: any, b: any) {
    const added: string[] = [];
    const removed: string[] = [];
    const changed: string[] = [];
    walk(a, b, '');
    return { added, removed, changed };

    function walk(left: any, right: any, path: string) {
        if (left === undefined && right !== undefined) {
            added.push(path || '<root>');
            return;
        }
        if (left !== undefined && right === undefined) {
            removed.push(path || '<root>');
            return;
        }
        if (typeof left !== typeof right) {
            changed.push(path || '<root>');
            return;
        }
        if (left && typeof left === 'object') {
            if (Array.isArray(left) && Array.isArray(right)) {
                if (JSON.stringify(left) !== JSON.stringify(right)) {
                    changed.push(path || '<root>');
                }
                return;
            }
            const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
            for (const k of keys) {
                walk(left[k], right[k], path ? `${path}.${k}` : k);
            }
            return;
        }
        if (left !== right) changed.push(path || '<root>');
    }
}
