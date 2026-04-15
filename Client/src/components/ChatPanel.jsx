/**
 * ChatPanel.jsx — Main chat area.
 * Uses senderId (session ID) to identify own messages.
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
    const dateStr = new Date(msg.timestamp).toDateString();
    if (dateStr !== lastDate) {
      groups.push({ type: 'date-divider', label: formatDate(msg.timestamp), _id: `date-${dateStr}` });
      lastDate = dateStr;
    }
    groups.push(msg);
  }
  return groups;
}

export default function ChatPanel({ messages, myId, myIp, onSendMessage }) {
  const [input, setInput] = useState('');
  const endRef   = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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
      <div className="cp-header">
        <span className="cp-hash">#</span>
        <span className="cp-channel">general</span>
        <span className="cp-desc">Server chat — messages are saved on the server</span>
      </div>

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
                <span className="cp-date-line" />
                <span className="cp-date-label">{item.label}</span>
                <span className="cp-date-line" />
              </div>
            );
          }

          if (item.type === 'system') {
            return (
              <div key={item._id} className="cp-system-msg">
                <span className="cp-system-icon">•</span>
                {item.content}
              </div>
            );
          }

          // For history messages (from DB) there's no senderId, so fall back to IP match
          const isMe = item.senderId ? item.senderId === myId : item.sender_ip === myIp;

          return (
            <div key={item._id} className={`cp-msg ${isMe ? 'cp-msg--me' : ''}`}>
              <div className="cp-msg-avatar" title={item.sender_ip}>
                {(item.sender_ip ?? '?').split('.').pop()}
              </div>
              <div className="cp-msg-body">
                <div className="cp-msg-meta">
                  <span className="cp-msg-sender">{isMe ? 'You' : item.sender_ip}</span>
                  <span className="cp-msg-time">{formatTime(item.timestamp)}</span>
                </div>
                <div className="cp-msg-content">{item.content}</div>
              </div>
            </div>
          );
        })}

        <div ref={endRef} />
      </div>

      <form className="cp-input-area" onSubmit={handleSend}>
        <input
          ref={inputRef}
          className="cp-input"
          type="text"
          placeholder="Message #general"
          value={input}
          onChange={e => setInput(e.target.value)}
          maxLength={2000}
          autoComplete="off"
          spellCheck
        />
        <button type="submit" className="cp-send-btn" disabled={!input.trim()} title="Send (Enter)">
          ↵
        </button>
      </form>
    </div>
  );
}