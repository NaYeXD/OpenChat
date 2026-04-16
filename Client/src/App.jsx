/**
 * App.jsx — Root component (Phase 3)
 *
 * Changes from Phase 2:
 *  - WebSocket URL uses wss:// instead of ws://
 *  - Before opening the socket, calls window.electronAPI.confirmSelfSignedCert()
 *    so Electron's certificate verify proc has the fingerprint cached in time
 *  - isSecure state tracks whether we connected over wss:// (always true now,
 *    kept as state so Phase 6 can toggle for plain ws:// fallback)
 *  - Passes isSecure down to MainLayout for the padlock indicator
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
  // ── Connection state ───────────────────────────────────────────────────────
  const [screen,       setScreen]       = useState('connect');
  const [connectError, setConnectError] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSecure,     setIsSecure]     = useState(false); // wss:// connected

  // ── Chat / presence state ──────────────────────────────────────────────────
  const [users,       setUsers]       = useState([]);
  const [messages,    setMessages]    = useState([]);
  const [myIp,        setMyIp]        = useState('');
  const [mySessionId, setMySessionId] = useState('');

  const wsRef = useRef(null);

  // ── sendSignal — stable, used by useVoice ──────────────────────────────────
  const sendSignal = useCallback((payload) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WS_READY.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  }, []);

  const voice = useVoice(sendSignal);

  // ── Helpers ────────────────────────────────────────────────────────────────

  function addSystemMessage(text) {
    setMessages(prev => [
      ...prev,
      { _id: `sys-${Date.now()}-${Math.random()}`, type: 'system', content: text, timestamp: Date.now() },
    ]);
  }

  // ── Connect ────────────────────────────────────────────────────────────────

  const connect = useCallback(async ({ serverIp, port, password }) => {
    setConnectError('');
    setIsConnecting(true);

    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
    }

    // ── Phase 3: show self-signed cert warning before opening socket ──────
    // This gives Electron's cert verify proc time to cache the decision.
    // window.electronAPI is injected by preload.js via contextBridge.
    if (window.electronAPI?.confirmSelfSignedCert) {
      try {
        const accepted = await window.electronAPI.confirmSelfSignedCert(serverIp);
        if (!accepted) {
          setConnectError('Connection cancelled — certificate not trusted.');
          setIsConnecting(false);
          return;
        }
      } catch {
        // If IPC fails (e.g. running in browser dev), continue anyway
      }
    }

    const url = `wss://${serverIp}:${port}`;
    const ws  = new WebSocket(url);
    wsRef.current = ws;

    const connectTimeout = setTimeout(() => {
      if (ws.readyState !== WS_READY.OPEN) {
        ws.close();
        setConnectError('Connection timed out. Is the server running?');
        setIsConnecting(false);
      }
    }, 10000); // 10s — TLS handshake takes a little longer than plain WS

    ws.onopen = () => {
      clearTimeout(connectTimeout);
      setIsSecure(true);
      ws.send(JSON.stringify({ type: 'auth', password }));
    };

    ws.onmessage = (event) => {
      let msg;
      try { msg = JSON.parse(event.data); } catch { return; }

      if (VOICE_TYPES.has(msg.type)) { voice.handleSignal(msg); return; }

      switch (msg.type) {
        case 'auth_success':
          setMyIp(msg.yourIp);
          setMySessionId(msg.yourSessionId);
          setIsConnecting(false);
          setScreen('chat');
          break;

        case 'auth_failed':
          setConnectError(msg.message || 'Incorrect password.');
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
            return [...prev, { sessionId: msg.sessionId, ip: msg.ip, inVoice: false }];
          });
          addSystemMessage(`${msg.ip} joined the server`);
          break;

        case 'user_left':
          setUsers(prev => prev.filter(u => u.sessionId !== msg.sessionId));
          voice.handleUserLeft(msg.sessionId);
          addSystemMessage(`${msg.ip} left the server`);
          break;

        case 'user_voice_state':
          setUsers(prev => prev.map(u =>
            u.sessionId === msg.sessionId ? { ...u, inVoice: msg.inVoice } : u
          ));
          break;

        case 'chat':
          setMessages(prev => [
            ...prev,
            { ...msg, _id: `chat-${msg.timestamp}-${msg.sender_ip}` },
          ]);
          break;

        case 'error':
          console.warn('[Server error]', msg.message);
          break;

        default: break;
      }
    };

    ws.onclose = (event) => {
      clearTimeout(connectTimeout);
      setIsConnecting(false);
      setIsSecure(false);
      setScreen(prev => {
        if (prev === 'chat') {
          if (voice.inVoice) voice.leaveVoice();
          setConnectError(`Disconnected from server (code ${event.code}).`);
          setUsers([]);
          setMessages([]);
          setMyIp('');
          setMySessionId('');
          return 'connect';
        }
        return prev;
      });
    };

    ws.onerror = () => {
      clearTimeout(connectTimeout);
      setIsConnecting(false);
      setConnectError(
        'Could not reach the server.\n' +
        'Check the IP, port, and that the server is running.\n' +
        'If this is a new server, it may still be generating its certificate.'
      );
    };
  }, [voice]);

  // ── Send chat ──────────────────────────────────────────────────────────────

  const sendMessage = useCallback((content) => {
    sendSignal({ type: 'chat', content });
  }, [sendSignal]);

  // ── Disconnect ─────────────────────────────────────────────────────────────

  const disconnect = useCallback(() => {
    if (voice.inVoice) voice.leaveVoice();
    const ws = wsRef.current;
    if (ws) { ws.onclose = null; ws.close(1000, 'User disconnected'); }
    setScreen('connect');
    setConnectError('');
    setIsSecure(false);
    setUsers([]);
    setMessages([]);
    setMyIp('');
    setMySessionId('');
  }, [voice]);

  // ── Render ─────────────────────────────────────────────────────────────────

  if (screen === 'connect') {
    return (
      <ConnectScreen
        onConnect={connect}
        error={connectError}
        isConnecting={isConnecting}
      />
    );
  }

  return (
    <MainLayout
      users={users}
      messages={messages}
      myIp={myIp}
      mySessionId={mySessionId}
      isSecure={isSecure}
      voice={voice}
      onSendMessage={sendMessage}
      onDisconnect={disconnect}
    />
  );
}