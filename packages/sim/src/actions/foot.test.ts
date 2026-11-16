import { describe, expect, it } from 'vitest';
import { vec2 } from '../math/vec2';
import type { PlayerState } from '../types';
import { footErrorMult, kickFoot } from './foot';

const player = (over: Partial<PlayerState> = {}): PlayerState =>
  ({ pos: vec2(0, 0), facing: vec2(1, 0), foot: 'right', ...over }) as PlayerState;

describe('kickFoot', () => {
  // Bên phải hướng d = (1, 0) là (−0, 1) = +y.
  it('bóng lệch sang phải đường đá thì chân phải, sang trái thì chân trái', () => {
    const p = player({ foot: 'left' });
    expect(kickFoot(p, vec2(0.5, 0), vec2(1, -1))).toBe('right');
    expect(kickFoot(p, vec2(0.5, 0), vec2(1, 1))).toBe('left');
  });

  it('đá gần thẳng hướng bóng thì dùng chân thuận', () => {
    expect(kickFoot(player({ foot: 'left' }), vec2(0.5, 0), vec2(1, 0.05))).toBe('left');
    expect(kickFoot(player({ foot: 'both' }), vec2(0.5, 0), vec2(1, 0))).toBe('right');
    expect(kickFoot(player(), vec2(0.5, 0), vec2(0, 0))).toBe('right');
  });
});

describe('footErrorMult', () => {
  it('chân thuận và hai chân không phạt; chân nghịch phạt theo số sao', () => {
    expect(footErrorMult(player({ weakFoot: 2 }), 'right')).toBe(1);
    expect(footErrorMult(player({ foot: 'both', weakFoot: 5 }), 'left')).toBe(1);
    expect(footErrorMult(player({ weakFoot: 4 }), 'left')).toBe(1.1);
    expect(footErrorMult(player({ weakFoot: 3 }), 'left')).toBe(1.25);
    expect(footErrorMult(player({ weakFoot: 2 }), 'left')).toBe(1.5);
    expect(footErrorMult(player(), 'left')).toBe(1);
  });
});
