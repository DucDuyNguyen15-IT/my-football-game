/**
 * Sân nhìn từ trên xuống bằng vạch phấn (DESIGN.md "vạch phấn"): viền, vạch giữa, vòng giữa sân,
 * vòng cấm, chấm phạt đền. Co giãn theo khung cha (viewBox 100×140, giữ nguyên tỉ lệ nét).
 */
export function ChalkPitch({ grass = true }: { grass?: boolean }) {
  return (
    <svg
      className="chalk-pitch"
      viewBox="0 0 100 140"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {grass &&
        Array.from({ length: 10 }, (_, i) => (
          <rect
            key={i}
            x={0}
            y={i * 14}
            width={100}
            height={14}
            fill={i % 2 ? 'var(--c-pitch-b)' : 'var(--c-pitch-a)'}
          />
        ))}
      <g
        fill="none"
        stroke="var(--c-chalk)"
        strokeOpacity={0.55}
        strokeWidth={1.4}
        vectorEffect="non-scaling-stroke"
      >
        <rect x={4} y={4} width={92} height={132} vectorEffect="non-scaling-stroke" />
        <line x1={4} y1={70} x2={96} y2={70} vectorEffect="non-scaling-stroke" />
        <ellipse cx={50} cy={70} rx={12} ry={12} vectorEffect="non-scaling-stroke" />
        <rect x={24} y={4} width={52} height={20} vectorEffect="non-scaling-stroke" />
        <rect x={37} y={4} width={26} height={8} vectorEffect="non-scaling-stroke" />
        <rect x={24} y={116} width={52} height={20} vectorEffect="non-scaling-stroke" />
        <rect x={37} y={128} width={26} height={8} vectorEffect="non-scaling-stroke" />
      </g>
      <g fill="var(--c-chalk)" fillOpacity={0.6}>
        <circle cx={50} cy={70} r={1.2} />
        <circle cx={50} cy={17} r={1} />
        <circle cx={50} cy={123} r={1} />
      </g>
    </svg>
  );
}
