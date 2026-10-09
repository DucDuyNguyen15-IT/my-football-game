import { useEffect, useState } from 'react';
import { HealthResponse } from '@pitch/shared';
import { apiUrl } from './api/client';

export function App() {
  const [status, setStatus] = useState('đang kiểm tra…');

  useEffect(() => {
    fetch(apiUrl('/health'))
      .then((res) => res.json())
      .then((body) => setStatus(HealthResponse.parse(body).data.status))
      .catch(() => setStatus('không kết nối được server'));
  }, []);

  return (
    <main>
      <h1>Pitch Cards</h1>
      <p>Server: {status}</p>
    </main>
  );
}
