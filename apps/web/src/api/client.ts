/** Tiền tố chung của REST API (docs/ARCHITECTURE.md §4). */
export const API_BASE = '/api/v1';

export function apiUrl(path: `/${string}`): string {
  return `${API_BASE}${path}`;
}
