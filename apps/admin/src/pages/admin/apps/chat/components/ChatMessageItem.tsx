import { IChatItem } from "./ChatItem";

export type IChatMessageItem = {
    message: string;
    sendAt: string;
    sender: "me" | "other";
};

export const ChatMessageItem = ({ chat, message }: { chat: IChatItem; message: IChatMessageItem }) => {
    return (
        <div>
            <div className={`chat ${message.sender == "me" ? "chat-end" : "chat-start"}`}>
                <div className="chat-image avatar">
                    <div className="w-10">
                        <img
                            src={message.sender == "me" ? "/images/avatars/1.png" : chat.image}
                            className="mask mask-squircle bg-base-200 p-0.5"
                            alt="Tailwind CSS chat bubble component"
                        />
                    </div>
                </div>
                <div className="chat-bubble bg-base-200 text-sm">{message.message}</div>
                <div className="chat-footer text-base-content/60">{message.sendAt}</div>
            </div>
        </div>
    );
};
