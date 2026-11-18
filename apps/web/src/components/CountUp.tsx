import { useEffect, useRef, useState } from 'react';
import { fmt } from './format';
import { prefersReducedMotion } from '../features/shop/reveal';

/** Tính giá trị trung gian theo tiến độ `[0, 1]` với đường cong ease-out bậc 3. */
export function countUpValue(from: number, to: number, progress: number): number {
  const t = Math.max(0, Math.min(1, progress));
  const eased = 1 - (1 - t) ** 3;
  return Math.round(from + (to - from) * eased);
}

/** Đếm số mượt khi `target` thay đổi; lần mount đầu giữ nguyên `target`, tôn trọng reduced-motion. */
export function useCountUp(target: number, durationMs = 360): number {
  const [display, setDisplay] = useState(target);
  const displayRef = useRef(target);
  const prevTargetRef = useRef(target);

  useEffect(() => {
    displayRef.current = display;
  }, [display]);

  useEffect(() => {
    if (prevTargetRef.current === target) return;
    prevTargetRef.current = target;
    const from = displayRef.current;
    if (
      from === target ||
      durationMs <= 0 ||
      prefersReducedMotion() ||
      typeof requestAnimationFrame !== 'function'
    ) {
      displayRef.current = target;
      setDisplay(target);
      return;
    }

    let raf = 0;
    const start = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const tick = (now: number) => {
      const elapsed = Math.max(0, now - start);
      const p = Math.min(1, elapsed / durationMs);
      const next = countUpValue(from, target, p);
      displayRef.current = next;
      setDisplay(next);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);

  return display;
}

export function CountUp({
  value,
  durationMs = 360,
  format = fmt,
}: {
  value: number;
  durationMs?: number;
  format?: (n: number) => string;
}) {
  const shown = useCountUp(value, durationMs);
  return <>{format(shown)}</>;
}
