import { useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  EconomyConfig,
  PlayerCard,
  SellCardsResult,
  UpgradeCardResult,
  type Me,
  type PlayerCardSort,
  type Position,
  type Rarity,
} from '@pitch/shared';
import { z } from 'zod';
import { meKey } from './auth';
import { apiFetch } from './client';
import { isTransient, playerCardsKey } from './packs';

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

export interface UpgradeAttempt {
  playerCardId: string;
  materialId: string;
  key: string;
}

/**
 * Key cho lần bấm ép: lần trước cùng thẻ + cùng nguyên liệu mà lỗi tạm thời (chưa biết server đã ép
 * hay chưa) → dùng lại key cũ để server không ép/trừ phí hai lần; còn lại sinh key mới.
 */
export function upgradeAttemptFor(
  prev: UpgradeAttempt | null,
  playerCardId: string,
  materialId: string,
  newKey: () => string = () => crypto.randomUUID(),
): UpgradeAttempt {
  if (prev && prev.playerCardId === playerCardId && prev.materialId === materialId) return prev;
  return { playerCardId, materialId, key: newKey() };
}

/**
 * Ép thẻ (POST /player-cards/:id/upgrade, Idempotency-Key như mở gói 6.7). Server quay tỉ lệ; client
 * chỉ cập nhật xu từ response rồi làm mới kho (nguyên liệu mất, cấp/may mắn thẻ đổi).
 */
export function useUpgradeCard() {
  const qc = useQueryClient();
  const pending = useRef<UpgradeAttempt | null>(null);
  const inFlight = useRef(false);
  const mutation = useMutation({
    mutationFn: ({ playerCardId, materialId, key }: UpgradeAttempt) =>
      apiFetch(`/player-cards/${playerCardId}/upgrade`, UpgradeCardResult, {
        method: 'POST',
        body: { materialId },
        headers: { 'idempotency-key': key },
      }),
    // Thử lại tự động dùng đúng biến cũ → cùng key.
    retry: (count, err) => count < 2 && isTransient(err),
    onSuccess: (res) => {
      qc.setQueryData<Me | null>(meKey, (me) => (me ? { ...me, coins: res.balance } : me));
      void qc.invalidateQueries({ queryKey: meKey });
    },
    // Thành công hay lỗi (VD nguyên liệu đã bán ở tab khác) đều làm mới kho.
    onSettled: () => qc.invalidateQueries({ queryKey: playerCardsKey }),
  });

  /** `null` nếu đang có request ép (chặn double-click trước khi nút kịp khoá). */
  async function upgrade(
    playerCardId: string,
    materialId: string,
  ): Promise<UpgradeCardResult | null> {
    if (inFlight.current) return null;
    inFlight.current = true;
    const attempt = upgradeAttemptFor(pending.current, playerCardId, materialId);
    pending.current = attempt;
    try {
      const res = await mutation.mutateAsync(attempt);
      pending.current = null;
      return res;
    } catch (err) {
      if (!isTransient(err)) pending.current = null;
      throw err;
    } finally {
      inFlight.current = false;
    }
  }

  return { upgrade, isPending: mutation.isPending, error: mutation.error, reset: mutation.reset };
}
