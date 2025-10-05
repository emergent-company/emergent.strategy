import React from 'react';

export interface ChatMessageWithMentionsWireframeProps {
    state?: 'streaming' | 'resolved';
    mentions?: number;
}

export const ChatMessageWithMentionsWireframe: React.FC<ChatMessageWithMentionsWireframeProps> = ({ state = 'resolved', mentions = 3 }) => {
    const pills = Array.from({ length: mentions }).map((_, i) => (
        <span
            key={i}
            className={
                'inline-flex items-center gap-1 rounded-full border border-dashed border-base-300 px-2 py-1 text-xs ' +
                (state === 'streaming' ? 'animate-pulse opacity-60' : '')
            }
        >
            <span className="bg-base-300 rounded w-3 h-3" />
            <span className="bg-base-300 rounded w-16 h-3" />
        </span>
    ));

    return (
        <div className="space-y-3 bg-base-100 p-4 border border-base-300 rounded max-w-2xl">
            <div className="space-y-2 text-sm leading-relaxed">
                <div className="bg-base-300 rounded w-full h-3" />
                <div className="bg-base-300 rounded w-5/6 h-3" />
                <div className="bg-base-300 rounded w-2/3 h-3" />
            </div>
            <div className="flex flex-wrap gap-2">{pills}</div>
            {state === 'streaming' && (
                <div className="text-xs text-base-content/50">Enriching references…</div>
            )}
        </div>
    );
};

export default ChatMessageWithMentionsWireframe;
