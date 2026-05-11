/**
 * MainLayout.jsx — Two-panel layout (Phase 4)
 *
 * Adds admin panel overlay (slides in when showAdminPanel=true).
 * Admin Panel button visible only to admins.
 */

import UserList   from './UserList.jsx';
import ChatPanel  from './ChatPanel.jsx';
import AdminPanel from './AdminPanel.jsx';

export default function MainLayout({
  users, messages, myUsername, mySessionId, myRole,
  isAdmin, isSecure, voice,
  showAdminPanel, auditLog, adminFeedback,
  onSendMessage, onDisconnect,
  onToggleAdminPanel, onAdminKick, onAdminBan, onAdminUnban, onRefreshAuditLog,
}) {
  return (
    <div className="main-layout">
      <UserList
        users={users}
        myUsername={myUsername}
        mySessionId={mySessionId}
        myRole={myRole}
        isAdmin={isAdmin}
        voice={voice}
        onDisconnect={onDisconnect}
        onAdminKick={onAdminKick}
        onAdminBan={onAdminBan}
      />

      <div className="chat-area">
        <ChatPanel
          messages={messages}
          myUsername={myUsername}
          isSecure={isSecure}
          isAdmin={isAdmin}
          onSendMessage={onSendMessage}
          onToggleAdminPanel={onToggleAdminPanel}
          adminFeedback={adminFeedback}
        />

        {/* Admin panel slides in over the chat */}
        {showAdminPanel && isAdmin && (
          <AdminPanel
            auditLog={auditLog}
            onRefresh={onRefreshAuditLog}
            onClose={onToggleAdminPanel}
            onUnban={onAdminUnban}
            adminFeedback={adminFeedback}
          />
        )}
      </div>
    </div>
  );
}