/**
 * Cầu thủ (tạm, tới 5.18b thay bằng nhân vật low-poly có hoạt ảnh), bóng, bóng đổ, mũi tên chỉ
 * người đang điều khiển. Geometry/material dùng chung trong một `ActorKit` để 14 cầu thủ rẻ.
 */
import * as THREE from 'three';
import type { PlayerState } from '@pitch/sim';
import { COLORS } from '../render/colors';
import { shirtNumber } from '../render/view';

/**
 * Bóng thật bán kính 0,11 m; vẽ to hơn chút cho dễ nhìn ở góc truyền hình nhưng vẫn cân với cầu thủ
 * Mixamo cao 1,8 m (0,2 m trước đây trông như bóng tập to gấp đôi).
 */
export const BALL_DRAW_RADIUS = 0.13;
const BODY_H = 1.25;
const LEG_H = 0.55;
const CHARGE_BAR_W = 1.5;
const CHARGE_BAR_H = 0.22;

const NUMBER_FONT = 'bold 44px "Barlow Condensed", "Arial Narrow", sans-serif';

export function numberTexture(n: number, ink: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  if (!ctx) return tex;
  const draw = () => {
    ctx.clearRect(0, 0, 64, 64);
    ctx.fillStyle = ink;
    ctx.font = NUMBER_FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(n), 32, 34);
    tex.needsUpdate = true;
  };
  draw();
  // Font tự host chưa tải xong thì vẽ tạm bằng font dự phòng, tải xong vẽ lại.
  if (!document.fonts.check(NUMBER_FONT))
    void document.fonts.load(NUMBER_FONT).then(draw, () => {});
  return tex;
}

export class ActorKit {
  private readonly torso = new THREE.CylinderGeometry(0.26, 0.22, BODY_H - LEG_H, 12);
  private readonly legs = new THREE.CylinderGeometry(0.2, 0.17, LEG_H, 10);
  private readonly head = new THREE.SphereGeometry(0.16, 14, 10);
  private readonly nose = new THREE.BoxGeometry(0.12, 0.1, 0.12);
  private readonly backPlate = new THREE.PlaneGeometry(0.34, 0.34);
  private readonly skin = new THREE.MeshLambertMaterial({ color: COLORS.skin });
  private readonly shorts = new THREE.MeshLambertMaterial({ color: COLORS.shorts });
  private readonly shirts = new Map<number, THREE.MeshLambertMaterial>();
  private readonly numbers = new Map<number, THREE.MeshBasicMaterial>();

  private shirt(color: number): THREE.MeshLambertMaterial {
    let m = this.shirts.get(color);
    if (!m) {
      m = new THREE.MeshLambertMaterial({ color });
      this.shirts.set(color, m);
    }
    return m;
  }

  private numberMat(n: number): THREE.MeshBasicMaterial {
    let m = this.numbers.get(n);
    if (!m) {
      m = new THREE.MeshBasicMaterial({
        map: numberTexture(n, COLORS.shirtInk),
        transparent: true,
        depthWrite: false,
      });
      this.numbers.set(n, m);
    }
    return m;
  }

  createPlayer(p: PlayerState): THREE.Group {
    const color = p.position === 'GK' ? COLORS.keeper[p.team] : COLORS.team[p.team];
    const root = new THREE.Group();

    const legs = new THREE.Mesh(this.legs, this.shorts);
    legs.position.y = LEG_H / 2;
    const torso = new THREE.Mesh(this.torso, this.shirt(color));
    torso.position.y = LEG_H + (BODY_H - LEG_H) / 2;
    const head = new THREE.Mesh(this.head, this.skin);
    head.position.y = BODY_H + 0.17;
    // Mũi nhỏ phía trước để thấy hướng mặt (+z cục bộ).
    const nose = new THREE.Mesh(this.nose, this.skin);
    nose.position.set(0, BODY_H + 0.15, 0.15);
    // Số áo sau lưng (−z cục bộ), quay ra sau.
    const num = new THREE.Mesh(this.backPlate, this.numberMat(shirtNumber(p.slot)));
    num.position.set(0, torso.position.y + 0.05, -0.25);
    num.rotation.y = Math.PI;

    for (const m of [legs, torso, head]) m.castShadow = true;
    root.add(legs, torso, head, nose, num);
    return root;
  }

  createBall(): THREE.Mesh {
    const ball = new THREE.Mesh(
      new THREE.SphereGeometry(BALL_DRAW_RADIUS, 16, 12),
      new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x333333 }),
    );
    ball.castShadow = true;
    return ball;
  }

  /** Bóng đổ dạng đĩa mờ dưới quả bóng — vẫn cần khi tắt shadow map để thấy độ cao bóng. */
  createBlobShadow(): THREE.Mesh {
    const blob = new THREE.Mesh(
      new THREE.CircleGeometry(BALL_DRAW_RADIUS * 1.2, 16),
      new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
      }),
    );
    blob.rotation.x = -Math.PI / 2;
    blob.position.y = 0.015;
    return blob;
  }

  /**
   * Thanh lực (giữ S/A/D) trên đầu cầu thủ: nền tối + phần đầy co giãn theo trục x từ mép trái.
   * Nhóm được xoay theo camera mỗi khung hình nên luôn nhìn thẳng.
   */
  createChargeBar(): { group: THREE.Group; fill: THREE.Mesh; fillMat: THREE.MeshBasicMaterial } {
    const group = new THREE.Group();
    const bg = new THREE.Mesh(
      new THREE.PlaneGeometry(CHARGE_BAR_W + 0.06, CHARGE_BAR_H + 0.06),
      new THREE.MeshBasicMaterial({
        color: COLORS.bg,
        transparent: true,
        opacity: 0.8,
        depthTest: false,
      }),
    );
    // Hình học dời sang phải nửa bề rộng để scale.x co giãn từ mép trái.
    const fillGeo = new THREE.PlaneGeometry(CHARGE_BAR_W, CHARGE_BAR_H).translate(
      CHARGE_BAR_W / 2,
      0,
      0,
    );
    // Cùng là vật trong suốt với nền thì renderOrder mới quyết định thứ tự vẽ (vật đặc luôn vẽ trước).
    const fillMat = new THREE.MeshBasicMaterial({
      color: COLORS.accent,
      transparent: true,
      depthTest: false,
    });
    const fill = new THREE.Mesh(fillGeo, fillMat);
    fill.position.set(-CHARGE_BAR_W / 2, 0, 0.001);
    bg.renderOrder = 10;
    fill.renderOrder = 11;
    group.add(bg, fill);
    group.visible = false;
    return { group, fill, fillMat };
  }

  /** Mũi tên ▼ trên đầu cầu thủ đang điều khiển (DESIGN.md §6.2). */
  createMarker(): THREE.Mesh {
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(0.22, 0.42, 3),
      new THREE.MeshBasicMaterial({ color: COLORS.accent }),
    );
    cone.rotation.x = Math.PI;
    return cone;
  }
}

/** Góc xoay quanh trục đứng để +z cục bộ của nhân vật trùng hướng mặt sim (z thế giới = sim y). */
export const headingFromFacing = (facing: { x: number; y: number }): number =>
  Math.atan2(facing.x, facing.y);
