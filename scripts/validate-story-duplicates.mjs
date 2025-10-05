#!/usr/bin/env node
/**
 * validate-story-duplicates.mjs
 * Scans Storybook CSF stories under apps/admin/src/components for duplicate (title, storyExportName) pairs.
 * Also flags duplicate titles across different physical component folders to catch legacy root duplicates.
 * Exit codes:
 *  0 - no duplicates
 *  1 - duplicates found
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';

const root = new URL('../apps/admin/src/components/', import.meta.url).pathname;
const allowedRootDirs = new Set(['atoms', 'molecules', 'organisms', 'templates', 'wireframes']); // templates reserved for future use; wireframes for low-fi mockups
// Any .tsx/.ts file at root (except index.ts) and any directory not in allowed set is a violation unless explicitly whitelisted
const allowedRootFiles = new Set(['index.ts']);
// Transitional allowances (to be removed once migrated)
// Transitional root files list is now empty after shim cleanup (2025-09-21).
// Any new root-level component or test file must be placed in an atomic layer directory instead.
const transitionalRootFiles = new Set([]);
// All transitional directories (forms, layout, chat, ui) removed as of 2025-09-21
const transitionalRootDirs = new Set([]);

// Deadlines: entries past their removal date cause failure (YYYY-MM-DD). Keep dates aggressive.
const transitionalDeadlines = {
    // Root file shims
    // (All former root shim files deleted 2025-09-21)
    // Directories (treat similarly)
    // (No remaining transitional directories)
    // forms/layout removed; keep original deadlines documented here for historical context
};

function isPast(dateStr) {
    if (!dateStr) return false;
    const today = new Date().toISOString().slice(0, 10);
    return today > dateStr; // strict greater means same day still allowed
}

function walk(dir) {
    return readdirSync(dir, { withFileTypes: true }).flatMap(d => {
        const p = join(dir, d.name);
        if (d.isDirectory()) return walk(p);
        if (d.isFile() && /\.stories\.(t|j)sx?$/.test(d.name)) return [p];
        return [];
    });
}

const storyFiles = walk(root);

// STRUCTURAL VALIDATION (Atomic root hygiene)
function validateStructure() {
    const entries = readdirSync(root, { withFileTypes: true });
    const unexpectedFiles = [];
    const unexpectedDirs = [];
    const expired = [];
    const rootTestFiles = [];
    for (const e of entries) {
        if (e.isFile()) {
            if ((e.name.endsWith('.ts') || e.name.endsWith('.tsx')) && !allowedRootFiles.has(e.name)) {
                if (!transitionalRootFiles.has(e.name)) {
                    unexpectedFiles.push(e.name);
                } else if (isPast(transitionalDeadlines[e.name])) {
                    expired.push(e.name + ' (deadline ' + transitionalDeadlines[e.name] + ')');
                }
                // Track root-level test files explicitly for stronger guidance
                if (e.name.endsWith('.test.tsx') || e.name.endsWith('.test.ts')) {
                    rootTestFiles.push(e.name);
                }
            }
        } else if (e.isDirectory()) {
            if (!allowedRootDirs.has(e.name)) {
                if (!transitionalRootDirs.has(e.name)) {
                    unexpectedDirs.push(e.name);
                } else if (isPast(transitionalDeadlines[e.name])) {
                    expired.push(e.name + '/ (deadline ' + transitionalDeadlines[e.name] + ')');
                }
            }
        }
    }
    if (unexpectedFiles.length || unexpectedDirs.length || expired.length || rootTestFiles.length) {
        console.error('Atomic structure violation: Files/folders found at components root not in allowed atomic layer directories.');
        if (unexpectedFiles.length) {
            console.error('  Unexpected root files:');
            unexpectedFiles.forEach(f => console.error('   - ' + f));
        }
        if (unexpectedDirs.length) {
            console.error('  Unexpected root directories:');
            unexpectedDirs.forEach(d => console.error('   - ' + d));
        }
        if (expired.length) {
            console.error('  Transitional items past deadline:');
            expired.forEach(x => console.error('   - ' + x));
        }
        if (rootTestFiles.length) {
            console.error('  Root-level test files are prohibited. Move these into their atomic component folders:');
            rootTestFiles.forEach(x => console.error('   - ' + x));
        }
        console.error('\nAllowed root directories:', Array.from(allowedRootDirs).join(', '));
        console.error('Transitional (temporarily tolerated) directories:', Array.from(transitionalRootDirs).join(', '));
        console.error('Transitional (temporarily tolerated) files:', Array.from(transitionalRootFiles).join(', '));
        console.error('Add to transitional sets only with a TODO + planned removal date.');
        process.exit(1);
    }
}

validateStructure();

// Enforce: no story files directly under the components root directory (must be collocated inside an atomic layer folder)
const forbiddenRootStories = storyFiles.filter(f => dirname(f) === root.slice(0, -1));
if (forbiddenRootStories.length > 0) {
    console.error('Root-level story files are forbidden. Move them into atoms/, molecules/, organisms/, or templates/ subdirectories:');
    forbiddenRootStories.forEach(f => console.error('  - ' + f.replace(root, '')));
    process.exit(1);
}
const titleRegex = /title:\s*['"]([^'"]+)['"]/; // simple heuristic CSF meta title
const exportRegex = /export\s+const\s+([A-Z0-9_][A-Za-z0-9_]*)\s*:?\s*(Story|StoryObj)?/g; // capture named story exports

/** Maps */
const byKey = new Map(); // key -> array of files
const byTitle = new Map(); // title -> Set of parent directories

for (const file of storyFiles) {
    const content = readFileSync(file, 'utf8');
    const metaMatch = content.match(titleRegex);
    if (!metaMatch) continue; // skip docs-only or malformed stories
    const title = metaMatch[1];
    if (!byTitle.has(title)) byTitle.set(title, new Set());
    byTitle.get(title).add(dirname(file));

    // gather exports
    exportRegex.lastIndex = 0; // reset
    let match;
    const exports = [];
    while ((match = exportRegex.exec(content)) !== null) {
        const exportName = match[1];
        if (exportName === 'default') continue;
        exports.push(exportName);
    }
    // If no explicit exports but has meta, assume implicit "default" story? Storybook still creates id using 'default'
    if (exports.length === 0) exports.push('default');

    for (const ex of exports) {
        const key = `${title}::${ex.toLowerCase()}`; // Storybook lowercases export for id composition
        if (!byKey.has(key)) byKey.set(key, []);
        byKey.get(key).push(file);
    }
}

let failed = false;

for (const [key, files] of byKey.entries()) {
    if (files.length > 1) {
        failed = true;
        console.error(`Duplicate story id components for ${key}:`);
        for (const f of files) console.error(`  - ${f.replace(root, '')}`);
    }
}

for (const [title, dirSet] of byTitle.entries()) {
    if (dirSet.size > 1) {
        const dirs = Array.from(dirSet);
        // If any directories are at root vs nested molecules/atoms etc, warn (legacy duplication pattern)
        const rootLevel = dirs.filter(d => d === root.slice(0, -1));
        if (dirs.length > 1) {
            failed = true;
            console.error(`Title used in multiple directories '${title}':`);
            dirs.forEach(d => console.error(`  - ${d}`));
        }
    }
}

if (failed) {
    console.error('\nStory duplicate validation failed. Resolve collisions above.');
    process.exit(1);
} else {
    console.log(`No duplicate story titles/ids across ${storyFiles.length} story files ✅`);
}
