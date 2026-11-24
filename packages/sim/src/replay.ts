/**
 * Log input + chạy lại trận (SEC-07, ADR-0011). Client ghi input THEO TICK và lệnh thay người; server
 * dựng lại `MatchSetup` từ dữ liệu đã lưu rồi `replayMatch` để tự tính tỉ số, không tin số client báo.
 *
 * Mã hoá nhị phân rồi base64url: [số đoạn] + mỗi đoạn [số tick, mã input] (run-length, varint) + [số lượt
 * thay] + mỗi lượt [tick, ô người ra, ô dự bị]. Mã input = nút·9 + hướng (hướng 0 = đứng yên, 1–8 = 8
 * hướng bàn phím); `move` không phải 8 hướng chuẩn thì không ghi được (ném lỗi) — không có nguồn nào khác.
 *
 * Định dạng v2 (PvP, hai đội người): tiền tố chuỗi `v2.` rồi cùng cách mã hoá, nhưng mỗi đoạn là
 * [số tick, mã home, mã away] và mỗi lượt thay là [tick, đội, ô người ra, ô dự bị]. v1 không có tiền tố
 * (bắt đầu bằng varint, không có "byte phiên bản" để dùng) và base64url không chứa dấu '.', nên
 * nhận biết v2 bằng tiền tố. Mỗi đội thay tối đa MAX_SUBS lượt.
 */
import { SquadSlot, type Difficulty, type MatchTeamSetup } from '@pitch/shared';
import { createMatch, stepBoth } from './match';
import { substitute, MAX_SUBS } from './rules/substitution';
import { TICK_RATE } from './tick';
import {
  NO_INPUT,
  type MatchPhase,
  type MatchSetup,
  type MatchState,
  type PlayerInput,
  type TeamInputs,
  type TeamSide,
} from './types';

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

/** Tiền tố nhận biết nhật ký v2. */
export const LOG_V2_PREFIX = 'v2.';

export interface InputLog2 {
  /** Đoạn run-length [số tick, mã input đội nhà, mã input đội khách]. */
  runs: [number, number, number][];
  /** Thay người của từng đội, áp trước `stepBoth` của tick `tick`. */
  subs: { tick: number; team: TeamSide; out: SquadSlot; bench: SquadSlot }[];
}

/** Ghi log v2 trong lúc chơi (server / client PvP): `tick(inputs)` ngay trước mỗi `stepBoth`. */
export class InputRecorder2 {
  private log: InputLog2 = { runs: [], subs: [] };
  private ticks = 0;

  reset(): void {
    this.log = { runs: [], subs: [] };
    this.ticks = 0;
  }

  tick(inputs: TeamInputs): void {
    if (this.ticks >= MAX_LOG_TICKS) return;
    this.ticks++;
    const home = encodeInput(inputs.home);
    const away = encodeInput(inputs.away);
    const last = this.log.runs[this.log.runs.length - 1];
    if (last && last[1] === home && last[2] === away) last[0]++;
    else this.log.runs.push([1, home, away]);
  }

  /** `outId` dạng `<đội>-<ô>` (id sim); id lạ bị bỏ qua vì sim cũng không bao giờ chấp nhận. */
  sub(tick: number, team: TeamSide, outId: string, bench: SquadSlot): void {
    const out = SquadSlot.safeParse(outId.replace(`${team}-`, ''));
    if (out.success) this.log.subs.push({ tick, team, out: out.data, bench });
  }

  encode(): string {
    return encodeLog2(this.log);
  }
}

export function encodeLog2(log: InputLog2): string {
  const out: number[] = [];
  pushVarint(out, log.runs.length);
  for (const [ticks, home, away] of log.runs) {
    pushVarint(out, ticks);
    pushVarint(out, home);
    pushVarint(out, away);
  }
  pushVarint(out, log.subs.length);
  for (const s of log.subs) {
    pushVarint(out, s.tick);
    out.push(s.team === 'home' ? 0 : 1, SLOTS.indexOf(s.out), SLOTS.indexOf(s.bench));
  }
  return LOG_V2_PREFIX + toBase64Url(out);
}

/** Giải mã và kiểm log v2 (cần tiền tố `v2.`), cùng ràng buộc như v1; thay người tối đa MAX_SUBS mỗi đội. */
export function decodeLog2(text: string): InputLog2 & { totalTicks: number } {
  if (!text.startsWith(LOG_V2_PREFIX)) throw new ReplayLogError('Log không phải định dạng v2');
  const bytes = fromBase64Url(text.slice(LOG_V2_PREFIX.length));
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
  const runs: [number, number, number][] = [];
  let totalTicks = 0;
  for (let i = 0; i < nRuns; i++) {
    const ticks = varint();
    const home = varint();
    const away = varint();
    totalTicks += ticks;
    if (ticks < 1 || home >= CODE_LIMIT || away >= CODE_LIMIT || totalTicks > MAX_LOG_TICKS) {
      throw new ReplayLogError('Log có đoạn không hợp lệ');
    }
    runs.push([ticks, home, away]);
  }
  const nSubs = varint();
  if (nSubs > 2 * MAX_SUBS) throw new ReplayLogError('Log có quá nhiều lượt thay người');
  const subs: InputLog2['subs'] = [];
  const perTeam = { home: 0, away: 0 };
  for (let i = 0; i < nSubs; i++) {
    const tick = varint();
    const teamByte = bytes[pos++];
    const team: TeamSide = teamByte === 0 ? 'home' : 'away';
    const out = SLOTS[bytes[pos++] ?? -1];
    const bench = SLOTS[bytes[pos++] ?? -1];
    if (
      (teamByte !== 0 && teamByte !== 1) ||
      !out ||
      !bench ||
      tick > totalTicks ||
      tick < (subs[i - 1]?.tick ?? 0) ||
      ++perTeam[team] > MAX_SUBS
    ) {
      throw new ReplayLogError('Lượt thay người không hợp lệ');
    }
    subs.push({ tick, team, out, bench });
  }
  if (pos !== bytes.length) throw new ReplayLogError('Log thừa dữ liệu');
  return { runs, subs, totalTicks };
}

/** Log v1 (chỉ đội nhà có input, thay người chỉ đội nhà) quy về dạng v2 với đội khách NO_INPUT. */
function fromV1(encoded: string): InputLog2 {
  const v1 = decodeLog(encoded);
  return {
    runs: v1.runs.map(([t, code]): [number, number, number] => [t, code, 0]),
    subs: v1.subs.map((x) => ({ ...x, team: 'home' as const })),
  };
}

/** Chạy log (v1 hoặc v2) tới hết log hoặc `full_time`, trả state cuối. */
function runLog(setup: MatchSetup, encoded: string): MatchState {
  const log = encoded.startsWith(LOG_V2_PREFIX) ? decodeLog2(encoded) : fromV1(encoded);
  let s = createMatch(setup);
  // Giống luồng live: đội máy không có thay người do người chơi gửi.
  if (log.subs.some((x) => !s.humans.includes(x.team))) {
    throw new ReplayLogError('Log có thay người của đội không do người chơi');
  }
  let nextSub = 0;
  const applySubs = () => {
    while (log.subs[nextSub]?.tick === s.tick) {
      const sub = log.subs[nextSub++]!;
      const r = substitute(s, sub.team, `${sub.team}-${sub.out}`, sub.bench);
      if (!r.ok) throw new ReplayLogError(`Thay người bị từ chối: ${r.reason}`);
      s = r.state;
    }
  };
  for (const [ticks, home, away] of log.runs) {
    const inputs = { home: decodeInput(home), away: decodeInput(away) };
    for (let i = 0; i < ticks; i++) {
      applySubs();
      if (s.phase === 'full_time') return s;
      s = stepBoth(s, inputs);
    }
  }
  applySubs(); // lượt thay ở tick đúng bằng tổng tick (live ghi sub rồi mới tick)
  return s;
}

/** Chạy lại trận từ `setup` + log (v1 hoặc v2); dừng ở `full_time` (phần log thừa phía sau bị bỏ qua). */
export function replayMatch(setup: MatchSetup, encoded: string): ReplayResult {
  const s = runLog(setup, encoded);
  const sh = s.shootout;
  const goals = (kicks: boolean[]) => kicks.filter(Boolean).length;
  return {
    score: { ...s.score },
    ...(sh && { shootout: { home: goals(sh.home), away: goals(sh.away) } }),
    phase: s.phase,
    ticks: s.tick,
  };
}

/** Chạy hết log và trả state (client dựng lại khi vào lại trận, R6). */
export function replayToState(setup: MatchSetup, encoded: string): MatchState {
  return runLog(setup, encoded);
}
