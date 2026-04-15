/**
 * App.jsx — Root component (Phase 2)
 *
 * Changes from Phase 1:
 *  - Users are now { sessionId, ip, inVoice } objects (not plain IP strings)
 *  - mySessionId state added
 *  - useVoice hook wired up; signaling messages routed to it
 *  - sendSignal helper (sends any WebSocket message — used by voice hook)
 */

import { useState, useRef, useCallback } from 'react';
import ConnectScreen from './components/ConnectScreen.jsx';
import MainLayout from './components/MainLayout.jsx';
import { useVoice } from './hooks/useVoice.js';

const WS_READY = { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 };

// Message types handled by the voice hook (routed away from main switch)
const VOICE_TYPES = new Set([
  'voice_joined_ack',
  'user_voice_joined',
  'user_voice_left',
  'offer',
  'answer',
  'ice-candidate',
]);

export default function App() {
  // ── Connection state ───────────────────────────────────────────────────────
  const [screen,       setScreen]       = useState('connect');
  const [connectError, setConnectError] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);

  // ── Chat / presence state ──────────────────────────────────────────────────
  const [users,    setUsers]    = useState([]); // [{ sessionId, ip, inVoice }]
  const [messages, setMessages] = useState([]);
  const [myIp,     setMyIp]     = useState('');
  const [mySessionId, setMySessionId] = useState('');

  // ── WebSocket ref ──────────────────────────────────────────────────────────
  const wsRef = useRef(null);

  // ── sendSignal — stable callback used by useVoice ─────────────────────────
  const sendSignal = useCallback((payload) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WS_READY.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  }, []);

  // ── Voice hook ─────────────────────────────────────────────────────────────
  const voice = useVoice(sendSignal);

  // ── Helpers ────────────────────────────────────────────────────────────────

  function addSystemMessage(text) {
    setMessages(prev => [
      ...prev,
      { _id: `sys-${Date.now()}-${Math.random()}`, type: 'system', content: text, timestamp: Date.now() },
    ]);
  }

  // ── Connect ────────────────────────────────────────────────────────────────

  const connect = useCallback(({ serverIp, port, password }) => {
    setConnectError('');
    setIsConnecting(true);

    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
    }

    const ws = new WebSocket(`ws://${serverIp}:${port}`);
    wsRef.current = ws;

    const connectTimeout = setTimeout(() => {
      if (ws.readyState !== WS_READY.OPEN) {
        ws.close();
        setConnectError('Connection timed out. Is the server running?');
        setIsConnecting(false);
      }
    }, 8000);

    ws.onopen = () => {
      clearTimeout(connectTimeout);
      ws.send(JSON.stringify({ type: 'auth', password }));
    };

    ws.onmessage = (event) => {
      let msg;
      try { msg = JSON.parse(event.data); }
      catch { return; }

      // Route voice/signaling messages to the voice hook
      if (VOICE_TYPES.has(msg.type)) {
        voice.handleSignal(msg);
        return;
      }

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

        // user_list now sends [{ sessionId, ip, inVoice }]
        case 'user_list':
          setUsers(msg.users);
          break;

        // user_joined now includes sessionId and inVoice
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

        // Voice state change for a specific user (update their inVoice flag)
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

        default:
          break;
      }
    };

    ws.onclose = (event) => {
      clearTimeout(connectTimeout);
      setIsConnecting(false);
      setScreen(prev => {
        if (prev === 'chat') {
          // Clean up voice if we were in it
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
      setConnectError('Could not reach the server. Check the IP, port, and that the server is running.');
      setIsConnecting(false);
    };
  }, [voice]);

  // ── Send chat message ──────────────────────────────────────────────────────

  const sendMessage = useCallback((content) => {
    sendSignal({ type: 'chat', content });
  }, [sendSignal]);

  // ── Disconnect ─────────────────────────────────────────────────────────────

  const disconnect = useCallback(() => {
    if (voice.inVoice) voice.leaveVoice();
    const ws = wsRef.current;
    if (ws) {
      ws.onclose = null;
      ws.close(1000, 'User disconnected');
    }
    setScreen('connect');
    setConnectError('');
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
      voice={voice}
      onSendMessage={sendMessage}
      onDisconnect={disconnect}
    />
  );
}