/**
 * Client WS PvP lockstep (T022, T034). Không phụ thuộc React/DOM: nhận một socket (WebSocket thật hoặc giả).
 * `stepBoth` + `hash` chạy ngay trong `onmessage` để tab ẩn vẫn theo kịp (research R2); vòng vẽ chỉ
 * gọi `display()`. T034 bổ sung tự kết nối lại, thử `rejoin` lại mỗi 2 s khi `busy`, phát hiện
 * tụt > 300 khung, đo thời gian dựng lại và watchdog 5 s không nhận khung.
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
  onopen?: ((ev?: unknown) => void) | null;
}

export const LAG_REJOIN_FRAMES = 300;
export const BUSY_RETRY_MS = 2000;
export const REJOIN_DEADLINE_MS = 30_000;
export const FRAME_WATCHDOG_MS = 5000;
export const RECONNECT_BACKOFF_MS = [500, 1000, 2000, 4000] as const;
/** Ở sảnh: bỏ cuộc sau chừng này lần nối thất bại liên tiếp (hiện nút Thử lại). */
export const MAX_LOBBY_FAILURES = 5;
/** Socket mở rồi đóng sớm hơn mức này với mã 4xxx (server từ chối) không tính là kết nối tốt. */
export const HEALTHY_OPEN_MS = 3000;

export interface NetMatchOptions {
  socket: NetSocket;
  now?: () => number;
  /** Mọi tin hợp lệ từ server (kể cả `f`/`catchup`) để lớp trên xử lý sảnh, `end`, `opp_*`, `error`. */
  onMessage?: (msg: PvpServerMessage) => void;
  /** Hụt khung / tụt quá 300 khung: xin `catchup` qua `rejoin`. */
  onGap?: () => void;
  /** `code`: mã đóng của WebSocket (nếu có). */
  onClose?: (code?: number) => void;
  onRebuildStart?: () => void;
  onRebuildDone?: (durationMs: number) => void;
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
  /** State đã nhận ở `tick` (kẹp về khoảng còn giữ), để vòng vẽ xét sự kiện của tick bị nhảy qua. */
  stateAt(tick: number): MatchState | null;
  send(msg: PvpClientMessage): void;
  /** Gửi `input` chỉ khi mã đổi. */
  sendInput(code: number): void;
  /** Tab ẩn / mất focus: gửi ngay c=0 (nếu đang khác 0). */
  releaseInput(): void;
  /** Vào lại trận xong (`catchup`): gửi lại phím đang giữ — input gửi lúc chưa mở/đang rejoin có thể bị bỏ. */
  resendInput(): void;
  /** Đổi sang socket mới khi tự kết nối lại (giữ nguyên state, gate, history). */
  swapSocket(socket: NetSocket): void;
  close(): void;
}

export function createNetMatch(opts: NetMatchOptions): NetMatch {
  let socket = opts.socket;
  const now = opts.now ?? (() => performance.now());
  const rebuild = opts.rebuild ?? ((setup, log) => replayToState(setup, log));
  const jitter = new JitterEstimator();
  const gate = new FrameGate(0);
  const history = new StateHistory();
  const cursor = new DisplayCursor();
  let side: 'home' | 'away' | null = null;
  let pvpId: number | null = null;
  let state: MatchState | null = null;
  let queue: [number, number, number, PvpSub[]?][] | null = null; // != null: đang dựng lại
  let lastInput = 0;
  let wantedInput = 0;
  let gapRequested = false;

  // WebSocket.send ném InvalidStateError khi còn CONNECTING (lúc tự kết nối lại): bỏ tin, báo false.
  const send = (msg: PvpClientMessage): boolean => {
    try {
      socket.send(JSON.stringify(msg));
      return true;
    } catch {
      return false;
    }
  };

  function applyFrame(f: [number, number, number, PvpSub[]?]): void {
    if (!state) return;
    if (f[0] - gate.next > LAG_REJOIN_FRAMES) {
      if (!gapRequested) {
        gapRequested = true;
        opts.onGap?.();
      }
      return;
    }
    const verdict = gate.classify(f[0]);
    if (verdict === 'drop') return;
    if (verdict === 'gap') {
      if (!gapRequested) {
        gapRequested = true;
        opts.onGap?.();
      }
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
    gapRequested = false;
    opts.onRebuildStart?.();
    await new Promise((r) => setTimeout(r, 0)); // nhường để UI vẽ "Đang vào lại…"
    const t0 = now();
    state = rebuild(m.setup, m.log);
    const elapsedMs = Math.max(0, now() - t0);
    if (elapsedMs > 3000) {
      console.warn(`[pvp] Dựng lại catchup mất ${Math.round(elapsedMs)} ms (> 3000 ms)`);
    }
    history.reset();
    history.push(state);
    gate.resumeAt(state.tick);
    const pending = queue;
    queue = null;
    for (const f of pending) applyFrame(f); // applyFrame tự bỏ khung đã có trong log
    send({ t: 'catchup_done' });
    opts.onRebuildDone?.(elapsedMs);
  }

  const handleMessage = (ev: { data: unknown }) => {
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
      gapRequested = false;
    } else if (parsed.t === 'f') {
      if (queue) queue.push(parsed.f);
      else applyFrame(parsed.f);
    } else if (parsed.t === 'catchup') {
      void onCatchup(parsed);
    }
    opts.onMessage?.(parsed);
  };

  const handleClose = (ev: unknown) =>
    opts.onClose?.((ev as { code?: number } | null | undefined)?.code);

  function attach(sock: NetSocket): void {
    sock.onmessage = handleMessage;
    sock.onclose = handleClose;
  }

  attach(socket);

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
    stateAt: (tick) => history.at(tick),
    display(dtSec) {
      if (!state || queue) return null;
      const c = cursor.advance(dtSec, history.latestTick(), jitter.delayFrames());
      return displayPair(history, c);
    },
    send,
    sendInput(code) {
      wantedInput = code;
      if (!shouldSendInput(lastInput, code)) return;
      if (send({ t: 'input', c: code })) lastInput = code;
    },
    releaseInput() {
      this.sendInput(0);
    },
    resendInput() {
      lastInput = -1; // ép gửi: server có thể đã bỏ input trước khi rejoin thành công (busy)
      this.sendInput(wantedInput);
    },
    swapSocket(next) {
      socket.onmessage = null;
      socket.onclose = null;
      socket.onopen = null;
      socket = next;
      lastInput = 0;
      attach(socket);
    },
    close: () => socket.close(),
  };
}

export interface PvpClientStatus {
  connected: boolean;
  reconnecting: boolean;
  busyRetrying: boolean;
  rebuilding: boolean;
  rebuildSlowMs: number | null;
  /** Ở sảnh: đã thôi tự nối lại sau `MAX_LOBBY_FAILURES` lần thất bại; UI hiện nút Thử lại. */
  gaveUp: boolean;
}

export interface TimerApi {
  setTimeout(fn: () => void, ms: number): ReturnType<typeof setTimeout>;
  clearTimeout(id: ReturnType<typeof setTimeout>): void;
  setInterval(fn: () => void, ms: number): ReturnType<typeof setInterval>;
  clearInterval(id: ReturnType<typeof setInterval>): void;
}

export interface PvpClientOptions {
  connect: () => NetSocket;
  now?: () => number;
  timers?: TimerApi;
  onMessage?: (msg: PvpServerMessage) => void;
  onStatus?: (status: PvpClientStatus) => void;
  rebuild?: (setup: PvpMatchSetup, log: string) => MatchState;
}

export interface PvpClient {
  readonly net: NetMatch;
  send(msg: PvpClientMessage): void;
  dispose(): void;
}

/**
 * Lớp điều phối kết nối WS PvP: tự kết nối lại theo backoff, gửi `rejoin`, thử lại mỗi 2 s khi
 * `error busy` (tới hạn 30 s), dừng khi nhận `end`, và watchdog 5 s không nhận khung (R12).
 */
export function createPvpClient(opts: PvpClientOptions): PvpClient {
  const now = opts.now ?? (() => performance.now());
  const timers: TimerApi = opts.timers ?? {
    setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
    clearTimeout: (id) => globalThis.clearTimeout(id),
    setInterval: (fn, ms) => globalThis.setInterval(fn, ms),
    clearInterval: (id) => globalThis.clearInterval(id),
  };

  let disposed = false;
  let connected = false;
  let reconnecting = false;
  let busyRetrying = false;
  let rebuilding = false;
  let rebuildSlowMs: number | null = null;
  let inMatch = false;
  let matchRunning = false;
  let matchEnded = false;
  let rejoining = false;
  let disconnectAt: number | null = null;
  let reconnectAttempt = 0;
  let lastFrameAt = 0;
  let gaveUp = false;
  let lobbyFailures = 0;
  let openedAt: number | null = null;

  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let busyTimer: ReturnType<typeof setTimeout> | null = null;

  const emitStatus = () => {
    opts.onStatus?.({
      connected,
      reconnecting,
      busyRetrying,
      rebuilding,
      rebuildSlowMs,
      gaveUp,
    });
  };

  const clearTimers = () => {
    if (reconnectTimer !== null) {
      timers.clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (busyTimer !== null) {
      timers.clearTimeout(busyTimer);
      busyTimer = null;
    }
  };

  let currentSocket = opts.connect();

  const sendRejoin = () => {
    const id = net.pvpId;
    if (id === null || matchEnded || disposed) return;
    rejoining = true;
    net.send({ t: 'rejoin', pvpId: id });
  };

  const scheduleReconnect = () => {
    if (disposed || matchEnded || reconnectTimer !== null) return;
    reconnecting = true;
    if (inMatch && disconnectAt === null) disconnectAt = now();
    const delay =
      RECONNECT_BACKOFF_MS[Math.min(reconnectAttempt, RECONNECT_BACKOFF_MS.length - 1)]!;
    reconnectAttempt++;
    emitStatus();
    reconnectTimer = timers.setTimeout(() => {
      reconnectTimer = null;
      if (disposed || matchEnded) return;
      const next = opts.connect();
      currentSocket = next;
      net.swapSocket(next);
      wireOpen(next);
    }, delay);
  };

  const net = createNetMatch({
    socket: currentSocket,
    now,
    ...(opts.rebuild && { rebuild: opts.rebuild }),
    onGap: () => {
      if (disposed || !inMatch || matchEnded || net.rebuilding || !connected) return;
      sendRejoin();
    },
    onRebuildStart: () => {
      rebuilding = true;
      rejoining = false;
      busyRetrying = false;
      if (busyTimer !== null) {
        timers.clearTimeout(busyTimer);
        busyTimer = null;
      }
      emitStatus();
    },
    onRebuildDone: (durationMs) => {
      rebuilding = false;
      rebuildSlowMs = durationMs > 3000 ? durationMs : null;
      lastFrameAt = now();
      emitStatus();
    },
    onMessage: (m) => {
      if (m.t === 'matched') {
        inMatch = true;
        matchEnded = false;
        matchRunning = false;
        rejoining = false;
        busyRetrying = false;
        disconnectAt = null;
        rebuildSlowMs = null;
      } else if (m.t === 'start') {
        matchRunning = true;
        lastFrameAt = now();
      } else if (m.t === 'f') {
        matchRunning = true;
        lastFrameAt = now();
      } else if (m.t === 'catchup') {
        net.resendInput();
        rejoining = false;
        busyRetrying = false;
        disconnectAt = null;
        if (busyTimer !== null) {
          timers.clearTimeout(busyTimer);
          busyTimer = null;
        }
        emitStatus();
      } else if (m.t === 'end') {
        matchEnded = true;
        inMatch = false;
        matchRunning = false;
        rejoining = false;
        reconnecting = false;
        busyRetrying = false;
        disconnectAt = null;
        clearTimers();
        emitStatus();
      } else if (m.t === 'error' && m.code === 'not_in_match' && inMatch) {
        // Server không còn trận (mất sau crash): thôi rejoin, lớp trên đưa người chơi về sảnh (C3-08).
        inMatch = false;
        matchRunning = false;
        rejoining = false;
        busyRetrying = false;
        disconnectAt = null;
        if (busyTimer !== null) {
          timers.clearTimeout(busyTimer);
          busyTimer = null;
        }
        emitStatus();
      } else if (m.t === 'error' && m.code === 'busy' && rejoining && !matchEnded) {
        busyRetrying = true;
        emitStatus();
        const elapsed = disconnectAt === null ? 0 : now() - disconnectAt;
        if (elapsed + BUSY_RETRY_MS <= REJOIN_DEADLINE_MS && busyTimer === null) {
          busyTimer = timers.setTimeout(() => {
            busyTimer = null;
            if (!disposed && connected && !matchEnded && rejoining) sendRejoin();
          }, BUSY_RETRY_MS);
        }
      }
      opts.onMessage?.(m);
    },
    onClose: (code) => {
      connected = false;
      if (disposed || matchEnded) {
        reconnecting = false;
        emitStatus();
        return;
      }
      const lived = openedAt === null ? null : now() - openedAt;
      openedAt = null;
      const rejected = code !== undefined && code >= 4000 && code < 5000;
      // Kết nối tốt = đã mở và (không bị server từ chối bằng mã 4xxx ngay): mới đặt lại backoff.
      const healthy = lived !== null && !(rejected && lived < HEALTHY_OPEN_MS);
      if (healthy) {
        reconnectAttempt = 0;
        lobbyFailures = 0;
      } else if (!inMatch) {
        lobbyFailures++;
      }
      // Cả ở sảnh (C3-01): server đã bỏ phòng/hàng chờ, PvpPage xoá room/queue khi mất kết nối.
      // Ở sảnh nối hỏng liên tiếp thì dừng, chờ người chơi bấm Thử lại (F5); trong trận thì thử mãi.
      if (!inMatch && lobbyFailures >= MAX_LOBBY_FAILURES) {
        gaveUp = true;
        reconnecting = false;
        emitStatus();
        return;
      }
      scheduleReconnect();
    },
  });

  function wireOpen(sock: NetSocket): void {
    sock.onopen = () => {
      if (disposed) return;
      connected = true;
      reconnecting = false;
      openedAt = now();
      lastFrameAt = now();
      emitStatus();
      if (inMatch && !matchEnded && net.pvpId !== null) {
        sendRejoin();
      }
    };
  }

  wireOpen(currentSocket);

  // Watchdog 5 s: nếu trận đang chạy và không nhận được khung nào trong 5 s → tự đóng và kết nối lại (R12).
  const watchdog = timers.setInterval(() => {
    if (
      disposed ||
      !connected ||
      !inMatch ||
      !matchRunning ||
      matchEnded ||
      rebuilding ||
      reconnecting
    ) {
      return;
    }
    if (now() - lastFrameAt >= FRAME_WATCHDOG_MS) {
      currentSocket.close(4000);
      if (connected) {
        connected = false;
        reconnectAttempt = 0; // đã nhận khung được ≥ 5 s: kết nối tốt
        scheduleReconnect();
      }
    }
  }, 1000);

  return {
    net,
    send: (msg) => {
      if (msg.t === 'leave') {
        matchEnded = true;
        inMatch = false;
        clearTimers();
      }
      net.send(msg);
    },
    dispose: () => {
      disposed = true;
      clearTimers();
      timers.clearInterval(watchdog);
      currentSocket.onopen = null;
      net.close();
    },
  };
}
