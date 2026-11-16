/**
 * Vòng ngắm phạt đền 2D: SVG đè lên canvas như `CountdownRingView`, tâm và bán kính chiếu từ mặt
 * khung thành ra màn hình. Xanh lá khi lực vừa, đỏ khi quá lực. Chỉ ghi DOM khi giá trị đổi.
 */
const SVG_NS = 'http://www.w3.org/2000/svg';
const GREEN = '#3ddc84';
const RED = '#ff4d4d';

export class PenaltyRingView {
  private svg: SVGSVGElement | null = null;
  private circle: SVGCircleElement | null = null;
  private key = '';

  constructor(private readonly parent: HTMLElement) {}

  /** Tâm (`x`, `y`) px tính từ góc trên-trái khung trận, bán kính `r` px. */
  show(x: number, y: number, r: number, over: boolean): void {
    if (!this.svg) this.create();
    const key = `${Math.round(x)},${Math.round(y)},${Math.round(r)},${over}`;
    if (key === this.key) return;
    this.key = key;
    const c = this.circle!;
    c.setAttribute('cx', String(Math.round(x)));
    c.setAttribute('cy', String(Math.round(y)));
    c.setAttribute('r', String(Math.max(2, Math.round(r))));
    const color = over ? RED : GREEN;
    c.setAttribute('stroke', color);
    c.setAttribute('fill', color);
  }

  hide(): void {
    this.svg?.remove();
    this.svg = null;
    this.circle = null;
    this.key = '';
  }

  dispose(): void {
    this.hide();
  }

  private create(): void {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('aria-hidden', 'true');
    Object.assign(svg.style, {
      position: 'absolute',
      left: '0',
      top: '0',
      width: '100%',
      height: '100%',
      pointerEvents: 'none',
      overflow: 'visible',
      zIndex: '8',
    });
    const circle = document.createElementNS(SVG_NS, 'circle');
    circle.setAttribute('stroke-width', '3');
    circle.setAttribute('fill-opacity', '0.18');
    svg.append(circle);
    this.parent.appendChild(svg);
    this.svg = svg;
    this.circle = circle;
  }
}
