/**
 * App.jsx — Root component (Phase 4)
 *
 * Auth flow:
 *   1. ConnectScreen collects server IP, port, username, password + mode (login/register)
 *   2. App makes HTTPS POST to /api/login or /api/register — receives { token, username, role }
 *   3. JWT stored in memory (useState — never written to disk)
 *   4. WSS opened, { type: "auth", token } sent as first message
 *   5. Server verifies JWT, returns auth_success with sessionId
 *
 * New state:
 *   - myUsername, myRole    — from JWT payload
 *   - isAdmin               — derived from myRole
 *   - showAdminPanel        — toggle admin log view
 *   - adminMessages         — server feedback for kick/ban/unban
 */

import { useState, useRef, useCallback } from 'react';
import ConnectScreen from './components/ConnectScreen.jsx';
import MainLayout    from './components/MainLayout.jsx';
import { useVoice }  from './hooks/useVoice.js';

const WS_READY    = { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 };
const VOICE_TYPES = new Set([
  'voice_joined_ack', 'user_voice_joined', 'user_voice_left',
  'offer', 'answer', 'ice-candidate',
]);

export default function App() {
  // ── Connection ─────────────────────────────────────────────────────────────
  const [screen,       setScreen]       = useState('connect');
  const [connectError, setConnectError] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSecure,     setIsSecure]     = useState(false);

  // ── Identity (from JWT) ────────────────────────────────────────────────────
  const [myUsername,    setMyUsername]    = useState('');
  const [myRole,        setMyRole]        = useState('user');
  const [mySessionId,   setMySessionId]   = useState('');

  // ── Chat / presence ────────────────────────────────────────────────────────
  const [users,    setUsers]    = useState([]);
  const [messages, setMessages] = useState([]);

  // ── Admin panel ────────────────────────────────────────────────────────────
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [auditLog,       setAuditLog]       = useState([]);
  const [adminFeedback,  setAdminFeedback]  = useState(''); // transient status message

  // ── Server info (needed for reconnect) ────────────────────────────────────
  const serverRef = useRef({ ip: '', port: '' });
  const tokenRef  = useRef(''); // JWT in memory only
  const wsRef     = useRef(null);

  // ── sendSignal ─────────────────────────────────────────────────────────────
  const sendSignal = useCallback((payload) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WS_READY.OPEN) ws.send(JSON.stringify(payload));
  }, []);

  const voice = useVoice(sendSignal);

  // ── Helpers ────────────────────────────────────────────────────────────────

  function addSystemMessage(text) {
    setMessages(prev => [
      ...prev,
      { _id: `sys-${Date.now()}-${Math.random()}`, type: 'system', content: text, timestamp: Date.now() },
    ]);
  }

  function flashAdminFeedback(msg) {
    setAdminFeedback(msg);
    setTimeout(() => setAdminFeedback(''), 4000);
  }

  // ── Step 1: HTTP login/register ────────────────────────────────────────────

  const connect = useCallback(async ({ serverIp, port, username, password, mode }) => {
    setConnectError('');
    setIsConnecting(true);

    // Show cert warning before ANY HTTPS request to this server
    if (window.electronAPI?.confirmSelfSignedCert) {
      try {
        const accepted = await window.electronAPI.confirmSelfSignedCert(serverIp);
        if (!accepted) {
          setConnectError('Connection cancelled — certificate not trusted.');
          setIsConnecting(false);
          return;
        }
      } catch { /* continue if IPC unavailable (browser dev mode) */ }
    }

    // HTTP auth
    const endpoint = mode === 'register' ? '/api/register' : '/api/login';
    let token, resolvedUsername, resolvedRole;

    try {
      const res = await fetch(`https://${serverIp}:${port}${endpoint}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ username: username.trim(), password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setConnectError(data.error || `Server error (${res.status})`);
        setIsConnecting(false);
        return;
      }

      token            = data.token;
      resolvedUsername = data.username;
      resolvedRole     = data.role;
    } catch (err) {
      setConnectError(
        'Could not reach the server HTTP API.\n' +
        'Check the IP and port, and confirm the server is running.\n' +
        `(${err.message})`
      );
      setIsConnecting(false);
      return;
    }

    // Step 2: open WSS with JWT
    tokenRef.current  = token;
    serverRef.current = { ip: serverIp, port };
    openWebSocket({ serverIp, port, token, resolvedUsername, resolvedRole });
  }, [voice]);

  // ── Step 2: open WSS ───────────────────────────────────────────────────────

  function openWebSocket({ serverIp, port, token, resolvedUsername, resolvedRole }) {
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
    }

    const ws = new WebSocket(`wss://${serverIp}:${port}`);
    wsRef.current = ws;

    const timeout = setTimeout(() => {
      if (ws.readyState !== WS_READY.OPEN) {
        ws.close();
        setConnectError('WebSocket connection timed out.');
        setIsConnecting(false);
      }
    }, 10_000);

    ws.onopen = () => {
      clearTimeout(timeout);
      setIsSecure(true);
      ws.send(JSON.stringify({ type: 'auth', token }));
    };

    ws.onmessage = (event) => {
      let msg;
      try { msg = JSON.parse(event.data); } catch { return; }

      if (VOICE_TYPES.has(msg.type)) { voice.handleSignal(msg); return; }

      switch (msg.type) {

        case 'auth_success':
          setMyUsername(resolvedUsername);
          setMyRole(resolvedRole);
          setMySessionId(msg.sessionId);
          setIsConnecting(false);
          setScreen('chat');
          break;

        case 'auth_failed':
          setConnectError(msg.message || 'Authentication failed. Please log in again.');
          setIsConnecting(false);
          ws.close();
          break;

        case 'history':
          setMessages(msg.messages.map(m => ({ ...m, _id: `hist-${m.id}` })));
          break;

        case 'user_list':
          setUsers(msg.users);
          break;

        case 'user_joined':
          setUsers(prev => {
            if (prev.find(u => u.sessionId === msg.sessionId)) return prev;
            return [...prev, { sessionId: msg.sessionId, username: msg.username, role: msg.role, inVoice: false }];
          });
          addSystemMessage(`${msg.username} joined the server`);
          break;

        case 'user_left':
          setUsers(prev => prev.filter(u => u.sessionId !== msg.sessionId));
          voice.handleUserLeft(msg.sessionId);
          addSystemMessage(`${msg.username} left the server`);
          break;

        case 'user_voice_state':
          setUsers(prev => prev.map(u =>
            u.sessionId === msg.sessionId ? { ...u, inVoice: msg.inVoice } : u
          ));
          break;

        case 'chat':
          setMessages(prev => [
            ...prev,
            { ...msg, _id: `chat-${msg.timestamp}-${msg.username}` },
          ]);
          break;

        // Admin feedback
        case 'admin_success':
          flashAdminFeedback(`✓ ${msg.message}`);
          break;

        case 'admin_error':
          flashAdminFeedback(`✗ ${msg.message}`);
          break;

        case 'audit_log':
          setAuditLog(msg.entries);
          setShowAdminPanel(true);
          break;

        // We got kicked or banned
        case 'kicked':
          addSystemMessage(`You were kicked: ${msg.reason}`);
          break;

        case 'banned':
          setConnectError(`Your account has been banned: ${msg.reason}`);
          break;

        case 'error':
          console.warn('[Server]', msg.message);
          break;

        default: break;
      }
    };

    ws.onclose = (event) => {
      clearTimeout(timeout);
      setIsConnecting(false);
      setIsSecure(false);
      setScreen(prev => {
        if (prev === 'chat') {
          if (voice.inVoice) voice.leaveVoice();
          setConnectError(`Disconnected from server (code ${event.code}).`);
          setUsers([]); setMessages([]); setMyUsername(''); setMyRole('user'); setMySessionId('');
          return 'connect';
        }
        return prev;
      });
    };

    ws.onerror = () => {
      clearTimeout(timeout);
      setIsConnecting(false);
      setConnectError('WebSocket connection failed. Check the server is running.');
    };
  }

  // ── Admin actions ──────────────────────────────────────────────────────────

  const adminKick = useCallback((targetUsername, reason = '') => {
    sendSignal({ type: 'admin_kick', targetUsername, reason });
  }, [sendSignal]);

  const adminBan = useCallback((targetUsername, reason = '') => {
    sendSignal({ type: 'admin_ban', targetUsername, reason });
  }, [sendSignal]);

  const adminUnban = useCallback((targetUsername) => {
    sendSignal({ type: 'admin_unban', targetUsername });
  }, [sendSignal]);

  const requestAuditLog = useCallback(() => {
    sendSignal({ type: 'admin_get_audit_log' });
  }, [sendSignal]);

  // ── Send chat ──────────────────────────────────────────────────────────────

  const sendMessage = useCallback((content) => {
    sendSignal({ type: 'chat', content });
  }, [sendSignal]);

  // ── Disconnect ─────────────────────────────────────────────────────────────

  const disconnect = useCallback(() => {
    if (voice.inVoice) voice.leaveVoice();
    const ws = wsRef.current;
    if (ws) { ws.onclose = null; ws.close(1000, 'User disconnected'); }
    tokenRef.current = '';
    setScreen('connect'); setConnectError(''); setIsSecure(false);
    setUsers([]); setMessages([]); setMyUsername(''); setMyRole('user'); setMySessionId('');
    setShowAdminPanel(false); setAuditLog([]);
  }, [voice]);

  // ── Render ─────────────────────────────────────────────────────────────────

  const isAdmin = myRole === 'admin';

  if (screen === 'connect') {
    return <ConnectScreen onConnect={connect} error={connectError} isConnecting={isConnecting} />;
  }

  return (
    <MainLayout
      users={users}
      messages={messages}
      myUsername={myUsername}
      mySessionId={mySessionId}
      myRole={myRole}
      isAdmin={isAdmin}
      isSecure={isSecure}
      voice={voice}
      showAdminPanel={showAdminPanel}
      auditLog={auditLog}
      adminFeedback={adminFeedback}
      onSendMessage={sendMessage}
      onDisconnect={disconnect}
      onToggleAdminPanel={() => {
        if (!showAdminPanel) requestAuditLog();
        else setShowAdminPanel(false);
      }}
      onAdminKick={adminKick}
      onAdminBan={adminBan}
      onAdminUnban={adminUnban}
      onRefreshAuditLog={requestAuditLog}
    />
  );
}