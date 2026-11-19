/** Trang Tài khoản: thông tin cơ bản, tuỳ chọn hiển thị, link pháp lý, xoá tài khoản (checklist pháp lý GĐ9, NĐ 13). */
import { useId, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { useDeleteAccount, useMe } from '../../api/auth';
import { useI18n } from '../../i18n/I18nContext';
import { LanguageSwitcher } from '../../i18n/LanguageSwitcher';
import { ThemeSwitcher } from '../../styles/ThemeSwitcher';
import { describeAuthError } from '../auth/authErrors';
import '../legal/legal.css';

export function AccountPage() {
  const { locale, t } = useI18n();
  const me = useMe().data;
  const remove = useDeleteAccount();
  const [confirmName, setConfirmName] = useState('');
  const [password, setPassword] = useState('');
  const nameId = useId();
  const pwId = useId();
  if (!me) return null;

  const matches = confirmName.trim().toLowerCase() === me.username.toLowerCase();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!matches || remove.isPending) return;
    remove.mutate({ username: confirmName.trim(), ...(password && { password }) });
  };
  const error = remove.error ? describeAuthError(remove.error, locale) : null;

  return (
    <div className="legal__body">
      <h1 className="h1">{t('account.title')}</h1>
      <p>
        {t('account.username')} <b>{me.username}</b>
      </p>
      <p>
        <Link to="/privacy">{t('auth.privacy')}</Link> · <Link to="/terms">{t('auth.terms')}</Link>
      </p>

      <h2 className="h3">{t('account.prefsTitle')}</h2>
      <div className="account__prefs">
        <div className="account__pref-row">
          <span className="field__label">{t('theme.label')}</span>
          <ThemeSwitcher />
        </div>
        <div className="account__pref-row">
          <span className="field__label">{t('lang.label')}</span>
          <LanguageSwitcher />
        </div>
      </div>

      <h2 className="h3">{t('account.deleteTitle')}</h2>
      <p>
        {t('account.deleteLead')} <b>{t('account.deleteIrreversible')}</b>
      </p>
      <form className="account__form" onSubmit={submit} noValidate>
        <div className="field">
          <label className="field__label" htmlFor={nameId}>
            {t('account.confirmName')}
          </label>
          <input
            id={nameId}
            className="input"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            value={confirmName}
            onChange={(e) => setConfirmName(e.target.value)}
            maxLength={40}
          />
          {confirmName.trim().length > 0 && !matches && (
            <p className="field__hint">{t('account.confirmHint', { username: me.username })}</p>
          )}
        </div>
        <div className="field">
          <label className="field__label" htmlFor={pwId}>
            {t('account.password')} <small>{t('account.passwordGoogleNote')}</small>
          </label>
          <input
            id={pwId}
            className="input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            maxLength={72}
          />
        </div>
        {error && (
          <div className="banner banner--danger" role="alert">
            <span>
              {error.title && <b>{error.title}. </b>}
              {error.text}
            </span>
          </div>
        )}
        <button
          type="submit"
          className={`btn btn--danger${remove.isPending ? ' is-loading' : ''}`}
          disabled={!matches || remove.isPending}
          aria-busy={remove.isPending || undefined}
        >
          <span className="btn__label">{t('account.deleteSubmit')}</span>
        </button>
      </form>
    </div>
  );
}
