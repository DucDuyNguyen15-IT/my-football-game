import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClaimMissionResult, MissionProgress, type Me } from '@pitch/shared';
import { z } from 'zod';
import { meKey } from './auth';
import { apiFetch } from './client';

export const missionsKey = ['missions', 'today'] as const;

const MissionList = z.array(MissionProgress);

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
