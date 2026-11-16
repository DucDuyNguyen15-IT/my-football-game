/**
 * Widget điểm chạm bóng ở góc dưới-phải khi đội người chơi đá phạt / phạt góc: hình tròn quả bóng
 * nhìn từ sau lưng, chấm trắng tại điểm chạm (Shift + mũi tên để dời) và tên cú đá. SVG đè lên canvas
 * như `CountdownRingView`; chỉ ghi DOM khi giá trị đổi.
 */
import type { Vec2 } from '@pitch/sim';
import { COLORS } from '../render/colors';
import { contactLabel } from '../render/view';

const SVG_NS = 'http://www.w3.org/2000/svg';
const BOX = 100;
const R = 40;
const DOT = 7;

function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

export class ContactWidgetView {
  private root: HTMLDivElement | null = null;
  private dot: SVGCircleElement | null = null;
  private label: HTMLSpanElement | null = null;
  private key = '';

  constructor(private readonly parent: HTMLElement) {}

  show(contact: Vec2, foot: 'right' | 'left'): void {
    if (!this.root) this.create();
    // Làm tròn 1/100 bán kính: không ghi DOM mỗi khung khi điểm chạm đứng yên.
    const x = Math.round(contact.x * 100) / 100;
    const y = Math.round(contact.y * 100) / 100;
    const key = `${x},${y},${foot}`;
    if (key === this.key) return;
    this.key = key;
    this.dot!.setAttribute('cx', String(BOX / 2 + x * (R - DOT)));
    this.dot!.setAttribute('cy', String(BOX / 2 - y * (R - DOT)));
    this.label!.textContent = contactLabel(contact, foot);
  }

  hide(): void {
    this.root?.remove();
    this.root = null;
    this.dot = null;
    this.label = null;
    this.key = '';
  }

  dispose(): void {
    this.hide();
  }

  private create(): void {
    const root = document.createElement('div');
    Object.assign(root.style, {
      position: 'absolute',
      right: '16px',
      bottom: '16px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '4px',
      padding: '8px 10px',
      background: 'rgb(10 14 12 / 0.62)',
      borderRadius: '8px',
      pointerEvents: 'none',
      zIndex: '8',
      color: COLORS.text,
      font: '600 13px "Space Grotesk", "Arial Narrow", sans-serif',
    });
    root.setAttribute('aria-hidden', 'true');
    const svg = svgEl('svg', { viewBox: `0 0 ${BOX} ${BOX}`, width: 76, height: 76 });
    const ball = svgEl('circle', {
      cx: BOX / 2,
      cy: BOX / 2,
      r: R,
      fill: 'rgb(250 248 243 / 0.12)',
      stroke: 'rgb(250 248 243 / 0.85)',
      'stroke-width': 3,
    });
    // Hai đường chữ thập mờ đánh dấu giữa bóng (sút căng).
    const cross = svgEl('path', {
      d: `M${BOX / 2 - R} ${BOX / 2}H${BOX / 2 + R}M${BOX / 2} ${BOX / 2 - R}V${BOX / 2 + R}`,
      stroke: 'rgb(250 248 243 / 0.25)',
      'stroke-width': 1.5,
    });
    const dot = svgEl('circle', {
      cx: BOX / 2,
      cy: BOX / 2,
      r: DOT,
      fill: '#ffffff',
      stroke: '#000000',
      'stroke-width': 2,
    });
    svg.append(ball, cross, dot);
    const label = document.createElement('span');
    const hint = document.createElement('small');
    hint.textContent = 'Shift + mũi tên';
    Object.assign(hint.style, { opacity: '0.7', fontWeight: '400', fontSize: '11px' });
    root.append(svg, label, hint);
    this.parent.appendChild(root);
    this.root = root;
    this.dot = dot;
    this.label = label;
  }
}
