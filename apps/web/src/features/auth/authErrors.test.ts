import { describe, expect, it } from 'vitest';
import { ApiClientError } from '../../api/client';
import { describeAuthError, fieldErrorOf, parseAuthForm, parseGoogleUsername } from './authErrors';

describe('describeAuthError', () => {
  it('login_locked và rate_limited là cảnh báo riêng, có tiêu đề', () => {
    const locked = describeAuthError(new ApiClientError('login_locked', 429, 'x'));
    expect(locked).toMatchObject({ tone: 'warning', title: 'Tạm khoá đăng nhập' });
    expect(locked.text).toMatch(/15 phút/);
    const limited = describeAuthError(new ApiClientError('rate_limited', 429, 'x'));
    expect(limited).toMatchObject({ tone: 'warning', title: 'Thao tác quá nhanh' });
  });

  it('reauth_required (xoá tài khoản chỉ Google, phiên cũ) → cảnh báo hướng dẫn đăng nhập lại', () => {
    const notice = describeAuthError(new ApiClientError('reauth_required', 403, 'x'));
    expect(notice).toMatchObject({ tone: 'warning', title: 'Cần đăng nhập lại' });
    expect(notice.text).toMatch(/đăng nhập lại bằng Google/);
  });

  it('map mã lỗi server sang từ điển theo error.code (vi & en); validation lấy chi tiết đầu tiên', () => {
    expect(describeAuthError(new ApiClientError('invalid_credentials', 401, 'raw-msg'))).toEqual({
      tone: 'danger',
      text: 'Sai tên đăng nhập hoặc mật khẩu.',
    });
    expect(
      describeAuthError(new ApiClientError('invalid_credentials', 401, 'raw-msg'), 'en'),
    ).toEqual({
      tone: 'danger',
      text: 'Incorrect username or password.',
    });
    const v = new ApiClientError('validation_error', 400, 'Dữ liệu không hợp lệ', [
      { field: 'username', message: 'Tên ngắn' },
    ]);
    expect(describeAuthError(v).text).toMatch(/3–20 ký tự/);
    expect(describeAuthError(v, 'en').text).toMatch(/3–20 characters/);
    expect(describeAuthError(new ApiClientError('network_error', 0, 'x')).text).toMatch(/máy chủ/);
    expect(describeAuthError(new Error('boom')).tone).toBe('danger');
  });
});

describe('fieldErrorOf', () => {
  it('gắn lỗi trùng tên / validation vào đúng ô theo error.code', () => {
    expect(fieldErrorOf(new ApiClientError('username_taken', 409, 'raw'))).toEqual({
      field: 'username',
      text: 'Tên đăng nhập này đã có người dùng.',
    });
    expect(fieldErrorOf(new ApiClientError('username_taken', 409, 'raw'), 'en')).toEqual({
      field: 'username',
      text: 'That username is already taken.',
    });
    const v = new ApiClientError('validation_error', 400, 'x', [
      { field: 'password', message: 'Ngắn' },
    ]);
    expect(fieldErrorOf(v)).toEqual({ field: 'password', text: 'Mật khẩu ít nhất 8 ký tự.' });
    expect(fieldErrorOf(new ApiClientError('login_locked', 429, 'x'))).toBeNull();
  });
});

describe('parseAuthForm & parseGoogleUsername (nguyên tắc 18: Postel)', () => {
  it('tự trim khoảng trắng thừa ở tên đăng nhập và email trước khi kiểm tra', () => {
    const login = parseAuthForm({
      mode: 'login',
      username: '  alice_01  ',
      password: 'secret',
      email: '',
      agreed: false,
    });
    expect(login).toMatchObject({ ok: true, data: { username: 'alice_01', password: 'secret' } });

    const reg = parseAuthForm({
      mode: 'register',
      username: '  bob_99  ',
      password: 'password123',
      email: '  bob@vidu.vn  ',
      agreed: true,
    });
    expect(reg).toMatchObject({
      ok: true,
      data: { username: 'bob_99', email: 'bob@vidu.vn', acceptTerms: true },
    });

    expect(parseGoogleUsername('  g_user  ')).toEqual({ ok: true, value: 'g_user' });
  });

  it('thông báo lỗi rõ cách sửa theo ngôn ngữ đang chọn', () => {
    const emptyPw = parseAuthForm({
      mode: 'login',
      username: 'alice',
      password: '',
      email: '',
      agreed: false,
    });
    expect(emptyPw.ok).toBe(false);
    if (!emptyPw.ok) expect(emptyPw.errors.password).toMatch(/Nhập mật khẩu/);

    const badEmail = parseAuthForm({
      mode: 'register',
      username: 'alice',
      password: 'password123',
      confirmPassword: 'password123',
      email: 'sai-email',
      agreed: true,
    });
    expect(badEmail.ok).toBe(false);
    if (!badEmail.ok) expect(badEmail.errors.email).toMatch(/ví dụ:/);

    const mismatch = parseAuthForm({
      mode: 'register',
      username: 'alice',
      password: 'password123',
      confirmPassword: 'password999',
      email: '',
      agreed: true,
      locale: 'en',
    });
    expect(mismatch.ok).toBe(false);
    if (!mismatch.ok) expect(mismatch.errors.confirmPassword).toBe('Passwords do not match.');
  });
});
