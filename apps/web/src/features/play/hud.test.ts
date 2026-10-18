import { describe, expect, it } from 'vitest';
import { createMatch, starterLikeTeam, cpuEasyTeam, substitute, type MatchState } from '@pitch/sim';
import {
  canSwap,
  formatClock,
  hudEvents,
  matchOutcome,
  readDevOptions,
  sameHud,
  shootoutOutcome,
  shootoutScore,
  staminaLevel,
  subOptions,
  toHudSnapshot,
} from './hud';

const match = (): MatchState =>
  createMatch({ home: starterLikeTeam, away: cpuEasyTeam, difficulty: 'easy', seed: 1 });

describe('formatClock', () => {
  it('giờ chính thức hiện phút', () => {
    expect(formatClock({ minute: 0, addedMinute: 0, addedMinutes: null })).toBe("0'");
    expect(formatClock({ minute: 67, addedMinute: 0, addedMinutes: null })).toBe("67'");
  });
  it('bù giờ hiện 45+N / 90+N', () => {
    expect(formatClock({ minute: 45, addedMinute: 2, addedMinutes: 3 })).toBe("45+2'");
    expect(formatClock({ minute: 90, addedMinute: 1, addedMinutes: 1 })).toBe("90+1'");
  });
});

describe('staminaLevel', () => {
  it('đổi màu ở mốc 50% và 30% (DESIGN §6.2)', () => {
    expect(staminaLevel(80)).toBe('ok');
    expect(staminaLevel(50)).toBe('ok');
    expect(staminaLevel(49.9)).toBe('low');
    expect(staminaLevel(30)).toBe('low');
    expect(staminaLevel(29.9)).toBe('critical');
  });
});

describe('matchOutcome', () => {
  it('theo tỉ số đội nhà', () => {
    expect(matchOutcome({ home: 2, away: 1 })).toBe('win');
    expect(matchOutcome({ home: 1, away: 1 })).toBe('draw');
    expect(matchOutcome({ home: 0, away: 3 })).toBe('loss');
  });
});

describe('toHudSnapshot / sameHud', () => {
  it('lấy cầu thủ đang điều khiển, thể lực làm tròn', () => {
    const s = match();
    const hud = toHudSnapshot(s);
    expect(hud.controlled?.id).toBe(s.controlledId);
    expect(hud.controlled?.stamina).toBe(100);
    expect(hud.clock).toBe("0'");
    expect(hud.score).toEqual({ home: 0, away: 0 });
  });

  it('thay đổi lẻ trong một tick không làm HUD vẽ lại', () => {
    const s = match();
    const a = toHudSnapshot(s);
    const players = s.players.map((p) => (p.id === s.controlledId ? { ...p, stamina: 99.8 } : p));
    expect(sameHud(a, toHudSnapshot({ ...s, players, tick: s.tick + 1 }))).toBe(true);
    expect(sameHud(a, toHudSnapshot({ ...s, score: { home: 1, away: 0 } }))).toBe(false);
  });
});

describe('hudEvents', () => {
  it('báo bàn thắng và thẻ phạt mới', () => {
    const s = match();
    const before = toHudSnapshot(s);
    const victim = s.players.find((p) => p.team === 'away')!;
    const after = toHudSnapshot({
      ...s,
      score: { home: 1, away: 0 },
      bookings: [{ playerId: victim.id, team: 'away', card: 'yellow', tick: 10 }],
    });
    const events = hudEvents(before, after);
    expect(events.map((e) => e.kind)).toEqual(['goal', 'yellow']);
    expect(events[0]!.team).toBe('home');
    expect(events[1]!.text).toContain('Thẻ vàng');
  });

  it('báo phạm lỗi: phạt đền / đá phạt cho đội nào', () => {
    const s = match();
    const before = toHudSnapshot({ ...s, phase: 'play', restart: null });
    const restart = (type: 'penalty' | 'free_kick') =>
      toHudSnapshot({
        ...s,
        phase: 'dead_ball',
        restart: { type, team: 'home', spot: { x: 0, y: 0 }, takerId: 'home-P5', startTick: 1 },
      });
    expect(hudEvents(before, restart('penalty'))).toEqual([
      { kind: 'foul', team: 'home', text: "0' Phạt đền · Nhà" },
    ]);
    expect(hudEvents(before, restart('free_kick'))[0]?.text).toBe("0' Đá phạt · Nhà");
    // Cùng tình huống ở snapshot sau không báo lại.
    expect(hudEvents(restart('penalty'), restart('penalty'))).toEqual([]);
  });

  it('không có gì đổi thì không có sự kiện', () => {
    const hud = toHudSnapshot(match());
    expect(hudEvents(hud, hud)).toEqual([]);
  });
});

describe('readDevOptions', () => {
  const dev = { DEV: true, MODE: 'development' };
  it('dev: đọc ?half và ?autopilot', () => {
    expect(readDevOptions('?half=20&autopilot=1', dev)).toEqual({
      halfLengthSec: 20,
      autopilot: true,
    });
  });
  it('MODE test cũng đọc', () => {
    expect(readDevOptions('?half=10', { DEV: false, MODE: 'test' })).toEqual({ halfLengthSec: 10 });
  });
  it('bỏ qua giá trị sai', () => {
    expect(readDevOptions('?half=abc&autopilot=0', dev)).toEqual({});
    expect(readDevOptions('?half=-5', dev)).toEqual({});
  });
  it('production bỏ qua mọi tham số', () => {
    expect(readDevOptions('?half=20&autopilot=1', { DEV: false, MODE: 'production' })).toEqual({});
  });
});

describe('thay người trên HUD', () => {
  it('báo sự kiện thay người với số áo người vào/ra, giảm lượt còn lại', () => {
    const s = match();
    const before = toHudSnapshot(s);
    const r = substitute(s, 'home', 'home-P2', 'B1');
    if (!r.ok) throw new Error('phải hợp lệ');
    const after = toHudSnapshot(r.state, before);
    expect(after.subsLeft).toBe(2);
    expect(sameHud(before, after)).toBe(false);
    const [e] = hudEvents(before, after);
    expect(e).toMatchObject({ kind: 'sub', team: 'home' });
    expect(e!.text).toContain('#8 vào, #3 ra');
  });

  it('subOptions: 7 người trên sân và dự bị đội nhà; người vào mang số áo của mình', () => {
    const r = substitute(match(), 'home', 'home-P2', 'B1');
    if (!r.ok) throw new Error('phải hợp lệ');
    const o = subOptions(r.state);
    expect(o.onPitch).toHaveLength(7);
    expect(o.onPitch.find((p) => p.id === 'home-B1')!.number).toBe(8);
    expect(o.bench.some((b) => b.slot === 'B1')).toBe(false);
  });

  it('canSwap: thủ môn chỉ đổi thủ môn', () => {
    expect(canSwap('GK', 'GK')).toBe(true);
    expect(canSwap('GK', 'DF')).toBe(false);
    expect(canSwap('MF', 'FW')).toBe(true);
  });
});

describe('luân lưu trên HUD', () => {
  const withShootout = (home: boolean[], away: boolean[], turn: 'home' | 'away' | null = null) => {
    const s = match();
    return toHudSnapshot({
      ...s,
      phase: turn ? 'shootout' : 'full_time',
      restart: turn ? s.restart && { ...s.restart, team: turn } : null,
      shootout: { home, away, first: 'home', kicking: turn ?? 'home', kickTick: null },
    });
  };

  it('báo từng lượt vào / hỏng', () => {
    const before = withShootout([true], [], 'away');
    const after = withShootout([true], [false], 'home');
    expect(sameHud(before, after)).toBe(false);
    const [e] = hudEvents(before, after);
    expect(e).toMatchObject({ kind: 'shootout', team: 'away', text: 'Luân lưu · Khách: Hỏng' });
  });

  it('kết quả: trận vẫn hoà, kèm thắng/thua luân lưu', () => {
    const hud = withShootout([true, true, true], [false, false, false]);
    expect(shootoutScore(hud.shootout!)).toEqual({ home: 3, away: 0 });
    expect(shootoutOutcome(hud)).toBe('win');
    expect(shootoutOutcome(withShootout([false, false, false], [true, true, true]))).toBe('loss');
    expect(shootoutOutcome(toHudSnapshot(match()))).toBeNull();
  });
});
