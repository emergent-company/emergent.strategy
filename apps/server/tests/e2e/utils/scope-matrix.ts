import { readFileSync } from 'fs';
import { join } from 'path';

interface OpenApiDoc { paths: Record<string, Record<string, any>> }

export interface SecuredOp {
    method: string; // GET, POST...
    path: string;   // /documents
    requiredScopes: string[];
    operationId?: string;
    hasRequestBody: boolean;
}

export function loadSecuredOperations(docPath = join(process.cwd(), 'openapi.json')): SecuredOp[] {
    const raw = readFileSync(docPath, 'utf8');
    const doc = JSON.parse(raw) as OpenApiDoc;
    const out: SecuredOp[] = [];
    for (const [pathKey, methods] of Object.entries(doc.paths || {})) {
        for (const [method, opRaw] of Object.entries(methods)) {
            const op: any = opRaw;
            const scopes = op['x-required-scopes'];
            const secured = Array.isArray(scopes) && scopes.length > 0;
            if (!secured) continue;
            out.push({
                method: method.toUpperCase(),
                path: pathKey,
                requiredScopes: scopes.slice().sort(),
                operationId: op.operationId,
                hasRequestBody: !!op.requestBody
            });
        }
    }
    return out;
}

// Very small request body fakers registry for endpoints needing one. Add as needed.
export function buildBodyFor(op: SecuredOp): any | undefined {
    const key = `${op.method} ${op.path}`;
    switch (key) {
        case 'POST /documents':
            return { filename: 'matrix.txt', content: 'scope-matrix' };
        case 'POST /ingest/upload':
            return { filename: 'matrix.txt', content: 'scope-matrix' }; // if JSON fallback accepted
        case 'POST /ingest/url':
            return { url: 'https://example.com/matrix.txt' };
        default:
            return undefined;
    }
}

// Map abstract scope sets to synthetic tokens used by auth-helpers logic.
// Existing tokens:
//  - no-scope => []
//  - with-scope => ['read:me'] (minimal user scope only)
//  - e2e-all / e2e-<suffix> => Full scopes (treated by guard as admin)
// For matrix we approximate: If requiredScopes length > 0 and not satisfied by 'with-scope', we expect 403.
export type TokenVariant = 'none' | 'userMinimal' | 'all';

export function tokenHeaderFor(variant: TokenVariant, projectId: string): Record<string, string> {
    switch (variant) {
        case 'none':
            return { Authorization: 'Bearer no-scope', 'x-project-id': projectId };
        case 'userMinimal':
            return { Authorization: 'Bearer with-scope', 'x-project-id': projectId };
        case 'all':
            return { Authorization: 'Bearer e2e-matrix', 'x-project-id': projectId };
    }
}

export function variantsFor(op: SecuredOp): TokenVariant[] {
    // Always test these three; could expand later with partial sets if model distinguishes them.
    return ['none', 'userMinimal', 'all'];
}
