/**
 * Các màn của luồng trận (docs/design/screens/match*.html, pause.html, result*.html): HUD phụ (gợi ý
 * phím, nghỉ giữa hiệp), menu tạm dừng, kết quả.
 */
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Link } from 'react-router';
import { HALF_TIME_MAX_TICKS, TICK_RATE } from '@pitch/sim';
import type { Difficulty, MissionProgress, Position, SquadSlot } from '@pitch/shared';
import type { GraphicsSettings } from '../../game/bridge';
import { Avatar } from '../../components/card/Avatar';
import { positionName } from '../../components/card/rarity';
import { formatNumber, type TranslationKey } from '../../i18n/i18n';
import { useI18n } from '../../i18n/I18nContext';
import { DailyMissionsPanel } from '../missions/DailyMissionsPanel';
import {
  GRAPHICS_TOGGLES,
  TIMES_OF_DAY,
  resolveQuality,
  toggleGraphics,
} from '../../game/render/quality';
import {
  canSwap,
  cardLabel,
  matchOutcome,
  shootoutOutcome,
  shootoutScore,
  staminaLevel,
  teamLabel,
  type HudSnapshot,
  type SubCardMeta,
  type SubOptions,
} from './hud';

type KeySpec = { raw: string } | { k: TranslationKey };
type ControlRow = readonly [KeySpec, TranslationKey, TranslationKey | null];

const CONTROLS_BASIC: readonly ControlRow[] = [
  [{ k: 'ctrl.arrows' }, 'ctrl.move', 'ctrl.move'],
  [{ k: 'ctrl.sprintKey' }, 'ctrl.sprint', 'ctrl.sprint'],
  [{ raw: 'S' }, 'ctrl.passGround', 'ctrl.switchPlayer'],
  [{ raw: 'A' }, 'ctrl.passLob', 'ctrl.slideTackle'],
  [{ k: 'ctrl.shootKey' }, 'ctrl.shootHold', 'ctrl.pressTackle'],
];

const CONTROLS_ADVANCED: readonly ControlRow[] = [
  [{ raw: 'W' }, 'ctrl.through', null],
  [{ raw: 'Q + W' }, 'ctrl.throughLob', null],
  [{ raw: 'Z + D' }, 'ctrl.curlShot', null],
  [{ k: 'ctrl.aimKey' }, 'ctrl.aimDesc', null],
  [{ raw: 'Esc' }, 'ctrl.pause', 'ctrl.pause'],
];

export function ControlsTable() {
  const { t } = useI18n();
  const renderRows = (rows: readonly ControlRow[]) =>
    rows.map(([keySpec, attack, defend]) => {
      const label = 'raw' in keySpec ? keySpec.raw : t(keySpec.k);
      return (
        <tr key={label}>
          <th scope="row">
            <kbd className="kbd">{label}</kbd>
          </th>
          <td>{t(attack)}</td>
          <td>{defend ? t(defend) : '—'}</td>
        </tr>
      );
    });
  return (
    <table className="table">
      <thead>
        <tr>
          <th scope="col">{t('ctrl.colKey')}</th>
          <th scope="col">{t('ctrl.colAttack')}</th>
          <th scope="col">{t('ctrl.colDefend')}</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <th colSpan={3} scope="colgroup" className="label">
            {t('ctrl.groupBasic')}
          </th>
        </tr>
        {renderRows(CONTROLS_BASIC)}
      </tbody>
      <tbody>
        <tr>
          <th colSpan={3} scope="colgroup" className="label">
            {t('ctrl.groupAdv')}
          </th>
        </tr>
        {renderRows(CONTROLS_ADVANCED)}
      </tbody>
    </table>
  );
}

/** Lượt sút luân lưu của người chơi: nhắc cách sút (match-shootout.html). */
export function ShootoutHint({ showPause = true }: { showPause?: boolean }) {
  const { t } = useI18n();
  return (
    <p className="hud-panel hud-keys" role="status">
      <span className="keyhint">
        <kbd className="kbd">{t('ctrl.arrows')}</kbd>
        {t('hint.soAngle')}
      </span>
      <span className="keyhint">
        <kbd className="kbd">D</kbd>
        {t('hint.soShoot')}
      </span>
      {showPause && (
        <span className="keyhint">
          <kbd className="kbd">Esc</kbd>
          {t('ctrl.pause')}
        </span>
      )}
    </p>
  );
}

const KEY_HINTS: ReadonlyArray<readonly [string, TranslationKey]> = [
  ['← ↑ → ↓', 'hint.move'],
  ['E', 'hint.sprint'],
  ['S', 'hint.passSwitch'],
  ['A', 'hint.lobTackle'],
  ['D', 'hint.shotPress'],
  ['W', 'hint.through'],
  ['Q+W', 'hint.throughLob'],
  ['Z+D', 'hint.curl'],
  ['Esc', 'ctrl.pause'],
];

/** Dải gợi ý phím ở cạnh dưới trong những giây đầu trận. */
export function KeyHints({ showPause = true }: { showPause?: boolean }) {
  const { t } = useI18n();
  const hints = showPause ? KEY_HINTS : KEY_HINTS.filter(([k]) => k !== 'Esc');
  return (
    <p className="hud-panel hud-keys">
      {hints.map(([k, key]) => (
        <span key={k} className="keyhint">
          <kbd className="kbd">{k}</kbd>
          {t(key)}
        </span>
      ))}
    </p>
  );
}

/** Nghỉ giữa hiệp: dải sự kiện "Hết hiệp 1" giữ nguyên dưới bảng tỉ số (match-events.html). */
export function HalfTimeStrip() {
  const { t } = useI18n();
  return (
    <div className="event-strip hud-event hud-event--half" role="status">
      <span className="event-strip__mark" aria-hidden="true">
        ■
      </span>
      <span>
        {t('hint.halfTimeBefore')} <kbd className="kbd">S</kbd>{' '}
        {t('hint.halfTimeAfter', { seconds: HALF_TIME_MAX_TICKS / TICK_RATE })}
      </span>
    </div>
  );
}

export interface PauseSubs {
  /** Sim đang cho thay người (bóng chết, không phải lúc chờ phạt đền — PRD §5). */
  allowed: boolean;
  /** Đang chờ phạt đền / luân lưu: bóng chết nhưng vẫn không được thay. */
  penaltyPending?: boolean;
  left: number;
  options: SubOptions;
  onSubstitute: (outId: string, benchSlot: SquadSlot) => void;
}

const staminaTone = (v: number) => (v < 30 ? ' is-critical' : v < 50 ? ' is-low' : '');

type SubOptionRow = SubCardMeta & {
  number: number;
  position: Position;
  stamina: number;
};

/** Một dòng chọn cầu thủ (trên sân hoặc dự bị) kèm miniface, tên, OVR và thanh thể lực. */
function SubPlayerOption({
  name,
  checked,
  onChange,
  player,
}: {
  name: 'sub-out' | 'sub-in';
  checked: boolean;
  onChange: () => void;
  player: SubOptionRow;
}) {
  const { locale, t } = useI18n();
  const level = staminaLevel(player.stamina);
  const posName = positionName(player.position, locale);
  const fullName = player.name ?? posName;
  const displayName = player.shortName ?? fullName;
  return (
    <label className="subs__item">
      <input type="radio" name={name} className="sr-only" checked={checked} onChange={onChange} />
      <span
        className={`subs__face${player.rarity ? ` r-${player.rarity}` : ''}`}
        aria-hidden="true"
      >
        {player.avatarSeed ? (
          <Avatar seed={player.avatarSeed} />
        ) : (
          <span className="display num subs__face-num">{player.number}</span>
        )}
      </span>
      <span className="subs__info">
        <span className="subs__top">
          <span className="display num subs__num">#{player.number}</span>
          <abbr className={`pos pos--${player.position}`} title={posName}>
            {player.position}
          </abbr>
          <span className="subs__name" title={fullName}>
            {displayName}
          </span>
          {player.ovr !== undefined && (
            <span className="subs__ovr" title={`OVR ${player.ovr}`}>
              <span className="subs__ovr-k">OVR</span>
              <b className="display num">{player.ovr}</b>
            </span>
          )}
        </span>
        <span className="subs__stamina-row">
          <span
            className={`bar subs__bar hud-stamina hud-stamina--${level}`}
            role="meter"
            aria-label={t('hud.stamina')}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={player.stamina}
          >
            <span className="bar__fill" style={{ '--v': `${player.stamina}%` } as CSSProperties} />
          </span>
          <span className={`num subs__stamina${staminaTone(player.stamina)}`}>
            {player.stamina}%
          </span>
        </span>
      </span>
    </label>
  );
}

/** Chọn người ra (trên sân) và người vào (dự bị) rồi xác nhận. */
export function SubstitutionPanel({ subs }: { subs: PauseSubs }) {
  const { t } = useI18n();
  const [outId, setOutId] = useState<string | null>(null);
  const [inSlot, setInSlot] = useState<SquadSlot | null>(null);
  const out = subs.options.onPitch.find((p) => p.id === outId);
  const incoming = subs.options.bench.find((b) => b.slot === inSlot);
  const mismatch =
    out !== undefined && incoming !== undefined && !canSwap(out.position, incoming.position);
  const valid = out !== undefined && incoming !== undefined && !mismatch && subs.left > 0;
  return (
    <>
      <h3 className="panel__title" id="pause-panel-title">
        {t('subs.title')} <span className="meta">{t('subs.leftTag', { left: subs.left })}</span>
      </h3>
      <div className="subs">
        <fieldset className="subs__col">
          <legend className="label">{t('subs.outLegend')}</legend>
          {subs.options.onPitch.map((p) => (
            <SubPlayerOption
              key={p.id}
              name="sub-out"
              checked={outId === p.id}
              onChange={() => setOutId(p.id)}
              player={p}
            />
          ))}
        </fieldset>
        <fieldset className="subs__col">
          <legend className="label">{t('subs.inLegend')}</legend>
          {subs.options.bench.length === 0 && <p className="muted">{t('subs.emptyBench')}</p>}
          {subs.options.bench.map((b) => (
            <SubPlayerOption
              key={b.slot}
              name="sub-in"
              checked={inSlot === b.slot}
              onChange={() => setInSlot(b.slot)}
              player={{ ...b, stamina: b.stamina ?? 100 }}
            />
          ))}
        </fieldset>
      </div>
      {mismatch && (
        <p className="subs__warn" role="alert">
          {t('subs.gkMismatch')}
        </p>
      )}
      <button
        type="button"
        className="btn btn--primary pause__confirm"
        disabled={!valid}
        onClick={() => {
          if (!out || !incoming) return;
          subs.onSubstitute(out.id, incoming.slot);
          setOutId(null);
          setInSlot(null);
        }}
      >
        {t('subs.title')}
      </button>
    </>
  );
}

const PRESET_KEY = { low: 'gfx.preset.low', high: 'gfx.preset.high' } as const;

/**
 * Cài đặt đồ hoạ (task 5.21): chọn preset rồi bật/tắt riêng từng chi tiết; chọn lại preset thì xoá
 * phần tuỳ chỉnh. Áp dụng ngay, không tạo lại trận.
 */
export function GraphicsPanel({
  graphics,
  onChange,
}: {
  graphics: GraphicsSettings;
  onChange: (g: GraphicsSettings) => void;
}) {
  const { t } = useI18n();
  const q = resolveQuality(graphics);
  const custom = Object.keys(graphics.overrides).length > 0;
  return (
    <>
      <h3 className="panel__title" id="pause-panel-title">
        {t('gfx.title')}{' '}
        <span className="meta">
          {t('gfx.meta', {
            mode: custom ? t('gfx.custom') : t(PRESET_KEY[graphics.preset]),
          })}
        </span>
      </h3>
      <div className="pause-row">
        <span id="gfx-preset">{t('gfx.quality')}</span>
        <div className="seg" role="group" aria-labelledby="gfx-preset">
          {(['low', 'high'] as const).map((preset) => {
            const on = graphics.preset === preset && !custom;
            return (
              <button
                key={preset}
                type="button"
                className={`seg__opt${on ? ' is-on' : ''}`}
                aria-pressed={on}
                onClick={() => onChange({ ...graphics, preset, overrides: {} })}
              >
                {t(PRESET_KEY[preset])}
              </button>
            );
          })}
        </div>
      </div>
      <div className="pause-row">
        <span id="gfx-time">{t('gfx.timeOfDay')}</span>
        <div className="seg" role="group" aria-labelledby="gfx-time">
          {TIMES_OF_DAY.map((tod) => {
            const on = graphics.timeOfDay === tod.key;
            return (
              <button
                key={tod.key}
                type="button"
                className={`seg__opt${on ? ' is-on' : ''}`}
                aria-pressed={on}
                onClick={() => onChange({ ...graphics, timeOfDay: tod.key })}
              >
                {t(`gfx.time.${tod.key}`)}
              </button>
            );
          })}
        </div>
      </div>
      <div className="pause-switches">
        {GRAPHICS_TOGGLES.map((toggle) => {
          // SSAO chạy trong hậu kỳ: tắt hậu kỳ thì SSAO mờ đi.
          const blocked = toggle.key === 'ssao' && !q.postFx;
          const on = q[toggle.key];
          return (
            <label
              key={toggle.key}
              className={`switch${on ? ' is-on' : ''}${blocked ? ' is-blocked' : ''}`}
            >
              <span className="pause-switch__text">
                <span>{t(`gfx.toggle.${toggle.key}`)}</span>
                {toggle.key === 'grass3d' && <span className="muted">{t('gfx.grassWarn')}</span>}
                {blocked && <span className="muted">{t('gfx.ssaoNeedPostFx')}</span>}
              </span>
              <input
                type="checkbox"
                className="sr-only"
                checked={on}
                disabled={blocked}
                onChange={(e) => onChange(toggleGraphics(graphics, toggle.key, e.target.checked))}
              />
              <span className="switch__track" aria-hidden="true" />
            </label>
          );
        })}
      </div>
    </>
  );
}

type PauseView = 'graphics' | 'controls' | 'subs' | 'confirm';

const PlayIcon = () => (
  <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <path d="M4 2.5v11l9-5.5z" />
  </svg>
);

/**
 * Menu tạm dừng (pause.html): cột nút bên trái, panel bên phải theo mục đang chọn (Đồ hoạ mặc
 * định). Bỏ trận hỏi xác nhận trong panel.
 */
export function PauseMenu({
  hud,
  graphics,
  onGraphics,
  onResume,
  onQuit,
  onReplayTutorial,
  subs,
}: {
  hud: Pick<HudSnapshot, 'half' | 'clock'> | null;
  graphics: GraphicsSettings;
  onGraphics: (g: GraphicsSettings) => void;
  onResume: () => void;
  onQuit: () => void;
  onReplayTutorial?: () => void;
  subs: PauseSubs;
}) {
  const { t } = useI18n();
  const [view, setView] = useState<PauseView>('graphics');
  const subsOff = !subs.allowed || subs.left === 0;
  // Đang mở panel thay người mà bóng sống lại (không xảy ra khi tạm dừng) → về Đồ hoạ.
  const shown: PauseView = view === 'subs' && subsOff ? 'graphics' : view;
  const pick = (v: PauseView) => ({
    'aria-pressed': shown === v,
    'aria-controls': 'pause-panel',
    onClick: () => setView(v),
  });
  return (
    <div
      className={`scrim pause${shown === 'subs' ? ' pause--subs' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="pause-title"
    >
      <div className="pause__menu">
        {hud && (
          <span className="label">
            {t('pause.headerMeta', { half: hud.half, clock: hud.clock })}
          </span>
        )}
        <h2 id="pause-title" className="h1 pause__title">
          {t('pause.title')}
        </h2>
        <button
          type="button"
          className="btn btn--primary btn--lg btn--block pause__btn"
          autoFocus
          onClick={onResume}
        >
          <PlayIcon />
          {t('pause.resume')}
        </button>
        <button
          type="button"
          className="btn btn--secondary btn--lg btn--block pause__btn pause__btn--split"
          disabled={subsOff}
          aria-describedby="subs-hint"
          {...pick('subs')}
        >
          {t('subs.title')}{' '}
          <span className="tag">{t('subs.leftTag', { left: subs.left })}</span>
        </button>
        <span id="subs-hint" className="muted pause__hint">
          {subs.left === 0
            ? t('pause.subsOut')
            : subs.penaltyPending
              ? t('pause.subsPenalty')
              : t('pause.subsDeadBall')}
        </span>
        <button
          type="button"
          className="btn btn--secondary btn--lg btn--block pause__btn"
          {...pick('graphics')}
        >
          {t('gfx.title')}
        </button>
        <button
          type="button"
          className="btn btn--secondary btn--lg btn--block pause__btn"
          {...pick('controls')}
        >
          {t('pause.controls')}
        </button>
        <button
          type="button"
          className="btn btn--danger btn--lg btn--block pause__btn pause__quit"
          {...pick('confirm')}
        >
          {t('pause.quit')}
        </button>
        <span className="muted pause__hint">{t('pause.quitHint')}</span>
      </div>
      <section
        id="pause-panel"
        className="panel panel--raised pause__panel"
        aria-labelledby="pause-panel-title"
      >
        {shown === 'subs' && <SubstitutionPanel subs={subs} />}
        {shown === 'graphics' && <GraphicsPanel graphics={graphics} onChange={onGraphics} />}
        {shown === 'controls' && (
          <>
            <h3 className="panel__title" id="pause-panel-title">
              {t('pause.controls')}
            </h3>
            <ControlsTable />
            {onReplayTutorial && (
              <div className="pause__actions">
                <button
                  type="button"
                  className="btn btn--secondary btn--sm"
                  onClick={onReplayTutorial}
                >
                  {t('pause.replayTutorial')}
                </button>
              </div>
            )}
          </>
        )}
        {shown === 'confirm' && (
          <>
            <h3 className="panel__title" id="pause-panel-title">
              {t('pause.quitTitle')}
            </h3>
            <p className="muted">{t('pause.quitBody')}</p>
            <div className="pause__actions">
              <button
                type="button"
                className="btn btn--secondary"
                autoFocus
                onClick={() => setView('graphics')}
              >
                {t('pause.quitStay')}
              </button>
              <button type="button" className="btn btn--danger" onClick={onQuit}>
                {t('pause.quit')}
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

const OUTCOME_KEY = {
  win: 'result.outcome.win',
  draw: 'result.outcome.draw',
  loss: 'result.outcome.loss',
} as const;
const SHOOTOUT_KEY = { win: 'result.shootout.win', loss: 'result.shootout.loss' } as const;
const DIFFICULTY_KEY: Record<Difficulty, TranslationKey> = {
  easy: 'pm.diff.easy',
  hard: 'pm.diff.hard',
};

/**
 * Kết quả chưa nộp xong (hoặc còn gửi lại được): rời màn kết quả rồi vào trận mới sẽ làm server huỷ
 * trận này, mất thưởng.
 */
export const isUnsavedResult = (reward: RewardStatus): boolean =>
  reward.kind === 'pending' || (reward.kind === 'error' && reward.retryable);

export const UNSAVED_LEAVE_MESSAGE =
  'Kết quả trận chưa lưu xong. Rời đi bây giờ có thể mất thưởng trận này. Vẫn rời đi?';

/** Trạng thái nộp kết quả lên server (thưởng do server tính). */
export type RewardStatus =
  | { kind: 'pending' }
  | { kind: 'done'; reward: number; balance: number }
  | { kind: 'error'; message: string; retryable: boolean; retrying?: boolean };

/** Số trận có thưởng hôm nay (từ /me, đọc lại sau khi nộp kết quả). */
export interface RewardedMatches {
  today: number;
  limit: number;
}

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

function Coin({ value, muted }: { value: string; muted?: boolean }) {
  const { t } = useI18n();
  return (
    <span className={`coin coin--xl${muted ? ' result-coin--none' : ''}`}>
      <span className="coin__icon" aria-hidden="true" />
      <span className="num">{value}</span> {t('common.coin')}
    </span>
  );
}

function RewardBlock({
  status,
  caption,
  matches,
  onRetry,
}: {
  status: RewardStatus;
  caption: string;
  matches: RewardedMatches | null;
  onRetry: () => void;
}) {
  const { locale, t } = useI18n();
  if (status.kind === 'pending') {
    return (
      <div className="result-reward" role="status" aria-busy="true">
        <span className="label">{t('result.rewardLabel')}</span>
        <span className="skel skel--line result-reward__skel" aria-hidden="true" />
        <span className="muted">{t('result.rewardPending')}</span>
      </div>
    );
  }
  if (status.kind === 'error') {
    return (
      <div className="result-reward" role="alert">
        <span className="label">{t('result.rewardLabel')}</span>
        <div className="banner banner--danger">
          <WarnIcon />
          <span>
            <b>{status.message}</b>
            {status.retryable && t('result.rewardRetryHint')}
          </span>
        </div>
        {status.retryable && (
          <button
            type="button"
            className={`btn btn--primary${status.retrying ? ' is-loading' : ''}`}
            aria-busy={status.retrying || undefined}
            disabled={status.retrying}
            onClick={onRetry}
          >
            <span className="btn__label">{t('result.rewardRetryBtn')}</span>
          </button>
        )}
      </div>
    );
  }
  if (status.reward === 0) {
    return (
      <div className="result-reward" role="status">
        <span className="label">{t('result.rewardLabel')}</span>
        <div className="banner">
          <WarnIcon />
          <span>
            <b>{t('result.practiceBold')}</b> {t('result.practiceText')}
          </span>
        </div>
        <Coin value="+0" muted />
        <span className="muted">
          {t('result.walletLabel', { balance: formatNumber(status.balance, locale) })}
        </span>
      </div>
    );
  }
  return (
    <div className="result-reward" role="status">
      <span className="label">{t('result.rewardLabel')}</span>
      <Coin value={`+${formatNumber(status.reward, locale)}`} />
      <span className="muted">
        {caption}
        {matches &&
          t('result.rewardedNum', { today: matches.today, limit: matches.limit })}
        {t('result.walletInline', { balance: formatNumber(status.balance, locale) })}
      </span>
    </div>
  );
}

function StatRow({ title, home, away }: { title: string; home: number; away: number }) {
  const { t } = useI18n();
  const total = home + away;
  return (
    <div
      className="result-stat"
      role="group"
      aria-label={t('result.statAria', { title, home, away })}
    >
      <span className="display num">{home}</span>
      <div className="result-stat__mid" aria-hidden="true">
        <span className="label">{title}</span>
        <div className={`result-stat__bars${total ? '' : ' is-empty'}`}>
          <span className="result-stat__home" style={{ flexGrow: total ? home : 1 }} />
          <span className="result-stat__away" style={{ flexGrow: total ? away : 1 }} />
        </div>
      </div>
      <span className="display num result-stat__r">{away}</span>
    </div>
  );
}

interface ResultScreenProps {
  hud: HudSnapshot;
  difficulty: Difficulty;
  reward: RewardStatus;
  matches: RewardedMatches | null;
  missions?: readonly MissionProgress[];
  claimingMissionCode?: string | null;
  missionError?: string | null;
  onClaimMission?: (code: string) => void;
  onRetryReward: () => void;
  onRematch: () => void;
}

/** Màn kết quả (result.html, result-states.html). Xu nhận lấy từ server. */
export function ResultScreen({
  hud,
  difficulty,
  reward,
  matches,
  missions,
  claimingMissionCode,
  missionError,
  onClaimMission,
  onRetryReward,
  onRematch,
}: ResultScreenProps) {
  const { locale, t } = useI18n();
  const outcome = matchOutcome(hud.score);
  const shootout = shootoutOutcome(hud);
  const pens = hud.shootout && shootoutScore(hud.shootout);
  const count = (team: 'home' | 'away', card: 'yellow' | 'red') =>
    hud.bookings.filter((b) => b.team === team && b.card === card).length;
  const headline = shootout ? t(SHOOTOUT_KEY[shootout]) : t(OUTCOME_KEY[outcome]);
  const level = t(DIFFICULTY_KEY[difficulty]);
  const unsaved = isUnsavedResult(reward);
  // autoFocus không ăn vì lúc mount nút còn khoá: focus khi nút bật lại để Enter là đá tiếp.
  const rematchRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!unsaved) rematchRef.current?.focus();
  }, [unsaved]);
  return (
    <main className="night-bg result" aria-labelledby="result-title">
      <div className="result__main">
        <span className="label">
          {t('result.kicker', {
            level,
            halves: hud.shootout ? t('result.halvesWithPens') : t('result.halvesNormal'),
          })}
        </span>
        <p
          className="result__score"
          aria-label={t('result.scoreAria', { home: hud.score.home, away: hud.score.away })}
        >
          <span className="display result__team" aria-hidden="true">
            <span className="result__sw result__sw--home" />
            {t('hud.homeUpper')}
          </span>
          <span className="display num result__goals" aria-hidden="true">
            {hud.score.home} – {hud.score.away}
          </span>
          <span className="display result__team" aria-hidden="true">
            {t('hud.awayUpper')}
            <span className="result__sw result__sw--away" />
          </span>
        </p>
        {pens && (
          <span className="muted result__pens">
            {t('result.pensLabel')}{' '}
            <b className="num">
              {pens.home} – {pens.away}
            </b>
          </span>
        )}
        <h1
          id="result-title"
          className={`display result__outcome result__outcome--${shootout ?? outcome}`}
        >
          {headline}
        </h1>
        <section className="panel result__stats" aria-label={t('result.statsAria')}>
          <StatRow title={t('result.statShots')} home={hud.shots.home} away={hud.shots.away} />
          <StatRow
            title={t('result.statYellow')}
            home={count('home', 'yellow')}
            away={count('away', 'yellow')}
          />
          <StatRow
            title={t('result.statRed')}
            home={count('home', 'red')}
            away={count('away', 'red')}
          />
        </section>
        {hud.bookings.length > 0 && (
          <p className="muted result__bookings">
            {t('result.bookingsPrefix')}{' '}
            {hud.bookings
              .map(
                (b) =>
                  `${b.clock} ${cardLabel(b.card, locale)} · ${teamLabel(b.team, locale)} #${b.number}`,
              )
              .join(' · ')}
          </p>
        )}
      </div>
      <div className="result__side">
        <section className="panel--notch">
          <div className="panel__in">
            <RewardBlock
              status={reward}
              caption={t('result.rewardCaption', { headline, level })}
              matches={matches}
              onRetry={onRetryReward}
            />
          </div>
        </section>
        {missions && missions.length > 0 && (
          <DailyMissionsPanel
            title={t('missions.resultTitle')}
            missions={missions}
            claimingCode={claimingMissionCode ?? null}
            errorMessage={missionError ?? null}
            onClaim={onClaimMission}
            showResetNote={false}
          />
        )}
        <div className="result__actions">
          {/* Trận mới làm server huỷ trận cũ → chưa nộp xong (hoặc còn gửi lại được) thì chưa cho đá tiếp. */}
          <button
            type="button"
            className="btn btn--primary btn--lg"
            ref={rematchRef}
            disabled={unsaved}
            onClick={onRematch}
          >
            {t('result.rematch')}
          </button>
          {/* Rời đi lúc chưa lưu xong: PlayPage (`useLeaveGuard`) hỏi trước cho mọi lối rời màn. */}
          <Link to="/" className="btn btn--secondary btn--lg">
            {t('result.backHome')}
          </Link>
        </div>
      </div>
    </main>
  );
}
