/**
 * UserList.jsx — Left sidebar (Phase 2, with right-click volume control)
 */

import { useState, useCallback } from 'react';
import VoiceControls from './VoiceControls.jsx';
import UserContextMenu from './UserContextMenu.jsx';

export default function UserList({ users, myIp, mySessionId, voice, onDisconnect }) {
  const { userVolumes, setUserVolume } = voice;

  // ── Context menu state ─────────────────────────────────────────────────────
  const [ctxMenu, setCtxMenu] = useState(null);
  // ctxMenu: { x, y, user } | null

  const handleRightClick = useCallback((e, user) => {
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY, user });
  }, []);

  const closeCtxMenu = useCallback(() => setCtxMenu(null), []);

  // ── Voice icon helper ──────────────────────────────────────────────────────
  const voiceUserIds = new Set(voice.voiceUsers.map(u => u.sessionId));

  return (
    <aside className="user-list">
      {/* Header */}
      <div className="ul-header">
        <span className="ul-header-title">Members</span>
        <span className="ul-count">{users.length}</span>
      </div>

      <div className="ul-section-label">
        <span className="ul-dot online" />
        Online — {users.length}
      </div>

      {/* User rows */}
      <div className="ul-users">
        {users.length === 0 && (
          <p className="ul-empty">No users connected</p>
        )}
        {users.map(user => {
          const isMe    = user.sessionId === mySessionId;
          const inVoice = user.inVoice || voiceUserIds.has(user.sessionId) || (isMe && voice.inVoice);
          const vol     = userVolumes[user.sessionId] ?? 100;

          return (
            <div
              key={user.sessionId}
              className={`ul-user ${isMe ? 'ul-user--me' : ''}`}
              onContextMenu={e => handleRightClick(e, { ...user, inVoice })}
              title="Right-click for options"
            >
              <span className="ul-avatar">{user.ip.split('.').pop() ?? '?'}</span>

              <span className="ul-ip">{user.ip}</span>

              <div className="ul-user-badges">
                {/* Volume indicator when not at 100% */}
                {!isMe && inVoice && vol !== 100 && (
                  <span
                    className="ul-vol-badge"
                    title={`Volume: ${vol}%`}
                    style={{ color: vol === 0 ? 'var(--text-muted)' : vol > 100 ? 'var(--yellow)' : 'var(--accent)' }}
                  >
                    {vol === 0 ? '🔇' : vol > 100 ? '🔊' : '🔉'} {vol}%
                  </span>
                )}
                {inVoice && (
                  <span
                    className={`ul-voice-badge ${isMe && voice.isMuted ? 'is-muted' : ''}`}
                    title={isMe && voice.isMuted ? 'Muted' : 'In voice'}
                  >
                    {isMe && voice.isMuted ? '🔇' : '🎙'}
                  </span>
                )}
                {isMe && <span className="ul-badge">you</span>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Voice controls */}
      <VoiceControls voice={voice} />

      {/* Footer */}
      <div className="ul-footer">
        <div className="ul-identity">
          <span className="ul-dot online" />
          <span className="ul-my-ip" title={myIp}>{myIp}</span>
        </div>
        <button className="ul-disconnect" onClick={onDisconnect} title="Disconnect">⏻</button>
      </div>

      {/* Context menu (portal-less — positioned fixed) */}
      {ctxMenu && (
        <UserContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          user={ctxMenu.user}
          isMe={ctxMenu.user.sessionId === mySessionId}
          volume={userVolumes[ctxMenu.user.sessionId] ?? 100}
          onVolumeChange={setUserVolume}
          onClose={closeCtxMenu}
        />
      )}
    </aside>
  );
}