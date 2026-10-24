import { memo } from 'react';
import { avatarSpec } from '@pitch/shared';

/**
 * Ảnh đại diện vector sinh từ `avatar_seed` (DESIGN.md §4). Áo đấu lấy màu `--base` của độ hiếm
 * từ lớp `.r-<rarity>` bao ngoài. Cùng seed → cùng SVG.
 */
export const Avatar = memo(function Avatar({ seed }: { seed: string }) {
  const { faceWidth: fw, skin, hair, hairStyle, beard, browY, eyeGap } = avatarSpec(seed);
  const hairEl = [
    null,
    <path
      key="h"
      d={`M${50 - fw} 40 Q50 14 ${50 + fw} 40 Q${50 + fw} 30 50 25 Q${50 - fw} 30 ${50 - fw} 40Z`}
      fill={hair}
    />,
    <path
      key="h"
      d={`M${50 - fw - 1} 44 Q${47 - fw} 18 50 18 Q${53 + fw} 18 ${51 + fw} 44 L${48 + fw} 34 Q50 28 ${52 - fw} 34Z`}
      fill={hair}
    />,
    <rect key="h" x={50 - fw} y={21} width={fw * 2} height={10} rx={4} fill={hair} />,
    <path key="h" d="M44 26 Q50 12 56 26 L54 31 Q50 27 46 31Z" fill={hair} />,
    <g key="h" fill={hair}>
      {Array.from({ length: 9 }, (_, i) => (
        <circle key={i} cx={50 - fw + 2 + (i * (fw * 2 - 4)) / 8} cy={26 + (i % 2) * 2} r={5} />
      ))}
    </g>,
    <path
      key="h"
      d={`M${50 - fw - 2} 52 Q${46 - fw} 16 50 17 Q${54 + fw} 16 ${52 + fw} 52 L${48 + fw} 50 L${48 + fw} 36 Q50 30 ${52 - fw} 36 L${52 - fw} 50Z`}
      fill={hair}
    />,
  ][hairStyle];
  const beardEl = [
    null,
    <path
      key="b"
      d={`M${52 - fw} 50 Q50 70 ${48 + fw} 50 Q${46 + fw} 62 50 63 Q${54 - fw} 62 ${52 - fw} 50Z`}
      fill={hair}
      opacity={0.85}
    />,
    <path key="b" d="M44 57 Q50 54 56 57 L55 59 Q50 57 45 59Z" fill={hair} />,
    <path key="b" d="M46 60 Q50 66 54 60 L53 64 Q50 67 47 64Z" fill={hair} />,
  ][beard];
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" className="avatar">
      <path d="M14 100 Q16 74 38 70 L62 70 Q84 74 86 100Z" style={{ fill: 'var(--base)' }} />
      <path d="M38 70 L50 82 L62 70" fill="none" stroke="rgb(0 0 0 / .35)" strokeWidth={2.5} />
      <rect x={43} y={58} width={14} height={14} fill={skin} />
      <ellipse cx={50} cy={44} rx={fw} ry={fw + 3} fill={skin} />
      <ellipse cx={50 - fw} cy={46} rx={2.5} ry={4} fill={skin} />
      <ellipse cx={50 + fw} cy={46} rx={2.5} ry={4} fill={skin} />
      {hairEl}
      <rect x={50 - eyeGap - 4} y={browY} width={7} height={1.8} rx={0.9} fill={hair} />
      <rect x={50 + eyeGap - 3} y={browY} width={7} height={1.8} rx={0.9} fill={hair} />
      <circle cx={50 - eyeGap} cy={47} r={1.8} fill="#1a1a1a" />
      <circle cx={50 + eyeGap} cy={47} r={1.8} fill="#1a1a1a" />
      <path d="M48 52 Q50 54 52 52" fill="none" stroke="rgb(0 0 0 / .3)" strokeWidth={1.2} />
      <path
        d="M45.5 58 Q50 60.5 54.5 58"
        fill="none"
        stroke="rgb(0 0 0 / .45)"
        strokeWidth={1.5}
        strokeLinecap="round"
      />
      {beardEl}
    </svg>
  );
});
