'use client';

import { useState, useEffect } from 'react';

export default function Toast({ message, isError }: { message: string; isError: boolean }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(true);
    const timer = setTimeout(() => setVisible(false), 2800);
    return () => clearTimeout(timer);
  }, [message]);

  return (
    <div className={`toast ${isError ? 'error' : ''} ${visible ? 'show' : ''}`}>
      {message}
    </div>
  );
}