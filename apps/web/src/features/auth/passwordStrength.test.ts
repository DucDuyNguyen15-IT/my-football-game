import { describe, expect, it } from 'vitest';
import {
  COMMON_PASSWORDS,
  evaluatePasswordStrength,
  isPasswordAcceptable,
} from './passwordStrength';

describe('evaluatePasswordStrength', () => {
  it('mật khẩu rỗng → level 0, hint empty, chưa đạt', () => {
    const res = evaluatePasswordStrength('');
    expect(res.level).toBe(0);
    expect(res.tier).toBe('bronze');
    expect(res.hint).toBe('empty');
    expect(isPasswordAcceptable(res)).toBe(false);
  });

  it('ngắn hơn 8 ký tự → bậc Đồng (khoá đăng ký)', () => {
    const res = evaluatePasswordStrength('Ab1!xyz');
    expect(res.tier).toBe('bronze');
    expect(res.level).toBe(1);
    expect(res.hint).toBe('tooShort');
    expect(isPasswordAcceptable(res)).toBe(false);
  });

  it('danh sách mật khẩu phổ biến có ít nhất 50 mục và bị hạ xuống Đồng', () => {
    expect(COMMON_PASSWORDS.size).toBeGreaterThanOrEqual(50);
    for (const pw of ['12345678', 'Password123', 'QWERTYUIOP', 'bongda123', 'matkhau123']) {
      const res = evaluatePasswordStrength(pw);
      expect(res.tier, pw).toBe('bronze');
      expect(res.hint, pw).toBe('common');
      expect(isPasswordAcceptable(res), pw).toBe(false);
    }
  });

  it('trùng hoặc chứa tên đăng nhập → bậc Đồng', () => {
    const same = evaluatePasswordStrength('minh_nguyen99', 'minh_nguyen');
    expect(same.tier).toBe('bronze');
    expect(same.hint).toBe('matchesUsername');
    expect(isPasswordAcceptable(same)).toBe(false);

    const exact = evaluatePasswordStrength('MinhTran1!', 'minhtran');
    expect(exact.tier).toBe('bronze');
    expect(exact.hint).toBe('matchesUsername');
  });

  it('chuỗi lặp hoặc tuần tự đơn giản → bậc Đồng', () => {
    for (const pw of ['aaaaaaaa', 'abababab', 'abcd9999', '12349999', 'qwer5678']) {
      const res = evaluatePasswordStrength(pw);
      expect(res.tier, pw).toBe('bronze');
      expect(res.hint, pw).toBe('repeatOrSeq');
      expect(isPasswordAcceptable(res), pw).toBe(false);
    }
  });

  it('chỉ 1 loại ký tự và < 12 ký tự → bậc Đồng, gợi ý thêm loại ký tự', () => {
    const res = evaluatePasswordStrength('mknmknqazx');
    expect(res.tier).toBe('bronze');
    expect(res.hint).toBe('addVariety');
    expect(isPasswordAcceptable(res)).toBe(false);
  });

  it('đủ 8 ký tự và 2 loại ký tự không lặp → Bạc (cho đăng ký)', () => {
    const res = evaluatePasswordStrength('saigon99', 'thanh');
    expect(res.tier).toBe('silver');
    expect(res.level).toBe(2);
    expect(isPasswordAcceptable(res)).toBe(true);
  });

  it('mật khẩu 3 loại ký tự hoặc dài vừa → Vàng', () => {
    const res = evaluatePasswordStrength('Saigon99', 'thanh');
    expect(res.tier).toBe('gold');
    expect(res.level).toBe(3);
    expect(isPasswordAcceptable(res)).toBe(true);
  });

  it('mật khẩu dài + đa dạng ký tự → Huyền thoại', () => {
    for (const pw of ['Saigon@2026!', 'e2e-mat-khau-123']) {
      const res = evaluatePasswordStrength(pw, 'thanh');
      expect(res.tier, pw).toBe('legend');
      expect(res.level, pw).toBe(4);
      expect(res.hint, pw).toBe('strong');
      expect(isPasswordAcceptable(res), pw).toBe(true);
    }
  });

  it('mật khẩu mạnh nhưng còn đoạn tuần tự → bị hạ trần về Vàng kèm gợi ý', () => {
    const res = evaluatePasswordStrength('Saigon@1234!', 'thanh');
    expect(res.tier).toBe('gold');
    expect(res.hint).toBe('repeatOrSeq');
  });
});
