import { describe, expect, it } from 'vitest';
import {
  computeOvr,
  effectiveStats,
  FORMATIONS,
  MatchTeamSetup,
  STARTER_SLOTS,
  type Card,
} from '@pitch/shared';
import { readSeedCards } from '../db/seed';
import { seededRng } from '../../test/stats';
import { STARTER_SQUAD } from '../config/economy';
import {
  buildHomeTeam,
  CPU_TARGET_OVR,
  generateCpuTeam,
  startersAverageOvr,
  type SquadEntry,
} from './match-teams';

const catalog: Card[] = readSeedCards();
const byId = new Map(catalog.map((c) => [c.id, c]));

function starterSlots(): Record<string, SquadEntry> {
  return Object.fromEntries(
    STARTER_SQUAD.slots.map(([slot, id]) => [slot, { card: byId.get(String(id))!, level: 0 }]),
  );
}

describe('buildHomeTeam', () => {
  it('đội khởi đầu: 11 người, chỉ số = effectiveStats, qua được schema MatchTeamSetup', () => {
    const r = buildHomeTeam('2-3-1', starterSlots());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.team.players).toHaveLength(11);
    expect(MatchTeamSetup.safeParse(r.team).success).toBe(true);
    const gk = r.team.players.find((p) => p.slot === 'GK')!;
    expect(gk.stats).toEqual(byId.get('1')!.stats);
    expect(gk.cardId).toBe('1');
  });

  it('áp cấp ép và phạt sai vị trí theo ô, dự bị không bị phạt', () => {
    const slots = starterSlots();
    const df = slots.P1!;
    // Hậu vệ +3 đặt vào ô tiền đạo P6, tiền đạo về dự bị.
    slots.P6 = { card: df.card, level: 3 };
    slots.P1 = slots.B1!;
    slots.B1 = { card: byId.get('50')!, level: 2 };
    const r = buildHomeTeam('2-3-1', slots);
    if (!r.ok) throw new Error('phải hợp lệ');
    const p6 = r.team.players.find((p) => p.slot === 'P6')!;
    expect(p6.stats).toEqual(effectiveStats(df.card, 3, 'FW'));
    expect(p6.level).toBe(3);
    const b1 = r.team.players.find((p) => p.slot === 'B1')!;
    expect(b1.stats).toEqual(effectiveStats(byId.get('50')!, 2));
  });

  it('thiếu ô đá chính → nêu rõ ô thiếu', () => {
    const slots = starterSlots();
    delete slots.GK;
    delete slots.P4;
    expect(buildHomeTeam('2-3-1', slots)).toEqual({ ok: false, missing: ['GK', 'P4'] });
  });
});

describe('generateCpuTeam', () => {
  it.each(['easy', 'hard'] as const)(
    '%s: 200 seed → OVR TB đá chính trong ±3 mục tiêu, đúng vị trí, không trùng thẻ',
    (difficulty) => {
      for (let seed = 1; seed <= 200; seed++) {
        const team = generateCpuTeam(catalog, difficulty, seededRng(seed));
        expect(MatchTeamSetup.safeParse(team).success).toBe(true);
        expect(Math.abs(startersAverageOvr(team) - CPU_TARGET_OVR[difficulty])).toBeLessThanOrEqual(
          3,
        );
        const roles = FORMATIONS[team.formation];
        for (const p of team.players) {
          const card = byId.get(p.cardId!)!;
          expect(p.stats).toEqual(card.stats);
          expect(computeOvr(p.position, p.stats)).toBe(card.ovr);
          if ((STARTER_SLOTS as readonly string[]).includes(p.slot)) {
            expect(p.position).toBe(roles[p.slot as (typeof STARTER_SLOTS)[number]]);
          }
        }
        const ids = team.players.map((p) => p.cardId);
        expect(new Set(ids).size).toBe(ids.length);
        expect(team.players).toHaveLength(10);
      }
    },
  );

  it('cùng seed → cùng đội; khác seed → thường khác', () => {
    const a = generateCpuTeam(catalog, 'easy', seededRng(42));
    expect(generateCpuTeam(catalog, 'easy', seededRng(42))).toEqual(a);
    const others = [1, 2, 3, 4, 5].map((s) => generateCpuTeam(catalog, 'easy', seededRng(s)));
    expect(others.some((t) => JSON.stringify(t) !== JSON.stringify(a))).toBe(true);
  });
});
