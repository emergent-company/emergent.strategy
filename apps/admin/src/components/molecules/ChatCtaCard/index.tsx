import type { MouseEventHandler } from 'react';
import { Icon } from '@/components/atoms/Icon';

export interface ChatCtaCardProps {
    icon: string;
    title: string;
    desc: string;
    onPick: MouseEventHandler<HTMLButtonElement>;
}

export const ChatCtaCard = ({ icon, title, desc, onPick }: ChatCtaCardProps) => {
    return (
        <button
            className="group bg-base-100 card-border text-left transition-all cursor-pointer card"
            onClick={onPick}
            aria-label={title}
        >
            <div className="card-body">
                <div className="bg-primary p-2 rounded-box w-fit text-primary-content">
                    <Icon icon={icon} className="block size-4" ariaLabel={`${title} icon`} />
                </div>
                <p className="mt-3 font-medium">{title}</p>
                <p className="mt-1 text-sm text-base-content/80 text-ellipsis line-clamp-2">{desc}</p>
                <div className="flex items-center gap-1.5 mt-3 text-base-content/60 group-hover:text-base-content transition-all">
                    <span className="text-sm">Use this</span>
                    <Icon icon="lucide--chevron-right" className="size-3.5" ariaLabel="Chevron right" />
                </div>
            </div>
        </button>
    );
};

export default ChatCtaCard;
