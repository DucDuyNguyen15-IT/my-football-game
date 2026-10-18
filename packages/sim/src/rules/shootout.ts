import type { PlayerState, TeamSide } from '../types';
import { TICK_RATE } from '../tick';

/*
 * Luân lưu (PRD §5 "Hòa sau 2 hiệp"): mỗi đội 5 lượt, dừng sớm khi một đội không thể gỡ; vẫn hoà
 * thì sudden death — mỗi vòng một lượt mỗi đội tới khi có đội hơn sau cùng số lượt. Mỗi lượt là
 * một quả phạt đền dùng lại cơ chế bóng chết (`match.ts`).
 */

export const SHOOTOUT_ROUNDS = 5;
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
  // Sudden death: chỉ phân định khi hai đội đã sút bằng số lượt.
  if (nh === na && gh !== ga) return gh > ga ? 'home' : 'away';
  return null;
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
