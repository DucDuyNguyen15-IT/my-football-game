import { describe, expect, it } from 'vitest';
import {
  BALL_RADIUS,
  HALF_LENGTH,
  MAX_CHARGE_TICKS,
  MIN_SHOT_POWER,
  NO_INPUT,
  PASS_FULL_CHARGE_TICKS,
  penaltyAimZ,
  PENALTY_SPOT_DIST,
  penaltyRadius,
  TICK_RATE,
  cpuEasyTeam,
  createMatch,
  starterLikeTeam,
  step,
} from '@pitch/sim';
import {
  COUNTDOWN_ARC_STEPS,
  COUNTDOWN_VISIBLE_SEC,
  SNAP_DISTANCE,
  chargeMeter,
  contactLabel,
  countdownArcStep,
  countdownRing,
  lerpPos,
  penaltyRing,
  penaltyRingColor,
  setPieceContact,
  setPieceFoot,
  shirtNumber,
} from './view';

describe('lerpPos', () => {
  it('nội suy tuyến tính giữa tick trước và tick hiện tại', () => {
    const prev = { x: 0, y: 0 };
    const curr = { x: 0.2, y: -0.1 };
    expect(lerpPos(prev, curr, 0)).toEqual(prev);
    expect(lerpPos(prev, curr, 1)).toEqual(curr);
    const mid = lerpPos(prev, curr, 0.5);
    expect(mid.x).toBeCloseTo(0.1);
    expect(mid.y).toBeCloseTo(-0.05);
  });

  it('dịch chuyển tức thời (xa hơn SNAP_DISTANCE) thì vẽ thẳng vị trí mới', () => {
    const curr = { x: SNAP_DISTANCE + 1, y: 0 };
    expect(lerpPos({ x: 0, y: 0 }, curr, 0.1)).toBe(curr);
  });
});

describe('shirtNumber', () => {
  it('GK = 1, P1–P6 = 2–7, B1–B5 = 8–12', () => {
    expect(shirtNumber('GK')).toBe(1);
    expect(shirtNumber('P1')).toBe(2);
    expect(shirtNumber('P6')).toBe(7);
    expect(shirtNumber('B1')).toBe(8);
    expect(shirtNumber('B5')).toBe(12);
  });
});

describe('chargeMeter', () => {
  const none = { shotChargeTicks: 0, passCharge: null };

  it('không nạp lực thì không có thanh', () => {
    expect(chargeMeter(none)).toBeNull();
  });

  it('giữ D: thanh sút đầy dần tới MAX_CHARGE_TICKS', () => {
    expect(chargeMeter({ ...none, shotChargeTicks: MAX_CHARGE_TICKS / 2 })).toEqual({
      kind: 'shot',
      fill: 0.5,
    });
    expect(chargeMeter({ ...none, shotChargeTicks: MAX_CHARGE_TICKS * 2 })?.fill).toBe(1);
  });

  it('giữ S/A: thanh chuyền theo số tick đã giữ', () => {
    const passCharge = {
      kind: 'lob' as const,
      ticks: PASS_FULL_CHARGE_TICKS / 4,
      dir: { x: 1, y: 0 },
      through: false,
    };
    expect(chargeMeter({ ...none, passCharge })).toEqual({ kind: 'lob', fill: 0.25 });
  });

  it('giữ W / Q+W: thanh chọc khe (màu riêng), cùng nhịp đầy như chuyền', () => {
    const passCharge = {
      kind: 'ground' as const,
      ticks: PASS_FULL_CHARGE_TICKS / 2,
      dir: { x: 1, y: 0 },
      through: true,
    };
    expect(chargeMeter({ ...none, passCharge })).toEqual({ kind: 'through', fill: 0.5 });
  });
});

describe('countdownRing', () => {
  const SHOWN = COUNTDOWN_VISIBLE_SEC * TICK_RATE;
  const freeKick = {
    kind: 'free_kick' as const,
    playerId: 'home-P4',
    deadlineTick: 100 + 15 * TICK_RATE,
  };
  const keeper = {
    kind: 'keeper_hold' as const,
    playerId: 'home-GK',
    deadlineTick: 40 + 10 * TICK_RATE,
  };
  const at = (d: typeof freeKick | typeof keeper, left: number) =>
    countdownRing({ actionDeadline: d, tick: d.deadlineTick - left });

  it('tình huống cố định nào của người chơi cũng có vòng 5 giây cuối trên đầu người thực hiện (luật 3)', () => {
    // Trận thật: đội nhà giao bóng đầu trận, không bấm gì.
    let s = step(
      createMatch({ home: starterLikeTeam, away: cpuEasyTeam, difficulty: 'easy', seed: 7 }),
      NO_INPUT,
    );
    const takerId = s.restart!.takerId;
    const deadline = s.actionDeadline!.deadlineTick;
    expect(s.actionDeadline!.kind).toBe('kickoff');
    expect(countdownRing(s)).toBeNull();
    while (s.tick < deadline - SHOWN) s = step(s, NO_INPUT);
    expect(countdownRing(s)).toEqual({ playerId: takerId, seconds: 5, elapsed: 0 });
    while (s.tick < deadline - 1) s = step(s, NO_INPUT);
    expect(countdownRing(s)).toMatchObject({ playerId: takerId, seconds: 1 });
  });

  it('không có hạn chót thì không có vòng', () => {
    expect(countdownRing({ actionDeadline: null, tick: 5 })).toBeNull();
  });

  it.each([
    ['đá phạt / luân lưu 15 s', freeKick],
    ['thủ môn ôm bóng 10 s', keeper],
  ] as const)('%s: còn hơn 5 giây thì chưa hiện', (_name, d) => {
    expect(at(d, 10 * TICK_RATE)).toBeNull();
    expect(at(d, SHOWN + 1)).toBeNull();
  });

  it.each([
    ['đá phạt / luân lưu 15 s', freeKick],
    ['thủ môn ôm bóng 10 s', keeper],
  ] as const)('%s: vừa hiện ở 5 giây — số 5, vòng đầy vàng', (_name, d) => {
    expect(at(d, SHOWN)).toEqual({ playerId: d.playerId, seconds: 5, elapsed: 0 });
    expect(countdownArcStep(at(d, SHOWN)!.elapsed)).toBe(0);
  });

  it('số chạy 5 → 1 (làm tròn lên), cung đen tăng đều trong 5 giây cuối', () => {
    expect(at(freeKick, 4 * TICK_RATE + 1)!.seconds).toBe(5);
    expect(at(freeKick, 4 * TICK_RATE)!.seconds).toBe(4);
    expect(at(freeKick, 4 * TICK_RATE)!.elapsed).toBeCloseTo(0.2);
    const half = at(keeper, 2.5 * TICK_RATE)!;
    expect(half.seconds).toBe(3);
    expect(half.elapsed).toBeCloseTo(0.5);
    expect(at(keeper, 1)!.seconds).toBe(1);
    expect(at(keeper, 1)!.elapsed).toBeCloseTo(1 - 1 / SHOWN);
  });

  it('hết hạn (thủ môn đang lấy đà phát bóng hộ): 0 giây, cả vòng đen', () => {
    const ring = countdownRing({ actionDeadline: keeper, tick: keeper.deadlineTick + 20 })!;
    expect(ring).toMatchObject({ seconds: 0, elapsed: 1 });
    expect(countdownArcStep(ring.elapsed)).toBe(COUNTDOWN_ARC_STEPS);
  });

  it('nấc viền: chưa hết giờ thì chưa đủ vòng', () => {
    expect(countdownArcStep(0)).toBe(0);
    expect(countdownArcStep(0.5)).toBe(COUNTDOWN_ARC_STEPS / 2);
    expect(countdownArcStep(0.9999)).toBe(COUNTDOWN_ARC_STEPS - 1);
  });
});

describe('điểm chạm tình huống cố định', () => {
  it('contactLabel theo vùng chạm', () => {
    expect(contactLabel({ x: 0.1, y: -0.1 })).toBe('Sút căng');
    expect(contactLabel({ x: 0.8, y: 0.2 })).toBe('Sút xoáy bằng má trong');
    expect(contactLabel({ x: -0.8, y: 0 })).toBe('Sút xoáy bằng má ngoài');
    expect(contactLabel({ x: 0, y: -0.7 })).toBe('Sút bổng');
    expect(contactLabel({ x: 0.2, y: 0.7 })).toBe('Sút chìm');
    // Chân trái: bên phải bóng là má ngoài, bên trái là má trong.
    expect(contactLabel({ x: 0.8, y: 0.2 }, 'left')).toBe('Sút xoáy bằng má ngoài');
    expect(contactLabel({ x: -0.8, y: 0 }, 'left')).toBe('Sút xoáy bằng má trong');
    expect(contactLabel({ x: 0, y: -0.7 }, 'left')).toBe('Sút bổng');
  });

  it('setPieceFoot: theo chân thuận; hai chân thì theo nửa sân nhìn về khung thành đối thủ', () => {
    const state = (foot: 'right' | 'left' | 'both' | undefined, y: number) =>
      ({
        half: 1,
        restart: {
          type: 'free_kick',
          team: 'home',
          spot: { x: 20, y },
          takerId: 'h1',
          startTick: 0,
          readyTick: 0,
        },
        players: [{ id: 'h1', foot }],
      }) as unknown as Parameters<typeof setPieceFoot>[0];
    expect(setPieceFoot(state('left', 5))).toBe('left');
    expect(setPieceFoot(state('right', -5))).toBe('right');
    expect(setPieceFoot(state(undefined, -5))).toBe('right');
    // Đội nhà hiệp 1 tấn công về +x: bên phải nhìn từ sau lưng là y > 0.
    expect(setPieceFoot(state('both', 5))).toBe('right');
    expect(setPieceFoot(state('both', -5))).toBe('left');
  });

  it('setPieceContact chỉ hiện khi đội người chơi đá phạt / phạt góc', () => {
    const restart = (type: 'free_kick' | 'corner' | 'penalty', team: 'home' | 'away') =>
      ({ type, team, spot: { x: 0, y: 0 }, takerId: 'h1', startTick: 0, readyTick: 0 }) as const;
    expect(setPieceContact({ restart: restart('free_kick', 'home'), autopilot: false })).toEqual({
      x: 0,
      y: 0,
    });
    expect(
      setPieceContact({
        restart: { ...restart('corner', 'home'), contact: { x: 1, y: 0 } },
        autopilot: false,
      }),
    ).toEqual({ x: 1, y: 0 });
    expect(setPieceContact({ restart: restart('penalty', 'home'), autopilot: false })).toBeNull();
    expect(setPieceContact({ restart: restart('free_kick', 'away'), autopilot: false })).toBeNull();
    expect(setPieceContact({ restart: restart('free_kick', 'home'), autopilot: true })).toBeNull();
    expect(setPieceContact({ restart: null, autopilot: false })).toBeNull();
  });
});

describe('penaltyRing', () => {
  it('hiện khi giữ D và lúc lấy đà; lực mạnh thì cao, to; nhẹ thì thấp, nhỏ', () => {
    const { players } = createMatch({
      home: starterLikeTeam,
      away: cpuEasyTeam,
      seed: 1,
      difficulty: 'easy',
    });
    const restart = {
      type: 'penalty',
      team: 'home',
      spot: { x: -(HALF_LENGTH - PENALTY_SPOT_DIST), y: 0 },
      takerId: 'home-P6',
      startTick: 0,
      readyTick: 0,
    } as const;
    const base = { restart, players, shotChargeTicks: 0, autopilot: false };
    expect(penaltyRing(base)).toBeNull();
    expect(penaltyRing({ ...base, shotChargeTicks: 10, autopilot: true })).toBeNull();
    expect(
      penaltyRing({ ...base, restart: { ...restart, team: 'away' }, shotChargeTicks: 10 }),
    ).toBeNull();
    // Đang giữ D: tâm giữa khung, lực theo số tick đã giữ.
    const weak = penaltyRing({ ...base, shotChargeTicks: 1 })!;
    const strong = penaltyRing({ ...base, shotChargeTicks: MAX_CHARGE_TICKS })!;
    expect(weak).toMatchObject({ x: -HALF_LENGTH, y: 0 });
    expect(strong.z).toBeGreaterThan(weak.z);
    expect(strong.radius).toBeGreaterThan(weak.radius);
    // Lấy đà: lực đã chốt, tâm người chơi đã dời.
    const run = { power: 0.8, y: 1.2, releaseTick: 10 };
    const taker = players.find((p) => p.id === 'home-P6')!;
    expect(penaltyRing({ ...base, restart: { ...restart, penaltyRunUp: run } })).toEqual({
      x: -HALF_LENGTH,
      y: 1.2,
      z: penaltyAimZ(0.8) + BALL_RADIUS,
      radius: penaltyRadius(taker, 0.8),
      color: penaltyRingColor(0.8),
    });
  });

  it('màu theo lực: xanh lá → vàng → cam → đỏ', () => {
    expect(penaltyRingColor(MIN_SHOT_POWER)).toBe('hsl(120 90% 55%)');
    expect(penaltyRingColor(0.65)).toBe('hsl(60 90% 55%)');
    expect(penaltyRingColor(0.825)).toBe('hsl(30 90% 55%)');
    expect(penaltyRingColor(1)).toBe('hsl(0 90% 55%)');
  });
});
