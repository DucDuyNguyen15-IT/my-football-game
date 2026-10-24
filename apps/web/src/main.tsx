import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiClientError } from './api/client';
import { router } from './app/router';
import './styles/tokens.css';
import './app/app.css';
// Font tự host (DESIGN.md §2): chỉ tải file của dải ký tự trang cần (Latin + tiếng Việt).
import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/700.css';
import '@fontsource/be-vietnam-pro/400.css';
import '@fontsource/be-vietnam-pro/500.css';
import '@fontsource/be-vietnam-pro/600.css';

const root = document.getElementById('root');
if (!root) throw new Error('Thiếu #root trong index.html');

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Lỗi nghiệp vụ (4xx) không thử lại; lỗi mạng/5xx thử lại 2 lần.
      retry: (count, err) =>
        count < 2 && !(err instanceof ApiClientError && err.status >= 400 && err.status < 500),
      refetchOnWindowFocus: false,
    },
  },
});

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
