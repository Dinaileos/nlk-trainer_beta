'use client';

import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { subscribeToOnlineStatus } from '@/lib/syncService';

interface OnlineStatusContextType {
  isOnline: boolean;
  isChecking: boolean;
}

const OnlineStatusContext = createContext<OnlineStatusContextType>({
  isOnline: true,
  isChecking: true,
});

export const useOnlineStatus = () => useContext(OnlineStatusContext);

interface OnlineStatusProviderProps {
  children: ReactNode;
}

export function OnlineStatusProvider({ children }: OnlineStatusProviderProps) {
  const [isOnline, setIsOnline] = useState(true);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    // Начальная проверка
    setIsOnline(navigator.onLine);
    setIsChecking(false);

    // Подписка на изменения
    const unsubscribe = subscribeToOnlineStatus((online) => {
      setIsOnline(online);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  return (
    <OnlineStatusContext.Provider value={{ isOnline, isChecking }}>
      {children}
    </OnlineStatusContext.Provider>
  );
}