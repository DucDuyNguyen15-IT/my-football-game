/**
 * Scene trận đấu: chỉ vẽ `MatchState` và đọc phím (ADR-0002). Mọi luật/vật lý/AI nằm trong `@pitch/sim`.
 * Vòng lặp bước cố định: gom thời gian thực vào accumulator, chạy `step` đủ số tick 1/60 s,
 * rồi vẽ nội suy giữa tick trước và tick hiện tại (ARCHITECTURE §6).
 */
import Phaser from 'phaser';
import {
  CENTER_CIRCLE_RADIUS,
  GOAL_WIDTH,
  HALF_LENGTH,
  HALF_WIDTH,
  PENALTY_AREA_DEPTH,
  PENALTY_AREA_WIDTH,
  PENALTY_SPOT_DIST,
  PITCH_LENGTH,
  TICK_DT,
  createMatch,
  step,
  type MatchSetup,
  type MatchState,
  type PlayerState,
} from '@pitch/sim';
import { CONTROL_KEYS, createTapLatch, keysToInput, type KeyState } from '../input/keyboard';
import { COLORS } from '../render/colors';
import { lerp, lerpPos, shirtNumber } from '../render/view';

export const MATCH_SCENE_KEY = 'match';

/** Kênh scene ↔ React (HUD): React đọc state để hiển thị, scene hỏi có đang tạm dừng không. */
export interface MatchBridge {
  isPaused(): boolean;
  /** Gọi sau mỗi khung hình có tick mới. */
  onState(state: MatchState): void;
}

export interface MatchSceneData {
  setup: MatchSetup;
  bridge?: MatchBridge;
}

/** Pixel trên mét ở zoom 1. */
const PX = 24;
/** Số mét sân thấy theo chiều ngang màn hình — camera gần, bám bóng, không thấy cả sân. */
const VIEW_WIDTH_M = 36;
/** Dải cỏ ngoài vạch biên. */
const RUNOFF_M = 4;
const GOAL_DEPTH_M = 1.5;
const STRIPES = 12;
const PLAYER_RADIUS_M = 0.6;
/** Bóng thật (0.11 m) quá nhỏ để nhìn; vẽ to hơn. */
const BALL_DRAW_RADIUS_M = 0.28;
/** Khung hình bị treo lâu (tab ẩn, debugger) thì bỏ bớt thời gian, không chạy dồn hàng trăm tick. */
const MAX_FRAME_SEC = 0.25;
const DEBUG_REFRESH_MS = 250;

interface PlayerSprite {
  body: Phaser.GameObjects.Container;
  facing: Phaser.GameObjects.Arc;
}

export class MatchScene extends Phaser.Scene {
  private prev!: MatchState;
  private curr!: MatchState;
  private accumulator = 0;
  private keys!: Record<keyof KeyState, Phaser.Input.Keyboard.Key>;
  private readonly sprites = new Map<string, PlayerSprite>();
  private ball!: Phaser.GameObjects.Arc;
  private ballShadow!: Phaser.GameObjects.Ellipse;
  private marker!: Phaser.GameObjects.Triangle;
  private debugText: Phaser.GameObjects.Text | null = null;
  private debugRefreshAt = 0;
  private bridge: MatchBridge | undefined;
  private readonly taps = createTapLatch();

  constructor() {
    super(MATCH_SCENE_KEY);
  }

  init(data: MatchSceneData): void {
    this.curr = createMatch(data.setup);
    this.prev = this.curr;
    this.accumulator = 0;
    this.sprites.clear();
    this.bridge = data.bridge;
  }

  create(): void {
    this.drawPitch();
    for (const p of this.curr.players) this.sprites.set(p.id, this.createPlayer(p));

    const ballR = BALL_DRAW_RADIUS_M * PX;
    this.ballShadow = this.add.ellipse(0, 0, ballR * 2.4, ballR * 1.6, 0x000000, 0.35).setDepth(5);
    this.ball = this.add.circle(0, 0, ballR, 0xffffff).setStrokeStyle(1.5, COLORS.bg).setDepth(30);
    // Mũi tên ▼ trên đầu cầu thủ đang điều khiển (DESIGN.md §6.2).
    this.marker = this.add
      .triangle(0, 0, 0, 0, 14, 0, 7, 10, COLORS.accent)
      .setStrokeStyle(1.5, COLORS.bg)
      .setDepth(40);

    // Mặc định Phaser chặn hành vi trình duyệt của phím đã đăng ký (mũi tên không cuộn trang).
    const keyboard = this.input.keyboard;
    if (!keyboard) throw new Error('MatchScene cần bật input bàn phím');
    this.keys = keyboard.addKeys(CONTROL_KEYS) as Record<keyof KeyState, Phaser.Input.Keyboard.Key>;
    // Sự kiện `down` vẫn phát khi phím được nhấn và thả trong cùng một khung hình.
    for (const name of Object.keys(this.keys) as (keyof KeyState)[]) {
      this.keys[name].on(Phaser.Input.Keyboard.Events.DOWN, () => this.taps.press(name));
    }

    const cam = this.cameras.main;
    const boundX = (HALF_LENGTH + RUNOFF_M) * PX;
    const boundY = (HALF_WIDTH + RUNOFF_M) * PX;
    cam.setBounds(-boundX, -boundY, boundX * 2, boundY * 2);
    cam.startFollow(this.ballShadow, false, 0.08, 0.08);
    this.fitCamera();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.fitCamera, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.fitCamera, this);
    });

    if (import.meta.env.DEV) this.createDebugOverlay();
    this.draw(1);
    this.bridge?.onState(this.curr);
  }

  override update(time: number, deltaMs: number): void {
    // Tạm dừng: không chạy sim, không dồn thời gian để lúc tiếp tục không chạy bù.
    if (this.bridge?.isPaused()) {
      this.accumulator = 0;
      // Phím bấm trong menu tạm dừng không được tính vào trận.
      this.taps.consume();
      return;
    }
    this.accumulator += Math.min(deltaMs / 1000, MAX_FRAME_SEC);
    const input = keysToInput(this.taps.sample(this.readKeys()));
    const before = this.curr;
    let ticked = false;
    while (this.accumulator >= TICK_DT) {
      this.prev = this.curr;
      this.curr = step(this.curr, input);
      this.accumulator -= TICK_DT;
      ticked = true;
    }
    if (ticked) this.taps.consume();
    this.draw(this.accumulator / TICK_DT);
    if (this.curr !== before) this.bridge?.onState(this.curr);
    if (this.debugText && time >= this.debugRefreshAt) this.refreshDebug(time);
  }

  private readKeys(): KeyState {
    const k = this.keys;
    return {
      up: k.up.isDown,
      down: k.down.isDown,
      left: k.left.isDown,
      right: k.right.isDown,
      sprint: k.sprint.isDown,
      pass: k.pass.isDown,
      lob: k.lob.isDown,
      shoot: k.shoot.isDown,
    };
  }

  private fitCamera(): void {
    const zoom = Phaser.Math.Clamp(this.scale.width / (VIEW_WIDTH_M * PX), 0.5, 3);
    this.cameras.main.setZoom(zoom);
  }

  /** Vẽ trạng thái nội suy: `alpha` = 0 là tick trước, 1 là tick hiện tại. */
  private draw(alpha: number): void {
    const { prev, curr } = this;
    const prevById = new Map(prev.players.map((p) => [p.id, p]));
    const onPitch = new Set<string>();

    for (const p of curr.players) {
      const sprite = this.sprites.get(p.id);
      if (!sprite) continue;
      onPitch.add(p.id);
      const pos = lerpPos((prevById.get(p.id) ?? p).pos, p.pos, alpha);
      sprite.body.setPosition(pos.x * PX, pos.y * PX);
      const edge = PLAYER_RADIUS_M * PX * 0.95;
      sprite.facing.setPosition(p.facing.x * edge, p.facing.y * edge);
    }
    // Người bị thẻ đỏ rời sân.
    for (const [id, sprite] of this.sprites) {
      if (onPitch.has(id)) continue;
      sprite.body.destroy();
      this.sprites.delete(id);
    }

    const controlled = this.sprites.get(curr.controlledId);
    this.marker.setVisible(controlled !== undefined);
    if (controlled) {
      this.marker.setPosition(controlled.body.x, controlled.body.y - PLAYER_RADIUS_M * PX - 12);
    }

    const ground = lerpPos(prev.ball.pos, curr.ball.pos, alpha);
    const z = Math.max(0, lerp(prev.ball.z, curr.ball.z, alpha));
    const shadowScale = 1 / (1 + z * 0.35);
    this.ballShadow
      .setPosition(ground.x * PX, ground.y * PX)
      .setScale(shadowScale)
      .setAlpha(0.35 * shadowScale);
    // Bóng bay lên thì vẽ lệch lên trên (phối cảnh nhìn chéo) và to ra một chút.
    this.ball.setPosition(ground.x * PX, (ground.y - z) * PX).setScale(1 + z * 0.12);
  }

  private createPlayer(p: PlayerState): PlayerSprite {
    const r = PLAYER_RADIUS_M * PX;
    const disc = this.add.circle(0, 0, r, COLORS.team[p.team]).setStrokeStyle(2, COLORS.bg);
    const label = this.add
      .text(0, 0, String(shirtNumber(p.slot)), {
        fontFamily: 'system-ui, sans-serif',
        fontSize: `${Math.round(r * 1.05)}px`,
        fontStyle: 'bold',
        color: COLORS.shirtInk,
      })
      .setOrigin(0.5)
      .setResolution(2);
    const facing = this.add.circle(0, 0, 2.5, COLORS.pitchLine);
    const body = this.add.container(0, 0, [disc, label, facing]).setDepth(10);
    return { body, facing };
  }

  private drawPitch(): void {
    const L = HALF_LENGTH * PX;
    const W = HALF_WIDTH * PX;
    const runoff = RUNOFF_M * PX;
    const g = this.add.graphics().setDepth(0);

    g.fillStyle(COLORS.pitchA);
    g.fillRect(-L - runoff, -W - runoff, 2 * (L + runoff), 2 * (W + runoff));
    const band = (PITCH_LENGTH / STRIPES) * PX;
    for (let i = 0; i < STRIPES; i++) {
      g.fillStyle(i % 2 === 0 ? COLORS.pitchA : COLORS.pitchB);
      g.fillRect(-L + i * band, -W, band, 2 * W);
    }

    g.lineStyle(2, COLORS.pitchLine, 0.9);
    g.strokeRect(-L, -W, 2 * L, 2 * W);
    g.lineBetween(0, -W, 0, W);
    g.strokeCircle(0, 0, CENTER_CIRCLE_RADIUS * PX);
    g.fillStyle(COLORS.pitchLine);
    g.fillCircle(0, 0, 3);

    const boxW = PENALTY_AREA_WIDTH * PX;
    const boxD = PENALTY_AREA_DEPTH * PX;
    const goalW = GOAL_WIDTH * PX;
    const goalD = GOAL_DEPTH_M * PX;
    for (const side of [-1, 1] as const) {
      g.lineStyle(2, COLORS.pitchLine, 0.9);
      g.strokeRect(side > 0 ? L - boxD : -L, -boxW / 2, boxD, boxW);
      g.fillStyle(COLORS.pitchLine);
      g.fillCircle(side * (HALF_LENGTH - PENALTY_SPOT_DIST) * PX, 0, 3);
      // Khung thành nằm ngoài vạch cuối.
      const goalX = side > 0 ? L : -L - goalD;
      g.fillStyle(0xffffff, 0.15);
      g.fillRect(goalX, -goalW / 2, goalD, goalW);
      g.lineStyle(3, 0xffffff, 1);
      g.strokeRect(goalX, -goalW / 2, goalD, goalW);
    }
  }

  /** Overlay FPS chỉ khi dev; vẽ bằng camera riêng để không bị zoom/cuộn theo camera chính. */
  private createDebugOverlay(): void {
    const text = this.add
      .text(8, 8, '', {
        fontFamily: 'ui-monospace, monospace',
        fontSize: '13px',
        color: COLORS.text,
        backgroundColor: '#000000aa',
        padding: { x: 6, y: 4 },
      })
      .setDepth(100);
    const world = this.children.list.filter((o) => o !== text);
    this.cameras.main.ignore(text);
    this.cameras.add(0, 0, this.scale.width, this.scale.height).ignore(world);
    this.debugText = text;
  }

  private refreshDebug(time: number): void {
    const { curr } = this;
    this.debugRefreshAt = time + DEBUG_REFRESH_MS;
    this.debugText?.setText(
      `FPS ${Math.round(this.game.loop.actualFps)} · tick ${curr.tick} · ${curr.phase}` +
        ` · ${curr.score.home}–${curr.score.away}`,
    );
  }
}
