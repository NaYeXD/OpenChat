/**
 * MainLayout.jsx — Two-panel layout (Phase 2)
 * Passes voice state and mySessionId down to children.
 */

import UserList from './UserList.jsx';
import ChatPanel from './ChatPanel.jsx';

export default function MainLayout({
  users,
  messages,
  myIp,
  mySessionId,
  voice,
  onSendMessage,
  onDisconnect,
}) {
  return (
    <div className="main-layout">
      <UserList
        users={users}
        myIp={myIp}
        mySessionId={mySessionId}
        voice={voice}
        onDisconnect={onDisconnect}
      />
      <ChatPanel
        messages={messages}
        myIp={myIp}
        onSendMessage={onSendMessage}
      />
    </div>
  );
}