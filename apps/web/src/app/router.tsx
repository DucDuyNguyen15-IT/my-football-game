import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate } from 'react-router';
import { AuthPage } from '../features/auth/AuthPage';
import { ComingSoon, HomePage } from '../features/home/HomePage';
import { IntroGate } from '../features/intro/IntroGate';
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
              { path: '/shop', element: <ComingSoon title="Cửa hàng" /> },
              { path: '/collection', element: <ComingSoon title="Kho thẻ" /> },
              { path: '/squad', element: <ComingSoon title="Đội hình" /> },
            ],
          },
        ],
      },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);
