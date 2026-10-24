import { useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  OpenPackResult,
  PackBox,
  PackInfo,
  type Me,
  type PackPayment,
  type PacksResponse,
} from '@pitch/shared';
import { z } from 'zod';
import { meKey } from './auth';
import { apiFetch, ApiClientError } from './client';

export const packsKey = ['packs'] as const;
export const playerCardsKey = ['player-cards'] as const;

const PacksData = z.object({ packs: z.array(PackInfo), box: PackBox });
type PacksData = PacksResponse['data'];

export function usePacks() {
  return useQuery({ queryKey: packsKey, queryFn: () => apiFetch('/packs', PacksData) });
}

/** Lỗi tạm thời (mạng, 5xx): gửi lại **cùng** Idempotency-Key thì server không mở gói hai lần. */
export function isTransient(err: unknown): boolean {
  return err instanceof ApiClientError && (err.code === 'network_error' || err.status >= 500);
}

export interface OpenAttempt {
  code: string;
  payment: PackPayment;
  key: string;
}

/**
 * Key cho lần bấm mua: lần trước cùng gói + cách trả mà lỗi tạm thời (chưa biết server đã mở hay
 * chưa) → dùng lại key cũ; còn lại sinh key mới.
 */
export function attemptFor(
  prev: OpenAttempt | null,
  code: string,
  payment: PackPayment,
  newKey: () => string = () => crypto.randomUUID(),
): OpenAttempt {
  if (prev && prev.code === code && prev.payment === payment) return prev;
  return { code, payment, key: newKey() };
}

/**
 * Mở gói (POST /packs/:code/open). Server quyết định kết quả; client chỉ cập nhật cache:
 * xu, lượt miễn phí, hộp phiếu ngay từ response, rồi invalidate `me`, `packs`, `player-cards`.
 */
export function useOpenPack() {
  const qc = useQueryClient();
  const pending = useRef<OpenAttempt | null>(null);
  const inFlight = useRef(false);
  const mutation = useMutation({
    mutationFn: ({ code, payment, key }: OpenAttempt) =>
      apiFetch(`/packs/${code}/open`, OpenPackResult, {
        method: 'POST',
        body: { payment },
        headers: { 'idempotency-key': key },
      }),
    // Thử lại tự động dùng đúng biến cũ → cùng key.
    retry: (count, err) => count < 2 && isTransient(err),
    onSuccess: (res) => {
      qc.setQueryData<Me | null>(meKey, (me) =>
        me ? { ...me, coins: res.balance, freePack5Credits: res.freePack5Credits } : me,
      );
      qc.setQueryData<PacksData>(packsKey, (old) => (old ? { ...old, box: res.box } : old));
      void qc.invalidateQueries({ queryKey: meKey });
      void qc.invalidateQueries({ queryKey: packsKey });
      void qc.invalidateQueries({ queryKey: playerCardsKey });
    },
  });

  /** `null` nếu đang có request mở gói (chặn double-click trước khi nút kịp khoá). */
  async function open(code: string, payment: PackPayment): Promise<OpenPackResult | null> {
    if (inFlight.current) return null;
    inFlight.current = true;
    const attempt = attemptFor(pending.current, code, payment);
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

  return { open, isPending: mutation.isPending, error: mutation.error, reset: mutation.reset };
}
