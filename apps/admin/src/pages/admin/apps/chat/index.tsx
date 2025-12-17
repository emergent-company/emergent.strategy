import { MetaData } from '@/components';
import { PageContainer } from '@/components/layouts';

import { ChatApp } from './ChatApp';

const ChatPage = () => {
  return (
    <PageContainer maxWidth="7xl" testId="page-chat">
      <MetaData title="Chat App" noIndex />

      {/* Header */}
      <div className="mb-6">
        <h1 className="font-bold text-2xl">Chat</h1>
        <p className="mt-1 text-base-content/70">
          Ask questions and get answers from your knowledge base
        </p>
      </div>

      <ChatApp />
    </PageContainer>
  );
};

export default ChatPage;
