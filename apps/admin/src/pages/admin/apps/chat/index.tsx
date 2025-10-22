import { MetaData } from "@/components";

import { ChatApp } from "./ChatApp";

const ChatPage = () => {
    return (
        <div data-testid="page-chat" className="mx-auto p-6 max-w-7xl container">
            <MetaData title="Chat App" noIndex />

            {/* Header */}
            <div className="mb-6">
                <h1 className="font-bold text-2xl">Chat</h1>
                <p className="mt-1 text-base-content/70">
                    Ask questions and get answers from your knowledge base
                </p>
            </div>

            <ChatApp />
        </div>
    );
};

export default ChatPage;
