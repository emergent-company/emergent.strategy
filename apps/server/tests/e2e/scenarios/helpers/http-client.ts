export class HttpClient {
    constructor(private readonly _baseUrl: string, private readonly _defaultHeaders: Record<string, string>) { }

    get baseUrl(): string { return this._baseUrl; }
    get defaultHeaders(): Record<string, string> { return this._defaultHeaders; }

    private mergeHeaders(init?: RequestInit, extra?: Record<string, string>): HeadersInit {
        const final: Record<string, string> = {
            ...this._defaultHeaders,
            ...(typeof init?.headers === 'object' ? init.headers as Record<string, string> : {}),
            ...(extra || {}),
        };
        return final;
    }

    private buildInit(init?: RequestInit, extraHeaders?: Record<string, string>): RequestInit {
        return {
            ...init,
            headers: this.mergeHeaders(init, extraHeaders),
        };
    }

    async get<T>(path: string, init?: RequestInit): Promise<T> {
        const res = await fetch(`${this._baseUrl}${path}`, this.buildInit(init));
        if (!res.ok) throw new Error(`GET ${path} -> ${res.status}`);
        return res.json() as Promise<T>;
    }

    async post<T>(path: string, body: unknown, init?: RequestInit): Promise<T> {
        const res = await fetch(`${this._baseUrl}${path}`, {
            ...this.buildInit(init, { 'content-type': 'application/json' }),
            method: 'POST',
            body: JSON.stringify(body),
        });
        if (!res.ok && res.status !== 201) throw new Error(`POST ${path} -> ${res.status}`);
        return res.json() as Promise<T>;
    }

    async stream(path: string, onEvent: (payload: any) => void, init?: RequestInit): Promise<void> {
        const res = await fetch(`${this._baseUrl}${path}`, this.buildInit(init));
        if (!res.ok) throw new Error(`STREAM ${path} -> ${res.status}`);
        const reader = res.body?.getReader();
        if (!reader) return;
        const decoder = new TextDecoder();
        let buf = '';
        while (true) {
            const chunk = await reader.read();
            if (chunk.done) break;
            buf += decoder.decode(chunk.value, { stream: true });
            let idx: number;
            while ((idx = buf.indexOf('\n\n')) !== -1) {
                const frame = buf.slice(0, idx).trim();
                buf = buf.slice(idx + 2);
                if (frame.startsWith('data:')) {
                    const json = frame.slice(5).trim();
                    try { onEvent(JSON.parse(json)); } catch { /* ignore malformed frame */ }
                }
            }
        }
    }
}
