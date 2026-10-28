import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Squad, type PutSquadRequest } from '@pitch/shared';
import { ApiClientError, apiFetch } from './client';
import { playerCardsKey } from './packs';

export const squadKey = ['squad'] as const;

/** Đội hình đã lưu ở server (GET /squad). */
export function useSquad() {
  return useQuery({ queryKey: squadKey, queryFn: () => apiFetch('/squad', Squad) });
}

/** Lưu đội hình (PUT /squad); xong thì cờ `inSquad` trong kho đổi → làm mới kho. */
export function useSaveSquad() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: PutSquadRequest) => apiFetch('/squad', Squad, { method: 'PUT', body }),
    onSuccess: (squad) => {
      qc.setQueryData(squadKey, squad);
      void qc.invalidateQueries({ queryKey: playerCardsKey });
    },
    onError: (err) => {
      // Thẻ đã bị bán ở tab khác → tải lại kho để bỏ thẻ không còn.
      if (err instanceof ApiClientError && err.code === 'not_found') {
        void qc.invalidateQueries({ queryKey: playerCardsKey });
      }
    },
  });
}
