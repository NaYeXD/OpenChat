/**
 * ChatPanel.jsx — Main chat area (Phase 4)
 *
 * Changes:
 *  - Messages show username instead of IP
 *  - Admin users get a ⚙ button in the header to open the admin panel
 *  - Admin feedback toast shown in header area
 */

import { useState, useEffect, useRef } from 'react';

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
function formatDate(ts) {
  return new Date(ts).toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
}
function groupMessages(messages) {
  const groups = [];
  let lastDate = null;
  for (const msg of messages) {
    const d = new Date(msg.timestamp).toDateString();
    if (d !== lastDate) {
      groups.push({ type: 'date-divider', label: formatDate(msg.timestamp), _id: `date-${d}` });
      lastDate = d;
    }
    groups.push(msg);
  }
  return groups;
}

export default function ChatPanel({
  messages, myUsername, isSecure, isAdmin,
  onSendMessage, onToggleAdminPanel, adminFeedback,
}) {
  const [input, setInput] = useState('');
  const endRef   = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  function handleSend(e) {
    e.preventDefault();
    const content = input.trim();
    if (!content) return;
    onSendMessage(content);
    setInput('');
    inputRef.current?.focus();
  }

  const grouped = groupMessages(messages);

  return (
    <div className="chat-panel">
      {/* Header */}
      <div className="cp-header">
        <span className="cp-hash">#</span>
        <span className="cp-channel">general</span>
        <span className="cp-desc">Server chat — messages saved on server</span>

        {/* Admin feedback toast */}
        {adminFeedback && (
          <span className={`cp-admin-feedback ${adminFeedback.startsWith('✓') ? 'is-success' : 'is-error'}`}>
            {adminFeedback}
          </span>
        )}

        {/* Admin panel toggle */}
        {isAdmin && (
          <button
            className="cp-admin-btn"
            onClick={onToggleAdminPanel}
            title="Admin Panel"
          >
            ⚙ Admin
          </button>
        )}

        {/* Padlock */}
        <div className={`cp-tls-badge ${isSecure ? 'is-secure' : 'is-insecure'}`}
             title={isSecure ? 'Encrypted (wss://)' : 'Not encrypted'}>
          <span className="cp-tls-icon">{isSecure ? '🔒' : '⚠️'}</span>
          <span className="cp-tls-label">{isSecure ? 'Encrypted' : 'Unencrypted'}</span>
        </div>
      </div>

      {/* Messages */}
      <div className="cp-messages" role="log" aria-live="polite">
        {messages.length === 0 && (
          <div className="cp-welcome">
            <p className="cp-welcome-title">Welcome to #general</p>
            <p className="cp-welcome-sub">Say hello — messages are saved for everyone.</p>
          </div>
        )}

        {grouped.map(item => {
          if (item.type === 'date-divider') {
            return (
              <div key={item._id} className="cp-date-divider">
                <span className="cp-date-line" /><span className="cp-date-label">{item.label}</span><span className="cp-date-line" />
              </div>
            );
          }
          if (item.type === 'system') {
            return (
              <div key={item._id} className="cp-system-msg">
                <span className="cp-system-icon">•</span>{item.content}
              </div>
            );
          }

          // Use username field (Phase 4) falling back to sender_ip (old history)
          const sender = item.username ?? item.sender_ip ?? '?';
          const isMe   = sender === myUsername;
          const isAdminMsg = item.role === 'admin';

          return (
            <div key={item._id} className={`cp-msg ${isMe ? 'cp-msg--me' : ''}`}>
              <div className="cp-msg-avatar" title={sender}>
                {sender[0]?.toUpperCase() ?? '?'}
              </div>
              <div className="cp-msg-body">
                <div className="cp-msg-meta">
                  <span className={`cp-msg-sender ${isAdminMsg ? 'is-admin' : ''}`}>
                    {isMe ? 'You' : sender}
                    {isAdminMsg && !isMe && <span className="cp-admin-crown" title="Admin">⚙</span>}
                  </span>
                  <span className="cp-msg-time">{formatTime(item.timestamp)}</span>
                </div>
                <div className="cp-msg-content">{item.content}</div>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      {/* Input */}
      <form className="cp-input-area" onSubmit={handleSend}>
        <input
          ref={inputRef}
          className="cp-input"
          type="text"
          placeholder="Message #general"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(e); } }}
          maxLength={2000}
          autoComplete="off"
          spellCheck
        />
        <button type="submit" className="cp-send-btn" disabled={!input.trim()}>↵</button>
      </form>
    </div>
  );
}