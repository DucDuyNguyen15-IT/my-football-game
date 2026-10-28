import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate } from 'react-router';
import { AuthPage } from '../features/auth/AuthPage';
import { CollectionPage } from '../features/collection/CollectionPage';
import { HomePage } from '../features/home/HomePage';
import { IntroGate } from '../features/intro/IntroGate';
import { ShopPage } from '../features/shop/ShopPage';
import { SquadPage } from '../features/squad/SquadPage';
import { AppLayout, RequireAuth } from './AppLayout';

// Three.js (~600 KB) chỉ tải khi vào trận.
const PlayPage = lazy(() =>
  import('../features/play/PlayPage').then((m) => ({ default: m.PlayPage })),
);

export const router = createBrowserRouter([
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
              <Suspense fallback={<p className="screen-msg">Đang tải trận…</p>}>
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
            ],
          },
        ],
      },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);
