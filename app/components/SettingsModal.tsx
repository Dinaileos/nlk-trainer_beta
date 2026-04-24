'use client';

import { useState } from 'react';
import { useAuthStore } from '@/lib/store';

interface SettingsModalProps {
  showToast: (message: string, isError?: boolean) => void;
}

export default function SettingsModal({ showToast }: SettingsModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [vibrationEnabled, setVibrationEnabled] = useState(true);
  const { user, updateSettings } = useAuthStore();

  const open = () => {
    setIsOpen(true);
  };

  const close = () => {
    setIsOpen(false);
  };

  const toggleSound = async () => {
    const newValue = !soundEnabled;
    setSoundEnabled(newValue);
    if (user) {
      await updateSettings({ sound: newValue });
    }
  };

  const toggleVibration = async () => {
    const newValue = !vibrationEnabled;
    setVibrationEnabled(newValue);
    if (user) {
      await updateSettings({ vibration: newValue });
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay active" onClick={close}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">Настройки</div>
        
        <div className="settings-content">
          <div className="settings-item">
            <span>Звук</span>
            <button 
              className={`settings-toggle ${soundEnabled ? '' : 'off'}`}
              onClick={toggleSound}
            >
              {soundEnabled ? 'Вкл' : 'Выкл'}
            </button>
          </div>
          <div className="settings-item">
            <span>Вибрация</span>
            <button 
              className={`settings-toggle ${vibrationEnabled ? '' : 'off'}`}
              onClick={toggleVibration}
            >
              {vibrationEnabled ? 'Вкл' : 'Выкл'}
            </button>
          </div>
        </div>

        <button className="modal-close" onClick={close}>Закрыть</button>
      </div>
    </div>
  );
}

export const useSettingsModal = () => {
  const [isOpen, setIsOpen] = useState(false);
  
  const open = () => setIsOpen(true);
  const close = () => setIsOpen(false);
  
  return { isOpen, open, close };
};