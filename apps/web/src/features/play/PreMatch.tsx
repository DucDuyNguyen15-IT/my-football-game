/**
 * Trước trận (docs/design/screens/prematch*.html, versus.html): chọn độ khó (bước 1/2) → màn đối đầu
 * (bước 2/2) sau khi server dựng trận. Thưởng xu đọc từ GET /config/economy, số trận có thưởng từ /me.
 */
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import {
  computeOvr,
  STARTER_SLOTS,
  type Difficulty,
  type MatchRewardTable,
  type MatchTeamSetup,
  type StartedMatch,
} from '@pitch/shared';
import { useMe } from '../../api/auth';
import { useCardCatalog } from '../../api/cards';
import { useEconomy } from '../../api/player-cards';
import { useSquad } from '../../api/squad';
import { Topbar } from '../../app/AppLayout';
import { CardView } from '../../components/card/CardView';
import './prematch.css';

const fmt = (n: number) => n.toLocaleString('vi-VN');

const BackIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    aria-hidden="true"
  >
    <path d="M10 3L5 8l5 5" />
  </svg>
);
const WarnIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    aria-hidden="true"
  >
    <path d="M8 2l6.5 12h-13z" />
    <path d="M8 7v3M8 12v.5" />
  </svg>
);
const PlayIcon = () => (
  <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <path d="M4 2.5v11l9-5.5z" />
  </svg>
);

function Coin({ value, sm }: { value: number; sm?: boolean }) {
  return (
    <span className={`coin${sm ? ' coin--sm' : ''}`}>
      <span className="coin__icon" aria-hidden="true" />
      <span className="num">{fmt(value)}</span>
      <span className="sr-only"> xu</span>
    </span>
  );
}

const LEVELS: ReadonlyArray<{ value: Difficulty; label: string; desc: string }> = [
  {
    value: 'easy',
    label: 'Dễ',
    desc: 'Máy phản ứng chậm, chuyền và sút hay sai. Hợp để làm quen phím.',
  },
  {
    value: 'hard',
    label: 'Khó',
    desc: 'Máy phản ứng nhanh, pressing gắt, chuyền và sút chính xác hơn.',
  },
];
export const DIFFICULTY_LABEL: Record<Difficulty, string> = { easy: 'Dễ', hard: 'Khó' };

/** Bước 1/2 — chọn độ khó. */
export function PreMatch({ onContinue }: { onContinue: (d: Difficulty) => void }) {
  const me = useMe().data;
  const economy = useEconomy();
  const squad = useSquad().data;
  const [pick, setPick] = useState<Difficulty>('hard');
  const capReached = !!me && me.rewardedMatchesToday >= me.rewardedMatchesLimit;
  const left = me ? Math.max(0, me.rewardedMatchesLimit - me.rewardedMatchesToday) : null;

  return (
    <div className="pm-shell">
      <Topbar />
      <main className="pm" aria-labelledby="pm-title">
        <div className="pm__crumbs">
          <Link to="/" className="btn btn--ghost btn--sm">
            <BackIcon />
            Trang chủ
          </Link>
          <span className="label">Bước 1/2</span>
        </div>
        <h1 id="pm-title" className="h1 pm__title">
          Chọn độ khó
        </h1>
        {capReached && (
          <div className="banner" role="alert">
            <WarnIcon />
            <span>
              <b>Trận này không có thưởng.</b> Bạn đã đá đủ {me.rewardedMatchesLimit} trận có thưởng
              hôm nay — vẫn đá được. Làm mới lúc 00:00 (giờ Việt Nam).
            </span>
          </div>
        )}
        <div className="pm__options" role="radiogroup" aria-label="Độ khó">
          {LEVELS.map((lv) => (
            <LevelOption
              key={lv.value}
              label={lv.label}
              desc={lv.desc}
              on={pick === lv.value}
              reward={economy.data?.matchReward[lv.value]}
              noReward={capReached}
              onPick={() => setPick(lv.value)}
            />
          ))}
        </div>
        <div className="pm__foot">
          {left !== null && me && (
            <span className={capReached ? 'pm__cap' : undefined}>
              {capReached ? (
                <>
                  Trận có thưởng: {me.rewardedMatchesToday}/{me.rewardedMatchesLimit} đã dùng
                </>
              ) : (
                <>
                  Trận có thưởng còn <b className="num">{left}</b>/{me.rewardedMatchesLimit} hôm nay
                </>
              )}
            </span>
          )}
          <span className="pm__spacer" />
          {squad && (
            <span className="muted pm__team">
              Đội: {squad.formation} · OVR {squad.teamRating}
            </span>
          )}
          <button
            type="button"
            className="btn btn--primary btn--lg"
            autoFocus
            onClick={() => onContinue(pick)}
          >
            Tiếp tục
          </button>
        </div>
      </main>
    </div>
  );
}

function LevelOption({
  label,
  desc,
  on,
  reward,
  noReward,
  onPick,
}: {
  label: string;
  desc: string;
  on: boolean;
  reward: MatchRewardTable | undefined;
  noReward: boolean;
  onPick: () => void;
}) {
  const v = (n: number) => (noReward ? 0 : n);
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      className={`panel pm-opt${on ? ' is-on' : ''}`}
      onClick={onPick}
    >
      <span className="display pm-opt__title">{label}</span>
      <span className="muted pm-opt__desc">{desc}</span>
      {reward && (
        <>
          <span className="pm-opt__rewards">
            {(
              [
                ['Thắng', reward.win],
                ['Hòa', reward.draw],
                ['Thua', reward.loss],
              ] as const
            ).map(([t, n]) => (
              <span key={t} className="pm-opt__reward">
                <span className="label">{t}</span>
                <Coin value={v(n)} />
              </span>
            ))}
          </span>
          <span className="muted pm-opt__shootout">
            Luân lưu: thắng <Coin value={v(reward.shootout_win)} sm /> · thua{' '}
            <Coin value={v(reward.shootout_loss)} sm />
          </span>
        </>
      )}
    </button>
  );
}

/** OVR trung bình 7 người đá chính (chỉ số đã hiệu lực server gửi). */
function teamOvr(team: MatchTeamSetup): number {
  const starters = team.players.filter((p) =>
    (STARTER_SLOTS as readonly string[]).includes(p.slot),
  );
  if (starters.length === 0) return 0;
  return Math.round(
    starters.reduce((s, p) => s + computeOvr(p.position, p.stats), 0) / starters.length,
  );
}

/** Bước 2/2 — màn đối đầu sau khi server dựng trận. */
export function Versus({
  match,
  difficulty,
  onPlay,
  onBack,
}: {
  match: StartedMatch;
  difficulty: Difficulty;
  onPlay: () => void;
  onBack: () => void;
}) {
  const me = useMe().data;
  const economy = useEconomy().data;
  const playRef = useRef<HTMLButtonElement>(null);
  useEffect(() => playRef.current?.focus(), []);
  const win = economy?.matchReward[difficulty].win;
  return (
    <section className="vs" aria-labelledby="vs-title">
      <h1 id="vs-title" className="sr-only">
        Đối đầu: {me?.username ?? 'Bạn'} gặp Máy, mức {DIFFICULTY_LABEL[difficulty]}
      </h1>
      <div className="vs__sides">
        <TeamSide side="home" name={me?.username ?? 'Bạn'} sub="Nhà · bạn" team={match.home} />
        <TeamSide
          side="away"
          name="Máy"
          sub={`Khách · mức ${DIFFICULTY_LABEL[difficulty]}`}
          team={match.away}
        />
      </div>
      <svg className="vs__line" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <line x1="50" y1="0" x2="50" y2="100" vectorEffect="non-scaling-stroke" />
      </svg>
      <span className="vs__ring" aria-hidden="true" />
      <span className="display vs__mark" aria-hidden="true">
        VS
      </span>
      <div className="vs__back">
        <button type="button" className="btn btn--ghost btn--sm" onClick={onBack}>
          <BackIcon />
          Quay lại
        </button>
      </div>
      <div className="vs__foot">
        {!match.rewardEligible && (
          <div className="banner" role="alert">
            <WarnIcon />
            <span>
              <b>Trận này không có thưởng.</b> Đã đủ {me?.rewardedMatchesLimit ?? ''} trận có thưởng
              hôm nay — vẫn đá được.
            </span>
          </div>
        )}
        <button ref={playRef} type="button" className="btn btn--primary btn--xl" onClick={onPlay}>
          <PlayIcon />
          Vào trận
        </button>
        <span className="muted vs__meta">
          {match.rewardEligible && win !== undefined && (
            <>
              Thắng <Coin value={win} sm />
              {me && (
                <>
                  {' '}
                  · trận có thưởng {me.rewardedMatchesToday + 1}/{me.rewardedMatchesLimit}
                </>
              )}{' '}
              ·{' '}
            </>
          )}
          <button type="button" className="vs__link" onClick={onBack}>
            Đổi độ khó
          </button>
        </span>
      </div>
    </section>
  );
}

function TeamSide({
  side,
  name,
  sub,
  team,
}: {
  side: 'home' | 'away';
  name: string;
  sub: string;
  team: MatchTeamSetup;
}) {
  const catalog = useCardCatalog().data;
  const starters = STARTER_SLOTS.map((s) => team.players.find((p) => p.slot === s)).filter(
    (p) => p !== undefined,
  );
  return (
    <div className={`vs-side vs-side--${side}`}>
      <span className="label vs-side__sub">{sub}</span>
      <h2 className="display vs-side__name">
        <span className="vs-side__sw" aria-hidden="true" />
        {name}
      </h2>
      <div className="vs-side__ovr">
        <span className="label">OVR TB</span>
        <span className="display num vs-side__num">{teamOvr(team)}</span>
        <span className="muted">{team.formation}</span>
      </div>
      <ul className="vs-side__cards" aria-label={`Đội hình ${name}`}>
        {starters.map((p) => {
          const card = p.cardId ? catalog?.get(p.cardId) : undefined;
          return (
            <li key={p.slot}>
              {card ? (
                <CardView card={card} size="xs" level={p.level ?? 0} stats={p.stats} />
              ) : (
                <span className="vs-side__blank">{p.position}</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
