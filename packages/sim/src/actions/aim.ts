import { add, normalize, scale, vec2, type Vec2 } from '../math/vec2';
import { nextGaussian, type RngState } from '../rng';

/**
 * Lệch hướng `dir` một góc ngẫu nhiên ~ N(0, sigma) radian. Cộng thành phần vuông góc rồi chuẩn
 * hoá (tan θ ≈ θ với góc nhỏ) để chỉ dùng + − × ÷ sqrt, không cần sin/cos.
 */
export function deviate(dir: Vec2, sigma: number, rng: RngState): [Vec2, RngState] {
  const [g, next] = nextGaussian(rng);
  const unit = normalize(dir);
  const perp = vec2(-unit.y, unit.x);
  return [normalize(add(unit, scale(perp, g * sigma))), next];
}
