import { useState } from "react";

export interface NewChatCard {
    icon: string; // iconify class e.g., 'lucide--sparkles'
    title: string;
    desc: string;
    prompt: string;
}

export interface NewChatCtasProps {
    onPickPrompt: (p: string) => void | Promise<void>;
    onSubmit: (p: string, opts?: { isPrivate?: boolean }) => void | Promise<void>;
    cards?: NewChatCard[];
}

const defaultCards: NewChatCard[] = [
    {
        icon: "lucide--sparkles",
        title: "Summarize Document",
        desc: "Get a concise summary of your document.",
        prompt: "Summarize the key points of the latest ingested document.",
    },
    {
        icon: "lucide--list-checks",
        title: "Action Items",
        desc: "Extract action items from a meeting.",
        prompt: "List the action items from the meeting transcript with owners and due dates.",
    },
    {
        icon: "lucide--help-circle",
        title: "Ask a Question",
        desc: "Query your knowledge base.",
        prompt: "What are the critical requirements mentioned in the requirements document?",
    },
];

export function NewChatCtas({ onPickPrompt, onSubmit, cards = defaultCards }: NewChatCtasProps) {
    const [draft, setDraft] = useState("");
    const [isPrivate, setIsPrivate] = useState(false);

    return (
        <div className="w-full">
            <div className="gap-6 grid md:grid-cols-3 mt-6">
                {cards.map((card) => (
                    <button
                        key={card.title}
                        className="group bg-base-100 card-border text-left transition-all cursor-pointer card"
                        onClick={() => onPickPrompt(card.prompt)}
                    >
                        <div className="card-body">
                            <div className="bg-primary p-2 rounded-box w-fit text-primary-content">
                                <span className={`iconify ${card.icon} block size-4`}></span>
                            </div>
                            <p className="mt-3 font-medium">{card.title}</p>
                            <p className="mt-1 text-sm text-base-content/80 text-ellipsis line-clamp-2">{card.desc}</p>
                            <div className="flex items-center gap-1.5 mt-3 text-base-content/60 group-hover:text-base-content transition-all">
                                <span className="text-sm">Use this</span>
                                <span className="lucide--chevron-right size-3.5 iconify"></span>
                            </div>
                        </div>
                    </button>
                ))}
            </div>

            <div className="bg-base-100 mt-6 card-border card">
                <div className="p-3 card-body">
                    <div className="flex justify-between items-center gap-3">
                        <label className="gap-2 cursor-pointer label">
                            <input
                                type="checkbox"
                                className="checkbox checkbox-sm"
                                checked={isPrivate}
                                onChange={(e) => setIsPrivate(e.target.checked)}
                            />
                            <span className="text-sm">Private</span>
                        </label>
                    </div>
                    <textarea
                        className="m-0 p-1 border-0 focus:outline-none w-full h-24 text-base resize-none textarea"
                        placeholder="Let us know what you need..."
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                    />
                    <div className="flex justify-between items-end mt-2">
                        <div className="inline-flex items-center gap-0.5">
                            <button className="btn btn-sm btn-circle btn-ghost" aria-label="Mic">
                                <span className="size-4.5 text-base-content/80 iconify lucide--mic"></span>
                            </button>
                            <button className="btn btn-sm btn-circle btn-ghost" aria-label="Image">
                                <span className="size-4.5 text-base-content/80 iconify lucide--image-plus"></span>
                            </button>
                            <button className="btn btn-sm btn-circle btn-ghost" aria-label="Attach">
                                <span className="size-4.5 text-base-content/80 iconify lucide--paperclip"></span>
                            </button>
                        </div>
                        <div className="max-sm:hidden flex items-center font-medium text-xs text-base-content/60">
                            Usage Limit: <span className="ms-1 text-error">Active</span>
                            <div className="tooltip">
                                <div className="bg-base-100 shadow p-3 font-normal text-base-content text-start tooltip-content">
                                    <p className="font-semibold">Usage Summary:</p>
                                    <p className="mt-2">Today: 47 tokens</p>
                                    <p className="mt-0.5">Total: 158 tokens</p>
                                </div>
                                <span className="block ms-1 size-3 iconify lucide--help-circle"></span>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <button className="border-base-300 rounded-full btn-outline btn btn-sm max-sm:btn-circle">
                                <span className="size-4 text-base-content/80 iconify lucide--globe"></span>
                                <p className="max-sm:hidden">Search</p>
                            </button>
                            <button className="border-base-300 rounded-full btn-outline btn btn-sm max-sm:btn-circle">
                                <span className="size-4 text-base-content/80 iconify lucide--brain-cog"></span>
                                <p className="max-sm:hidden">Brainstorm</p>
                            </button>
                            <button
                                className="btn btn-primary btn-circle btn-sm"
                                aria-label="Send"
                                onClick={() => onSubmit(draft, { isPrivate })}
                            >
                                <span className="lucide--arrow-right size-4 iconify"></span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default NewChatCtas;
