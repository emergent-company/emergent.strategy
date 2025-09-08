import { useState } from "react";
import { useNavigate } from "react-router";
import { useChat } from "@/hooks/use-chat";
import { useAuth } from "@/contexts/auth";
import type { Conversation } from "@/types/chat";
import { PageTitle } from "@/components/PageTitle";
import NewChatCtas from "@/components/NewChatCtas";

const suggestions = [
    "Summarize the latest ingested document",
    "What decisions were made in the last meeting?",
    "List action items with owners",
];

export default function ChatHomePage() {
    const nav = useNavigate();
    const { conversations, sharedConversations, privateConversations, activeConversation, setActive, deleteConversation } = useChat();
    const { user } = useAuth();
    const [prompt, setPrompt] = useState("");
    const disabled = !prompt.trim();

    const go = (text: string) => {
        const p = text.trim();
        if (!p) return;
        nav(`/admin/apps/chat/c/new?q=${encodeURIComponent(p)}`);
    };

    const conv = activeConversation;

    return (
        <div className="drawer drawer-open">
            <input id="chat-drawer" type="checkbox" className="drawer-toggle" />
            <div className="drawer-content">
                <div className="mx-auto p-4 container">
                    <PageTitle title="AI Chat" items={[{ label: "Admin" }, { label: "Chat", active: true }]} />

                    <div className="mt-6 text-center">
                        <h1 className="bg-clip-text bg-gradient-to-r from-primary to-secondary font-bold text-transparent text-3xl sm:text-4xl">
                            Ask your knowledge base
                        </h1>
                        <p className="opacity-70 mt-2">Grounded answers with citations from your documents</p>
                    </div>

                    <NewChatCtas
                        onPickPrompt={(p) => go(p)}
                        onSubmit={(p, opts) => {
                            const q = p;
                            const isPrivate = opts?.isPrivate ? "&private=1" : "";
                            const text = q.trim();
                            if (!text) return;
                            nav(`/admin/apps/chat/c/new?q=${encodeURIComponent(text)}${isPrivate}`);
                        }}
                    />
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
                        {sharedConversations.map((c) => (
                            <li key={c.id} className={`w-full overflow-hidden ${c.id === conv?.id ? "menu-active" : ""}`}>
                                <div className="flex items-center gap-2 w-full min-w-0 max-w-full overflow-hidden">
                                    <button
                                        className={`block flex-1 w-full min-w-0 max-w-full text-left rounded-lg px-2 py-1 transition-colors ${c.id === conv?.id ? 'bg-primary/20 ring-1 ring-primary/40' : 'hover:bg-base-300/60'}`}
                                        onClick={() => {
                                            setActive(c.id);
                                            nav(`/admin/apps/chat/c/${c.id}`);
                                        }}
                                        aria-label={`Open conversation ${c.title}`}
                                        aria-current={c.id === conv?.id ? 'true' : undefined}
                                    >
                                        <ConversationListItem conv={c} />
                                    </button>
                                    {(((c.ownerUserId && user?.sub === c.ownerUserId)) || (!c.ownerUserId && (c.isPrivate || /^c_/.test(c.id) || (c.messages?.length || 0) === 0))) && (
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
                                    )}
                                </div>
                            </li>
                        ))}
                        {privateConversations.length > 0 && (
                            <li className="mt-2 menu-title">
                                <span>Private</span>
                            </li>
                        )}
                        {privateConversations.map((c) => (
                            <li key={c.id} className={`w-full overflow-hidden ${c.id === conv?.id ? "menu-active" : ""}`}>
                                <div className="flex items-center gap-2 w-full min-w-0 max-w-full overflow-hidden">
                                    <button
                                        className={`block flex-1 w-full min-w-0 max-w-full text-left rounded-lg px-2 py-1 transition-colors ${c.id === conv?.id ? 'bg-primary/20 ring-1 ring-primary/40' : 'hover:bg-base-300/60'}`}
                                        onClick={() => {
                                            setActive(c.id);
                                            nav(`/admin/apps/chat/c/${c.id}`);
                                        }}
                                        aria-label={`Open conversation ${c.title}`}
                                        aria-current={c.id === conv?.id ? 'true' : undefined}
                                    >
                                        <ConversationListItem conv={c} />
                                    </button>
                                    {(((c.ownerUserId && user?.sub === c.ownerUserId)) || (!c.ownerUserId && (c.isPrivate || /^c_/.test(c.id) || (c.messages?.length || 0) === 0))) && (
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
                                    )}
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
