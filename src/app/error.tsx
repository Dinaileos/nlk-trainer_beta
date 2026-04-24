'use client';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div style={{ padding: '40px', textAlign: 'center' }}>
      <h2>Что-то пошло не так. Попробуйте обновить страницу.</h2>
      <button onClick={reset}>Обновить</button>
    </div>
  );
}