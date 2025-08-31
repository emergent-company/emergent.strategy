import { Icon } from "@/components/ui/Icon";
type IResponseItem = {
    content?: string;
    image?: string;
    timeSince: string;
    isResponse?: boolean;
};

export const ContentItem = ({ content, image, timeSince, isResponse = false }: IResponseItem) => {
    return isResponse ? (
        <div className="group chat chat-start">
            <div className="flex justify-center items-center bg-primary/5 p-2 border border-primary/10 rounded-full text-primary chat-image">
                <Icon icon="lucide--bot" className="size-6" />
            </div>
            <div className="relative bg-base-200 chat-bubble">
                {content}
                {image && <img src={image} className="mt-1 rounded-box" alt="Gen Image" />}
                <div className="-bottom-8 z-10 absolute flex items-center gap-1.5 bg-base-100 opacity-0 group-hover:opacity-100 px-3 py-2 border border-base-300 rounded-full scale-90 group-hover:scale-100 transition-all end-2">
                    <button className="btn btn-xs">Regenerate</button>
                    <button className="btn btn-xs">Copy</button>
                    <button className="btn btn-xs btn-ghost btn-error btn-circle" aria-label="Thumbs down">
                        <Icon icon="lucide--thumbs-down" className="size-3.5" />
                    </button>
                    <button className="btn btn-xs btn-ghost btn-success btn-circle" aria-label="Thumbs up">
                        <Icon icon="lucide--thumbs-up" className="size-3.5" />
                    </button>
                </div>
            </div>
            <div className="opacity-50 chat-footer">{timeSince}</div>
        </div>
    ) : (
        <div className="chat chat-end">
            <div className="bg-base-200 chat-bubble">{content}</div>
            <div className="opacity-50 chat-footer">{timeSince}</div>
        </div>
    );
};
