/**
 * Chọn hoạt ảnh cầu thủ từ `MatchState` (task 5.18d), thuần (không Three.js). Chỉ đọc state:
 * - `locomotionFor`: clip lặp theo vận tốc so với hướng mặt (đứng / chạy / lùi / ngang).
 * - `animationEvents`: clip một lần khi có sự kiện giữa 2 tick (chuyền, sút, xoạc, ngã, vấp, bắt bóng…).
 * - `diveClip`: thủ môn đang lao người cản phá.
 * Tên clip khớp `CLIPS` trong `scripts/build-player-model.mjs`.
 */
import type { MatchState, PlayerState } from '@pitch/sim';

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
  if (isKeeper && prev.ballOwnerId === kicker) return 'gk_throw';
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
    if (prev.ballOwnerId === kicker || prev.restart?.takerId === kicker) {
      events.push({ playerId: kicker, clip: kickClip(prev, curr, kicker) });
    }
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
