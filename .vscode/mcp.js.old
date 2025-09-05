// Simple MCP server runner pointing to local dev HTTP endpoints
// Tools:
// - search_fts: keyword search over chunks
// - ingest_url: add a URL to the KB

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { z } from 'zod';
import fetch from 'node-fetch';

const base = process.env.MCP_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;

const server = new Server({ name: 'db', version: '0.1.0' });

server.tool('search_fts', {
    description: 'Search chunks by keyword using Postgres FTS',
    inputSchema: z.object({ q: z.string().min(1), limit: z.number().int().min(1).max(50).default(10) }),
}, async ({ q, limit }) => {
    const res = await fetch(`${base}/search?` + new URLSearchParams({ q, limit: String(limit) }));
    if (!res.ok) throw new Error(`search failed: ${res.status}`);
    const data = await res.json();
    return { content: [{ type: 'json', json: data }] };
});

server.tool('ingest_url', {
    description: 'Ingest a single URL into the KB',
    inputSchema: z.object({ url: z.string().url() }),
}, async ({ url }) => {
    const res = await fetch(`${base}/ingest/url`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url }) });
    if (!res.ok) throw new Error(`ingest failed: ${res.status}`);
    const data = await res.json();
    return { content: [{ type: 'json', json: data }] };
});

// Health resource
server.resource('health', async () => {
    const res = await fetch(`${base}/health`);
    const data = await res.json();
    return { uri: `${base}/health`, mimeType: 'application/json', name: 'health', description: 'Server health', text: JSON.stringify(data) };
});

server.start();
