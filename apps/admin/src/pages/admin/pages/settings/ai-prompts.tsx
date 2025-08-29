import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/auth";
import { Link } from "react-router";

const API_BASE = (import.meta as any).env?.VITE_API_BASE || `${window.location.protocol}//${window.location.hostname}:3001`;

function useSettingString(key: string, initial: string) {
    const { getAccessToken } = useAuth();
    const [value, setValue] = useState<string>(initial);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const t = getAccessToken();
                const res = await fetch(`${API_BASE}/settings/${encodeURIComponent(key)}`, { headers: t ? { Authorization: `Bearer ${t}` } : {} });
                if (res.ok) {
                    const data = (await res.json()) as { key: string; value: any };
                    const v = data?.value;
                    const text = typeof v === 'string' ? v : v?.text || v?.template || '';
                    if (!cancelled) setValue(text || initial);
                }
            } catch (e) {
                // ignore
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [key, initial, getAccessToken]);

    const save = async (next: string) => {
        setLoading(true);
        setError(null);
        try {
            const t = getAccessToken();
            const res = await fetch(`${API_BASE}/settings/${encodeURIComponent(key)}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) },
                body: JSON.stringify({ value: next }),
            });
            if (!res.ok) throw new Error(`Save failed: ${res.status}`);
            setValue(next);
        } catch (e: any) {
            setError(e?.message || 'failed');
        } finally {
            setLoading(false);
        }
    };

    return { value, setValue, loading, error, save } as const;
}

export default function AiPromptsSettingsPage() {
    const systemDefault = "You are a helpful assistant. Answer the user question using only the provided CONTEXT. Cite sources inline using bracketed numbers like [1], [2], matching the provided context order. If the answer can't be derived from the CONTEXT, say you don't know rather than hallucinating.";
    const humanDefault = "Question:\n{question}\n\nCONTEXT (citations in order):\n{context}\n\nProvide a concise, well-structured answer.";

    const system = useSettingString('chat.systemPrompt', systemDefault);
    const user = useSettingString('chat.userTemplate', humanDefault);

    return (
        <div className="min-sm:container">
            <div className="text-sm breadcrumbs">
                <ul>
                    <li><Link to="/admin">Admin</Link></li>
                    <li>Settings</li>
                    <li>AI Prompts</li>
                </ul>
            </div>

            <h1 className="mt-4 font-semibold text-xl">AI Prompt Templates</h1>
            <p className="mt-2 text-base-content/70">Edit the system and user prompt used by Chat with retrieved context. Use placeholders where applicable.</p>

            {/* System Prompt Card */}
            <div className="bg-base-100 mt-6 card-border card">
                <div className="gap-6 sm:gap-8 card-body">
                    <div className="flex items-center gap-2">
                        <span className="size-5 iconify lucide--shield" />
                        <h2 className="font-medium text-lg">System Prompt</h2>
                    </div>
                    <textarea
                        className="mt-3 sm:mt-4 w-full h-40 textarea"
                        value={system.value}
                        onChange={(e) => system.setValue(e.target.value)}
                        placeholder={systemDefault}
                    />
                    <div className="flex justify-end items-center gap-3 sm:gap-4 mt-3 sm:mt-4">
                        <button className="btn btn-sm btn-ghost" onClick={() => system.setValue(systemDefault)}>Restore default</button>
                        <button className="btn btn-sm btn-primary" onClick={() => system.save(system.value)} disabled={system.loading}>Save</button>
                        {system.error && <span className="text-error text-sm">{system.error}</span>}
                    </div>
                </div>
            </div>

            {/* User Template Card */}
            <div className="bg-base-100 mt-6 card-border card">
                <div className="gap-6 sm:gap-8 card-body">
                    <div className="flex items-center gap-2">
                        <span className="size-5 iconify lucide--user" />
                        <h2 className="font-medium text-lg">User Template</h2>
                    </div>
                    <p className="mt-1 text-xs text-base-content/70">Required placeholders: {'{question}'} and {'{context}'}</p>
                    <textarea
                        className="mt-3 sm:mt-4 w-full h-48 textarea"
                        value={user.value}
                        onChange={(e) => user.setValue(e.target.value)}
                        placeholder={humanDefault}
                    />
                    <div className="flex justify-end items-center gap-3 sm:gap-4 mt-3 sm:mt-4">
                        <button className="btn btn-sm btn-ghost" onClick={() => user.setValue(humanDefault)}>Restore default</button>
                        <button
                            className="btn btn-sm btn-primary"
                            onClick={() => user.save(user.value)}
                            disabled={user.loading || !/{question}/.test(user.value) || !/{context}/.test(user.value)}
                            title={!/{question}/.test(user.value) || !/{context}/.test(user.value) ? 'Template must include {question} and {context}' : ''}
                        >Save</button>
                        {user.error && <span className="text-error text-sm">{user.error}</span>}
                    </div>
                </div>
            </div>
        </div>
    );
}
