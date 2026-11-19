/**
 * Log input + chạy lại trận (SEC-07, ADR-0011). Client ghi input THEO TICK và lệnh thay người; server
 * dựng lại `MatchSetup` từ dữ liệu đã lưu rồi `replayMatch` để tự tính tỉ số, không tin số client báo.
 *
 * Mã hoá nhị phân rồi base64url: [số đoạn] + mỗi đoạn [số tick, mã input] (run-length, varint) + [số lượt
 * thay] + mỗi lượt [tick, ô người ra, ô dự bị]. Mã input = nút·9 + hướng (hướng 0 = đứng yên, 1–8 = 8
 * hướng bàn phím); `move` không phải 8 hướng chuẩn thì không ghi được (ném lỗi) — không có nguồn nào khác.
 */
import { SquadSlot, type Difficulty, type MatchTeamSetup } from '@pitch/shared';
import { createMatch, step } from './match';
import { substitute, MAX_SUBS } from './rules/substitution';
import { TICK_RATE } from './tick';
import { NO_INPUT, type MatchPhase, type MatchSetup, type PlayerInput } from './types';

/** Trần tick của log: gấp 3 lần 2 hiệp chính thức (đo 40 trận: dài nhất 27.352 tick kể cả luân lưu). */
export const MAX_LOG_TICKS = 3 * 2 * 180 * TICK_RATE;

/** Dữ liệu một trận mà server đã lưu và client được biết (`StartedMatch`). */
export interface MatchSource {
  seed: number;
  difficulty: Difficulty;
  home: MatchTeamSetup;
  away: MatchTeamSetup;
}

/**
 * Dựng `MatchSetup` duy nhất cho web và server. Server luôn gọi không có `dev`; chỉ web ở chế độ test
 * (`?half=`, `?autopilot=1`) và server test (env) mới truyền `dev`.
 */
export function buildMatchSetup(
  src: MatchSource,
  dev: { halfLengthSec?: number | undefined; autopilot?: boolean | undefined } = {},
): MatchSetup {
  return {
    home: src.home,
    away: src.away,
    seed: src.seed,
    difficulty: src.difficulty,
    ...(dev.halfLengthSec !== undefined && { halfLengthSec: dev.halfLengthSec }),
    ...(dev.autopilot && { autopilot: true }),
  };
}

const DIRS = [
  [0, 0],
  [0, -1],
  [1, -1],
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
] as const;

const DIR_MOVES = DIRS.map(([dx, dy]) => {
  const len = Math.sqrt(dx * dx + dy * dy);
  return len > 0 ? { x: dx / len, y: dy / len } : NO_INPUT.move;
});

/** Vector `move` chuẩn của hướng bàn phím (dx, dy ∈ {−1, 0, 1}); chéo chuẩn hoá bằng sqrt (tất định). */
export function dirMove(dx: number, dy: number): { x: number; y: number } {
  return DIR_MOVES[DIRS.findIndex(([x, y]) => x === dx && y === dy)]!;
}

const BUTTONS = [
  'pass',
  'lob',
  'shoot',
  'sprint',
  'switch',
  'through',
  'modifier',
  'finesse',
  'adjust',
] as const;
const CODE_LIMIT = 9 << BUTTONS.length;

export function encodeInput(input: PlayerInput): number {
  const dir = DIR_MOVES.findIndex((m) => m.x === input.move.x && m.y === input.move.y);
  if (dir < 0) throw new RangeError('move không phải 8 hướng chuẩn, không ghi được vào log');
  let bits = 0;
  BUTTONS.forEach((b, i) => {
    if (input[b]) bits |= 1 << i;
  });
  return bits * 9 + dir;
}

export function decodeInput(code: number): PlayerInput {
  const bits = Math.floor(code / 9);
  const flags = Object.fromEntries(BUTTONS.map((b, i) => [b, (bits & (1 << i)) !== 0]));
  return { ...NO_INPUT, ...flags, move: DIR_MOVES[code % 9]! };
}

export interface InputLog {
  /** Đoạn run-length [số tick, mã input]. */
  runs: [number, number][];
  /** Thay người đội nhà, áp trước `step` của tick `tick` (khi `state.tick === tick`). */
  subs: { tick: number; out: SquadSlot; bench: SquadSlot }[];
}

/** Log hỏng / quá dài / không khớp trận. */
export class ReplayLogError extends Error {}

/** Ghi log trong lúc chơi (web): `tick(input)` ngay trước mỗi `step`, `sub` ngay sau `substitute` thành công. */
export class InputRecorder {
  private log: InputLog = { runs: [], subs: [] };
  private ticks = 0;

  reset(): void {
    this.log = { runs: [], subs: [] };
    this.ticks = 0;
  }

  tick(input: PlayerInput): void {
    if (this.ticks >= MAX_LOG_TICKS) return;
    this.ticks++;
    const code = encodeInput(input);
    const last = this.log.runs[this.log.runs.length - 1];
    if (last && last[1] === code) last[0]++;
    else this.log.runs.push([1, code]);
  }

  /** `outId` dạng `home-<ô>` (id sim); id lạ bị bỏ qua vì sim cũng không bao giờ chấp nhận. */
  sub(tick: number, outId: string, bench: SquadSlot): void {
    const out = SquadSlot.safeParse(outId.replace(/^home-/, ''));
    if (out.success) this.log.subs.push({ tick, out: out.data, bench });
  }

  encode(): string {
    return encodeLog(this.log);
  }
}

const SLOTS = SquadSlot.options;
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function toBase64Url(bytes: number[]): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]!;
    if (i + 1 < bytes.length) out += B64[(n >> 6) & 63]!;
    if (i + 2 < bytes.length) out += B64[n & 63]!;
  }
  return out;
}

function fromBase64Url(text: string): number[] {
  if (text.length % 4 === 1) throw new ReplayLogError('Log sai độ dài base64');
  const bytes: number[] = [];
  let acc = 0;
  let nbits = 0;
  for (const ch of text) {
    const v = B64.indexOf(ch);
    if (v < 0) throw new ReplayLogError('Log có ký tự không hợp lệ');
    acc = (acc << 6) | v;
    nbits += 6;
    if (nbits >= 8) {
      nbits -= 8;
      bytes.push((acc >> nbits) & 255);
      acc &= (1 << nbits) - 1;
    }
  }
  return bytes;
}

function pushVarint(out: number[], n: number): void {
  while (n >= 128) {
    out.push((n & 127) | 128);
    n = Math.floor(n / 128);
  }
  out.push(n);
}

export function encodeLog(log: InputLog): string {
  const out: number[] = [];
  pushVarint(out, log.runs.length);
  for (const [ticks, code] of log.runs) {
    pushVarint(out, ticks);
    pushVarint(out, code);
  }
  pushVarint(out, log.subs.length);
  for (const s of log.subs) {
    pushVarint(out, s.tick);
    out.push(SLOTS.indexOf(s.out), SLOTS.indexOf(s.bench));
  }
  return toBase64Url(out);
}

/** Giải mã và kiểm: tổng tick ≤ `MAX_LOG_TICKS`, mã input hợp lệ, không thừa byte. Sai → `ReplayLogError`. */
export function decodeLog(text: string): InputLog & { totalTicks: number } {
  const bytes = fromBase64Url(text);
  let pos = 0;
  const varint = (): number => {
    let n = 0;
    let unit = 1;
    for (let i = 0; i < 5; i++) {
      const b = bytes[pos++];
      if (b === undefined) throw new ReplayLogError('Log bị cụt');
      n += (b & 127) * unit;
      if (b < 128) return n;
      unit *= 128;
    }
    throw new ReplayLogError('Log có số quá lớn');
  };
  const nRuns = varint();
  if (nRuns > MAX_LOG_TICKS) throw new ReplayLogError('Log có quá nhiều đoạn');
  const runs: [number, number][] = [];
  let totalTicks = 0;
  for (let i = 0; i < nRuns; i++) {
    const ticks = varint();
    const code = varint();
    totalTicks += ticks;
    if (ticks < 1 || code >= CODE_LIMIT || totalTicks > MAX_LOG_TICKS) {
      throw new ReplayLogError('Log có đoạn không hợp lệ');
    }
    runs.push([ticks, code]);
  }
  const nSubs = varint();
  if (nSubs > MAX_SUBS) throw new ReplayLogError('Log có quá nhiều lượt thay người');
  const subs: InputLog['subs'] = [];
  for (let i = 0; i < nSubs; i++) {
    const tick = varint();
    const out = SLOTS[bytes[pos++] ?? -1];
    const bench = SLOTS[bytes[pos++] ?? -1];
    if (!out || !bench || tick > totalTicks || tick < (subs[i - 1]?.tick ?? 0)) {
      throw new ReplayLogError('Lượt thay người không hợp lệ');
    }
    subs.push({ tick, out, bench });
  }
  if (pos !== bytes.length) throw new ReplayLogError('Log thừa dữ liệu');
  return { runs, subs, totalTicks };
}

export interface ReplayResult {
  score: { home: number; away: number };
  /** Số bàn luân lưu mỗi đội; chỉ có khi trận phải đá luân lưu. */
  shootout?: { home: number; away: number };
  phase: MatchPhase;
  /** Số tick đã chạy tới lúc dừng (hết trận hoặc hết log). */
  ticks: number;
}

/** Chạy lại trận từ `setup` + log; dừng ở `full_time` (phần log thừa phía sau bị bỏ qua). */
export function replayMatch(setup: MatchSetup, encoded: string): ReplayResult {
  const log = decodeLog(encoded);
  let s = createMatch(setup);
  let nextSub = 0;
  done: for (const [ticks, code] of log.runs) {
    const input = decodeInput(code);
    for (let i = 0; i < ticks; i++) {
      while (log.subs[nextSub]?.tick === s.tick) {
        const sub = log.subs[nextSub++]!;
        const r = substitute(s, 'home', `home-${sub.out}`, sub.bench);
        if (!r.ok) throw new ReplayLogError(`Thay người bị từ chối: ${r.reason}`);
        s = r.state;
      }
      if (s.phase === 'full_time') break done;
      s = step(s, input);
    }
  }
  const sh = s.shootout;
  const goals = (kicks: boolean[]) => kicks.filter(Boolean).length;
  return {
    score: { ...s.score },
    ...(sh && { shootout: { home: goals(sh.home), away: goals(sh.away) } }),
    phase: s.phase,
    ticks: s.tick,
  };
}
