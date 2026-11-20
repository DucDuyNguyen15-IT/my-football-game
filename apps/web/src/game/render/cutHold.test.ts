import { describe, expect, it } from 'vitest';
import {
  HALF_LENGTH,
  cpuEasyTeam,
  createMatch,
  starterLikeTeam,
  type MatchState,
} from '@pitch/sim';
import {
  BALL_OUT_LIMIT,
  CutHold,
  NET_DEPTH,
  snapshotHold,
  FALL_TILT_MAX,
  FALL_TILT_SEC,
  PLAYER_STOP_DECEL,
  VICTIM_MIN_SLIDE_SPEED,
  fallTilt,
  glideDistance,
  glideSpeed,
} from './cutHold';
import { FOUL_DELAY_SEC, OUT_OF_BOUNDS_DELAY_SEC, buildTransitionSpec } from './transition';

const live = (): MatchState => ({
  ...createMatch({ home: starterLikeTeam, away: cpuEasyTeam, difficulty: 'easy', seed: 7 }),
  tick: 500,
  phase: 'play',
  ballDead: false,
  restart: null,
});

describe('glideDistance / glideSpeed / fallTilt', () => {
  it('giảm tốc đều tới khi dừng hẳn rồi đứng yên', () => {
    expect(glideDistance(6, 6, 0)).toBe(0);
    expect(glideDistance(6, 6, 0.5)).toBeCloseTo(6 * 0.5 - 0.5 * 6 * 0.25);
    // Dừng sau 1 s, quãng đường v²/2a = 3 m; sau đó không đi thêm.
    expect(glideDistance(6, 6, 1)).toBeCloseTo(3);
    expect(glideDistance(6, 6, 5)).toBeCloseTo(3);
    expect(glideSpeed(6, 6, 0.5)).toBeCloseTo(3);
    expect(glideSpeed(6, 6, 2)).toBe(0);
    expect(glideDistance(0, 6, 1)).toBe(0);
  });

  it('cầu thủ khối ngã về trước trong FALL_TILT_SEC rồi nằm yên', () => {
    expect(fallTilt(0)).toBe(0);
    expect(fallTilt(FALL_TILT_SEC / 2)).toBeGreaterThan(0);
    expect(fallTilt(FALL_TILT_SEC / 2)).toBeLessThan(FALL_TILT_MAX);
    expect(fallTilt(FALL_TILT_SEC)).toBeCloseTo(FALL_TILT_MAX);
    expect(fallTilt(3)).toBeCloseTo(FALL_TILT_MAX);
  });
});

describe('CutHold — diễn tiếp pha bóng trước khi khép stinger', () => {
  it('phạm lỗi: người bị phạm lỗi trượt ngã (vận tốc báo 0, nằm sân), người khác chậm dần rồi dừng', () => {
    const prev = live();
    const victim = prev.players.find((p) => p.team === 'home' && p.position !== 'GK')!;
    const runner = prev.players.find((p) => p.team === 'away' && p.position !== 'GK')!;
    const withVel: MatchState = {
      ...prev,
      ballOwnerId: victim.id,
      players: prev.players.map((p) =>
        p.id === victim.id || p.id === runner.id ? { ...p, vel: { x: 5, y: 0 } } : { ...p, vel: { x: 0, y: 0 } },
      ),
      ball: { pos: { x: victim.pos.x + 0.4, y: victim.pos.y }, vel: { x: 5, y: 0 }, z: 0, vz: 0 },
    };
    const curr: MatchState = { ...withVel, tick: 501, phase: 'dead_ball' };
    const spec = buildTransitionSpec('free_kick', {
      team: 'home',
      delaySec: FOUL_DELAY_SEC,
      foul: { victimId: victim.id, tacklerId: runner.id, slide: false, card: null, bookedNumber: null },
    });
    const hold = new CutHold(withVel, curr, spec);
    const v = () => hold.state.players.find((p) => p.id === victim.id)!;
    const r = () => hold.state.players.find((p) => p.id === runner.id)!;

    expect(hold.state.ballOwnerId).toBeNull();
    expect(hold.state.actionDeadline.home).toBeNull();
    expect(hold.state.tackleRecovery[victim.id]).toBeGreaterThan(curr.tick);
    expect(hold.ready).toBe(false);

    const statePlayers = hold.state.players;
    hold.advance(0.3);
    // Cập nhật tại chỗ: không tạo mảng/đối tượng mới mỗi khung hình.
    expect(hold.state.players).toBe(statePlayers);
    expect(v().pos.x).toBeGreaterThan(victim.pos.x);
    expect(v().vel).toEqual({ x: 0, y: 0 });
    expect(r().vel.x).toBeCloseTo(5 - PLAYER_STOP_DECEL * 0.3);
    expect(hold.state.ball.pos.x).toBeGreaterThan(victim.pos.x + 0.4);
    expect(hold.victimTilt()).toBeGreaterThan(0);

    hold.advance(FOUL_DELAY_SEC);
    expect(hold.ready).toBe(true);
    expect(r().vel.x).toBe(0);
    // Trượt ít nhất với VICTIM_MIN_SLIDE_SPEED → thấy rõ cú ngã.
    expect(v().pos.x - victim.pos.x).toBeGreaterThan(VICTIM_MIN_SLIDE_SPEED ** 2 / 20);
  });

  it('người bị phạm lỗi đứng yên vẫn trượt theo hướng mặt', () => {
    const prev = live();
    const victim = prev.players.find((p) => p.team === 'home' && p.position !== 'GK')!;
    const still: MatchState = {
      ...prev,
      players: prev.players.map((p) =>
        p.id === victim.id ? { ...p, vel: { x: 0, y: 0 }, facing: { x: 0, y: 1 } } : p,
      ),
    };
    const spec = buildTransitionSpec('penalty', {
      delaySec: FOUL_DELAY_SEC,
      foul: { victimId: victim.id, tacklerId: null, slide: false, card: 'red', bookedNumber: 4 },
    });
    const hold = new CutHold(still, { ...still, tick: 501 }, spec);
    hold.advance(1);
    const v = hold.state.players.find((p) => p.id === victim.id)!;
    expect(v.pos.y).toBeGreaterThan(victim.pos.y + 0.3);
    expect(v.pos.x).toBeCloseTo(victim.pos.x);
  });

  it('bóng ra biên: bóng lăn tiếp qua vạch nhưng không xuyên biển quảng cáo; hết OUT_OF_BOUNDS_DELAY_SEC thì sẵn sàng', () => {
    const prev: MatchState = {
      ...live(),
      ballOwnerId: null,
      ball: { pos: { x: HALF_LENGTH - 0.5, y: 3 }, vel: { x: 25, y: 0 }, z: 0.6, vz: 1 },
    };
    const spec = buildTransitionSpec('goal_kick', { delaySec: OUT_OF_BOUNDS_DELAY_SEC });
    const hold = new CutHold(prev, { ...prev, tick: 501, phase: 'dead_ball' }, spec);
    expect(hold.victimTilt()).toBe(0);
    hold.advance(0.2);
    expect(hold.state.ball.pos.x).toBeGreaterThan(HALF_LENGTH);
    expect(hold.ready).toBe(false);
    hold.advance(OUT_OF_BOUNDS_DELAY_SEC);
    expect(hold.ready).toBe(true);
    expect(hold.state.ball.pos.x).toBeLessThanOrEqual(HALF_LENGTH + BALL_OUT_LIMIT);
    expect(hold.state.ball.z).toBe(0);
  });

  it('bàn thắng / phạm lỗi gần khung thành: bóng dừng ở lưới, không xuyên ra sau; tỉ số lấy từ tick mới', () => {
    const prev: MatchState = {
      ...live(),
      ballOwnerId: null,
      ball: { pos: { x: HALF_LENGTH - 0.5, y: 1 }, vel: { x: 25, y: 0 }, z: 0.4, vz: 0 },
    };
    const curr = { ...prev, tick: 501, score: { home: 1, away: 0 } };
    const hold = new CutHold(prev, curr, buildTransitionSpec('free_kick', { delaySec: 1 }));
    expect(hold.state.score).toEqual({ home: 1, away: 0 });
    hold.advance(1);
    expect(hold.state.ball.pos.x).toBe(HALF_LENGTH + NET_DEPTH);
    expect(hold.state.ball.vel.x).toBe(0);
    // Bản sao đứng yên không bị advance sau đó ghi đè.
    const snap = snapshotHold(hold.state);
    hold.advance(1);
    expect(snap.ball.pos).not.toBe(hold.state.ball.pos);
    expect(snap.players[0]!.pos).not.toBe(hold.state.players[0]!.pos);
  });

  it('tạm dừng (dt = 0) không tiến cảnh giữ', () => {
    const prev = live();
    const hold = new CutHold(prev, { ...prev, tick: 501 }, buildTransitionSpec('corner', { delaySec: 0.6 }));
    hold.advance(0);
    hold.advance(0);
    expect(hold.elapsed).toBe(0);
    expect(hold.ready).toBe(false);
  });
});
