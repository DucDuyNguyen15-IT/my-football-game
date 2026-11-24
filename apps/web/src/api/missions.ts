import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClaimMissionResult, ExpiredClaimResult, MissionProgress, type Me } from '@pitch/shared';
import { z } from 'zod';
import { meKey } from './auth';
import { apiFetch } from './client';

export const missionsKey = ['missions', 'today'] as const;

const MissionList = z.array(MissionProgress);

const DAY_MS = 86_400_000;
const GMT7_MS = 7 * 3_600_000;

/** Số ms từ thời điểm `since` tới 00:00 GMT+7 kế tiếp. */
export function msUntilNextGmt7Midnight(since: number): number {
  return DAY_MS - ((since + GMT7_MS) % DAY_MS);
}

/** Lấy 3 nhiệm vụ ngày GMT+7 của người chơi (GET /missions/today). */
export function useTodayMissions(enabled = true) {
  return useQuery({
    queryKey: missionsKey,
    queryFn: () => apiFetch('/missions/today', MissionList),
    enabled,
  });
}

/** Nhận thưởng một nhiệm vụ đã hoàn thành (POST /missions/:code/claim). */
export function useClaimMission() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (code: string) =>
      apiFetch(`/missions/${encodeURIComponent(code)}/claim`, ClaimMissionResult, {
        method: 'POST',
      }),
    onSuccess: (result, code) => {
      qc.setQueryData<Me | null>(meKey, (me) => (me ? { ...me, coins: result.balance } : me));
      qc.setQueryData<MissionProgress[]>(missionsKey, (list) =>
        list?.map((m) => (m.code === code ? { ...m, claimed: true } : m)),
      );
      void qc.invalidateQueries({ queryKey: meKey });
      void qc.invalidateQueries({ queryKey: missionsKey });
    },
  });
}

/**
 * Lần gọi lại (qua nửa đêm, quay lại tab) trả rỗng thì giữ danh sách cũ: bảng thông báo đang mở
 * không tự biến mất khi chưa đọc. Đóng bảng thì `dismissExpiredClaims` đặt items rỗng trong cache, nên
 * quay lại từ /play, /pvp (AppLayout gắn lại) không hiện lại.
 */
export function keepUnreadClaims(
  prev: ExpiredClaimResult | undefined,
  next: ExpiredClaimResult,
): ExpiredClaimResult {
  return next.items.length === 0 && prev ? prev : next;
}

// Khoá theo người chơi: đổi tài khoản trong cùng tab không thấy thông báo của người trước.
const expiredClaimKey = (userId: string | undefined) => ['missions', 'expired-claim', userId];

export function useDismissExpiredClaims(userId: string | undefined) {
  const qc = useQueryClient();
  return () =>
    qc.setQueryData<ExpiredClaimResult>(expiredClaimKey(userId), (d) => d && { ...d, items: [] });
}

/**
 * Mỗi lần mở app (đã đăng nhập): server tự nhận nhiệm vụ ngày cũ đã xong mà quên nhận
 * (POST /missions/expired/claim) và trả đúng một lần danh sách để hiện bảng thông báo. Dùng query
 * `staleTime: Infinity` thay vì mutation trong effect để không gọi trùng (StrictMode, remount).
 */
export function useExpiredMissionClaims(userId: string | undefined) {
  const qc = useQueryClient();
  const queryKey = expiredClaimKey(userId);
  return useQuery({
    queryKey,
    queryFn: async () => {
      const r = await apiFetch('/missions/expired/claim', ExpiredClaimResult, { method: 'POST' });
      if (r.items.length > 0) {
        qc.setQueryData<Me | null>(meKey, (me) => (me ? { ...me, coins: r.balance } : me));
        void qc.invalidateQueries({ queryKey: missionsKey });
      }
      return keepUnreadClaims(qc.getQueryData<ExpiredClaimResult>(queryKey), r);
    },
    enabled: Boolean(userId),
    // Cũ khi qua 00:00 GMT+7 → tab mở qua đêm gọi lại khi người chơi quay lại tab (server idempotent).
    staleTime: (q) => msUntilNextGmt7Midnight(q.state.dataUpdatedAt),
    gcTime: Infinity,
    retry: false,
    refetchOnWindowFocus: true,
  });
}
