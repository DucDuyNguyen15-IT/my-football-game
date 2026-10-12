import { useEffect, useState } from 'react';
import { Link } from 'react-router';
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
      <p>
        <Link to="/play">Đá thử vs máy Dễ</Link> ·{' '}
        <Link to="/play?difficulty=hard">vs máy Khó</Link>
      </p>
    </main>
  );
}
