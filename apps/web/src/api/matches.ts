import { useMutation } from '@tanstack/react-query';
import { StartedMatch, type Difficulty } from '@pitch/shared';
import { apiFetch } from './client';

/**
 * Bắt đầu trận vs máy (POST /matches): server dựng đội nhà từ đội hình đã lưu, sinh đội máy + seed
 * + match token. Token giữ lại để nộp kết quả (task 7.2).
 */
export function useStartMatch() {
  return useMutation({
    mutationFn: (difficulty: Difficulty) =>
      apiFetch('/matches', StartedMatch, { method: 'POST', body: { difficulty } }),
  });
}
