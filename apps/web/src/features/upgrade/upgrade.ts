// Tính toán thuần cho màn ép thẻ (PRD §6.5, F10). Chỉ để HIỂN THỊ trước khi ép — kết quả thật do
// server quyết định (POST /player-cards/:id/upgrade); số liệu bảng ép đọc từ GET /config/economy.
import {
  computeOvr,
  effectiveStats,
  LEVEL_STAT_BONUS,
  Rarity,
  type Card,
  type PlayerCard,
  type PlayerStats,
  type UpgradeConfig,
} from '@pitch/shared';
import { ApiClientError } from '../../api/client';
import { RARITY_INFO } from '../../components/card/rarity';

export interface UpgradePreview {
  /** Cấp đích. */
  toLevel: number;
  baseRate: number;
  luck: number;
  /** Tỉ lệ thật = min(100, cơ bản + may mắn). */
  rate: number;
  fee: number;
  /** Chỉ số ở cấp hiện tại / cấp đích (chưa tính phạt sai vị trí). */
  before: PlayerStats;
  after: PlayerStats;
  ovrBefore: number;
  ovrAfter: number;
  bonusBefore: number;
  bonusAfter: number;
}

/** Xem trước một lần ép; `null` khi thẻ đã đạt cấp tối đa. */
export function upgradePreview(
  card: Card,
  state: Pick<PlayerCard, 'level' | 'luck'>,
  cfg: UpgradeConfig,
): UpgradePreview | null {
  const step = cfg.steps[state.level];
  if (state.level >= cfg.maxLevel || !step) return null;
  const before = effectiveStats(card, state.level);
  const after = effectiveStats(card, step.toLevel);
  return {
    toLevel: step.toLevel,
    baseRate: step.baseRate,
    luck: state.luck,
    rate: Math.min(100, step.baseRate + state.luck),
    fee: step.baseFee * cfg.rarityFeeMultiplier[card.rarity],
    before,
    after,
    ovrBefore: computeOvr(card.position, before),
    ovrAfter: computeOvr(card.position, after),
    bonusBefore: LEVEL_STAT_BONUS[state.level] ?? 0,
    bonusAfter: LEVEL_STAT_BONUS[step.toLevel] ?? 0,
  };
}

const rank = (r: Rarity) => Rarity.options.indexOf(r);

/** Nguyên liệu phải cùng độ hiếm trở lên so với thẻ được ép (PRD §6.5). */
export function isValidMaterial(target: Rarity, material: Rarity): boolean {
  return rank(material) >= rank(target);
}

export interface CardItem {
  pc: PlayerCard;
  card: Card;
}

/**
 * Nguyên liệu dùng được cho `target`: khác thẻ được ép, không trong đội hình, cùng độ hiếm trở lên.
 * Sắp "rẻ" trước (độ hiếm thấp → chưa ép → OVR thấp) để người chơi khỏi lỡ tay đốt thẻ quý.
 * `inSquad` = số thẻ đủ độ hiếm nhưng bị khoá vì đang trong đội hình.
 */
export function materialCandidates(
  target: PlayerCard,
  owned: readonly PlayerCard[],
  catalog: ReadonlyMap<string, Card>,
): { valid: CardItem[]; inSquad: number } {
  const targetCard = catalog.get(target.cardId);
  if (!targetCard) return { valid: [], inSquad: 0 };
  const valid: CardItem[] = [];
  let inSquad = 0;
  for (const pc of owned) {
    const card = catalog.get(pc.cardId);
    if (pc.id === target.id || !card || !isValidMaterial(targetCard.rarity, card.rarity)) continue;
    if (pc.inSquad) inSquad++;
    else valid.push({ pc, card });
  }
  valid.sort(
    (a, b) =>
      rank(a.card.rarity) - rank(b.card.rarity) ||
      a.pc.level - b.pc.level ||
      a.card.ovr - b.card.ovr ||
      Number(a.pc.id) - Number(b.pc.id),
  );
  return { valid, inSquad };
}

/** Cảnh báo trước khi ép: nguyên liệu luôn mất, kể cả khi đã có cấp + hoặc hiếm hơn thẻ được ép. */
export function materialWarnings(
  target: Card,
  material: Card,
  materialState: Pick<PlayerCard, 'level'>,
): string[] {
  const out = [`Nguyên liệu ${material.name} sẽ mất dù ép thành công hay thất bại.`];
  if (materialState.level > 0) {
    out.push(`Nguyên liệu đang +${materialState.level} — cấp ép của nó cũng mất theo.`);
  }
  if (rank(material.rarity) > rank(target.rarity)) {
    out.push(
      `Nguyên liệu ${RARITY_INFO[material.rarity].label} hiếm hơn thẻ được ép (${RARITY_INFO[target.rarity].label}).`,
    );
  }
  return out;
}

/** Nguyên liệu quý (đã +, Vàng trở lên, hoặc hiếm hơn thẻ được ép) → phải bấm giữ để xác nhận. */
export function needsHoldConfirm(
  target: Card,
  material: Card,
  materialState: Pick<PlayerCard, 'level'>,
): boolean {
  return (
    materialState.level > 0 ||
    rank(material.rarity) >= rank('gold') ||
    rank(material.rarity) > rank(target.rarity)
  );
}

export function upgradeErrorMessage(err: unknown): string {
  if (err instanceof ApiClientError) {
    switch (err.code) {
      case 'insufficient_coins':
        return 'Không đủ xu để ép thẻ.';
      case 'card_in_squad':
        return 'Nguyên liệu đang trong đội hình — gỡ khỏi đội rồi thử lại.';
      case 'max_level':
        return 'Thẻ đã đạt cấp tối đa.';
      case 'invalid_material':
        return 'Nguyên liệu không hợp lệ (phải cùng độ hiếm trở lên và khác thẻ được ép).';
      case 'not_found':
        return 'Thẻ không còn trong kho. Danh sách đã được làm mới.';
      case 'network_error':
        return 'Mất kết nối — hãy thử lại (không bị trừ xu hai lần).';
      default:
        return err.message;
    }
  }
  return 'Có lỗi xảy ra, hãy thử lại.';
}
