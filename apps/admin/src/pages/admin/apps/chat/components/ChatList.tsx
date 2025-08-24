// @ts-ignore
import SimpleBar from "simplebar-react";

import { ChatItem, IChatItem } from "./ChatItem";

type IChatList = {
    chats: IChatItem[];
    selected: IChatItem;
    selectChat(chat: IChatItem): void;
};

export const ChatList = ({ chats, selected, selectChat }: IChatList) => {
    return (
        <div className="card bg-base-100 shadow">
            <div className="card-body">
                <div className="flex items-center justify-between gap-3">
                    <label className="input">
                        <span className="iconify lucide--search text-base-content/80 size-4" />
                        <input
                            type="search"
                            className="grow"
                            placeholder="Search along chats"
                            aria-label="Search chat"
                        />
                    </label>
                    <div className="tooltip" data-tip="New Contact">
                        <button className="btn btn-outline btn-square border-base-300" aria-label="Add New Contact">
                            <span className="iconify lucide--plus size-4" />
                        </button>
                    </div>
                </div>

                <SimpleBar className="h-[calc(100vh_-_306px)]">
                    <div className="mt-4">
                        {chats.map((chat, index) => (
                            <div onClick={() => selectChat(chat)} key={index}>
                                <ChatItem {...chat} selected={selected?.id == chat.id} />
                            </div>
                        ))}
                    </div>
                </SimpleBar>

                <div className="mt-3 text-center">
                    <button className="btn btn-soft btn-primary btn-sm">
                        <span className="iconify lucide--user-plus size-3.5" />
                        Join a Community
                    </button>
                </div>
            </div>
        </div>
    );
};
