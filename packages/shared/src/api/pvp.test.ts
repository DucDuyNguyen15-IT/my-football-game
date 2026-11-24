import { describe, expect, it } from 'vitest';
import { PVP_INPUT_CODE_MAX, PvpClientMessage as C, PvpServerMessage as S } from './pvp';

const ok = (s: typeof C | typeof S, v: unknown) => expect(s.safeParse(v).success).toBe(true);
const bad = (s: typeof C | typeof S, v: unknown) => expect(s.safeParse(v).success).toBe(false);

describe('PvP client -> server', () => {
  it('tin không trường', () => {
    for (const t of [
      'queue_join',
      'queue_leave',
      'room_create',
      'room_leave',
      'ready',
      'catchup_done',
      'leave',
    ])
      ok(C, { t });
    bad(C, { t: 'ready', x: 1 });
    bad(C, { t: 'nope' });
    bad(C, {});
  });
  it('room_join: 6 ký tự đúng bảng chữ', () => {
    ok(C, { t: 'room_join', code: 'ABCDEF' });
    ok(C, { t: 'room_join', code: 'H2K9ZZ' });
    for (const code of [
      'ABCDE',
      'ABCDEFG',
      'abcdef',
      'ABCDE0',
      'ABCDEI',
      'ABCDE1',
      'ABCDEO',
      123456,
    ])
      bad(C, { t: 'room_join', code });
  });
  it('input: 0..4607', () => {
    ok(C, { t: 'input', c: 0 });
    ok(C, { t: 'input', c: PVP_INPUT_CODE_MAX });
    expect(PVP_INPUT_CODE_MAX).toBe(4607);
    for (const c of [-1, 4608, 1.5, '3']) bad(C, { t: 'input', c });
  });
  it('hash: tick bội số 60, h uint32', () => {
    ok(C, { t: 'hash', tick: 60, h: 0 });
    ok(C, { t: 'hash', tick: 0, h: 0xffffffff });
    bad(C, { t: 'hash', tick: 61, h: 1 });
    bad(C, { t: 'hash', tick: -60, h: 1 });
    bad(C, { t: 'hash', tick: 60, h: 2 ** 32 });
    bad(C, { t: 'hash', tick: 60, h: -1 });
  });
  it('sub, rejoin', () => {
    ok(C, { t: 'sub', out: 'home-ST', bench: 'B1' });
    bad(C, { t: 'sub', out: 'home-ST', bench: 'X' });
    bad(C, { t: 'sub', bench: 'B1' });
    ok(C, { t: 'rejoin', pvpId: 7 });
    bad(C, { t: 'rejoin', pvpId: 0 });
    bad(C, { t: 'rejoin', pvpId: '7' });
  });
});

describe('PvP server -> client', () => {
  it('tin đơn giản', () => {
    ok(S, { t: 'queue_status', waitedSec: 3, offerCpu: false });
    ok(S, { t: 'queue_timeout' });
    ok(S, { t: 'room_created', code: 'ABCDEF', expiresAt: '2026-01-01T00:00:00Z' });
    ok(S, { t: 'opp_disconnected', remainingMs: 12000 });
    ok(S, { t: 'opp_reconnected' });
    bad(S, { t: 'queue_status', waitedSec: 3 });
  });
  it('start: countdownMs, không startAt', () => {
    ok(S, { t: 'start', countdownMs: 3000 });
    bad(S, { t: 'start', startAt: 123 });
    bad(S, { t: 'start', countdownMs: 0 });
  });
  it('f: có/không subs', () => {
    ok(S, { t: 'f', f: [1, 0, 4607] });
    ok(S, { t: 'f', f: [2, 0, 0, [{ team: 'home', out: 'home-ST', bench: 'B1' }]] });
    bad(S, { t: 'f', f: [1, 0] });
    bad(S, { t: 'f', f: [1, 0, 4608] });
    bad(S, { t: 'f', f: [1, 0, 0, [{ team: 'x', out: 'a', bench: 'B1' }]] });
  });
  it('end', () => {
    const base = { t: 'end', reason: 'full_time', home: 2, away: 1 };
    ok(S, { ...base, you: { outcome: 'win', reward: 50 } });
    ok(S, { ...base, you: { outcome: 'loss', reward: 0, rewardReason: 'daily_cap' } });
    bad(S, { ...base, you: { outcome: 'loss', reward: 0, rewardReason: 'other' } });
    bad(S, { ...base, reason: 'nope', you: { outcome: 'win', reward: 1 } });
    for (const reason of ['forfeit_desync', 'void_both_left', 'void_not_ready', 'server_restart'])
      ok(S, { ...base, reason, you: { outcome: 'draw', reward: 0, rewardReason: 'void' } });
  });
  it('error: mã lỗi', () => {
    for (const code of [
      'busy',
      'not_in_match',
      'sub_rejected',
      'room_full',
      'server_busy',
      'bad_message',
    ])
      ok(S, { t: 'error', code });
    bad(S, { t: 'error', code: 'whatever' });
  });
  it('catchup', () => {
    bad(S, { t: 'catchup', log: 'abc', tick: 5 });
    bad(S, { t: 'catchup', setup: {}, log: 'a b', tick: 5 });
  });
});
