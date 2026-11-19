import type { Rarity } from '@pitch/shared';

export type PasswordHintKey =
  | 'empty'
  | 'tooShort'
  | 'common'
  | 'matchesUsername'
  | 'repeatOrSeq'
  | 'addVariety'
  | 'makeLonger'
  | 'strong';

export interface PasswordChecks {
  minLength: boolean;
  hasLower: boolean;
  hasUpper: boolean;
  hasDigit: boolean;
  hasSymbol: boolean;
  noRepeatOrSeq: boolean;
  notCommon: boolean;
  notUsername: boolean;
}

export interface PasswordStrength {
  /** Bậc độ hiếm tương ứng 4 màu thẻ: Đồng / Bạc / Vàng / Huyền thoại. */
  tier: Rarity;
  /** 0 khi rỗng, 1..4 ứng với Đồng..Huyền thoại. */
  level: 0 | 1 | 2 | 3 | 4;
  /** Mã gợi ý ngắn ưu tiên cao nhất để tăng sức mạnh mật khẩu. */
  hint: PasswordHintKey;
  checks: PasswordChecks;
}

/** Danh sách 56 mật khẩu phổ biến (gồm cả từ khoá bóng đá / tiếng Việt hay gặp). */
export const COMMON_PASSWORDS: ReadonlySet<string> = new Set([
  '123456',
  '1234567',
  '12345678',
  '123456789',
  '1234567890',
  '123123',
  '111111',
  '11111111',
  '000000',
  '00000000',
  '654321',
  '987654321',
  '12341234',
  'password',
  'password1',
  'password123',
  'passw0rd',
  'p@ssw0rd',
  'qwerty',
  'qwerty123',
  'qwertyuiop',
  'abc123',
  'asdfgh',
  'asdfghjkl',
  'zxcvbn',
  'zxcvbnm',
  'zaq12wsx',
  'admin',
  'admin123',
  'letmein',
  'welcome',
  'monkey',
  'dragon',
  'baseball',
  'football',
  'iloveyou',
  'trustno1',
  'sunshine',
  'princess',
  'master',
  'hello123',
  'charlie',
  'aa123456',
  'donald',
  'superman',
  'batman',
  'liverpool',
  'arsenal',
  'chelsea',
  'barcelona',
  'realmadrid',
  'matkhau',
  'matkhau123',
  'vietnam',
  'vietnam123',
  'bongda123',
  'fconline',
]);

const KEYBOARD_ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm', '0123456789'] as const;

function hasSequentialChars(lower: string): boolean {
  if (lower.length < 4) return false;
  // Chuỗi 4+ ký tự tăng/giảm đều theo bảng mã ASCII (vd: abcd, 1234, 9876).
  let asc = 1;
  let desc = 1;
  for (let i = 1; i < lower.length; i++) {
    const prev = lower.charCodeAt(i - 1);
    const curr = lower.charCodeAt(i);
    const isAlnum =
      ((prev >= 48 && prev <= 57) || (prev >= 97 && prev <= 122)) &&
      ((curr >= 48 && curr <= 57) || (curr >= 97 && curr <= 122));
    if (isAlnum && curr - prev === 1) {
      asc += 1;
      desc = 1;
    } else if (isAlnum && prev - curr === 1) {
      desc += 1;
      asc = 1;
    } else {
      asc = 1;
      desc = 1;
    }
    if (asc >= 4 || desc >= 4) return true;
  }
  // Hàng phím QWERTY xuôi/ngược (4+ ký tự).
  for (const row of KEYBOARD_ROWS) {
    const rev = [...row].reverse().join('');
    for (let i = 0; i <= row.length - 4; i++) {
      const seg = row.slice(i, i + 4);
      const revSeg = rev.slice(i, i + 4);
      if (lower.includes(seg) || lower.includes(revSeg)) return true;
    }
  }
  return false;
}

function hasRepeatedPattern(lower: string): boolean {
  if (/(.)\1{3,}/.test(lower)) return true;
  // Lặp đoạn ngắn 2–3 ký tự chiếm trọn mật khẩu (vd: abababab, 123123123).
  for (const unitLen of [2, 3]) {
    if (lower.length >= unitLen * 3) {
      const unit = lower.slice(0, unitLen);
      const repeated = unit.repeat(Math.ceil(lower.length / unitLen)).slice(0, lower.length);
      if (repeated === lower) return true;
    }
  }
  return false;
}

function overlapsUsername(lowerPw: string, username?: string): boolean {
  const user = username?.trim().toLowerCase() ?? '';
  if (user.length < 3 || lowerPw.length === 0) return false;
  if (lowerPw === user || lowerPw.includes(user)) return true;
  if (lowerPw.length >= 4 && user.includes(lowerPw)) return true;
  const stripped = lowerPw.replace(/[^a-z0-9_]/g, '');
  if (stripped.length >= 3 && (stripped === user || stripped.includes(user))) return true;
  return false;
}

/**
 * Ước lượng độ mạnh mật khẩu thuần phía client, trả về 4 bậc theo độ hiếm thẻ:
 * Đồng (rất yếu, khoá đăng ký) → Bạc → Vàng → Huyền thoại.
 */
export function evaluatePasswordStrength(password: string, username?: string): PasswordStrength {
  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasDigit = /\d/.test(password);
  const hasSymbol = /[^a-zA-Z0-9]/.test(password);
  const minLength = password.length >= 8;
  const lower = password.toLowerCase();
  const notCommon = password.length === 0 || !COMMON_PASSWORDS.has(lower);
  const notUsername = !overlapsUsername(lower, username);
  const noRepeatOrSeq = !(hasRepeatedPattern(lower) || hasSequentialChars(lower));

  const checks: PasswordChecks = {
    minLength,
    hasLower,
    hasUpper,
    hasDigit,
    hasSymbol,
    noRepeatOrSeq,
    notCommon,
    notUsername,
  };

  if (password.length === 0) {
    return { tier: 'bronze', level: 0, hint: 'empty', checks };
  }

  const classes = [hasLower, hasUpper, hasDigit, hasSymbol].filter(Boolean).length;

  // Các lỗi cứng đẩy ngay về bậc Đồng (khoá nút Đăng ký).
  if (!minLength) {
    return { tier: 'bronze', level: 1, hint: 'tooShort', checks };
  }
  if (!notCommon) {
    return { tier: 'bronze', level: 1, hint: 'common', checks };
  }
  if (!notUsername) {
    return { tier: 'bronze', level: 1, hint: 'matchesUsername', checks };
  }
  if (!noRepeatOrSeq && classes <= 2 && password.length < 12) {
    return { tier: 'bronze', level: 1, hint: 'repeatOrSeq', checks };
  }
  if (classes === 1 && password.length < 12) {
    return {
      tier: 'bronze',
      level: 1,
      hint: noRepeatOrSeq ? 'addVariety' : 'repeatOrSeq',
      checks,
    };
  }

  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 10) score += 1;
  if (password.length >= 12) score += 1;
  if (password.length >= 16) score += 1;
  score += Math.max(0, classes - 1);
  if (!noRepeatOrSeq) score = Math.max(1, score - 1);

  let level: 1 | 2 | 3 | 4;
  if (score <= 1) level = 1;
  else if (score === 2) level = 2;
  else if (score <= 4) level = 3;
  else level = 4;

  // Có chuỗi lặp/tuần tự thì tối đa chỉ lên Vàng.
  if (!noRepeatOrSeq && level > 3) level = 3;

  const tierMap: Record<1 | 2 | 3 | 4, PasswordStrength['tier']> = {
    1: 'bronze',
    2: 'silver',
    3: 'gold',
    4: 'legend',
  };

  let hint: PasswordHintKey;
  if (!noRepeatOrSeq) hint = 'repeatOrSeq';
  else if (level === 4) hint = 'strong';
  else if (classes < 3) hint = 'addVariety';
  else if (password.length < 12) hint = 'makeLonger';
  else hint = 'addVariety';

  return { tier: tierMap[level], level, hint, checks };
}

/** Chỉ cho phép đăng ký từ bậc Bạc (level >= 2) trở lên. */
export const isPasswordAcceptable = (strength: PasswordStrength): boolean => strength.level >= 2;
