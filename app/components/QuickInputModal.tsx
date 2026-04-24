'use client';

import { useState } from 'react';

interface QuickInputModalProps {
  showToast: (message: string, isError?: boolean) => void;
  onNavigate: (screen: 'main' | 'editor' | 'exercise' | 'stats' | 'editorPlus' | 'quickMode') => void;
}

export default function QuickInputModal({ showToast, onNavigate }: QuickInputModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [wordsInput, setWordsInput] = useState('');

  const open = () => {
    setWordsInput('');
    setIsOpen(true);
  };

  const close = () => {
    setIsOpen(false);
  };

  const handleStart = () => {
    const rawWords = wordsInput.split(',').map(w => w.trim()).filter(w => w.length > 0);
    
    if (rawWords.length === 0) {
      showToast('Введите хотя бы одно слово', true);
      return;
    }

    close();
    onNavigate('quickMode');
    // The parent component would handle the words
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay active" onClick={close}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">Быстрый ввод</div>
        
        <div className="input-wrapper">
          <label>Введите слова через запятую</label>
          <textarea
            className="modal-input"
            id="quickWordsInput"
            rows={6}
            placeholder="слово1, слово2, слово3..."
            value={wordsInput}
            onChange={(e) => setWordsInput(e.target.value)}
            style={{ 
              width: '100%', 
              padding: '12px 16px', 
              background: 'var(--bg-deep)', 
              border: '1px solid var(--border-gray)', 
              borderRadius: '6px', 
              fontSize: '14px', 
              color: 'var(--text-primary)', 
              fontFamily: 'inherit', 
              resize: 'vertical', 
              outline: 'none'
            }}
          />
        </div>
        
        <div className="controls">
          <button className="btn btn-primary" onClick={handleStart}>Начать</button>
          <button className="btn btn-secondary" onClick={close}>Отмена</button>
        </div>
      </div>
    </div>
  );
}