import type { MatchState } from './types';

const f64 = new Float64Array(1);
const u32 = new Uint32Array(f64.buffer);

/**
 * FNV-1a 32-bit trên PHÉP CHIẾU cố định của state (không băm JSON, nên đổi hình dạng field không đổi
 * hash): tick, tỉ số home/away, phase, hiệp + tick trong hiệp, trạng thái rng, bóng (pos, vel, z, vz), từng
 * cầu thủ (id, pos, vel) theo thứ tự id. Có rng để lỗi không tất định chỉ làm lệch rng lộ ngay (review C1-3).
 * Số thực băm theo đúng 64 bit IEEE-754 để lệch dù 1 ulp giữa các engine cũng lộ ra.
 */
export function stateHash(state: MatchState): number {
  let h = 2166136261;
  const byte = (b: number) => {
    h = Math.imul(h ^ (b & 255), 16777619) >>> 0;
  };
  const num = (x: number) => {
    f64[0] = x;
    for (const w of u32) for (let i = 0; i < 32; i += 8) byte(w >>> i);
  };
  const str = (s: string) => {
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      byte(c);
      byte(c >>> 8);
    }
    byte(0);
  };
  num(state.tick);
  num(state.score.home);
  num(state.score.away);
  str(state.phase);
  num(state.half);
  num(state.halfTick);
  num(state.rng);
  const b = state.ball;
  for (const x of [b.pos.x, b.pos.y, b.vel.x, b.vel.y, b.z, b.vz]) num(x);
  const players = [...state.players].sort((p, q) => (p.id < q.id ? -1 : p.id > q.id ? 1 : 0));
  for (const p of players) {
    str(p.id);
    for (const x of [p.pos.x, p.pos.y, p.vel.x, p.vel.y]) num(x);
  }
  return h;
}
