import type { Rarity } from '@pitch/shared';

/**
 * Trình diễn mở gói bằng WAAPI (ADR-0008, DESIGN.md §6.3) — port từ prototype pack-opening.html.
 * Kết quả đã có từ server trước khi chạy; ở đây chỉ là animation, không quyết định gì.
 * React vẽ khung (`.reveal-slot > .reveal-mover > .reveal-aura + .reveal-shaker > .reveal-flipper`),
 * lớp này chỉ đụng `transform`/`opacity` và vài class (`flipped`, `hint`, `top`).
 */

/** Thời lượng theo độ hiếm (ms) — DESIGN.md §6.3. */
export const REVEAL_TIMING: Record<Rarity, { charge: number; flip: number; burst: number }> = {
  bronze: { charge: 0, flip: 360, burst: 0 },
  silver: { charge: 0, flip: 440, burst: 240 },
  gold: { charge: 450, flip: 560, burst: 520 },
  legend: { charge: 1300, flip: 760, burst: 900 },
};

/** Vàng+ có viền mặt sau phát sáng trước khi lật. */
export const hintsRarity = (r: Rarity) => r === 'gold' || r === 'legend';

const EASE_OUT = 'cubic-bezier(.22,1,.36,1)';
const EASE_IN_OUT = 'cubic-bezier(.65,0,.35,1)';
const EASE_SNAP = 'cubic-bezier(.34,1.56,.64,1)';

export function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

interface RevealerOptions {
  rarities: readonly Rarity[];
  /** Màn tối toàn trang (thẻ Huyền thoại). */
  scrim: { readonly current: HTMLElement | null };
  /** Sân khấu, để đưa thẻ Huyền thoại ra giữa. */
  stage: { readonly current: HTMLElement | null };
  onRevealed: (index: number) => void;
  onAllRevealed: () => void;
}

export class PackRevealer {
  private readonly anims = new Set<Animation>();
  private readonly revealed: boolean[];
  private readonly queue: number[] = [];
  private skip = false;
  private busy = true;
  private disposed = false;
  private row: HTMLElement | null = null;

  constructor(private readonly opts: RevealerOptions) {
    this.revealed = opts.rarities.map(() => false);
  }

  private get reduced() {
    return prefersReducedMotion();
  }

  private run(
    el: Element,
    keyframes: Keyframe[],
    o: KeyframeAnimationOptions & { force?: boolean },
  ): Promise<void> {
    const { force, ...opts } = o;
    const duration = Number(opts.duration ?? 0);
    if ((this.skip && !force) || duration <= 0) opts.duration = 1;
    const a = el.animate(keyframes, { fill: 'none', ...opts });
    this.anims.add(a);
    return a.finished.then(
      () => void this.anims.delete(a),
      () => void this.anims.delete(a),
    );
  }

  private wait(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, this.skip ? 0 : ms));
  }

  /** Rung + xé đôi gói. Gọi trước khi React đổi sang hàng thẻ. */
  async tear(pack: HTMLElement): Promise<DOMRect> {
    pack.style.animation = 'none';
    const rect = pack.getBoundingClientRect();
    if (this.reduced) return rect;
    await this.run(
      pack,
      [
        { transform: 'none' },
        { transform: 'translateX(-4px) rotate(-2deg)' },
        { transform: 'translateX(4px) rotate(2deg)' },
        { transform: 'none' },
      ],
      { duration: 260, iterations: 2 },
    );
    const top = pack.querySelector('.pack__top');
    const bot = pack.querySelector('.pack__bot');
    const label = pack.querySelector('.pack__label');
    await Promise.all([
      top &&
        this.run(
          top,
          [
            { transform: 'none', opacity: 1 },
            { transform: 'translate(-20px,-90px) rotate(-14deg)', opacity: 0 },
          ],
          { duration: 420, easing: EASE_OUT, fill: 'forwards' },
        ),
      bot &&
        this.run(
          bot,
          [
            { transform: 'none', opacity: 1 },
            { transform: 'translateY(60px) scale(.9)', opacity: 0 },
          ],
          { duration: 420, easing: 'ease-in', fill: 'forwards' },
        ),
      label &&
        this.run(label, [{ opacity: 1 }, { opacity: 0 }], { duration: 160, fill: 'forwards' }),
    ]);
    return rect;
  }

  /** Thẻ úp bay từ chỗ gói ra hàng, cách nhau 80ms. */
  async layout(row: HTMLElement, from: DOMRect | null): Promise<void> {
    this.row = row;
    const slots = [...row.querySelectorAll<HTMLElement>('.reveal-slot')];
    const cx = from ? from.left + from.width / 2 : 0;
    const cy = from ? from.top + from.height / 2 : 0;
    await Promise.all(
      slots.map((s, i) => {
        if (this.reduced || !from) {
          return this.run(s, [{ opacity: 0 }, { opacity: 1 }], { duration: 200, delay: i * 40 });
        }
        const r = s.getBoundingClientRect();
        const dx = cx - (r.left + r.width / 2);
        const dy = cy - (r.top + r.height / 2);
        return this.run(
          s,
          [
            {
              transform: `translate(${dx}px,${dy}px) scale(.55) rotate(${(i - (slots.length - 1) / 2) * 6}deg)`,
              opacity: 0,
            },
            { opacity: 1, offset: 0.25 },
            { transform: 'none', opacity: 1 },
          ],
          { duration: 520, delay: i * 80, easing: EASE_SNAP, fill: 'backwards' },
        );
      }),
    );
    if (this.disposed) return;
    this.busy = false;
    const queued = this.queue.shift();
    if (queued !== undefined) void this.reveal(queued);
    else this.focusNext();
  }

  /** Chỉ số thẻ úp kế tiếp chưa xếp hàng; -1 nếu hết. */
  nextHidden(): number {
    return this.revealed.findIndex((v, k) => !v && !this.queue.includes(k));
  }

  private slot(i: number): HTMLElement | null {
    return this.row?.querySelector<HTMLElement>(`.reveal-slot[data-i="${i}"]`) ?? null;
  }

  private focusNext() {
    const next = this.revealed.indexOf(false);
    if (next >= 0) {
      this.slot(next)?.querySelector<HTMLElement>('.reveal-back')?.focus({ preventScroll: true });
    }
  }

  private burst(mover: HTMLElement, count: number): Promise<void> {
    const ring = document.createElement('div');
    ring.className = 'reveal-ring';
    mover.appendChild(ring);
    const ps = [
      this.run(
        ring,
        [
          { transform: 'scale(.7)', opacity: 0.9 },
          { transform: 'scale(1.9)', opacity: 0 },
        ],
        { duration: 620, easing: EASE_OUT },
      ),
    ];
    const sparks: HTMLElement[] = [];
    for (let i = 0; i < count; i++) {
      const s = document.createElement('span');
      s.className = 'reveal-spark';
      mover.appendChild(s);
      sparks.push(s);
      // Chỉ trang trí, không ảnh hưởng kết quả → Math.random được phép ở web.
      const ang = (i / count) * Math.PI * 2 + Math.random() * 0.4;
      const dist = 90 + Math.random() * 110;
      ps.push(
        this.run(
          s,
          [
            { transform: 'translate(0,0) rotate(45deg) scale(1)', opacity: 1 },
            {
              transform: `translate(${Math.cos(ang) * dist}px,${Math.sin(ang) * dist}px) rotate(45deg) scale(0)`,
              opacity: 0.2,
            },
          ],
          { duration: 700 + Math.random() * 300, easing: EASE_OUT },
        ),
      );
    }
    return Promise.all(ps).then(() => {
      ring.remove();
      sparks.forEach((n) => n.remove());
    });
  }

  /** Lật thẻ `i`. Bấm trong lúc thẻ khác đang diễn → xếp hàng. */
  async reveal(i: number, quick = false): Promise<void> {
    if (this.disposed || this.revealed[i]) return;
    if (this.busy && !quick) {
      if (!this.queue.includes(i)) this.queue.push(i);
      return;
    }
    const slot = this.slot(i);
    if (!slot) return;
    this.revealed[i] = true;
    if (!quick) this.busy = true;
    const rarity = this.opts.rarities[i]!;
    const mover = slot.querySelector<HTMLElement>('.reveal-mover')!;
    const shaker = slot.querySelector<HTMLElement>('.reveal-shaker')!;
    const flipper = slot.querySelector<HTMLElement>('.reveal-flipper')!;
    const aura = slot.querySelector<HTMLElement>('.reveal-aura')!;
    const sheen = slot.querySelector<HTMLElement>('.card__sheen');
    const back = slot.querySelector<HTMLElement>('.reveal-back');
    if (back) back.tabIndex = -1;

    if (this.reduced) {
      await this.run(flipper, [{ opacity: 1 }, { opacity: 0 }], { duration: 100, force: true });
      flipper.classList.add('flipped');
      slot.classList.remove('hint');
      await this.run(flipper, [{ opacity: 0 }, { opacity: 1 }], { duration: 100, force: true });
    } else if (quick || this.skip) {
      slot.classList.remove('hint');
      await this.run(flipper, [{ transform: 'rotateY(0)' }, { transform: 'rotateY(180deg)' }], {
        duration: 240,
        easing: EASE_IN_OUT,
        force: true,
      });
      flipper.classList.add('flipped');
    } else {
      await this.dramaticFlip(slot, rarity, { mover, shaker, flipper, aura, sheen });
    }

    if (this.disposed) return;
    this.opts.onRevealed(i);
    if (!quick) this.busy = false;
    if (this.revealed.every(Boolean)) this.opts.onAllRevealed();
    else if (!quick) {
      const queued = this.queue.shift();
      if (queued !== undefined) void this.reveal(queued);
      else this.focusNext();
    }
  }

  private async dramaticFlip(
    slot: HTMLElement,
    rarity: Rarity,
    els: {
      mover: HTMLElement;
      shaker: HTMLElement;
      flipper: HTMLElement;
      aura: HTMLElement;
      sheen: HTMLElement | null;
    },
  ) {
    const { mover, shaker, flipper, aura, sheen } = els;
    const T = REVEAL_TIMING[rarity];
    const isLegend = rarity === 'legend';
    slot.classList.add('top');
    let toCenter = 'none';
    if (isLegend) {
      const st = this.opts.stage.current?.getBoundingClientRect();
      const r = slot.getBoundingClientRect();
      if (st) {
        toCenter = `translate(${st.left + st.width / 2 - (r.left + r.width / 2)}px, ${st.top + st.height / 2 - (r.top + r.height / 2)}px) scale(1.3)`;
      }
      this.opts.scrim.current?.classList.add('on');
      const rays = document.createElement('div');
      rays.className = 'reveal-rays';
      mover.prepend(rays);
      void this.run(
        rays,
        [
          { opacity: 0, transform: 'rotate(0)' },
          { opacity: 1, offset: 0.2 },
          { opacity: 1, offset: 0.8 },
          { opacity: 0, transform: 'rotate(160deg)' },
        ],
        { duration: T.charge + T.flip + T.burst + 400 },
      ).then(() => rays.remove());
    }
    // 1) Tích tụ
    if (T.charge) {
      void this.run(aura, [{ opacity: 0.55 }, { opacity: 1, transform: 'scale(1.25)' }], {
        duration: T.charge,
        fill: 'forwards',
      });
      if (isLegend) {
        await this.run(mover, [{ transform: 'none' }, { transform: toCenter }], {
          duration: 520,
          easing: EASE_OUT,
          fill: 'forwards',
        });
      }
      const amp = isLegend ? [1, 2, 3, 4, 5, 6] : [1, 2, 3];
      const kf: Keyframe[] = [{ transform: 'none' }, { transform: 'translateY(-10px)' }];
      for (const a of amp) {
        kf.push(
          { transform: `translate(${-a}px,-10px) rotate(${-a * 0.4}deg)` },
          { transform: `translate(${a}px,-10px) rotate(${a * 0.4}deg)` },
        );
      }
      kf.push({ transform: 'translateY(-10px)' });
      await this.run(shaker, kf, {
        duration: isLegend ? T.charge - 520 : T.charge,
        easing: 'ease-in',
        fill: 'forwards',
      });
    }
    slot.classList.remove('hint');
    // 2) Lật
    await this.run(
      flipper,
      [
        { transform: 'rotateY(0) scale(1)' },
        { transform: 'rotateY(90deg) scale(1.08)', offset: 0.5 },
        { transform: 'rotateY(180deg) scale(1)' },
      ],
      { duration: T.flip, easing: EASE_IN_OUT },
    );
    flipper.classList.add('flipped');
    // 3) Bùng nổ
    const after: Promise<void>[] = [
      this.run(
        shaker,
        [{ transform: T.charge ? 'translateY(-10px)' : 'scale(1.05)' }, { transform: 'none' }],
        { duration: 260, easing: EASE_SNAP },
      ),
    ];
    if (sheen && rarity !== 'bronze') {
      after.push(
        this.run(sheen, [{ transform: 'translateX(-130%)' }, { transform: 'translateX(130%)' }], {
          duration: isLegend ? 900 : 600,
          easing: 'ease-in-out',
        }),
      );
    }
    if (rarity === 'gold') after.push(this.burst(mover, 12));
    if (isLegend) after.push(this.burst(mover, 28));
    if (T.burst) after.push(this.wait(T.burst));
    await Promise.all(after);
    shaker.getAnimations().forEach((a) => a.cancel());
    aura.getAnimations().forEach((a) => a.cancel());
    if (isLegend) {
      await this.wait(500);
      this.opts.scrim.current?.classList.remove('on');
      await this.run(mover, [{ transform: toCenter }, { transform: 'none' }], {
        duration: 480,
        easing: EASE_IN_OUT,
      });
      mover.getAnimations().forEach((a) => a.cancel());
    }
    slot.classList.remove('top');
  }

  /** "Lật hết" / Esc: tua nhanh chuỗi đang chạy rồi lật phần còn lại cách nhau 80ms. */
  async revealAll(): Promise<void> {
    if (this.disposed) return;
    this.skip = true;
    this.queue.length = 0;
    this.anims.forEach((a) => {
      try {
        a.finish();
      } catch {
        /* đã xong */
      }
    });
    this.opts.scrim.current?.classList.remove('on');
    this.row?.querySelectorAll('.reveal-slot').forEach((s) => s.classList.remove('top'));
    await new Promise((r) => setTimeout(r, 30));
    const rest = this.revealed.flatMap((v, i) => (v ? [] : [i]));
    this.busy = true;
    await Promise.all(
      rest.map((i, k) =>
        new Promise((r) => setTimeout(r, k * 80)).then(() => this.reveal(i, true)),
      ),
    );
    this.busy = false;
    this.skip = false;
  }

  /** Gắn lại sau `dispose()` (StrictMode chạy mount → cleanup → mount). */
  attach() {
    this.disposed = false;
  }

  dispose() {
    this.disposed = true;
    this.anims.forEach((a) => a.cancel());
    this.anims.clear();
    this.opts.scrim.current?.classList.remove('on');
  }
}
