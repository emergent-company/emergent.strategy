import { HttpClient } from './http-client';

export async function uploadPlainText(client: HttpClient, projectId: string, text: string, filename = 'scenario.txt') {
    const form = new FormData();
    form.append('projectId', projectId);
    form.append('filename', filename);
    form.append('mimeType', 'text/plain');
    form.append('file', new Blob([text], { type: 'text/plain' }), filename);
    const res = await fetch(`${client.baseUrl}/ingest/upload`, {
        method: 'POST',
        headers: { ...client.defaultHeaders }, // let browser/node set multipart boundary automatically
        body: form,
    });
    if (!res.ok) {
        let body: any = null;
        try { body = await res.text(); } catch { /* ignore */ }
        throw new Error('Upload failed ' + res.status + ' body=' + body);
    }
    return res.json();
}
