import { prefersReducedMotion } from '../shop/reveal';

export interface ArcPoint {
  x: number;
  y: number;
}

/** Điểm trên đường cong Bezier bậc 2 ở t ∈ [0, 1]. */
export function quadraticBezierPoint(
  p0: ArcPoint,
  p1: ArcPoint,
  p2: ArcPoint,
  t: number,
): ArcPoint {
  const u = Math.max(0, Math.min(1, t));
  const inv = 1 - u;
  return {
    x: inv * inv * p0.x + 2 * inv * u * p1.x + u * u * p2.x,
    y: inv * inv * p0.y + 2 * inv * u * p1.y + u * u * p2.y,
  };
}

/** Sinh các điểm dọc theo cung cong từ `from` tới `to` (nguyên tắc 7). */
export function buildArcPoints(from: ArcPoint, to: ArcPoint, steps = 8, lift = 72): ArcPoint[] {
  const midX = (from.x + to.x) / 2;
  const dx = to.x - from.x;
  const sideOffset =
    dx >= 0 ? -Math.min(60, Math.abs(dx) * 0.18) : Math.min(60, Math.abs(dx) * 0.18);
  const ctrl: ArcPoint = {
    x: midX + sideOffset,
    y: Math.min(from.y, to.y) - lift,
  };
  const out: ArcPoint[] = [];
  for (let i = 0; i <= steps; i++) {
    out.push(quadraticBezierPoint(from, ctrl, to, i / steps));
  }
  return out;
}

/** Thả vài đồng xu nhỏ bay theo đường cong về ví trên thanh trên khi nhận thưởng nhiệm vụ. */
export function flyCoinsArc(fromEl: HTMLElement | null, targetSelector = '.topbar .wallet'): void {
  if (prefersReducedMotion() || typeof document === 'undefined' || !fromEl) return;
  const target = document.querySelector<HTMLElement>(targetSelector);
  if (!target) return;
  const fr = fromEl.getBoundingClientRect();
  const tr = target.getBoundingClientRect();
  if (fr.width === 0 || tr.width === 0) return;

  const origin: ArcPoint = { x: fr.left + fr.width / 2, y: fr.top + fr.height / 2 };
  const dest: ArcPoint = { x: tr.left + tr.width / 2, y: tr.top + tr.height / 2 };
  const count = 4;

  for (let i = 0; i < count; i++) {
    const dot = document.createElement('span');
    dot.className = 'coin-arc';
    dot.setAttribute('aria-hidden', 'true');
    if (typeof dot.animate !== 'function') break;
    document.body.appendChild(dot);

    const pts = buildArcPoints(
      { x: origin.x + (i - 1.5) * 6, y: origin.y + (i % 2) * 4 },
      dest,
      8,
      64 + i * 16,
    );
    const keyframes: Keyframe[] = pts.map((p, idx) => ({
      transform: `translate(${p.x - 6}px, ${p.y - 6}px) scale(${idx === 0 ? 0.85 : idx === pts.length - 1 ? 0.65 : 1.05})`,
      opacity: idx === pts.length - 1 ? 0.2 : 1,
    }));
    const anim = dot.animate(keyframes, {
      duration: 460,
      delay: i * 45,
      easing: 'cubic-bezier(0.65, 0, 0.35, 1)',
      fill: 'forwards',
    });
    void anim.finished.then(
      () => dot.remove(),
      () => dot.remove(),
    );
  }
}
