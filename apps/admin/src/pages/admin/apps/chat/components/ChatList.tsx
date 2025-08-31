// @ts-ignore
import SimpleBar from "simplebar-react";

import { ChatItem, IChatItem } from "./ChatItem";
import { Icon } from "@/components/ui/Icon";

type IChatList = {
    chats: IChatItem[];
    selected: IChatItem;
    selectChat(chat: IChatItem): void;
};

export const ChatList = ({ chats, selected, selectChat }: IChatList) => {
    return (
        <div className="bg-base-100 shadow card">
            <div className="card-body">
                <div className="flex justify-between items-center gap-3">
                    <label className="input">
                        <Icon icon="lucide--search" className="size-4 text-base-content/80" />
                        <input
                            type="search"
                            className="grow"
                            placeholder="Search along chats"
                            aria-label="Search chat"
                        />
                    </label>
                    <div className="tooltip" data-tip="New Contact">
                        <button className="border-base-300 btn-outline btn btn-square" aria-label="Add New Contact">
                            <Icon icon="lucide--plus" className="size-4" />
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
                        <Icon icon="lucide--user-plus" className="size-3.5" />
                        Join a Community
                    </button>
                </div>
            </div>
        </div>
    );
};
