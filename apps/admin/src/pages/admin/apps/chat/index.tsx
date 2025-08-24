import { MetaData } from "@/components/MetaData";
import { PageTitle } from "@/components/PageTitle";

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
