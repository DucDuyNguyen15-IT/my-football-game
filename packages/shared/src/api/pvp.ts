import { z } from 'zod';
import { BENCH_SLOTS, Difficulty, MatchOutcome, MatchTeamSetup } from '../match';

const BenchSlot = z.enum(BENCH_SLOTS);

/** Giao thức WebSocket PvP (docs/specs/pvp-realtime/contracts/ws-protocol.md). */

/** Bảng chữ mã phòng: bỏ I, O, 0, 1 cho khỏi nhầm. */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const RoomCode = z.string().regex(new RegExp(`^[${ROOM_CODE_ALPHABET}]{6}$`));

/** Mã input `buttonBits*9+dir`, 0..(2^9*9-1). */
export const PVP_INPUT_CODE_MAX = 2 ** 9 * 9 - 1;
export const InputCode = z.number().int().min(0).max(PVP_INPUT_CODE_MAX);

const TeamSide = z.enum(['home', 'away']);
const Uint32 = z.number().int().min(0).max(0xffff_ffff);

/** `setup` của sim (`MatchSetup` trong @pitch/sim) — khai ở đây để shared không phụ thuộc sim. */
export const PvpMatchSetup = z.object({
  home: MatchTeamSetup,
  away: MatchTeamSetup,
  seed: Uint32,
  difficulty: Difficulty,
  halfLengthSec: z.number().positive().optional(),
  autopilot: z.boolean().optional(),
  homeAi: z.enum(['teammate', 'proxy']).optional(),
  humans: z.array(TeamSide).max(2).optional(),
});
export type PvpMatchSetup = z.infer<typeof PvpMatchSetup>;

export const PvpEndReason = z.enum([
  'full_time',
  'forfeit_disconnect',
  'forfeit_desync',
  'void_desync',
  'void_both_left',
  'void_not_ready',
  'server_restart',
]);
export type PvpEndReason = z.infer<typeof PvpEndReason>;

export const PvpRewardReason = z.enum([
  'friendly',
  'forfeit',
  'daily_cap',
  'same_opponent_limit',
  'void',
]);
export type PvpRewardReason = z.infer<typeof PvpRewardReason>;

export const PvpErrorCode = z.enum([
  'room_not_found',
  'room_full',
  'room_expired',
  'self_join',
  'busy',
  'invalid_squad',
  'rate_limited',
  'bad_message',
  'sub_rejected',
  'not_in_match',
  'server_busy',
]);
export type PvpErrorCode = z.infer<typeof PvpErrorCode>;

const bare = <T extends string>(t: T) => z.object({ t: z.literal(t) }).strict();

// ---- Client -> Server ----

export const PvpClientMessage = z.discriminatedUnion('t', [
  bare('queue_join'),
  bare('queue_leave'),
  bare('room_create'),
  z.object({ t: z.literal('room_join'), code: RoomCode }).strict(),
  bare('room_leave'),
  bare('ready'),
  z.object({ t: z.literal('input'), c: InputCode }).strict(),
  z
    .object({
      t: z.literal('sub'),
      /** playerId trong sim: `${team}-${slot}`. */
      out: z.string().min(1).max(32),
      bench: BenchSlot,
    })
    .strict(),
  z
    .object({
      t: z.literal('hash'),
      tick: z
        .number()
        .int()
        .min(0)
        .refine((n) => n % 60 === 0, 'tick phải là bội số của 60'),
      h: Uint32,
    })
    .strict(),
  z.object({ t: z.literal('rejoin'), pvpId: z.number().int().positive() }).strict(),
  bare('catchup_done'),
  bare('leave'),
]);
export type PvpClientMessage = z.infer<typeof PvpClientMessage>;

// ---- Server -> Client ----

export const PvpSub = z.object({ team: TeamSide, out: z.string().min(1).max(32), bench: BenchSlot });
export type PvpSub = z.infer<typeof PvpSub>;

const Tick = z.number().int().min(0);

/** Khung lockstep: [tick, homeCode, awayCode] hoặc kèm `subs` (áp dụng trước `step`). */
export const PvpFrame = z.object({
  t: z.literal('f'),
  f: z.union([
    z.tuple([Tick, InputCode, InputCode]),
    z.tuple([Tick, InputCode, InputCode, z.array(PvpSub).min(1)]),
  ]),
});
export type PvpFrame = z.infer<typeof PvpFrame>;

export const PvpServerMessage = z.discriminatedUnion('t', [
  z.object({
    t: z.literal('queue_status'),
    waitedSec: z.number().int().min(0),
    offerCpu: z.boolean(),
  }),
  bare('queue_timeout'),
  z.object({ t: z.literal('room_created'), code: RoomCode, expiresAt: z.string() }),
  z.object({
    t: z.literal('matched'),
    pvpId: z.number().int().positive(),
    kind: z.enum(['ranked', 'friendly']),
    side: TeamSide,
    opponent: z.object({ username: z.string(), squad: MatchTeamSetup }),
    setup: PvpMatchSetup,
  }),
  // Tương đối, không có startAt theo đồng hồ server.
  z.object({ t: z.literal('start'), countdownMs: z.number().int().positive() }),
  PvpFrame,
  z.object({
    t: z.literal('catchup'),
    setup: PvpMatchSetup,
    log: z.string().regex(/^(v2.)?[A-Za-z0-9_-]*$/),
    tick: Tick,
  }),
  z.object({ t: z.literal('opp_disconnected'), remainingMs: z.number().int().min(0) }),
  bare('opp_reconnected'),
  z.object({
    t: z.literal('end'),
    reason: PvpEndReason,
    home: z.number().int().min(0),
    away: z.number().int().min(0),
    you: z.object({
      outcome: MatchOutcome,
      reward: z.number().int().min(0),
      rewardReason: PvpRewardReason.optional(),
    }),
  }),
  z.object({ t: z.literal('error'), code: PvpErrorCode }),
]);
export type PvpServerMessage = z.infer<typeof PvpServerMessage>;
