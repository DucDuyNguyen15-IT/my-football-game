import type { HubConn, PvpHub } from './hub';
import { startPvpMatch, type LoadedPlayer } from './rooms';

export const QUEUE_OFFER_CPU_SEC = 60;
export const QUEUE_TIMEOUT_SEC = 300;
export const QUEUE_TICK_MS = 1000;

export interface QueueEntry {
  conn: HubConn;
  enqueuedAt: number;
  player?: LoadedPlayer;
}

export function handleQueueJoin(hub: PvpHub, conn: HubConn): void {
  if (!hub.hasCardCatalog) {
    hub.queue.set(conn.userId, { conn, enqueuedAt: hub.now() });
    hub.ensureQueueTimer();
    return;
  }
  const uid = conn.userId;
  hub.beginPending(uid);
  void hub
    .loadPlayer(uid)
    .then((res) => {
      if (hub.isClosed(conn)) return;
      if (!res.ok) {
        conn.send({ t: 'error', code: 'invalid_squad' });
        return;
      }
      if (hub.full) {
        conn.send({ t: 'error', code: 'server_busy' });
        return;
      }
      if (hub.hasEntry(uid, { includePending: false })) {
        conn.send({ t: 'error', code: 'busy' });
        return;
      }
      hub.queue.set(uid, { conn, enqueuedAt: hub.now(), player: res.player });
      tryPairQueue(hub);
      if (hub.queue.has(uid)) {
        conn.send({ t: 'queue_status', waitedSec: 0, offerCpu: false });
        hub.ensureQueueTimer();
      }
    })
    .catch((err: unknown) => {
      hub.reportError(err);
      if (!hub.isClosed(conn)) conn.send({ t: 'error', code: 'server_busy' });
    })
    .finally(() => {
      hub.endPending(uid);
    });
}

export function tryPairQueue(hub: PvpHub): void {
  while (hub.queue.size >= 2 && !hub.full) {
    const entries = hub.queue.entries();
    const first = entries.next().value as [number, QueueEntry] | undefined;
    const second = entries.next().value as [number, QueueEntry] | undefined;
    if (!first || !second) break;
    const [u1, e1] = first;
    const [u2, e2] = second;
    if (hub.isClosed(e1.conn)) {
      hub.queue.delete(u1);
      continue;
    }
    if (hub.isClosed(e2.conn)) {
      hub.queue.delete(u2);
      continue;
    }
    if (!e1.player || !e2.player) break;
    hub.queue.delete(u1);
    hub.queue.delete(u2);
    hub.beginPending(u1);
    hub.beginPending(u2);
    void startPvpMatch(hub, {
      kind: 'ranked',
      home: { ...e1.player, conn: e1.conn },
      away: { ...e2.player, conn: e2.conn },
      rng: hub.rng,
      dev: hub.dev,
    })
      .catch((err: unknown) => hub.reportError(err))
      .finally(() => {
        hub.endPending(u1);
        hub.endPending(u2);
      });
  }
}

export function tickQueue(hub: PvpHub): void {
  const now = hub.now();
  for (const [uid, entry] of [...hub.queue.entries()]) {
    if (hub.isClosed(entry.conn)) {
      hub.queue.delete(uid);
      continue;
    }
    const waitedSec = Math.max(0, Math.floor((now - entry.enqueuedAt) / 1000));
    if (waitedSec >= QUEUE_TIMEOUT_SEC) {
      hub.queue.delete(uid);
      entry.conn.send({ t: 'queue_timeout' });
    } else {
      entry.conn.send({
        t: 'queue_status',
        waitedSec,
        offerCpu: waitedSec >= QUEUE_OFFER_CPU_SEC,
      });
    }
  }
}
