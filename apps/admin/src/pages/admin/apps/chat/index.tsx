import { MetaData } from "@/components";
import { PageTitle } from "@/components";

import { ChatApp } from "./ChatApp";

const ChatPage = () => {
    return (
        <>
            <MetaData title="Chat App" noIndex />

            <PageTitle title="Chat" items={[{ label: "Apps" }, { label: "Chat", active: true }]} />

            <div className="mt-6">
                <ChatApp />
            </div>
        </>
    );
};

export default ChatPage;
