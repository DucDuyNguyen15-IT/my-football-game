import { useState } from 'react';
import { Link } from 'react-router';
import { ROOM_CODE_ALPHABET, type PvpErrorCode } from '@pitch/shared';
import { Topbar } from '../../app/AppLayout';
import { useI18n } from '../../i18n/I18nContext';
import type { TranslationKey } from '../../i18n/vi';
import '../play/prematch.css';
import './pvp.css';

export interface LobbyRoom {
  code: string;
  expiresAt: string;
}

export interface PvpLobbyProps {
  connected: boolean;
  reconnecting: boolean;
  room: LobbyRoom | null;
  error: PvpErrorCode | null;
  onCreateRoom: () => void;
  onJoinRoom: (code: string) => void;
  onLeaveRoom: () => void;
}

const VALID_CODE_RE = new RegExp(`^[${ROOM_CODE_ALPHABET}]{6}$`);

export function pvpErrorKey(code: PvpErrorCode): TranslationKey {
  return `pvp.err.${code}`;
}

export function PvpLobby({
  connected,
  reconnecting,
  room,
  error,
  onCreateRoom,
  onJoinRoom,
  onLeaveRoom,
}: PvpLobbyProps) {
  const { t } = useI18n();
  const [codeInput, setCodeInput] = useState('');
  const [copied, setCopied] = useState(false);

  const normalizedCode = codeInput.trim().toUpperCase();
  const codeValid = VALID_CODE_RE.test(normalizedCode);

  const handleCopy = async () => {
    if (!room) return;
    try {
      await navigator.clipboard.writeText(room.code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard bị chặn thì người chơi vẫn tự bôi đen sao chép được.
    }
  };

  return (
    <div className="pm-shell">
      <Topbar />
      <main className="pm" aria-labelledby="pvp-title">
        <div className="pm__crumbs">
          <Link to="/" className="btn btn--ghost btn--sm">
            ← {t('common.home')}
          </Link>
          {!connected && (
            <span className="pvp-status-pill" role="status">
              {reconnecting ? t('pvp.disconnected') : t('pvp.connecting')}
            </span>
          )}
        </div>

        <h1 id="pvp-title" className="h1 pm__title">
          {t('pvp.title')}
        </h1>

        {error && (
          <div className="banner banner--danger" role="alert">
            <span>{t(pvpErrorKey(error))}</span>
            {error === 'invalid_squad' && (
              <Link to="/squad" className="btn btn--secondary btn--sm">
                {t('home.editSquad')}
              </Link>
            )}
          </div>
        )}

        <div className="pvp-grid">
          <section className="panel pvp-card" aria-labelledby="pvp-room-title">
            <h2 id="pvp-room-title" className="h3">
              {t('pvp.roomTitle')}
            </h2>
            <div className="banner" role="note">
              <span>
                <b>{t('pvp.friendlyTag')}</b> — {t('pvp.friendlyDesc')}
              </span>
            </div>

            {room ? (
              <>
                <div className="pvp-code-box">
                  <div>
                    <span className="label">{t('pvp.roomCodeLabel')}</span>
                    <div className="pvp-code" data-testid="pvp-room-code">
                      {room.code}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn btn--secondary btn--sm"
                    onClick={() => void handleCopy()}
                  >
                    {copied ? t('pvp.copied') : t('pvp.copyCode')}
                  </button>
                </div>
                <p className="muted" role="status">
                  {t('pvp.waitingGuest')}
                </p>
                <div className="pvp-actions">
                  <button type="button" className="btn btn--danger" onClick={onLeaveRoom}>
                    {t('pvp.cancelRoom')}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="pvp-actions">
                  <button
                    type="button"
                    className="btn btn--primary btn--lg"
                    disabled={!connected}
                    onClick={onCreateRoom}
                  >
                    {t('pvp.createRoom')}
                  </button>
                </div>

                <form
                  className="pvp-join-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (connected && codeValid) onJoinRoom(normalizedCode);
                  }}
                >
                  <label htmlFor="pvp-room-input" className="sr-only">
                    {t('pvp.joinTitle')}
                  </label>
                  <input
                    id="pvp-room-input"
                    type="text"
                    className="pvp-code-input"
                    value={codeInput}
                    maxLength={6}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder={t('pvp.codePlaceholder')}
                    aria-label={t('pvp.joinTitle')}
                    onChange={(e) =>
                      setCodeInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))
                    }
                  />
                  <button
                    type="submit"
                    className="btn btn--secondary btn--lg"
                    disabled={!connected || !codeValid}
                  >
                    {t('pvp.joinBtn')}
                  </button>
                </form>
              </>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
