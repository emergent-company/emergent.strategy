#!/usr/bin/env node
/*
Simple guard: ensure each component TSX file has a sibling or colocated story file.
Focus scope on apps/admin/src/components/** only.
*/
import { readdirSync, statSync, readFileSync } from 'node:fs';
import { join, extname, basename, dirname } from 'node:path';

const ROOT = process.cwd();
const COMPONENTS_DIR = join(ROOT, 'apps/admin/src/components');

/** @typedef {{ path: string; name: string; hasStory: boolean }} Entry */

/** Recursively walk directory */
function walk(dir) {
    const entries = readdirSync(dir);
    /** @type {string[]} */
    const files = [];
    for (const entry of entries) {
        const p = join(dir, entry);
        const s = statSync(p);
        if (s.isDirectory()) files.push(...walk(p));
        else files.push(p);
    }
    return files;
}

function isComponentTsx(path) {
    if (!path.endsWith('.tsx')) return false;
    // exclude stories and storybook config
    if (path.endsWith('.stories.tsx')) return false;
    if (path.includes('.storybook')) return false;
    // exclude index barrels
    const file = basename(path);
    if (file === 'index.ts' || file === 'index.tsx') return false;
    // exclude types-only files
    const content = readFileSync(path, 'utf8');
    if (!/export default function|export function|export const|React\.FC|function /.test(content)) {
        // not a component-ish file
        return false;
    }
    return true;
}

function hasStoryFor(path) {
    const dir = dirname(path);
    const base = basename(path).replace(/\.tsx$/, '');
    const candidates = [
        join(dir, `${base}.stories.tsx`),
        join(dir, `${base}.story.tsx`),
    ];
    return candidates.some((c) => {
        try {
            statSync(c);
            return true;
        } catch {
            return false;
        }
    });
}

function main() {
    try {
        const all = walk(COMPONENTS_DIR);
        const components = all.filter(isComponentTsx);
        const missing = components.filter((p) => !hasStoryFor(p));

        if (missing.length) {
            console.error('\nStorybook coverage check failed. Missing stories for:');
            for (const m of missing) {
                console.error(` - ${m.replace(ROOT + '/', '')}`);
            }
            console.error('\nPolicy: Refactors must include a story. Add minimal stories or document exception.');
            process.exit(2);
        }
        console.log(`Story coverage OK: ${components.length} components.`);
    } catch (err) {
        console.error('check-stories error:', err);
        process.exit(1);
    }
}

main();
