#!/usr/bin/env node
/*
 Compares the legacy manual OpenAPI spec with the generated Nest spec.
 Usage: node scripts/diff-openapi.js

 Exit codes:
 0 -> no meaningful diff
 1 -> diff detected
 2 -> error
*/

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import yaml from 'yaml';

const root = process.cwd();
const legacyYamlPath = path.join(root, 'apps', 'server', 'openapi', 'openapi.yaml');
const nestYamlPath = path.join(root, 'apps', 'server-nest', 'openapi.yaml');

function stable(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(stable);
    return Object.keys(obj).sort().reduce((acc, k) => {
        acc[k] = stable(obj[k]);
        return acc;
    }, {});
}

function loadYaml(p) {
    if (!fs.existsSync(p)) return null;
    return yaml.parse(fs.readFileSync(p, 'utf8'));
}

function normalize(doc) {
    if (!doc) return null;
    const clone = JSON.parse(JSON.stringify(doc));
    // Remove fields that are expected to differ or are non-semantic for diffing
    delete clone.info?.version; // version changes not considered drift
    // Sort tags array for determinism
    if (Array.isArray(clone.tags)) {
        clone.tags.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    }
    return stable(clone);
}

function hash(obj) {
    return crypto.createHash('sha256').update(JSON.stringify(obj)).digest('hex');
}

function main() {
    const legacy = loadYaml(legacyYamlPath);
    const nest = loadYaml(nestYamlPath);
    if (!legacy) {
        console.error('Legacy spec not found at', legacyYamlPath);
        process.exit(2);
    }
    if (!nest) {
        console.error('Nest generated spec not found at', nestYamlPath);
        process.exit(2);
    }

    const nLegacy = normalize(legacy);
    const nNest = normalize(nest);

    const legacyHash = hash(nLegacy);
    const nestHash = hash(nNest);

    if (legacyHash === nestHash) {
        console.log('✅ OpenAPI specs match (ignoring version & ordering).');
        process.exit(0);
    }

    // Produce a minimal diff report (paths & operations diff focus)
    const report = [];
    const legacyPaths = new Set(Object.keys(nLegacy.paths || {}));
    const nestPaths = new Set(Object.keys(nNest.paths || {}));
    for (const p of [...legacyPaths].filter(p => !nestPaths.has(p))) report.push(`- Missing in Nest spec: ${p}`);
    for (const p of [...nestPaths].filter(p => !legacyPaths.has(p))) report.push(`- Extra in Nest spec: ${p}`);

    // Compare operations for shared paths
    for (const p of [...legacyPaths].filter(p => nestPaths.has(p))) {
        const lOps = Object.keys(nLegacy.paths[p]);
        const nOps = Object.keys(nNest.paths[p]);
        for (const m of lOps.filter(m => !nOps.includes(m))) report.push(`- Path ${p} missing method in Nest: ${m}`);
        for (const m of nOps.filter(m => !lOps.includes(m))) report.push(`- Path ${p} has extra method in Nest: ${m}`);
    }

    console.log('❌ OpenAPI spec drift detected.');
    if (report.length) {
        console.log('\nSummary:');
        for (const line of report) console.log(line);
    }
    console.log('\nHashes:', { legacy: legacyHash, nest: nestHash });
    process.exit(1);
}

main();
