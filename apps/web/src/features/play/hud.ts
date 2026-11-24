/**
 * Dữ liệu HUD rút từ `MatchState`, thuần (không React/Three.js). Chỉ đọc state, không quyết định luật.
 * Snapshot làm tròn (phút, % thể lực) để React chỉ vẽ lại vài lần mỗi giây dù sim chạy 60 tick/s.
 */
import {
  computeOvr,
  type Card,
  type Difficulty,
  type MatchPlayerSetup,
  type PlayerStats,
  type Position,
  type Rarity,
  type SquadSlot,
  type SubmitMatchResultRequest,
} from '@pitch/shared';
import {
  MAX_SUBS,
  matchClock,
  shootoutWinner,
  substitutionWindow,
  type MatchClock,
  type MatchPhase,
  type MatchState,
  type TeamSide,
} from '@pitch/sim';
import { shortCardName } from '../../components/card/rarity';
import { originSlot, playerNumber, shirtNumber } from '../../game/render/view';
import { formatMessage, getActiveLocale, type Locale } from '../../i18n/i18n';

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

export interface HudSub {
  team: TeamSide;
  inNumber: number;
  outNumber: number;
  clock: string;
}

export interface HudSnapshot {
  score: Score;
  half: 1 | 2;
  clock: string;
  /** Số phút bù giờ đã công bố của hiệp đang đá (> 0); null khi chưa vào bù giờ hoặc hiệp đã hết. */
  stoppage: number | null;
  phase: MatchPhase;
  controlled: { id: string; number: number; position: Position; stamina: number } | null;
  bookings: HudBooking[];
  shots: Score;
  /** Đá phạt / phạt đền đang chờ thực hiện (sau phạm lỗi), null nếu không có. */
  foulRestart: { type: 'free_kick' | 'penalty'; team: TeamSide; startTick: number } | null;
  /** Bóng chết. */
  ballDead: boolean;
  /** Đội nhà lúc này được thay người không (sim quyết định). */
  subWindow: ReturnType<typeof substitutionWindow>;
  /** Số lượt thay người đội nhà còn lại. */
  subsLeft: number;
  substitutions: HudSub[];
  /** Luân lưu: kết quả từng lượt, đội đang chờ sút (null khi bóng đang bay / đã xong). */
  shootout: { home: boolean[]; away: boolean[]; turn: TeamSide | null } | null;
  /** Nghỉ giữa hiệp: đội mình đã bấm sẵn sàng đá hiệp 2 (PvP: đang chờ đối thủ). */
  halfTimeReady: boolean;
}

export interface HudEvent {
  kind: 'goal' | 'yellow' | 'red' | 'foul' | 'sub' | 'shootout';
  team: TeamSide;
  text: string;
}

/** "67'", bù giờ "45+2'". */
export function formatClock(c: MatchClock): string {
  return c.addedMinute > 0 ? `${c.minute}+${c.addedMinute}'` : `${c.minute}'`;
}

/**
 * Số phút bù giờ trọng tài đã công bố (sim đặt `addedMinutes` lúc hết giờ chính thức của hiệp), chỉ
 * tính khi hiệp còn đang đá và có bù ít nhất 1 phút.
 */
export function stoppageMinutes(state: Pick<MatchState, 'phase' | 'addedMinutes'>): number | null {
  const live = state.phase === 'play' || state.phase === 'kickoff' || state.phase === 'dead_ball';
  return live && state.addedMinutes !== null && state.addedMinutes > 0 ? state.addedMinutes : null;
}

/** Câu đọc cho trình đọc màn hình khi bắt đầu bù giờ. */
export const stoppageLabel = (minutes: number, locale: Locale = getActiveLocale()): string =>
  formatMessage(locale, 'hud.stoppageAria', { minutes });

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

/**
 * `prev` để giữ phút đã ghi của thẻ cũ (thẻ trong sim chỉ có `tick`, không có phút hiển thị);
 * thẻ mới lấy phút hiện tại.
 */
export function toHudSnapshot(
  state: MatchState,
  prev?: HudSnapshot,
  side: TeamSide = 'home',
): HudSnapshot {
  const c = state.players.find((p) => p.id === state.controlledId[side]);
  const clock = formatClock(matchClock(state));
  const r = state.restart;
  return {
    score: state.score,
    half: state.half,
    clock,
    stoppage: stoppageMinutes(state),
    phase: state.phase,
    controlled: c
      ? {
          id: c.id,
          number: playerNumber(c.id),
          position: c.position,
          stamina: Math.round(c.stamina),
        }
      : null,
    bookings: state.bookings.map((b, i) => ({
      playerId: b.playerId,
      team: b.team,
      card: b.card,
      number: playerNumber(b.playerId),
      clock: prev?.bookings[i]?.clock ?? clock,
    })),
    substitutions: state.substitutions.map((s, i) => ({
      team: s.team,
      inNumber: playerNumber(s.inId),
      outNumber: playerNumber(s.outId),
      clock: prev?.substitutions[i]?.clock ?? clock,
    })),
    ballDead: state.ballDead,
    subWindow: substitutionWindow(state, side),
    subsLeft: MAX_SUBS - state.subsUsed[side],
    shootout: state.shootout && {
      home: state.shootout.home,
      away: state.shootout.away,
      turn: state.restart ? state.shootout.kicking : null,
    },
    shots: state.shots,
    halfTimeReady: state.halfTimeReady.includes(side),
    foulRestart:
      r && (r.type === 'free_kick' || r.type === 'penalty')
        ? { type: r.type, team: r.team, startTick: r.startTick }
        : null,
  };
}

export function sameHud(a: HudSnapshot, b: HudSnapshot): boolean {
  return (
    a.score.home === b.score.home &&
    a.score.away === b.score.away &&
    a.half === b.half &&
    a.clock === b.clock &&
    a.stoppage === b.stoppage &&
    a.phase === b.phase &&
    a.bookings.length === b.bookings.length &&
    a.controlled?.id === b.controlled?.id &&
    a.controlled?.stamina === b.controlled?.stamina &&
    a.foulRestart?.startTick === b.foulRestart?.startTick &&
    a.ballDead === b.ballDead &&
    a.subWindow === b.subWindow &&
    a.substitutions.length === b.substitutions.length &&
    kicksTaken(a) === kicksTaken(b) &&
    a.shootout?.turn === b.shootout?.turn &&
    a.halfTimeReady === b.halfTimeReady
  );
}

const kicksTaken = (h: HudSnapshot): number =>
  h.shootout ? h.shootout.home.length + h.shootout.away.length : -1;

/** Số bàn luân lưu mỗi đội. */
export function shootoutScore(s: { home: boolean[]; away: boolean[] }): Score {
  return { home: s.home.filter(Boolean).length, away: s.away.filter(Boolean).length };
}

/**
 * Body nộp kết quả cuối trận (POST /matches/:id/result): tỉ số để đối chiếu + log input để server
 * chạy lại trận; thưởng/kết quả do server quyết định.
 */
export function resultBody(
  token: string,
  hud: Pick<HudSnapshot, 'score' | 'shootout'>,
  inputLog: string,
): SubmitMatchResultRequest {
  return {
    token,
    inputLog,
    homeGoals: hud.score.home,
    awayGoals: hud.score.away,
    ...(hud.shootout && { shootout: shootoutScore(hud.shootout) }),
  };
}

/** Đội nhà thắng/thua luân lưu (kết quả trận vẫn là Hoà, PRD §5); null nếu không có luân lưu. */
export function shootoutOutcome(hud: HudSnapshot): 'win' | 'loss' | null {
  if (!hud.shootout) return null;
  const winner = shootoutWinner(hud.shootout);
  if (!winner) return null;
  return winner === 'home' ? 'win' : 'loss';
}

export function teamLabel(team: TeamSide, locale: Locale = getActiveLocale()): string {
  return formatMessage(locale, team === 'home' ? 'hud.home' : 'hud.away');
}

export function cardLabel(card: 'yellow' | 'red', locale: Locale = getActiveLocale()): string {
  return formatMessage(locale, card === 'yellow' ? 'hud.yellowCard' : 'hud.redCard');
}

function restartLabel(type: 'free_kick' | 'penalty', locale: Locale): string {
  return formatMessage(locale, type === 'penalty' ? 'hud.penalty' : 'hud.freeKick');
}

/** Sự kiện mới giữa hai snapshot, hiện thành dải dưới bảng tỉ số. */
export function hudEvents(
  prev: HudSnapshot,
  next: HudSnapshot,
  locale: Locale = getActiveLocale(),
): HudEvent[] {
  const events: HudEvent[] = [];
  for (const team of ['home', 'away'] as const) {
    if (next.score[team] > prev.score[team]) {
      events.push({
        kind: 'goal',
        team,
        text: formatMessage(locale, 'hud.evGoal', {
          clock: next.clock,
          team: teamLabel(team, locale),
        }),
      });
    }
  }
  for (const b of next.bookings.slice(prev.bookings.length)) {
    events.push({
      kind: b.card,
      team: b.team,
      text: formatMessage(locale, 'hud.evCard', {
        clock: b.clock,
        card: cardLabel(b.card, locale),
        team: teamLabel(b.team, locale),
        num: b.number,
      }),
    });
  }
  for (const s of next.substitutions.slice(prev.substitutions.length)) {
    events.push({
      kind: 'sub',
      team: s.team,
      text: formatMessage(locale, 'hud.evSub', {
        clock: s.clock,
        team: teamLabel(s.team, locale),
        inNum: s.inNumber,
        outNum: s.outNumber,
      }),
    });
  }
  for (const team of ['home', 'away'] as const) {
    const kicks = next.shootout?.[team] ?? [];
    const before = prev.shootout?.[team].length ?? 0;
    for (const scored of kicks.slice(before)) {
      events.push({
        kind: 'shootout',
        team,
        text: formatMessage(locale, 'hud.evShootout', {
          team: teamLabel(team, locale),
          result: formatMessage(
            locale,
            scored ? 'hud.evShootoutHit' : 'hud.evShootoutMiss',
          ),
        }),
      });
    }
  }
  const foul = next.foulRestart;
  if (foul && foul.startTick !== prev.foulRestart?.startTick) {
    events.push({
      kind: 'foul',
      team: foul.team,
      text: formatMessage(locale, 'hud.evRestart', {
        clock: next.clock,
        type: restartLabel(foul.type, locale),
        team: teamLabel(foul.team, locale),
      }),
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

export interface SubCardMeta {
  cardId?: string;
  name?: string;
  shortName?: string;
  avatarSeed?: string;
  rarity?: Rarity;
  ovr?: number;
  level?: number;
}

export interface SubOnPitchOption extends SubCardMeta {
  id: string;
  number: number;
  position: Position;
  stamina: number;
}

export interface SubBenchOption extends SubCardMeta {
  slot: SquadSlot;
  number: number;
  position: Position;
  stamina?: number;
}

export interface SubOptions {
  onPitch: SubOnPitchOption[];
  bench: SubBenchOption[];
}

function resolveSubCardMeta(
  setup: MatchPlayerSetup | undefined,
  fallbackPosition: Position,
  fallbackStats: PlayerStats,
  catalog?: ReadonlyMap<string, Card>,
): SubCardMeta {
  const cardId = setup?.cardId;
  const card = cardId ? catalog?.get(cardId) : undefined;
  const stats = setup?.stats ?? fallbackStats;
  const ovr = computeOvr(card?.position ?? setup?.position ?? fallbackPosition, stats);
  return {
    ...(cardId !== undefined && { cardId }),
    ...(setup?.level !== undefined && { level: setup.level }),
    ...(card && {
      name: card.name,
      shortName: shortCardName(card.name),
      avatarSeed: card.avatarSeed,
      rarity: card.rarity,
    }),
    ovr,
  };
}

/** Người trên sân và dự bị của đội `side` cho menu thay người, kèm thông tin thẻ nếu có. */
export function subOptions(
  state: MatchState,
  teamPlayers?: readonly MatchPlayerSetup[],
  catalog?: ReadonlyMap<string, Card>,
  side: TeamSide = 'home',
): SubOptions {
  const bySlot = new Map<SquadSlot, MatchPlayerSetup>();
  if (teamPlayers) {
    for (const p of teamPlayers) bySlot.set(p.slot, p);
  }
  return {
    onPitch: state.players
      .filter((p) => p.team === side)
      .map((p) => ({
        id: p.id,
        number: playerNumber(p.id),
        position: p.position,
        stamina: Math.round(p.stamina),
        ...resolveSubCardMeta(bySlot.get(originSlot(p.id)), p.position, p.stats, catalog),
      })),
    bench: state.bench[side].map((b) => ({
      slot: b.slot,
      number: shirtNumber(b.slot),
      position: b.position,
      stamina: 100,
      ...resolveSubCardMeta(bySlot.get(b.slot) ?? b, b.position, b.stats, catalog),
    })),
  };
}

/** Thủ môn chỉ đổi thủ môn, cầu thủ ngoài sân chỉ đổi cầu thủ ngoài sân (luật trong sim). */
export const canSwap = (out: Position, incoming: Position): boolean =>
  (out === 'GK') === (incoming === 'GK');

const DIFFICULTY_KEY = 'mfg.play.difficulty';

/** Lưu độ khó lần trước vào localStorage, bọc try/catch (nguyên tắc 20). */
export function saveDifficulty(storage: Storage | null, d: Difficulty): void {
  if (!storage) return;
  try {
    storage.setItem(DIFFICULTY_KEY, d);
  } catch {
    /* localStorage bị chặn hoặc đầy — bỏ qua */
  }
}

/** Đọc độ khó lần trước từ localStorage; mặc định `'easy'` nếu chưa có hoặc không hợp lệ. */
export function loadSavedDifficulty(storage: Storage | null): Difficulty {
  if (!storage) return 'easy';
  try {
    return storage.getItem(DIFFICULTY_KEY) === 'hard' ? 'hard' : 'easy';
  } catch {
    return 'easy';
  }
}
