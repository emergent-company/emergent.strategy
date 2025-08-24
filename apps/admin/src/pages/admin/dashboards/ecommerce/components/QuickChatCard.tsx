import { Link } from "react-router";

import { IQuickChatItem, QuickChatItem } from "./QuickChatItem";

const quickChats: IQuickChatItem[] = [
    {
        image: "/images/avatars/1.png",
        name: "Mia Johnson",
        time: "11:35 AM",
        message: "It's called 'Dreamscape.' A must-watch!",
    },
    {
        image: "/images/avatars/2.png",
        name: "Ethan Patel",
        time: "09:58 AM",
        message: "Just got a new book. Excited to start reading.",
    },
    {
        image: "/images/avatars/3.png",
        name: "Sophia Nguyen",
        time: "08:20 AM",
        message: "How's your day going?",
    },
    {
        image: "/images/avatars/4.png",
        name: "Emily Chen",
        time: "06:21 PM",
        message: "Did you see that amazing sunset yesterday?",
    },
    {
        image: "/images/avatars/5.png",
        name: "Kelvin S.",
        time: "08:15 AM",
        message: "Not sure, what you talking about...",
    },
];

export const QuickChatCard = () => {
    return (
        <div className="card bg-base-100 shadow">
            <div className="card-body pb-3">
                <div className="flex items-center gap-3">
                    <span className="iconify lucide--messages-square size-4.5" />
                    <span className="font-medium">Quick Chat</span>
                    <Link to="/apps/chat" className="btn btn-outline btn-sm border-base-300 ms-auto">
                        Go To Chat
                    </Link>
                </div>
                <div className="-mx-2 mt-2 space-y-0.5">
                    {quickChats.map((quickChat, index) => (
                        <QuickChatItem {...quickChat} key={index} />
                    ))}
                </div>
            </div>
        </div>
    );
};
