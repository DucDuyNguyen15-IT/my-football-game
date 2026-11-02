import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  MatchResult,
  StartedMatch,
  type Difficulty,
  type Me,
  type SubmitMatchResultRequest,
} from '@pitch/shared';
import { meKey } from './auth';
import { apiFetch, ApiClientError } from './client';

/**
 * Bắt đầu trận vs máy (POST /matches): server dựng đội nhà từ đội hình đã lưu, sinh đội máy + seed
 * + match token. Token giữ lại để nộp kết quả.
 */
export function useStartMatch() {
  return useMutation({
    mutationFn: (difficulty: Difficulty) =>
      apiFetch('/matches', StartedMatch, { method: 'POST', body: { difficulty } }),
  });
}

/** Lỗi đáng thử lại: mạng hoặc 5xx. Lỗi nghiệp vụ 4xx (token sai, quá sớm…) gửi lại cũng vậy. */
export function isTransientError(err: unknown): boolean {
  return !(err instanceof ApiClientError && err.status >= 400 && err.status < 500);
}

export interface SubmitResultVars {
  matchId: string;
  body: SubmitMatchResultRequest;
}

/**
 * Nộp kết quả cuối trận (POST /matches/:id/result). Thử lại tự động khi lỗi mạng/5xx với **cùng
 * token** — server trả lại kết quả cũ nếu lần trước đã ghi nhận, xu không bị cộng hai lần.
 */
export function useSubmitMatchResult() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ matchId, body }: SubmitResultVars) =>
      apiFetch(`/matches/${matchId}/result`, MatchResult, { method: 'POST', body }),
    retry: (count, err) => count < 3 && isTransientError(err),
    onSuccess: (result) => {
      qc.setQueryData<Me | null>(meKey, (me) => me && { ...me, coins: result.balance });
      void qc.invalidateQueries({ queryKey: meKey });
    },
  });
}
