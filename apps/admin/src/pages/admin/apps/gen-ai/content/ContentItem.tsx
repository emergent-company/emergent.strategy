type IResponseItem = {
    content?: string;
    image?: string;
    timeSince: string;
    isResponse?: boolean;
};

export const ContentItem = ({ content, image, timeSince, isResponse = false }: IResponseItem) => {
    return isResponse ? (
        <div className="chat chat-start group">
            <div className="chat-image bg-primary/5 text-primary border-primary/10 flex items-center justify-center rounded-full border p-2">
                <span className="iconify lucide--bot size-6"></span>
            </div>
            <div className="chat-bubble bg-base-200 relative">
                {content}
                {image && <img src={image} className="rounded-box mt-1" alt="Gen Image" />}
                <div className="border-base-300 bg-base-100 absolute end-2 -bottom-8 z-10 flex scale-90 items-center gap-1.5 rounded-full border px-3 py-2 opacity-0 transition-all group-hover:scale-100 group-hover:opacity-100">
                    <button className="btn btn-xs">Regenerate</button>
                    <button className="btn btn-xs">Copy</button>
                    <button className="btn btn-xs btn-ghost btn-error btn-circle">
                        <span className="iconify lucide--thumbs-down size-3.5"></span>
                    </button>
                    <button className="btn btn-xs btn-ghost btn-success btn-circle">
                        <span className="iconify lucide--thumbs-up size-3.5"></span>
                    </button>
                </div>
            </div>
            <div className="chat-footer opacity-50">{timeSince}</div>
        </div>
    ) : (
        <div className="chat chat-end">
            <div className="chat-bubble bg-base-200">{content}</div>
            <div className="chat-footer opacity-50">{timeSince}</div>
        </div>
    );
};
