/**
 * useVoice.js — WebRTC voice chat hook (fixed: muted audio element + Web Audio gain)
 */

import { useState, useRef, useCallback, useEffect } from 'react';

const PC_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
  ],
};

export function useVoice(sendSignal) {
  const [inVoice, setInVoice] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [voiceUsers, setVoiceUsers] = useState([]);
  const [inputDevices, setInputDevices] = useState([]);
  const [outputDevices, setOutputDevices] = useState([]);
  const [selectedInputId, setSelectedInputId] = useState('default');
  const [selectedOutputId, setSelectedOutputId] = useState('default');
  const [userVolumes, setUserVolumes] = useState({});

  const inVoiceRef = useRef(false);
  const localStream = useRef(null);
  const peers = useRef({});
  const gainNodes = useRef({});
  const audioElements = useRef({});          // store muted <audio> per peer
  const audioCtxRef = useRef(null);
  const pendingCandidates = useRef({});
  const selectedOutputRef = useRef('default');

  useEffect(() => { inVoiceRef.current = inVoice; }, [inVoice]);
  useEffect(() => { selectedOutputRef.current = selectedOutputId; }, [selectedOutputId]);

  // ── AudioContext (async, ensures resume) ──────────────────────────────────
  async function getAudioCtx() {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext();
      console.log('[Audio] Created AudioContext, initial state:', audioCtxRef.current.state);
    }
    if (audioCtxRef.current.state === 'suspended') {
      console.log('[Audio] Resuming AudioContext...');
      await audioCtxRef.current.resume();
      console.log('[Audio] AudioContext resumed, state:', audioCtxRef.current.state);
    }
    return audioCtxRef.current;
  }

  // ── Device enumeration ────────────────────────────────────────────────────
  const refreshDevices = useCallback(async () => {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      setInputDevices(all.filter(d => d.kind === 'audioinput'));
      setOutputDevices(all.filter(d => d.kind === 'audiooutput'));
    } catch (err) {
      console.warn('[Devices] enumerateDevices:', err.message);
    }
  }, []);

  useEffect(() => {
    refreshDevices();
    navigator.mediaDevices.addEventListener('devicechange', refreshDevices);
    return () => navigator.mediaDevices.removeEventListener('devicechange', refreshDevices);
  }, [refreshDevices]);

  // ── Peer factory ──────────────────────────────────────────────────────────
  function createPeer(sessionId) {
    if (peers.current[sessionId]) return peers.current[sessionId];

    console.log(`[WebRTC] Creating peer → ${sessionId}`);
    const pc = new RTCPeerConnection(PC_CONFIG);
    peers.current[sessionId] = pc;
    pendingCandidates.current[sessionId] = [];

    if (localStream.current) {
      localStream.current.getTracks().forEach(track =>
        pc.addTrack(track, localStream.current)
      );
      console.log(`[WebRTC] Added ${localStream.current.getTracks().length} local track(s)`);
    } else {
      console.warn(`[WebRTC] No localStream for peer ${sessionId}`);
    }

    pc.ontrack = async (event) => {
      console.log(`[WebRTC] ontrack from ${sessionId}`, event.streams.length, 'stream(s)');

      const stream = event.streams?.[0] ?? new MediaStream([event.track]);

      // 1. Create a muted <audio> element to satisfy browser stream activation
      if (!audioElements.current[sessionId]) {
        const audio = new Audio();
        audio.srcObject = stream;
        audio.muted = true;        // 🔇 prevents audible output from the element itself
        audio.autoplay = true;
        await audio.play().catch(e => console.warn('[Audio] play error (muted):', e));
        audioElements.current[sessionId] = audio;
        console.log(`[Audio] Muted <audio> created for ${sessionId}`);
      }

      // 2. Set up Web Audio gain control (the audible path)
      const ctx = await getAudioCtx();

      // Avoid duplicate gain nodes for the same peer
      if (gainNodes.current[sessionId]) {
        console.log(`[Audio] GainNode already exists for ${sessionId}, skipping reconnection`);
        return;
      }

      const gain = ctx.createGain();
      gain.gain.value = 1.0;
      gainNodes.current[sessionId] = gain;
      setUserVolumes(prev => ({ ...prev, [sessionId]: 100 }));

      const source = ctx.createMediaStreamSource(stream);
      source.connect(gain);
      gain.connect(ctx.destination);

      const [track] = stream.getAudioTracks();
      if (track) {
        console.log(`[Audio] Track for ${sessionId} - enabled: ${track.enabled}, muted: ${track.muted}, readyState: ${track.readyState}`);
        track.onunmute = () => console.log(`[Audio] Track ${sessionId} unmuted`);
        track.onmute = () => console.log(`[Audio] Track ${sessionId} muted`);
      }

      console.log(`[Audio] Web Audio graph connected for ${sessionId}, ctx state: ${ctx.state}`);
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sendSignal({
          type: 'ice-candidate',
          targetId: sessionId,
          candidate: event.candidate,
        });
      }
    };

    pc.onconnectionstatechange = () =>
      console.log(`[WebRTC] ${sessionId} connectionState → ${pc.connectionState}`);
    pc.oniceconnectionstatechange = () =>
      console.log(`[WebRTC] ${sessionId} iceConnectionState → ${pc.iceConnectionState}`);

    return pc;
  }

  function closePeer(sessionId) {
    const pc = peers.current[sessionId];
    const gain = gainNodes.current[sessionId];
    const audio = audioElements.current[sessionId];

    if (pc) { pc.close(); delete peers.current[sessionId]; }
    if (gain) { gain.disconnect(); delete gainNodes.current[sessionId]; }
    if (audio) {
      audio.srcObject = null;
      audio.pause();
      delete audioElements.current[sessionId];
    }
    delete pendingCandidates.current[sessionId];

    setUserVolumes(prev => {
      const n = { ...prev };
      delete n[sessionId];
      return n;
    });
  }

  async function flushPendingCandidates(sessionId, pc) {
    for (const c of (pendingCandidates.current[sessionId] ?? [])) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(c));
      } catch (err) {
        console.warn('[WebRTC] Queued ICE failed:', err.message);
      }
    }
    pendingCandidates.current[sessionId] = [];
  }

  // ── Public: set per-user volume (0% – 200%) ───────────────────────────────
  const setUserVolume = useCallback((sessionId, pct) => {
    const gain = gainNodes.current[sessionId];
    if (gain) {
      gain.gain.value = pct / 100;
    }
    setUserVolumes(prev => ({ ...prev, [sessionId]: pct }));
  }, []);

  // ── Public: join voice ────────────────────────────────────────────────────
  const joinVoice = useCallback(async () => {
    try {
      // Ensure AudioContext is running (user gesture)
      const ctx = await getAudioCtx();
      await ctx.resume();

      const audioConstraints = {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      };
      if (selectedInputId && selectedInputId !== 'default') {
        audioConstraints.deviceId = { exact: selectedInputId };
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints,
        video: false,
      });

      localStream.current = stream;
      console.log('[Voice] Got local stream:', stream.getTracks().map(t => t.label));
      await refreshDevices();

      inVoiceRef.current = true;
      setInVoice(true);
      setIsMuted(false);
      sendSignal({ type: 'voice_join' });
    } catch (err) {
      console.error('[Voice] getUserMedia failed:', err);
      const msgs = {
        NotAllowedError: 'Microphone access was denied.',
        NotFoundError: 'No microphone detected.',
        OverconstrainedError: 'Selected mic is unavailable.',
      };
      alert(msgs[err.name] ?? `Microphone error: ${err.message}`);
    }
  }, [sendSignal, selectedInputId, refreshDevices]);

  // ── Public: leave voice ───────────────────────────────────────────────────
  const leaveVoice = useCallback(() => {
    localStream.current?.getTracks().forEach(t => t.stop());
    localStream.current = null;
    Object.keys(peers.current).forEach(closePeer);
    inVoiceRef.current = false;
    setInVoice(false);
    setIsMuted(false);
    setVoiceUsers([]);
    setUserVolumes({});
    sendSignal({ type: 'voice_leave' });
  }, [sendSignal]);

  // ── Public: mute toggle ───────────────────────────────────────────────────
  const toggleMute = useCallback(() => {
    if (!localStream.current) return;
    const tracks = localStream.current.getAudioTracks();
    if (!tracks.length) return;
    const nowEnabled = !tracks[0].enabled;
    tracks.forEach(t => { t.enabled = nowEnabled; });
    setIsMuted(!nowEnabled);
  }, []);

  // ── Signaling handler ─────────────────────────────────────────────────────
  const handleSignal = useCallback(async (msg) => {
    switch (msg.type) {
      case 'voice_joined_ack': {
        const existing = msg.voiceUsers ?? [];
        setVoiceUsers(existing);
        console.log(`[Voice] Ack. Existing peers: ${existing.length}`);
        for (const user of existing) {
          try {
            const pc = createPeer(user.sessionId);
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            sendSignal({
              type: 'offer',
              targetId: user.sessionId,
              sdp: pc.localDescription,
            });
            console.log(`[WebRTC] Offer → ${user.sessionId}`);
          } catch (err) {
            console.error(`[WebRTC] createOffer failed for ${user.sessionId}:`, err);
          }
        }
        break;
      }

      case 'user_voice_joined': {
        setVoiceUsers(prev => {
          if (prev.find(u => u.sessionId === msg.sessionId)) return prev;
          return [...prev, { sessionId: msg.sessionId, ip: msg.ip }];
        });
        break;
      }

      case 'user_voice_left': {
        closePeer(msg.sessionId);
        setVoiceUsers(prev => prev.filter(u => u.sessionId !== msg.sessionId));
        break;
      }

      case 'offer': {
        console.log(`[WebRTC] Offer ← ${msg.fromId} | inVoice: ${inVoiceRef.current}`);
        if (!inVoiceRef.current) break;
        try {
          const pc = createPeer(msg.fromId);
          await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
          await flushPendingCandidates(msg.fromId, pc);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          sendSignal({
            type: 'answer',
            targetId: msg.fromId,
            sdp: pc.localDescription,
          });
          console.log(`[WebRTC] Answer → ${msg.fromId}`);
        } catch (err) {
          console.error('[WebRTC] Offer error:', err);
        }
        break;
      }

      case 'answer': {
        const pc = peers.current[msg.fromId];
        if (!pc) break;
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
          await flushPendingCandidates(msg.fromId, pc);
        } catch (err) {
          console.error('[WebRTC] Answer error:', err);
        }
        break;
      }

      case 'ice-candidate': {
        const pc = peers.current[msg.fromId];
        if (!pc || !pc.remoteDescription?.type) {
          pendingCandidates.current[msg.fromId] = [
            ...(pendingCandidates.current[msg.fromId] ?? []),
            msg.candidate,
          ];
          break;
        }
        try {
          await pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
        } catch (err) {
          console.warn('[WebRTC] ICE error:', err.message);
        }
        break;
      }

      default:
        break;
    }
  }, [sendSignal]);

  const handleUserLeft = useCallback((sessionId) => {
    closePeer(sessionId);
    setVoiceUsers(prev => prev.filter(u => u.sessionId !== sessionId));
  }, []);

  return {
    inVoice,
    isMuted,
    voiceUsers,
    joinVoice,
    leaveVoice,
    toggleMute,
    handleSignal,
    handleUserLeft,
    inputDevices,
    outputDevices,
    selectedInputId,
    selectedOutputId,
    setSelectedInputId,
    setSelectedOutputId,
    userVolumes,
    setUserVolume,
  };
}