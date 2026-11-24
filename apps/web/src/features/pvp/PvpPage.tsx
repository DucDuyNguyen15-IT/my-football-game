import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import type { PvpErrorCode, PvpServerMessage } from '@pitch/shared';
import { readDevOptions } from '../play/hud';
import { isTouchOnly, NeedKeyboard } from '../play/PreMatch';
import { PvpLobby, type LobbyQueue, type LobbyRoom } from './PvpLobby';
import { PvpMatchPage, type EndMessage, type MatchedMessage } from './PvpMatchPage';
import { expiryDelayMs } from './netCore';
import {
  createPvpClient,
  type NetSocket,
  type PvpClient,
  type PvpClientStatus,
} from './useNetMatch';

function wsUrl(): string {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/api/v1/pvp/ws`;
}

function wrapWebSocket(ws: WebSocket): NetSocket {
  const sock: NetSocket = {
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
    get onopen() {
      return ws.onopen as NetSocket['onopen'];
    },
    set onopen(fn) {
      ws.onopen = fn ?? null;
    },
  };
  return sock;
}

const INITIAL_STATUS: PvpClientStatus = {
  connected: false,
  reconnecting: false,
  busyRetrying: false,
  rebuilding: false,
  rebuildSlowMs: null,
  gaveUp: false,
};

export function PvpPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const dev =
    import.meta.env.DEV || import.meta.env.MODE === 'test'
      ? readDevOptions(params.toString(), import.meta.env)
      : {};
  const [needKeyboard] = useState(() => !dev.autopilot && isTouchOnly());

  const [client, setClient] = useState<PvpClient | null>(null);
  const [status, setStatus] = useState<PvpClientStatus>(INITIAL_STATUS);
  const [room, setRoom] = useState<LobbyRoom | null>(null);
  const [queue, setQueue] = useState<LobbyQueue | null>(null);
  const [queueTimeout, setQueueTimeout] = useState(false);
  const [roomExpired, setRoomExpired] = useState(false);
  const [error, setError] = useState<PvpErrorCode | null>(null);
  const [matched, setMatched] = useState<MatchedMessage | null>(null);
  const [countdownMs, setCountdownMs] = useState<number | null>(null);
  const [oppDisconnectedUntil, setOppDisconnectedUntil] = useState<number | null>(null);
  const [ended, setEnded] = useState<EndMessage | null>(null);
  const [subRejectedSeq, setSubRejectedSeq] = useState(0);
  const [connSeq, setConnSeq] = useState(0);

  // Phòng hết hạn (10 phút): server đã xoá, chủ phòng không còn mã dùng được (C3-02).
  useEffect(() => {
    if (!room) return;
    const ms = expiryDelayMs(room.expiresAt, Date.now());
    if (!Number.isFinite(ms)) return;
    const id = window.setTimeout(() => {
      setRoom(null);
      setRoomExpired(true);
    }, ms);
    return () => window.clearTimeout(id);
  }, [room]);

  useEffect(() => {
    if (needKeyboard) return;
    let disposed = false;
    let wasConnected = false;
    const pvpClient = createPvpClient({
      connect: () => wrapWebSocket(new WebSocket(wsUrl())),
      onStatus: (next) => {
        if (disposed) return;
        setStatus(next);
        if (next.connected) setClient(pvpClient);
        const lost = wasConnected && !next.connected;
        // Nối lại được: lỗi `busy` cũ (từ socket trước) không còn đúng nữa.
        if (next.connected && !wasConnected) setError((prev) => (prev === 'busy' ? null : prev));
        wasConnected = next.connected;
        if (lost) {
          // Mất kết nối: server đã bỏ phòng/hàng chờ; phiên hết hạn thì RequireAuth đưa về /login.
          setRoom(null);
          setQueue(null);
          void qc.invalidateQueries({ queryKey: ['me'] });
        }
      },
      onMessage: (m: PvpServerMessage) => {
        if (disposed) return;
        switch (m.t) {
          case 'room_created':
            setError(null);
            setRoomExpired(false);
            setQueue(null);
            setQueueTimeout(false);
            setRoom({ code: m.code, expiresAt: m.expiresAt });
            break;
          case 'queue_status':
            setError(null);
            setQueueTimeout(false);
            setQueue({ waitedSec: m.waitedSec, offerCpu: m.offerCpu });
            break;
          case 'queue_timeout':
            setQueue(null);
            setQueueTimeout(true);
            break;
          case 'error':
            if (m.code === 'sub_rejected') {
              setSubRejectedSeq((n) => n + 1);
            } else if (m.code === 'not_in_match') {
              // Server không còn trận này (mất sau crash): về sảnh kèm thông báo, không treo ở màn trận (C3-08).
              setMatched(null);
              setCountdownMs(null);
              setOppDisconnectedUntil(null);
              setEnded(null);
              setError(m.code);
            } else if (m.code !== 'busy') {
              setError(m.code);
            } else {
              setError((prev) => prev ?? 'busy');
            }
            break;
          case 'matched':
            setError(null);
            setRoom(null);
            setQueue(null);
            setQueueTimeout(false);
            setCountdownMs(null);
            setOppDisconnectedUntil(null);
            setEnded(null);
            setSubRejectedSeq(0);
            setMatched(m);
            break;
          case 'start':
            setCountdownMs(m.countdownMs);
            break;
          case 'opp_disconnected':
            setOppDisconnectedUntil(performance.now() + m.remainingMs);
            break;
          case 'opp_reconnected':
            setOppDisconnectedUntil(null);
            break;
          case 'end':
            setOppDisconnectedUntil(null);
            setEnded(m);
            void qc.invalidateQueries({ queryKey: ['me'] });
            void qc.invalidateQueries({ queryKey: ['missions'] });
            break;
        }
      },
    });
    return () => {
      disposed = true;
      pvpClient.dispose();
      setClient((prev) => (prev === pvpClient ? null : prev));
      setStatus(INITIAL_STATUS);
    };
  }, [needKeyboard, connSeq, qc]);

  const handleBackLobby = useCallback(() => {
    setMatched(null);
    setCountdownMs(null);
    setOppDisconnectedUntil(null);
    setEnded(null);
    setSubRejectedSeq(0);
    setRoom(null);
    setQueue(null);
    setQueueTimeout(false);
    setRoomExpired(false);
    setError(null);
    setConnSeq((n) => n + 1);
  }, []);

  if (needKeyboard) return <NeedKeyboard />;

  if (matched && client) {
    return (
      <PvpMatchPage
        key={matched.pvpId}
        net={client.net}
        status={status}
        matched={matched}
        countdownMs={countdownMs}
        oppDisconnectedUntil={oppDisconnectedUntil}
        ended={ended}
        subRejectedSeq={subRejectedSeq}
        onLeave={() => {
          client.send({ t: 'leave' });
          handleBackLobby();
        }}
        onBackLobby={handleBackLobby}
      />
    );
  }

  return (
    <PvpLobby
      connected={status.connected}
      reconnecting={status.reconnecting}
      gaveUp={status.gaveUp}
      onRetry={handleBackLobby}
      room={room}
      roomExpired={roomExpired}
      queue={queue}
      queueTimeout={queueTimeout}
      error={error}
      onJoinQueue={() => {
        setError(null);
        setQueueTimeout(false);
        client?.send({ t: 'queue_join' });
      }}
      onLeaveQueue={() => {
        client?.send({ t: 'queue_leave' });
        setQueue(null);
      }}
      onPlayCpu={() => {
        client?.send({ t: 'queue_leave' });
        setQueue(null);
        void navigate('/play');
      }}
      onCreateRoom={() => {
        setError(null);
        setRoomExpired(false);
        client?.send({ t: 'room_create' });
      }}
      onJoinRoom={(code) => {
        setError(null);
        client?.send({ t: 'room_join', code });
      }}
      onLeaveRoom={() => {
        client?.send({ t: 'room_leave' });
        setRoom(null);
      }}
    />
  );
}
