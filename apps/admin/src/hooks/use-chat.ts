import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/contexts/useAuth';
import { useConfig } from '@/contexts/config';
import { useApi } from '@/hooks/use-api';
import type {
  ChatChunk,
  ChatRequest,
  Conversation,
  Message,
  Role,
} from '@/types/chat';

function storageKey(orgId?: string | null, projectId?: string | null): string {
  const o = orgId || 'default';
  const p = projectId || 'default';
  return `spec-server.chat.conversations.${o}.${p}`;
}

function uid(prefix = 'id'): string {
  return `${prefix}_${Math.random()
    .toString(36)
    .slice(2, 10)}${Date.now().toString(36)}`;
}

function nowIso() {
  return new Date().toISOString();
}

function loadConversations(key: string): Conversation[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Conversation[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveConversations(key: string, convos: Conversation[]) {
  try {
    localStorage.setItem(key, JSON.stringify(convos));
  } catch {
    // ignore quota and serialization errors
  }
}

function sortByUpdatedDesc(a: Conversation, b: Conversation) {
  return (b.updatedAt || '').localeCompare(a.updatedAt || '');
}

function dedupeConversations(list: Conversation[]): Conversation[] {
  // Ensure unique by id; if duplicates, merge keeping the one with more messages and newer updatedAt
  const byId = new Map<string, Conversation>();
  for (const c of list) {
    const ex = byId.get(c.id);
    if (!ex) {
      byId.set(c.id, c);
    } else {
      const pickNewer = (ex.updatedAt || '') < (c.updatedAt || '');
      const pickMoreMsgs =
        (ex.messages?.length || 0) < (c.messages?.length || 0);
      byId.set(c.id, pickNewer || pickMoreMsgs ? c : ex);
    }
  }
  let arr = Array.from(byId.values());
  // Cross-id dedupe: collapse temp vs server duplicates when first user message matches and created close in time
  const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
  const keyFor = (c: Conversation) => {
    const firstUser = (c.messages || []).find((m) => m.role === 'user');
    return firstUser ? normalize(firstUser.content || '') : '';
  };
  const buckets = new Map<string, Conversation[]>();
  for (const c of arr) {
    const k = keyFor(c);
    if (!k) continue;
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k)!.push(c);
  }
  for (const [, group] of buckets) {
    if (group.length < 2) continue;
    const servers = group.filter((c) => !/^c_/.test(c.id));
    const temps = group.filter((c) => /^c_/.test(c.id));
    if (servers.length === 0 || temps.length === 0) continue;
    // pick newest server as target
    const target = servers.sort((a, b) =>
      (b.createdAt || '').localeCompare(a.createdAt || '')
    )[0];
    const targetTime = Date.parse(target.createdAt || target.updatedAt || '');
    for (const t of temps) {
      const tTime = Date.parse(t.createdAt || t.updatedAt || '');
      // consider duplicates within 60s window
      if (
        Number.isFinite(tTime) &&
        Number.isFinite(targetTime) &&
        Math.abs(tTime - targetTime) < 60_000
      ) {
        // Merge richer messages into target if needed
        if ((t.messages?.length || 0) > (target.messages?.length || 0)) {
          target.messages = t.messages;
        }
        // drop temp from arr
        arr = arr.filter((c) => c.id !== t.id);
      }
    }
  }
  // Collapse multiple empty temp conversations created very close in time
  const temps = arr.filter(
    (c) => /^c_/.test(c.id) && (c.messages?.length || 0) === 0
  );
  if (temps.length > 1) {
    const keep = temps.sort((a, b) =>
      (b.createdAt || '').localeCompare(a.createdAt || '')
    )[0];
    arr = arr.filter(
      (c) =>
        !(
          /^c_/.test(c.id) &&
          (c.messages?.length || 0) === 0 &&
          c.id !== keep.id
        )
    );
  }
  return arr.sort(sortByUpdatedDesc);
}

function keyMatchesFirstUser(a: Conversation, b: Conversation): boolean {
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
  const fa = (a.messages || []).find((m) => m.role === 'user')?.content || '';
  const fb = (b.messages || []).find((m) => m.role === 'user')?.content || '';
  return norm(fa) === norm(fb) && !!fa;
}

export type UseChatOptions = {
  topK?: number;
};

export function useChat(opts: UseChatOptions = {}) {
  const { getAccessToken } = useAuth();
  const {
    config: { activeOrgId, activeProjectId },
  } = useConfig();
  const lsKey = useMemo(
    () => storageKey(activeOrgId, activeProjectId),
    [activeOrgId, activeProjectId]
  );
  const [conversations, setConversations] = useState<Conversation[]>(() =>
    loadConversations(lsKey)
  );
  const [activeId, setActiveId] = useState<string | null>(
    conversations[0]?.id ?? null
  );
  const [streaming, setStreaming] = useState(false);
  const [mcpToolActive, setMcpToolActive] = useState<{
    tool: string;
    status: string;
  } | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const streamingRef = useRef(false);
  useEffect(() => {
    streamingRef.current = streaming;
  }, [streaming]);
  // Keep latest values in refs to avoid stale closures causing duplicate creations
  const conversationsRef = useRef<Conversation[]>(conversations);
  const activeIdRef = useRef<string | null>(activeId);
  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);
  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  const { apiBase, buildHeaders } = useApi();
  const authHeaders = useCallback(
    (): Record<string, string> => buildHeaders({ json: false }),
    [buildHeaders]
  );

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === activeId) || null,
    [conversations, activeId]
  );

  const setConversationsPersisted = useCallback(
    (updater: (prev: Conversation[]) => Conversation[]) => {
      setConversations((prev) => {
        const next = dedupeConversations(updater(prev));
        saveConversations(lsKey, next);
        return next;
      });
    },
    [lsKey]
  );

  // When org/project changes, reload scoped conversations
  useEffect(() => {
    const list = loadConversations(lsKey);
    setConversations(list);
    setActiveId(list[0]?.id ?? null);
  }, [lsKey]);

  // Optional: Fetch server-side grouped conversation metadata and merge by id
  const refreshConversationsFromServer = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/api/chat/conversations`, {
        headers: authHeaders(),
      });
      if (!res.ok) return;
      const data = (await res.json()) as {
        shared: Array<any>;
        private: Array<any>;
      };
      let serverList: Conversation[] = [...data.shared, ...data.private].map(
        (c) => ({
          id: c.id,
          title: c.title || 'Conversation',
          createdAt: c.created_at || c.createdAt,
          updatedAt: c.updated_at || c.updatedAt,
          messages: [],
          ownerUserId: c.owner_subject_id || c.owner_user_id || c.ownerUserId,
          isPrivate: !!(c.is_private ?? c.isPrivate),
        })
      );
      // If we're currently streaming a brand-new temp conversation, suppress very recent server additions to avoid duplicates
      if (
        streamingRef.current &&
        activeIdRef.current &&
        /^c_/.test(activeIdRef.current)
      ) {
        const now = Date.now();
        serverList = serverList.filter((c) => {
          const t = Date.parse(c.updatedAt || c.createdAt || '');
          if (!Number.isFinite(t)) return true;
          // keep if it's already known locally by id
          if (conversationsRef.current.some((x) => x.id === c.id)) return true;
          // suppress entries updated in the last 30 seconds (likely the just-created one)
          return now - t >= 30_000;
        });
      }
      // Merge: prefer existing messages in local cache
      setConversationsPersisted((prev) => {
        const merged = [...prev, ...serverList];
        // Prune: drop stale empty temp conversations (no messages) that are not active
        const now = Date.now();
        const pruned = merged.filter((c) => {
          if (!/^c_/.test(c.id)) return true;
          if (c.id === activeIdRef.current) return true;
          const isEmpty = (c.messages?.length || 0) === 0;
          if (!isEmpty) return true;
          const t = Date.parse(c.createdAt || c.updatedAt || '');
          if (!Number.isFinite(t)) return false; // malformed timestamp: drop
          // keep very recent temps (< 20s), drop older
          return now - t < 20_000;
        });
        return pruned;
      });
    } catch {
      // ignore refresh failures; local cache will be used
    }
  }, [apiBase, setConversationsPersisted, authHeaders]);

  // Kick a background refresh once per mount
  useEffect(() => {
    void refreshConversationsFromServer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setActive = useCallback((id: string | null) => setActiveId(id), []);

  // Hydrate messages from server when activating a conversation
  useEffect(() => {
    const id = activeId;
    if (!id) return;
    // Skip hydration for temporary ids or non-UUID ids to avoid server errors
    const uuidRe =
      /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;
    if (/^c_/.test(id) || !uuidRe.test(id)) return;
    let aborted = false;
    (async () => {
      try {
        const res = await fetch(`${apiBase}/api/chat/${id}`, {
          headers: authHeaders(),
        });
        if (!res.ok) {
          // If conversation not found (404), remove it from localStorage to prevent future errors
          if (res.status === 404) {
            setConversationsPersisted((prev) =>
              prev.filter((c) => c.id !== id)
            );
            setActiveId(null);
          }
          return;
        }
        const payload = await res.json();
        // Backend returns the conversation object directly (no { conversation } wrapper) – support both
        const raw: any = payload?.conversation ?? payload;
        if (!raw || typeof raw !== 'object') return;
        const convData: Conversation = {
          id: raw.id,
          title: raw.title || 'Conversation',
          createdAt: raw.createdAt || raw.created_at,
          updatedAt: raw.updatedAt || raw.updated_at,
          ownerUserId:
            raw.owner_subject_id || raw.ownerUserId || raw.owner_user_id,
          isPrivate: !!(raw.isPrivate ?? raw.is_private),
          messages: Array.isArray(raw.messages) ? raw.messages : [],
        };
        if (aborted) return;
        setConversationsPersisted((prev) => {
          const idx = prev.findIndex((c) => c.id === id);
          if (idx < 0) return [...prev, convData];
          const merged: Conversation = {
            ...prev[idx],
            title: convData.title,
            createdAt: convData.createdAt,
            updatedAt: convData.updatedAt,
            ownerUserId: convData.ownerUserId,
            isPrivate: convData.isPrivate,
            messages: convData.messages,
          };
          return [...prev.slice(0, idx), merged, ...prev.slice(idx + 1)];
        });
      } catch {
        // ignore
      }
    })();
    return () => {
      aborted = true;
    };
  }, [activeId, apiBase, setConversationsPersisted, authHeaders]);

  const upsertConversation = useCallback(
    (conv: Conversation) => {
      setConversationsPersisted((prev) => {
        const idx = prev.findIndex((c) => c.id === conv.id);
        return idx >= 0
          ? [...prev.slice(0, idx), conv, ...prev.slice(idx + 1)]
          : [conv, ...prev];
      });
    },
    [setConversationsPersisted]
  );

  const createConversation = useCallback(
    (
      title?: string,
      init?: { isPrivate?: boolean; ownerUserId?: string }
    ): Conversation => {
      // If there's an active empty conversation, reuse it instead of creating a new one
      const latestConvs = conversationsRef.current;
      const active = latestConvs.find((c) => c.id === activeIdRef.current);
      if (active && (active.messages?.length || 0) === 0) {
        const reused: Conversation = {
          ...active,
          title: title || active.title || 'New Conversation',
          isPrivate: init?.isPrivate ?? !!active.isPrivate,
        };
        upsertConversation(reused);
        setActiveId(reused.id);
        return reused;
      }
      const c: Conversation = {
        id: uid('c'),
        title: title || 'New Conversation',
        createdAt: nowIso(),
        updatedAt: nowIso(),
        messages: [],
        isPrivate: init?.isPrivate ?? false,
        ownerUserId: init?.ownerUserId,
      };
      setConversationsPersisted((prev) => [c, ...prev]);
      setActiveId(c.id);
      return c;
    },
    [setConversationsPersisted, upsertConversation]
  );

  const appendMessage = useCallback(
    (conversationId: string, role: Role, content: string): Message => {
      const m: Message = { id: uid('m'), role, content, createdAt: nowIso() };
      setConversationsPersisted((prev) => {
        const idx = prev.findIndex((c) => c.id === conversationId);
        const timestamp = nowIso();
        if (idx < 0) {
          // Create a new conversation on-the-fly if it doesn't exist yet (avoids race with upsert + append)
          const d = new Date();
          const yyyy = d.getFullYear();
          const mm = `${d.getMonth() + 1}`.padStart(2, '0');
          const dd = `${d.getDate()}`.padStart(2, '0');
          const words = content.trim().split(/\s+/).slice(0, 8).join(' ');
          const snippet = words.length > 48 ? words.slice(0, 48) : words;
          const title =
            role === 'user'
              ? `${yyyy}-${mm}-${dd} — ${snippet || 'New Conversation'}`
              : 'New Conversation';
          const conv: Conversation = {
            id: conversationId,
            title,
            createdAt: timestamp,
            updatedAt: timestamp,
            messages: [m],
            isPrivate: false,
          };
          return [conv, ...prev];
        }
        const wasEmpty = prev[idx].messages.length === 0;
        // Auto-name on first user message: YYYY-MM-DD — snippet
        let newTitle = prev[idx].title;
        if (wasEmpty && role === 'user') {
          const d = new Date();
          const yyyy = d.getFullYear();
          const mm = `${d.getMonth() + 1}`.padStart(2, '0');
          const dd = `${d.getDate()}`.padStart(2, '0');
          const words = content.trim().split(/\s+/).slice(0, 8).join(' ');
          const snippet = words.length > 48 ? words.slice(0, 48) : words;
          newTitle = `${yyyy}-${mm}-${dd} — ${snippet || 'New Conversation'}`;
        }
        const conv: Conversation = {
          ...prev[idx],
          title: newTitle,
          updatedAt: timestamp,
          messages: [...prev[idx].messages, m],
        };
        return [...prev.slice(0, idx), conv, ...prev.slice(idx + 1)];
      });
      return m;
    },
    [setConversationsPersisted]
  );

  const updateMessage = useCallback(
    (conversationId: string, messageId: string, patch: Partial<Message>) => {
      setConversationsPersisted((prev) => {
        const ci = prev.findIndex((c) => c.id === conversationId);
        if (ci < 0) return prev;
        const conv = prev[ci];
        const mi = conv.messages.findIndex((m) => m.id === messageId);
        if (mi < 0) return prev;
        const msg = { ...conv.messages[mi], ...patch } as Message;
        const newConv: Conversation = {
          ...conv,
          updatedAt: nowIso(),
          messages: [
            ...conv.messages.slice(0, mi),
            msg,
            ...conv.messages.slice(mi + 1),
          ],
        };
        return [...prev.slice(0, ci), newConv, ...prev.slice(ci + 1)];
      });
    },
    [setConversationsPersisted]
  );

  const stop = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setStreaming(false);
  }, []);

  const send = useCallback(
    async (input: {
      message: string;
      conversationId?: string;
      topK?: number;
      documentIds?: string[];
      isPrivate?: boolean;
    }) => {
      const { message, topK = opts.topK ?? 5, documentIds } = input;
      if (!message.trim()) return;
      if (streaming) return;

      // Use existing conversation only if provided/active; otherwise defer creation until server assigns id
      const latestConvs = conversationsRef.current;
      let conv =
        latestConvs.find((c) => c.id === input.conversationId) ||
        latestConvs.find((c) => c.id === activeIdRef.current!) ||
        activeConversation ||
        null;
      if (
        conv &&
        conv.messages.length === 0 &&
        typeof input.isPrivate === 'boolean'
      ) {
        // allow setting privacy before first message
        conv = { ...conv, isPrivate: !!input.isPrivate };
        upsertConversation(conv);
      }
      // Append messages optimistically in a temp phantom if no conversation yet
      let workingConvId = conv?.id ?? uid('c');
      if (!conv) {
        // do not persist an empty conversation before first message; we persist as soon as we add the user msg
        const phantom: Conversation = {
          id: workingConvId,
          title: message.slice(0, 48) || 'New Conversation',
          createdAt: nowIso(),
          updatedAt: nowIso(),
          messages: [],
          isPrivate: !!input.isPrivate,
        };
        upsertConversation(phantom);
      }
      setActiveId(workingConvId);
      appendMessage(workingConvId, 'user', message);
      const assistant = appendMessage(workingConvId, 'assistant', '');

      const history = (
        conversationsRef.current.find((c) => c.id === workingConvId)
          ?.messages || []
      )
        .slice(-8)
        .map((m) => ({ role: m.role, content: m.content }));

      setStreaming(true);
      const controller = new AbortController();
      controllerRef.current = controller;

      // Use fetch with ReadableStream SSE proxy endpoint
      const res = await fetch(`${apiBase}/api/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          message,
          conversationId:
            conv?.id && !/^c_/.test(conv.id) ? conv.id : undefined,
          history,
          topK,
          documentIds,
          stream: true,
          isPrivate: (conv?.isPrivate ?? input.isPrivate) as boolean,
        } satisfies ChatRequest),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        let errText: string = `Request failed: ${res.status}`;
        let gotJson = false;
        try {
          const clone = res.clone();
          const j = await clone.json();
          gotJson = true;
          if (j?.error) {
            const raw = j.error;
            if (typeof raw === 'string') errText = raw;
            else if (raw && typeof raw.message === 'string')
              errText = raw.message;
            else {
              try {
                errText = JSON.stringify(raw);
              } catch {
                errText = String(raw);
              }
            }
          }
        } catch {
          // not JSON
        }
        if (!gotJson) {
          try {
            const txt = await res.text();
            if (txt) errText = txt.trim();
          } catch {
            /* ignore */
          }
        }
        if (/Cannot POST \/chat\/stream/i.test(errText)) {
          errText =
            'Chat backend endpoint /chat/stream not found. Ensure the Nest server (apps/server) is running and exposes POST /chat/stream.';
        }
        // Truncate very large payloads to avoid UI issues
        if (errText.length > 500) errText = errText.slice(0, 500) + '…';
        updateMessage(workingConvId, assistant.id, {
          content: `Error: ${errText}`,
          citations: [],
        });
        setStreaming(false);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let serverConvId: string | null = null;
      let currentConvId = workingConvId;
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split('\n\n');
          buffer = parts.pop() || '';
          for (const chunk of parts) {
            const line = chunk.trim();
            if (!line.startsWith('data:')) continue;
            const json = line.slice(5).trim();
            if (!json) continue;
            const evt = JSON.parse(json) as ChatChunk;
            if (!serverConvId && evt.type === 'meta' && evt.conversationId) {
              serverConvId = evt.conversationId;
              // If our local id isn't a UUID (starts with c_), remap to server id
              if (
                /^c_/.test(currentConvId) &&
                serverConvId &&
                currentConvId !== serverConvId
              ) {
                setConversationsPersisted((prev) => {
                  const tempIdx = prev.findIndex((c) => c.id === currentConvId);
                  if (tempIdx < 0) return prev;
                  // If an item with server id already exists, merge messages and metadata, then remove temp
                  const existingIdx = prev.findIndex(
                    (c) => c.id === serverConvId
                  );
                  if (existingIdx >= 0) {
                    const temp = prev[tempIdx];
                    const target = prev[existingIdx];
                    const merged: Conversation = {
                      ...target,
                      title: target.title || temp.title,
                      updatedAt: nowIso(),
                      isPrivate:
                        typeof target.isPrivate === 'boolean'
                          ? target.isPrivate
                          : temp.isPrivate,
                      messages:
                        (target.messages?.length || 0) >=
                        (temp.messages?.length || 0)
                          ? target.messages
                          : temp.messages,
                    };
                    const next = [...prev];
                    next[existingIdx] = merged;
                    next.splice(tempIdx, 1);
                    return next;
                  }
                  const updated: Conversation = {
                    ...prev[tempIdx],
                    id: serverConvId!,
                  };
                  const next = [...prev];
                  next[tempIdx] = updated;
                  return next;
                });
                setActiveId(serverConvId);
                currentConvId = serverConvId;
                // also update workingConvId used in outer closure
                workingConvId = serverConvId;
              }
            }
            if (evt.type === 'token' && evt.token) {
              // Append token to assistant content
              setConversationsPersisted((prev) => {
                const ci = prev.findIndex((c) => c.id === currentConvId);
                if (ci < 0) return prev;
                const convPrev = prev[ci];
                const mi = convPrev.messages.findIndex(
                  (m) => m.id === assistant.id
                );
                if (mi < 0) return prev;
                const msg = {
                  ...convPrev.messages[mi],
                  content: convPrev.messages[mi].content + evt.token,
                } as Message;
                const newConv: Conversation = {
                  ...convPrev,
                  updatedAt: nowIso(),
                  messages: [
                    ...convPrev.messages.slice(0, mi),
                    msg,
                    ...convPrev.messages.slice(mi + 1),
                  ],
                };
                return [...prev.slice(0, ci), newConv, ...prev.slice(ci + 1)];
              });
            } else if (evt.type === 'meta' && evt.citations) {
              updateMessage(currentConvId, assistant.id, {
                citations: evt.citations,
              });
            } else if (evt.type === 'mcp_tool') {
              // Handle MCP tool execution events
              if (evt.status === 'started' && evt.tool) {
                setMcpToolActive({ tool: evt.tool, status: 'running' });
              } else if (evt.status === 'completed') {
                setMcpToolActive(null);
                // Optionally append tool result info to assistant message
                // For now, we let the LLM handle formatting the result
              } else if (evt.status === 'error') {
                setMcpToolActive(null);
                // Error is already logged, LLM will continue without tool context
              }
            } else if (evt.type === 'error') {
              let errStr: string = 'unknown';
              const raw = (evt as any).error;
              if (typeof raw === 'string') errStr = raw;
              else if (raw && typeof raw.message === 'string')
                errStr = raw.message;
              else if (raw != null) {
                try {
                  errStr = JSON.stringify(raw);
                } catch {
                  errStr = String(raw);
                }
              }
              if (errStr.length > 500) errStr = errStr.slice(0, 500) + '…';
              updateMessage(currentConvId, assistant.id, {
                content: `Error: ${errStr}`,
              });
            } else if (evt.type === 'done') {
              setStreaming(false);
              setMcpToolActive(null); // Clear MCP tool status when stream completes
              // Finalize by hydrating from server to ensure canonical data and drop any temp duplicates
              const id = serverConvId || currentConvId;
              if (id && !/^c_/.test(id)) {
                try {
                  const refRes = await fetch(`${apiBase}/api/chat/${id}`, {
                    headers: authHeaders(),
                  });
                  if (refRes.ok) {
                    const payload = await refRes.json();
                    const raw: any = (payload as any)?.conversation ?? payload;
                    if (!raw || typeof raw !== 'object') return;
                    const convData: Conversation = {
                      id: raw.id,
                      title: raw.title || 'Conversation',
                      createdAt: raw.createdAt || raw.created_at,
                      updatedAt: raw.updatedAt || raw.updated_at,
                      ownerUserId:
                        raw.owner_subject_id ||
                        raw.ownerUserId ||
                        raw.owner_user_id,
                      isPrivate: !!(raw.isPrivate ?? raw.is_private),
                      messages: Array.isArray(raw.messages) ? raw.messages : [],
                    };
                    setConversationsPersisted((prev) => {
                      const withoutTemps = prev.filter(
                        (c) =>
                          c.id === id ||
                          !(
                            /^c_/.test(c.id) && keyMatchesFirstUser(c, convData)
                          )
                      );
                      const idx = withoutTemps.findIndex((c) => c.id === id);
                      if (idx < 0) return [convData, ...withoutTemps];
                      const next = [...withoutTemps];
                      next[idx] = {
                        ...next[idx],
                        title: convData.title,
                        createdAt: convData.createdAt,
                        updatedAt: convData.updatedAt,
                        ownerUserId: convData.ownerUserId,
                        isPrivate: convData.isPrivate,
                        messages: convData.messages,
                      };
                      return next;
                    });
                  }
                } catch {
                  // ignore
                }
              }
            }
          }
        }
      } catch (e) {
        // aborted or network error
      } finally {
        setStreaming(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [apiBase, conversations, activeConversation]
  );

  const regenerate = useCallback(async () => {
    const conv = activeConversation;
    if (!conv) return;
    const lastUser = [...conv.messages]
      .reverse()
      .find((m) => m.role === 'user');
    if (!lastUser) return;
    await send({ message: lastUser.content, conversationId: conv.id });
  }, [activeConversation, send]);

  const renameConversation = useCallback(
    async (conversationId: string, title: string) => {
      let prevSnapshot: Conversation[] | null = null;
      setConversationsPersisted((prev) => {
        prevSnapshot = prev;
        const idx = prev.findIndex((c) => c.id === conversationId);
        if (idx < 0) return prev;
        const conv: Conversation = { ...prev[idx], title, updatedAt: nowIso() };
        return [...prev.slice(0, idx), conv, ...prev.slice(idx + 1)];
      });
      try {
        await fetch(`${apiBase}/api/chat/${conversationId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({ title }),
        });
      } catch {
        if (prevSnapshot) setConversations(prevSnapshot);
      }
    },
    [apiBase, setConversationsPersisted, authHeaders]
  );

  const deleteConversation = useCallback(
    async (conversationId: string) => {
      const prevSnapshot = conversations;
      const prevActive = activeIdRef.current;
      setConversationsPersisted((prev) =>
        prev.filter((c) => c.id !== conversationId)
      );
      setActiveId((prevId) => (prevId === conversationId ? null : prevId));

      // If this is a temporary conversation (starts with c_), it was never persisted to server
      // Just remove it locally without sending DELETE request to backend
      if (/^c_/.test(conversationId)) {
        return;
      }

      try {
        const res = await fetch(`${apiBase}/api/chat/${conversationId}`, {
          method: 'DELETE',
          headers: authHeaders(),
        });
        if (!res.ok) {
          // Roll back on authorization/server failure
          setConversations(prevSnapshot);
          setActiveId(prevActive || null);
        }
      } catch (err) {
        setConversations(prevSnapshot);
        setActiveId(prevActive || null);
      }
    },
    [apiBase, conversations, setConversationsPersisted, authHeaders]
  );

  return {
    conversations,
    sharedConversations: useMemo(
      () => conversations.filter((c) => !c.isPrivate),
      [conversations]
    ),
    privateConversations: useMemo(
      () => conversations.filter((c) => c.isPrivate),
      [conversations]
    ),
    activeConversation,
    setActive,
    createConversation,
    deleteConversation,
    renameConversation,
    refreshConversationsFromServer,
    send,
    stop,
    regenerate,
    streaming,
    mcpToolActive,
  } as const;
}
