/**
 * UserList.jsx — Left sidebar (Phase 4)
 *
 * Shows usernames instead of IPs.
 * Admin users have a ⚙ badge.
 * Right-click opens context menu with volume + (admin) kick/ban.
 */

import { useState, useCallback } from 'react';
import VoiceControls    from './VoiceControls.jsx';
import UserContextMenu  from './UserContextMenu.jsx';

export default function UserList({
  users, myUsername, mySessionId, myRole,
  isAdmin, voice,
  onDisconnect, onAdminKick, onAdminBan,
}) {
  const { userVolumes, setUserVolume } = voice;
  const [ctxMenu, setCtxMenu] = useState(null);
  const voiceUserIds = new Set(voice.voiceUsers.map(u => u.sessionId));

  const handleRightClick = useCallback((e, user) => {
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY, user });
  }, []);

  const closeCtxMenu = useCallback(() => setCtxMenu(null), []);

  return (
    <aside className="user-list">
      <div className="ul-header">
        <span className="ul-header-title">Members</span>
        <span className="ul-count">{users.length}</span>
      </div>

      <div className="ul-section-label">
        <span className="ul-dot online" />
        Online — {users.length}
      </div>

      <div className="ul-users">
        {users.length === 0 && <p className="ul-empty">No users connected</p>}

        {users.map(user => {
          const isMe    = user.sessionId === mySessionId;
          const inVoice = user.inVoice || voiceUserIds.has(user.sessionId) || (isMe && voice.inVoice);
          const vol     = userVolumes[user.sessionId] ?? 100;
          const isAdminUser = user.role === 'admin';

          return (
            <div
              key={user.sessionId}
              className={`ul-user ${isMe ? 'ul-user--me' : ''} ${isAdminUser ? 'ul-user--admin' : ''}`}
              onContextMenu={e => handleRightClick(e, { ...user, inVoice })}
              title="Right-click for options"
            >
              {/* Avatar: first letter of username */}
              <span className="ul-avatar" style={isAdminUser ? { borderColor: 'var(--yellow)', color: 'var(--yellow)' } : {}}>
                {(user.username ?? '?')[0].toUpperCase()}
              </span>

              <span className="ul-ip">{user.username}</span>

              <div className="ul-user-badges">
                {isAdminUser && <span className="ul-admin-badge" title="Admin">⚙</span>}
                {!isMe && inVoice && vol !== 100 && (
                  <span className="ul-vol-badge" title={`Volume: ${vol}%`}
                    style={{ color: vol === 0 ? 'var(--text-muted)' : vol > 100 ? 'var(--yellow)' : 'var(--accent)' }}>
                    {vol === 0 ? '🔇' : vol > 100 ? '🔊' : '🔉'} {vol}%
                  </span>
                )}
                {inVoice && (
                  <span className={`ul-voice-badge ${isMe && voice.isMuted ? 'is-muted' : ''}`}
                    title={isMe && voice.isMuted ? 'Muted' : 'In voice'}>
                    {isMe && voice.isMuted ? '🔇' : '🎙'}
                  </span>
                )}
                {isMe && <span className="ul-badge">you</span>}
              </div>
            </div>
          );
        })}
      </div>

      <VoiceControls voice={voice} />

      <div className="ul-footer">
        <div className="ul-identity">
          <span className="ul-dot online" />
          <span className="ul-my-ip" title={myUsername}>
            {myUsername}
            {myRole === 'admin' && <span style={{ color: 'var(--yellow)', marginLeft: 4 }}>⚙</span>}
          </span>
        </div>
        <button className="ul-disconnect" onClick={onDisconnect} title="Disconnect">⏻</button>
      </div>

      {ctxMenu && (
        <UserContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          user={ctxMenu.user}
          isMe={ctxMenu.user.sessionId === mySessionId}
          isAdmin={isAdmin}
          volume={userVolumes[ctxMenu.user.sessionId] ?? 100}
          onVolumeChange={setUserVolume}
          onKick={onAdminKick}
          onBan={onAdminBan}
          onClose={closeCtxMenu}
        />
      )}
    </aside>
  );
}