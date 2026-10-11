import { TICK_DT } from '../index';
import { add, clampLength, length, normalize, scale, sub, vec2, type Vec2 } from '../math/vec2';
import {
  RECOVER_PER_SEC,
  RUN_DRAIN_PER_SEC,
  SPRINT_DRAIN_PER_SEC,
  STAND_SPEED,
  accelFor,
  fatigueFactor,
  runSpeedFor,
  sprintSpeedFor,
  staminaDrainMultFor,
} from '../stats/params';
import type { PlayerState } from '../types';

/*
 * Di chuyển cầu thủ: steering tới vận tốc mong muốn, giới hạn gia tốc, thể lực.
 * Tham số lấy từ `stats/params.ts`; ở đây chỉ có hình học va chạm.
 */

/** Bán kính thân cầu thủ (m) khi tách va chạm. */
export const PLAYER_RADIUS = 0.4;

/** Hướng của cặp trùng toạ độ — cố định để tất định. */
const COINCIDENT_DIR = vec2(1, 0);

const finiteOr0 = (v: number): number => (Number.isFinite(v) ? v : 0);

/**
 * Một tick di chuyển. `move` là hướng mong muốn (độ dài ≤ 1, dài hơn bị kẹp, NaN → 0);
 * `sprint` chỉ có tác dụng khi đang chạy. Hàm thuần.
 */
export function stepPlayer(player: PlayerState, move: Vec2, sprint: boolean): PlayerState {
  const dir = clampLength(vec2(finiteOr0(move.x), finiteOr0(move.y)), 1);
  const { pace, stamina: staminaStat } = player.stats;
  // Không bấm hướng thì nút nước rút vô tác dụng (cầu thủ chỉ đang trôi/phanh).
  const sprinting = sprint && length(dir) > 0;

  const topSpeed =
    (sprinting ? sprintSpeedFor(pace) : runSpeedFor(pace)) * fatigueFactor(player.stamina);
  const desired = scale(dir, topSpeed);
  const vel = add(player.vel, clampLength(sub(desired, player.vel), accelFor(pace) * TICK_DT));
  const speed = length(vel);

  let staminaDelta: number;
  if (speed < STAND_SPEED) {
    staminaDelta = RECOVER_PER_SEC;
  } else {
    const drain = sprinting
      ? SPRINT_DRAIN_PER_SEC
      : (RUN_DRAIN_PER_SEC * Math.min(speed, runSpeedFor(pace))) / runSpeedFor(pace);
    staminaDelta = -drain * staminaDrainMultFor(staminaStat);
  }
  const stamina = Math.min(100, Math.max(0, player.stamina + staminaDelta * TICK_DT));

  return {
    ...player,
    pos: add(player.pos, scale(vel, TICK_DT)),
    vel,
    facing: speed > 0 ? normalize(vel) : player.facing,
    stamina,
  };
}

/**
 * Tách các cặp cầu thủ chồng nhau (khoảng cách < 2 × PLAYER_RADIUS), mỗi người lùi một nửa.
 * Một lượt duyệt theo thứ tự mảng để tất định; trả mảng mới, không sửa đầu vào.
 */
export function separatePlayers(players: readonly PlayerState[]): PlayerState[] {
  const pos = players.map((p) => p.pos);
  const minDist = 2 * PLAYER_RADIUS;
  for (let i = 0; i < pos.length; i++) {
    for (let j = i + 1; j < pos.length; j++) {
      const d = sub(pos[j]!, pos[i]!);
      const dist = length(d);
      if (dist >= minDist) continue;
      const push = scale(dist > 0 ? scale(d, 1 / dist) : COINCIDENT_DIR, (minDist - dist) / 2);
      pos[i] = sub(pos[i]!, push);
      pos[j] = add(pos[j]!, push);
    }
  }
  return players.map((p, i) => (pos[i] === p.pos ? p : { ...p, pos: pos[i]! }));
}
