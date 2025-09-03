import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { PageTitle } from "@/components/PageTitle";
import NewChatCtas from "@/components/NewChatCtas";
import { useChat } from "@/hooks/use-chat";
import type { Conversation, Message } from "@/types/chat";

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

function Citations({ msg }: { msg: Message }) {
    const cites = msg.citations || [];
    if (!cites.length) return null;
    return (
        <div className="mt-2">
            <div className="collapse collapse-arrow bg-base-200">
                <input type="checkbox" />
                <div className="collapse-title font-medium text-sm">Sources ({cites.length})</div>
                <div className="collapse-content">
                    <ul className="space-y-2">
                        {cites.map((c, i) => (
                            <li key={`${c.chunkId}-${i}`} className="text-sm">
                                <span className="mr-2 badge badge-info">{c.filename || c.documentId}</span>
                                {c.sourceUrl ? (
                                    <a className="link link-primary" href={c.sourceUrl} target="_blank" rel="noreferrer">
                                        Open source
                                    </a>
                                ) : null}
                                <div className="opacity-70 mt-1">{c.text}</div>
                                {i < cites.length - 1 ? <div className="divider" /> : null}
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
        </div>
    );
}

export default function ChatConversationPage() {
    const nav = useNavigate();
    const { id } = useParams<{ id?: string }>();
    const [sp] = useSearchParams();
    const q = sp.get("q") || "";
    const isPrivate = sp.get("private") === "1";
    const autoSentRef = useRef(false);

    const {
        conversations,
        sharedConversations,
        privateConversations,
        activeConversation,
        setActive,
        createConversation,
        deleteConversation,
        send,
        streaming,
    } = useChat();

    // Ensure an active conversation is selected/created based on the route param
    useEffect(() => {
        if (!id || id === "new") {
            // If we already have an active conversation, do nothing
            if (activeConversation) return;
            // If query param q is present, let the auto-send flow create/use the phantom conversation to avoid races
            if ((q || "").trim().length > 0) return;
            // Prefer reusing an existing temp conversation if present
            if (conversations.length > 0) {
                setActive(conversations[0].id);
                return;
            }
            createConversation();
        } else {
            // switch to the requested conversation if exists; otherwise set active so hydration can run
            setActive(id);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id, q, conversations.length, activeConversation?.id]);

    // Auto-send initial prompt when provided via query param `q`
    useEffect(() => {
        const text = (q || "").trim();
        if (!text || autoSentRef.current) return;
        const convId = activeConversation?.id;
        // For brand-new conversations, respect privacy flag before first send
        void send({ message: text, conversationId: convId, isPrivate });
        autoSentRef.current = true;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [q, activeConversation?.id]);

    const conv = activeConversation;
    const allShared = sharedConversations;
    const allPrivate = privateConversations;

    return (
        <div className="drawer drawer-open">
            <input id="chat-drawer" type="checkbox" className="drawer-toggle" />
            <div className="drawer-content">
                <div className="mx-auto p-4 container">
                    <PageTitle title="AI Chat" items={[{ label: "Admin" }, { label: "Chat", active: true }]} />

                    {/* Empty state: reuse CTA grid and composer when no messages */}
                    {(!conv || (conv.messages?.length || 0) === 0) ? (
                        <div className="mt-6">
                            <div className="text-center">
                                <h1 className="bg-clip-text bg-gradient-to-r from-primary to-secondary font-bold text-transparent text-3xl sm:text-4xl">
                                    Ask your knowledge base
                                </h1>
                                <p className="opacity-70 mt-2">Grounded answers with citations from your documents</p>
                            </div>
                            <NewChatCtas
                                onPickPrompt={(p) => {
                                    const text = p.trim();
                                    if (!text) return;
                                    void send({ message: text, conversationId: conv?.id });
                                }}
                                onSubmit={(p, opts) => {
                                    const text = p.trim();
                                    if (!text) return;
                                    void send({ message: text, conversationId: conv?.id, isPrivate: opts?.isPrivate });
                                }}
                            />
                        </div>
                    ) : (
                        <div className="space-y-4 mt-6">
                            <div className="space-y-4">
                                {(conv.messages || []).map((m) => (
                                    <div key={m.id} className={`chat ${m.role === "user" ? "chat-end" : "chat-start"}`}>
                                        <div className={`chat-bubble ${m.role === "assistant" ? "chat-bubble-primary" : ""}`}>
                                            {m.content || (m.role === "assistant" && streaming ? (
                                                <span className="loading loading-dots loading-sm" />
                                            ) : null)}
                                        </div>
                                        {m.role === "assistant" ? <Citations msg={m} /> : null}
                                    </div>
                                ))}
                            </div>

                            {/* Composer */}
                            <div className="bottom-0 sticky bg-base-100 card-border card">
                                <div className="card-body">
                                    <form
                                        className="flex items-center gap-2"
                                        onSubmit={(e) => {
                                            e.preventDefault();
                                            const fd = new FormData(e.currentTarget as HTMLFormElement);
                                            const text = String(fd.get("q") || "").trim();
                                            if (!text) return;
                                            void send({ message: text, conversationId: conv?.id });
                                            (e.currentTarget as HTMLFormElement).reset();
                                        }}
                                    >
                                        <textarea name="q" className="w-full textarea textarea-md" placeholder="Ask a question" />
                                        <button type="submit" className="btn btn-primary" aria-label="Send">
                                            <span className="iconify lucide--send" />
                                        </button>
                                    </form>
                                </div>
                            </div>
                        </div>
                    )}
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
                                    // navigate to a brand-new conversation
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
                        <li className="menu-title">
                            <span>Shared</span>
                        </li>
                        {allShared.map((c) => (
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
                                            }
                                        }}
                                    >
                                        <span className="iconify lucide--trash" />
                                    </button>
                                </div>
                            </li>
                        ))}
                        {allPrivate.length > 0 && (
                            <li className="mt-2 menu-title">
                                <span>Private</span>
                            </li>
                        )}
                        {allPrivate.map((c) => (
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
