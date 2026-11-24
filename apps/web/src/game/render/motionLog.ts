/**
 * Công cụ soi chuyển động (review C5): ghi những gì người xem thấy ở từng khung hình rồi tìm chỗ
 * giật — cầu thủ xoay qua lại, đổi hướng qua lại, nhảy cóc, animation nhấp nháy, camera rung, khựng khung.
 * Ghi bật bằng `?motion=1`; phân tích chạy trong Node (`e2e/motion.spec.ts`) hoặc vitest.
 */

/** Một khung hình đã vẽ. Toạ độ Three: x, z mặt sân (m), y cao; `rot` = rotation.y (rad). */
export interface MotionFrame {
  /** Giờ tường (ms, Date.now) — chỉ để khớp video (lệch vài ms, không dùng tính tốc độ: dùng `ms`). */
  t: number;
  /** Thời gian khung hình (ms) đo bằng requestAnimationFrame. */
  ms: number;
  tick: number;
  phase: string;
  /** live = trận chạy, hold = giữ cảnh / chuyển cảnh, replay = phát lại. */
  mode: 'live' | 'hold' | 'replay';
  /** Màn chuyển cảnh đang che sân (vị trí nhảy lúc này người xem không thấy). */
  covered: boolean;
  cam: [number, number, number];
  ball: [number, number, number];
  /** id → [x, z, rot, clip]. */
  players: Record<string, [number, number, number, string]>;
}

export interface MotionLog {
  frames: MotionFrame[];
}

export const motionEnabled = (search: string): boolean =>
  new URLSearchParams(search).get('motion') === '1';

const r3 = (n: number): number => Math.round(n * 1000) / 1000;

/** Bộ ghi: giữ tối đa `max` khung (mặc định ~10 phút ở 60 FPS) để không ăn hết RAM. */
export class MotionRecorder implements MotionLog {
  readonly frames: MotionFrame[] = [];
  constructor(private readonly max = 36_000) {}

  record(f: MotionFrame): void {
    if (this.frames.length >= this.max) return;
    const players: MotionFrame['players'] = {};
    for (const [id, [x, z, rot, clip]] of Object.entries(f.players))
      players[id] = [r3(x), r3(z), r3(rot), clip];
    this.frames.push({
      ...f,
      ms: r3(f.ms),
      cam: f.cam.map(r3) as MotionFrame['cam'],
      ball: f.ball.map(r3) as MotionFrame['ball'],
      players,
    });
  }
}

// ---------- Phân tích ----------

export type IssueKind =
  | 'teleport' // cầu thủ / bóng nhảy cóc khi người xem đang thấy
  | 'zigzag' // đổi hướng chạy qua lại liên tục
  | 'spin' // thân xoay qua lại (lắc) trong khi gần như đứng yên
  | 'clip_flicker' // clip animation đổi A→B→A rất nhanh
  | 'camera_shake' // camera đổi chiều qua lại
  | 'hitch'; // khung hình khựng

export interface MotionIssue {
  kind: IssueKind;
  /** Cầu thủ (hoặc 'ball' / 'camera' / 'frame'). */
  who: string;
  /** Giờ tường (ms) đầu / cuối đoạn nghi. */
  from: number;
  to: number;
  tick: number;
  phase: string;
  /** Giá trị đo được (đơn vị theo `kind`, xem `detail`). */
  value: number;
  detail: string;
}

/** Ngưỡng mặc định — người dùng xem clip rồi chỉnh (C5 bước "chốt ngưỡng"). */
export const DEFAULT_THRESHOLDS = {
  /** Tốc độ vẽ tối đa (m/s): cầu thủ sim ≤ ~10 m/s, bóng sút ≤ ~35 m/s. */
  playerTeleportMps: 16,
  ballTeleportMps: 45,
  /** Cửa sổ (ms) và số lần đảo chiều tối thiểu để coi là zigzag/lắc/rung. */
  windowMs: 1000,
  zigzagReversals: 4,
  /** Chỉ tính đảo chiều khi cầu thủ đi thật (m/s) — đứng chỉnh vị trí thì bỏ qua. */
  zigzagMinSpeed: 1.5,
  spinReversals: 4,
  /** Biên độ xoay tối thiểu mỗi lần đảo chiều (rad). */
  spinMinSwing: 0.35,
  /** Clip A→B→A trong khoảng này (ms) là nhấp nháy. */
  clipFlickerMs: 300,
  cameraReversals: 6,
  /** Bỏ qua dao động camera nhỏ hơn (m/khung). */
  cameraMinStep: 0.01,
  /** Khung > max(hitchMs, hitchFactor × trung vị) là khựng. */
  hitchMs: 50,
  hitchFactor: 2.5,
};
export type MotionThresholds = typeof DEFAULT_THRESHOLDS;

/** Hai khung liền nhau mà người xem thấy chuyển động liên tục (cùng chế độ, không che, cùng pha). */
const continuous = (a: MotionFrame, b: MotionFrame): boolean =>
  a.mode === b.mode && !a.covered && !b.covered && a.phase === b.phase && b.ms > 0;

const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

/** Đếm đảo chiều của một dãy giá trị có dấu trong cửa sổ trượt; trả các đoạn vượt ngưỡng. */
function reversalRuns(
  frames: MotionFrame[],
  sample: (i: number) => number | null,
  minReversals: number,
  windowMs: number,
): { from: number; to: number; count: number; at: number }[] {
  const flips: number[] = []; // chỉ số khung có đảo chiều
  let lastSign = 0;
  for (let i = 1; i < frames.length; i++) {
    if (!continuous(frames[i - 1]!, frames[i]!)) {
      lastSign = 0;
      continue;
    }
    const v = sample(i);
    if (v === null || v === 0) continue;
    const s = Math.sign(v);
    if (lastSign !== 0 && s !== lastSign) flips.push(i);
    lastSign = s;
  }
  const runs: { from: number; to: number; count: number; at: number }[] = [];
  let start = 0;
  for (let end = 0; end < flips.length; end++) {
    while (frames[flips[end]!]!.t - frames[flips[start]!]!.t > windowMs) start++;
    const count = end - start + 1;
    if (count < minReversals) continue;
    const from = frames[flips[start]!]!.t;
    const to = frames[flips[end]!]!.t;
    const last = runs[runs.length - 1];
    // Gộp các cửa sổ chồng nhau thành một đoạn.
    if (last && from <= last.to) {
      last.to = to;
      last.count = Math.max(last.count, count);
    } else runs.push({ from, to, count, at: flips[start]! });
  }
  return runs;
}

/** Quét toàn bộ log, trả danh sách đoạn nghi (sắp theo thời gian). */
export function analyzeMotion(
  log: MotionLog,
  th: MotionThresholds = DEFAULT_THRESHOLDS,
): MotionIssue[] {
  const f = log.frames;
  const out: MotionIssue[] = [];
  const issue = (
    kind: IssueKind,
    who: string,
    i: number,
    to: number,
    value: number,
    detail: string,
  ) =>
    out.push({ kind, who, from: f[i]!.t, to, tick: f[i]!.tick, phase: f[i]!.phase, value, detail });

  // Khựng khung: so với trung vị cả trận.
  const sorted = f
    .map((x) => x.ms)
    .filter((x) => x > 0)
    .sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 16.7;
  const hitch = Math.max(th.hitchMs, th.hitchFactor * median);
  f.forEach((x, i) => {
    if (x.ms > hitch)
      issue(
        'hitch',
        'frame',
        i,
        x.t,
        x.ms,
        `khung ${x.ms.toFixed(0)} ms (trung vị ${median.toFixed(1)})`,
      );
  });

  // Nhảy cóc: bóng và từng cầu thủ.
  for (let i = 1; i < f.length; i++) {
    const a = f[i - 1]!;
    const b = f[i]!;
    if (!continuous(a, b)) continue;
    const sec = b.ms / 1000;
    const bs = Math.hypot(b.ball[0] - a.ball[0], b.ball[2] - a.ball[2]) / sec;
    if (bs > th.ballTeleportMps) issue('teleport', 'ball', i, b.t, bs, `bóng ${bs.toFixed(1)} m/s`);
    for (const [id, p] of Object.entries(b.players)) {
      const q = a.players[id];
      if (!q) continue;
      const s = Math.hypot(p[0] - q[0], p[1] - q[1]) / sec;
      if (s > th.playerTeleportMps) issue('teleport', id, i, b.t, s, `${s.toFixed(1)} m/s`);
    }
  }

  const ids = new Set(f.flatMap((x) => Object.keys(x.players)));
  for (const id of ids) {
    const pos = (i: number) => f[i]?.players[id];
    // Zigzag: đảo chiều vận tốc theo trục ngang hoặc dọc sân khi đang chạy.
    for (const axis of [0, 1] as const) {
      const runs = reversalRuns(
        f,
        (i) => {
          const p = pos(i);
          const q = pos(i - 1);
          if (!p || !q) return null;
          const sec = f[i]!.ms / 1000;
          if (Math.hypot(p[0] - q[0], p[1] - q[1]) / sec < th.zigzagMinSpeed) return null;
          return p[axis] - q[axis];
        },
        th.zigzagReversals,
        th.windowMs,
      );
      for (const r of runs)
        issue(
          'zigzag',
          id,
          r.at,
          r.to,
          r.count,
          `${r.count} lần đảo chiều trục ${axis === 0 ? 'x' : 'z'} / ${th.windowMs} ms`,
        );
    }
    // Lắc thân: đảo chiều xoay với biên độ đáng kể (gom dao động nhỏ thành một lượt).
    {
      let acc = 0;
      const swings: (number | null)[] = f.map(() => null);
      for (let i = 1; i < f.length; i++) {
        const p = pos(i);
        const q = pos(i - 1);
        if (!p || !q || !continuous(f[i - 1]!, f[i]!)) {
          acc = 0;
          continue;
        }
        const d = wrap(p[2] - q[2]);
        if (acc !== 0 && Math.sign(d) !== Math.sign(acc)) {
          if (Math.abs(acc) >= th.spinMinSwing) swings[i] = acc;
          acc = d;
        } else acc += d;
      }
      // Mỗi lượt xoay đủ lớn mang dấu của nó; đảo dấu giữa các lượt liền nhau = một lần lắc.
      const runs = reversalRuns(f, (i) => swings[i] ?? null, th.spinReversals, th.windowMs);
      for (const r of runs)
        issue(
          'spin',
          id,
          r.at,
          r.to,
          r.count,
          `${r.count} lượt xoay qua lại ≥ ${th.spinMinSwing} rad / ${th.windowMs} ms`,
        );
    }
    // Clip nhấp nháy: A → B → A nhanh.
    let prevClip = '';
    let prevChangeT = -Infinity;
    let beforeClip = '';
    for (let i = 0; i < f.length; i++) {
      const p = pos(i);
      if (!p) continue;
      const clip = p[3];
      if (clip === prevClip) continue;
      const t = f[i]!.t;
      if (clip === beforeClip && t - prevChangeT < th.clipFlickerMs && f[i]!.mode !== 'hold')
        issue(
          'clip_flicker',
          id,
          i,
          t,
          t - prevChangeT,
          `${beforeClip} → ${prevClip} → ${clip} trong ${(t - prevChangeT).toFixed(0)} ms`,
        );
      beforeClip = prevClip;
      prevClip = clip;
      prevChangeT = t;
    }
  }

  // Camera rung: đảo chiều chuyển động theo từng trục.
  for (const axis of [0, 1, 2] as const) {
    const runs = reversalRuns(
      f,
      (i) => {
        const d = f[i]!.cam[axis] - f[i - 1]!.cam[axis];
        return Math.abs(d) < th.cameraMinStep ? null : d;
      },
      th.cameraReversals,
      th.windowMs,
    );
    for (const r of runs)
      issue(
        'camera_shake',
        'camera',
        r.at,
        r.to,
        r.count,
        `${r.count} lần đảo chiều trục ${'xyz'[axis]} / ${th.windowMs} ms`,
      );
  }

  return out.sort((a, b) => a.from - b.from);
}

/** Gộp các đoạn nghi gần nhau (≤ gapMs) để cắt clip: mỗi đoạn một clip. */
export function clipWindows(
  issues: readonly MotionIssue[],
  padMs = 1500,
  gapMs = 1000,
): { from: number; to: number; issues: MotionIssue[] }[] {
  const out: { from: number; to: number; issues: MotionIssue[] }[] = [];
  for (const i of [...issues].sort((a, b) => a.from - b.from)) {
    const last = out[out.length - 1];
    if (last && i.from - padMs <= last.to + gapMs) {
      last.to = Math.max(last.to, i.to + padMs);
      last.issues.push(i);
    } else out.push({ from: i.from - padMs, to: i.to + padMs, issues: [i] });
  }
  return out;
}

// ---------- So sánh hai bên PvP ----------

export interface PvpCompare {
  /** Số tick có mặt ở cả hai log. */
  ticks: number;
  /** Lệch vị trí cầu thủ (m) cùng tick: p95, max, số (tick, cầu thủ) vượt `posTol`, ví dụ tệ nhất. */
  pos: { p95: number; max: number; over: number; worst: string };
  /** Camera: trung điểm hai camera (x,z) phải trùng điểm nhìn (≈ bóng); `y` lệch độ cao hai bên. */
  cam: { midToBallP95: number; yDiffMax: number; flipOk: boolean };
}

const lastPerTick = (log: MotionLog): Map<number, MotionFrame> => {
  const m = new Map<number, MotionFrame>();
  for (const f of log.frames) m.set(f.tick, f); // khung cuối của tick (alpha gần 1)
  return m;
};

/**
 * Đội nhà vs đội khách cùng một trận lockstep: vị trí cầu thủ cùng tick phải gần nhau (sai số do nội suy
 * khung vẽ, `posTol`), camera khách = camera nhà lật 180° quanh điểm nhìn (`flipCamera`) nên trung điểm
 * x,z của hai camera nằm gần bóng (`camTol` m) và cùng độ cao.
 */
export function compareMotion(
  home: MotionLog,
  away: MotionLog,
  posTol = 0.6,
  camTol = 12,
): PvpCompare {
  const h = lastPerTick(home);
  const a = lastPerTick(away);
  const diffs: number[] = [];
  const mids: number[] = [];
  let over = 0;
  let max = 0;
  let worst = '—';
  let yMax = 0;
  let ticks = 0;
  for (const [tick, fh] of h) {
    const fa = a.get(tick);
    if (!fa) continue;
    ticks++;
    for (const [id, p] of Object.entries(fh.players)) {
      const q = fa.players[id];
      if (!q) continue;
      const d = Math.hypot(p[0] - q[0], p[1] - q[1]);
      diffs.push(d);
      if (d > posTol) over++;
      if (d > max) {
        max = d;
        worst = `${id} tick ${tick} (${d.toFixed(2)} m)`;
      }
    }
    mids.push(
      Math.hypot(
        (fh.cam[0] + fa.cam[0]) / 2 - fh.ball[0],
        (fh.cam[2] + fa.cam[2]) / 2 - fh.ball[2],
      ),
    );
    yMax = Math.max(yMax, Math.abs(fh.cam[1] - fa.cam[1]));
  }
  const p95 = (xs: number[]) => [...xs].sort((x, y) => x - y)[Math.floor(xs.length * 0.95)] ?? 0;
  const midP95 = p95(mids);
  return {
    ticks,
    pos: { p95: p95(diffs), max, over, worst },
    cam: {
      midToBallP95: midP95,
      yDiffMax: yMax,
      flipOk: ticks > 0 && midP95 <= camTol && yMax < 0.5,
    },
  };
}
