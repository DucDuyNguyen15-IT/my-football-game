import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { cpuEasyTeam, cpuHardTeam, starterLikeTeam, type MatchSetup } from '@pitch/sim';
import { MatchCanvas } from '../../game/MatchCanvas';
import { COLORS } from '../../game/render/colors';

/** Seed mới mỗi lần vào trận; trận vs máy chạy ở client nên seed không cần bí mật (ADR-0006). */
const newSeed = (): number => Math.floor(Math.random() * 2 ** 31);

/** `/play` — trận demo với đội hư cấu (tới GĐ6 mới có đội từ thẻ). `?difficulty=hard` để gặp máy Khó. */
export function PlayPage() {
  const [params] = useSearchParams();
  const hard = params.get('difficulty') === 'hard';
  const [seed] = useState(newSeed);
  const setup = useMemo<MatchSetup>(
    () => ({
      home: starterLikeTeam,
      away: hard ? cpuHardTeam : cpuEasyTeam,
      difficulty: hard ? 'hard' : 'easy',
      seed,
    }),
    [hard, seed],
  );

  return (
    <div style={{ position: 'fixed', inset: 0, background: COLORS.bgCss }}>
      <MatchCanvas setup={setup} />
      <nav
        style={{
          position: 'absolute',
          right: 12,
          top: 8,
          color: COLORS.text,
          font: '13px system-ui, sans-serif',
        }}
      >
        <Link to="/" style={{ color: 'inherit' }}>
          ← Về menu
        </Link>
      </nav>
      <p
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 8,
          margin: 0,
          textAlign: 'center',
          color: COLORS.text,
          font: '13px system-ui, sans-serif',
          opacity: 0.8,
          pointerEvents: 'none',
        }}
      >
        Mũi tên: di chuyển · E: chạy nhanh · S: chuyền / đổi người · A: chuyền bổng / xoạc · D: sút
        (giữ) / áp sát
      </p>
    </div>
  );
}
