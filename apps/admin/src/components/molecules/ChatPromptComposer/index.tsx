import { useState, type ChangeEvent } from 'react';
import { Tooltip } from '@/components/atoms/Tooltip';
import { Icon } from '@/components/atoms/Icon';
import { ChatPromptActions } from '@/components/molecules/ChatPromptActions';

export interface ChatPromptComposerProps {
    defaultPrivate?: boolean;
    placeholder?: string;
    onSubmit: (prompt: string, opts?: { isPrivate?: boolean }) => void | Promise<void>;
    className?: string;
}

export const ChatPromptComposer = ({
    defaultPrivate = false,
    placeholder = 'Let us know what you need...',
    onSubmit,
    className,
}: ChatPromptComposerProps) => {
    const [draft, setDraft] = useState<string>('');
    const [isPrivate, setIsPrivate] = useState<boolean>(defaultPrivate);

    const handlePrivacyChange = (e: ChangeEvent<HTMLInputElement>) => setIsPrivate(e.target.checked);
    const handleSend = () => {
        if (!draft.trim()) return;
        void onSubmit(draft, { isPrivate });
    };

    return (
        <div className={`bg-base-100 mt-6 card-border card ${className ?? ''}`.trim()}>
            <div className="p-3 card-body">
                <div className="flex justify-between items-center gap-3">
                    <label className="gap-2 cursor-pointer label">
                        <input
                            type="checkbox"
                            className="checkbox checkbox-sm"
                            checked={isPrivate}
                            onChange={handlePrivacyChange}
                        />
                        <span className="text-sm">Private</span>
                    </label>
                </div>
                <textarea
                    className="m-0 p-1 border-0 focus:outline-none w-full h-24 text-base resize-none textarea"
                    placeholder={placeholder}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                />
                <div className="max-sm:hidden flex items-center font-medium text-xs text-base-content/60">
                    Usage Limit: <span className="ms-1 text-error">Active</span>
                    <Tooltip
                        placement="top"
                        content={
                            <div>
                                <p className="font-semibold">Usage Summary:</p>
                                <p className="mt-2">Today: 47 tokens</p>
                                <p className="mt-0.5">Total: 158 tokens</p>
                            </div>
                        }
                    >
                        <Icon icon="lucide--help-circle" className="block ms-1 size-3" ariaLabel="Usage help" />
                    </Tooltip>
                </div>
                <div className="flex justify-between items-center gap-2">
                    <ChatPromptActions />
                    <button className="btn btn-primary btn-circle btn-sm" aria-label="Send" onClick={handleSend}>
                        <Icon icon="lucide--arrow-right" className="size-4" ariaLabel="Send" />
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ChatPromptComposer;
