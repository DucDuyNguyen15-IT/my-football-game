/**
 * Logic chuyển cảnh giữa các pha bóng (stinger truyền hình), thuần (không Three.js/DOM) để test.
 * Phát hiện thời điểm sim đặt lại vị trí cầu thủ/bóng từ cặp trạng thái `(prev, curr)`, tính đường
 * cong đóng/mở che kín khung hình và tự hạ cấp 3D → 2D khi đồ hoạ Thấp hoặc FPS thấp.
 */
import {
  FOUL_HOLD_TICKS,
  OUT_HOLD_TICKS,
  SHOOTOUT_HOLD_TICKS,
  TICK_RATE,
  type MatchState,
  type PlayerState,
  type TeamSide,
} from '@pitch/sim';
import type { GraphicsQuality } from '../bridge';
import { SNAP_DISTANCE, countdownRing, playerNumber } from './view';
import { formatMessage, getActiveLocale } from '../../i18n/i18n';

export type TransitionKind =
  | 'goal_kick'
  | 'corner'
  | 'throw_in'
  | 'free_kick'
  | 'penalty'
  | 'replay_in'
  | 'replay_out'
  | 'kickoff'
  | 'second_half'
  | 'shootout'
  | 'shootout_turn';

export type TransitionMode = '3d' | '2d' | 'reduced';

/** Thông tin pha phạm lỗi rút từ cặp trạng thái `(prev, curr)` lúc trọng tài vừa thổi phạt. */
export interface FoulSummary {
  /** Cầu thủ bị phạm lỗi (người ngã xuống cỏ trước khi cắt cảnh). */
  readonly victimId: string | null;
  /** Cầu thủ phạm lỗi (xoạc trượt hoặc tắc bóng đứng). */
  readonly tacklerId: string | null;
  /** Cú phạm lỗi là xoạc trượt (`true`) hay tắc bóng đứng (`false`). */
  readonly slide: boolean;
  /** Thẻ phạt rút ngay ở tick phạm lỗi (`yellow`, `red`, hoặc `null` nếu không rút thẻ). */
  readonly card: 'yellow' | 'red' | null;
  /** Số áo của cầu thủ bị rút thẻ (nếu có) để hiển thị trên thông báo trọng tài. */
  readonly bookedNumber: number | null;
}

export interface TransitionSpec {
  readonly kind: TransitionKind;
  /** Nhãn chính hiện khi che kín: "PHÁT BÓNG", "PHẠT GÓC", "NÉM BIÊN", "ĐÁ PHẠT", "PHẠT ĐỀN", ... */
  readonly label: string;
  /** Nhãn phụ nhỏ phía dưới (đội hưởng, hiệp, hoặc lượt sút). */
  readonly sublabel: string;
  /** Đội được hưởng hoặc đang thực hiện (nếu có). */
  readonly team: TeamSide | null;
  /** Số thứ tự lượt sút luân lưu (1, 2, 3...) khi ở luân lưu; null ở tình huống khác. */
  readonly turn: number | null;
  /** Thời lượng chuẩn ở bản 3D (giây). */
  readonly duration3dSec: number;
  /** Thời lượng chuẩn ở bản 2D (giây). */
  readonly duration2dSec: number;
  /**
   * Thời gian giữ/diễn tiếp cảnh trên sân trước khi bắt đầu khép stinger (giây):
   * - Phạm lỗi (`free_kick`, `penalty` phát sinh từ bóng sống): `FOUL_DELAY_SEC` (~1,25 s) để thấy
   *   cầu thủ bị phạm lỗi té ngã và nhãn trọng tài trước khi cắt cảnh.
   * - Bóng ra biên (`goal_kick`, `corner`, `throw_in` phát sinh từ bóng sống): `OUT_OF_BOUNDS_DELAY_SEC`
   *   (~0,6 s) để thấy bóng lăn hẳn qua vạch biên trước khi cắt cảnh.
   * - Tình huống khác: `0`.
   */
  readonly delaySec: number;
  /** Chi tiết pha phạm lỗi khi chuyển cảnh phát sinh từ phạm lỗi; `null` ở tình huống khác. */
  readonly foul: FoulSummary | null;
}

/** Ngưỡng FPS trung bình vài giây gần nhất: thấp hơn mức này thì tự hạ từ 3D xuống 2D CSS. */
export const LOW_FPS_THRESHOLD = 50;
/**
 * Thời lượng chuyển cảnh khi bật `prefers-reduced-motion: reduce`: chỉ mờ, không chuyển động. Mờ vào
 * / ra mỗi bên ~125 ms, giữ nhãn ~450 ms ở giữa để kịp đọc (review L5).
 */
export const REDUCED_DURATION_SEC = 0.7;
/** Phần đầu / cuối (theo tiến độ 0…1) dành cho mờ vào / mờ ra ở chế độ reduced. */
export const REDUCED_FADE = 0.18;
/** Thời gian camera hơi dolly vào khung tình huống cố định sau khi mở cảnh mới (giây). */
export const DOLLY_DURATION_SEC = 0.65;
/*
 * Thời gian giữ hình lấy từ hằng số của sim: sim tính sẵn mốc "chuyển cảnh xong" (`Restart.readyTick`
 * = tick bóng chết + giữ hình + mở màn) để bắt đầu hạn 15 s (luật 3), nên hai bên phải khớp nhau.
 */
/** Độ trễ trước khi khép stinger sau pha phạm lỗi (1,25 s: thấy cầu thủ té ngã + còi/thẻ). */
export const FOUL_DELAY_SEC = FOUL_HOLD_TICKS / TICK_RATE;
/** Độ trễ trước khi khép stinger khi bóng lăn ra ngoài biên (0,6 s: thấy bóng qua vạch). */
export const OUT_OF_BOUNDS_DELAY_SEC = OUT_HOLD_TICKS / TICK_RATE;
/** Luân lưu: xem bóng rung lưới / pha cản phá của lượt vừa sút trước khi sang lượt kế (giây). */
export const SHOOTOUT_RESULT_DELAY_SEC = SHOOTOUT_HOLD_TICKS / TICK_RATE;

export const TRANSITION_LABELS: Record<TransitionKind, string> = {
  goal_kick: 'PHÁT BÓNG',
  corner: 'PHẠT GÓC',
  throw_in: 'NÉM BIÊN',
  free_kick: 'ĐÁ PHẠT',
  penalty: 'PHẠT ĐỀN',
  replay_in: 'XEM LẠI',
  replay_out: 'GIAO BÓNG',
  kickoff: 'GIAO BÓNG',
  second_half: 'GIAO BÓNG',
  shootout: 'LUÂN LƯU',
  shootout_turn: 'LƯỢT',
};

const DURATION_3D: Record<TransitionKind, number> = {
  goal_kick: 0.78,
  corner: 0.78,
  throw_in: 0.74,
  free_kick: 0.82,
  penalty: 0.86,
  replay_in: 0.96,
  replay_out: 0.82,
  kickoff: 0.82,
  second_half: 0.88,
  shootout: 0.9,
  shootout_turn: 0.7,
};

const DURATION_2D: Record<TransitionKind, number> = {
  goal_kick: 0.68,
  corner: 0.68,
  throw_in: 0.64,
  free_kick: 0.7,
  penalty: 0.72,
  replay_in: 0.78,
  replay_out: 0.68,
  kickoff: 0.68,
  second_half: 0.72,
  shootout: 0.74,
  shootout_turn: 0.62,
};

/** Nhãn hiển thị cho từng loại chuyển cảnh; lượt luân lưu giữa trận hiện `"LƯỢT N"` / `"ROUND N"`. */
export function transitionLabel(kind: TransitionKind, turn?: number | null): string {
  const locale = getActiveLocale();
  if (kind === 'shootout_turn') {
    const n = turn !== undefined && turn !== null && turn > 0 ? Math.floor(turn) : 1;
    return `${formatMessage(locale, 'stinger.kind.shootout_turn')} ${n}`;
  }
  return formatMessage(locale, `stinger.kind.${kind}`);
}

function defaultSublabel(
  kind: TransitionKind,
  team: TeamSide | null,
  turn: number | null,
): string {
  const locale = getActiveLocale();
  const teamLabel = team ? formatMessage(locale, `stinger.team.${team}`) : null;
  switch (kind) {
    case 'replay_in':
      return formatMessage(locale, 'stinger.sub.replay_in');
    case 'replay_out':
    case 'kickoff':
      return teamLabel
        ? formatMessage(locale, 'stinger.sub.kickoffTeam', { team: teamLabel })
        : formatMessage(locale, 'stinger.sub.kickoff');
    case 'second_half':
      return teamLabel
        ? formatMessage(locale, 'stinger.sub.secondHalfTeam', { team: teamLabel })
        : formatMessage(locale, 'stinger.sub.secondHalf');
    case 'shootout':
      return teamLabel
        ? formatMessage(locale, 'stinger.sub.shootoutTeam', { team: teamLabel })
        : formatMessage(locale, 'stinger.sub.shootout');
    case 'shootout_turn':
      return teamLabel
        ? formatMessage(locale, 'stinger.sub.shootoutTurnTeam', { team: teamLabel })
        : formatMessage(locale, 'stinger.sub.shootoutTurn', { turn: turn ?? 1 });
    case 'goal_kick':
    case 'corner':
    case 'throw_in':
    case 'free_kick':
    case 'penalty':
      return teamLabel
        ? formatMessage(locale, 'stinger.sub.setPieceTeam', { team: teamLabel })
        : formatMessage(locale, 'stinger.sub.setPiece');
  }
}

export interface BuildTransitionOptions {
  label?: string;
  sublabel?: string;
  team?: TeamSide | null;
  turn?: number | null;
  /** Thời gian diễn tiếp cảnh trên sân trước khi khép stinger (giây), mặc định `0`. */
  delaySec?: number;
  foul?: FoulSummary | null;
}

export function buildTransitionSpec(
  kind: TransitionKind,
  options: BuildTransitionOptions = {},
): TransitionSpec {
  const team = options.team ?? null;
  const turn =
    options.turn !== undefined
      ? options.turn
      : kind === 'shootout' || kind === 'shootout_turn'
        ? 1
        : null;
  const label = options.label ?? transitionLabel(kind, turn);
  const sublabel = options.sublabel ?? defaultSublabel(kind, team, turn);
  return {
    kind,
    label,
    sublabel,
    team,
    turn,
    duration3dSec: DURATION_3D[kind],
    duration2dSec: DURATION_2D[kind],
    delaySec: Math.max(0, options.delaySec ?? 0),
    foul: options.foul ?? null,
  };
}

/** Khoảng cách bình phương giữa hai cầu thủ (không cấp phát). */
const distSq = (a: PlayerState, b: PlayerState): number =>
  (a.pos.x - b.pos.x) ** 2 + (a.pos.y - b.pos.y) ** 2;

/**
 * Rút thông tin pha phạm lỗi ở tick trọng tài thổi phạt (`curr` vừa sang `dead_ball` với
 * `free_kick`/`penalty`, `prev` còn bóng sống):
 * - Xoạc (A) phạm lỗi: sim ghi `lastTackle` (`outcome: 'foul'`) đúng tick này → người xoạc + người bị xoạc.
 * - Tắc bóng đứng / AI áp sát phạm lỗi: sim không ghi `lastTackle` → người bị phạm lỗi là người đang dẫn
 *   bóng ở `prev` (thuộc đội được hưởng), người phạm lỗi là người bị rút thẻ hoặc cầu thủ đối phương
 *   đứng gần người bị phạm lỗi nhất.
 */
export function summarizeFoul(prev: MatchState, curr: MatchState): FoulSummary {
  const r = curr.restart;
  const tackle = curr.lastTackle;
  const slideFoul =
    tackle !== null && tackle.tick === curr.tick && tackle.outcome === 'foul' ? tackle : null;

  let victimId = slideFoul?.victimId ?? null;
  if (victimId === null && prev.ballOwnerId !== null) {
    const owner = prev.players.find((p) => p.id === prev.ballOwnerId);
    if (owner && (!r || owner.team === r.team)) victimId = owner.id;
  }

  // Thẻ mới rút ở tick này (đỏ trực tiếp, hoặc vàng thứ hai kèm đỏ → hiện đỏ).
  let card: 'yellow' | 'red' | null = null;
  let bookedId: string | null = null;
  for (let i = prev.bookings.length; i < curr.bookings.length; i++) {
    const b = curr.bookings[i]!;
    if (b.tick !== curr.tick) continue;
    if (card !== 'red') {
      card = b.card;
      bookedId = b.playerId;
    }
  }

  let tacklerId = slideFoul?.tacklerId ?? bookedId;
  if (tacklerId === null && victimId !== null) {
    const victim = prev.players.find((p) => p.id === victimId);
    if (victim) {
      let best = Infinity;
      for (const p of prev.players) {
        if (p.team === victim.team) continue;
        const d = distSq(p, victim);
        if (d < best) {
          best = d;
          tacklerId = p.id;
        }
      }
    }
  }

  return {
    victimId,
    tacklerId,
    slide: slideFoul !== null,
    card,
    bookedNumber: bookedId !== null ? playerNumber(bookedId) : null,
  };
}

/** Thời lượng thực tế của chuyển cảnh theo chế độ vẽ (`3d`, `2d`, `reduced`). */
export function transitionDurationSec(spec: TransitionSpec, mode: TransitionMode): number {
  if (mode === 'reduced') return REDUCED_DURATION_SEC;
  return mode === '2d' ? spec.duration2dSec : spec.duration3dSec;
}

/**
 * Có cầu thủ nào (cùng `id` ở cả hai tick) nhảy vị trí tức thời quá `SNAP_DISTANCE` (2 m) không.
 * Người mới vào sân qua thay người không có trong `prev` nên không tính là dịch chuyển.
 * Chạy mỗi tick lúc bóng chết nên không cấp phát: thứ tự cầu thủ thường giữ nguyên giữa hai tick, chỉ
 * tìm theo id khi lệch (thẻ đỏ / thay người).
 */
export function hasPlayerTeleport(
  prev: Pick<MatchState, 'players'>,
  curr: Pick<MatchState, 'players'>,
): boolean {
  const thresholdSq = SNAP_DISTANCE * SNAP_DISTANCE;
  for (let i = 0; i < curr.players.length; i++) {
    const p = curr.players[i]!;
    const same = prev.players[i];
    const before = same?.id === p.id ? same : prev.players.find((q) => q.id === p.id);
    if (!before) continue;
    const dx = p.pos.x - before.pos.x;
    const dy = p.pos.y - before.pos.y;
    if (dx * dx + dy * dy > thresholdSq) return true;
  }
  return false;
}

export interface DetectTransitionOptions {
  /** Cài đặt phát lại bàn thắng đang bật (mặc định `true`). Tắt thì sau bàn thắng về thẳng giao bóng. */
  replay?: boolean;
}

/**
 * Hàm thuần phát hiện "khi nào chuyển cảnh" từ trạng thái sim trước (`prev`) và sau (`curr`).
 * Trả về `TransitionSpec` nếu tick này đặt lại vị trí cho tình huống cố định / bàn thắng / hiệp 2 /
 * luân lưu, hoặc `null` nếu không cần chuyển cảnh.
 */
export function detectTransition(
  prev: MatchState,
  curr: MatchState,
  options: DetectTransitionOptions = {},
): TransitionSpec | null {
  if (curr.tick <= prev.tick) return null;
  if (curr.phase === 'half_time' || curr.phase === 'full_time') return null;
  // Không bao giờ bật overlay đè lên vòng đếm ngược 5 giây cuối.
  if (countdownRing(curr) !== null) return null;

  // 1. Giao bóng đầu hiệp 2 (từ nghỉ giữa hiệp sang hiệp 2, đổi sân).
  if (prev.half !== curr.half && curr.half === 2) {
    return buildTransitionSpec('second_half', {
      team: curr.restart?.team ?? null,
    });
  }

  // 2. Bàn thắng trong hiệp chính (sim đặt lại vị trí giao bóng ngay ở tick bàn thắng).
  const prevGoals = prev.score.home + prev.score.away;
  const currGoals = curr.score.home + curr.score.away;
  if (currGoals > prevGoals && curr.phase !== 'shootout') {
    const scoredTeam: TeamSide = curr.score.home > prev.score.home ? 'home' : 'away';
    const replayOn = options.replay ?? true;
    if (replayOn) {
      return buildTransitionSpec('replay_in', { team: scoredTeam });
    }
    return buildTransitionSpec('kickoff', { team: curr.restart?.team ?? null });
  }

  // 3. Luân lưu: lúc vừa bước vào luân lưu hoặc giữa mỗi lượt sút.
  if (curr.phase === 'shootout' && curr.shootout) {
    const kicking = curr.shootout.kicking;
    const currKicks = curr.shootout.home.length + curr.shootout.away.length;
    if (prev.phase !== 'shootout') {
      return buildTransitionSpec('shootout', {
        team: kicking,
        turn: 1,
      });
    }
    const prevKicks = prev.shootout ? prev.shootout.home.length + prev.shootout.away.length : 0;
    const newKickSetup =
      currKicks > prevKicks || (prev.restart === null && curr.restart !== null);
    if (newKickSetup || hasPlayerTeleport(prev, curr)) {
      return buildTransitionSpec('shootout_turn', {
        team: kicking,
        turn: currKicks + 1,
        // Lượt vừa phân định: cho xem bóng vào lưới / bị cản rồi mới cắt.
        delaySec: currKicks > prevKicks ? SHOOTOUT_RESULT_DELAY_SEC : 0,
      });
    }
    return null;
  }

  // 4. Tình huống cố định (phát bóng, phạt góc, ném biên, đá phạt, phạt đền).
  const r = curr.restart;
  if (curr.phase === 'dead_ball' && r) {
    const isNewRestart =
      prev.phase !== 'dead_ball' ||
      prev.restart === null ||
      prev.restart.startTick !== r.startTick ||
      prev.restart.type !== r.type;
    const teleported = hasPlayerTeleport(prev, curr);
    // Bóng vừa chết ngay tick này (từ bóng sống): cho xem hết pha bóng rồi mới cắt cảnh.
    const fromLive = prev.phase === 'play';

    switch (r.type) {
      // Sim đặt thẳng mọi cầu thủ vào vị trí ở tick bóng chết (luật 2): tình huống nào cũng che màn.
      case 'goal_kick':
      case 'corner':
      case 'throw_in':
        if (isNewRestart || teleported) {
          return buildTransitionSpec(r.type, {
            team: r.team,
            delaySec: fromLive ? OUT_OF_BOUNDS_DELAY_SEC : 0,
          });
        }
        return null;
      case 'free_kick':
      case 'penalty':
        if (isNewRestart || teleported) {
          return buildTransitionSpec(r.type, {
            team: r.team,
            delaySec: fromLive ? FOUL_DELAY_SEC : 0,
            foul: fromLive ? summarizeFoul(prev, curr) : null,
          });
        }
        return null;
    }
  }

  // 5. Giao bóng khác có dịch chuyển cầu thủ.
  if (curr.phase === 'kickoff' && prev.phase !== 'kickoff' && hasPlayerTeleport(prev, curr)) {
    return buildTransitionSpec('kickoff', { team: curr.restart?.team ?? null });
  }

  return null;
}

/** Quyết định chế độ vẽ stinger: ưu tiên reduced-motion → đồ hoạ Thấp / FPS thấp (2D) → 3D. */
export function resolveTransitionMode(opts: {
  preset: GraphicsQuality;
  reducedMotion: boolean;
  recentFps: number | null;
}): TransitionMode {
  if (opts.reducedMotion) return 'reduced';
  if (opts.preset === 'low') return '2d';
  if (opts.recentFps !== null && opts.recentFps < LOW_FPS_THRESHOLD) return '2d';
  return '3d';
}

/**
 * Đo FPS trượt trong vài giây gần nhất bằng vòng đệm tĩnh (`Float64Array`), không cấp phát bộ nhớ
 * trong vòng lặp render. Chỉ báo FPS khi đã gom đủ `minSamples` khung hình hợp lệ.
 */
export class RollingFps {
  private readonly buffer: Float64Array;
  private head = 0;
  private count = 0;
  private sumMs = 0;

  constructor(
    private readonly capacity = 120,
    private readonly minSamples = 45,
  ) {
    this.buffer = new Float64Array(capacity);
  }

  record(frameMs: number): void {
    if (!(frameMs > 0) || frameMs > 1000) return;
    if (this.count === this.capacity) {
      this.sumMs -= this.buffer[this.head]!;
    } else {
      this.count++;
    }
    this.buffer[this.head] = frameMs;
    this.sumMs += frameMs;
    this.head = (this.head + 1) % this.capacity;
  }

  average(): number | null {
    if (this.count < this.minSamples || this.sumMs <= 0) return null;
    return (this.count * 1000) / this.sumMs;
  }

  reset(): void {
    this.head = 0;
    this.count = 0;
    this.sumMs = 0;
  }
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const easeOutCubic = (t: number): number => 1 - (1 - t) ** 3;
const easeInCubic = (t: number): number => t * t * t;
const easeInOutCubic = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;

export interface TransitionSample {
  /** Độ che phủ màn hình 0…1 (1 = che kín hoàn toàn). */
  readonly cover: number;
  /** Màn hình đang bị stinger che kín 100%: có thể bỏ vẽ cảnh sân 3D phía sau để tiết kiệm GPU. */
  readonly fullyCovered: boolean;
  /** Khoảng tách hai cánh cửa chớp 3D/2D: 1 = mở hoàn toàn ở ngoài rìa, 0 = khép kín ở giữa. */
  readonly shutterSplit: number;
  /** Độ mờ của bảng nhãn tình huống 0…1. */
  readonly labelOpacity: number;
  /** Độ phóng của bảng nhãn tình huống. */
  readonly labelScale: number;
  /** Vị trí z của huy hiệu MFG 3D (lao từ xa về phía camera rồi bay qua). */
  readonly crestZ: number;
  /** Góc xoay trục Y của huy hiệu 3D (rad). */
  readonly crestRotY: number;
  /** Góc nghiêng trục X của huy hiệu 3D (rad). */
  readonly crestRotX: number;
  /** Tỉ lệ phóng của huy hiệu 3D. */
  readonly crestScale: number;
  /** Độ mờ của huy hiệu 3D 0…1. */
  readonly crestOpacity: number;
  /** Vị trí vệt sáng quét ngang mặt kim loại 0…1. */
  readonly sweep: number;
}

/** Điểm đầu và cuối của quãng giữ kín hoàn toàn trên thang tiến độ `0…1`. */
export const COVER_HOLD_START = 0.38;
export const COVER_HOLD_END = 0.62;

/**
 * Nội suy toàn bộ thông số hình học & hiển thị của stinger tại tiến độ `progress` (0…1).
 * Easing phi tuyến mượt; ở khoảng `[COVER_HOLD_START, COVER_HOLD_END]` khung hình được che kín 100%
 * để đặt lại vị trí cầu thủ/camera tại đúng mốc `progress = 0.5`.
 */
export function sampleTransitionCurve(
  rawProgress: number,
  mode: TransitionMode,
): TransitionSample {
  const p = clamp01(rawProgress);

  if (mode === 'reduced') {
    // Mờ đen nhanh: tăng lên 1 ở giữa rồi hạ về 0, không xoay/quét.
    const cover =
      p < REDUCED_FADE
        ? easeOutCubic(p / REDUCED_FADE)
        : p <= 1 - REDUCED_FADE
          ? 1
          : 1 - easeInCubic((p - (1 - REDUCED_FADE)) / REDUCED_FADE);
    const fullyCovered = p >= REDUCED_FADE && p <= 1 - REDUCED_FADE;
    return {
      cover,
      fullyCovered,
      shutterSplit: 1 - cover,
      labelOpacity: cover,
      labelScale: 1,
      crestZ: 0,
      crestRotY: 0,
      crestRotX: 0,
      crestScale: 1,
      crestOpacity: 0,
      sweep: 0.5,
    };
  }

  let cover: number;
  let shutterSplit: number;
  let crestZ: number;
  let crestRotY: number;
  let crestRotX: number;
  let crestScale: number;
  let crestOpacity: number;

  if (p < COVER_HOLD_START) {
    const u = p / COVER_HOLD_START;
    const eased = easeOutCubic(u);
    cover = eased;
    shutterSplit = 1 - eased;
    // Lao từ sâu trong sân (-8.5) về sát camera (1.25), xoay 180° quanh trục Y.
    crestZ = -8.5 + 9.75 * eased;
    crestRotY = (1 - eased) * -Math.PI * 0.95 - 0.24;
    crestRotX = (1 - eased) * 0.42 + 0.14;
    crestScale = 0.25 + 0.78 * eased;
    crestOpacity = clamp01(u * 2.2);
  } else if (p <= COVER_HOLD_END) {
    const h = (p - COVER_HOLD_START) / (COVER_HOLD_END - COVER_HOLD_START);
    cover = 1;
    shutterSplit = 0;
    // Giữ nghiêng góc 3D nhẹ trước ống kính để lộ rõ cạnh vát khối đùn trong lúc vệt sáng quét qua.
    crestZ = 1.25 + 0.28 * h;
    crestRotY = -0.24 + 0.36 * h;
    crestRotX = 0.14 - 0.08 * h;
    crestScale = 1.03 + 0.05 * h;
    crestOpacity = 1;
  } else {
    const v = (p - COVER_HOLD_END) / (1 - COVER_HOLD_END);
    const eased = easeInOutCubic(v);
    const exitFast = easeInCubic(v);
    cover = 1 - eased;
    shutterSplit = eased;
    // Biểu tượng phóng vút qua ống kính camera khi hai cánh cửa tách ra lộ cảnh mới.
    crestZ = 1.53 + 4.6 * exitFast;
    crestRotY = 0.12 + 0.65 * exitFast;
    crestRotX = 0.06 - 0.22 * exitFast;
    crestScale = 1.08 + 0.85 * exitFast;
    crestOpacity = clamp01(1 - v * 1.45);
  }

  const fullyCovered = p >= COVER_HOLD_START && p <= COVER_HOLD_END;

  // Nhãn tình huống rõ nét nhất quanh quãng che kín (0.28 → 0.72).
  let labelOpacity = 0;
  let labelScale = 1;
  if (p >= 0.24 && p <= 0.76) {
    if (p < 0.38) {
      const t = easeOutCubic((p - 0.24) / 0.14);
      labelOpacity = t;
      labelScale = 0.9 + 0.1 * t;
    } else if (p <= 0.62) {
      labelOpacity = 1;
      labelScale = 1 + ((p - 0.38) / 0.24) * 0.03;
    } else {
      const t = easeInCubic((p - 0.62) / 0.14);
      labelOpacity = 1 - t;
      labelScale = 1.03 + 0.05 * t;
    }
  }

  const sweep = clamp01((p - 0.22) / 0.56);

  return {
    cover,
    fullyCovered,
    shutterSplit,
    labelOpacity,
    labelScale,
    crestZ,
    crestRotY,
    crestRotX,
    crestScale,
    crestOpacity,
    sweep,
  };
}

/**
 * Độ lệch camera "dolly" nhẹ vào khung tình huống cố định ngay sau khi mở màn che (`elapsedSec` tính
 * từ lúc `onCovered`), êm dần về 0.
 */
export function dollyOffset(
  elapsedSec: number,
  reducedMotion = false,
): { y: number; z: number } {
  if (reducedMotion || elapsedSec <= 0 || elapsedSec >= DOLLY_DURATION_SEC) {
    return { y: 0, z: 0 };
  }
  const k = 1 - easeOutCubic(elapsedSec / DOLLY_DURATION_SEC);
  return {
    y: -1.35 * k,
    z: -2.8 * k,
  };
}

/**
 * Stinger mới phát khi stinger cũ còn chạy: bắt đầu từ đúng độ che hiện tại thay vì mở bung rồi khép
 * lại (review M1). Cũ chưa che kín → tiếp tục khép từ tiến độ đó và dồn `onCovered` cũ sang mốc che
 * kín của lượt mới (không gọi sớm lúc màn còn hở). Cũ đã che, đang mở → bắt đầu ở điểm đối xứng trên
 * nửa khép (cùng độ che).
 */
export function chainedStart(prev: { progress: number; covered: boolean } | null): {
  progress: number;
  carryCovered: boolean;
} {
  if (!prev) return { progress: 0, carryCovered: false };
  const p = clamp01(prev.progress);
  if (!prev.covered) return { progress: Math.min(p, 0.5), carryCovered: true };
  return { progress: Math.min(0.5, 1 - p), carryCovered: false };
}

/** Stinger ở tiến độ `progress` còn che (chưa mở ra) cảnh sân: sim đứng, không nhận phím (review H1). */
export function hidesPlay(progress: number, mode: TransitionMode): boolean {
  return progress < 0.5 || sampleTransitionCurve(progress, mode).fullyCovered;
}
