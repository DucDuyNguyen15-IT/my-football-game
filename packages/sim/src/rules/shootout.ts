import type { PlayerState, TeamSide } from '../types';
import { TICK_RATE } from '../tick';

/*
 * Luân lưu (PRD §5 "Hòa sau 2 hiệp"): mỗi đội 5 lượt, dừng sớm khi một đội không thể gỡ; vẫn hoà
 * thì sudden death — mỗi vòng một lượt mỗi đội tới khi có đội hơn sau cùng số lượt. Mỗi lượt là
 * một quả phạt đền dùng lại cơ chế bóng chết (`match.ts`).
 */

export const SHOOTOUT_ROUNDS = 5;
/**
 * Trần số lượt sút mỗi đội (5 thường + 5 sudden death). Cần để tổng tick một trận luôn nhỏ hơn
 * `MAX_LOG_TICKS` của recorder (replay.ts): 2 hiệp ~26.000 tick + tối đa 20 lượt ~1.000 tick.
 */
export const SHOOTOUT_MAX_KICKS = 10;
/** Bóng rời chân quá chừng này tick mà chưa vào lưới = hỏng (bóng chết lăn, bị chặn…). */
export const SHOOTOUT_KICK_TICKS = 3 * TICK_RATE;

/** Kết quả từng lượt sút (true = vào) của mỗi đội. */
export interface ShootoutTally {
  home: boolean[];
  away: boolean[];
}

const goals = (kicks: readonly boolean[]): number => kicks.filter(Boolean).length;

/** Đội thắng luân lưu, null nếu chưa phân định. */
export function shootoutWinner(t: ShootoutTally): TeamSide | null {
  const gh = goals(t.home);
  const ga = goals(t.away);
  const nh = t.home.length;
  const na = t.away.length;
  if (nh <= SHOOTOUT_ROUNDS && na <= SHOOTOUT_ROUNDS) {
    // Dừng sớm: đội kia sút vào hết các lượt còn lại cũng không gỡ được.
    if (gh > ga + (SHOOTOUT_ROUNDS - na)) return 'home';
    if (ga > gh + (SHOOTOUT_ROUNDS - nh)) return 'away';
    return null;
  }
  // Chạm trần: `capTally` đã cộng một bàn bốc thăm cho đội thắng, hai đội lệch số lượt.
  if (nh > SHOOTOUT_MAX_KICKS || na > SHOOTOUT_MAX_KICKS) return gh > ga ? 'home' : 'away';
  // Sudden death: chỉ phân định khi hai đội đã sút bằng số lượt.
  if (nh === na && gh !== ga) return gh > ga ? 'home' : 'away';
  return null;
}

/**
 * Hai đội cùng sút đủ `SHOOTOUT_MAX_KICKS` lượt mà vẫn hoà: bốc thăm tất định (`coin` ∈ [0,1) từ
 * rng của sim) — đội thắng bốc thăm được ghi thêm một bàn (true) để mọi nơi suy ra đội thắng từ số
 * bàn như cũ. Chưa chạm trần hoặc không hoà thì giữ nguyên.
 */
export function capTally<T extends ShootoutTally>(t: T, coin: number): T {
  if (t.home.length !== SHOOTOUT_MAX_KICKS || t.away.length !== SHOOTOUT_MAX_KICKS) return t;
  if (goals(t.home) !== goals(t.away)) return t;
  const w: TeamSide = coin < 0.5 ? 'home' : 'away';
  return { ...t, [w]: [...t[w], true] };
}

/** Đội sút lượt kế: đội đã sút ít lượt hơn; bằng nhau thì đội `first`. */
export function nextShooter(t: ShootoutTally, first: TeamSide): TeamSide {
  const other: TeamSide = first === 'home' ? 'away' : 'home';
  return t[first].length <= t[other].length ? first : other;
}

/**
 * Người sút lượt thứ `kicksTaken` (từ 0) của đội: cầu thủ ngoài sân theo Sút giảm dần (bằng nhau
 * thì theo id), thủ môn sút cuối, hết vòng thì lặp lại.
 */
export function shooterFor(
  players: readonly PlayerState[],
  team: TeamSide,
  kicksTaken: number,
): PlayerState {
  const order = players
    .filter((p) => p.team === team)
    .sort((a, b) => {
      const gk = Number(a.position === 'GK') - Number(b.position === 'GK');
      if (gk !== 0) return gk;
      return b.stats.shooting - a.stats.shooting || (a.id < b.id ? -1 : 1);
    });
  if (order.length === 0) throw new Error(`Đội ${team} không còn cầu thủ để sút luân lưu`);
  return order[kicksTaken % order.length]!;
}
