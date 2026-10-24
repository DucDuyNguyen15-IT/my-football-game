// Mở gói thẻ theo đúng ARCHITECTURE §5.1: một transaction, khoá users → pack_boxes, idempotency.
import { and, eq } from 'drizzle-orm';
import {
  effectiveStats,
  OpenPackResult,
  type PackBox,
  type PackInfo,
  type PackPayment,
} from '@pitch/shared';
import { PACKS, type PackCode } from '../config/economy';
import type { Db, Tx } from '../db/client';
import { analyticsEvents, packBoxes, packOpenings, playerCards, users } from '../db/schema';
import {
  boxTotal,
  drawTickets,
  guaranteeAvailable,
  nextOdds,
  pickCard,
  type Box,
} from '../domain/gacha';
import { cryptoRng, type Rng } from '../domain/rng';
import { AppError } from '../plugins/errors';
import { isUniqueViolation } from './auth';
import type { CardCatalog } from './cards';
import { applyCoinDelta, lockUser } from './wallet';

type BoxRow = typeof packBoxes.$inferSelect;

const toBox = (row: BoxRow): Box => ({
  left: {
    bronze: row.bronzeLeft,
    silver: row.silverLeft,
    gold: row.goldLeft,
    legend: row.legendLeft,
  },
  cycle: row.cycle,
});

export function toPackBox(box: Box): PackBox {
  return {
    left: { ...box.left },
    total: boxTotal(box.left),
    nextOdds: nextOdds(box),
    cycle: box.cycle,
  };
}

export function isPackCode(code: string): code is PackCode {
  return Object.hasOwn(PACKS, code);
}

function packInfos(box: Box): PackInfo[] {
  return Object.entries(PACKS).map(([code, p]) => ({
    code,
    size: p.size,
    price: p.price,
    guaranteeAvailable: p.guarantee && guaranteeAvailable(box, p.size),
  }));
}

async function readBox(db: Db | Tx, userId: number, forUpdate: boolean): Promise<Box> {
  const q = db.select().from(packBoxes).where(eq(packBoxes.userId, userId));
  const [row] = forUpdate ? await q.for('update') : await q;
  if (!row) throw new Error(`Người chơi ${userId} không có hộp phiếu`);
  return toBox(row);
}

/** GET /packs: danh mục gói + hộp hiện tại (chỉ đọc, không khoá). */
export async function getPacks(
  db: Db,
  userId: number,
): Promise<{ packs: PackInfo[]; box: PackBox }> {
  const box = await readBox(db, userId, false);
  return { packs: packInfos(box), box: toPackBox(box) };
}

export interface OpenPackInput {
  userId: number;
  packCode: PackCode;
  payment: PackPayment;
  idempotencyKey: string;
  now: Date;
}

/**
 * POST /packs/:code/open. Gửi lại cùng key → trả nguyên văn kết quả cũ (không trừ xu lần 2); cùng key
 * khác gói/cách trả → 409 `idempotency_conflict`. Mọi lỗi giữa chừng → rollback, không đổi gì.
 */
export async function openPack(
  db: Db,
  catalog: CardCatalog,
  input: OpenPackInput,
  rng: Rng = cryptoRng,
): Promise<OpenPackResult> {
  const pack = PACKS[input.packCode];
  if (input.payment === 'free_credit' && !pack.freeCredit) {
    throw new AppError('validation_error', 400, 'Gói này không mở bằng lượt miễn phí');
  }
  try {
    return await db.transaction((tx) => openInTx(tx, catalog, input, rng));
  } catch (err) {
    // Chốt chặn (không xảy ra khi đã khoá users): race trên UNIQUE (user_id, key) → đọc kết quả cũ.
    if (isUniqueViolation(err, 'pack_openings_user_key_uq')) {
      return db.transaction((tx) => openInTx(tx, catalog, input, rng));
    }
    throw err;
  }
}

async function openInTx(
  tx: Tx,
  catalog: CardCatalog,
  { userId, packCode, payment, idempotencyKey, now }: OpenPackInput,
  rng: Rng,
): Promise<OpenPackResult> {
  const pack = PACKS[packCode];
  const user = await lockUser(tx, userId);

  const [prior] = await tx
    .select()
    .from(packOpenings)
    .where(and(eq(packOpenings.userId, userId), eq(packOpenings.idempotencyKey, idempotencyKey)));
  if (prior) {
    if (prior.packCode !== packCode || prior.payment !== payment) {
      throw new AppError('idempotency_conflict', 409, 'Idempotency-Key đã dùng cho yêu cầu khác');
    }
    return OpenPackResult.parse(prior.result);
  }

  const price = payment === 'coins' ? pack.price : 0;
  if (payment === 'coins' && user.coins < price) {
    throw new AppError('insufficient_coins', 409, 'Không đủ xu');
  }
  if (payment === 'free_credit' && user.freePack5Credits < 1) {
    throw new AppError('insufficient_coins', 409, 'Đã hết lượt mở miễn phí');
  }

  const box = await readBox(tx, userId, true);
  const drawn = drawTickets(box, pack.size, { guarantee: pack.guarantee }, rng);
  const picked = drawn.rarities.map((r) => pickCard(catalog.byRarity, r, rng));

  let freePack5Credits = user.freePack5Credits;
  if (payment === 'free_credit') {
    freePack5Credits -= 1;
    await tx.update(users).set({ freePack5Credits }).where(eq(users.id, userId));
  }
  await tx
    .update(packBoxes)
    .set({
      bronzeLeft: drawn.box.left.bronze,
      silverLeft: drawn.box.left.silver,
      goldLeft: drawn.box.left.gold,
      legendLeft: drawn.box.left.legend,
      cycle: drawn.box.cycle,
      updatedAt: now,
    })
    .where(eq(packBoxes.userId, userId));
  const inserted = await tx
    .insert(playerCards)
    .values(
      picked.map((c) => ({
        userId,
        cardId: Number(c.id),
        source: 'pack' as const,
        acquiredAt: now,
      })),
    )
    .returning({ id: playerCards.id });

  const result: OpenPackResult = {
    cards: picked.map((card, i) => ({
      id: String(inserted[i]!.id),
      cardId: card.id,
      level: 0,
      luck: 0,
      inSquad: false,
      effectiveStats: effectiveStats(card, 0),
    })),
    box: toPackBox(drawn.box),
    balance: user.coins - price,
    freePack5Credits,
  };
  const [opening] = await tx
    .insert(packOpenings)
    .values({
      userId,
      idempotencyKey,
      packCode,
      payment,
      price,
      result,
      boxCycle: box.cycle,
    })
    .returning({ id: packOpenings.id });
  if (price > 0) {
    const balance = await applyCoinDelta(tx, userId, -price, 'pack_purchase', {
      type: 'pack_opening',
      id: opening!.id,
    });
    if (balance !== result.balance) throw new Error('Số dư lệch khi mở gói');
  }
  await tx.insert(analyticsEvents).values({
    userId,
    name: 'pack_open',
    props: { pack: packCode, payment, price, rarities: drawn.rarities, boxCycle: box.cycle },
  });
  return result;
}
