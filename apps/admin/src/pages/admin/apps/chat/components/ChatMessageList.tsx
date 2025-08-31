import { useEffect, useRef } from "react";
import SimpleBarCore from "simplebar-core";
// @ts-ignore
import SimpleBar from "simplebar-react";

import { ChatCallModal } from "./ChatCallModal";
import { ChatInput, IChatInput } from "./ChatInput";
import { IChatItem } from "./ChatItem";
import { ChatMessageItem } from "./ChatMessageItem";
import { Icon } from "@/components/ui/Icon";

type IChatMessageList = {
    chat: IChatItem;
} & IChatInput;

export const ChatMessageList = ({ chat, onSendMessage }: IChatMessageList) => {
    const messagesScrollbarRef = useRef<SimpleBarCore | null>(null);

    useEffect(() => {
        const scrollE = messagesScrollbarRef.current?.getScrollElement();
        if (scrollE) scrollE.scrollTo({ top: scrollE.scrollHeight, behavior: "smooth" });
    }, [chat, messagesScrollbarRef]);

    return (
        <div className="bg-base-100 shadow card">
            <div className="flex items-center gap-3 px-4 py-3">
                <img src={chat.image} className="size-10 max-sm:size-8" alt="avatar" />
                <div className="mt-1.5 grow">
                    <p className="font-medium max-sm:text-sm leading-none">{chat.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                        <div className="status status-success"></div>
                        <p className="text-xs text-base-content/80">Active</p>
                    </div>
                </div>
                <div className="tooltip" data-tip="Audio Call">
                    <button
                        className="border-base-300 btn-outline btn btn-square btn-sm"
                        aria-label="Audio Call"
                        onClick={() => document.querySelector<HTMLDialogElement>("#apps-chat-call-modal")?.showModal()}>
                        <Icon icon="lucide--phone" className="size-4" ariaLabel="Audio call" />
                    </button>
                </div>
                <div className="max-sm:hidden tooltip" data-tip="Video Call">
                    <button className="border-base-300 btn-outline btn btn-square btn-sm" aria-label="Video Call">
                        <Icon icon="lucide--video" className="size-4" ariaLabel="Video call" />
                    </button>
                </div>
                <div className="max-sm:hidden tooltip" data-tip="Add to Friend">
                    <button className="border-base-300 btn-outline btn btn-square btn-sm" aria-label="Add to Friend">
                        <Icon icon="lucide--user-plus" className="size-4" ariaLabel="Add to friend" />
                    </button>
                </div>
                <div className="dropdown-bottom dropdown dropdown-end">
                    <div
                        tabIndex={0}
                        role="button"
                        className="border-base-300 btn-outline btn btn-square btn-sm"
                        aria-label="More options">
                        <Icon icon="lucide--more-vertical" className="size-4" ariaLabel="More options" />
                    </div>
                    <div tabIndex={0} className="bg-base-100 shadow mt-2 rounded-box w-52 dropdown-content">
                        <ul className="p-2 w-full menu">
                            <li>
                                <div>
                                    <Icon icon="lucide--square-user" className="size-4" ariaLabel="View profile" />
                                    View Profile
                                </div>
                            </li>

                            <li>
                                <div>
                                    <Icon icon="lucide--pin" className="size-4" ariaLabel="Pin" />
                                    Pin
                                </div>
                            </li>
                            <li>
                                <div>
                                    <Icon icon="lucide--bell-dot" className="size-4" ariaLabel="Mute notification" />
                                    Mute Notification
                                </div>
                            </li>
                        </ul>
                        <hr className="border-base-300" />
                        <ul className="p-2 w-full menu">
                            <li>
                                <div>
                                    <Icon icon="lucide--archive" className="size-4" ariaLabel="Archive" />
                                    Archive
                                </div>
                            </li>
                            <li className="">
                                <div className="hover:bg-error/10 text-error">
                                    <Icon icon="lucide--trash" className="size-4" ariaLabel="Delete chat" />
                                    Delete Chat
                                </div>
                            </li>
                        </ul>
                    </div>
                </div>
            </div>
            <hr className="border-base-300" />
            <SimpleBar className="p-5 h-[calc(100vh_-_320px)]" ref={messagesScrollbarRef}>
                {chat.messages.map((message, index) => (
                    <ChatMessageItem chat={chat} message={message} key={index} />
                ))}
            </SimpleBar>
            <ChatInput onSendMessage={onSendMessage} />
            <ChatCallModal chat={chat} />
        </div>
    );
};
