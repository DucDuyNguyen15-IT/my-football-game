/**
 * Chính sách bảo mật + Điều khoản sử dụng (checklist pháp lý GĐ9, NĐ 13/2023). Trang công khai, không
 * cần đăng nhập. Sửa nội dung thì đổi `UPDATED_ISO`.
 */
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { formatDateFull } from '../../i18n/i18n';
import { useI18n } from '../../i18n/I18nContext';
import './legal.css';

const UPDATED_ISO = '2026-11-16';
export const CONTACT_EMAIL = 'nguyenduycn06@gmail.com';

function LegalShell({ title, children }: { title: string; children: ReactNode }) {
  const { locale, t } = useI18n();
  return (
    <main className="legal">
      <article className="legal__body">
        <nav className="legal__nav" aria-label={t('legal.navAria')}>
          <Link to="/">← MFG</Link>
          <Link to="/privacy">{t('auth.privacy')}</Link>
          <Link to="/terms">{t('auth.terms')}</Link>
        </nav>
        <h1 className="h1">{title}</h1>
        <p className="muted">{t('legal.updated', { date: formatDateFull(UPDATED_ISO, locale) })}</p>
        {children}
        <h2 className="h3">{t('legal.contactTitle')}</h2>
        <p>
          {t('legal.contactBody')} <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>
      </article>
    </main>
  );
}

export function PrivacyPage() {
  const { t } = useI18n();
  return (
    <LegalShell title={t('legal.privacyTitle')}>
      <p>{t('legal.privacyIntro')}</p>

      <h2 className="h3">{t('legal.privacyDataTitle')}</h2>
      <ul>
        <li>
          <b>{t('legal.privacyDataAccountLabel')}</b> {t('legal.privacyDataAccount')}
        </li>
        <li>
          <b>{t('legal.privacyDataGoogleLabel')}</b> {t('legal.privacyDataGoogleNote')}{' '}
          {t('legal.privacyDataGoogle')}
        </li>
        <li>
          <b>{t('legal.privacyDataPlayLabel')}</b> {t('legal.privacyDataPlay')}
        </li>
        <li>
          <b>{t('legal.privacyDataAnalyticsLabel')}</b> {t('legal.privacyDataAnalytics')}
        </li>
        <li>
          <b>{t('legal.privacyDataLogsLabel')}</b> {t('legal.privacyDataLogs')}
        </li>
      </ul>

      <h2 className="h3">{t('legal.privacyCookieTitle')}</h2>
      <p>
        {t('legal.privacyCookieBody1')} <code>sid</code> {t('legal.privacyCookieBody2')}
      </p>

      <h2 className="h3">{t('legal.privacyPurposeTitle')}</h2>
      <p>{t('legal.privacyPurposeBody')}</p>

      <h2 className="h3">{t('legal.privacyThirdTitle')}</h2>
      <p>{t('legal.privacyThirdBody')}</p>

      <h2 className="h3">{t('legal.privacyRetentionTitle')}</h2>
      <p>{t('legal.privacyRetentionBody')}</p>

      <h2 className="h3">{t('legal.privacyRightsTitle')}</h2>
      <ul>
        <li>{t('legal.privacyRightsContact')}</li>
        <li>
          <b>{t('legal.privacyRightsDeleteLabel')}</b> {t('legal.privacyRightsDeletePart1')}{' '}
          <Link to="/account">{t('account.title')}</Link> {t('legal.privacyRightsDeletePart2')}
        </li>
      </ul>

      <h2 className="h3">{t('legal.privacyMinorsTitle')}</h2>
      <p>{t('legal.privacyMinorsBody')}</p>
    </LegalShell>
  );
}

export function TermsPage() {
  const { t } = useI18n();
  return (
    <LegalShell title={t('legal.termsTitle')}>
      <p>
        {t('legal.termsIntro1')} <Link to="/privacy">{t('auth.privacy')}</Link>.
      </p>

      <h2 className="h3">{t('legal.termsFreeTitle')}</h2>
      <ul>
        <li>{t('legal.termsFree1')}</li>
        <li>{t('legal.termsFree2')}</li>
        <li>{t('legal.termsFree3')}</li>
      </ul>

      <h2 className="h3">{t('legal.termsFictionTitle')}</h2>
      <p>{t('legal.termsFictionBody')}</p>

      <h2 className="h3">{t('legal.termsAssetsTitle')}</h2>
      <ul>
        <li>
          {t('legal.termsAssetsBall')}{' '}
          <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">
            CC BY 4.0
          </a>
          , {t('legal.termsAssetsEdited')}
        </li>
        <li>
          {t('legal.termsAssetsGoal')}{' '}
          <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">
            CC BY 4.0
          </a>
          , {t('legal.termsAssetsEdited')}
        </li>
        <li>{t('legal.termsAssetsMixamo')}</li>
      </ul>

      <h2 className="h3">{t('legal.termsRulesTitle')}</h2>
      <ul>
        <li>{t('legal.termsRules1')}</li>
        <li>{t('legal.termsRules2')}</li>
        <li>{t('legal.termsRules3')}</li>
        <li>{t('legal.termsRules4')}</li>
      </ul>
      <p>{t('legal.termsRulesPunish')}</p>

      <h2 className="h3">{t('legal.termsServiceTitle')}</h2>
      <p>{t('legal.termsServiceBody')}</p>
    </LegalShell>
  );
}
