import { formatNumber } from '../i18n/i18n';

/** Số theo ngôn ngữ đang chọn (`vi-VN`: 12.500, `en-US`: 12,500). */
export const fmt = (n: number): string => formatNumber(n);
