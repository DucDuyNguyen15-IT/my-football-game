import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hintsRarity, PackRevealer } from './reveal';

interface FakeAnim {
  duration: number;
  finished: Promise<void>;
  finish: () => void;
  cancel: () => void;
}

class FakeClassList {
  private readonly set = new Set<string>();
  add(...tokens: string[]) {
    for (const t of tokens) this.set.add(t);
  }
  remove(...tokens: string[]) {
    for (const t of tokens) this.set.delete(t);
  }
  contains(t: string) {
    return this.set.has(t);
  }
}

class FakeElement {
  className = '';
  tabIndex = 0;
  style: Record<string, string> = {};
  readonly classList = new FakeClassList();
  readonly children: FakeElement[] = [];
  readonly recordedDurations: number[] = [];
  private readonly anims: FakeAnim[] = [];
  private attrs = new Map<string, string>();
  private qs = new Map<string, FakeElement>();
  private qsa = new Map<string, FakeElement[]>();

  constructor(className = '') {
    this.className = className;
    if (className) {
      for (const c of className.split(/\s+/)) this.classList.add(c);
    }
  }

  setAttr(k: string, v: string) {
    this.attrs.set(k, v);
  }

  getAttribute(k: string) {
    return this.attrs.get(k) ?? null;
  }

  setQuery(selector: string, el: FakeElement) {
    this.qs.set(selector, el);
  }

  setQueryAll(selector: string, els: FakeElement[]) {
    this.qsa.set(selector, els);
  }

  querySelector<T = FakeElement>(selector: string): T | null {
    return (this.qs.get(selector) ?? null) as T | null;
  }

  querySelectorAll<T = FakeElement>(selector: string): T[] {
    return (this.qsa.get(selector) ?? []) as T[];
  }

  getBoundingClientRect() {
    return { left: 10, top: 20, width: 100, height: 140, right: 110, bottom: 160 };
  }

  animate(_keyframes: Keyframe[], options: KeyframeAnimationOptions = {}): Animation {
    const duration = Number(options.duration ?? 0);
    this.recordedDurations.push(duration);
    let resolveFn!: () => void;
    let rejectFn!: (reason?: unknown) => void;
    let settled = false;
    const finished = new Promise<void>((res, rej) => {
      resolveFn = () => {
        if (settled) return;
        settled = true;
        res();
      };
      rejectFn = (err) => {
        if (settled) return;
        settled = true;
        rej(err);
      };
    });
    const timer = duration <= 5 ? setTimeout(resolveFn, 0) : setTimeout(resolveFn, duration);
    const anim: FakeAnim = {
      duration,
      finished,
      finish: () => {
        clearTimeout(timer);
        resolveFn();
      },
      cancel: () => {
        clearTimeout(timer);
        rejectFn(new Error('cancelled'));
      },
    };
    this.anims.push(anim);
    return anim as unknown as Animation;
  }

  getAnimations() {
    return this.anims as unknown as Animation[];
  }

  appendChild(child: FakeElement) {
    this.children.push(child);
    return child;
  }

  prepend(child: FakeElement) {
    this.children.unshift(child);
  }

  remove() {}
  focus() {}
}

function buildRow(count: number): { row: FakeElement; slots: FakeElement[] } {
  const row = new FakeElement('reveal-row');
  const slots: FakeElement[] = [];
  for (let i = 0; i < count; i++) {
    const slot = new FakeElement('reveal-slot');
    slot.setAttr('data-i', String(i));
    const mover = new FakeElement('reveal-mover');
    const shaker = new FakeElement('reveal-shaker');
    const flipper = new FakeElement('reveal-flipper');
    const aura = new FakeElement('reveal-aura');
    const back = new FakeElement('reveal-back');
    const sheen = new FakeElement('card__sheen');
    slot.setQuery('.reveal-mover', mover);
    slot.setQuery('.reveal-shaker', shaker);
    slot.setQuery('.reveal-flipper', flipper);
    slot.setQuery('.reveal-aura', aura);
    slot.setQuery('.reveal-back', back);
    slot.setQuery('.card__sheen', sheen);
    row.setQuery(`.reveal-slot[data-i="${i}"]`, slot);
    slots.push(slot);
  }
  row.setQueryAll('.reveal-slot', slots);
  return { row, slots };
}

describe('PackRevealer (nguyên tắc 9: bỏ qua / tua nhanh)', () => {
  const prevDoc = globalThis.document;
  const prevMatchMedia = globalThis.matchMedia;

  beforeEach(() => {
    (globalThis as { document: unknown }).document = {
      createElement: () => new FakeElement(),
    };
    (globalThis as { matchMedia: unknown }).matchMedia = () => ({ matches: false });
  });

  afterEach(() => {
    (globalThis as { document: unknown }).document = prevDoc;
    (globalThis as { matchMedia: unknown }).matchMedia = prevMatchMedia;
    vi.useRealTimers();
  });

  it('hintsRarity chỉ bật cho vàng và huyền thoại', () => {
    expect(hintsRarity('bronze')).toBe(false);
    expect(hintsRarity('silver')).toBe(false);
    expect(hintsRarity('gold')).toBe(true);
    expect(hintsRarity('legend')).toBe(true);
  });

  it('skipCurrent() tua nhanh bước xé gói hoặc lật thẻ đang chạy mà không skip các thẻ kế tiếp', async () => {
    vi.useFakeTimers();
    const { row, slots } = buildRow(2);
    const scrim = new FakeElement('reveal-scrim');
    const stage = new FakeElement('stage');
    const revealed: number[] = [];
    let allDone = false;

    const rv = new PackRevealer({
      rarities: ['gold', 'bronze'],
      scrim: { current: scrim as unknown as HTMLElement },
      stage: { current: stage as unknown as HTMLElement },
      onRevealed: (i) => revealed.push(i),
      onAllRevealed: () => {
        allDone = true;
      },
    });

    expect(rv.isBusy()).toBe(true);
    const layoutPromise = rv.layout(
      row as unknown as HTMLElement,
      {
        left: 0,
        top: 0,
        width: 100,
        height: 100,
      } as DOMRect,
    );
    rv.skipCurrent();
    await vi.runAllTimersAsync();
    await layoutPromise;
    expect(rv.isBusy()).toBe(false);

    // Lật thẻ 0 (gold) và gọi skipCurrent() ngay giữa chừng.
    const reveal0 = rv.reveal(0);
    expect(rv.isBusy()).toBe(true);
    rv.skipCurrent();
    await vi.runAllTimersAsync();
    await reveal0;

    expect(revealed).toEqual([0]);
    expect(rv.isBusy()).toBe(false);
    expect(rv.nextHidden()).toBe(1);
    expect(allDone).toBe(false);

    // Thẻ 1 phải lật với thời lượng bình thường (skipStep đã reset sau khi thẻ 0 xong).
    const flipper1 = slots[1]!.querySelector('.reveal-flipper')!;
    const reveal1 = rv.reveal(1);
    await vi.runAllTimersAsync();
    await reveal1;

    expect(flipper1.recordedDurations).toContain(360);
    expect(revealed).toEqual([0, 1]);
    expect(allDone).toBe(true);
  });

  it('skipCurrent() khi đang xé gói hoàn tất tức thì', async () => {
    vi.useFakeTimers();
    const pack = new FakeElement('pack');
    pack.setQuery('.pack__top', new FakeElement('pack__top'));
    pack.setQuery('.pack__bot', new FakeElement('pack__bot'));
    pack.setQuery('.pack__label', new FakeElement('pack__label'));

    const rv = new PackRevealer({
      rarities: ['bronze'],
      scrim: { current: null },
      stage: { current: null },
      onRevealed: () => {},
      onAllRevealed: () => {},
    });

    const p = rv.tear(pack as unknown as HTMLElement);
    rv.skipCurrent();
    await vi.runAllTimersAsync();
    const rect = await p;
    expect(rect.width).toBe(100);
    expect(pack.querySelector('.pack__top')!.recordedDurations).toContain(1);
  });

  it('revealAll() lật hết các thẻ còn lại và gọi onAllRevealed', async () => {
    vi.useFakeTimers();
    const { row } = buildRow(3);
    const revealed: number[] = [];
    let allDone = false;

    const rv = new PackRevealer({
      rarities: ['bronze', 'silver', 'legend'],
      scrim: { current: new FakeElement() as unknown as HTMLElement },
      stage: { current: new FakeElement() as unknown as HTMLElement },
      onRevealed: (i) => revealed.push(i),
      onAllRevealed: () => {
        allDone = true;
      },
    });

    const layoutPromise = rv.layout(row as unknown as HTMLElement, null);
    await vi.runAllTimersAsync();
    await layoutPromise;

    const allPromise = rv.revealAll();
    await vi.runAllTimersAsync();
    await allPromise;

    expect(revealed).toEqual([0, 1, 2]);
    expect(rv.nextHidden()).toBe(-1);
    expect(allDone).toBe(true);
    expect(rv.isBusy()).toBe(false);
  });

  it('dispose() huỷ animation và dọn scrim', async () => {
    vi.useFakeTimers();
    const { row } = buildRow(1);
    const scrim = new FakeElement('reveal-scrim');
    scrim.classList.add('on');
    let count = 0;

    const rv = new PackRevealer({
      rarities: ['gold'],
      scrim: { current: scrim as unknown as HTMLElement },
      stage: { current: new FakeElement() as unknown as HTMLElement },
      onRevealed: () => {
        count++;
      },
      onAllRevealed: () => {},
    });

    const lp = rv.layout(row as unknown as HTMLElement, null);
    await vi.runAllTimersAsync();
    await lp;

    const rp = rv.reveal(0);
    rv.dispose();
    await vi.runAllTimersAsync();
    await rp;

    expect(scrim.classList.contains('on')).toBe(false);
    expect(count).toBe(0);
  });
});
