/**
 * Khán giả "ảnh động" (task 5.21): mỗi hàng ghế là một tấm phẳng dán dải người vẽ trên canvas, ba
 * khung hình xếp dọc (ngồi, giơ tay, nhảy). Đổi khung bằng `offset.y` của texture — không có model
 * từng người nên gần như không tốn GPU. Có bàn thắng thì cả khán đài nhảy liên tục vài giây.
 */
import * as THREE from 'three';
import { standRows, TIER_RISE } from './stadium';

const FRAMES = 3;
const FRAME_W = 1024;
const FRAME_H = 64;
/** Một ô texture phủ chừng này mét hàng ghế. */
const TILE_M = 16;
const PERSON_PX = 38;
const EMPTY_SEATS = 0.1;
const SEAT_BG = '#13201b';
const SHIRTS = [
  '#3fa9f5',
  '#ff7a45',
  '#edf2ec',
  '#c8f031',
  '#9db0a6',
  '#2c4a7a',
  '#d94848',
  '#ffc23d',
];
const SKINS = ['#f1c8a0', '#e0ac69', '#c68642', '#9a6235', '#6b4226'];
const HAIRS = ['#17120f', '#2e1d12', '#5a3a20', '#b48a4e'];
/** Mức cổ vũ giảm về 0 sau chừng này giây. */
const CHEER_SEC = 5;

export interface Crowd {
  object: THREE.Object3D;
  cheer(): void;
  /** `animate` = false: đứng yên ở khung ngồi (tắt "Khán giả động" trong menu đồ hoạ). */
  update(dt: number, timeSec: number, animate: boolean): void;
}

/** Vẽ một người ở khung `frame`: 0 ngồi, 1 giơ một tay, 2 đứng nhảy hai tay giơ cao. */
function drawPerson(
  ctx: CanvasRenderingContext2D,
  x: number,
  top: number,
  frame: number,
  look: { shirt: string; skin: string; hair: string; lean: number },
): void {
  const lift = frame === 2 ? 7 : 0;
  const cx = x + PERSON_PX / 2 + look.lean;
  const headY = top + 20 - lift;
  // Tay giơ (vẽ trước thân để vai che chỗ nối).
  ctx.strokeStyle = look.skin;
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  const arm = (side: number, up: boolean) => {
    ctx.beginPath();
    ctx.moveTo(cx + side * 9, headY + 14);
    if (up) ctx.lineTo(cx + side * 14, headY - 10);
    else ctx.lineTo(cx + side * 12, headY + 32);
    ctx.stroke();
  };
  arm(-1, frame === 2);
  arm(1, frame >= 1);
  ctx.fillStyle = look.shirt;
  ctx.beginPath();
  ctx.roundRect(cx - 11, headY + 10, 22, FRAME_H, 6);
  ctx.fill();
  ctx.fillStyle = look.skin;
  ctx.beginPath();
  ctx.arc(cx, headY, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = look.hair;
  ctx.beginPath();
  ctx.arc(cx, headY - 2, 8, Math.PI, Math.PI * 2);
  ctx.fill();
}

function crowdSheet(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = FRAME_W;
  canvas.height = FRAME_H * FRAMES;
  const ctx = canvas.getContext('2d');
  let seed = 23;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]!;
  if (ctx) {
    ctx.fillStyle = SEAT_BG;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const n = Math.floor(FRAME_W / PERSON_PX);
    const people = Array.from({ length: n }, () =>
      rand() < EMPTY_SEATS
        ? null
        : { shirt: pick(SHIRTS), skin: pick(SKINS), hair: pick(HAIRS), lean: (rand() - 0.5) * 6 },
    );
    for (let f = 0; f < FRAMES; f++) {
      const top = f * FRAME_H;
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, top, FRAME_W, FRAME_H);
      ctx.clip();
      people.forEach((look, j) => {
        // Người trong cùng hàng không giơ tay cùng lúc: khung 1 chỉ áp cho một nửa số người.
        const frame = f === 1 && j % 2 === 0 ? 0 : f;
        if (look) drawPerson(ctx, j * (FRAME_W / n), top, frame, look);
      });
      ctx.restore();
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

export function buildCrowd(): Crowd {
  const g = new THREE.Group();
  const sheet = crowdSheet();
  const rows: { map: THREE.Texture; phase: number }[] = [];
  let i = 0;
  for (const row of standRows()) {
    const map = sheet.clone();
    map.repeat.set(row.length / TILE_M, 1 / FRAMES);
    // Lệch ngang mỗi hàng để các hàng không giống hệt nhau.
    map.offset.x = (i * 0.37) % 1;
    map.offset.y = (FRAMES - 1) / FRAMES;
    map.needsUpdate = true;
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(row.length, TIER_RISE),
      new THREE.MeshLambertMaterial({ map }),
    );
    plane.position.copy(row.start).setY(row.start.y + TIER_RISE / 2);
    plane.rotation.y = row.yaw;
    g.add(plane);
    rows.push({ map, phase: (i * 2.399) % (Math.PI * 2) });
    i++;
  }

  let cheer = 0;
  const setFrame = (map: THREE.Texture, f: number) => {
    map.offset.y = (FRAMES - 1 - f) / FRAMES;
  };
  return {
    object: g,
    cheer() {
      cheer = 1;
    },
    update(dt, timeSec, animate) {
      cheer = Math.max(0, cheer - dt / CHEER_SEC);
      for (const r of rows) {
        if (!animate) setFrame(r.map, 0);
        else if (cheer > 0) setFrame(r.map, Math.floor(timeSec * 6 + r.phase) % 2 === 0 ? 2 : 1);
        // Lúc bình thường thỉnh thoảng một hàng giơ tay.
        else setFrame(r.map, Math.sin(timeSec * 0.6 + r.phase * 3) > 0.92 ? 1 : 0);
      }
    },
  };
}
