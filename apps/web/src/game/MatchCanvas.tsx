import { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import type { MatchSetup } from '@pitch/sim';
import { COLORS } from './render/colors';
import {
  MATCH_SCENE_KEY,
  MatchScene,
  type MatchBridge,
  type MatchSceneData,
} from './scenes/MatchScene';

type ListenerArgs = Parameters<Document['addEventListener']>;

/**
 * Phaser 3.90, khi game bắt đầu chạy (`Game.start`, gọi đồng bộ ngay sau sự kiện READY), gắn
 * `visibilitychange` vào `document` và gán `window.onblur`/`onfocus` — `destroy(true)` không gỡ,
 * nên vào/ra trận nhiều lần sẽ dồn listener và giữ tham chiếu tới game cũ.
 * Ghi lại những gì gắn trong đúng lượt đó; hàm trả về gỡ chúng khi huỷ game.
 */
function trackPhaserGlobals(game: Phaser.Game): () => void {
  const added: ListenerArgs[] = [];
  let handlers: Pick<Window, 'onblur' | 'onfocus'> | null = null;

  game.events.once(Phaser.Core.Events.READY, () => {
    const original = document.addEventListener;
    document.addEventListener = function (this: Document, ...args: ListenerArgs) {
      added.push(args);
      original.apply(this, args);
    } as Document['addEventListener'];
    // `start()` chạy xong trong cùng lượt đồng bộ, trước microtask này.
    queueMicrotask(() => {
      Reflect.deleteProperty(document, 'addEventListener');
      handlers = { onblur: window.onblur, onfocus: window.onfocus };
    });
  });

  return () => {
    for (const args of added) document.removeEventListener(...args);
    if (handlers && window.onblur === handlers.onblur) window.onblur = null;
    if (handlers && window.onfocus === handlers.onfocus) window.onfocus = null;
  };
}

/**
 * Ranh giới React ↔ Phaser (ADR-0003): tạo `Phaser.Game` khi mount, huỷ hẳn (cả canvas) khi unmount
 * để vào/ra trận nhiều lần không rò canvas, listener hay WebGL context.
 */
export function MatchCanvas({ setup, bridge }: { setup: MatchSetup; bridge?: MatchBridge }) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const parent = hostRef.current;
    if (!parent) return;
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent,
      backgroundColor: COLORS.bgCss,
      banner: false,
      scale: { mode: Phaser.Scale.RESIZE, width: parent.clientWidth, height: parent.clientHeight },
      input: { keyboard: true, mouse: false, touch: false, gamepad: false },
      // Chưa có âm thanh; không tạo AudioContext (trình duyệt giới hạn số AudioContext).
      audio: { noAudio: true },
    });
    const releaseGlobals = trackPhaserGlobals(game);
    const data: MatchSceneData = { setup, bridge };
    game.scene.add(MATCH_SCENE_KEY, MatchScene, true, data);

    return () => {
      // Phaser chỉ huỷ thật (DESTROY) ở khung hình kế tiếp, luôn sau READY.
      game.events.once(Phaser.Core.Events.DESTROY, () => {
        // Phaser không tự trả WebGL context khi huỷ; trình duyệt chỉ cho ~16 context sống cùng lúc.
        const renderer = game.renderer;
        if (renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer) {
          renderer.gl.getExtension('WEBGL_lose_context')?.loseContext();
        }
        releaseGlobals();
      });
      game.destroy(true);
    };
  }, [setup, bridge]);

  return <div ref={hostRef} style={{ width: '100%', height: '100%', overflow: 'hidden' }} />;
}
