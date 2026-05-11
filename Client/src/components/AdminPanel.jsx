/**
 * AdminPanel.jsx — Admin audit log viewer (Phase 4)
 *
 * Shown as an overlay panel sliding in from the right.
 * Displays the 100 most recent admin actions from the server.
 * Provides a search field for filtering the log.
 * Unban form lets the admin type a username and unban without the user being online.
 */

import { useState } from 'react';

function formatTime(ts) {
  return new Date(ts).toLocaleString([], {
    month:  '2-digit', day:    '2-digit',
    hour:   '2-digit', minute: '2-digit', second: '2-digit',
  });
}

const ACTION_STYLE = {
  REGISTER: { icon: '👤', color: 'var(--accent)'    },
  LOGIN:    { icon: '🔑', color: 'var(--accent)'    },
  KICK:     { icon: '👢', color: 'var(--yellow)'    },
  BAN:      { icon: '🔨', color: 'var(--red)'       },
  UNBAN:    { icon: '✅', color: 'var(--text-muted)' },
};

export default function AdminPanel({ auditLog, onRefresh, onClose, onUnban, adminFeedback }) {
  const [search,   setSearch]   = useState('');
  const [unbanTarget, setUnbanTarget] = useState('');

  const filtered = auditLog.filter(e => {
    const q = search.toLowerCase();
    return !q
      || e.action.toLowerCase().includes(q)
      || (e.performed_by ?? '').toLowerCase().includes(q)
      || (e.target ?? '').toLowerCase().includes(q)
      || (e.detail  ?? '').toLowerCase().includes(q);
  });

  function handleUnban(e) {
    e.preventDefault();
    if (!unbanTarget.trim()) return;
    onUnban(unbanTarget.trim());
    setUnbanTarget('');
  }

  return (
    <div className="admin-panel">
      {/* Header */}
      <div className="ap-header">
        <div className="ap-title-row">
          <span className="ap-title">⚙ Admin Panel</span>
          <div className="ap-header-actions">
            <button className="ap-btn" onClick={onRefresh} title="Refresh audit log">↻ Refresh</button>
            <button className="ap-close" onClick={onClose} title="Close">✕</button>
          </div>
        </div>

        {adminFeedback && (
          <div className={`ap-feedback ${adminFeedback.startsWith('✓') ? 'is-success' : 'is-error'}`}>
            {adminFeedback}
          </div>
        )}
      </div>

      {/* Unban form */}
      <form className="ap-unban-form" onSubmit={handleUnban}>
        <span className="ap-section-label">Unban User</span>
        <div className="ap-unban-row">
          <input
            className="ap-input"
            type="text"
            placeholder="username to unban"
            value={unbanTarget}
            onChange={e => setUnbanTarget(e.target.value)}
            spellCheck={false}
          />
          <button className="ap-btn ap-btn--unban" type="submit" disabled={!unbanTarget.trim()}>
            Unban
          </button>
        </div>
      </form>

      {/* Audit log */}
      <div className="ap-log-section">
        <div className="ap-log-header">
          <span className="ap-section-label">Audit Log</span>
          <input
            className="ap-search"
            type="text"
            placeholder="Filter…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <div className="ap-log-list">
          {auditLog.length === 0 && (
            <p className="ap-empty">No audit entries yet. Click Refresh to load.</p>
          )}
          {filtered.length === 0 && auditLog.length > 0 && (
            <p className="ap-empty">No entries match "{search}".</p>
          )}
          {filtered.map(entry => {
            const style = ACTION_STYLE[entry.action] ?? { icon: '•', color: 'var(--text-muted)' };
            return (
              <div key={entry.id} className="ap-entry">
                <span className="ap-entry-icon" style={{ color: style.color }}>{style.icon}</span>
                <div className="ap-entry-body">
                  <div className="ap-entry-main">
                    <span className="ap-entry-action" style={{ color: style.color }}>{entry.action}</span>
                    <span className="ap-entry-by">{entry.performed_by}</span>
                    {entry.target && (
                      <><span className="ap-entry-arrow">→</span><span className="ap-entry-target">{entry.target}</span></>
                    )}
                  </div>
                  {entry.detail && <div className="ap-entry-detail">{entry.detail}</div>}
                </div>
                <span className="ap-entry-time">{formatTime(entry.timestamp)}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}