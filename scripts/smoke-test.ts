import 'dotenv/config';
import fetch, { FormData, fileFrom } from 'node-fetch';
import { fileURLToPath } from 'url';
import path from 'path';

const base = `http://localhost:${process.env.PORT || 3002}`;

async function run() {
    const h = await fetch(`${base}/health`).then(r => r.json());
    console.log('Health:', h);

    const fd = new FormData();
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const mdPath = path.resolve(__dirname, '../spec/test_data/meeting_1.md');
    const file = await fileFrom(mdPath, 'text/markdown');
    fd.set('file', file, 'meeting_1.md');
    const res = await fetch(`${base}/ingest/upload`, {
        method: 'POST',
        body: fd as any
    }).then(r => r.json());

    console.log('Ingest Upload:', res);

    const search = await fetch(`${base}/search?` + new URLSearchParams({ q: 'meeting', limit: '5' })).then(r => r.json());
    console.log('Search:', search);
}

run().catch(e => { console.error(e); process.exit(1); });
