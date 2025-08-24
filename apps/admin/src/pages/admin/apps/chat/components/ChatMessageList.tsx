import { useEffect, useRef } from "react";
import SimpleBarCore from "simplebar-core";
// @ts-ignore
import SimpleBar from "simplebar-react";

import { ChatCallModal } from "./ChatCallModal";
import { ChatInput, IChatInput } from "./ChatInput";
import { IChatItem } from "./ChatItem";
import { ChatMessageItem } from "./ChatMessageItem";

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
        <div className="card bg-base-100 shadow">
            <div className="flex items-center gap-3 px-4 py-3">
                <img src={chat.image} className="size-10 max-sm:size-8" alt="avatar" />
                <div className="mt-1.5 grow">
                    <p className="leading-none font-medium max-sm:text-sm">{chat.name}</p>
                    <div className="mt-0.5 flex items-center gap-2">
                        <div className="status status-success"></div>
                        <p className="text-base-content/80 text-xs">Active</p>
                    </div>
                </div>
                <div className="tooltip" data-tip="Audio Call">
                    <button
                        className="btn btn-outline border-base-300 btn-square btn-sm"
                        aria-label="Audio Call"
                        onClick={() => document.querySelector<HTMLDialogElement>("#apps-chat-call-modal")?.showModal()}>
                        <span className="iconify lucide--phone size-4" />
                    </button>
                </div>
                <div className="tooltip max-sm:hidden" data-tip="Video Call">
                    <button className="btn btn-outline border-base-300 btn-square btn-sm" aria-label="Video Call">
                        <span className="iconify lucide--video size-4" />
                    </button>
                </div>
                <div className="tooltip max-sm:hidden" data-tip="Add to Friend">
                    <button className="btn btn-outline border-base-300 btn-square btn-sm" aria-label="Add to Friend">
                        <span className="iconify lucide--user-plus size-4" />
                    </button>
                </div>
                <div className="dropdown dropdown-bottom dropdown-end">
                    <div
                        tabIndex={0}
                        role="button"
                        className="btn btn-outline btn-square btn-sm border-base-300"
                        aria-label="More options">
                        <span className="iconify lucide--more-vertical size-4" />
                    </div>
                    <div tabIndex={0} className="dropdown-content bg-base-100 rounded-box mt-2 w-52 shadow">
                        <ul className="menu w-full p-2">
                            <li>
                                <div>
                                    <span className="iconify lucide--square-user size-4" />
                                    View Profile
                                </div>
                            </li>

                            <li>
                                <div>
                                    <span className="iconify lucide--pin size-4" />
                                    Pin
                                </div>
                            </li>
                            <li>
                                <div>
                                    <span className="iconify lucide--bell-dot size-4" />
                                    Mute Notification
                                </div>
                            </li>
                        </ul>
                        <hr className="border-base-300" />
                        <ul className="menu w-full p-2">
                            <li>
                                <div>
                                    <span className="iconify lucide--archive size-4" />
                                    Archive
                                </div>
                            </li>
                            <li className="">
                                <div className="text-error hover:bg-error/10">
                                    <span className="iconify lucide--trash size-4" />
                                    Delete Chat
                                </div>
                            </li>
                        </ul>
                    </div>
                </div>
            </div>
            <hr className="border-base-300" />
            <SimpleBar className="h-[calc(100vh_-_320px)] p-5" ref={messagesScrollbarRef}>
                {chat.messages.map((message, index) => (
                    <ChatMessageItem chat={chat} message={message} key={index} />
                ))}
            </SimpleBar>
            <ChatInput onSendMessage={onSendMessage} />
            <ChatCallModal chat={chat} />
        </div>
    );
};
