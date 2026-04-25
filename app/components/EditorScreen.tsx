'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuthStore, useDictionariesStore, useEditorStore } from '@/lib/store';
import * as storage from '@/lib/storage';
import VariantModal from './VariantModal';

export interface EditorScreenProps {
  onNavigate: (screen: 'main' | 'editor' | 'exercise' | 'stats' | 'editorPlus' | 'quickMode') => void;
  showToast: (message: string, isError?: boolean) => void;
  onOpenDictList?: () => void;
}

interface Merge { start: number; end: number; }

export default function EditorScreen({ onNavigate, showToast, onOpenDictList }: EditorScreenProps) {
  const { user } = useAuthStore();
  const { dictionaries, currentDictIndex, createDictionary, updateDictionary, deleteDictionary } = useDictionariesStore();
  const [dictName, setDictName] = useState('');
  const [currentWord, setCurrentWord] = useState('');
  const [cellVariants, setCellVariants] = useState({} as Record<string, string[]>);
  const [mergedCells, setMergedCells] = useState<Merge[]>([]);
  const [plusCells, setPlusCells] = useState<number[]>([]);
  const [currentDictId, setCurrentDictId] = useState<string | null>(null);
  const [dragHoverIndex, setDragHoverIndex] = useState<number | null>(null);
  const [dragHoverAfter, setDragHoverAfter] = useState<boolean>(false);
  
  const cellsContainerRef = useRef<HTMLDivElement | null>(null);
  const [dragStartIndex, setDragStartIndex] = useState<number>(-1);
  const [isDragging, setIsDragging] = useState(false);
  const [variantModalOpen, setVariantModalOpen] = useState(false);
  const [variantModalCellIndex, setVariantModalCellIndex] = useState<number>(-1);
const [dictListOpen, setDictListOpen] = useState(false);
  const saveBtnRef = useRef<HTMLButtonElement | null>(null);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState('');
  const [quickInputModalOpen, setQuickInputModalOpen] = useState(false);
  const [quickInputWords, setQuickInputWords] = useState('');
  const [editingWordId, setEditingWordId] = useState<string | null>(null);

  // Привязываем кнопку к ref
  useEffect(() => {
    const btn = document.querySelector('.editor-container .btn.btn-primary') as HTMLButtonElement;
    if (btn && saveBtnRef.current === null) {
      saveBtnRef.current = btn;
    }
  }, []);

  // Синхронизация с editorStore для редактирования
  const editorWord = useEditorStore((state) => state.currentWord);
  const editorEditingId = useEditorStore((state) => state.editingWordId);
  const editorVariants = useEditorStore((state) => state.cellVariants);
  const editorMerges = useEditorStore((state) => state.mergedCells);
  const editorPlusCells = useEditorStore((state) => state.plusCells);

  useEffect(() => {
    if (editorWord) {
      setCurrentWord(editorWord);
      setCellVariants(editorVariants);
      setMergedCells(editorMerges);
      setPlusCells(editorPlusCells);
      if (editorEditingId) {
        setEditingWordId(editorEditingId);
      }
    }
  }, [editorWord, editorEditingId, editorVariants, editorMerges, editorPlusCells]);

  // Space = сохранить слово
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === ' ') {
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
          return;
        }
        e.preventDefault();
        // Попробовать найти кнопку по ref или через querySelector
        const btn = saveBtnRef.current || document.querySelector('.editor-container .btn.btn-primary') as HTMLButtonElement;
        btn?.click();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    // Load dictionary data if editing
    if (!dictionaries || dictionaries.length === 0) return;
    const dictIndex = useDictionariesStore.getState().currentDictIndex;
    if (dictIndex >= 0 && dictionaries[dictIndex]) {
      const dict = dictionaries[dictIndex];
      setDictName(dict.name);
      setCurrentDictId(dict.id);
    } else if (dictIndex === -1) {
      setDictName('');
      setCurrentDictId(null);
      setCurrentWord('');
      setCellVariants({});
      setMergedCells([]);
      setPlusCells([]);
    }
  }, [dictionaries]);

  // Space = сохранить слово (имитируем клик на кнопку)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === ' ') {
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
          return;
        }
        e.preventDefault();
        // Найти кнопку внутри editor-container
        const editorContainer = document.querySelector('.editor-container');
        const saveBtn = editorContainer?.querySelector('.btn.btn-primary') as HTMLButtonElement;
        if (saveBtn) {
          saveBtn.click();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

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
        // Merged cell
        const cell = (
          <div 
            key={`merged-${i}`}
            className={`cell merged ${dragHoverIndex === pair.start ? 'drag-over' : ''}`}
            data-index={displayIndex}
            data-start={pair.start}
            data-end={pair.end}
            onPointerDown={(e) => handleCellPointerDown(e, pair.start)}
            onPointerEnter={() => handleCellPointerEnter(pair.start)}
            onPointerUp={(e) => handleCellPointerUp(e, pair.start)}
            onClick={(e) => {
              if (e.shiftKey) {
                splitCell(pair);
              } else {
                openVariantModal(pair.start);
              }
            }}
            onDragOver={(e) => { 
              e.preventDefault(); 
              e.stopPropagation(); 
              if (pair.end < currentWord.length - 1) handleCellsContainerDragOver(e, pair.start); 
            }}
            onDragEnter={(e) => { 
              e.preventDefault(); 
              e.stopPropagation(); 
              if (pair.end < currentWord.length - 1) handleCellsContainerDragOver(e, pair.start); 
            }}
            onDrop={(e) => { e.preventDefault(); e.stopPropagation(); handleCellsContainerDrop(e); }}
            onContextMenu={(e) => {
              e.preventDefault();
              splitCell(pair);
            }}
            title={pair ? 'Shift+клик для разделения' : ''}
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

        // Plus cell after merged
        if (validPlusCells.includes(pair.end + 1)) {
          cells.push(renderPlusCell(pair.end + 1));
        }

        i = pair.end;
        displayIndex++;
        continue;
      }

      // Regular cell
      const char = text[i];
      const variants = cellVariants[i] || [];
      
      const cell = (
        <div 
          key={`cell-${i}`}
          className={`cell ${variants.length > 0 ? 'has-variants' : ''} ${dragHoverIndex === i && !dragHoverAfter ? 'drag-over' : ''} ${dragHoverIndex === i && dragHoverAfter ? 'drag-over-next' : ''}`}
          data-index={i}
          onPointerDown={(e) => handleCellPointerDown(e, i)}
          onPointerEnter={() => handleCellPointerEnter(i)}
          onPointerUp={(e) => handleCellPointerUp(e, i)}
          onClick={(e) => {
if (e.shiftKey) {
              handleCellPointerDown(e, i);
            } else {
              openVariantModal(i);
            }
          }}
          onDragOver={(e) => {
            if (i < currentWord.length - 1) handleCellsContainerDragOver(e, i);
          }}
          onDragEnter={(e) => {
            if (i < currentWord.length - 1) handleCellsContainerDragOver(e, i);
          }}
          onDragLeave={(e) => e.stopPropagation()}
          onDrop={(e) => handleCellsContainerDrop(e)}
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

      // Plus cell after regular
      if (validPlusCells.includes(i + 1)) {
        cells.push(renderPlusCell(i + 1));
      }

      displayIndex++;
    }

    return cells;
  };

  const renderPlusCell = (index: number) => {
    const plusVariants = cellVariants[`+${index}`] || [];
    return (
      <div 
        key={`plus-${index}`}
        className={`cell plus-cell ${plusVariants.length > 0 ? 'has-variants' : ''} ${dragHoverIndex === index && !dragHoverAfter ? 'drag-over' : ''} ${dragHoverIndex === index && dragHoverAfter ? 'drag-over-next' : ''}`}
        data-index={index}
        onDragOver={(e) => {
          if (index < currentWord.length) handleCellsContainerDragOver(e, index);
        }}
        onDragEnter={(e) => {
          if (index < currentWord.length) handleCellsContainerDragOver(e, index);
        }}
        onDragLeave={(e) => e.stopPropagation()}
        onDrop={(e) => handleCellsContainerDrop(e)}
        onClick={(e) => {
          if (e.shiftKey) {
            setPlusCells(plusCells.filter(p => p !== index));
            const newVariants = { ...cellVariants };
            delete newVariants[`+${index}`];
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
    const uniq = Array.from(new Set(variants));
    return uniq;
  };

  const handleCellPointerDown = (e: any, index: number) => {
    if (e.shiftKey) return;
    setDragStartIndex(index);
    setIsDragging(false);
  };

  const handleCellPointerEnter = (index: number) => {
    if (dragStartIndex !== -1 && dragStartIndex !== index) {
      setIsDragging(true);
    }
  };

  const handleCellPointerUp = (e: any, index: number) => {
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
    if (!text || !isRussianLetter(text[start]) || !isRussianLetter(text[end])) return;
    
    const hasOverlap = mergedCells.some(pair => 
      (start >= pair.start && start <= pair.end) ||
      (end >= pair.start && end <= pair.end)
    );
    if (hasOverlap) return;

    const newVariants: Record<string, string[]> = {};
    for (const key in cellVariants) {
      const pos = parseInt(key);
      if (pos !== start && pos !== end) {
        newVariants[key] = cellVariants[key];
      }
    }
    setCellVariants(newVariants);
    setPlusCells(plusCells.filter(p => p !== start && p !== end));
    setMergedCells([...mergedCells, { start, end }]);
  };

  const splitCell = (pair: Merge) => {
    const newVariants: Record<string, string[]> = {};
    for (const key in cellVariants) {
      const pos = parseInt(key);
      if (pos !== pair.start) {
        newVariants[key] = cellVariants[key];
      }
    }
    setCellVariants(newVariants);
    setPlusCells(plusCells.filter(p => p !== pair.start));
    setMergedCells(mergedCells.filter(p => p !== pair));
  };

  const isRussianLetter = (char: string) => {
    return /[а-яёА-ЯЁ]/.test(char);
  };

  const openVariantModal = (index: number, isPlus = false) => {
    setVariantModalCellIndex(index);
    setVariantModalOpen(true);
    
    // Initialize with correct variant
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

    const key = isPlus ? `+${index}` : index;
    if (!cellVariants[key] || cellVariants[key].length === 0) {
      setCellVariants({ ...cellVariants, [key]: [correctVariant] });
    } else if (cellVariants[key][0] !== correctVariant) {
      const newVariants = { ...cellVariants };
      newVariants[key] = [correctVariant, ...cellVariants[key]];
      setCellVariants(newVariants);
    }
  };

  const handleWordInput = (value: string) => {
    const oldWord = currentWord || '';
    const filtered = value.replace(/[^а-яёА-ЯЁ+\-/ ]/g, '');
    setCurrentWord(filtered);
    
    if (filtered.length === 0) {
      setCellVariants({});
      setPlusCells([]);
      setMergedCells([]);
      return;
    }
    
    if (filtered.length < oldWord.length) {
      let diffPos = 0;
      while (diffPos < filtered.length && diffPos < oldWord.length && filtered[diffPos] === oldWord[diffPos]) {
        diffPos++;
      }
      const newVariants: Record<string, string[]> = {};
      const newPlusCells: number[] = [];
      
      for (const key in cellVariants) {
        const pos = parseInt(key.startsWith('+') ? key.slice(1) : key);
        if (isNaN(pos)) continue;
        
        if (key.startsWith('+')) {
          if (pos < diffPos) {
            newPlusCells.push(pos);
            newVariants[key] = cellVariants[key];
          } else if (pos > diffPos) {
            newPlusCells.push(pos - 1);
            newVariants[`+${pos - 1}`] = cellVariants[key];
          }
        } else {
          if (pos < diffPos) {
            newVariants[key] = cellVariants[key];
          } else if (pos > diffPos) {
            newVariants[pos - 1] = cellVariants[key];
          }
        }
      }
      setCellVariants(newVariants);
      setPlusCells(newPlusCells);
    } else if (filtered.length > oldWord.length) {
      let diffPos = 0;
      while (diffPos < filtered.length && diffPos < oldWord.length && filtered[diffPos] === oldWord[diffPos]) {
        diffPos++;
      }
      const newVariants: Record<string, string[]> = {};
      const newPlusCells: number[] = [];
      
      for (const key in cellVariants) {
        const pos = parseInt(key.startsWith('+') ? key.slice(1) : key);
        if (isNaN(pos)) continue;
        
        if (key.startsWith('+')) {
          const newPos = pos >= diffPos ? pos + 1 : pos;
          if (!newPlusCells.includes(newPos)) {
            newPlusCells.push(newPos);
            newVariants[`+${newPos}`] = cellVariants[key];
          }
        } else {
          const newPos = pos >= diffPos ? pos + 1 : pos;
          newVariants[newPos] = cellVariants[key];
        }
      }
      for (let i = diffPos; i < filtered.length; i++) {
        if (!newPlusCells.includes(i + 1)) {
          newPlusCells.push(i + 1);
          newVariants[`+${i + 1}`] = ['+', '-', '/'];
        }
      }
      setCellVariants(newVariants);
      setPlusCells(newPlusCells);
    }
    
    const validMerges = mergedCells.filter(pair => 
      pair.start < filtered.length && pair.end < filtered.length && pair.end - pair.start >= 1
    );
    setMergedCells(validMerges);
    
    const validPlusCells = plusCells.filter(idx => idx >= 0 && idx <= filtered.length);
    setPlusCells(validPlusCells);
  };

  const handleSaveWord = useCallback(async () => {
    const word = currentWord;
    
    if (!word || word.length === 0) {
      showToast('ОШИБКА: введите слово', true);
      return;
    }

    // Check for variants - at least one must exist
    const variantKeys = Object.keys(cellVariants);
    const hasAnyVariants = variantKeys.some(key => {
      const vars = cellVariants[key];
      return Array.isArray(vars) && vars.length > 0;
    });
    
    if (!hasAnyVariants) {
      showToast('ОШИБКА: добавьте варианты', true);
      return;
    }
    
    let dictId = currentDictId;
    
    if (!dictId) {
      if (!dictName || !dictName.trim()) {
        showToast('Введите название словаря', true);
        return;
      }
      
      const userId = user?.uid || 'demo';
      dictId = await useDictionariesStore.getState().createDictionary(userId, dictName.trim());
      
      if (!dictId) {
        showToast('Ошибка создания словаря', true);
        return;
      }
    }
    
    if (!dictId) {
      showToast('Ошибка: не удалось получить ID словаря', true);
      return;
    }
    
    // Check if dictionary is default and user is not admin
    const dict = dictionaries.find(d => d.id === dictId);
    if (dict?.isDefault && !useAuthStore.getState().isAdmin()) {
      showToast('Базовые словари может редактировать только администратор', true);
      return;
    }

    useEditorStore.setState({ currentWord: word, cellVariants, mergedCells, plusCells });
    const editingId = useEditorStore.getState().editingWordId;
    const result = await useEditorStore.getState().saveWord(dictId, editingId);
    
    if (result.success) {
      showToast(editingId ? 'Слово изменено!' : 'Слово добавлено!');
      setCurrentWord('');
      setCellVariants({});
      setMergedCells([]);
      setPlusCells([]);
      setEditingWordId(null);
      
      storage.clearGameState(dictId, false);
      storage.clearGameState(dictId, true);
    } else {
      showToast(result.error || 'Ошибка сохранения', true);
    }
  }, [currentWord, cellVariants, currentDictId, dictName, showToast]);

  const handleExport = () => {
    if (!currentDictId) {
      showToast('Сначала выберите словарь', true);
      return;
    }
    
    const dict = dictionaries.find(d => d.id === currentDictId);
    if (!dict) {
      showToast('Словарь не найден', true);
      return;
    }
    
    const exportData = {
      name: dict.name,
      exportedAt: new Date().toISOString(),
      words: dict.words.map(w => ({
        word: w.word,
        variants: w.variants,
        merges: w.merges,
        plusCells: w.plusCells,
      })),
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${dict.name.replace(/[^a-zA-Zа-яА-Я0-9]/g, '_')}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Словарь экспортирован');
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        
        if (!data.words || !Array.isArray(data.words)) {
          showToast('Неверный формат файла', true);
          return;
        }
        
        const words = data.words.map((w: any, idx: number) => ({
          id: `imported_${Date.now()}_${idx}`,
          word: String(w.word || ''),
          variants: w.variants || {},
          merges: w.merges || [],
          plusCells: w.plusCells || [],
        }));
        
        if (currentDictId) {
          const dict = dictionaries.find(d => d.id === currentDictId);
          const newWords = [...(dict?.words || []), ...words];
          await useDictionariesStore.getState().updateDictionary(currentDictId, { words: newWords });
          showToast(`Импортировано ${words.length} слов`);
        } else {
          const userId = user?.uid || 'demo';
          const newDictId = await useDictionariesStore.getState().createDictionary(userId, data.name || 'Импортированный');
          if (newDictId) {
            await useDictionariesStore.getState().updateDictionary(newDictId, { words });
            showToast(`Импортировано ${words.length} слов`);
          }
        }
      } catch (err: any) {
        console.error('Import error:', err);
        showToast('Ошибка чтения файла: ' + (err?.message || 'неизвестная ошибка'), true);
      }
    };
    input.click();
  };

  const handleUpdateDictName = async () => {
    const name = editedName.trim();
    if (!name) {
      showToast('Введите название', true);
      return;
    }
    
    // Проверка уникальности
    const nameLower = name.toLowerCase();
    const exists = dictionaries.some(d => 
      d.id !== currentDictId && d.name.toLowerCase() === nameLower
    );
    if (exists) {
      showToast('Словарь с таким названием уже существует', true);
      return;
    }
    
    if (currentDictId) {
      await useDictionariesStore.getState().updateDictionary(currentDictId, { name });
      setDictName(name);
    }
    setIsEditingName(false);
  };

  const handleShowDictList = () => {
    if (onOpenDictList) {
      onOpenDictList();
    } else {
      setDictListOpen(true);
    }
  };

  // Plus tool drag handlers
  const handlePlusToolDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('text/plain', 'plus');
    e.dataTransfer.effectAllowed = 'copy';
  };

  const handleCellsContainerDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    e.stopPropagation();
    setDragHoverIndex(index);
    setDragHoverAfter(false);
  };

  const handleDragEnd = () => {
    setDragHoverIndex(null);
    setDragHoverAfter(false);
  };

  const handleCellsContainerDragLeave = () => {
    setDragHoverIndex(null);
    setDragHoverAfter(false);
  };

  const handleCellsContainerDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    let cell = (e.target as HTMLElement).closest('.cell');
    if (!cell) {
      cell = (e.target as HTMLElement).closest('.merged');
    }
    if (!cell) {
      cell = (e.target as HTMLElement).closest('.plus-cell');
    }
    if (cell) {
      const startAttr = cell.getAttribute('data-start');
      const endAttr = cell.getAttribute('data-end');
      const indexAttr = cell.getAttribute('data-index');
      
      let afterIndex: number;
      
      if (startAttr && endAttr) {
        afterIndex = parseInt(endAttr) + 1;
      } else if (indexAttr) {
        afterIndex = parseInt(indexAttr) + 1;
      } else {
        return;
      }
      
      if (afterIndex >= currentWord.length) {
        return;
      }
      
      if (!plusCells.includes(afterIndex)) {
        setPlusCells([...plusCells, afterIndex].sort((a, b) => a - b));
        setCellVariants({ ...cellVariants, [`+${afterIndex}`]: ['+', '-', '/'] });
      }
      setDragHoverIndex(null);
    }
  };

  return (
    <div className="screen active" id="editorScreen">
      <div className="quick-mode-header">
        <button 
          className="quick-mode-btn"
          onClick={() => {
            // Проверяем, пустой ли словарь при выходе
            const dicts = useDictionariesStore.getState().dictionaries;
            if (currentDictId) {
              const currentDict = dicts.find(d => d.id === currentDictId);
              if (currentDict && currentDict.words && currentDict.words.length === 0 && !currentDict.isDefault) {
                useDictionariesStore.getState().deleteDictionary(currentDictId);
                showToast('Пустой словарь удалён');
              } else {
                onNavigate('main');
              }
            } else {
              onNavigate('main');
            }
          }}
        >
          ← Назад
        </button>
        <div 
          className="plus-tool" 
          draggable 
          onDragStart={handlePlusToolDragStart}
          onDragEnd={handleDragEnd}
          title="Перетащите + между буквами для создания вариантов"
        >
          +
        </div>
        <button 
          className="quick-mode-btn"
          onClick={() => {
            if (!currentDictId) {
              showToast('Выберите словарь', true);
              return;
            }
            setQuickInputModalOpen(true);
          }}
        >
          Быстрый ввод
        </button>
      </div>

      <div className="editor-container">
        <div className="dict-name-display">
          <span className="dict-name-text">{dictName}</span>
          <button 
            className="dict-name-edit-btn"
            onClick={() => {
              setEditedName(dictName);
              setIsEditingName(true);
            }}
            title="Изменить название"
          >
            ✏️
          </button>
        </div>
        
        {isEditingName && (
          <div className="dict-name-edit-row">
            <input
              type="text"
              className="text-input"
              value={editedName}
              onChange={(e) => setEditedName(e.target.value)}
              placeholder="Новое название..."
              autoFocus
              onKeyPress={(e) => e.key === 'Enter' && handleUpdateDictName()}
            />
            <button className="btn btn-primary" onClick={handleUpdateDictName}>Сохранить</button>
            <button className="btn btn-secondary" onClick={() => setIsEditingName(false)}>Отмена</button>
          </div>
        )}

        <div className="input-wrapper">
          <label>Введите слово</label>
          <input 
            type="text" 
            className="text-input" 
            value={currentWord}
            onChange={(e) => handleWordInput(e.target.value)}
            placeholder="Введите текст..."
          />
        </div>

        <div 
          className="cells-container" 
          ref={cellsContainerRef}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = currentWord ? 'copy' : 'none';
          }}
          onDragEnter={(e) => {
            e.preventDefault();
          }}
          onDragLeave={(e) => {
            if ((e.target as HTMLElement).closest('.cells-container') === e.currentTarget) {
              setDragHoverIndex(null);
              setDragHoverAfter(false);
            }
          }}
          onDrop={handleCellsContainerDrop}
        >
          {renderCells()}
        </div>

          <div className="controls" style={{ justifyContent: 'center' }}>
            <button className="btn btn-primary" onClick={handleSaveWord}>
              Сохранить слово
            </button>
            <button className="btn btn-secondary" onClick={handleShowDictList}>
              Словарь
            </button>
            <button className="btn btn-secondary" onClick={handleExport}>
              Экспорт
            </button>
            <button className="btn btn-secondary" onClick={handleImport}>
              Импорт
            </button>
          </div>
      </div>

      {/* Variant Modal */}
      <VariantModal 
        cellIndex={variantModalCellIndex}
        isOpen={variantModalOpen}
        onClose={() => {
          const key = variantModalCellIndex.toString();
          const vars = cellVariants[key] || [];
          if (vars.length < 2) {
            const newVariants = { ...cellVariants };
            delete newVariants[key];
            setCellVariants(newVariants);
          }
          setVariantModalOpen(false);
        }}
        cellVariants={cellVariants}
        setCellVariants={setCellVariants}
        showToast={showToast}
      />

      {/* Quick Input Modal */}
      {quickInputModalOpen && (
        <div className="modal-overlay active" onClick={() => setQuickInputModalOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close-icon" onClick={() => setQuickInputModalOpen(false)}>×</button>
            <div className="modal-title">Быстрый ввод</div>
            <p style={{ marginBottom: '12px', color: 'var(--text-secondary)' }}>
              Введите слова через запятую:
            </p>
            <textarea
              className="modal-input"
              value={quickInputWords}
              onChange={(e) => setQuickInputWords(e.target.value)}
              placeholder="слово1, слово2, до сих пор"
              rows={5}
              style={{ width: '100%', minHeight: '120px' }}
            />
            <div className="controls" style={{ gap: '12px', marginTop: '16px' }}>
              <button 
                className="btn btn-primary"
                onClick={() => {
                  const words = quickInputWords.split(',').map(w => w.trim()).filter(w => w);
                  if (words.length === 0) {
                    showToast('Введите хотя бы одно слово', true);
                    return;
                  }
                  (window as any).__quickInputData = { dictId: currentDictId, words };
                  setQuickInputModalOpen(false);
                  onNavigate('quickMode');
                }}
              >
                Начать
              </button>
              <button className="btn btn-secondary" onClick={() => setQuickInputModalOpen(false)}>
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
);
}
