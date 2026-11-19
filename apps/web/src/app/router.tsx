import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate } from 'react-router';
import { AccountPage } from '../features/account/AccountPage';
import { AdminPage } from '../features/admin/AdminPage';
import { AuthPage } from '../features/auth/AuthPage';
import { CollectionPage } from '../features/collection/CollectionPage';
import { HomePage } from '../features/home/HomePage';
import { IntroGate } from '../features/intro/IntroGate';
import { PrivacyPage, TermsPage } from '../features/legal/LegalPage';
import { ShopPage } from '../features/shop/ShopPage';
import { SquadPage } from '../features/squad/SquadPage';
import { UpgradePage } from '../features/upgrade/UpgradePage';
import { AppLayout, RequireAuth } from './AppLayout';
import { useI18n } from '../i18n/I18nContext';

// Three.js (~600 KB) chỉ tải khi vào trận.
const PlayPage = lazy(() =>
  import('../features/play/PlayPage').then((m) => ({ default: m.PlayPage })),
);

function PlayFallback() {
  const { t } = useI18n();
  return <p className="screen-msg">{t('play.loadingChunk')}</p>;
}

export const router = createBrowserRouter([
  // Trang pháp lý công khai, mở thẳng không qua intro (link từ màn đăng nhập, email…).
  { path: '/privacy', element: <PrivacyPage /> },
  { path: '/terms', element: <TermsPage /> },
  {
    element: <IntroGate />,
    children: [
      { path: '/login', element: <AuthPage /> },
      {
        element: <RequireAuth />,
        children: [
          {
            path: '/play',
            element: (
              <Suspense fallback={<PlayFallback />}>
                <PlayPage />
              </Suspense>
            ),
          },
          {
            element: <AppLayout />,
            children: [
              { index: true, element: <HomePage /> },
              { path: '/shop', element: <ShopPage /> },
              { path: '/collection', element: <CollectionPage /> },
              { path: '/squad', element: <SquadPage /> },
              { path: '/upgrade', element: <UpgradePage /> },
              { path: '/admin', element: <AdminPage /> },
              { path: '/account', element: <AccountPage /> },
            ],
          },
        ],
      },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);
