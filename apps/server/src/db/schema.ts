/**
 * Schema DB (ARCHITECTURE §3.1–3.2). Quy ước: PK `bigint generated always as identity`, chuỗi `text`,
 * thời gian `timestamptz`, xu là số nguyên. `bigint` đọc ra dạng `number` (an toàn tới 2^53).
 * Trigger append-only của `coin_transactions` nằm trong migration SQL viết tay (`drizzle/`).
 */
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

const id = () => bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity();
const userRef = (name = 'user_id') => bigint(name, { mode: 'number' });
const ts = (name: string) => timestamp(name, { withTimezone: true });
const createdAt = () => ts('created_at').notNull().defaultNow();

// 3.1 Enum
export const positionEnum = pgEnum('position', ['GK', 'DF', 'MF', 'FW']);
export const rarityEnum = pgEnum('rarity', ['bronze', 'silver', 'gold', 'legend']);
export const formationEnum = pgEnum('formation', ['2-3-1', '3-2-1', '2-2-2']);
export const difficultyEnum = pgEnum('difficulty', ['easy', 'hard']);
export const matchStatusEnum = pgEnum('match_status', ['started', 'finished', 'expired']);
export const matchOutcomeEnum = pgEnum('match_outcome', [
  'win',
  'draw',
  'loss',
  'shootout_win',
  'shootout_loss',
]);
export const cardSourceEnum = pgEnum('card_source', ['starter', 'pack']);
export const coinTxTypeEnum = pgEnum('coin_tx_type', [
  'starter_grant',
  'pack_purchase',
  'card_sale',
  'upgrade_fee',
  'match_reward',
  'mission_reward',
  'admin_adjust',
]);

// 3.2 Bảng
export const users = pgTable(
  'users',
  {
    id: id(),
    username: text('username').notNull(),
    passwordHash: text('password_hash').notNull(),
    email: text('email'),
    coins: bigint('coins', { mode: 'number' }).notNull().default(0),
    freePack5Credits: smallint('free_pack5_credits').notNull().default(0),
    failedLoginCount: smallint('failed_login_count').notNull().default(0),
    failedLoginWindowStart: ts('failed_login_window_start'),
    lockedUntil: ts('locked_until'),
    isAdmin: boolean('is_admin').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('users_username_lower_uq').on(sql`lower(${t.username})`),
    check('users_coins_nonneg', sql`${t.coins} >= 0`),
    check('users_free_pack5_nonneg', sql`${t.freePack5Credits} >= 0`),
  ],
);

export const sessions = pgTable(
  'sessions',
  {
    /** SHA-256 (hex) của token trong cookie — lộ DB không lộ phiên. */
    id: text('id').primaryKey(),
    userId: userRef()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: ts('expires_at').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('sessions_user_idx').on(t.userId), index('sessions_expires_idx').on(t.expiresAt)],
);

const statCol = (name: string) => smallint(name).notNull();

export const cards = pgTable(
  'cards',
  {
    /** Cố định theo seed để ổn định giữa các môi trường. */
    id: integer('id').primaryKey(),
    code: text('code').notNull().unique(),
    name: text('name').notNull(),
    nickname: text('nickname').notNull(),
    position: positionEnum('position').notNull(),
    rarity: rarityEnum('rarity').notNull(),
    pace: statCol('pace'),
    shooting: statCol('shooting'),
    passing: statCol('passing'),
    dribbling: statCol('dribbling'),
    defending: statCol('defending'),
    stamina: statCol('stamina'),
    reflexes: statCol('reflexes'),
    handling: statCol('handling'),
    positioning: statCol('positioning'),
    kicking: statCol('kicking'),
    ovr: smallint('ovr').notNull(),
    avatarSeed: text('avatar_seed').notNull(),
  },
  (t) => [
    index('cards_rarity_idx').on(t.rarity),
    check(
      'cards_stats_range',
      sql`least(${t.pace}, ${t.shooting}, ${t.passing}, ${t.dribbling}, ${t.defending}, ${t.stamina}, ${t.reflexes}, ${t.handling}, ${t.positioning}, ${t.kicking}) >= 1 and greatest(${t.pace}, ${t.shooting}, ${t.passing}, ${t.dribbling}, ${t.defending}, ${t.stamina}, ${t.reflexes}, ${t.handling}, ${t.positioning}, ${t.kicking}) <= 99`,
    ),
    check('cards_ovr_range', sql`${t.ovr} between 1 and 99`),
  ],
);

export const playerCards = pgTable(
  'player_cards',
  {
    id: id(),
    userId: userRef()
      .notNull()
      .references(() => users.id),
    cardId: integer('card_id')
      .notNull()
      .references(() => cards.id),
    level: smallint('level').notNull().default(0),
    luck: smallint('luck').notNull().default(0),
    source: cardSourceEnum('source').notNull(),
    acquiredAt: ts('acquired_at').notNull(),
  },
  (t) => [
    index('player_cards_user_card_idx').on(t.userId, t.cardId),
    index('player_cards_card_idx').on(t.cardId),
    check('player_cards_level_range', sql`${t.level} between 0 and 5`),
    check('player_cards_luck_range', sql`${t.luck} between 0 and 100`),
  ],
);

export const packBoxes = pgTable(
  'pack_boxes',
  {
    userId: userRef()
      .primaryKey()
      .references(() => users.id),
    bronzeLeft: smallint('bronze_left').notNull(),
    silverLeft: smallint('silver_left').notNull(),
    goldLeft: smallint('gold_left').notNull(),
    legendLeft: smallint('legend_left').notNull(),
    cycle: integer('cycle').notNull().default(1),
    updatedAt: ts('updated_at').notNull(),
  },
  (t) => [
    check(
      'pack_boxes_left_nonneg',
      sql`${t.bronzeLeft} >= 0 and ${t.silverLeft} >= 0 and ${t.goldLeft} >= 0 and ${t.legendLeft} >= 0`,
    ),
    check(
      'pack_boxes_total_range',
      sql`${t.bronzeLeft} + ${t.silverLeft} + ${t.goldLeft} + ${t.legendLeft} between 0 and 100`,
    ),
  ],
);

export const packOpenings = pgTable(
  'pack_openings',
  {
    id: id(),
    userId: userRef()
      .notNull()
      .references(() => users.id),
    idempotencyKey: uuid('idempotency_key').notNull(),
    packCode: text('pack_code').notNull(),
    payment: text('payment').notNull(),
    price: integer('price').notNull(),
    result: jsonb('result').notNull(),
    boxCycle: integer('box_cycle').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('pack_openings_user_key_uq').on(t.userId, t.idempotencyKey),
    index('pack_openings_user_created_idx').on(t.userId, t.createdAt),
    check('pack_openings_payment', sql`${t.payment} in ('coins', 'free_credit')`),
    check('pack_openings_price_nonneg', sql`${t.price} >= 0`),
  ],
);

export const squads = pgTable('squads', {
  userId: userRef()
    .primaryKey()
    .references(() => users.id),
  formation: formationEnum('formation').notNull().default('2-3-1'),
  updatedAt: ts('updated_at').notNull(),
});

export const squadSlots = pgTable(
  'squad_slots',
  {
    userId: userRef()
      .notNull()
      .references(() => squads.userId),
    /** GK, P1…P6 đá chính (vai trò suy từ sơ đồ), B1…B5 dự bị. */
    slot: text('slot').notNull(),
    /** Một thẻ chỉ ở một ô; RESTRICT chặn bán/ép thẻ đang trong đội hình (PRD §6.4). */
    playerCardId: bigint('player_card_id', { mode: 'number' })
      .notNull()
      .unique('squad_slots_player_card_uq')
      .references(() => playerCards.id, { onDelete: 'restrict' }),
  },
  (t) => [
    primaryKey({ name: 'squad_slots_pk', columns: [t.userId, t.slot] }),
    check(
      'squad_slots_slot',
      sql`${t.slot} in ('GK', 'P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'B1', 'B2', 'B3', 'B4', 'B5')`,
    ),
  ],
);

export const matches = pgTable(
  'matches',
  {
    id: id(),
    userId: userRef()
      .notNull()
      .references(() => users.id),
    tokenHash: text('token_hash').notNull().unique(),
    difficulty: difficultyEnum('difficulty').notNull(),
    status: matchStatusEnum('status').notNull().default('started'),
    seed: bigint('seed', { mode: 'number' }).notNull(),
    squadSnapshot: jsonb('squad_snapshot').notNull(),
    rewardEligible: boolean('reward_eligible').notNull(),
    startedAt: ts('started_at').notNull(),
    finishedAt: ts('finished_at'),
    homeGoals: smallint('home_goals'),
    awayGoals: smallint('away_goals'),
    outcome: matchOutcomeEnum('outcome'),
    reward: integer('reward').notNull().default(0),
    /** Ngày GMT+7 lúc nộp kết quả, để đếm trần trận có thưởng/ngày. */
    rewardDay: date('reward_day'),
  },
  (t) => [
    index('matches_user_started_idx').on(t.userId, t.startedAt),
    index('matches_user_reward_day_idx')
      .on(t.userId, t.rewardDay)
      .where(sql`${t.reward} > 0`),
    check('matches_home_goals_range', sql`${t.homeGoals} between 0 and 20`),
    check('matches_away_goals_range', sql`${t.awayGoals} between 0 and 20`),
    check('matches_reward_nonneg', sql`${t.reward} >= 0`),
  ],
);

export const coinTransactions = pgTable(
  'coin_transactions',
  {
    id: id(),
    userId: userRef()
      .notNull()
      .references(() => users.id),
    type: coinTxTypeEnum('type').notNull(),
    amount: integer('amount').notNull(),
    balanceAfter: bigint('balance_after', { mode: 'number' }).notNull(),
    refType: text('ref_type'),
    /** Không FK: dòng tham chiếu có thể đã bị xoá (VD thẻ đã bán). */
    refId: bigint('ref_id', { mode: 'number' }),
    createdAt: createdAt(),
  },
  (t) => [
    index('coin_transactions_user_id_idx').on(t.userId, t.id),
    check('coin_transactions_amount_nonzero', sql`${t.amount} <> 0`),
    check('coin_transactions_balance_nonneg', sql`${t.balanceAfter} >= 0`),
    check(
      'coin_transactions_ref_type',
      sql`${t.refType} is null or ${t.refType} in ('match', 'pack_opening', 'card_upgrade', 'player_card')`,
    ),
  ],
);

export const cardUpgrades = pgTable(
  'card_upgrades',
  {
    id: id(),
    userId: userRef()
      .notNull()
      .references(() => users.id),
    playerCardId: bigint('player_card_id', { mode: 'number' }).notNull(),
    materialPlayerCardId: bigint('material_player_card_id', { mode: 'number' }).notNull(),
    materialCardId: integer('material_card_id').notNull(),
    result: jsonb('result').notNull(),
    fromLevel: smallint('from_level').notNull(),
    toLevel: smallint('to_level').notNull(),
    rate: smallint('rate').notNull(),
    success: boolean('success').notNull(),
    idempotencyKey: uuid('idempotency_key').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index('card_upgrades_user_idx').on(t.userId),
    uniqueIndex('card_upgrades_user_key_uq').on(t.userId, t.idempotencyKey),
  ],
);

export const dailyMissions = pgTable(
  'daily_missions',
  {
    userId: userRef()
      .notNull()
      .references(() => users.id),
    day: date('day').notNull(),
    missionCode: text('mission_code').notNull(),
    progress: smallint('progress').notNull().default(0),
    target: smallint('target').notNull(),
    reward: integer('reward').notNull(),
    claimedAt: ts('claimed_at'),
  },
  (t) => [
    primaryKey({ name: 'daily_missions_pk', columns: [t.userId, t.day, t.missionCode] }),
    check('daily_missions_progress_nonneg', sql`${t.progress} >= 0`),
  ],
);

export const analyticsEvents = pgTable(
  'analytics_events',
  {
    id: id(),
    userId: userRef().references(() => users.id),
    name: text('name').notNull(),
    props: jsonb('props').notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [
    index('analytics_events_created_brin').using('brin', t.createdAt),
    index('analytics_events_name_created_idx').on(t.name, t.createdAt),
    index('analytics_events_user_idx').on(t.userId),
  ],
);
