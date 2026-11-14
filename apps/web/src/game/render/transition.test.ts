import { describe, expect, it } from 'vitest';
import {
  TICK_RATE,
  cpuEasyTeam,
  createMatch,
  starterLikeTeam,
  type MatchState,
  type Restart,
} from '@pitch/sim';
import {
  COVER_HOLD_END,
  COVER_HOLD_START,
  DOLLY_DURATION_SEC,
  LOW_FPS_THRESHOLD,
  REDUCED_DURATION_SEC,
  RollingFps,
  buildTransitionSpec,
  detectTransition,
  dollyOffset,
  hasPlayerTeleport,
  resolveTransitionMode,
  sampleTransitionCurve,
  transitionDurationSec,
  transitionLabel,
} from './transition';
import { COUNTDOWN_VISIBLE_SEC, SNAP_DISTANCE } from './view';

const baseMatch = (): MatchState =>
  createMatch({ home: starterLikeTeam, away: cpuEasyTeam, difficulty: 'easy', seed: 7 });

const withRestart = (
  state: MatchState,
  type: Restart['type'],
  team: Restart['team'] = 'home',
  startTick = state.tick,
): MatchState => ({
  ...state,
  phase: type === 'kickoff' ? 'kickoff' : 'dead_ball',
  ballDead: true,
  restart: {
    type,
    team,
    spot: { x: 20, y: 10 },
    takerId: `${team}-P1`,
    startTick,
  },
});

describe('hasPlayerTeleport', () => {
  it('di chuyển bình thường trong 1 tick (< SNAP_DISTANCE) không tính là dịch chuyển', () => {
    const prev = baseMatch();
    const curr: MatchState = {
      ...prev,
      tick: prev.tick + 1,
      players: prev.players.map((p, i) =>
        i === 0 ? { ...p, pos: { x: p.pos.x + 0.15, y: p.pos.y } } : p,
      ),
    };
    expect(hasPlayerTeleport(prev, curr)).toBe(false);
  });

  it('nhảy vị trí vượt quá SNAP_DISTANCE (2 m) được phát hiện là dịch chuyển', () => {
    const prev = baseMatch();
    const curr: MatchState = {
      ...prev,
      tick: prev.tick + 1,
      players: prev.players.map((p, i) =>
        i === 0 ? { ...p, pos: { x: p.pos.x + SNAP_DISTANCE + 0.5, y: p.pos.y } } : p,
      ),
    };
    expect(hasPlayerTeleport(prev, curr)).toBe(true);
  });

  it('cầu thủ dự bị mới vào sân (id mới) không bị coi là dịch chuyển', () => {
    const prev = baseMatch();
    const curr: MatchState = {
      ...prev,
      tick: prev.tick + 1,
      players: prev.players.map((p, i) =>
        i === 1 ? { ...p, id: 'home-B1', pos: { x: 35, y: -20 } } : p,
      ),
    };
    expect(hasPlayerTeleport(prev, curr)).toBe(false);
  });
});

describe('detectTransition — khi nào chuyển cảnh', () => {
  it('bóng sống di chuyển bình thường hoặc cùng tick → null', () => {
    const s0 = { ...baseMatch(), phase: 'play' as const, ballDead: false, restart: null };
    const s1 = { ...s0, tick: s0.tick + 1 };
    expect(detectTransition(s0, s0)).toBeNull();
    expect(detectTransition(s0, s1)).toBeNull();
  });

  it('bóng ra hết đường biên ngang → phát bóng (PHÁT BÓNG) hoặc phạt góc (PHẠT GÓC)', () => {
    const play = { ...baseMatch(), tick: 50, phase: 'play' as const, ballDead: false, restart: null };
    const goalKick = withRestart({ ...play, tick: 51 }, 'goal_kick', 'away', 51);
    const corner = withRestart({ ...play, tick: 51 }, 'corner', 'home', 51);

    expect(detectTransition(play, goalKick)).toMatchObject({
      kind: 'goal_kick',
      label: 'PHÁT BÓNG',
      team: 'away',
    });
    expect(detectTransition(play, corner)).toMatchObject({
      kind: 'corner',
      label: 'PHẠT GÓC',
      team: 'home',
    });
  });

  it('ném biên: không chuyển cảnh khi cầu thủ tự đi bộ; chuyển cảnh (NÉM BIÊN) khi có dịch chuyển cầu thủ', () => {
    const play = { ...baseMatch(), tick: 80, phase: 'play' as const, ballDead: false, restart: null };
    const throwInWalk = withRestart({ ...play, tick: 81 }, 'throw_in', 'home', 81);
    expect(detectTransition(play, throwInWalk)).toBeNull();

    const throwInSnap: MatchState = {
      ...throwInWalk,
      tick: 82,
      players: throwInWalk.players.map((p, i) =>
        i === 0 ? { ...p, pos: { x: p.pos.x + 6, y: p.pos.y - 4 } } : p,
      ),
    };
    expect(detectTransition(throwInWalk, throwInSnap)).toMatchObject({
      kind: 'throw_in',
      label: 'NÉM BIÊN',
      team: 'home',
    });
  });

  it('phạm lỗi → đá phạt (ĐÁ PHẠT) và phạt đền (PHẠT ĐỀN)', () => {
    const play = { ...baseMatch(), tick: 120, phase: 'play' as const, ballDead: false, restart: null };
    const freeKick = withRestart({ ...play, tick: 121 }, 'free_kick', 'home', 121);
    const penalty = withRestart({ ...play, tick: 121 }, 'penalty', 'away', 121);

    expect(detectTransition(play, freeKick)).toMatchObject({
      kind: 'free_kick',
      label: 'ĐÁ PHẠT',
      team: 'home',
    });
    expect(detectTransition(play, penalty)).toMatchObject({
      kind: 'penalty',
      label: 'PHẠT ĐỀN',
      team: 'away',
    });
  });

  it('sau bàn thắng: vào màn xem lại (XEM LẠI) khi bật replay, hoặc về giao bóng (GIAO BÓNG) khi tắt replay', () => {
    const beforeGoal = {
      ...baseMatch(),
      tick: 200,
      phase: 'play' as const,
      ballDead: false,
      restart: null,
    };
    const afterGoal: MatchState = {
      ...withRestart({ ...beforeGoal, tick: 201 }, 'kickoff', 'away', 201),
      score: { home: 1, away: 0 },
    };

    expect(detectTransition(beforeGoal, afterGoal, { replay: true })).toMatchObject({
      kind: 'replay_in',
      label: 'XEM LẠI',
      team: 'home',
    });
    expect(detectTransition(beforeGoal, afterGoal, { replay: false })).toMatchObject({
      kind: 'kickoff',
      label: 'GIAO BÓNG',
      team: 'away',
    });
    expect(buildTransitionSpec('replay_out', { team: 'away' })).toMatchObject({
      kind: 'replay_out',
      label: 'GIAO BÓNG',
    });
  });

  it('luân lưu: lúc vào luân lưu (LUÂN LƯU) và giữa mỗi lượt sút (LƯỢT N)', () => {
    const endH2 = {
      ...baseMatch(),
      tick: 1000,
      half: 2 as const,
      phase: 'play' as const,
      ballDead: false,
      restart: null,
    };
    const enterSo: MatchState = {
      ...withRestart({ ...endH2, tick: 1001 }, 'penalty', 'home', 1001),
      phase: 'shootout',
      shootout: {
        home: [],
        away: [],
        first: 'home',
        kicking: 'home',
        kickTick: null,
      },
    };
    expect(detectTransition(endH2, enterSo)).toMatchObject({
      kind: 'shootout',
      label: 'LUÂN LƯU',
      turn: 1,
    });

    // Đang bay trong lượt 1 -> chưa chuyển cảnh.
    const kicking1: MatchState = {
      ...enterSo,
      tick: 1010,
      restart: null,
      shootout: { ...enterSo.shootout!, kickTick: 1005 },
    };
    expect(detectTransition(enterSo, kicking1)).toBeNull();

    // Sang lượt sút thứ 2 (đội khách).
    const turn2: MatchState = {
      ...withRestart({ ...kicking1, tick: 1040 }, 'penalty', 'away', 1040),
      phase: 'shootout',
      shootout: {
        home: [true],
        away: [],
        first: 'home',
        kicking: 'away',
        kickTick: null,
      },
    };
    expect(detectTransition(kicking1, turn2)).toMatchObject({
      kind: 'shootout_turn',
      label: 'LƯỢT 2',
      team: 'away',
      turn: 2,
    });

    // Sang lượt sút thứ 3 (đội nhà).
    const kicking2: MatchState = {
      ...turn2,
      tick: 1050,
      restart: null,
      shootout: { ...turn2.shootout!, kickTick: 1045 },
    };
    const turn3: MatchState = {
      ...withRestart({ ...kicking2, tick: 1080 }, 'penalty', 'home', 1080),
      phase: 'shootout',
      shootout: {
        home: [true],
        away: [false],
        first: 'home',
        kicking: 'home',
        kickTick: null,
      },
    };
    expect(detectTransition(kicking2, turn3)).toMatchObject({
      kind: 'shootout_turn',
      label: 'LƯỢT 3',
      team: 'home',
      turn: 3,
    });
  });

  it('giao bóng đầu hiệp 2 → chuyển cảnh sang hiệp 2', () => {
    const halfTime: MatchState = {
      ...baseMatch(),
      tick: 500,
      half: 1,
      phase: 'half_time',
      ballDead: true,
      restart: null,
    };
    const secondHalf: MatchState = {
      ...withRestart({ ...halfTime, tick: 501, half: 2 }, 'kickoff', 'away', 501),
      phase: 'kickoff',
    };
    expect(detectTransition(halfTime, secondHalf)).toMatchObject({
      kind: 'second_half',
      label: 'GIAO BÓNG',
      sublabel: 'HIỆP 2 · ĐỘI KHÁCH',
      team: 'away',
    });
  });

  it('còi nghỉ giữa hiệp và còi hết trận không bật stinger che bảng HUD', () => {
    const play = { ...baseMatch(), tick: 300, phase: 'play' as const, ballDead: false, restart: null };
    const halfTime: MatchState = { ...play, tick: 301, phase: 'half_time', ballDead: true };
    const fullTime: MatchState = { ...play, tick: 301, phase: 'full_time', ballDead: true };
    expect(detectTransition(play, halfTime)).toBeNull();
    expect(detectTransition(play, fullTime)).toBeNull();
  });

  it('không bao giờ bật chuyển cảnh đè lên vòng đếm ngược 5 giây cuối', () => {
    const start = 100;
    const deadline = start + 15 * TICK_RATE;
    const inLast5Sec = deadline - COUNTDOWN_VISIBLE_SEC * TICK_RATE + 10;
    const prev = withRestart({ ...baseMatch(), tick: inLast5Sec - 1 }, 'free_kick', 'home', start);
    const curr: MatchState = {
      ...prev,
      tick: inLast5Sec,
      actionDeadline: {
        kind: 'free_kick',
        playerId: 'home-P1',
        startTick: start,
        deadlineTick: deadline,
      },
      // Giả sử có cầu thủ nhảy vị trí ngay trong 5 giây cuối.
      players: prev.players.map((p, i) =>
        i === 0 ? { ...p, pos: { x: p.pos.x + 10, y: p.pos.y } } : p,
      ),
    };
    expect(detectTransition(prev, curr)).toBeNull();
  });
});

describe('chế độ vẽ & tự hạ cấp FPS (resolveTransitionMode / RollingFps)', () => {
  it('ưu tiên reduced-motion → đồ hoạ Thấp → FPS < 50 → 3D', () => {
    expect(
      resolveTransitionMode({ preset: 'high', reducedMotion: true, recentFps: 120 }),
    ).toBe('reduced');
    expect(
      resolveTransitionMode({ preset: 'low', reducedMotion: false, recentFps: 120 }),
    ).toBe('2d');
    expect(
      resolveTransitionMode({
        preset: 'high',
        reducedMotion: false,
        recentFps: LOW_FPS_THRESHOLD - 2,
      }),
    ).toBe('2d');
    expect(
      resolveTransitionMode({ preset: 'high', reducedMotion: false, recentFps: null }),
    ).toBe('3d');
    expect(
      resolveTransitionMode({ preset: 'high', reducedMotion: false, recentFps: 60 }),
    ).toBe('3d');
  });

  it('RollingFps tính đúng FPS trượt và bỏ qua khung hình không hợp lệ', () => {
    const rolling = new RollingFps(10, 4);
    rolling.record(0);
    rolling.record(-10);
    rolling.record(2000);
    expect(rolling.average()).toBeNull();

    for (let i = 0; i < 4; i++) rolling.record(20); // 50 FPS
    expect(rolling.average()).toBeCloseTo(50, 4);

    for (let i = 0; i < 10; i++) rolling.record(10); // 100 FPS (ghi đè toàn bộ vòng đệm)
    expect(rolling.average()).toBeCloseTo(100, 4);
  });
});

describe('đường cong chuyển cảnh & camera dolly', () => {
  it('giữ che kín 100% ở khoảng giữa [COVER_HOLD_START, COVER_HOLD_END] cho cả 3D, 2D và reduced', () => {
    for (const mode of ['3d', '2d', 'reduced'] as const) {
      expect(sampleTransitionCurve(0, mode).cover).toBeCloseTo(0, 5);
      expect(sampleTransitionCurve(0, mode).fullyCovered).toBe(false);

      const mid = sampleTransitionCurve(0.5, mode);
      expect(mid.cover).toBe(1);
      expect(mid.fullyCovered).toBe(true);
      expect(mid.labelOpacity).toBe(1);

      expect(sampleTransitionCurve(COVER_HOLD_START, mode).fullyCovered).toBe(true);
      expect(sampleTransitionCurve(COVER_HOLD_END, mode).fullyCovered).toBe(true);

      expect(sampleTransitionCurve(1, mode).cover).toBeCloseTo(0, 5);
      expect(sampleTransitionCurve(1, mode).fullyCovered).toBe(false);
    }
  });

  it('thời lượng đúng dải thiết kế: 3D 0,7–1,0s, 2D 0,6–0,8s, reduced 250ms', () => {
    const corner = buildTransitionSpec('corner');
    const replay = buildTransitionSpec('replay_in');
    const shootoutTurn = buildTransitionSpec('shootout_turn', { turn: 4 });

    expect(transitionDurationSec(corner, '3d')).toBeGreaterThanOrEqual(0.7);
    expect(transitionDurationSec(corner, '3d')).toBeLessThanOrEqual(1.0);
    expect(transitionDurationSec(replay, '3d')).toBeGreaterThan(transitionDurationSec(corner, '3d'));
    expect(transitionDurationSec(shootoutTurn, '3d')).toBeLessThan(
      transitionDurationSec(corner, '3d'),
    );

    expect(transitionDurationSec(corner, '2d')).toBeGreaterThanOrEqual(0.6);
    expect(transitionDurationSec(corner, '2d')).toBeLessThanOrEqual(0.8);
    expect(transitionDurationSec(corner, 'reduced')).toBe(REDUCED_DURATION_SEC);
    expect(transitionLabel('shootout_turn', 4)).toBe('LƯỢT 4');
  });

  it('camera dolly lệch nhẹ lúc vừa mở cảnh rồi êm dần về 0', () => {
    const start = dollyOffset(0.05, false);
    const mid = dollyOffset(DOLLY_DURATION_SEC / 2, false);
    const done = dollyOffset(DOLLY_DURATION_SEC, false);
    expect(Math.abs(start.z)).toBeGreaterThan(Math.abs(mid.z));
    expect(Math.abs(mid.z)).toBeGreaterThan(0);
    expect(done).toEqual({ y: 0, z: 0 });
    expect(dollyOffset(0.1, true)).toEqual({ y: 0, z: 0 });
  });
});
