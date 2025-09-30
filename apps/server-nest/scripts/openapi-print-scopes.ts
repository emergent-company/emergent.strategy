#!/usr/bin/env ts-node
/*
 * Utility: Print a sorted JSON map of "method path" -> [scopes]
 * to assist in updating golden scope tests intentionally.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

interface OpenApiDoc { paths?: Record<string, any>; }

function main() {
    const specPath = join(process.cwd(), 'openapi.json');
    const raw = readFileSync(specPath, 'utf-8');
    const doc: OpenApiDoc = JSON.parse(raw);
    const paths = doc.paths || {};
    const map: Record<string, string[]> = {};
    for (const [path, ops] of Object.entries(paths)) {
        for (const [method, opAny] of Object.entries(ops as Record<string, any>)) {
            const op = opAny as any;
            if (!['get', 'post', 'put', 'patch', 'delete'].includes(method)) continue;
            const scopes: unknown = op['x-required-scopes'];
            if (Array.isArray(scopes) && scopes.length) {
                map[`${method} ${path}`] = scopes.slice();
            }
        }
    }
    const ordered = Object.fromEntries(Object.entries(map).sort(([a], [b]) => a.localeCompare(b)));
    console.log(JSON.stringify(ordered, null, 2));
}

main();
