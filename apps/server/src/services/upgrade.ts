// Ép thẻ (ARCHITECTURE §5.3, PRD §6.5 F10): một transaction, khoá users → player_cards (id tăng
// dần), idempotency theo `card_upgrades (user_id, idempotency_key)`.
import { and, asc, eq, inArray } from 'drizzle-orm';
import { UpgradeCardResult } from '@pitch/shared';
import { UPGRADE } from '../config/economy';
import type { Db, Tx } from '../db/client';
import { analyticsEvents, cardUpgrades, playerCards, squadSlots } from '../db/schema';
import { cryptoRng, type Rng } from '../domain/rng';
import { isValidMaterial, rollUpgrade, upgradeFee } from '../domain/upgrade';
import { AppError } from '../plugins/errors';
import { isUniqueViolation } from './auth';
import type { CardCatalog } from './cards';
import { applyCoinDelta, lockUser } from './wallet';

export interface UpgradeCardInput {
  userId: number;
  playerCardId: number;
  materialId: number;
  idempotencyKey: string;
}

/**
 * POST /player-cards/:id/upgrade. Gửi lại cùng key → trả nguyên văn kết quả cũ (không trừ phí lần
 * 2); cùng key khác thẻ/nguyên liệu → 409 `idempotency_conflict`. Mọi lỗi → rollback, không đổi gì.
 */
export async function upgradeCard(
  db: Db,
  catalog: CardCatalog,
  input: UpgradeCardInput,
  rng: Rng = cryptoRng,
): Promise<UpgradeCardResult> {
  if (input.playerCardId === input.materialId) {
    throw new AppError('invalid_material', 422, 'Không dùng chính thẻ được ép làm nguyên liệu');
  }
  try {
    return await db.transaction((tx) => upgradeInTx(tx, catalog, input, rng));
  } catch (err) {
    // Chốt chặn (không xảy ra khi đã khoá users): race trên UNIQUE (user_id, key) → đọc kết quả cũ.
    if (isUniqueViolation(err, 'card_upgrades_user_key_uq')) {
      return db.transaction((tx) => upgradeInTx(tx, catalog, input, rng));
    }
    throw err;
  }
}

async function upgradeInTx(
  tx: Tx,
  catalog: CardCatalog,
  { userId, playerCardId, materialId, idempotencyKey }: UpgradeCardInput,
  rng: Rng,
): Promise<UpgradeCardResult> {
  const user = await lockUser(tx, userId);

  const [prior] = await tx
    .select()
    .from(cardUpgrades)
    .where(and(eq(cardUpgrades.userId, userId), eq(cardUpgrades.idempotencyKey, idempotencyKey)));
  if (prior) {
    if (prior.playerCardId !== playerCardId || prior.materialPlayerCardId !== materialId) {
      throw new AppError('idempotency_conflict', 409, 'Idempotency-Key đã dùng cho yêu cầu khác');
    }
    return UpgradeCardResult.parse(prior.result);
  }

  const rows = await tx
    .select({
      id: playerCards.id,
      cardId: playerCards.cardId,
      level: playerCards.level,
      luck: playerCards.luck,
    })
    .from(playerCards)
    .where(and(eq(playerCards.userId, userId), inArray(playerCards.id, [playerCardId, materialId])))
    .orderBy(asc(playerCards.id))
    .for('update');
  const target = rows.find((r) => r.id === playerCardId);
  const material = rows.find((r) => r.id === materialId);
  if (!target || !material) throw new AppError('not_found', 404, 'Không tìm thấy thẻ');

  if (target.level >= UPGRADE.maxLevel) {
    throw new AppError('max_level', 422, `Thẻ đã đạt +${UPGRADE.maxLevel}`);
  }
  const targetRarity = rarityOf(catalog, target.cardId);
  const materialRarity = rarityOf(catalog, material.cardId);
  if (!isValidMaterial(targetRarity, materialRarity)) {
    throw new AppError('invalid_material', 422, 'Nguyên liệu phải cùng độ hiếm trở lên');
  }
  const [inSquad] = await tx
    .select({ id: squadSlots.playerCardId })
    .from(squadSlots)
    .where(eq(squadSlots.playerCardId, materialId))
    .limit(1);
  if (inSquad) {
    throw new AppError('card_in_squad', 409, 'Nguyên liệu đang trong đội hình');
  }
  const fee = upgradeFee(target.level, targetRarity);
  if (user.coins < fee) throw new AppError('insufficient_coins', 409, 'Không đủ xu');

  const roll = rollUpgrade(target, rng);
  const result: UpgradeCardResult = {
    success: roll.success,
    level: roll.level,
    luck: roll.luck,
    rate: roll.rate,
    fee,
    balance: user.coins - fee,
  };

  await tx.delete(playerCards).where(eq(playerCards.id, materialId));
  await tx
    .update(playerCards)
    .set({ level: roll.level, luck: roll.luck })
    .where(eq(playerCards.id, playerCardId));
  const [upgrade] = await tx
    .insert(cardUpgrades)
    .values({
      userId,
      playerCardId,
      materialPlayerCardId: materialId,
      materialCardId: material.cardId,
      result,
      fromLevel: target.level,
      toLevel: roll.level,
      rate: roll.rate,
      success: roll.success,
      idempotencyKey,
    })
    .returning({ id: cardUpgrades.id });
  const balance = await applyCoinDelta(tx, userId, -fee, 'upgrade_fee', {
    type: 'card_upgrade',
    id: upgrade!.id,
  });
  if (balance !== result.balance) throw new Error('Số dư lệch khi ép thẻ');
  await tx.insert(analyticsEvents).values({
    userId,
    name: 'upgrade',
    props: {
      fromLevel: target.level,
      success: roll.success,
      rate: roll.rate,
      fee,
      rarity: targetRarity,
      materialRarity,
    },
  });
  return result;
}

function rarityOf(catalog: CardCatalog, cardId: number) {
  const card = catalog.byId.get(String(cardId));
  if (!card) throw new Error(`Thẻ mẫu ${cardId} không có trong danh mục`);
  return card.rarity;
}
