/**
 * Vòng đếm ngược trên đầu cầu thủ (thủ môn đang ôm bóng, người đá phạt / phạt đền của đội người
 * chơi): vòng tròn chỉ có viền, ruột trong suốt, số giây ở giữa. Viền vàng chuyển dần sang đen theo
 * chiều kim đồng hồ từ đỉnh 12 giờ; hết giờ thì cả vòng đen. Chỉ vẽ — hạn chót do sim đặt.
 *
 * Vẽ bằng SVG đè lên canvas (không phải texture trong cảnh 3D): renderer chiếu điểm trên đầu cầu thủ
 * ra màn hình mỗi khung hình rồi đặt SVG vào đó. SVG là vector nên viền tròn và chữ luôn nét ở mọi
 * DPR / mức thu phóng, không bị mờ do lọc texture, bloom hay giảm độ phân giải ở mức đồ hoạ Thấp.
 */
import { COLORS } from '../render/colors';
import { COUNTDOWN_ARC_STEPS, countdownArcStep, type CountdownRing } from '../render/view';

const SVG_NS = 'http://www.w3.org/2000/svg';
/** Hệ toạ độ của SVG: hộp 100 × 100, vòng bán kính R, nét dày STROKE (tỉ lệ nét/bán kính ≈ 0,13). */
const BOX = 100;
const R = 42;
const STROKE = 5.5;

function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

const circle = (stroke: string, width: number) =>
  svgEl('circle', { cx: BOX / 2, cy: BOX / 2, r: R, fill: 'none', stroke, 'stroke-width': width });

export class CountdownRingView {
  private svg: SVGSVGElement | null = null;
  private arc: SVGCircleElement | null = null;
  private text: SVGTextElement | null = null;
  /** Số giây, nấc viền và kích thước đang hiện: chỉ ghi DOM khi đổi. */
  private seconds = -1;
  private step = -1;
  private size = -1;

  constructor(private readonly parent: HTMLElement) {}

  /** Hiện vòng, tâm ở (`x`, `y`) px tính từ góc trên-trái của khung trận, đường kính `size` px. */
  show(ring: CountdownRing, x: number, y: number, size: number): void {
    const svg = this.svg ?? this.create();
    const px = Math.round(size);
    if (px !== this.size) {
      this.size = px;
      svg.style.width = svg.style.height = `${px}px`;
    }
    // Toạ độ nguyên px để nét vẽ không bị nhoè nửa điểm ảnh.
    svg.style.transform = `translate(${Math.round(x - px / 2)}px, ${Math.round(y - px / 2)}px)`;
    if (ring.seconds !== this.seconds && this.text) {
      this.seconds = ring.seconds;
      this.text.textContent = String(ring.seconds);
    }
    const step = countdownArcStep(ring.elapsed);
    if (step !== this.step && this.arc) {
      this.step = step;
      // pathLength = 1: phần đầu của nét (từ 12 giờ, theo chiều kim đồng hồ) dài đúng phần đã trôi.
      this.arc.setAttribute('stroke-dasharray', `${step / COUNTDOWN_ARC_STEPS} 1`);
      this.arc.style.visibility = step > 0 ? 'visible' : 'hidden';
    }
  }

  /** Ẩn vòng: gỡ SVG khỏi trang (lần sau `show` tạo lại), không giữ tài nguyên nào. */
  hide(): void {
    this.svg?.remove();
    this.svg = null;
    this.arc = null;
    this.text = null;
    this.seconds = this.step = this.size = -1;
  }

  dispose(): void {
    this.hide();
  }

  private create(): SVGSVGElement {
    const svg = svgEl('svg', { viewBox: `0 0 ${BOX} ${BOX}`, 'aria-hidden': 'true' });
    Object.assign(svg.style, {
      position: 'absolute',
      left: '0',
      top: '0',
      pointerEvents: 'none',
      overflow: 'visible',
      willChange: 'transform',
      zIndex: '8',
    });
    // Mép sáng mảnh hai bên viền để phần đen vẫn tách khỏi nền tối (khán đài, cỏ ban đêm).
    const edge = circle('rgb(250 248 243 / 0.5)', STROKE + 1.6);
    const gold = circle(COLORS.countdownGold, STROKE);
    const arc = circle('#000000', STROKE);
    arc.setAttribute('pathLength', '1');
    // Nét của <circle> bắt đầu ở 3 giờ, chạy theo chiều kim đồng hồ: xoay −90° để bắt đầu từ 12 giờ.
    arc.setAttribute('transform', `rotate(-90 ${BOX / 2} ${BOX / 2})`);
    const text = svgEl('text', {
      x: BOX / 2,
      y: BOX / 2 + 1,
      'text-anchor': 'middle',
      'dominant-baseline': 'central',
      'font-size': 46,
      'font-weight': 700,
      fill: COLORS.text,
      stroke: 'rgb(0 0 0 / 0.7)',
      'stroke-width': 5,
      'stroke-linejoin': 'round',
      'paint-order': 'stroke',
    });
    text.style.fontFamily = '"Space Grotesk", "Arial Narrow", sans-serif';
    text.style.fontVariantNumeric = 'tabular-nums';
    svg.append(edge, gold, arc, text);
    this.parent.appendChild(svg);
    this.svg = svg;
    this.arc = arc;
    this.text = text;
    return svg;
  }
}
