/**
 * UserContextMenu.jsx — Right-click context menu (Phase 4)
 *
 * New in Phase 4:
 *  - Admin-only section: Kick and Ban buttons
 *  - Ban prompts for an optional reason
 *  - Volume control kept from Phase 2
 */

import { useEffect, useRef, useState } from 'react';

export default function UserContextMenu({
  x, y,
  user,       // { sessionId, username, role, inVoice }
  isMe,
  isAdmin,    // is the *current* user an admin?
  volume,
  onVolumeChange,
  onKick,
  onBan,
  onClose,
}) {
  const menuRef = useRef(null);
  const [banReason, setBanReason] = useState('');
  const [showBanInput, setShowBanInput] = useState(false);

  useEffect(() => {
    function handleClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) onClose();
    }
    function handleKey(e) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown',   handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown',   handleKey);
    };
  }, [onClose]);

  const MENU_W = 240;
  const MENU_H = showBanInput ? 280 : 230;
  const safeX  = Math.min(x, window.innerWidth  - MENU_W - 8);
  const safeY  = Math.min(y, window.innerHeight - MENU_H - 8);

  function volumeColor(pct) {
    if (pct <= 100) return 'var(--accent)';
    if (pct <= 150) return 'var(--yellow)';
    return 'var(--red)';
  }

  const canSetVolume = !isMe && user.inVoice;
  const canAdminAct  = isAdmin && !isMe && user.role !== 'admin';

  function handleBanSubmit(e) {
    e.preventDefault();
    onBan(user.username, banReason.trim());
    onClose();
  }

  return (
    <div
      ref={menuRef}
      className="ctx-menu"
      style={{ left: safeX, top: safeY }}
      onContextMenu={e => e.preventDefault()}
    >
      {/* Header */}
      <div className="ctx-header">
        <span className="ctx-avatar">{(user.username ?? '?')[0].toUpperCase()}</span>
        <div className="ctx-user-info">
          <span className="ctx-ip">{user.username}</span>
          <span className="ctx-status">
            {isMe ? 'You' : user.role === 'admin' ? '⚙ Admin' : user.inVoice ? '🎙 In voice' : 'Text only'}
          </span>
        </div>
      </div>

      <div className="ctx-divider" />

      {/* Volume */}
      {canSetVolume ? (
        <div className="ctx-volume">
          <div className="ctx-volume-header">
            <span className="ctx-volume-label">Volume</span>
            <span className="ctx-volume-pct" style={{ color: volumeColor(volume ?? 100) }}>
              {volume ?? 100}%
            </span>
          </div>
          <input
            type="range" className="ctx-slider"
            min={0} max={200} step={1} value={volume ?? 100}
            onChange={e => onVolumeChange(user.sessionId, Number(e.target.value))}
            style={{ '--thumb-color': volumeColor(volume ?? 100), '--fill-pct': `${((volume ?? 100) / 200) * 100}%` }}
          />
          <div className="ctx-slider-labels"><span>0%</span><span>100%</span><span>200%</span></div>
        </div>
      ) : (
        !isMe && (
          <p className="ctx-no-volume">
            {user.inVoice ? '' : 'User is not in voice — no volume control.'}
          </p>
        )
      )}

      {/* Admin actions */}
      {canAdminAct && (
        <>
          <div className="ctx-divider" />
          <div className="ctx-admin-section">
            <span className="ctx-admin-label">Admin Actions</span>
            <div className="ctx-admin-buttons">
              <button
                className="ctx-admin-btn ctx-admin-btn--kick"
                onClick={() => { onKick(user.username, 'Kicked by admin.'); onClose(); }}
              >
                👢 Kick
              </button>
              <button
                className="ctx-admin-btn ctx-admin-btn--ban"
                onClick={() => setShowBanInput(v => !v)}
              >
                🔨 Ban
              </button>
            </div>

            {showBanInput && (
              <form className="ctx-ban-form" onSubmit={handleBanSubmit}>
                <input
                  className="ctx-ban-input"
                  type="text"
                  placeholder="Reason (optional)"
                  value={banReason}
                  onChange={e => setBanReason(e.target.value)}
                  autoFocus
                />
                <button className="ctx-admin-btn ctx-admin-btn--ban" type="submit">
                  Confirm Ban
                </button>
              </form>
            )}
          </div>
        </>
      )}
    </div>
  );
}