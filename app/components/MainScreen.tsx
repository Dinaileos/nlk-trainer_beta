'use client';

import { useState, useEffect } from 'react';
import { useAuthStore, useDictionariesStore } from '@/lib/store';
import * as storage from '@/lib/storage';

interface Dictionary {
  id: string;
  name: string;
  words: any[];
  isDefault?: boolean;
  plusDictionary?: {
    name: string;
    words: any[];
    wordErrors?: Record<string, number>;
    gamesHistory?: any[];
  };
  wordErrors?: Record<string, number>;
}

interface MainScreenProps {
  onNavigate: (screen: 'main' | 'editor' | 'exercise' | 'stats' | 'editorPlus' | 'quickMode', dictIndex?: number) => void;
  showToast: (message: string, isError?: boolean) => void;
}

export default function MainScreen({ onNavigate, showToast }: MainScreenProps) {
  const { user } = useAuthStore();
  const { dictionaries, defaultDictionaries, loadDictionaries, setCurrentDict, createDictionary } = useDictionariesStore();
  const [flippedCards, setFlippedCards] = useState<Set<number>>(new Set());
  const [newDictModalOpen, setNewDictModalOpen] = useState(false);
  const [newDictName, setNewDictName] = useState('');

  useEffect(() => {
    loadDictionaries();
  }, [loadDictionaries]);

  const handleCreateDict = async () => {
    const name = newDictName.trim();
    if (!name) {
      showToast('Введите название словаря', true);
      return;
    }
    
    // Проверка уникальности
    const nameLower = name.toLowerCase();
    const exists = dictionaries.some(d => d.name.toLowerCase() === nameLower);
    if (exists) {
      showToast('Словарь с таким названием уже существует', true);
      return;
    }
    
    const userId = user?.uid || 'demo';
    const newDictId = await createDictionary(userId, name);
    if (newDictId) {
      setNewDictModalOpen(false);
      setNewDictName('');
      const newIndex = dictionaries.length;
      setCurrentDict(newIndex);
      onNavigate('editor', newIndex);
    } else {
      showToast('Ошибка создания', true);
    }
  };

  const handleDefaultDictClick = (index: number) => {
    setCurrentDict(-1 - index); // Negative for default dicts
    onNavigate('exercise', -1 - index);
  };

  const handleUserDictClick = (index: number, event: React.MouseEvent) => {
    if ((event.target as HTMLElement).closest('.dict-card-btn') || 
        (event.target as HTMLElement).closest('.plus-btn') ||
        (event.target as HTMLElement).closest('.back-to-main-btn')) {
      return;
    }
    storage.setCurrentMode('main');
    setCurrentDict(index);
    onNavigate('exercise', index);
  };

  const handlePlusCardClick = (index: number, event: React.MouseEvent) => {
    event.stopPropagation();
    const flipBtn = (event.target as HTMLElement).closest('.flip-btn');
    if (!flipBtn) return;
    
    const dict = dictionaries[index];
    
    // Защита базовых словарей
    if (dict?.isDefault && !useAuthStore.getState().isAdmin()) {
      showToast('Базовые словари может редактировать только администратор', true);
      return;
    }
    
    // Если словаря+ нет - создаём его
    if (!dict.plusDictionary) {
      useDictionariesStore.getState().updateDictionary(dict.id, {
        plusDictionary: {
          name: dict.name + '+',
          words: [],
          wordErrors: {},
          gamesHistory: []
        }
      });
      showToast('Словарь+ создан');
    }
    
    setFlippedCards(prev => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  };

  const createNewDictionary = () => {
    if (!user) {
      showToast('Войдите в аккаунт для создания словарей', true);
      return;
    }
    setNewDictModalOpen(true);
  };

  const handleCardFlip = (index: number, event: React.MouseEvent) => {
    event.stopPropagation();
    const flipBtn = (event.target as HTMLElement).closest('.flip-btn');
    if (!flipBtn) return;
    
    setFlippedCards(prev => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  };

  const handleEditDictionary = (index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const dict = dictionaries[index];
    
    // Защита базовых словарей
    if (dict?.isDefault && !useAuthStore.getState().isAdmin()) {
      showToast('Базовые словари может редактировать только администратор', true);
      return;
    }
    
    setCurrentDict(index);
    onNavigate('editor', index);
  };

  const handleDeleteDictionary = (index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const dict = dictionaries[index];
    
    // Защита базовых словарей
    if (dict?.isDefault) {
      if (!useAuthStore.getState().isAdmin()) {
        showToast('Базовые словари может редактировать только администратор', true);
        return;
      }
      if (!confirm('Вы уверены, что хотите удалить базовый словарь? Это действие нельзя отменить.')) {
        return;
      }
    } else if (confirm(`Удалить словарь "${dictionaries[index].name}"?`)) {
      useDictionariesStore.getState().deleteDictionary(dictionaries[index].id);
      showToast('Словарь удалён');
    }
  };

  return (
    <div className="screen active" id="mainScreen">
      <div className="dictionary-grid">
        {/* Default dictionaries */}
        {defaultDictionaries.map((dict, idx) => (
          <div 
            key={`default-${dict.id}`}
            className="dict-card default"
            style={{ position: 'relative' }}
            onClick={() => handleDefaultDictClick(idx)}
          >
            <span className="dict-card-label">Базовый</span>
            <div className="dict-card-title">{dict.name}</div>
            <div className="dict-card-count">{dict.words.length} слов</div>
          </div>
        ))}

        {/* User dictionaries */}
        {user && dictionaries.map((dict, idx) => {
          const wordErrorsCount = dict.wordErrors ? Object.values(dict.wordErrors).reduce((a, b) => a + b, 0) : 0;
          const hasErrors = wordErrorsCount > 0;
          const hasPlus = dict.plusDictionary?.words && dict.plusDictionary.words.length > 0;
          const isFlipped = flippedCards.has(idx);
// Load stats for record
          const localStats = storage.getStats(dict.id);
          let record = '-';
          if (localStats.games && localStats.games.length > 0) {
            const errors = localStats.games.map((g: any) => g.errors);
            record = Math.min(...errors) === 0 ? '0' : String(Math.min(...errors));
          }
          
          // For dictionaries without plus, calculate record directly
          let recForNoPlus = record;

if (hasPlus) {
            return (
              <div key={dict.id} className="dict-card-flip-wrapper" style={{ perspective: '1000px', width: '200px', height: '180px' }}>
                <div 
                  style={{ 
                    width: '100%', 
                    height: '100%', 
                    transition: 'transform 0.6s',
                    transformStyle: 'preserve-3d',
                    transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)'
                  }}
                >
                  <div 
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '200px',
                      height: '180px',
                      backfaceVisibility: 'hidden',
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border-gray)',
                      borderRadius: '8px',
                      padding: '16px',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer'
                    }}
                    onClick={() => { storage.setCurrentMode('main'); setCurrentDict(idx); onNavigate('exercise', idx); }}
                  >
                    <div className="dict-card-title">{dict.name}</div>
                    <div className="dict-card-count">{dict.words.length} слов</div>
                    <div className="dict-card-record">
                      {record === '-' ? 'Рекорд: -' : record === '0' ? <span style={{ color: '#FFD700', fontWeight: 'bold' }}>Идеально</span> : `Рекорд: ${record}`}
                    </div>
                    {hasErrors && (
                      <div style={{ color: '#f5a623', fontSize: '12px' }}>
                        {wordErrorsCount} ошибок
                      </div>
                    )}
                    <button 
                      className="flip-btn"
                      onClick={(e) => handlePlusCardClick(idx, e)}
                      title="Открыть словарь+"
                    >
                      ↻
                    </button>
                    <div style={{ position: 'absolute', top: '8px', right: '8px', display: 'flex', gap: '4px' }}>
                      <button className="dict-card-btn-small edit" onClick={(e) => handleEditDictionary(idx, e)} title="Изменить" />
                      <button className="dict-card-btn-small delete" onClick={(e) => handleDeleteDictionary(idx, e)} title="Удалить" />
                    </div>
                  </div>
                  <div 
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '200px',
                      height: '180px',
                      backfaceVisibility: 'hidden',
                      background: 'var(--bg-surface)',
                      border: '2px solid #f5a623',
                      borderRadius: '8px',
                      padding: '16px',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transform: 'rotateY(180deg)'
                    }}
                    onClick={() => { storage.setCurrentMode('plus'); setCurrentDict(idx); onNavigate('exercise', idx); }}
                  >
                    <div className="dict-card-title" style={{ color: '#f5a623' }}>{dict.name}+</div>
                    <div className="dict-card-count">{dict.plusDictionary?.words.length || 0} слов</div>
                    {dict.plusDictionary?.gamesHistory && dict.plusDictionary.gamesHistory.length > 0 && (
                      (() => {
                        const errors = dict.plusDictionary.gamesHistory.map((g: any) => g.errors || 0);
                        const minErrors = Math.min(...errors);
                        return <div className="dict-card-record">
                          {minErrors === 0 ? <span style={{ color: '#FFD700', fontWeight: 'bold' }}>Идеально</span> : `Рекорд: ${minErrors}`}
                        </div>;
                      })()
                    )}
                    <button 
                      className="flip-btn"
                      onClick={(e) => handleCardFlip(idx, e)}
                      title="Назад"
                    >
                      ←
                    </button>
                  </div>
                </div>
              </div>
            );
          }

          return (
            <div
              key={dict.id}
              className="dict-card saved"
              onClick={(e) => handleUserDictClick(idx, e)}
              style={{ position: 'relative' }}
            >
              <div className="dict-card-title">{dict.name}</div>
              <div className="dict-card-count">{dict.words.length} слов</div>
              <div className="dict-card-record">
                {recForNoPlus === '-' ? 'Рекорд: -' : recForNoPlus === '0' ? <span style={{ color: '#FFD700', fontWeight: 'bold' }}>Идеально</span> : `Рекорд: ${recForNoPlus}`}
              </div>
              <div style={{ 
                position: 'absolute', 
                top: '8px', 
                right: '8px',
                display: 'flex', 
                gap: '4px' 
              }}>
                <button 
                  className="dict-card-btn-small edit" 
                  onClick={(e) => handleEditDictionary(idx, e)}
                  title="Изменить"
                />
                <button 
                  className="dict-card-btn-small delete" 
                  onClick={(e) => handleDeleteDictionary(idx, e)}
                  title="Удалить"
                />
              </div>
            </div>
          );
        })}

        {/* Add card */}
        {user && dictionaries.length < 5 ? (
          <div className="dict-card add-card" onClick={createNewDictionary}>
            <div className="add-icon"></div>
            <div className="add-text">Добавить словарь</div>
          </div>
        ) : user ? (
          <div className="dict-card" style={{ opacity: 0.5, cursor: 'not-allowed' }}>
            <div className="add-icon"></div>
            <div className="add-text">Лимит: максимум 5 словарей</div>
          </div>
        ) : (
          <div 
            className="dict-card" 
            onClick={() => showToast('Войдите в аккаунт для создания словарей')}
            style={{ opacity: 0.7 }}
          >
            <div className="add-icon"></div>
            <div className="add-text">Войдите для создания словарей</div>
          </div>
        )}
      </div>

      {/* Create Dictionary Modal */}
      {newDictModalOpen && (
        <div className="modal-overlay active" onClick={() => setNewDictModalOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close-icon" onClick={() => setNewDictModalOpen(false)}>×</button>
            <div className="modal-title">Название словаря</div>
            <input
              type="text"
              className="modal-input"
              value={newDictName}
              onChange={(e) => setNewDictName(e.target.value)}
              placeholder="Введите название..."
              autoFocus
              onKeyPress={(e) => e.key === 'Enter' && handleCreateDict()}
            />
            <div className="controls" style={{ gap: '12px', marginTop: '16px' }}>
              <button className="btn btn-primary" onClick={handleCreateDict}>Создать</button>
              <button className="btn btn-secondary" onClick={() => setNewDictModalOpen(false)}>Отмена</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}