/**
 * MainLayout.jsx (Phase 3) — passes isSecure to ChatPanel for padlock display
 */

import UserList  from './UserList.jsx';
import ChatPanel from './ChatPanel.jsx';

export default function MainLayout({
  users, messages, myIp, mySessionId,
  isSecure, voice,
  onSendMessage, onDisconnect,
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
        isSecure={isSecure}
        onSendMessage={onSendMessage}
      />
    </div>
  );
}