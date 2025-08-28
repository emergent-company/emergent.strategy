import { useEffect, useRef } from "react";

type SSEOptions = {
    onMessage: (data: string) => void;
    onError?: (err: Event) => void;
};

export function useSSE(url: string | null, opts: SSEOptions) {
    const sourceRef = useRef<EventSource | null>(null);

    useEffect(() => {
        if (!url) return;
        const es = new EventSource(url);
        sourceRef.current = es;
        es.onmessage = (ev) => opts.onMessage(ev.data);
        es.onerror = (ev) => {
            opts.onError?.(ev);
        };
        return () => {
            es.close();
            sourceRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [url]);

    return {
        close: () => sourceRef.current?.close(),
        get current() {
            return sourceRef.current;
        },
    } as const;
}
