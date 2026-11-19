import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
// Font tự host cho Direction B "Sa Bàn Hoàng Kim" (DESIGN.md §2): bao gồm Vietnamese + Latin.
import '@fontsource/space-grotesk/600.css';
import '@fontsource/space-grotesk/700.css';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-sans/700.css';
import './styles/tokens.css';
import './app/app.css';
import './styles/ui.css';
import { meKey } from './api/auth';
import { ApiClientError } from './api/client';
import { router } from './app/router';
import { applyThemeToDocument, readThemePreference } from './styles/theme';
import { ThemeProvider } from './styles/ThemeContext';

try {
  applyThemeToDocument(document.documentElement, readThemePreference(window.localStorage));
} catch {
  // localStorage bị chặn → giữ mặc định theo hệ thống.
}

const root = document.getElementById('root');
if (!root) throw new Error('Thiếu #root trong index.html');

/** Phiên hết hạn giữa chừng (401 ở bất kỳ API nào) → coi như đăng xuất, RequireAuth đưa về /login (B4-13). */
const onApiError = (err: unknown) => {
  if (err instanceof ApiClientError && err.code === 'unauthenticated') {
    queryClient.setQueryData(meKey, null);
    // Giống useLogout: không giữ dữ liệu của phiên cũ cho người đăng nhập lại trong cùng tab.
    queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== meKey[0] });
  }
};

const queryClient: QueryClient = new QueryClient({
  queryCache: new QueryCache({ onError: onApiError }),
  mutationCache: new MutationCache({ onError: onApiError }),
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
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
);
