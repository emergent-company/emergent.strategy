import { authHeader } from '../auth-helpers';

/** Tracks org IDs created during a test file so they can be cleaned up. */
export class OrgTracker {
    private readonly created = new Set<string>();
    constructor(private readonly baseUrl: string, private readonly userSuffix: string) { }

    record(id: string) { this.created.add(id); }

    async create(name: string): Promise<string> {
        const base = name;
        let attempt = 0;
        while (true) { // bounded by retry guard
            const res = await fetch(`${this.baseUrl}/orgs`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...authHeader('all', this.userSuffix) },
                body: JSON.stringify({ name })
            });
            if (res.status === 201) {
                const body = await res.json() as { id?: string };
                if (!body.id) throw new Error('Org create response missing id');
                this.record(body.id);
                return body.id;
            }
            // Retry transient name conflicts (409) which can occur with rapid Date.now collisions across workers
            if (res.status === 409 && attempt < 4) {
                attempt++;
                await new Promise(r => setTimeout(r, 40 * attempt + Math.floor(Math.random() * 30)));
                const rand = Math.random().toString(36).slice(2, 6);
                name = `${base}-${Date.now()}-${attempt}-${rand}`;
                continue;
            }
            throw new Error(`Failed to create org ${name}: ${res.status}`);
        }
    }

    async delete(orgId: string): Promise<number> {
        const res = await fetch(`${this.baseUrl}/orgs/${orgId}`, { method: 'DELETE', headers: authHeader('all', this.userSuffix) });
        return res.status;
    }

    /** Delete all recorded org IDs (best-effort). */
    async cleanup(): Promise<void> {
        await Promise.all(Array.from(this.created).map(async id => {
            try { await this.delete(id); } catch { /* ignore */ }
        }));
        this.created.clear();
    }
}
