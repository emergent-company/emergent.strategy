import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import { PageTitle } from "@/components/PageTitle";
import NewChatCtas from "@/components/NewChatCtas";
import { useChat } from "@/hooks/use-chat";
import type { Conversation, Message } from "@/types/chat";

function useQuery() {
    const { search } = useLocation();
    return useMemo(() => new URLSearchParams(search), [search]);
}

export default function ChatConversationPage() {
    const nav = useNavigate();
    const params = useParams();
    const query = useQuery();
    const { activeConversation, conversations, sharedConversations, privateConversations, send, stop, regenerate, setActive, streaming, deleteConversation } = useChat();
    const [input, setInput] = useState("");
    const [error, setError] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement | null>(null);
    const [recalled, setRecalled] = useState(false);
    const recalledContentRef = useRef<string>("");

    // On first mount, wire up conversation from route and optional ?q=
    const didInitRef = useRef(false);
    useEffect(() => {
        if (didInitRef.current) return; // prevent double-run in React StrictMode dev
        didInitRef.current = true;
        const q = query.get("q");
        const priv = query.get("private") === "1";
        const routeId = params.id;
        const uuidRe = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;
        if (routeId && routeId !== "new") {
            const found = conversations.find((c) => c.id === routeId) || null;
            if (found) setActive(found.id);
        }
        if (q) {
            setInput(q);
            const convId = routeId && routeId !== "new" && uuidRe.test(routeId) ? routeId : undefined;
            void send({ message: q, conversationId: convId, isPrivate: priv });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const onSubmit = async () => {
        setError(null);
        const text = input.trim();
        if (!text) return;
        try {
            await send({ message: text, conversationId: activeConversation?.id });
            setInput("");
            setRecalled(false);
            recalledContentRef.current = "";
        } catch (e: any) {
            setError(e.message || "Failed to send");
        }
    };

    const conv = activeConversation;

    const isEmpty = (conv?.messages?.length || 0) === 0;

    return (
        <div className="drawer drawer-open">
            <input id="chat-drawer" type="checkbox" className="drawer-toggle" />
            <div className="drawer-content">
                <div className="mx-auto p-4 container">
                    <PageTitle title="Conversation" items={[{ label: "Admin" }, { label: "Chat" }, { label: "Conversation", active: true }]} />

                    {error && (
                        <div className="toast-bottom toast toast-end">
                            <div role="alert" className="alert alert-error">
                                <span className="size-5 iconify lucide--alert-triangle" />
                                <span>{error}</span>
                            </div>
                        </div>
                    )}

                    <div className="mt-4 card">
                        <div className="card-body">
                            {isEmpty ? (
                                <div className="flex flex-col justify-center items-center">
                                    <div className="w-full sm:max-w-4xl">
                                        <div className="inline-block bg-clip-text bg-gradient-to-tr from-40% from-base-content to-primary font-semibold text-transparent text-2xl sm:text-4xl tracking-tight">
                                            <p>Hi there</p>
                                            <p className="mt-1">How can I assist you today?</p>
                                        </div>
                                        <NewChatCtas
                                            onPickPrompt={async (p) => {
                                                setInput("");
                                                await send({ message: p, conversationId: conv?.id });
                                            }}
                                            onSubmit={async (p, opts) => {
                                                const msg = p.trim();
                                                if (!msg) return;
                                                await send({ message: msg, conversationId: conv?.id, ...(conv && conv.messages.length === 0 ? { isPrivate: opts?.isPrivate } : {}) });
                                            }}
                                        />
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <div className="space-y-6">
                                        {conv?.messages.map((m) => (
                                            <MessageRow key={m.id} msg={m} />
                                        ))}
                                        {streaming && (
                                            <div className="chat chat-start">
                                                <div className="chat-bubble chat-bubble-primary">
                                                    <span className="loading loading-dots loading-sm" aria-live="polite" />
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    <div className="right-0 bottom-0 left-0 sticky bg-base-100 mt-4">
                                        <div className="w-full join">
                                            <input
                                                ref={inputRef}
                                                className="w-full input join-item input-md"
                                                placeholder="Ask anything about your documents..."
                                                value={input}
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    setInput(val);
                                                    if (recalled && val !== recalledContentRef.current) {
                                                        setRecalled(true);
                                                    }
                                                }}
                                                onKeyDown={(e) => {
                                                    if (!e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
                                                        if (e.key === "ArrowUp") {
                                                            if (!input.trim()) {
                                                                const lastUser = [...(conv?.messages || [])].reverse().find((m) => m.role === "user");
                                                                if (lastUser) {
                                                                    e.preventDefault();
                                                                    setInput(lastUser.content);
                                                                    setRecalled(true);
                                                                    recalledContentRef.current = lastUser.content;
                                                                    // place caret at end
                                                                    requestAnimationFrame(() => {
                                                                        const el = inputRef.current;
                                                                        if (el) {
                                                                            const len = el.value.length;
                                                                            el.setSelectionRange(len, len);
                                                                        }
                                                                    });
                                                                    return;
                                                                }
                                                            } else {
                                                                // Move caret to start when content exists
                                                                requestAnimationFrame(() => {
                                                                    const el = inputRef.current;
                                                                    if (el) el.setSelectionRange(0, 0);
                                                                });
                                                            }
                                                        } else if (e.key === "ArrowDown") {
                                                            if (recalled && input === recalledContentRef.current) {
                                                                // Clear recalled content before any edits
                                                                e.preventDefault();
                                                                setInput("");
                                                                setRecalled(false);
                                                                recalledContentRef.current = "";
                                                                return;
                                                            }
                                                            if (input) {
                                                                // Move caret to end when content exists
                                                                requestAnimationFrame(() => {
                                                                    const el = inputRef.current;
                                                                    if (el) {
                                                                        const len = el.value.length;
                                                                        el.setSelectionRange(len, len);
                                                                    }
                                                                });
                                                            }
                                                        }
                                                    }
                                                    if (e.key === "Enter" && !e.shiftKey) {
                                                        e.preventDefault();
                                                        onSubmit();
                                                    }
                                                }}
                                            />
                                            <button
                                                className="btn join-item btn-primary"
                                                aria-label="Send"
                                                onClick={onSubmit}
                                                disabled={!input.trim() || streaming}
                                            >
                                                <span className="iconify lucide--send" />
                                            </button>
                                            {streaming ? (
                                                <button className="btn join-item btn-error btn-ghost" aria-label="Stop" onClick={stop}>
                                                    <span className="iconify lucide--square" />
                                                </button>
                                            ) : (
                                                <button className="btn join-item btn-ghost" aria-label="Regenerate" onClick={regenerate}>
                                                    <span className="lucide--rotate-ccw iconify" />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </div>
            <div className="drawer-side">
                <label htmlFor="chat-drawer" aria-label="close sidebar" className="drawer-overlay"></label>
                <aside className="bg-base-200 p-4 w-80 min-h-full overflow-x-hidden text-base-content">
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="font-semibold text-sm">Conversations</h2>
                        <div className="inline-flex items-center gap-1">
                            <button
                                className="btn btn-ghost btn-xs"
                                aria-label="New chat"
                                onClick={() => {
                                    setActive(null);
                                    setInput("");
                                    nav(`/admin/apps/chat/c/new`);
                                }}
                            >
                                <span className="iconify lucide--plus" />
                            </button>
                            <label htmlFor="chat-drawer" className="lg:hidden btn btn-ghost btn-xs" aria-label="Close sidebar">
                                <span className="iconify lucide--x" />
                            </label>
                        </div>
                    </div>
                    <ul className="p-0 w-full overflow-x-hidden menu">
                        <li className="menu-title"><span>Shared</span></li>
                        {sharedConversations.map((c) => (
                            <li key={c.id} className={`w-full overflow-hidden ${c.id === conv?.id ? "menu-active" : ""}`}>
                                <div className="flex items-center gap-2 w-full min-w-0 max-w-full overflow-hidden">
                                    <button
                                        className="block flex-1 w-full min-w-0 max-w-full text-left"
                                        onClick={() => {
                                            setActive(c.id);
                                            nav(`/admin/apps/chat/c/${c.id}`);
                                        }}
                                        aria-label={`Open conversation ${c.title}`}
                                    >
                                        <ConversationListItem conv={c} />
                                    </button>
                                    <button
                                        className="btn btn-ghost btn-xs shrink-0"
                                        aria-label="Delete conversation"
                                        onClick={() => {
                                            const confirmDelete = window.confirm("Delete this conversation?");
                                            if (confirmDelete) {
                                                deleteConversation(c.id);
                                                if (c.id === conv?.id) {
                                                    nav(`/admin/apps/chat/c/new`);
                                                }
                                            }
                                        }}
                                    >
                                        <span className="iconify lucide--trash" />
                                    </button>
                                </div>
                            </li>
                        ))}
                        {privateConversations.length > 0 && (<li className="mt-2 menu-title"><span>Private</span></li>)}
                        {privateConversations.map((c) => (
                            <li key={c.id} className={`w-full overflow-hidden ${c.id === conv?.id ? "menu-active" : ""}`}>
                                <div className="flex items-center gap-2 w-full min-w-0 max-w-full overflow-hidden">
                                    <button
                                        className="block flex-1 w-full min-w-0 max-w-full text-left"
                                        onClick={() => {
                                            setActive(c.id);
                                            nav(`/admin/apps/chat/c/${c.id}`);
                                        }}
                                        aria-label={`Open conversation ${c.title}`}
                                    >
                                        <ConversationListItem conv={c} />
                                    </button>
                                    <button
                                        className="btn btn-ghost btn-xs shrink-0"
                                        aria-label="Delete conversation"
                                        onClick={() => {
                                            const confirmDelete = window.confirm("Delete this conversation?");
                                            if (confirmDelete) {
                                                deleteConversation(c.id);
                                                if (c.id === conv?.id) {
                                                    nav(`/admin/apps/chat/c/new`);
                                                }
                                            }
                                        }}
                                    >
                                        <span className="iconify lucide--trash" />
                                    </button>
                                </div>
                            </li>
                        ))}
                    </ul>
                </aside>
            </div>
        </div>
    );
}

function ConversationListItem({ conv }: { conv: Conversation }) {
    const date = (conv.createdAt || "").slice(0, 10);
    const firstUser = (conv.messages || []).find((m) => m.role === "user");
    const raw = firstUser?.content || conv.title || "";
    const words = raw.trim().split(/\s+/).slice(0, 8).join(" ");
    const snippet = words.length > 48 ? words.slice(0, 48) + "…" : words;
    return (
        <div className="flex flex-col w-full min-w-0 max-w-full">
            <span className="block opacity-70 w-full max-w-full text-xs truncate">{date}</span>
            <span className="block w-full max-w-full text-sm truncate">{snippet || "New Conversation"}</span>
        </div>
    );
}

function MessageRow({ msg }: { msg: Message }) {
    const isUser = msg.role === "user";
    return (
        <div className={`chat ${isUser ? "chat-end" : "chat-start"}`}>
            <div className={`chat-bubble ${isUser ? "" : "chat-bubble-primary"}`}>
                <div className="max-w-none whitespace-pre-wrap prose">{msg.content}</div>
                {!isUser && msg.citations && msg.citations.length > 0 && (
                    <div className="mt-3">
                        <div className="collapse collapse-arrow">
                            <input type="checkbox" />
                            <div className="collapse-title">Sources ({msg.citations.length})</div>
                            <div className="collapse-content">
                                <ul className="space-y-3">
                                    {msg.citations.map((c, i) => (
                                        <li key={c.chunkId} className="space-y-1">
                                            <div className="flex items-center gap-2">
                                                <span className="badge badge-info">[{i + 1}] {c.filename || c.documentId.slice(0, 6)}</span>
                                                {c.sourceUrl && (
                                                    <a href={c.sourceUrl} target="_blank" rel="noreferrer" className="link link-primary">
                                                        Open
                                                    </a>
                                                )}
                                            </div>
                                            <div className="opacity-80 text-sm">{c.text}</div>
                                            {i < msg.citations!.length - 1 && <div className="divider" />}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
