import { memo, useId } from 'react';
import { avatarSpec } from '@pitch/shared';

const r1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Ảnh đại diện vector sinh từ `avatar_seed` (DESIGN.md §4). Áo đấu lấy màu `--base` của độ hiếm
 * từ lớp `.r-<rarity>` bao ngoài. Cùng seed → cùng SVG.
 */
export const Avatar = memo(function Avatar({ seed }: { seed: string }) {
  const uid = useId().replace(/:/g, '');
  const {
    faceWidth: fw,
    skin,
    hair,
    hairStyle,
    beard,
    browY: rawBrowY,
    eyeGap,
    browTilt,
    mouthStyle,
    jawRatio,
  } = avatarSpec(seed);

  const browY = r1(rawBrowY + 1);
  const topW = r1(fw * 0.74);
  const jw = r1(fw * jawRatio);
  const jawX = r1(jw * 0.78);
  const cw = r1(jw * 0.36);
  const nw = r1(fw * 0.56);
  const nwBase = r1(fw * 0.68);

  const headPath = [
    `M 50 15.5`,
    `C ${r1(50 + topW)} 15.5 ${r1(50 + fw)} 22.5 ${r1(50 + fw)} 36`,
    `C ${r1(50 + fw)} 45.5 ${r1(50 + jw)} 52.5 ${r1(50 + jawX)} 57.8`,
    `Q ${r1(50 + cw)} 64.5 50 64.5`,
    `Q ${r1(50 - cw)} 64.5 ${r1(50 - jawX)} 57.8`,
    `C ${r1(50 - jw)} 52.5 ${r1(50 - fw)} 45.5 ${r1(50 - fw)} 36`,
    `C ${r1(50 - fw)} 22.5 ${r1(50 - topW)} 15.5 50 15.5 Z`,
  ].join(' ');

  const hairEl = [
    /* 0: Buzz cut fade / Đầu đinh cạo sát thể thao */
    <g key="h0">
      <path
        d={`M ${r1(50 - fw + 0.2)} 34.5 C ${r1(50 - fw - 0.1)} 21.5 ${r1(50 - topW)} 14.8 50 14.8 C ${r1(50 + topW)} 14.8 ${r1(50 + fw + 0.1)} 21.5 ${r1(50 + fw - 0.2)} 34.5 L ${r1(50 + fw - 1.5)} 33.5 C ${r1(50 + fw - 1.9)} 28.5 ${r1(50 + fw - 2.3)} 25.4 ${r1(50 + fw - 2.6)} 24.2 Q 50 22.3 ${r1(50 - fw + 2.6)} 24.2 C ${r1(50 - fw + 2.3)} 25.4 ${r1(50 - fw + 1.9)} 28.5 ${r1(50 - fw + 1.5)} 33.5 Z`}
        fill={`url(#${uid}-buzz)`}
      />
    </g>,
    /* 1: Crew cut / Tóc ngắn gọn cổ điển */
    <g key="h1">
      <path
        d={`M ${r1(50 - fw - 0.6)} 37 C ${r1(50 - fw - 1.2)} 20 ${r1(50 - topW - 1)} 12.2 50 12.2 C ${r1(50 + topW + 1)} 12.2 ${r1(50 + fw + 1.2)} 20 ${r1(50 + fw + 0.6)} 37 L ${r1(50 + fw - 1.4)} 37 L ${r1(50 + fw - 2)} 26.5 Q 50 23.8 ${r1(50 - fw + 2)} 26.5 L ${r1(50 - fw + 1.4)} 37 Z`}
        fill={hair}
      />
      <path
        d={`M ${r1(50 - topW * 0.68)} 16.5 Q 50 13.8 ${r1(50 + topW * 0.68)} 16.5`}
        fill="none"
        stroke="rgb(255 255 255 / 0.19)"
        strokeWidth={1.8}
        strokeLinecap="round"
      />
    </g>,
    /* 2: Side-swept quiff / Tóc vuốt lệch phồng */
    <g key="h2">
      <path
        d={`M ${r1(50 - fw - 0.6)} 36.5 C ${r1(50 - fw - 1)} 20 ${r1(50 - topW)} 12.8 47 12.2 C 53 10.2 ${r1(50 + topW + 3)} 11.5 ${r1(50 + fw + 1)} 22 C ${r1(50 + fw + 1.2)} 28 ${r1(50 + fw + 0.8)} 33 ${r1(50 + fw + 0.6)} 36.5 L ${r1(50 + fw - 1.4)} 36.5 L ${r1(50 + fw - 2)} 27.2 C 55 26.5 46 22.8 ${r1(50 - fw + 3.8)} 24.2 L ${r1(50 - fw + 1.8)} 29 L ${r1(50 - fw + 1.4)} 36.5 Z`}
        fill={hair}
      />
      <path
        d="M 43 17.5 Q 52 13 61 17"
        fill="none"
        stroke="rgb(255 255 255 / 0.19)"
        strokeWidth={2}
        strokeLinecap="round"
      />
    </g>,
    /* 3: Textured French crop / Tóc mái tỉa layer */
    <g key="h3">
      <path
        d={`M ${r1(50 - fw - 0.6)} 36 C ${r1(50 - fw - 1.2)} 19.5 ${r1(50 - topW - 1.5)} 12 50 12 C ${r1(50 + topW + 1.5)} 12 ${r1(50 + fw + 1.2)} 19.5 ${r1(50 + fw + 0.6)} 36 L ${r1(50 + fw - 1.3)} 36 L ${r1(50 + fw - 1.6)} 27.8 L 55 28.6 L 53.5 26.8 L 49.5 28.8 L 47.8 26.8 L ${r1(50 - fw + 1.6)} 27.8 L ${r1(50 - fw + 1.3)} 36 Z`}
        fill={hair}
      />
      <path
        d="M 41 17 Q 50 14.2 59 17"
        fill="none"
        stroke="rgb(255 255 255 / 0.18)"
        strokeWidth={1.8}
        strokeLinecap="round"
      />
    </g>,
    /* 4: Faux-hawk / Tóc dựng Mohawk thể thao */
    <g key="h4">
      <path
        d={`M ${r1(50 - fw - 0.5)} 36.5 C ${r1(50 - fw - 0.8)} 23 ${r1(50 - topW)} 16.5 43.5 14.2 L 46.5 10.8 L 50 9.5 L 53.5 10.8 L 56.5 14.2 C ${r1(50 + topW)} 16.5 ${r1(50 + fw + 0.8)} 23 ${r1(50 + fw + 0.5)} 36.5 L ${r1(50 + fw - 1.4)} 36.5 L ${r1(50 + fw - 2.2)} 26.8 Q 50 23.5 ${r1(50 - fw + 2.2)} 26.8 L ${r1(50 - fw + 1.4)} 36.5 Z`}
        fill={hair}
      />
      <path
        d="M 46.5 16 L 50 12.5 L 53.5 16"
        fill="none"
        stroke="rgb(255 255 255 / 0.19)"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </g>,
    /* 5: Curly fade / Tóc xoăn ôm gọn thể thao */
    <g key="h5">
      <path
        d={`M ${r1(50 - fw - 0.5)} 36 C ${r1(50 - fw - 1.4)} 29.5 ${r1(50 - fw - 1.5)} 24 ${r1(50 - fw - 0.7)} 20.5 Q ${r1(50 - fw - 1.1)} 15.5 40.5 13.6 Q 45 9.8 50 11 Q 55 9.8 59.5 13.6 Q ${r1(50 + fw + 1.1)} 15.5 ${r1(50 + fw + 0.7)} 20.5 C ${r1(50 + fw + 1.5)} 24 ${r1(50 + fw + 1.4)} 29.5 ${r1(50 + fw + 0.5)} 36 L ${r1(50 + fw - 1.3)} 36 L ${r1(50 + fw - 1.9)} 27.6 Q 57.5 25.4 54 27 Q 50 24.8 46 27 Q 42.5 25.4 ${r1(50 - fw + 1.9)} 27.6 L ${r1(50 - fw + 1.3)} 36 Z`}
        fill={hair}
      />
      <path
        d="M 40.5 18.8 Q 43 16 45.5 18.8 M 47.5 16.4 Q 50 14 52.5 16.4 M 54.5 18.8 Q 57 16 59.5 18.8"
        fill="none"
        stroke="rgb(255 255 255 / 0.18)"
        strokeWidth={1.5}
        strokeLinecap="round"
      />
    </g>,
    /* 6: Curtain flow / Tóc rẽ ngôi lãng tử */
    <g key="h6">
      <path
        d={`M ${r1(50 - fw - 1)} 38.5 C ${r1(50 - fw - 1.9)} 22 ${r1(50 - topW - 1.8)} 11.8 50 12.8 C ${r1(50 + topW + 1.8)} 11.8 ${r1(50 + fw + 1.9)} 22 ${r1(50 + fw + 1)} 38.5 L ${r1(50 + fw - 1.2)} 37.5 L ${r1(50 + fw - 1.6)} 30.5 C 59 28.5 52.5 25.5 50 22.5 C 47.5 25.5 41 28.5 ${r1(50 - fw + 1.6)} 30.5 L ${r1(50 - fw + 1.2)} 37.5 Z`}
        fill={hair}
      />
      <path
        d="M 39 19 Q 45 14.5 49 16.5 M 51 16.5 Q 55 14.5 61 19"
        fill="none"
        stroke="rgb(255 255 255 / 0.18)"
        strokeWidth={1.6}
        strokeLinecap="round"
      />
    </g>,
    /* 7: Top knot & slicked back / Tóc vuốt ngược búi cao */
    <g key="h7">
      <circle cx={50} cy={10} r={4.1} fill={hair} />
      <path
        d={`M ${r1(50 - fw - 0.7)} 37 C ${r1(50 - fw - 1.1)} 20.5 ${r1(50 - topW)} 12.6 50 12.6 C ${r1(50 + topW)} 12.6 ${r1(50 + fw + 1.1)} 20.5 ${r1(50 + fw + 0.7)} 37 L ${r1(50 + fw - 1.4)} 37 L ${r1(50 + fw - 2)} 25.4 Q 50 21.6 ${r1(50 - fw + 2)} 25.4 L ${r1(50 - fw + 1.4)} 37 Z`}
        fill={hair}
      />
      <path
        d="M 46.2 12.8 Q 50 14.2 53.8 12.8"
        fill="none"
        stroke="rgb(0 0 0 / 0.42)"
        strokeWidth={1.4}
        strokeLinecap="round"
      />
      <path
        d="M 46.8 12.2 Q 50 13.4 53.2 12.2"
        fill="none"
        stroke="rgb(255 248 230 / 0.24)"
        strokeWidth={0.7}
        strokeLinecap="round"
      />
      <path
        d="M 42.5 17 Q 50 14.2 57.5 17"
        fill="none"
        stroke="rgb(255 255 255 / 0.18)"
        strokeWidth={1.6}
        strokeLinecap="round"
      />
    </g>,
  ][hairStyle];

  const beardEl = [
    null,
    /* 1: Râu quai nón gọn ôm sát cằm */
    <g key="b1" fill={hair} opacity={0.88}>
      <path
        d={`M ${r1(50 - fw + 0.2)} 44 C ${r1(50 - fw + 0.2)} 48 ${r1(50 - jw - 0.2)} 53 ${r1(50 - jawX - 0.2)} 58 Q ${r1(50 - cw)} 65 50 65 Q ${r1(50 + cw)} 65 ${r1(50 + jawX + 0.2)} 58 C ${r1(50 + jw + 0.2)} 53 ${r1(50 + fw - 0.2)} 48 ${r1(50 + fw - 0.2)} 44 L ${r1(50 + fw - 2.2)} 44 C ${r1(50 + fw - 2.5)} 50 59.5 54.5 56.8 56.2 Q 50 60.8 43.2 56.2 C 40.5 54.5 ${r1(50 - fw + 2.5)} 50 ${r1(50 - fw + 2.2)} 44 Z`}
      />
      <path d="M 42.8 54.4 Q 46 51.2 50 52.2 Q 54 51.2 57.2 54.4 Q 53.5 53.6 50 53.8 Q 46.5 53.6 42.8 54.4 Z" />
    </g>,
    /* 2: Ria mép thể thao & chòm cằm */
    <g key="b2" fill={hair} opacity={0.9}>
      <path d="M 43.2 54.2 Q 46.5 51.2 50 52.1 Q 53.5 51.2 56.8 54.2 Q 53.5 53.4 50 53.6 Q 46.5 53.4 43.2 54.2 Z" />
      <path d="M 48.2 59.2 Q 50 58.8 51.8 59.2 L 50.9 62.2 Q 50 62.8 49.1 62.2 Z" />
    </g>,
    /* 3: Goatee cằm & ria */
    <g key="b3" fill={hair} opacity={0.88}>
      <path d="M 43.2 54.2 Q 46.5 51.2 50 52.1 Q 53.5 51.2 56.8 54.2 Q 53.5 53.4 50 53.6 Q 46.5 53.4 43.2 54.2 Z" />
      <path d="M 44.2 58.6 Q 50 60.8 55.8 58.6 L 55.2 61.8 Q 53 64.7 50 64.7 Q 47 64.7 44.8 61.8 Z" />
    </g>,
    /* 4: Quai hàm mảnh (chinstrap) */
    <g key="b4" fill={hair} opacity={0.74}>
      <path
        d={`M ${r1(50 - fw + 0.3)} 45 C ${r1(50 - fw + 0.3)} 49 ${r1(50 - jw)} 53.5 ${r1(50 - jawX)} 58.2 Q ${r1(50 - cw)} 64.8 50 64.8 Q ${r1(50 + cw)} 64.8 ${r1(50 + jawX)} 58.2 C ${r1(50 + jw)} 53.5 ${r1(50 + fw - 0.3)} 49 ${r1(50 + fw - 0.3)} 45 L ${r1(50 + fw - 1.6)} 45 C ${r1(50 + fw - 1.8)} 49.5 ${r1(50 + jw - 1.4)} 53.5 ${r1(50 + jawX - 1.2)} 57.4 Q ${r1(50 + cw * 0.8)} 62.5 50 62.5 Q ${r1(50 - cw * 0.8)} 62.5 ${r1(50 - jawX + 1.2)} 57.4 C ${r1(50 - jw + 1.4)} 53.5 ${r1(50 - fw + 1.8)} 49.5 ${r1(50 - fw + 1.6)} 45 Z`}
      />
    </g>,
  ][beard];

  const mouthEl = [
    /* 0: Mỉm cười nhẹ */
    <g key="m0">
      <path
        d="M 45.8 55.3 Q 50 57.3 54.2 55.3"
        fill="none"
        stroke="rgb(24 16 12 / 0.62)"
        strokeWidth={1.45}
        strokeLinecap="round"
      />
      <path
        d="M 47.8 57.8 Q 50 58.5 52.2 57.8"
        fill="none"
        stroke="rgb(0 0 0 / 0.18)"
        strokeWidth={1.1}
        strokeLinecap="round"
      />
    </g>,
    /* 1: Điềm tĩnh */
    <g key="m1">
      <path
        d="M 46.2 55.8 Q 50 56.4 53.8 55.8"
        fill="none"
        stroke="rgb(24 16 12 / 0.62)"
        strokeWidth={1.45}
        strokeLinecap="round"
      />
      <path
        d="M 47.8 57.9 Q 50 58.5 52.2 57.9"
        fill="none"
        stroke="rgb(0 0 0 / 0.18)"
        strokeWidth={1.1}
        strokeLinecap="round"
      />
    </g>,
    /* 2: Cười tự tin */
    <g key="m2">
      <path
        d="M 45.4 55 Q 50 55.8 54.6 55 Q 50 58.6 45.4 55 Z"
        fill="#faf8f3"
        stroke="rgb(24 16 12 / 0.58)"
        strokeWidth={1.1}
        strokeLinejoin="round"
      />
    </g>,
  ][mouthStyle];

  const lx = r1(50 - eyeGap);
  const rx = r1(50 + eyeGap);
  const browOuterY = r1(browY - browTilt * 0.45);
  const browInnerY = r1(browY + browTilt * 0.55);

  const kitPath = `M 6 100 C 8 79 21 70 ${r1(50 - nwBase)} 66 L 50 79 L ${r1(50 + nwBase)} 66 C 79 70 92 79 94 100 Z`;

  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMax meet"
      aria-hidden="true"
      className="avatar"
    >
      <defs>
        <clipPath id={`${uid}-head`}>
          <path d={headPath} />
        </clipPath>
        <linearGradient id={`${uid}-face-shade`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.06" />
          <stop offset="56%" stopColor="#000000" stopOpacity="0" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0.14" />
        </linearGradient>
        <linearGradient id={`${uid}-kit-shade`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.1" />
          <stop offset="46%" stopColor="#000000" stopOpacity="0" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0.28" />
        </linearGradient>
        <linearGradient id={`${uid}-buzz`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={hair} stopOpacity="0.76" />
          <stop offset="68%" stopColor={hair} stopOpacity="0.58" />
          <stop offset="100%" stopColor={hair} stopOpacity="0.22" />
        </linearGradient>
      </defs>

      {/* Cổ & bóng dưới cằm */}
      <path
        d={`M ${r1(50 - nw)} 55 L ${r1(50 - nwBase)} 74 L ${r1(50 + nwBase)} 74 L ${r1(50 + nw)} 55 Z`}
        fill={skin}
      />
      <path
        d={`M ${r1(50 - nw - 0.5)} 57 Q 50 69.5 ${r1(50 + nw + 0.5)} 57 L ${r1(50 + nw + 0.8)} 63.5 Q 50 71 ${r1(50 - nw - 0.8)} 63.5 Z`}
        fill="rgb(0 0 0 / 0.25)"
      />

      {/* Áo đấu theo màu --base của độ hiếm + gradient khối & cổ V */}
      <path d={kitPath} style={{ fill: 'var(--base)' }} />
      <path d={kitPath} fill={`url(#${uid}-kit-shade)`} />
      <path
        d={`M 6 100 C 8 79 21 70 ${r1(50 - nwBase)} 66 L 33 100 Z M 94 100 C 92 79 79 70 ${r1(50 + nwBase)} 66 L 67 100 Z`}
        fill="rgb(0 0 0 / 0.14)"
      />
      <path
        d={`M 15 98 C 18 82 27 74 ${r1(50 - nwBase - 2)} 69 M 85 98 C 82 82 73 74 ${r1(50 + nwBase + 2)} 69`}
        fill="none"
        stroke="rgb(255 255 255 / 0.22)"
        strokeWidth={1.6}
        strokeLinecap="round"
      />
      <path
        d={`M ${r1(50 - nwBase - 0.8)} 66 L 50 79.8 L ${r1(50 + nwBase + 0.8)} 66`}
        fill="none"
        stroke="rgb(0 0 0 / 0.42)"
        strokeWidth={3.2}
        strokeLinejoin="round"
      />
      <path
        d={`M ${r1(50 - nwBase - 0.8)} 66 L 50 79.8 L ${r1(50 + nwBase + 0.8)} 66`}
        fill="none"
        stroke="rgb(255 248 230 / 0.44)"
        strokeWidth={1.2}
        strokeLinejoin="round"
      />

      {/* Tai cân xứng 2 bên */}
      <ellipse cx={r1(50 - fw - 0.4)} cy={41.8} rx={2.8} ry={4.8} fill={skin} />
      <ellipse cx={r1(50 + fw + 0.4)} cy={41.8} rx={2.8} ry={4.8} fill={skin} />
      <path
        d={`M ${r1(50 - fw - 0.8)} 39.8 Q ${r1(50 - fw - 1.8)} 41.8 ${r1(50 - fw - 0.8)} 43.8 M ${r1(50 + fw + 0.8)} 39.8 Q ${r1(50 + fw + 1.8)} 41.8 ${r1(50 + fw + 0.8)} 43.8`}
        fill="none"
        stroke="rgb(0 0 0 / 0.22)"
        strokeWidth={1}
        strokeLinecap="round"
      />

      {/* Khuôn mặt & khối sáng tối cắt gọn trong headPath */}
      <path d={headPath} fill={skin} />
      <g clipPath={`url(#${uid}-head)`}>
        <path d={headPath} fill={`url(#${uid}-face-shade)`} />
        <path
          d={`M ${r1(50 - jawX)} 57.5 Q 50 64.2 ${r1(50 + jawX)} 57.5 Q 50 61.8 ${r1(50 - jawX)} 57.5 Z`}
          fill="rgb(0 0 0 / 0.08)"
        />
      </g>
      <path d={headPath} fill="none" stroke="rgb(0 0 0 / 0.18)" strokeWidth={0.65} />

      {/* Mắt (tròng trắng dịu + con ngươi + mí trên + điểm sáng) */}
      <ellipse cx={lx} cy={41.8} rx={3.1} ry={1.85} fill="#f7f4ef" opacity={0.92} />
      <ellipse cx={rx} cy={41.8} rx={3.1} ry={1.85} fill="#f7f4ef" opacity={0.92} />
      <circle cx={lx} cy={41.8} r={1.65} fill="#181412" />
      <circle cx={rx} cy={41.8} r={1.65} fill="#181412" />
      <circle cx={r1(lx - 0.5)} cy={41.2} r={0.55} fill="#ffffff" />
      <circle cx={r1(rx - 0.5)} cy={41.2} r={0.55} fill="#ffffff" />
      <path
        d={`M ${r1(lx - 3.3)} 41.7 Q ${lx} 39.4 ${r1(lx + 3.3)} 41.7 M ${r1(rx - 3.3)} 41.7 Q ${rx} 39.4 ${r1(rx + 3.3)} 41.7`}
        fill="none"
        stroke="#181310"
        strokeWidth={1.15}
        strokeLinecap="round"
      />

      {/* Chân mày cân xứng */}
      <path
        d={`M ${r1(lx - 4)} ${browOuterY} Q ${lx} ${r1(browY - 1.1)} ${r1(lx + 3.8)} ${browInnerY}`}
        fill="none"
        stroke={hair}
        strokeWidth={2.1}
        strokeLinecap="round"
      />
      <path
        d={`M ${r1(rx - 3.8)} ${browInnerY} Q ${rx} ${r1(browY - 1.1)} ${r1(rx + 4)} ${browOuterY}`}
        fill="none"
        stroke={hair}
        strokeWidth={2.1}
        strokeLinecap="round"
      />

      {/* Sống mũi & đầu mũi có khối mềm */}
      <path
        d="M 49.6 42.4 Q 48.7 46.5 48.3 49 Q 49.5 49.7 50.3 49.1 Q 50.2 46 50.3 42.4 Z"
        fill="rgb(0 0 0 / 0.09)"
      />
      <path
        d="M 47.9 49.4 Q 50 50.7 52.1 49.4"
        fill="none"
        stroke="rgb(24 16 12 / 0.34)"
        strokeWidth={1.15}
        strokeLinecap="round"
      />

      {/* Miệng & Râu */}
      {mouthEl}
      {beardEl}

      {/* Tóc ôm sát hộp sọ */}
      {hairEl}
    </svg>
  );
});
