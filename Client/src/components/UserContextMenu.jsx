/**
 * UserContextMenu.jsx — Right-click context menu for a user in the user list.
 *
 * Shows:
 *  - User IP (header)
 *  - Volume slider 0–200% (only when that user is in voice and is not "you")
 *  - Volume percentage label
 *
 * Closes when:
 *  - User clicks anywhere outside the menu
 *  - User presses Escape
 *  - User releases the mouse button after dragging the slider
 */

import { useEffect, useRef } from 'react';

export default function UserContextMenu({
  x,
  y,
  user,          // { sessionId, ip, inVoice }
  isMe,
  volume,        // current volume 0–200
  onVolumeChange,
  onClose,
}) {
  const menuRef = useRef(null);

  // Close on outside click or Escape
  useEffect(() => {
    function handleClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        onClose();
      }
    }
    function handleKey(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  // Keep menu inside the window bounds
  const MENU_W = 220;
  const MENU_H = 130;
  const safeX  = Math.min(x, window.innerWidth  - MENU_W - 8);
  const safeY  = Math.min(y, window.innerHeight - MENU_H - 8);

  // Volume colour: green → yellow → red as it climbs past 100%
  function volumeColor(pct) {
    if (pct <= 100) return 'var(--accent)';
    if (pct <= 150) return 'var(--yellow)';
    return 'var(--red)';
  }

  const canSetVolume = !isMe && user.inVoice;

  return (
    <div
      ref={menuRef}
      className="ctx-menu"
      style={{ left: safeX, top: safeY }}
      onContextMenu={e => e.preventDefault()}
    >
      {/* Header */}
      <div className="ctx-header">
        <span className="ctx-avatar">{user.ip.split('.').pop()}</span>
        <div className="ctx-user-info">
          <span className="ctx-ip">{user.ip}</span>
          <span className="ctx-status">
            {isMe ? 'You' : user.inVoice ? '🎙 In voice' : 'Text only'}
          </span>
        </div>
      </div>

      <div className="ctx-divider" />

      {/* Volume control */}
      {canSetVolume ? (
        <div className="ctx-volume">
          <div className="ctx-volume-header">
            <span className="ctx-volume-label">Volume</span>
            <span
              className="ctx-volume-pct"
              style={{ color: volumeColor(volume ?? 100) }}
            >
              {volume ?? 100}%
            </span>
          </div>
          <input
            type="range"
            className="ctx-slider"
            min={0}
            max={200}
            step={1}
            value={volume ?? 100}
            onChange={e => onVolumeChange(user.sessionId, Number(e.target.value))}
            style={{
              '--thumb-color': volumeColor(volume ?? 100),
              '--fill-pct':    `${((volume ?? 100) / 200) * 100}%`,
            }}
          />
          <div className="ctx-slider-labels">
            <span>0%</span>
            <span>100%</span>
            <span>200%</span>
          </div>
        </div>
      ) : (
        <p className="ctx-no-volume">
          {isMe
            ? 'You cannot adjust your own volume.'
            : 'User is not in the voice channel.'}
        </p>
      )}
    </div>
  );
}