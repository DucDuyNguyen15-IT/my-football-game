/**
 * Chọn hoạt ảnh cầu thủ từ `MatchState` (task 5.18d), thuần (không Three.js). Chỉ đọc state:
 * - `locomotionFor`: clip lặp theo vận tốc so với hướng mặt (đứng / chạy / lùi / ngang).
 * - `animationEvents`: clip một lần khi có sự kiện giữa 2 tick (chuyền, sút, xoạc, ngã, vấp, bắt bóng…).
 * - `diveClip`: thủ môn đang lao người cản phá.
 * - `heldBall`: ai đang cầm bóng bằng tay (thủ môn trong vòng cấm, người chờ ném biên).
 * Tên clip khớp `CLIPS` trong `scripts/build-player-model.mjs`.
 */
import {
  DRIBBLE_OFFSET,
  isKeeperHandling,
  RESTART_SETTLE_DIST,
  type MatchState,
  type PlayerState,
} from '@pitch/sim';

export type ClipName =
  | 'idle'
  | 'walk'
  | 'jog'
  | 'run'
  | 'jog_back'
  | 'strafe_left'
  | 'strafe_right'
  | 'pass'
  | 'shot'
  | 'penalty'
  | 'header'
  | 'tackle'
  | 'trip'
  | 'stumble'
  | 'fallen'
  | 'get_up'
  | 'throw_in'
  | 'gk_idle'
  | 'gk_sidestep'
  | 'gk_catch'
  | 'gk_dive_left'
  | 'gk_dive_right'
  | 'gk_throw'
  | 'gk_kick';

/**
 * Tốc độ bước (m/s) của clip di chuyển: phát nhanh/chậm theo tốc độ để chân không trượt. Mặc định
 * cho file cũ; `pnpm assets` đo lại từ clip và ghi vào GLB (`ClipSpeeds`).
 */
export const JOG_CLIP_SPEED = 2.5;
const DEFAULT_SPEEDS = { jog: JOG_CLIP_SPEED, jog_back: 2.3, strafe_left: 2.6, strafe_right: 2.6 };
export type ClipSpeeds = Partial<Record<ClipName, number>>;
/** Chậm hơn mức này (m/s) thì coi như đứng. */
const IDLE_SPEED = 0.4;
/** Chậm hơn mức này thì đi bộ (khi có clip `walk`). */
export const WALK_MAX_SPEED = 2.2;
/**
 * Từ mức này trở lên dùng clip `run` (khi có): chạy thường 4,5–6,5 m/s, nước rút ×1,35 — clip `jog`
 * (2,5 m/s) phát nhanh gấp đôi trông giật.
 */
export const RUN_MIN_SPEED = 4;
/** Vùng đệm (m/s) quanh ngưỡng đổi clip để tốc độ dao động nhẹ không làm nhảy qua lại. */
const SWITCH_MARGIN = 0.3;
/** Thiếu clip `run`: từ mức này (nước rút) bắt đầu cúi người về trước. */
export const SPRINT_LEAN_MIN_SPEED = 6.2;
/** Thiếu clip `run`: cúi người về trước tối đa chừng này (rad) khi chạy nhanh. */
const MAX_SPRINT_LEAN = 0.3;
/** Thủ môn chạy nhanh hơn mức này sau cú sút đối phương = đang lao người. */
const DIVE_MIN_SPEED = 4;
/** Bóng cao hơn mức này (m) lúc chạm = đánh đầu. */
const HEADER_MIN_Z = 1.2;

export interface Locomotion {
  clip: ClipName;
  timeScale: number;
  /** Góc cúi người thêm (rad, cộng vào xương Spine) — chỉ dùng khi thiếu clip chạy nhanh. */
  lean: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const speedOf = (p: PlayerState) => Math.hypot(p.vel.x, p.vel.y);

/**
 * Bên trái nhân vật theo toạ độ sim. Thế giới 3D: z = sim y, camera nhìn từ +z; model quay +Z cục bộ
 * về hướng mặt nên trái (+X cục bộ) là (f.y, −f.x).
 */
const leftOf = (f: { x: number; y: number }) => ({ x: f.y, y: -f.x });

/**
 * `speeds`: tốc độ bước của clip có trong model; clip `walk`/`run` chỉ dùng khi có mặt ở đây.
 * `current`: clip lặp đang phát, để giữ nguyên trong vùng đệm quanh ngưỡng.
 */
export function locomotionFor(
  p: PlayerState,
  speeds: ClipSpeeds = {},
  current?: ClipName,
): Locomotion {
  const speed = speedOf(p);
  if (speed < IDLE_SPEED) {
    return { clip: p.position === 'GK' ? 'gk_idle' : 'idle', timeScale: 1, lean: 0 };
  }
  const at = (clip: ClipName, lo: number, hi: number, lean = 0): Locomotion => {
    const clipSpeed = speeds[clip] ?? DEFAULT_SPEEDS[clip as keyof typeof DEFAULT_SPEEDS] ?? 1;
    return { clip, timeScale: clamp(speed / clipSpeed, lo, hi), lean };
  };
  const dx = p.vel.x / speed;
  const dy = p.vel.y / speed;
  const forward = dx * p.facing.x + dy * p.facing.y;
  const left = leftOf(p.facing);
  if (forward >= 0.5) {
    const walkMax = WALK_MAX_SPEED + (current === 'walk' ? SWITCH_MARGIN : -SWITCH_MARGIN);
    const runMin = RUN_MIN_SPEED + (current === 'run' ? -SWITCH_MARGIN : SWITCH_MARGIN);
    if (speed < walkMax && speeds.walk) return at('walk', 0.5, 2);
    if (speed >= runMin && speeds.run) return at('run', 0.6, 1.8);
    const lean = MAX_SPRINT_LEAN * clamp((speed - SPRINT_LEAN_MIN_SPEED + 1) / 3, 0, 1);
    return at('jog', 0.6, 2.6, lean);
  }
  if (forward <= -0.5) return at('jog_back', 0.6, 2);
  return at(dx * left.x + dy * left.y > 0 ? 'strafe_left' : 'strafe_right', 0.6, 2);
}

/** Thủ môn đang lao người sau cú sút của đối phương: clip lao sang trái/phải nhân vật, null nếu không. */
export function diveClip(
  p: PlayerState,
  state: Pick<MatchState, 'ballOwnerId' | 'lastShot'>,
): 'gk_dive_left' | 'gk_dive_right' | null {
  const shot = state.lastShot;
  if (p.position !== 'GK' || state.ballOwnerId !== null || !shot || shot.team === p.team) {
    return null;
  }
  if (speedOf(p) < DIVE_MIN_SPEED) return null;
  const left = leftOf(p.facing);
  return p.vel.x * left.x + p.vel.y * left.y > 0 ? 'gk_dive_left' : 'gk_dive_right';
}

export interface AnimEvent {
  playerId: string;
  clip: ClipName;
}

/** Clip chạm bóng của người vừa rời bóng (`kicker`), theo loại tình huống. */
function kickClip(prev: MatchState, curr: MatchState, kicker: string): ClipName {
  const restart = prev.restart?.takerId === kicker ? prev.restart.type : null;
  const isKeeper = prev.players.find((p) => p.id === kicker)?.position === 'GK';
  if (restart === 'throw_in') return 'throw_in';
  if (restart === 'penalty') return 'penalty';
  if (restart === 'goal_kick' && isKeeper) return 'gk_kick';
  if (prev.ball.z > HEADER_MIN_Z) return 'header';
  if (curr.lastShot?.tick === curr.tick) return 'shot';
  return 'pass';
}

export function animationEvents(prev: MatchState, curr: MatchState): AnimEvent[] {
  const events: AnimEvent[] = [];

  // Rời bóng: sim khoá người vừa chuyền/sút bằng `kickLock` mới.
  const lock = curr.kickLock;
  const newLock =
    lock !== null &&
    (prev.kickLock?.playerId !== lock.playerId || prev.kickLock.untilTick !== lock.untilTick);
  if (lock && newLock && curr.ballOwnerId === null) {
    const kicker = lock.playerId;
    // Thủ môn lấy đà xong: clip đã phát từ lúc bắt đầu lấy đà.
    const windupDone = prev.windup?.playerId === kicker;
    if (!windupDone && (prev.ballOwnerId === kicker || prev.restart?.takerId === kicker)) {
      events.push({ playerId: kicker, clip: kickClip(prev, curr, kicker) });
    }
  }

  // Thủ môn bắt đầu lấy đà ném / phát bóng (sim nhả bóng sau KEEPER_WINDUP_TICKS).
  const w = curr.windup;
  if (w && (prev.windup?.playerId !== w.playerId || prev.windup.releaseTick !== w.releaseTick)) {
    events.push({ playerId: w.playerId, clip: w.style === 'throw' ? 'gk_throw' : 'gk_kick' });
  }

  // Xoạc (A): người xoạc nằm trượt; trúng bóng thì người bị xoạc ngã hoặc vấp.
  const tackle = curr.lastTackle;
  if (tackle && tackle.tick === curr.tick && tackle.tick !== prev.lastTackle?.tick) {
    events.push({ playerId: tackle.tacklerId, clip: 'tackle' });
    if (tackle.victimId !== null && tackle.victimReaction !== null) {
      const clip = tackle.victimReaction === 'fall' ? 'trip' : 'stumble';
      events.push({ playerId: tackle.victimId, clip });
    }
  }

  // Bị phạm lỗi: đang dẫn bóng thì trận dừng và đội mình được đá phạt / phạt đền.
  const r = curr.restart;
  const owner = prev.ballOwnerId;
  if (
    prev.phase === 'play' &&
    r &&
    (r.type === 'free_kick' || r.type === 'penalty') &&
    owner !== null &&
    prev.players.find((p) => p.id === owner)?.team === r.team &&
    !events.some((e) => e.playerId === owner)
  ) {
    events.push({ playerId: owner, clip: 'trip' });
  }

  // Thủ môn bắt dính cú sút của đối phương.
  const catcher = curr.ballOwnerId;
  const keeper = catcher === null ? undefined : curr.players.find((p) => p.id === catcher);
  if (
    keeper?.position === 'GK' &&
    prev.ballOwnerId !== catcher &&
    prev.lastShot !== null &&
    prev.lastShot.team !== keeper.team
  ) {
    events.push({ playerId: keeper.id, clip: 'gk_catch' });
  }
  return events;
}

/** Người ném biên cách điểm ném không quá chừng này (m) thì đã cầm bóng lên. */
const THROW_IN_GRAB_DIST = DRIBBLE_OFFSET + RESTART_SETTLE_DIST;

/** Người cầm bóng bằng tay: `throw_in` = giơ qua đầu chờ ném, `keeper` = thủ môn ôm bóng. */
export interface HeldBall {
  playerId: string;
  grip: 'throw_in' | 'keeper';
}

/**
 * Bóng đang nằm trong tay ai (sim vẫn đặt bóng ở chân người giữ, renderer vẽ lại vào tay): người
 * chờ ném biên, hoặc thủ môn giữ bóng trong vòng cấm nhà. Null nếu không ai cầm.
 */
export function heldBall(state: MatchState): HeldBall | null {
  const r = state.restart;
  if (r?.type === 'throw_in') {
    // Người ném còn đang đi tới chỗ ném thì bóng vẫn nằm ở vạch.
    const taker = state.players.find((p) => p.id === r.takerId);
    const near =
      taker && Math.hypot(taker.pos.x - r.spot.x, taker.pos.y - r.spot.y) <= THROW_IN_GRAB_DIST;
    return near ? { playerId: r.takerId, grip: 'throw_in' } : null;
  }
  const ownerId = state.ballOwnerId;
  const owner = ownerId === null ? undefined : state.players.find((p) => p.id === ownerId);
  if (owner && isKeeperHandling(owner, state.half, state.backPass))
    return { playerId: owner.id, grip: 'keeper' };
  return null;
}
