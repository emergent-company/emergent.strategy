import { useState } from "react";

import { ChatList } from "./components/ChatList";
import { ChatMessageList } from "./components/ChatMessageList";
import { chatsData } from "./data";

export const ChatApp = () => {
    const [selectedChat, setSelectedChat] = useState(chatsData[0]);

    const onSubmit = (message: string) => {
        if (selectedChat) {
            selectedChat.messages.push({
                message,
                sendAt: "05:59 PM",
                sender: "me",
            });
            setSelectedChat({ ...selectedChat });
        }
    };

    return (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            <div className="lg:col-span-5 xl:col-span-4 2xl:col-span-3">
                <ChatList chats={chatsData} selected={selectedChat} selectChat={setSelectedChat} />
            </div>
            <div className="lg:col-span-7 xl:col-span-8 2xl:col-span-9">
                <ChatMessageList onSendMessage={onSubmit} chat={selectedChat} />
            </div>
        </div>
    );
};
