/**
 * Client WS PvP lockstep (T022). Không phụ thuộc React/DOM: nhận một socket (WebSocket thật hoặc giả).
 * `stepBoth` + `hash` chạy ngay trong `onmessage` để tab ẩn vẫn theo kịp (research R2); vòng vẽ chỉ
 * gọi `display()`. Rớt mạng/rejoin/busy retry/watchdog 5 s là T034 — chỗ móc: `onGap`, `onClose`.
 */
import {
  createMatch,
  decodeInput,
  replayToState,
  stateHash,
  stepBoth,
  substitute,
  type MatchState,
} from '@pitch/sim';
import {
  PvpServerMessage,
  type PvpClientMessage,
  type PvpMatchSetup,
  type PvpSub,
} from '@pitch/shared';
import {
  DisplayCursor,
  FrameGate,
  JitterEstimator,
  StateHistory,
  displayPair,
  hashDue,
  shouldSendInput,
} from './netCore';

export interface NetSocket {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: ((ev: unknown) => void) | null;
}

export interface NetMatchOptions {
  socket: NetSocket;
  now?: () => number;
  /** Mọi tin hợp lệ từ server (kể cả `f`/`catchup`) để lớp trên xử lý sảnh, `end`, `opp_*`, `error`. */
  onMessage?: (msg: PvpServerMessage) => void;
  /** Hụt khung (tick tới > tick kế tiếp): chỗ móc cho `rejoin` ở T034. */
  onGap?: () => void;
  onClose?: () => void;
  /** Dựng lại state từ `catchup` (đặt được để test). */
  rebuild?: (setup: PvpMatchSetup, log: string) => MatchState;
}

export interface NetMatch {
  /** Đã nhận `matched` chưa. */
  readonly side: 'home' | 'away' | null;
  readonly pvpId: number | null;
  readonly rebuilding: boolean;
  /** State mới nhất (không trễ). */
  state(): MatchState | null;
  /** Vòng vẽ: state trễ theo bộ đệm jitter, đã nội suy. null khi chưa có trận. */
  display(dtSec: number): { prev: MatchState; curr: MatchState; alpha: number } | null;
  delayFrames(): number;
  send(msg: PvpClientMessage): void;
  /** Gửi `input` chỉ khi mã đổi. */
  sendInput(code: number): void;
  /** Tab ẩn / mất focus: gửi ngay c=0 (nếu đang khác 0). */
  releaseInput(): void;
  close(): void;
}

export function createNetMatch(opts: NetMatchOptions): NetMatch {
  const { socket } = opts;
  const now = opts.now ?? (() => performance.now());
  const rebuild =
    opts.rebuild ?? ((setup, log) => replayToState(setup, log));
  const jitter = new JitterEstimator();
  const gate = new FrameGate(0);
  const history = new StateHistory();
  const cursor = new DisplayCursor();
  let side: 'home' | 'away' | null = null;
  let pvpId: number | null = null;
  let state: MatchState | null = null;
  let queue: [number, number, number, PvpSub[]?][] | null = null; // != null: đang dựng lại
  let lastInput = 0;
  const send = (msg: PvpClientMessage) => socket.send(JSON.stringify(msg));

  function applyFrame(f: [number, number, number, PvpSub[]?]): void {
    if (!state) return;
    const verdict = gate.classify(f[0]);
    if (verdict === 'drop') return;
    if (verdict === 'gap') {
      opts.onGap?.();
      return;
    }
    jitter.onArrival(now());
    let s = state;
    // Lệnh thay người áp TRƯỚC step của tick này (bất biến 2).
    for (const sub of f[3] ?? []) {
      const r = substitute(s, sub.team, sub.out, sub.bench);
      if (r.ok) s = r.state;
    }
    s = stepBoth(s, { home: decodeInput(f[1]), away: decodeInput(f[2]) });
    gate.next = f[0] + 1;
    state = s;
    history.push(s);
    if (hashDue(s.tick)) send({ t: 'hash', tick: s.tick, h: stateHash(s) });
  }

  async function onCatchup(m: Extract<PvpServerMessage, { t: 'catchup' }>): Promise<void> {
    queue = queue ?? [];
    await new Promise((r) => setTimeout(r, 0)); // nhường để UI vẽ "Đang vào lại…"
    state = rebuild(m.setup, m.log);
    history.reset();
    history.push(state);
    gate.resumeAt(state.tick);
    const pending = queue;
    queue = null;
    for (const f of pending) applyFrame(f); // applyFrame tự bỏ khung đã có trong log
    send({ t: 'catchup_done' });
  }

  socket.onmessage = (ev) => {
    let parsed: PvpServerMessage;
    try {
      const r = PvpServerMessage.safeParse(JSON.parse(String(ev.data)));
      if (!r.success) return;
      parsed = r.data;
    } catch {
      return;
    }
    if (parsed.t === 'matched') {
      side = parsed.side;
      pvpId = parsed.pvpId;
      state = createMatch(parsed.setup);
      history.reset();
      history.push(state);
      gate.next = 0;
      lastInput = 0;
    } else if (parsed.t === 'f') {
      if (queue) queue.push(parsed.f);
      else applyFrame(parsed.f);
    } else if (parsed.t === 'catchup') {
      void onCatchup(parsed);
    }
    opts.onMessage?.(parsed);
  };
  socket.onclose = () => opts.onClose?.();

  return {
    get side() {
      return side;
    },
    get pvpId() {
      return pvpId;
    },
    get rebuilding() {
      return queue !== null;
    },
    state: () => state,
    delayFrames: () => jitter.delayFrames(),
    display(dtSec) {
      if (!state || queue) return null;
      const c = cursor.advance(dtSec, history.latestTick(), jitter.delayFrames());
      return displayPair(history, c);
    },
    send,
    sendInput(code) {
      if (!shouldSendInput(lastInput, code)) return;
      lastInput = code;
      send({ t: 'input', c: code });
    },
    releaseInput() {
      this.sendInput(0);
    },
    close: () => socket.close(),
  };
}
