import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  EconomyConfig,
  PlayerCard,
  SellCardsResult,
  type Me,
  type PlayerCardSort,
  type Position,
  type Rarity,
} from '@pitch/shared';
import { z } from 'zod';
import { meKey } from './auth';
import { apiFetch } from './client';
import { playerCardsKey } from './packs';

export interface PlayerCardsFilter {
  position?: Position;
  rarity?: Rarity;
  sort?: PlayerCardSort;
}

/** Kho thẻ (GET /player-cards). Key con của `['player-cards']` nên mở gói/bán thẻ làm mới mọi bộ lọc. */
export function usePlayerCards(filter: PlayerCardsFilter = {}) {
  const params = new URLSearchParams();
  if (filter.position) params.set('position', filter.position);
  if (filter.rarity) params.set('rarity', filter.rarity);
  if (filter.sort) params.set('sort', filter.sort);
  const qs = params.toString();
  return useQuery({
    queryKey: [...playerCardsKey, qs],
    queryFn: () => apiFetch(`/player-cards${qs ? `?${qs}` : ''}`, z.array(PlayerCard)),
  });
}

export const economyKey = ['config', 'economy'] as const;

/** Số liệu kinh tế (giá bán thẻ…) đọc từ server — client không giữ con số nào. */
export function useEconomy() {
  return useQuery({
    queryKey: economyKey,
    queryFn: () => apiFetch('/config/economy', EconomyConfig),
    staleTime: 5 * 60_000,
  });
}

/** Bán thẻ (POST /player-cards/sell) — tất cả hoặc không; xong cập nhật xu và làm mới kho. */
export function useSellCards() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (playerCardIds: string[]) =>
      apiFetch('/player-cards/sell', SellCardsResult, {
        method: 'POST',
        body: { playerCardIds },
      }),
    onSuccess: (res) => {
      qc.setQueryData<Me | null>(meKey, (me) => (me ? { ...me, coins: res.balance } : me));
      void qc.invalidateQueries({ queryKey: meKey });
      void qc.invalidateQueries({ queryKey: playerCardsKey });
    },
    // Lỗi (VD thẻ đã bán ở tab khác) → kho trên màn có thể đã cũ.
    onError: () => void qc.invalidateQueries({ queryKey: playerCardsKey }),
  });
}
