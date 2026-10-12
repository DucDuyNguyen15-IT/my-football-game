/** Màu cho Phaser, lấy từ bản JSON của design tokens (DESIGN.md §3) để không chép tay mã màu. */
import tokens from '../../../../../docs/design/design-tokens.json';

const hex = (css: string): number => Number.parseInt(css.slice(1), 16);

export const COLORS = {
  bg: hex(tokens.color.bg),
  bgCss: tokens.color.bg,
  text: tokens.color.text.default,
  accent: hex(tokens.color.accent.default),
  pitchA: hex(tokens.color.pitch.a),
  pitchB: hex(tokens.color.pitch.b),
  pitchLine: hex(tokens.color.pitch.line),
  team: { home: hex(tokens.color.team.home), away: hex(tokens.color.team.away) },
  /** Chữ số áo: màu mực tối trên nền màu đội. */
  shirtInk: tokens.color.accent.ink,
} as const;
