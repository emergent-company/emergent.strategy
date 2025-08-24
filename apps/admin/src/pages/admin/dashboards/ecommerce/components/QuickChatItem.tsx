export type IQuickChatItem = {
    image: string;
    name: string;
    time: string;
    message: string;
};

export const QuickChatItem = ({ message, time, name, image }: IQuickChatItem) => {
    return (
        <div className="rounded-box hover:bg-base-200 flex cursor-pointer items-center gap-3 px-2 py-2 transition-all active:scale-[.98]">
            <img src={image} alt="chat" className="bg-base-200 mask mask-squircle size-11" />

            <div className="grow">
                <div className="flex gap-1">
                    <p className="grow">{name}</p>
                    <span className="text-base-content/60 text-xs">{time}</span>
                </div>
                <p className="text-base-content/80 line-clamp-1 text-sm text-ellipsis">{message}</p>
            </div>
        </div>
    );
};
