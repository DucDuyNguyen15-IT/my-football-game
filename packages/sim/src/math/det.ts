/**
 * Hàm siêu việt thuần số học (chỉ + − × ÷ và hằng số). Chuẩn IEEE-754 chỉ bảo đảm kết quả giống hệt
 * giữa các engine cho 5 phép tính cơ bản và sqrt; Math.log/cos/sin… thì không → replay trên server
 * (Node/V8) có thể lệch client (Firefox/Safari). Độ chính xác ~1e-13, đủ cho nhiễu aim.
 */
const LN2 = 0.6931471805599453;
const TWO_PI = 2 * Math.PI;

/** ln(x) với x > 0 (nhận x ngoài (0, 1] nhưng chậm dần theo |log2 x|). */
export function ln(x: number): number {
  if (!(x > 0)) return x === 0 ? -Infinity : NaN;
  // Rút gọn bên dưới đưa x = 1 về m = 0.5, k = −1 và làm tròn ra +2.2e-16 → nextGaussian ra NaN.
  if (x === 1) return 0;
  let m = x;
  let k = 0;
  // Đưa m về [0.5, 1): nhân/chia 2 là chính xác trong IEEE-754.
  while (m < 0.5) {
    m *= 2;
    k++;
  }
  while (m >= 1) {
    m *= 0.5;
    k--;
  }
  // ln m = 2·atanh(s), s = (m − 1)/(m + 1) ∈ [−1/3, 0).
  const s = (m - 1) / (m + 1);
  const s2 = s * s;
  let term = s;
  let sum = 0;
  for (let i = 1; i <= 31; i += 2) {
    sum += term / i;
    term *= s2;
  }
  return 2 * sum - k * LN2;
}

/** cos(t) cho t trong [0, 2π] (ngoài đoạn đó trả về NaN: sim chỉ cần góc của Box–Muller). */
export function cos2pi(t: number): number {
  if (!(t >= 0 && t <= TWO_PI)) return NaN;
  let a = t > Math.PI ? TWO_PI - t : t; // cos đối xứng qua π
  let sign = 1;
  if (a > Math.PI / 2) {
    a = Math.PI - a;
    sign = -1;
  }
  const a2 = a * a;
  let term = 1;
  let sum = 1;
  for (let k = 1; k <= 10; k++) {
    term *= -a2 / ((2 * k - 1) * (2 * k));
    sum += term;
  }
  return sign * sum;
}
