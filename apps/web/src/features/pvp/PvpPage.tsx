import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import type { PvpErrorCode, PvpServerMessage } from '@pitch/shared';
import { readDevOptions } from '../play/hud';
import { isTouchOnly, NeedKeyboard } from '../play/PreMatch';
import { PvpLobby, type LobbyRoom } from './PvpLobby';
import { PvpMatchPage, type EndMessage, type MatchedMessage } from './PvpMatchPage';
import { createNetMatch, type NetMatch, type NetSocket } from './useNetMatch';

function wsUrl(): string {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/api/v1/pvp/ws`;
}

function wrapWebSocket(ws: WebSocket): NetSocket {
  return {
    send: (d) => ws.send(d),
    close: (c, r) => ws.close(c, r),
    get onmessage() {
      return ws.onmessage as NetSocket['onmessage'];
    },
    set onmessage(fn) {
      ws.onmessage = fn;
    },
    get onclose() {
      return ws.onclose as NetSocket['onclose'];
    },
    set onclose(fn) {
      ws.onclose = fn;
    },
  };
}

export function PvpPage() {
  const [params] = useSearchParams();
  const qc = useQueryClient();
  const dev =
    import.meta.env.DEV || import.meta.env.MODE === 'test'
      ? readDevOptions(params.toString(), import.meta.env)
      : {};
  const [needKeyboard] = useState(() => !dev.autopilot && isTouchOnly());

  const [net, setNet] = useState<NetMatch | null>(null);
  const [connected, setConnected] = useState(false);
  const [room, setRoom] = useState<LobbyRoom | null>(null);
  const [error, setError] = useState<PvpErrorCode | null>(null);
  const [matched, setMatched] = useState<MatchedMessage | null>(null);
  const [countdownMs, setCountdownMs] = useState<number | null>(null);
  const [ended, setEnded] = useState<EndMessage | null>(null);
  const [connSeq, setConnSeq] = useState(0);

  useEffect(() => {
    if (needKeyboard) return;
    let disposed = false;
    const ws = new WebSocket(wsUrl());
    const client = createNetMatch({
      socket: wrapWebSocket(ws),
      onMessage: (m: PvpServerMessage) => {
        if (disposed) return;
        switch (m.t) {
          case 'room_created':
            setError(null);
            setRoom({ code: m.code, expiresAt: m.expiresAt });
            break;
          case 'error':
            setError(m.code);
            break;
          case 'matched':
            setError(null);
            setRoom(null);
            setCountdownMs(null);
            setEnded(null);
            setMatched(m);
            break;
          case 'start':
            setCountdownMs(m.countdownMs);
            break;
          case 'end':
            setEnded(m);
            void qc.invalidateQueries({ queryKey: ['me'] });
            void qc.invalidateQueries({ queryKey: ['missions'] });
            break;
        }
      },
      onClose: () => {
        if (!disposed) setConnected(false);
      },
    });
    ws.addEventListener('open', () => {
      if (disposed) return;
      setNet(client);
      setConnected(true);
    });
    return () => {
      disposed = true;
      client.close();
      setNet((prev) => (prev === client ? null : prev));
      setConnected(false);
    };
  }, [needKeyboard, connSeq, qc]);

  const handleBackLobby = useCallback(() => {
    setMatched(null);
    setCountdownMs(null);
    setEnded(null);
    setRoom(null);
    setError(null);
    setConnSeq((n) => n + 1);
  }, []);

  if (needKeyboard) return <NeedKeyboard />;

  if (matched && net) {
    return (
      <PvpMatchPage
        key={matched.pvpId}
        net={net}
        matched={matched}
        countdownMs={countdownMs}
        ended={ended}
        onBackLobby={handleBackLobby}
      />
    );
  }

  return (
    <PvpLobby
      connected={connected}
      reconnecting={false}
      room={room}
      error={error}
      onCreateRoom={() => {
        setError(null);
        net?.send({ t: 'room_create' });
      }}
      onJoinRoom={(code) => {
        setError(null);
        net?.send({ t: 'room_join', code });
      }}
      onLeaveRoom={() => {
        net?.send({ t: 'room_leave' });
        setRoom(null);
      }}
    />
  );
}
