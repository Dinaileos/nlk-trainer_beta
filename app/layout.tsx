'use client';

import { useEffect } from 'react';
import { useAuthStore } from '@/lib/store';
import { OnlineStatusProvider } from './components/OnlineStatusProvider';
import './globals.css';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const initialize = useAuthStore((s) => s.initialize);
  const isInitialized = useAuthStore((s) => s.isInitialized);

  useEffect(() => {
    initialize();
  }, [initialize]);

  if (!isInitialized) {
    return (
      <html lang="ru">
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
          <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
        </head>
        <body>
          <div className="loading-screen">
            <div className="spinner"></div>
          </div>
        </body>
      </html>
    );
  }

  return (
    <html lang="ru">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body>
        <OnlineStatusProvider>
          {children}
        </OnlineStatusProvider>
        <footer style={{
          textAlign: 'center',
          padding: '16px',
          borderTop: '1px solid #333',
          marginTop: 'auto',
        }}>
          <a
            href="https://t.me/+Ntb8oisI4rUwM2Ni"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#4a90d9', textDecoration: 'none', fontSize: '13px' }}
          >
            Сообщить об ошибке
          </a>
          <span style={{ color: '#555', margin: '0 12px' }}>|</span>
          <a href="/privacy" style={{ color: '#4a90d9', textDecoration: 'none', fontSize: '13px' }}>
            Политика конфиденциальности
          </a>
        </footer>
      </body>
    </html>
  );
}