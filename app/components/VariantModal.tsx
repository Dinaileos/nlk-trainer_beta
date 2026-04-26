'use client';

import { useState, useEffect } from 'react';

interface VariantModalProps {
  cellIndex?: number;
  isOpen?: boolean;
  onClose?: () => void;
  cellVariants?: Record<string, string[]>;
  setCellVariants?: (v: Record<string, string[]>) => void;
  showToast: (message: string, isError?: boolean) => void;
}

export default function VariantModal({ 
  cellIndex: externalCellIndex, 
  isOpen: externalIsOpen, 
  onClose: externalOnClose,
  cellVariants: externalCellVariants,
  setCellVariants: externalSetCellVariants,
  showToast 
}: VariantModalProps) {
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const [internalCellIndex, setInternalCellIndex] = useState(-1);
  const [internalVariants, setInternalVariants] = useState<string[]>([]);
  
  const isOpen = externalIsOpen !== undefined ? externalIsOpen : internalIsOpen;
  const cellIndex = externalCellIndex !== undefined ? externalCellIndex : internalCellIndex;
  const variants = externalCellVariants && cellIndex !== undefined 
    ? externalCellVariants[cellIndex.toString()] || internalVariants 
    : internalVariants;
  
  const setIsOpen = (open: boolean) => {
    if (externalIsOpen === undefined) {
      setInternalIsOpen(open);
    }
  };
  
  const setCellIndex = (idx: number) => {
    if (externalCellIndex === undefined) {
      setInternalCellIndex(idx);
    }
  };
  
  const setVariants = (vars: string[]) => {
    if (externalCellVariants === undefined) {
      setInternalVariants(vars);
    }
  };
  
  const [inputValue, setInputValue] = useState('');

  // Sync variants when cellIndex changes
  useEffect(() => {
    if (externalCellVariants && cellIndex !== undefined) {
      const key = cellIndex.toString();
      const existing = externalCellVariants[key] || [];
      setVariants(existing);
    }
  }, [cellIndex, externalCellVariants]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
        externalOnClose?.();
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen]);

  const open = (index: number, existingVariants: string[]) => {
    setCellIndex(index);
    setVariants(existingVariants);
    setInputValue('');
    setIsOpen(true);
  };

  const handleAdd = () => {
    const value = inputValue.trim();
    if (!value) return;
    if (variants.length >= 3) {
      showToast('Максимум 3 варианта', true);
      return;
    }
    if (variants.some(v => v.toLowerCase() === value.toLowerCase())) {
      showToast('Такой вариант уже есть', true);
      return;
    }
    const newVariants = [...variants, value];
    setVariants(newVariants);
    
    // Update external state if provided
    if (externalCellVariants && externalSetCellVariants && cellIndex !== undefined) {
      const key = cellIndex.toString();
      externalSetCellVariants({ ...externalCellVariants, [key]: newVariants });
    }
    
    setInputValue('');
  };

  const handleDelete = (idx: number) => {
    const newVariants = [...variants];
    newVariants.splice(idx, 1);
    setVariants(newVariants);
    
    // Update external state if provided
    if (externalCellVariants && externalSetCellVariants && cellIndex !== undefined) {
      const key = cellIndex.toString();
      if (newVariants.length < 2) {
        const updated = { ...externalCellVariants };
        delete updated[key];
        externalSetCellVariants(updated);
      } else {
        externalSetCellVariants({ ...externalCellVariants, [key]: newVariants });
      }
    }
  };

  const close = () => {
    setIsOpen(false);
    externalOnClose?.();
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay active" onClick={close}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close-icon" onClick={close}>×</button>
        <div className="modal-title">Варианты ответа</div>
        <div className="modal-cell-content">
          <span className="cell-letter">{variants.length > 0 ? variants[0] : '?'}</span>
        </div>
        
        {variants.length < 3 && (
          <div className="modal-add-row">
            <input
              type="text"
              className="modal-input"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Введите вариант..."
              onKeyPress={(e) => e.key === 'Enter' && handleAdd()}
            />
            <button className="modal-btn" onClick={handleAdd}>Добавить</button>
          </div>
        )}

        <div className="variants-list">
          {variants.map((variant, idx) => (
            <div key={idx} className={`variant-item ${idx === 0 ? 'correct' : ''}`}>
              {idx === 0 && <span className="variant-label">Правильный</span>}
              <input
                type="text"
                value={variant}
                readOnly={idx === 0}
                className={idx === 0 ? 'correct-input' : ''}
              />
              {idx !== 0 && (
                <button className="variant-delete" onClick={() => handleDelete(idx)}>Удалить</button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export const useVariantModal = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [cellIndex, setCellIndex] = useState(-1);
  
  const open = (index: number) => {
    setCellIndex(index);
    setIsOpen(true);
  };
  
  const close = () => {
    setIsOpen(false);
  };
  
  return { isOpen, cellIndex, open, close };
};