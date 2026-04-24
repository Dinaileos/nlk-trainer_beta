'use client';

import { useState, useEffect } from 'react';
import { useDictionariesStore } from '@/lib/store';
import * as storage from '@/lib/storage';

interface EditorPlusScreenProps {
  onNavigate: (screen: 'main' | 'editor' | 'exercise' | 'stats' | 'editorPlus' | 'quickMode', dictIndex?: number) => void;
  showToast: (message: string, isError?: boolean) => void;
}

export default function EditorPlusScreen({ onNavigate, showToast }: EditorPlusScreenProps) {
  const { dictionaries, currentDictIndex } = useDictionariesStore();
  const [errorThreshold, setErrorThreshold] = useState(1);
  const [baseWordErrors, setBaseWordErrors] = useState<Record<string, number>>({});
  const [refreshKey, setRefreshKey] = useState(0);
  
// Загружаем ошибки из storage (для каждого словаря своя)
  useEffect(() => {
    const dictId = storage.getCurrentPlusDictId() || dictionaries[currentDictIndex]?.id;
    if (!dictId) return;
    const localStats = storage.getPlusStats(dictId);
    setBaseWordErrors(localStats.wordErrors || {});
  }, [dictionaries, currentDictIndex, refreshKey]);
  
  const dictId = storage.getCurrentPlusDictId();
  const demoDicts = storage.getDemoDictionaries();
  const dictFromLocal = demoDicts.find((d: any) => d.id === dictId);
  
  
  
  const dict = dictFromLocal || dictionaries[currentDictIndex];
  const plusDict = dictFromLocal?.plusDictionary || dict?.plusDictionary;
  const plusWords = plusDict?.words || [];
  const baseWords = dict?.words || [];
  
  // Максимальное количество ошибок у слова
  const maxErrorCount = Math.max(1, ...Object.values(baseWordErrors));
  
  // Фильтруем слова с ошибками >= порогу (из базового словаря), исключая уже добавленные в словарь+
  const wordsWithErrorsFiltered = baseWords.filter((w: any) => {
    const errors = baseWordErrors[w.word] || 0;
    const alreadyInPlus = plusWords.some((p: any) => p.word === w.word);
    return errors >= errorThreshold && !alreadyInPlus;
  }).map((w: any) => ({
    ...w,
    errorCount: baseWordErrors[w.word] || 0
  }));

  const handleBack = async () => {
    // Перезагружаем словари в store
    await useDictionariesStore.getState().loadDictionaries();
    onNavigate('stats');
  };

  const addWord = (word: any) => {
    if (!plusDict || !dict) {
      showToast('Ошибка: словарь не найден', true);
      return;
    }
    
    if (plusWords.some((w: any) => w.word === word.word)) {
      showToast('Слово уже есть в словаре+');
      return;
    }
    
    const demoDicts = storage.getDemoDictionaries();
    const idx = demoDicts.findIndex((d: any) => d.id === dict.id);
    if (idx >= 0) {
      const newPlusWords = [...plusWords, word];
      demoDicts[idx].plusDictionary = {
        ...plusDict,
        words: newPlusWords
      };
      storage.setDemoDictionaries(demoDicts);
      setRefreshKey(k => k + 1);
      showToast(`Слово "${word.word}" добавлено в словарь+`);
    }
  };

  const removeWord = (word: any) => {
    if (!plusDict || !dict) {
      showToast('Ошибка: словарь не найден', true);
      return;
    }
    
    const demoDicts = storage.getDemoDictionaries();
    const idx = demoDicts.findIndex((d: any) => d.id === dict.id);
    if (idx >= 0) {
      const newPlusWords = plusWords.filter((w: any) => w.word !== word.word);
      demoDicts[idx].plusDictionary = {
        ...plusDict,
        words: newPlusWords
      };
      storage.setDemoDictionaries(demoDicts);
      setRefreshKey(k => k + 1);
      showToast(`Слово "${word.word}" удалено из словаря+`);
    }
  };

  const addAll = () => {
    if (!plusDict || !dict) {
      showToast('Ошибка: словарь не найден', true);
      return;
    }
    if (wordsWithErrorsFiltered.length === 0) {
      showToast('Нет слов с ошибками', true);
      return;
    }
    
    const existingWords = new Set(plusWords.map((w: any) => w.word));
    const newWords = wordsWithErrorsFiltered.filter((w: any) => !existingWords.has(w.word));
    if (newWords.length === 0) {
      showToast('Все слова уже добавлены');
      return;
    }
    
    const demoDicts = storage.getDemoDictionaries();
    const idx = demoDicts.findIndex((d: any) => d.id === dict.id);
    if (idx >= 0) {
      const newPlusWords = [...plusWords, ...newWords];
      demoDicts[idx].plusDictionary = {
        ...plusDict,
        words: newPlusWords
      };
      storage.setDemoDictionaries(demoDicts);
      setRefreshKey(k => k + 1);
      showToast(`Добавлено ${newWords.length} слов`);
    }
  };

  const handleTrain = () => {
    if (plusWords.length === 0) {
      showToast('Словарь+ пуст');
      return;
    }
    onNavigate('exercise');
};

  return (
    <div className="editor-plus-screen active">
      <div className="editor-plus-header">
        <button className="practice-exit-header-btn" onClick={handleBack}>←</button>
        <h2>{plusDict?.name || dict?.name + '+'}</h2>
      </div>
      
      <div className="editor-plus-threshold">
        <span>Порог ошибок: {errorThreshold}</span>
        <input 
          type="range" 
          min="1" 
          max={maxErrorCount} 
          value={errorThreshold}
          onChange={(e) => setErrorThreshold(parseInt(e.target.value))}
          className="editor-plus-slider"
        />
        <button className="btn btn-primary" onClick={addAll}>Добавить все</button>
      </div>
      
      <div className="editor-plus-columns">
        <div className="editor-plus-column">
          <h3>В словаре+ ({plusWords.length})</h3>
          <div className="editor-plus-list">
            {plusWords.length === 0 ? (
              <div className="editor-plus-empty">Словарь+ пуст</div>
            ) : (
              plusWords.map((word: any) => (
                <div 
                  key={word.id} 
                  className="editor-plus-item clickable"
                  onClick={() => removeWord(word)}
                >
                  <span>{word.word}</span>
                </div>
              ))
            )}
          </div>
        </div>
        
        <div className="editor-plus-column">
          <h3>С ошибками ({wordsWithErrorsFiltered.length})</h3>
          <div className="editor-plus-list">
            {wordsWithErrorsFiltered.length === 0 ? (
              <div className="editor-plus-empty">Нет слов с таким количеством ошибок</div>
            ) : (
              wordsWithErrorsFiltered.map((word: any) => (
                <div 
                  key={word.id} 
                  className="editor-plus-item clickable"
                  onClick={() => addWord(word)}
                >
                  <span>{word.word}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
      
      <div className="editor-plus-footer">
        <button className="btn btn-primary" onClick={handleTrain}>
          Тренировать ({plusWords.length})
        </button>
      </div>
    </div>
  );
}