import { lazy, Suspense } from 'react';
import { createBrowserRouter } from 'react-router';
import { App } from '../App';

// Three.js (~600 KB) chỉ tải khi vào trận.
const PlayPage = lazy(() =>
  import('../features/play/PlayPage').then((m) => ({ default: m.PlayPage })),
);

export const router = createBrowserRouter([
  { path: '/', element: <App /> },
  {
    path: '/play',
    element: (
      <Suspense fallback={<p>Đang tải trận…</p>}>
        <PlayPage />
      </Suspense>
    ),
  },
]);
