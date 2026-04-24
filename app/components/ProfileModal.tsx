'use client';

import { useState } from 'react';
import { useAuthStore } from '@/lib/store';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  showToast: (message: string, isError?: boolean) => void;
}

export default function ProfileModal({ isOpen, onClose, showToast }: ProfileModalProps) {
  const { user, login, register, logout } = useAuthStore();
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) {
      showToast('Заполните все поля', true);
      return;
    }
    setIsLoading(true);
    const result = await login(email, password);
    setIsLoading(false);
    if (result.success) {
      showToast('Добро пожаловать!');
      onClose();
    } else {
      showToast(result.error || 'Ошибка входа', true);
    }
  };

  const handleRegister = async () => {
    if (!username || !email || !password) {
      showToast('Заполните все поля', true);
      return;
    }
    if (password !== confirmPassword) {
      showToast('Пароли не совпадают', true);
      return;
    }
    setIsLoading(true);
    const result = await register(username, email, password);
    setIsLoading(false);
    if (result.success) {
      showToast('Аккаунт создан! Добро пожаловать!');
      onClose();
    } else {
      showToast(result.error || 'Ошибка регистрации', true);
    }
  };

  const handleLogout = async () => {
    await logout();
    showToast('Вы вышли из аккаунта');
    onClose();
  };

  const handleClose = () => {
    setIsLoginMode(true);
    setUsername('');
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="profile-modal active" onClick={(e) => {
      if (e.target === e.currentTarget) handleClose();
    }}>
      <div className="profile-modal-content" onClick={(e) => e.stopPropagation()}>
        {user ? (
          <div className="profile-logged-in">
            <h2>Профиль</h2>
            <div className="profile-user-info">
              <div className="profile-user-name">{user.username}</div>
              <div className="profile-stats">Email: {user.email}</div>
            </div>
            <div className="profile-buttons">
              <button className="btn btn-secondary" onClick={handleLogout}>Выйти</button>
              <button className="modal-close" onClick={handleClose}>Закрыть</button>
            </div>
          </div>
        ) : (
          <div className="profile-guest">
            <h2>Профиль</h2>
            <p className="profile-guest-notice">
              Вы играете как гость. Ваша статистика сохраняется только на этом устройстве.
            </p>
            {isLoginMode ? (
              <>
                <input
                  type="email"
                  className="text-input"
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <input
                  type="password"
                  className="text-input"
                  placeholder="Пароль"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button className="btn btn-primary" onClick={handleLogin} disabled={isLoading}>
                  {isLoading ? 'Вход...' : 'Войти'}
                </button>
                <button 
                  className="btn btn-secondary" 
                  onClick={() => setIsLoginMode(false)}
                  style={{ marginTop: 12 }}
                >
                  Регистрация
                </button>
              </>
            ) : (
              <>
                <input
                  type="text"
                  className="text-input"
                  placeholder="Имя пользователя"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
                <input
                  type="email"
                  className="text-input"
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <input
                  type="password"
                  className="text-input"
                  placeholder="Пароль"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <input
                  type="password"
                  className="text-input"
                  placeholder="Повторите пароль"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
                <button className="btn btn-primary" onClick={handleRegister} disabled={isLoading}>
                  {isLoading ? 'Регистрация...' : 'Зарегистрироваться'}
                </button>
                <button 
                  className="btn btn-secondary" 
                  onClick={() => setIsLoginMode(true)}
                  style={{ marginTop: 12 }}
                >
                  Войти
                </button>
              </>
            )}
            <button className="modal-close" onClick={handleClose}>Закрыть</button>
          </div>
        )}
      </div>
    </div>
  );
}