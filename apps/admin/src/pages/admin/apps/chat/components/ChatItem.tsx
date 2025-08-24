import { IChatMessageItem } from "./ChatMessageItem";

export type IChatItem = {
    id: number;
    image: string;
    name: string;
    messages: IChatMessageItem[];
    unreadCount?: number;
};

export const ChatItem = ({ image, name, messages, unreadCount, selected }: IChatItem & { selected: boolean }) => {
    const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;

    return (
        <div
            className={`rounded-box hover:bg-base-200 my-0.5 flex cursor-pointer items-center gap-3 p-2 px-3 transition-all ${selected && "bg-base-200"}`}>
            <img src={image} className="bg-base-200 mask mask-squircle size-11 p-0.5" alt="avatar" />
            <div className="grow">
                <div className="flex justify-between">
                    <p className="text-sm font-medium">{name}</p>
                    <span className="text-base-content/60 text-xs">{lastMessage?.sendAt ?? "-"}</span>
                </div>
                <div className="flex justify-between gap-3">
                    <p className="text-base-content/80 line-clamp-1 text-sm">
                        {lastMessage?.message ?? "Tap to message"}
                    </p>
                    {unreadCount && unreadCount != 0 && (
                        <div className="badge badge-xs badge-success px-1 py-1.5 text-xs">{unreadCount}</div>
                    )}
                </div>
            </div>
        </div>
    );
};
