import type { FastifyError, FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import type { ApiError, ErrorCode } from '@pitch/shared';

/** Lỗi nghiệp vụ có mã trong `ErrorCode` (ARCHITECTURE §4.2); handler đổi thành envelope `ApiError`. */
export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly status: number,
    message: string = code,
    readonly details?: ApiError['error']['details'],
  ) {
    super(message);
    this.name = 'AppError';
  }
}

const body = (
  code: ErrorCode,
  message: string,
  details?: ApiError['error']['details'],
): ApiError => ({ error: details ? { code, message, details } : { code, message } });

/**
 * Chuẩn hoá mọi lỗi về `{ error: { code, message, details? } }`: Zod → 400 `validation_error` kèm
 * `details`; `AppError` → mã và HTTP của nó; JSON hỏng/lỗi 4xx của Fastify → 400 `validation_error`;
 * còn lại → 500 `internal_error`, không lộ chi tiết (chỉ ghi log).
 */
export function registerErrors(app: FastifyInstance): void {
  app.setErrorHandler((err: FastifyError | Error, request, reply) => {
    if (err instanceof AppError) {
      return reply.status(err.status).send(body(err.code, err.message, err.details));
    }
    if (err instanceof ZodError) {
      const details = err.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
      return reply.status(400).send(body('validation_error', 'Dữ liệu không hợp lệ', details));
    }
    const status = 'statusCode' in err ? err.statusCode : undefined;
    if (status !== undefined && status >= 400 && status < 500) {
      return reply.status(400).send(body('validation_error', 'Yêu cầu không hợp lệ'));
    }
    request.log.error(err);
    return reply.status(500).send(body('internal_error', 'Lỗi máy chủ'));
  });

  app.setNotFoundHandler((_request, reply) =>
    reply.status(404).send(body('not_found', 'Không tìm thấy')),
  );
}
