import websocket, { type WebSocket } from '@fastify/websocket';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { PvpClientMessage, type PvpServerMessage } from '@pitch/shared';
import { requireAuth } from '../plugins/auth';
import { AppError } from '../plugins/errors';
import { HEARTBEAT_MS, PvpHub, type HubConn } from '../services/pvp/hub';
import { realTime, type TimeSource } from '../services/pvp/ticker';

declare module 'fastify' {
  interface FastifyInstance {
    pvp: PvpHub;
  }
}

export const WS_MAX_PAYLOAD = 512;
export const WS_MAX_PER_IP = 4;
export const WS_MAX_MSG_PER_SEC = 120;
export const WS_MAX_BUFFERED = 256 * 1024;

export interface PvpRouteOptions {
  time?: TimeSource;
  maxSessions?: number;
  maxPerIp?: number;
}

/** A18: `Origin` bắt buộc và phải trùng `Host` (chống CSWSH); hook chạy ở preValidation, trước upgrade. */
async function requireSameOrigin(req: FastifyRequest): Promise<void> {
  const origin = req.headers.origin;
  let host: string | null = null;
  try {
    host = origin ? new URL(origin).host : null;
  } catch {
    // Origin hỏng (VD "null")
  }
  if (host === null || host !== req.headers.host) {
    throw new AppError('forbidden', 403, 'Nguồn yêu cầu không hợp lệ');
  }
}

export function registerPvpRoutes(app: FastifyInstance, opts: PvpRouteOptions = {}): void {
  const time = opts.time ?? realTime;
  const maxPerIp = opts.maxPerIp ?? WS_MAX_PER_IP;
  const hub = new PvpHub({
    db: app.db,
    clock: app.clock,
    rng: app.rng,
    time,
    ...(opts.maxSessions !== undefined && { maxSessions: opts.maxSessions }),
    onError: (err) => app.log.error({ err }, 'pvp lỗi'),
  });
  app.decorate('pvp', hub);
  const perIp = new Map<string, number>();

  const heartbeat = setInterval(() => hub.sweep(), HEARTBEAT_MS);
  heartbeat.unref();
  app.addHook('onClose', async () => {
    clearInterval(heartbeat);
    hub.stop();
  });

  app.register(websocket, { options: { maxPayload: WS_MAX_PAYLOAD, perMessageDeflate: false } });
  app.register(async (scope) => {
    scope.get(
      '/api/v1/pvp/ws',
      {
        websocket: true,
        preValidation: [
          requireSameOrigin,
          requireAuth,
          async (req) => {
            if ((perIp.get(req.ip) ?? 0) >= maxPerIp) {
              throw new AppError('rate_limited', 429, 'Quá nhiều kết nối');
            }
          },
        ],
      },
      (socket, req) => onConnection(socket, req.user!.id, req.ip),
    );
  });

  function onConnection(socket: WebSocket, userId: number, ip: string): void {
    perIp.set(ip, (perIp.get(ip) ?? 0) + 1);
    let closed = false;
    const conn: HubConn = {
      userId,
      lastPongAt: time.now(),
      send(msg: PvpServerMessage) {
        if (closed) return;
        if (socket.bufferedAmount > WS_MAX_BUFFERED) {
          // Client đọc quá chậm: đóng 4408 và xử như rớt mạng (A11).
          socket.close(4408);
          return onClose();
        }
        socket.send(JSON.stringify(msg));
      },
      close: (code) => socket.close(code),
      ping: () => socket.ping(),
      terminate: () => socket.terminate(),
    };
    function onClose(): void {
      if (closed) return;
      closed = true;
      perIp.set(ip, (perIp.get(ip) ?? 1) - 1);
      if (perIp.get(ip) === 0) perIp.delete(ip);
      hub.onClosed(conn);
    }
    hub.addConn(conn);
    socket.on('close', onClose);
    socket.on('error', () => {}); // vượt maxPayload: ws tự đóng 1009
    socket.on('pong', () => (conn.lastPongAt = time.now()));

    let windowStart = time.now();
    let count = 0;
    socket.on('message', (raw: Buffer, isBinary: boolean) => {
      const now = time.now();
      if (now - windowStart >= 1000) [windowStart, count] = [now, 0];
      if (++count > WS_MAX_MSG_PER_SEC) {
        conn.send({ t: 'error', code: 'rate_limited' });
        return socket.close(4429);
      }
      let parsed: ReturnType<typeof PvpClientMessage.safeParse> | null = null;
      if (!isBinary) {
        try {
          parsed = PvpClientMessage.safeParse(JSON.parse(raw.toString()));
        } catch {
          // JSON hỏng
        }
      }
      if (!parsed?.success) {
        conn.send({ t: 'error', code: 'bad_message' });
        return socket.close(4400);
      }
      try {
        hub.handle(conn, parsed.data);
      } catch (err) {
        app.log.error({ err }, 'pvp handle lỗi');
      }
    });
  }
}
