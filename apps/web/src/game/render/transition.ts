/**
 * Logic chuyển cảnh giữa các pha bóng (stinger truyền hình), thuần (không Three.js/DOM) để test.
 * Phát hiện thời điểm sim đặt lại vị trí cầu thủ/bóng từ cặp trạng thái `(prev, curr)`, tính đường
 * cong đóng/mở che kín khung hình và tự hạ cấp 3D → 2D khi đồ hoạ Thấp hoặc FPS thấp.
 */
import type { MatchState, TeamSide } from '@pitch/sim';
import type { GraphicsQuality } from '../bridge';
import { SNAP_DISTANCE, countdownRing } from './view';

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
}

/** Ngưỡng FPS trung bình vài giây gần nhất: thấp hơn mức này thì tự hạ từ 3D xuống 2D CSS. */
export const LOW_FPS_THRESHOLD = 50;
/** Thời lượng mờ đen nhanh khi bật `prefers-reduced-motion: reduce` (200–300 ms). */
export const REDUCED_DURATION_SEC = 0.25;
/** Thời gian camera hơi dolly vào khung tình huống cố định sau khi mở cảnh mới (giây). */
export const DOLLY_DURATION_SEC = 0.65;

const TEAM_SUBLABEL: Record<TeamSide, string> = {
  home: 'ĐỘI NHÀ',
  away: 'ĐỘI KHÁCH',
};

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
  shootout_turn: 'LƯỢT 1',
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

/** Nhãn hiển thị cho từng loại chuyển cảnh; lượt luân lưu giữa trận hiện `"LƯỢT N"`. */
export function transitionLabel(kind: TransitionKind, turn?: number | null): string {
  if (kind === 'shootout_turn') {
    const n = turn !== undefined && turn !== null && turn > 0 ? Math.floor(turn) : 1;
    return `LƯỢT ${n}`;
  }
  return TRANSITION_LABELS[kind];
}

function defaultSublabel(
  kind: TransitionKind,
  team: TeamSide | null,
  turn: number | null,
): string {
  switch (kind) {
    case 'replay_in':
      return 'PHA GHI BÀN';
    case 'replay_out':
    case 'kickoff':
      return team ? `GIAO BÓNG · ${TEAM_SUBLABEL[team]}` : 'TIẾP TỤC TRẬN ĐẤU';
    case 'second_half':
      return team ? `HIỆP 2 · ${TEAM_SUBLABEL[team]}` : 'HIỆP 2';
    case 'shootout':
      return team ? `LƯỢT 1 · ${TEAM_SUBLABEL[team]} SÚT` : 'PHÂN ĐỊNH THẮNG THUA';
    case 'shootout_turn':
      return team
        ? `LUÂN LƯU · ${TEAM_SUBLABEL[team]} SÚT`
        : `LUÂN LƯU · LƯỢT ${turn ?? 1}`;
    case 'goal_kick':
    case 'corner':
    case 'throw_in':
    case 'free_kick':
    case 'penalty':
      return team ? `TÌNH HUỐNG CỐ ĐỊNH · ${TEAM_SUBLABEL[team]}` : 'TÌNH HUỐNG CỐ ĐỊNH';
  }
}

export interface BuildTransitionOptions {
  label?: string;
  sublabel?: string;
  team?: TeamSide | null;
  turn?: number | null;
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
 */
export function hasPlayerTeleport(
  prev: Pick<MatchState, 'players'>,
  curr: Pick<MatchState, 'players'>,
): boolean {
  const prevById = new Map(prev.players.map((p) => [p.id, p]));
  const thresholdSq = SNAP_DISTANCE * SNAP_DISTANCE;
  for (const p of curr.players) {
    const before = prevById.get(p.id);
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

    switch (r.type) {
      case 'goal_kick':
      case 'corner':
      case 'free_kick':
      case 'penalty':
        if (isNewRestart || teleported) {
          return buildTransitionSpec(r.type, { team: r.team });
        }
        return null;
      case 'throw_in':
        // Ném biên: chỉ chuyển cảnh khi có dịch chuyển cầu thủ tức thời (> SNAP_DISTANCE).
        if (teleported) {
          return buildTransitionSpec('throw_in', { team: r.team });
        }
        return null;
      case 'kickoff':
        if (isNewRestart || teleported) {
          return buildTransitionSpec('kickoff', { team: r.team });
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
      p < COVER_HOLD_START
        ? easeOutCubic(p / COVER_HOLD_START)
        : p <= COVER_HOLD_END
          ? 1
          : 1 - easeInCubic((p - COVER_HOLD_END) / (1 - COVER_HOLD_END));
    const fullyCovered = p >= COVER_HOLD_START && p <= COVER_HOLD_END;
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
