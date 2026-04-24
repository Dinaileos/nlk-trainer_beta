'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useDictionariesStore, useEditorStore } from '@/lib/store';

interface Merge { start: number; end: number; }

interface QuickInputScreenProps {
  dictId: string;
  initialWords: string[];
  onNavigate: (screen: 'main' | 'editor' | 'exercise' | 'stats' | 'editorPlus' | 'quickMode') => void;
  showToast: (message: string, isError?: boolean) => void;
}

export default function QuickInputScreen({ dictId, initialWords, onNavigate, showToast }: QuickInputScreenProps) {
  const { dictionaries } = useDictionariesStore();
  const dictionary = dictionaries.find(d => d.id === dictId);
  
  const [wordsQueue, setWordsQueue] = useState<string[]>([]);
  const [currentWord, setCurrentWord] = useState('');
  const [cellVariants, setCellVariants] = useState({} as Record<string, string[]>);
  const [mergedCells, setMergedCells] = useState<Merge[]>([]);
  const [plusCells, setPlusCells] = useState<number[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  
  const [dragHoverIndex, setDragHoverIndex] = useState<number | null>(null);
  const [dragHoverAfter, setDragHoverAfter] = useState(false);
  const [dragStartIndex, setDragStartIndex] = useState<number>(-1);
  const [isDragging, setIsDragging] = useState(false);
  const [variantModalOpen, setVariantModalOpen] = useState(false);
  const [variantModalCellIndex, setVariantModalCellIndex] = useState<number>(-1);
  
  const cellsContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (dictionary && initialWords.length > 0) {
      const existingWords = new Set(dictionary.words.map((w: any) => w.word));
      const filtered = initialWords.filter(w => !existingWords.has(w.trim()));
      setWordsQueue(filtered);
      if (filtered.length > 0) {
        setCurrentWord(filtered[0]);
      }
    }
  }, [dictionary, initialWords]);

  const currentWordData = wordsQueue[currentIndex] || '';

  const renderCells = () => {
    const text = currentWord;
    if (!text) return [];

    const validMerges = mergedCells.filter(pair => 
      pair.start < text.length && pair.end < text.length
    );

    const validPlusCells = plusCells.filter(idx => idx >= 0 && idx <= text.length);

    const cells: JSX.Element[] = [];
    let displayIndex = 0;

    for (let i = 0; i < text.length; i++) {
      const pair = validMerges.find(p => p.start === i);
      
      if (pair) {
        const cell = (
          <div 
            key={'merged-' + i}
            className={'cell merged' + (dragHoverIndex === pair.start ? ' drag-over' : '')}
            data-index={displayIndex}
            data-start={pair.start}
            data-end={pair.end}
            onClick={(e) => {
              if (e.shiftKey) {
                splitCell(pair);
              } else {
                openVariantModal(pair.start);
              }
            }}
            onPointerDown={(e) => handleCellPointerDown(e as any, pair.start)}
            onPointerEnter={() => handleCellPointerEnter(pair.start)}
            onPointerUp={(e) => handleCellPointerUp(e as any, pair.start)}
            onDragOver={(e) => { 
              e.preventDefault(); 
              e.stopPropagation(); 
              handleCellsContainerDragOver(e as any, pair.start); 
            }}
            onDragEnter={(e) => { 
              e.preventDefault(); 
              e.stopPropagation(); 
              handleCellsContainerDragOver(e as any, pair.start); 
            }}
            onDrop={(e) => { 
              e.preventDefault(); 
              e.stopPropagation(); 
              handleCellsContainerDrop(e as any); 
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              splitCell(pair);
            }}
            title="Shift+клик для разделения"
          >
            <div className="merged-letters">
              {text.substring(pair.start, pair.end + 1).split('').map((char, idx) => (
                <span key={idx} className="cell-letter">
                  {char === ' ' ? '\u00A0' : char}
                </span>
              ))}
            </div>
            {getAllVariantsForMerge(pair).length > 0 && (
              <div className="cell-variants">
                {getAllVariantsForMerge(pair).map((v, idx) => (
                  <span key={idx} className="cell-variant">{v}</span>
                ))}
              </div>
            )}
          </div>
        );
        cells.push(cell);

        if (validPlusCells.includes(pair.end + 1)) {
          cells.push(renderPlusCell(pair.end + 1));
        }

        i = pair.end;
        displayIndex++;
        continue;
      }

      const char = text[i];
      const variants = cellVariants[i] || [];
      
      const cell = (
        <div 
          key={'cell-' + i}
          className={'cell' + (variants.length > 0 ? ' has-variants' : '') + (dragHoverIndex === i && !dragHoverAfter ? ' drag-over' : '') + (dragHoverIndex === i && dragHoverAfter ? ' drag-over-next' : '')}
          data-index={i}
          onPointerDown={(e) => handleCellPointerDown(e, i)}
          onPointerEnter={() => handleCellPointerEnter(i)}
          onPointerUp={(e) => handleCellPointerUp(e, i)}
          onClick={(e) => {
            if (e.shiftKey) {
              handleCellPointerDown(e as any, i);
            } else {
              openVariantModal(i);
            }
          }}
          onDragOver={(e) => {
            if (i < currentWord.length - 1) handleCellsContainerDragOver(e as any, i);
          }}
          onDragEnter={(e) => {
            if (i < currentWord.length - 1) handleCellsContainerDragOver(e as any, i);
          }}
          onDrop={(e) => handleCellsContainerDrop(e as any)}
          title="Shift+клик для объединения"
        >
          <span className="cell-letter">{char === ' ' ? '\u00A0' : char}</span>
          {variants.length > 0 && (
            <div className="cell-variants">
              {variants.map((v, idx) => (
                <span key={idx} className="cell-variant">{v}</span>
              ))}
            </div>
          )}
        </div>
      );
      cells.push(cell);

      if (validPlusCells.includes(i + 1)) {
        cells.push(renderPlusCell(i + 1));
      }

      displayIndex++;
    }

    return cells;
  };

  const renderPlusCell = (index: number) => {
    const plusVariants = cellVariants['+' + index] || [];
    return (
      <div 
        key={'plus-' + index}
        className={'cell plus-cell' + (plusVariants.length > 0 ? ' has-variants' : '') + (dragHoverIndex === index ? ' drag-over' : '')}
        data-index={index}
        onDragOver={(e) => {
          if (index < currentWord.length) handleCellsContainerDragOver(e as any, index);
        }}
        onDragEnter={(e) => {
          if (index < currentWord.length) handleCellsContainerDragOver(e as any, index);
        }}
        onDrop={(e) => handleCellsContainerDrop(e as any)}
        onClick={(e) => {
          if (e.shiftKey) {
            setPlusCells(plusCells.filter(p => p !== index));
            const newVariants = { ...cellVariants };
            delete newVariants['+' + index];
            setCellVariants(newVariants);
          } else {
            openVariantModal(index, true);
          }
        }}
      >
        <span className="cell-letter">+</span>
        {plusVariants.length > 0 && (
          <div className="cell-variants">
            {plusVariants.map((v, idx) => (
              <span key={idx} className="cell-variant">{v}</span>
            ))}
          </div>
        )}
      </div>
    );
  };

  const getAllVariantsForMerge = (pair: Merge): string[] => {
    const variants: string[] = [];
    for (let j = pair.start; j <= pair.end; j++) {
      if (cellVariants[j] && cellVariants[j].length > 0) {
        variants.push(...cellVariants[j]);
      }
    }
    return [...new Set(variants)];
  };

  const handleCellPointerDown = (e: React.PointerEvent, index: number) => {
    if (e.shiftKey) return;
    setDragStartIndex(index);
    setIsDragging(false);
  };

  const handleCellPointerEnter = (index: number) => {
    if (dragStartIndex !== -1 && dragStartIndex !== index) {
      setIsDragging(true);
    }
  };

  const handleCellPointerUp = (e: React.PointerEvent, index: number) => {
    if (isDragging && dragStartIndex !== -1 && dragStartIndex !== index) {
      const targetCell = (e.target as HTMLElement).closest('.cell');
      if (targetCell) {
        const targetStart = parseInt(targetCell.getAttribute('data-start') || targetCell.getAttribute('data-index') || '-1');
        if (targetStart !== -1 && Math.abs(dragStartIndex - targetStart) === 1) {
          mergeCells(Math.min(dragStartIndex, targetStart), Math.max(dragStartIndex, targetStart));
        }
      }
    }
    setDragStartIndex(-1);
    setIsDragging(false);
  };

  const mergeCells = (start: number, end: number) => {
    const text = currentWord;
    if (!text) return;
    
    const hasOverlap = mergedCells.some(pair => 
      (start >= pair.start && start <= pair.end) ||
      (end >= pair.start && end <= pair.end)
    );
    if (hasOverlap) return;

    setMergedCells([...mergedCells, { start, end }]);
  };

  const splitCell = (pair: Merge) => {
    setMergedCells(mergedCells.filter(p => p !== pair));
  };

  const openVariantModal = (index: number, isPlus = false) => {
    setVariantModalCellIndex(index);
    setVariantModalOpen(true);
    
    const text = currentWord;
    let correctVariant = '';
    
    if (isPlus) {
      correctVariant = '+';
    } else {
      const pair = mergedCells.find(p => p.start === index);
      if (pair) {
        correctVariant = text.substring(pair.start, pair.end + 1);
      } else {
        correctVariant = text[index] || '';
      }
    }

    const key = isPlus ? '+' + index : index.toString();
    if (!cellVariants[key] || cellVariants[key].length === 0) {
      setCellVariants({ ...cellVariants, [key]: [correctVariant] });
    } else if (cellVariants[key][0] !== correctVariant) {
      const newVariants = { ...cellVariants };
      newVariants[key] = [correctVariant, ...cellVariants[key]];
      setCellVariants(newVariants);
    }
  };

  const handleCellsContainerDragOver = (e: any, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    e.stopPropagation();
    setDragHoverIndex(index);
    setDragHoverAfter(false);
  };

  const handleCellsContainerDrop = (e: any) => {
    e.preventDefault();
    e.stopPropagation();
    const cell = (e.target as HTMLElement).closest('.cell');
    if (!cell) return;
    
    const indexAttr = cell.getAttribute('data-index');
    const startAttr = cell.getAttribute('data-start');
    
    let afterIndex: number;
    
    if (startAttr) {
      const endAttr = cell.getAttribute('data-end');
      if (!endAttr) return;
      afterIndex = parseInt(endAttr) + 1;
    } else if (indexAttr) {
      afterIndex = parseInt(indexAttr) + 1;
    } else {
      return;
    }
    
    if (afterIndex >= currentWord.length) return;
    
    if (!plusCells.includes(afterIndex)) {
      setPlusCells([...plusCells, afterIndex].sort((a, b) => a - b));
      setCellVariants({ ...cellVariants, ['+' + afterIndex]: ['+', '-', '/'] });
    }
    setDragHoverIndex(null);
  };

  const handlePlusToolDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('text/plain', '+');
    e.dataTransfer.effectAllowed = 'copy';
  };

  const handleDragEnd = () => {
    setDragHoverIndex(null);
    setDragHoverAfter(false);
  };

  const goToNext = useCallback(async (save: boolean = true) => {
    if (save) {
      const hasAnyVariants = Object.keys(cellVariants).some(key => {
        const vars = cellVariants[key];
        return vars && vars.length > 0;
      });
      
      if (!hasAnyVariants) {
        showToast('Добавьте варианты ответов', true);
        return;
      }

      // Sync to editor store and use saveWord
      useEditorStore.setState({ currentWord, cellVariants, mergedCells, plusCells });
      const result = await useEditorStore.getState().saveWord(dictId);
      
      if (result.success) {
        showToast('Слово сохранено!');
      } else {
        showToast(result.error || 'Ошибка сохранения', true);
        return;
      }
    }

    const nextIdx = currentIndex + 1;
    if (nextIdx >= wordsQueue.length) {
      onNavigate('editor');
      return;
    }

    setCurrentIndex(nextIdx);
    setCurrentWord(wordsQueue[nextIdx]);
    setCellVariants({});
    setMergedCells([]);
    setPlusCells([]);
    setDragHoverIndex(null);
  }, [currentIndex, wordsQueue, currentWord, cellVariants, mergedCells, plusCells, dictId, dictionary, showToast, onNavigate]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === ' ') {
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
        e.preventDefault();
        goToNext(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goToNext]);

  if (!dictionary) {
    return (
      <div className="screen active" id="quickInputScreen">
        <div className="quick-mode-header">
          <button className="quick-mode-btn" onClick={() => onNavigate('editor')}>
            ← Назад
          </button>
        </div>
        <div className="editor-container">
          <p>Словарь не найден</p>
        </div>
      </div>
    );
  }

  if (wordsQueue.length === 0) {
    return (
      <div className="screen active" id="quickInputScreen">
        <div className="quick-mode-header">
          <button className="quick-mode-btn" onClick={() => onNavigate('editor')}>
            ← Назад
          </button>
        </div>
        <div className="editor-container">
          <p>Все слова уже есть в словаре или список пуст</p>
        </div>
      </div>
    );
  }

  if (currentIndex >= wordsQueue.length) {
    return (
      <div className="screen active" id="quickInputScreen">
        <div className="quick-mode-header">
          <button className="quick-mode-btn" onClick={() => onNavigate('editor')}>
            ← Назад
          </button>
        </div>
        <div className="editor-container">
          <p>Все слова обработаны! ({wordsQueue.length} слов)</p>
          <button className="btn btn-primary" onClick={() => onNavigate('editor')}>
            В редактор
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="screen active" id="quickInputScreen">
      <div className="quick-mode-header">
        <button className="quick-mode-btn" onClick={() => onNavigate('editor')}>
          ← Назад
        </button>
        <span style={{ color: 'var(--text-secondary)' }}>
          {currentIndex + 1} / {wordsQueue.length}
        </span>
        <button className="quick-mode-btn" onClick={() => goToNext(false)}>
          Пропустить →
        </button>
      </div>

      <div className="editor-container">
        <div className="dict-name-display">
          <span className="dict-name-text">{dictionary.name}</span>
        </div>

        <div className="tool-bar">
          <div 
            className="plus-tool" 
            draggable 
            onDragStart={handlePlusToolDragStart}
            onDragEnd={handleDragEnd}
            title="Перетащите + между буквами для создания вариантов"
          >
            +
          </div>
        </div>

        <div 
          className="cells-container" 
          ref={cellsContainerRef}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = currentWord ? 'copy' : 'none';
          }}
          onDrop={handleCellsContainerDrop}
        >
          {renderCells()}
        </div>

        <div className="controls" style={{ justifyContent: 'center' }}>
          <button className="btn btn-primary" onClick={() => goToNext(true)}>
            Сохранить (Пробел)
          </button>
          <button className="btn btn-secondary" onClick={() => goToNext(false)}>
            Следующее
          </button>
        </div>
      </div>

      {variantModalOpen && (
        <QuickInputVariantModal
          cellIndex={variantModalCellIndex}
          onClose={() => setVariantModalOpen(false)}
          cellVariants={cellVariants}
          setCellVariants={setCellVariants}
          showToast={showToast}
        />
      )}
    </div>
  );
}

function QuickInputVariantModal({
  cellIndex,
  onClose,
  cellVariants,
  setCellVariants,
  showToast
}: {
  cellIndex: number;
  onClose: () => void;
  cellVariants: Record<string, string[]>;
  setCellVariants: (v: Record<string, string[]>) => void;
  showToast: (msg: string, isError?: boolean) => void;
}) {
  const [inputValue, setInputValue] = useState('');
  const key = cellIndex.toString();
  const variants = cellVariants[key] || [];

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (variants.length < 2) {
          const newVariantsObj = { ...cellVariants };
          delete newVariantsObj[key];
          setCellVariants(newVariantsObj);
        }
        onClose();
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose, variants, cellVariants, key]);

  const handleAddVariant = () => {
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
    
    setCellVariants({ ...cellVariants, [key]: [...variants, value] });
    setInputValue('');
  };

  const handleDeleteVariant = (idx: number) => {
    const newVariants = [...variants];
    newVariants.splice(idx, 1);
    if (newVariants.length < 2) {
      const newVariantsObj = { ...cellVariants };
      delete newVariantsObj[key];
      setCellVariants(newVariantsObj);
    } else {
      setCellVariants({ ...cellVariants, [key]: newVariants });
    }
  };

  const handleClose = () => {
    if (variants.length < 2) {
      const newVariantsObj = { ...cellVariants };
      delete newVariantsObj[key];
      setCellVariants(newVariantsObj);
    }
    onClose();
  };

  return (
    <div className="modal-overlay active" onClick={handleClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close-icon" onClick={handleClose}>×</button>
        <div className="modal-title">Варианты ответа</div>
        
        {variants.length < 3 && (
          <div className="modal-add-row">
            <input 
              type="text" 
              className="modal-input" 
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Введите вариант..."
              onKeyPress={(e) => e.key === 'Enter' && handleAddVariant()}
            />
            <button className="modal-btn" onClick={handleAddVariant}>Добавить</button>
          </div>
        )}

        <div className="variants-list">
          {variants.map((variant, idx) => (
            <div key={idx} className={'variant-item' + (idx === 0 ? ' correct' : '')}>
              {idx === 0 && <span className="variant-label">Правильный</span>}
              <input 
                type="text" 
                value={variant} 
                readOnly={idx === 0}
                className={idx === 0 ? 'correct-input' : ''}
              />
              {idx !== 0 && (
                <button className="variant-delete" onClick={() => handleDeleteVariant(idx)}>
                  Удалить
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}