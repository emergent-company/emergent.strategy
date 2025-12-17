import { useState } from 'react';

import { TwoPanelLayout } from '@/components/layouts';
import { ChatList } from './components/ChatList';
import { ChatMessageList } from './components/ChatMessageList';
import { chatsData } from './data';

export const ChatApp = () => {
  const [selectedChat, setSelectedChat] = useState(chatsData[0]);

  const onSubmit = (message: string) => {
    if (selectedChat) {
      selectedChat.messages.push({
        message,
        sendAt: '05:59 PM',
        sender: 'me',
      });
      setSelectedChat({ ...selectedChat });
    }
  };

  return (
    <TwoPanelLayout fixedPanel="left" fixedWidth={320} stackOnMobile>
      <TwoPanelLayout.Left>
        <ChatList
          chats={chatsData}
          selected={selectedChat}
          selectChat={setSelectedChat}
        />
      </TwoPanelLayout.Left>
      <TwoPanelLayout.Right>
        <ChatMessageList onSendMessage={onSubmit} chat={selectedChat} />
      </TwoPanelLayout.Right>
    </TwoPanelLayout>
  );
};
