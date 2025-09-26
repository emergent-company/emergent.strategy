import crypto from 'crypto';

export interface ChangeSummaryMeta {
    added: number; removed: number; updated: number;
    propBytesBefore: number; propBytesAfter: number;
    noOp?: boolean; truncated?: boolean; elided?: boolean;
}
export interface ChangeSummary {
    added?: Record<string, unknown>;
    removed?: string[];
    updated?: Record<string, any>;
    paths?: string[];
    meta: ChangeSummaryMeta;
}

interface DiffOptions {
    largeStringThreshold?: number; // chars
    largeJsonThresholdBytes?: number; // bytes
    maxSummaryBytes?: number; // approximate serialized size cap
}

const DEFAULT_OPTS: Required<DiffOptions> = {
    largeStringThreshold: 256,
    largeJsonThresholdBytes: 2048,
    maxSummaryBytes: 16 * 1024,
};

function canonicalStringify(value: any): string {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return '[' + value.map(v => canonicalStringify(v)).join(',') + ']';
    const keys = Object.keys(value).sort();
    return '{' + keys.map(k => JSON.stringify(k) + ':' + canonicalStringify(value[k])).join(',') + '}';
}

function sha256(value: string): string {
    return 'sha256:' + crypto.createHash('sha256').update(value).digest('hex');
}

function summarizeValue(raw: any, opts: Required<DiffOptions>): any {
    // Scalars
    if (raw === null || typeof raw !== 'object') {
        if (typeof raw === 'string' && raw.length > opts.largeStringThreshold) {
            return { to_hash: sha256(raw), truncated: true };
        }
        return raw;
    }
    // Objects / arrays
    const json = canonicalStringify(raw);
    if (Buffer.byteLength(json, 'utf8') > opts.largeJsonThresholdBytes) {
        return { to_hash: sha256(json), truncated: true };
    }
    return raw;
}

function estimateSize(obj: any): number {
    try { return Buffer.byteLength(JSON.stringify(obj), 'utf8'); } catch { return 0; }
}

function escapeJsonPointer(segment: string): string {
    return segment.replace(/~/g, '~0').replace(/\//g, '~1');
}

export function diffProperties(prev: any, next: any, options?: DiffOptions): ChangeSummary | null {
    const opts = { ...DEFAULT_OPTS, ...options } as Required<DiffOptions>;
    const added: Record<string, unknown> = {};
    const removed: string[] = [];
    const updated: Record<string, any> = {};
    const pathsSet = new Set<string>();

    const prevBytes = estimateSize(prev);
    const nextBytes = estimateSize(next);

    function walk(p: any, n: any, base: string) {
        const pIsObj = p && typeof p === 'object';
        const nIsObj = n && typeof n === 'object';
        // Both scalars or type mismatch
        if (!pIsObj || !nIsObj || Array.isArray(p) !== Array.isArray(n)) {
            if (JSON.stringify(p) !== JSON.stringify(n)) {
                updated[base || '/'] = normalizeUpdated(p, n, opts);
                pathsSet.add(base || '/');
            }
            return;
        }
        if (Array.isArray(p) && Array.isArray(n)) {
            const maxLen = Math.max(p.length, n.length);
            for (let i = 0; i < maxLen; i++) {
                const path = (base ? base : '') + '/' + i;
                if (i >= n.length) {
                    removed.push(path); pathsSet.add(path);
                } else if (i >= p.length) {
                    added[path] = summarizeValue(n[i], opts); pathsSet.add(path);
                } else {
                    walk(p[i], n[i], path);
                }
            }
            return;
        }
        // Objects
        const keys = new Set([...Object.keys(p), ...Object.keys(n)]);
        const sorted = Array.from(keys).sort();
        for (const k of sorted) {
            const path = (base ? base : '') + '/' + escapeJsonPointer(k);
            if (!(k in n)) { removed.push(path); pathsSet.add(path); continue; }
            if (!(k in p)) { added[path] = summarizeValue(n[k], opts); pathsSet.add(path); continue; }
            walk(p[k], n[k], path);
        }
    }

    function normalizeUpdated(p: any, n: any, opts: Required<DiffOptions>) {
        const repr: any = {};
        const pStr = canonicalStringify(p);
        const nStr = canonicalStringify(n);
        if (pStr.length > opts.largeStringThreshold) { repr.from_hash = sha256(pStr); } else { repr.from = p; }
        if (nStr.length > opts.largeStringThreshold) { repr.to_hash = sha256(nStr); } else { repr.to = n; }
        if (repr.from_hash || repr.to_hash) repr.truncated = true;
        return repr;
    }

    walk(prev || {}, next || {}, '');

    // Additions & removals after full walk; additions recorded inline.
    const meta: ChangeSummaryMeta = {
        added: Object.keys(added).length,
        removed: removed.length,
        updated: Object.keys(updated).length,
        propBytesBefore: prevBytes,
        propBytesAfter: nextBytes,
    };

    if (!meta.added && !meta.removed && !meta.updated) {
        return null; // no-op change
    }

    const summary: ChangeSummary = {
        added: meta.added ? added : undefined,
        removed: meta.removed ? removed : undefined,
        updated: meta.updated ? updated : undefined,
        paths: Array.from(pathsSet).sort(),
        meta,
    };

    // Compaction if too large
    const size = estimateSize(summary);
    if (size > opts.maxSummaryBytes) {
        summary.updated = summary.updated ? { count: Object.keys(summary.updated).length, elided: true } as any : undefined;
        summary.meta.truncated = true;
    }

    return summary;
}
