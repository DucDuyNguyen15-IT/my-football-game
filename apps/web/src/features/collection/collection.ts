import {
  PlayerCardSort,
  Position,
  Rarity,
  type Card,
  type EconomyConfig,
  type PlayerCard,
} from '@pitch/shared';

export interface CollectionFilter {
  position?: Position;
  rarity?: Rarity;
  sort: PlayerCardSort;
  /** Tìm theo tên/biệt danh (lọc ở client). */
  q: string;
  /** Chỉ thẻ đang trong đội hình (lọc ở client). */
  squad: boolean;
}

/** Bộ lọc lưu trên URL (`?pos=FW&rarity=gold&sort=-ovr&q=…&squad=1`, DESIGN.md §6.4); giá trị lạ bị bỏ qua. */
export function readFilter(params: URLSearchParams): CollectionFilter {
  const pos = Position.safeParse(params.get('pos'));
  const rarity = Rarity.safeParse(params.get('rarity'));
  const sort = PlayerCardSort.safeParse(params.get('sort'));
  return {
    position: pos.success ? pos.data : undefined,
    rarity: rarity.success ? rarity.data : undefined,
    sort: sort.success ? sort.data : '-ovr',
    q: params.get('q') ?? '',
    squad: params.get('squad') === '1',
  };
}

export function writeFilter(f: CollectionFilter): URLSearchParams {
  const p = new URLSearchParams();
  if (f.position) p.set('pos', f.position);
  if (f.rarity) p.set('rarity', f.rarity);
  if (f.sort !== '-ovr') p.set('sort', f.sort);
  if (f.q) p.set('q', f.q);
  if (f.squad) p.set('squad', '1');
  return p;
}

const FILTER_KEY = 'mfg.collection.filter';

/** Lưu bộ lọc/sắp xếp (trừ từ khoá tìm kiếm tạm thời) vào localStorage, bọc try/catch. */
export function saveFilter(storage: Storage | null, f: CollectionFilter): void {
  if (!storage) return;
  try {
    storage.setItem(
      FILTER_KEY,
      JSON.stringify({
        position: f.position ?? null,
        rarity: f.rarity ?? null,
        sort: f.sort,
        squad: f.squad,
      }),
    );
  } catch {
    /* localStorage bị chặn hoặc đầy — bỏ qua */
  }
}

/** Đọc bộ lọc/sắp xếp lần trước từ localStorage; trả `null` nếu chưa có hoặc lỗi. */
export function loadSavedFilter(storage: Storage | null): Partial<CollectionFilter> | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(FILTER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') return null;
    const pos = Position.safeParse(parsed.position);
    const rarity = Rarity.safeParse(parsed.rarity);
    const sort = PlayerCardSort.safeParse(parsed.sort);
    return {
      position: pos.success ? pos.data : undefined,
      rarity: rarity.success ? rarity.data : undefined,
      sort: sort.success ? sort.data : '-ovr',
      squad: parsed.squad === true,
    };
  } catch {
    return null;
  }
}

/** Bỏ dấu + chữ thường để "nguyen" khớp "Nguyễn". */
const fold = (s: string) =>
  s.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();

export function matchesQuery(card: Card, q: string): boolean {
  const needle = fold(q.trim());
  return !needle || fold(`${card.name} ${card.nickname}`).includes(needle);
}

type Priced = Pick<PlayerCard, 'cardId' | 'level'>;

/** Tổng xu nhận được khi bán (giá theo độ hiếm từ server, không phụ thuộc cấp +). */
export function saleTotal(
  cards: readonly Priced[],
  catalog: ReadonlyMap<string, Card>,
  prices: EconomyConfig['cardSalePrice'],
): number {
  return cards.reduce((sum, pc) => {
    const card = catalog.get(pc.cardId);
    return sum + (card ? prices[card.rarity] : 0);
  }, 0);
}

/** Có thẻ Vàng+ hoặc thẻ đã ép + → phải bấm giữ để xác nhận (PRD F11, DESIGN.md §6.4). */
export function isValuableSale(cards: readonly Priced[], catalog: ReadonlyMap<string, Card>) {
  return cards.some((pc) => {
    const r = catalog.get(pc.cardId)?.rarity;
    return pc.level > 0 || r === 'gold' || r === 'legend';
  });
}

/**
 * Thẻ "MỚI" ở màn mở gói: mẫu thẻ chưa có trong kho trước khi mở; trùng mẫu trong cùng gói thì chỉ
 * thẻ đầu tiên là mới. Trả về tập `PlayerCard.id`.
 */
export function newCardIds(
  opened: readonly Pick<PlayerCard, 'id' | 'cardId'>[],
  ownedCardIds: ReadonlySet<string>,
): Set<string> {
  const seen = new Set(ownedCardIds);
  const out = new Set<string>();
  for (const pc of opened) {
    if (!seen.has(pc.cardId)) out.add(pc.id);
    seen.add(pc.cardId);
  }
  return out;
}
