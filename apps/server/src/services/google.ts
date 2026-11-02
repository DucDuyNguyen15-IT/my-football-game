import { createRemoteJWKSet, errors, jwtVerify, type JWTVerifyGetKey } from 'jose';
import { AppError } from '../plugins/errors';

/** Danh tính lấy từ ID token Google đã kiểm. `email` chỉ có khi Google báo đã xác minh. */
export interface GoogleIdentity {
  sub: string;
  email: string | null;
}

/** Kiểm ID token theo đồng hồ `now`; token không hợp lệ → `AppError` 401. */
export type GoogleVerifier = (idToken: string, now: Date) => Promise<GoogleIdentity>;

export const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];
export const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
/** Lệch giờ chấp nhận giữa server và Google. */
const CLOCK_TOLERANCE_SEC = 30;

/**
 * Bộ kiểm ID token Google (ADR-0010): chữ ký RS256 theo JWKS của Google, `aud` = `clientId`,
 * `iss` của Google, `exp`/`iat` theo đồng hồ nghiệp vụ. `keys` tiêm được để test không cần mạng
 * (mặc định JWKS từ xa, `jose` tự cache và làm mới khi Google xoay khoá).
 */
export function createGoogleVerifier(
  clientId: string,
  keys: JWTVerifyGetKey = createRemoteJWKSet(new URL(GOOGLE_JWKS_URL)),
): GoogleVerifier {
  return async (idToken, now) => {
    let payload;
    try {
      ({ payload } = await jwtVerify(idToken, keys, {
        audience: clientId,
        issuer: GOOGLE_ISSUERS,
        algorithms: ['RS256'],
        currentDate: now,
        clockTolerance: CLOCK_TOLERANCE_SEC,
        requiredClaims: ['sub', 'exp', 'iat'],
      }));
    } catch (err) {
      // Không tải được JWKS (mạng/Google lỗi) không phải lỗi của người dùng → để thành 500.
      if (err instanceof errors.JOSEError && !(err instanceof errors.JWKSTimeout)) {
        throw new AppError(
          'invalid_credentials',
          401,
          'Đăng nhập Google không hợp lệ hoặc đã hết hạn',
        );
      }
      throw err;
    }
    const sub = payload.sub;
    if (typeof sub !== 'string' || sub.length === 0 || sub.length > 255) {
      throw new AppError('invalid_credentials', 401, 'Đăng nhập Google không hợp lệ');
    }
    const email =
      payload['email_verified'] === true && typeof payload['email'] === 'string'
        ? payload['email'].slice(0, 254)
        : null;
    return { sub, email };
  };
}

/** Gợi ý tên đăng nhập từ email (phần trước @, ký tự lạ → `_`, tối đa 20); quá ngắn → `null`. */
export function suggestUsername(email: string | null): string | null {
  if (!email) return null;
  const local = email.split('@')[0] ?? '';
  const name = local.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 20);
  return name.length >= 3 ? name : null;
}
