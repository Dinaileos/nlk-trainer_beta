'use client';

import { useState, useEffect } from 'react';
import { useDictionariesStore, useEditorStore } from '@/lib/store';

interface DictListModalProps {
  isOpen: boolean;
  onClose: () => void;
  showToast: (message: string, isError?: boolean) => void;
  onEditWord?: () => void;
}

interface WordToEdit {
  id: string;
  word: string;
  variants: Record<string, string[]>;
  merges: { start: number; end: number }[];
  plusCells: number[];
}

export default function DictListModal({ isOpen, onClose, showToast, onEditWord }: DictListModalProps) {
  const { dictionaries, currentDictIndex, loadDictionaries, deleteWord } = useDictionariesStore();
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (isOpen) {
      loadDictionaries();
    }
  }, [isOpen, loadDictionaries]);

  const currentDict = currentDictIndex >= 0 ? dictionaries[currentDictIndex] : null;
  const words = currentDict?.words || [];

  const filteredWords = words.filter((w: any) => 
    w.word.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleEditWord = (word: WordToEdit) => {
    if (!currentDict || currentDict.isDefault) {
      showToast('Нельзя редактировать базовый словарь', true);
      return;
    }
    
    useEditorStore.getState().loadWord({
      id: word.id,
      word: word.word,
      variants: word.variants || {},
      merges: word.merges || [],
      plusCells: word.plusCells || [],
    });
    
    onClose();
    
    if (onEditWord) {
      onEditWord();
    }
    
    showToast('Редактируйте слово и нажмите "Сохранить"');
  };

  const handleDeleteWord = async (wordId: string, wordText: string) => {
    if (!currentDict) return;
    
    if (currentDict.isDefault) {
      showToast('Нельзя редактировать базовый словарь', true);
      return;
    }
    
    if (confirm(`Удалить слово "${wordText}"?`)) {
      const dict = dictionaries[currentDictIndex];
      const newWordCount = (dict?.words?.length || 1) - 1;
      
      await deleteWord(currentDict.id, wordId);
      showToast('Слово удалено');
      
      if (newWordCount === 0) {
        showToast('Словарь удалён (был пустым)');
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay active" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px' }}>
        <div className="modal-title">
          Слова в словаре: {currentDict?.name || 'Нет словаря'}
          {currentDict?.isDefault && <span style={{ fontSize: '12px', color: '#b3b3b3', marginLeft: '8px' }}>(базовый)</span>}
        </div>
        
        <input
          type="text"
          className="text-input"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Поиск..."
          style={{ marginBottom: 16 }}
        />
        
        <div className="variants-list" style={{ maxHeight: '400px', overflowY: 'auto' }}>
          {filteredWords.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '20px', color: '#b3b3b3' }}>
              {searchTerm ? 'Слова не найдены' : 'Словарь пуст'}
            </div>
          ) : (
            filteredWords.map((word: any, idx: number) => (
              <div key={word.id || idx} style={{ 
                padding: '12px', 
                background: '#1f1f1f', 
                borderRadius: '8px', 
                marginBottom: '8px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <div>
                  <span style={{ fontSize: '16px', fontWeight: 600 }}>{word.word}</span>
                  <span style={{ fontSize: '12px', color: '#b3b3b3', marginLeft: '8px' }}>
                    ({Object.keys(word.variants || {}).length} вариантов)
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {!currentDict?.isDefault && (
                    <>
                      <button 
                        className="dict-card-btn edit"
                        style={{ padding: '6px 12px', fontSize: '11px' }}
                        onClick={() => handleEditWord(word)}
                      >
                        Изменить
                      </button>
                      <button 
                        className="dict-card-btn delete"
                        style={{ padding: '6px 12px', fontSize: '11px' }}
                        onClick={() => handleDeleteWord(word.id, word.word)}
                      >
                        Удалить
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        <button className="modal-close" onClick={onClose} style={{ marginTop: '16px' }}>Закрыть</button>
      </div>
    </div>
  );
}