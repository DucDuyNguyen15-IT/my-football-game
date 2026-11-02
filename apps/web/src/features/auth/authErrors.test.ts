import { describe, expect, it } from 'vitest';
import { ApiClientError } from '../../api/client';
import { describeAuthError, fieldErrorOf } from './authErrors';

describe('describeAuthError', () => {
  it('login_locked và rate_limited là cảnh báo riêng, có tiêu đề', () => {
    const locked = describeAuthError(new ApiClientError('login_locked', 429, 'x'));
    expect(locked).toMatchObject({ tone: 'warning', title: 'Tạm khoá đăng nhập' });
    expect(locked.text).toMatch(/15 phút/);
    const limited = describeAuthError(new ApiClientError('rate_limited', 429, 'x'));
    expect(limited).toMatchObject({ tone: 'warning', title: 'Thao tác quá nhanh' });
  });

  it('lỗi thường dùng message của server; validation lấy chi tiết đầu tiên', () => {
    expect(describeAuthError(new ApiClientError('invalid_credentials', 401, 'Sai'))).toEqual({
      tone: 'danger',
      text: 'Sai',
    });
    const v = new ApiClientError('validation_error', 400, 'Dữ liệu không hợp lệ', [
      { field: 'username', message: 'Tên ngắn' },
    ]);
    expect(describeAuthError(v).text).toBe('Tên ngắn');
    expect(describeAuthError(new ApiClientError('network_error', 0, 'x')).text).toMatch(/máy chủ/);
    expect(describeAuthError(new Error('boom')).tone).toBe('danger');
  });
});

describe('fieldErrorOf', () => {
  it('gắn lỗi trùng tên / validation vào đúng ô', () => {
    expect(fieldErrorOf(new ApiClientError('username_taken', 409, 'Trùng'))).toEqual({
      field: 'username',
      text: 'Trùng',
    });
    const v = new ApiClientError('validation_error', 400, 'x', [
      { field: 'password', message: 'Ngắn' },
    ]);
    expect(fieldErrorOf(v)).toEqual({ field: 'password', text: 'Ngắn' });
    expect(fieldErrorOf(new ApiClientError('login_locked', 429, 'x'))).toBeNull();
  });
});
