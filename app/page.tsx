'use client';

import { useState, useEffect } from 'react';
import { useAuthStore, useDictionariesStore } from '@/lib/store';
import { useOnlineStatus } from './components/OnlineStatusProvider';
import MainScreen from './components/MainScreen';
import EditorScreen from './components/EditorScreen';
import ExerciseScreen from './components/ExerciseScreen';
import StatsScreen from './components/StatsScreen';
import QuickInputScreen from './components/QuickInputScreen';
import EditorPlusScreen from './components/EditorPlusScreen';
import ProfileModal from './components/ProfileModal';
import VariantModal from './components/VariantModal';
import DictListModal from './components/DictListModal';
import QuickInputModal from './components/QuickInputModal';
import SettingsModal from './components/SettingsModal';
import Toast from './components/Toast';

type Screen = 'main' | 'editor' | 'exercise' | 'stats' | 'editorPlus' | 'quickMode';

export default function Home() {
  const [currentScreen, setCurrentScreen] = useState<Screen>('main');
  const [toast, setToast] = useState<{ message: string; isError: boolean } | null>(null);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [dictListModalOpen, setDictListModalOpen] = useState(false);
  const [quickInputData, setQuickInputData] = useState<{ dictId: string; words: string[] } | null>(null);
  
  const { user, isLoading, isInitialized, initialize } = useAuthStore();
  const { setCurrentDict } = useDictionariesStore();
  const { isOnline } = useOnlineStatus();

  useEffect(() => {
    initialize();
  }, [initialize]);

  const showToast = (message: string, isError = false) => {
    setToast({ message, isError });
    setTimeout(() => setToast(null), 3000);
  };

  const navigateTo = (screen: Screen, dictIndex?: number) => {
    if (screen === 'quickMode') {
      const data = (window as any).__quickInputData;
      if (data) {
        setQuickInputData(data);
        delete (window as any).__quickInputData;
      }
    }
    if ((screen === 'exercise' || screen === 'editor' || screen === 'editorPlus') && dictIndex !== undefined) {
      setCurrentDict(dictIndex);
    }
    setCurrentScreen(screen);
  };

  if (!isInitialized) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        background: '#121212',
        color: '#fff'
      }}>
        Загрузка...
      </div>
    );
  }

  return (
    <div className="app">
      {/* Offline indicator */}
      {!isOnline && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          background: '#f39c12',
          color: '#000',
          textAlign: 'center',
          padding: '8px',
          fontWeight: 600,
          zIndex: 1000,
        }}>
          📴 Оффлайн - изменения сохранятся при подключении
        </div>
      )}

      {/* Beta warning */}
      <div style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        background: '#1f1f1f',
        borderTop: '2px solid #f5a623',
        textAlign: 'center',
        padding: '12px',
        fontSize: '13px',
        color: '#b3b3b3',
        zIndex: 999,
      }}>
        ⚠️ Это бета-версия. Ваш прогресс может быть утерян. Рекомендуем периодически делать экспорт словарей.
      </div>
      
      {/* Header - показываем только на главном экране */}
      {currentScreen === 'main' && (
        <div className="header">
          <div></div>
          <div className="logo" onClick={() => navigateTo('main')}>kodeo_lesson</div>
          <button className="profile-btn" onClick={() => setProfileModalOpen(true)}>
            {user ? '👤' : '👤'}
          </button>
        </div>
      )}

      {/* Screens */}
      {currentScreen === 'main' && (
        <MainScreen 
          onNavigate={navigateTo}
          showToast={showToast}
        />
      )}
      
      {currentScreen === 'editor' && (
        <EditorScreen 
          onNavigate={navigateTo}
          showToast={showToast}
          onOpenDictList={() => setDictListModalOpen(true)}
        />
      )}
      
      {currentScreen === 'exercise' && (
        <ExerciseScreen 
          onNavigate={navigateTo}
          showToast={showToast}
        />
      )}
      
      {currentScreen === 'stats' && (
        <StatsScreen 
          onNavigate={navigateTo}
          showToast={showToast}
        />
      )}

      {currentScreen === 'editorPlus' && (
        <EditorPlusScreen 
          onNavigate={navigateTo}
          showToast={showToast}
        />
      )}

      {currentScreen === 'quickMode' && quickInputData && (
        <QuickInputScreen
          dictId={quickInputData.dictId}
          initialWords={quickInputData.words}
          onNavigate={(screen) => {
            setQuickInputData(null);
            navigateTo(screen);
          }}
          showToast={showToast}
        />
      )}

      {/* Modals */}
      <ProfileModal isOpen={profileModalOpen} onClose={() => setProfileModalOpen(false)} showToast={showToast} />
      <VariantModal showToast={showToast} />
      <DictListModal isOpen={dictListModalOpen} onClose={() => setDictListModalOpen(false)} showToast={showToast} onEditWord={() => navigateTo('editor')} />
      <QuickInputModal showToast={showToast} onNavigate={navigateTo} />
      <SettingsModal showToast={showToast} />

      {/* Toast */}
      {toast && <Toast message={toast.message} isError={toast.isError} />}
    </div>
  );
}