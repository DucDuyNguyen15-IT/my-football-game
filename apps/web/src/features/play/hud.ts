/**
 * Dữ liệu HUD rút từ `MatchState`, thuần (không React/Three.js). Chỉ đọc state, không quyết định luật.
 * Snapshot làm tròn (phút, % thể lực) để React chỉ vẽ lại vài lần mỗi giây dù sim chạy 60 tick/s.
 */
import type { Position, SquadSlot } from '@pitch/shared';
import {
  matchClock,
  type MatchClock,
  type MatchPhase,
  type MatchState,
  type TeamSide,
} from '@pitch/sim';
import { shirtNumber } from '../../game/render/view';

export type Score = Record<TeamSide, number>;
export type StaminaLevel = 'ok' | 'low' | 'critical';
export type Outcome = 'win' | 'draw' | 'loss';

export interface HudBooking {
  playerId: string;
  team: TeamSide;
  card: 'yellow' | 'red';
  number: number;
  clock: string;
}

export interface HudSnapshot {
  score: Score;
  half: 1 | 2;
  clock: string;
  phase: MatchPhase;
  controlled: { id: string; number: number; position: Position; stamina: number } | null;
  bookings: HudBooking[];
  shots: Score;
}

export interface HudEvent {
  kind: 'goal' | 'yellow' | 'red';
  team: TeamSide;
  text: string;
}

/** "67'", bù giờ "45+2'". */
export function formatClock(c: MatchClock): string {
  return c.addedMinute > 0 ? `${c.minute}+${c.addedMinute}'` : `${c.minute}'`;
}

/** Mốc màu thanh thể lực: vàng < 50%, đỏ < 30% (mốc PRD làm giảm tốc). */
export function staminaLevel(stamina: number): StaminaLevel {
  if (stamina < 30) return 'critical';
  if (stamina < 50) return 'low';
  return 'ok';
}

/** Kết quả theo góc nhìn người chơi (đội nhà). */
export function matchOutcome(score: Score): Outcome {
  if (score.home > score.away) return 'win';
  return score.home === score.away ? 'draw' : 'loss';
}

/** Id cầu thủ là `${team}-${slot}`; người bị thẻ đỏ đã rời `players` nên lấy số áo từ id. */
const numberFromId = (playerId: string): number =>
  shirtNumber(playerId.slice(playerId.indexOf('-') + 1) as SquadSlot);

/**
 * `prev` để giữ phút đã ghi của thẻ cũ (thẻ trong sim chỉ có `tick`, không có phút hiển thị);
 * thẻ mới lấy phút hiện tại.
 */
export function toHudSnapshot(state: MatchState, prev?: HudSnapshot): HudSnapshot {
  const c = state.players.find((p) => p.id === state.controlledId);
  const clock = formatClock(matchClock(state));
  return {
    score: state.score,
    half: state.half,
    clock,
    phase: state.phase,
    controlled: c
      ? {
          id: c.id,
          number: shirtNumber(c.slot),
          position: c.position,
          stamina: Math.round(c.stamina),
        }
      : null,
    bookings: state.bookings.map((b, i) => ({
      playerId: b.playerId,
      team: b.team,
      card: b.card,
      number: numberFromId(b.playerId),
      clock: prev?.bookings[i]?.clock ?? clock,
    })),
    shots: state.shots,
  };
}

export function sameHud(a: HudSnapshot, b: HudSnapshot): boolean {
  return (
    a.score.home === b.score.home &&
    a.score.away === b.score.away &&
    a.half === b.half &&
    a.clock === b.clock &&
    a.phase === b.phase &&
    a.bookings.length === b.bookings.length &&
    a.controlled?.id === b.controlled?.id &&
    a.controlled?.stamina === b.controlled?.stamina
  );
}

export const TEAM_LABEL: Record<TeamSide, string> = { home: 'Nhà', away: 'Khách' };
export const CARD_LABEL = { yellow: 'Thẻ vàng', red: 'Thẻ đỏ' } as const;

/** Sự kiện mới giữa hai snapshot, hiện thành dải dưới bảng tỉ số. */
export function hudEvents(prev: HudSnapshot, next: HudSnapshot): HudEvent[] {
  const events: HudEvent[] = [];
  for (const team of ['home', 'away'] as const) {
    if (next.score[team] > prev.score[team]) {
      events.push({ kind: 'goal', team, text: `${next.clock} Bàn thắng · ${TEAM_LABEL[team]}` });
    }
  }
  for (const b of next.bookings.slice(prev.bookings.length)) {
    events.push({
      kind: b.card,
      team: b.team,
      text: `${b.clock} ${CARD_LABEL[b.card]} · ${TEAM_LABEL[b.team]} #${b.number}`,
    });
  }
  return events;
}

export interface DevOptions {
  halfLengthSec?: number;
  autopilot?: true;
}

/**
 * `?half=<giây>` (hiệp ngắn) và `?autopilot=1` — chỉ khi dev hoặc chạy test; build production bỏ qua.
 */
export function readDevOptions(search: string, env: { DEV: boolean; MODE: string }): DevOptions {
  if (!env.DEV && env.MODE !== 'test') return {};
  const params = new URLSearchParams(search);
  const opts: DevOptions = {};
  const half = Number(params.get('half'));
  if (params.has('half') && Number.isFinite(half) && half > 0) opts.halfLengthSec = half;
  if (params.get('autopilot') === '1') opts.autopilot = true;
  return opts;
}
