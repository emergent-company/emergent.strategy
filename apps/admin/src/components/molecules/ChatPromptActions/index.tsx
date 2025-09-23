import React from 'react';
import { IconButton } from '@/components/molecules/IconButton';
import { Icon } from '@/components/atoms/Icon';

export interface ChatPromptActionsProps {
    onMic?: () => void;
    onImage?: () => void;
    onAttach?: () => void;
    onSearch?: () => void;
    onBrainstorm?: () => void;
    disableMedia?: boolean;
}

export const ChatPromptActions: React.FC<ChatPromptActionsProps> = ({
    onMic,
    onImage,
    onAttach,
    onSearch,
    onBrainstorm,
    disableMedia = false,
}) => {
    return (
        <div className="flex justify-between items-end mt-2">
            <div className="inline-flex items-center gap-0.5">
                <IconButton aria-label="Mic" disabled={disableMedia} onClick={onMic}>
                    <Icon icon="lucide--mic" className="size-4.5 text-base-content/80" />
                </IconButton>
                <IconButton aria-label="Image" disabled={disableMedia} onClick={onImage}>
                    <Icon icon="lucide--image-plus" className="size-4.5 text-base-content/80" />
                </IconButton>
                <IconButton aria-label="Attach" disabled={disableMedia} onClick={onAttach}>
                    <Icon icon="lucide--paperclip" className="size-4.5 text-base-content/80" />
                </IconButton>
            </div>
            <div className="max-sm:hidden flex items-center font-medium text-xs text-base-content/60" />
            <div className="flex items-center gap-2">
                <button className="border-base-300 rounded-full btn-outline btn btn-sm max-sm:btn-circle" onClick={onSearch}>
                    <Icon icon="lucide--globe" className="size-4 text-base-content/80" />
                    <p className="max-sm:hidden">Search</p>
                </button>
                <button
                    className="border-base-300 rounded-full btn-outline btn btn-sm max-sm:btn-circle"
                    onClick={onBrainstorm}
                >
                    <Icon icon="lucide--brain-cog" className="size-4 text-base-content/80" />
                    <p className="max-sm:hidden">Brainstorm</p>
                </button>
            </div>
        </div>
    );
};

export default ChatPromptActions;
