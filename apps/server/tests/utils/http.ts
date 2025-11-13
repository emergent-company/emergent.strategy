export interface HttpJsonResponse<T = any> {
    status: number;
    headers: Headers;
    json: T;
}

export async function httpGet<T = any>(baseUrl: string, path: string, init?: RequestInit): Promise<HttpJsonResponse<T>> {
    const res = await fetch(baseUrl + path, init);
    const ct = res.headers.get('content-type') || '';
    const isJson = ct.includes('application/json');
    const json = (isJson ? await res.json() : (undefined as unknown)) as T;
    return { status: res.status, headers: res.headers, json };
}

export async function httpGetAuth<T = any>(baseUrl: string, path: string, token?: string): Promise<HttpJsonResponse<T>> {
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    return httpGet<T>(baseUrl, path, { headers });
}
