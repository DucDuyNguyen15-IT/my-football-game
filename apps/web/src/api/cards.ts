import { useQuery } from '@tanstack/react-query';
import { Card, type Card as CardT } from '@pitch/shared';
import { z } from 'zod';
import { apiFetch } from './client';

export const cardsKey = ['cards'] as const;

/** Danh mục thẻ (GET /cards) — dữ liệu tĩnh trong một phiên, tra theo `cardId`. */
export function useCardCatalog() {
  return useQuery({
    queryKey: cardsKey,
    queryFn: async () => {
      const cards = await apiFetch('/cards', z.array(Card));
      return new Map<string, CardT>(cards.map((c) => [c.id, c]));
    },
    staleTime: Infinity,
  });
}
