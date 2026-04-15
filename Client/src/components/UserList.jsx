/**
 * UserList.jsx — Left sidebar (Phase 2)
 *
 * Changes:
 *  - Users are now { sessionId, ip, inVoice } objects
 *  - Shows green mic icon next to users currently in voice channel
 *  - VoiceControls rendered at bottom of sidebar
 */

import VoiceControls from './VoiceControls.jsx';

export default function UserList({ users, myIp, mySessionId, voice, onDisconnect }) {
  const voiceUserIds = new Set(voice.voiceUsers.map(u => u.sessionId));

  return (
    <aside className="user-list">
      {/* Header */}
      <div className="ul-header">
        <span className="ul-header-title">Members</span>
        <span className="ul-count">{users.length}</span>
      </div>

      {/* Section label */}
      <div className="ul-section-label">
        <span className="ul-dot online" />
        Online — {users.length}
      </div>

      {/* User entries */}
      <div className="ul-users">
        {users.length === 0 && (
          <p className="ul-empty">No users connected</p>
        )}
        {users.map(user => {
          const isMe    = user.sessionId === mySessionId;
          // A user is in voice if: server flagged inVoice, OR they're in our local voiceUsers set
          const inVoice = user.inVoice || voiceUserIds.has(user.sessionId) || (isMe && voice.inVoice);

          return (
            <div key={user.sessionId} className={`ul-user ${isMe ? 'ul-user--me' : ''}`}>
              <span className="ul-avatar" title={user.ip}>
                {user.ip.split('.').pop() ?? '?'}
              </span>

              <span className="ul-ip">{user.ip}</span>

              <div className="ul-user-badges">
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

      {/* Voice controls panel */}
      <VoiceControls voice={voice} />

      {/* Footer: identity + disconnect */}
      <div className="ul-footer">
        <div className="ul-identity">
          <span className="ul-dot online" />
          <span className="ul-my-ip" title={myIp}>{myIp}</span>
        </div>
        <button className="ul-disconnect" onClick={onDisconnect} title="Disconnect">
          ⏻
        </button>
      </div>
    </aside>
  );
}