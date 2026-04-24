'use client';

import { useState, useEffect, useRef } from 'react';
import { useDictionariesStore, useAuthStore } from '@/lib/store';
import * as sync from '@/lib/syncService';
import * as storage from '@/lib/storage';

interface Segment {
  content: string;
  variants: string[];
  start: number;
  end: number;
  isPlus?: boolean;
}

interface ExerciseScreenProps {
  onNavigate: (screen: 'main' | 'editor' | 'exercise' | 'stats' | 'editorPlus' | 'quickMode', dictIndex?: number) => void;
  showToast: (message: string, isError?: boolean) => void;
}

export default function ExerciseScreen({ onNavigate, showToast }: ExerciseScreenProps) {
  const { dictionaries, currentDictIndex, loadDictionaries } = useDictionariesStore();
  const [exerciseWords, setExerciseWords] = useState<any[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [answeredSegments, setAnsweredSegments] = useState<boolean[]>([]);
  const [currentSegmentIndex, setCurrentSegmentIndex] = useState(0);
  const [wordCorrectCount, setWordCorrectCount] = useState<Record<number, number>>({});
  const [lastWordIndex, setLastWordIndex] = useState(-1);
  const [currentGameErrors, setCurrentGameErrors] = useState(0);
  const [showResult, setShowResult] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [segmentResults, setSegmentResults] = useState<(boolean | null)[]>([]);
  const [buttonsDisabled, setButtonsDisabled] = useState(false);
  const [selectedVariant, setSelectedVariant] = useState<string | null>(null);
  const [shuffledVariants, setShuffledVariants] = useState<string[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isNewGame, setIsNewGame] = useState(false);
  // Режим словаря+ - определяется в useEffect
  const [isPlusDictionary, setIsPlusDictionary] = useState(false);
  const isPlusDictionaryRef = useRef(false);
  
  const statsSavedRef = useRef(false); // Флаг чтобы не сохранять статистику дважды
  
  
  
  const [practiceMode, setPracticeMode] = useState(false); // Режим работы над ошибками
  const [wordsWithErrors, setWordsWithErrors] = useState<number[]>([]); // Индексы слов с ошибками
  const wordsWithErrorsRef = useRef<number[]>([]); // Ref для wordsWithErrors
  const errorWordIndicesRef = useRef<number[]>([]); // Слова с ошибками в последней игре
  const practiceModeRef = useRef(false); // Ref для доступа в setTimeout
  const usedPracticeWordsRef = useRef<number[]>([]); // Уже использованные слова в практике
  const practiceWordProgressRef = useRef<Record<number, number>>({}); // Прогресс слов в practice mode
  
  // Скорость игры (загружаем из storage)
  const [gameSpeed, setGameSpeed] = useState(() => storage.getGameSpeed());

  const LEARNED_THRESHOLD = 3;
  const LOW_PRIORITY_THRESHOLD = 2;

  // Сохранить состояние игры в storage
  const saveGameState = () => {
    if (practiceModeRef.current) {
      return;
    }
    const dictId = getCurrentDictId();
    if (!dictId || exerciseWords.length === 0) return;
    
    const isPlus = isPlusDictionaryRef.current;
    const state = {
      exerciseWords: exerciseWords,
      wordCorrectCount: wordCorrectCount,
      currentIndex: currentIndex,
      lastWordIndex: lastWordIndex,
      currentSegmentIndex: currentSegmentIndex,
      answeredSegments: answeredSegments,
      segmentResults: segmentResults,
      currentGameErrors: currentGameErrors,
      isNewGame: isNewGame,
      isPlusDictionary: isPlus
    };
    storage.setGameState(dictId, isPlus, state);
  };
  
  // Загрузить состояние игры из storage
  const loadGameState = (dictId: string, isPlus: boolean) => {
    return storage.getGameState(dictId, isPlus);
  };
  
  // Сохраняем скорость при изменении
  useEffect(() => {
    storage.setGameSpeed(gameSpeed);
  }, [gameSpeed]);
  
  // Загружаем режим only once при монтировании
  const modeLoaded = useRef(false);
  
  useEffect(() => {
    if (modeLoaded.current) return;
    modeLoaded.current = true;
    
    const savedMode = storage.getCurrentMode();
    const isPlusMode = savedMode === 'plus';
    if (savedMode) storage.clearCurrentMode();
    
    const dictIndex = useDictionariesStore.getState().currentDictIndex;
    const dicts = useDictionariesStore.getState().dictionaries;
    const currentDict = dicts[dictIndex >= 0 ? dictIndex : 0];
    
    if (currentDict && currentDict.words && currentDict.words.length > 0) {
      const isPlusDict = currentDict.plusDictionary && 
        currentDict.plusDictionary.words && 
        JSON.stringify(currentDict.plusDictionary.words) === JSON.stringify(currentDict.words);
      
      if (isPlusDict || isPlusMode) {
        setExerciseWords(currentDict.plusDictionary?.words || []);
        setIsPlusDictionary(true);
        isPlusDictionaryRef.current = true;
      } else {
        setExerciseWords(currentDict.words);
        setIsPlusDictionary(false);
        isPlusDictionaryRef.current = false;
      }
    }
  }, []);
  
  // Загружаем игру: сначала проверяем сохранённое состояние, иначе начинаем новую
  const gameInitialized = useRef(false);
  
  useEffect(() => {
    if (exerciseWords.length > 0 && currentDictIndex >= 0 && !gameInitialized.current) {
      gameInitialized.current = true;
      
      const dict = dictionaries[currentDictIndex];
      if (!dict) return;
      
      const dictId = dict.id;
      const isPlus = isPlusDictionaryRef.current;
      const savedState = loadGameState(dictId, isPlus);
      
      if (savedState) {
        setExerciseWords(savedState.exerciseWords || exerciseWords);
        setWordCorrectCount(savedState.wordCorrectCount || {});
        setCurrentGameErrors(savedState.currentGameErrors || 0);
        setCurrentIndex(savedState.currentIndex || 0);
        setLastWordIndex(savedState.lastWordIndex || -1);
        setCurrentSegmentIndex(savedState.currentSegmentIndex || 0);
        setAnsweredSegments(savedState.answeredSegments || []);
        setSegmentResults(savedState.segmentResults || []);
        setIsNewGame(false);
        loadNextWord(savedState.wordCorrectCount);
      } else {
        if (!practiceModeRef.current) {
          setIsNewGame(false);
          loadNextWord();
        }
      }
    }
  }, [exerciseWords, currentDictIndex]);
  
  // Сбрасываем флаг при выходе из игры
  useEffect(() => {
    return () => { gameInitialized.current = false; };
  }, []);

  const getWordSegments = (word: any): Segment[] => {
    const result: Segment[] = [];
    const plusCells = word.plusCells || [];
    let i = 0;
    
    while (i < word.word.length) {
      if (plusCells.includes(i)) {
        const plusKey = '+' + i;
        const plusVariants = word.variants[plusKey] || [];
        if (plusVariants.length > 0) {
          result.push({
            content: '+',
            variants: [...plusVariants],
            start: i,
            end: i,
            isPlus: true
          });
        }
      }
      
      const pair = word.merges?.find((p: any) => p.start === i);
      if (pair) {
        const content = word.word.substring(pair.start, pair.end + 1);
        const variants: string[] = [];
        for (let j = pair.start; j <= pair.end; j++) {
          if (word.variants[j]) {
            variants.push(...word.variants[j]);
          }
        }
        const uniqueVariants = Array.from(new Set(variants));
        result.push({
          content,
          variants: uniqueVariants,
          start: pair.start,
          end: pair.end
        });
        i = pair.end + 1;
      } else {
        const variants = word.variants[i] || [];
        result.push({
          content: word.word[i],
          variants: [...variants],
          start: i,
          end: i
        });
        i++;
      }
    }
    return result;
  };

// Выбор следующего слова на основе актуальных данных
const getAvailableWordIndex = (counts: Record<number, number>): number => {
    const availableWords: number[] = [];
    
    for (let i = 0; i < exerciseWords.length; i++) {
      const count = counts[i] || 0;
      if (count < LEARNED_THRESHOLD) {
        availableWords.push(i);
      }
    }
    
    if (availableWords.length === 0) return -1;
    
    const filtered = availableWords.filter(i => i !== lastWordIndex);
    if (filtered.length === 0) return availableWords[0];
    
    return filtered[Math.floor(Math.random() * filtered.length)];
  };

const loadNextWord = (updatedCounts?: Record<number, number>) => {
    const isPracticeMode = practiceModeRef.current;
    const errWords = wordsWithErrorsRef.current;
    
    const counts = updatedCounts || {};
    
    // Режим "Работа над ошибками" - используем только слова с ошибками (без порога 3+)
    if (isPracticeMode && errWords.length > 0) {
        
        // Фильтруем слова: исключаем слова с 3+ точками в practice mode
        const availableWords = errWords.filter(i => (practiceWordProgressRef.current[i] || 0) < LEARNED_THRESHOLD);
        
        if (availableWords.length === 0) {
            setShowResult(true);
            return;
        }
        
        // Выбираем случайное слово (фильтруем чтобы не было два раза подряд)
        const filtered = availableWords.filter(i => i !== lastWordIndex);
        const randomIdx = filtered.length > 0 
            ? filtered[Math.floor(Math.random() * filtered.length)]
            : availableWords[Math.floor(Math.random() * availableWords.length)];
        
        setLastWordIndex(randomIdx);
        setCurrentIndex(randomIdx);
        setButtonsDisabled(false);
        
        const word = exerciseWords[randomIdx];
        const segs = getWordSegments(word);
        setSegments(segs);
        
        const answered = new Array(segs.length).fill(false);
        const results = new Array(segs.length).fill(null);
        segs.forEach((seg, i) => {
            if (seg.variants.length === 0) answered[i] = true;
        });
        setAnsweredSegments(answered);
        setSegmentResults(results);
        
        for (let i = 0; i < segs.length; i++) {
            if (!answered[i] && segs[i].variants.length > 0) {
                setShuffledVariants(shuffleArray(segs[i].variants));
                break;
            }
        }
        
        findNextActiveSegment(segs, answered);
        return;
    }
    
    // Используем переданные данные или текущее состояние
    const nextIdx = getAvailableWordIndex(counts);
    
    if (nextIdx === -1) {
      // Игра окончена - сохраняем статистику (только если ещё не сохраняли)
      if (!statsSavedRef.current) {
        statsSavedRef.current = true;
        
        const dictId = getCurrentDictId();
        if (!isPlusDictionaryRef.current) {
          const localStats = storage.getStats(dictId);
          localStats.totalGames += 1;
          localStats.totalErrors += currentGameErrors;
          localStats.games.push({
            date: Date.now(),
            errors: currentGameErrors,
            totalSegments: exerciseWords.length * 3,
            correctSegments: (exerciseWords.length * 3) - currentGameErrors
          });
          storage.setStats(dictId, localStats);
        } else {
          // Для словаря+ - используем storage
          const demoDicts = storage.getDemoDictionaries();
          const dictIdx = demoDicts.findIndex((d: any) => d.id === dictId);
          if (dictIdx >= 0 && demoDicts[dictIdx].plusDictionary) {
            const plusDict = demoDicts[dictIdx].plusDictionary;
            const gamesHistory = plusDict.gamesHistory || [];
            gamesHistory.push({
              date: Date.now(),
              errors: currentGameErrors,
              totalSegments: exerciseWords.length * 3,
              correctSegments: (exerciseWords.length * 3) - currentGameErrors
            });
            demoDicts[dictIdx].plusDictionary = { ...plusDict, gamesHistory };
            storage.setDemoDictionaries(demoDicts);
          }
        }
      }
      setShowResult(true);
      return;
    }
    
    setLastWordIndex(nextIdx);
    setCurrentIndex(nextIdx);
    setButtonsDisabled(false);
    
    const word = exerciseWords[nextIdx];
    const segs = getWordSegments(word);
    setSegments(segs);
    
    const answered = new Array(segs.length).fill(false);
    const results = new Array(segs.length).fill(null);
    segs.forEach((seg, i) => {
      if (seg.variants.length === 0) answered[i] = true;
    });
    setAnsweredSegments(answered);
    setSegmentResults(results);
    
    // Сохраняем прогресс если слово уже было (только не в режиме практики)
    if (!practiceModeRef.current && wordCorrectCount[nextIdx] === undefined) {
      setWordCorrectCount(prev => ({ ...prev, [nextIdx]: 0 }));
    }
    
    // Перемешиваем варианты для первого активного сегмента
    for (let i = 0; i < segs.length; i++) {
      if (!answered[i] && segs[i].variants.length > 0) {
        setShuffledVariants(shuffleArray(segs[i].variants));
        break;
      }
    }
    
    findNextActiveSegment(segs, answered);
  };

  const findNextActiveSegment = (segs: Segment[], answered: boolean[]) => {
    for (let i = 0; i < segs.length; i++) {
      if (!answered[i] && segs[i].variants.length > 0) {
        setCurrentSegmentIndex(i);
        // Перемешиваем варианты только при смене сегмента
        setShuffledVariants(shuffleArray(segs[i].variants));
        return;
      }
    }
    // All answered, load next word after delay
    setTimeout(loadNextWord, gameSpeed * 1000);
  };

  const checkAnswer = (selected: string, correct: string) => {
    const isCorrect = selected.toLowerCase() === correct.toLowerCase();
    
    if (!isCorrect) {
      console.error('handleAnswer: wrong answer', { selected, correct, wordIndex: currentIndex });
    }
    
    setButtonsDisabled(true);
    setSelectedVariant(selected);
    
    // Audio and vibration
    if (isCorrect) {
      if (navigator.vibrate) navigator.vibrate(50);
    } else {
      if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
    }
    
    // Считаем ошибки сразу
    let newErrors = currentGameErrors;
    let newAnswers = { ...wordCorrectCount };
    
    if (!isCorrect) {
      newErrors = currentGameErrors + 1;
      newAnswers = { ...wordCorrectCount, [currentIndex]: 0 };
      setCurrentGameErrors(newErrors);
      setWordCorrectCount(newAnswers);
      saveProgressImmediately(newErrors, newAnswers);
      
      // Обновляем wordErrors
      const word = exerciseWords[currentIndex]?.word;
      const isPlus = isPlusDictionaryRef.current;
      
      if (word) {
        // Сохраняем слово с ошибкой для практики - ВСЕГДА (даже в practice mode)
        if (!errorWordIndicesRef.current.includes(currentIndex)) {
          errorWordIndicesRef.current.push(currentIndex);
        }
        
        const dictId = getCurrentDictId();
        const dict = dictionaries.find(d => d.id === dictId);
        if (dict) {
          if (isPlus && dict.plusDictionary) {
            // Для словаря+ - обновляем plusDictionary.wordErrors
            const plusWordErrors = dict.plusDictionary.wordErrors || {};
            plusWordErrors[word] = (plusWordErrors[word] || 0) + 1;
            useDictionariesStore.getState().updateDictionary(dictId, {
              plusDictionary: {
                ...dict.plusDictionary,
                wordErrors: plusWordErrors
              }
            });
            
            // Сохраняем wordErrors для словаря+ в storage (своя статистика для plus)
            const demoDicts = storage.getDemoDictionaries();
            const dictIdx = demoDicts.findIndex((d: any) => d.id === dictId);
            if (dictIdx >= 0 && demoDicts[dictIdx].plusDictionary) {
              const plusStats = storage.getPlusStats(dictId);
              plusStats.wordErrors = plusStats.wordErrors || {};
              plusStats.wordErrors[word] = (plusStats.wordErrors[word] || 0) + 1;
              storage.setPlusStats(dictId, plusStats);
            }
          } else {
            // Для обычного словаря - обновляем wordErrors
            const wordErrors = dict.wordErrors || {};
            wordErrors[word] = (wordErrors[word] || 0) + 1;
            useDictionariesStore.getState().updateDictionary(dictId, {
              wordErrors
            });
            
            // Также обновляем wordErrors в storage для StatsScreen (для каждого словаря своя)
            const localStats = storage.getStats(dictId);
            localStats.wordErrors = localStats.wordErrors || {};
            localStats.wordErrors[word] = (localStats.wordErrors[word] || 0) + 1;
            storage.setStats(dictId, localStats);
          }
        }
      }
    }
    // При правильном ответе НЕ увеличиваем счётчик - это делается после ВСЕХ сегментов
    
    const newAnswered = [...answeredSegments];
    newAnswered[currentSegmentIndex] = true;
    setAnsweredSegments(newAnswered);
    
    const newResults = [...segmentResults];
    newResults[currentSegmentIndex] = isCorrect;
    setSegmentResults(newResults);
    
    // Find next segment
    setTimeout(() => {
      const segs = segments;
      let nextIdx = -1;
      for (let i = currentSegmentIndex + 1; i < segs.length; i++) {
        if (!newAnswered[i] && segs[i].variants.length > 0) {
          nextIdx = i;
          break;
        }
      }
      if (nextIdx === -1) {
        // Все сегменты пройдены - loadNextWord вызовется в коде ниже
      } else {
        setCurrentSegmentIndex(nextIdx);
        setButtonsDisabled(false);
      }
    }, gameSpeed * 1000);
    
    // СРАЗУ обновляем точки (без задержки)
    const allAnsweredNow = newAnswered.every((a, i) => a || segments[i].variants.length === 0);
    const hasErrorsNow = newResults.some(r => r === false);
    if (allAnsweredNow) {
      if (!hasErrorsNow) {
        // Правильно - увеличиваем счётчик
        const newCount = (wordCorrectCount[currentIndex] || 0) + 1;
        const updatedAnswers = { ...wordCorrectCount, [currentIndex]: newCount };
        setWordCorrectCount(updatedAnswers);
        
        // Обновляем прогресс в practice mode
        if (practiceModeRef.current) {
          practiceWordProgressRef.current = { 
            ...practiceWordProgressRef.current, 
            [currentIndex]: newCount 
          };
          
        }
        
        saveProgressImmediately(currentGameErrors, updatedAnswers);
        // Переходим к следующему слову после задержки
        if (practiceModeRef.current) {
          // Practice mode: pass current wordCorrectCount to filter learned words
          setTimeout(() => loadNextWord(wordCorrectCount), gameSpeed * 1000);
        } else {
          setTimeout(() => loadNextWord(updatedAnswers), gameSpeed * 1000);
        }
      } else {
        // Ошибка - переходим к следующему слову
        if (practiceModeRef.current) {
          setTimeout(() => loadNextWord(wordCorrectCount), gameSpeed * 1000);
        } else {
          setTimeout(() => loadNextWord(), gameSpeed * 1000);
        }
      }
    }
  };

  // Функция перемешивания массива
  const shuffleArray = <T,>(array: T[]): T[] => {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };

  // Сохраняем прогресс для текущего словаря
  const getCurrentDictId = () => {
    const dictIndex = useDictionariesStore.getState().currentDictIndex;
    const dicts = useDictionariesStore.getState().dictionaries;
    return dicts[dictIndex >= 0 ? dictIndex : 0]?.id || 'default';
  };
  
const saveProgressImmediately = (errors: number, answers: Record<number, number>) => {
    const dictId = getCurrentDictId();
    const localProgress = storage.getProgress(dictId);
    localProgress.errors = errors;
    localProgress.answers = answers;
    storage.setProgress(dictId, localProgress);
  };

  const handleRestart = () => {
    // Полный сброс игры и очистка сохранённого состояния
    const dictId = getCurrentDictId();
    storage.clearGameState(dictId, isPlusDictionaryRef.current);
    storage.clearProgress(dictId);
    
    setShowResult(false);
    setCurrentIndex(0);
    setLastWordIndex(-1);
    setCurrentGameErrors(0);
    setWordCorrectCount({});
    setSegments([]);
    setAnsweredSegments([]);
    setSegmentResults([]);
    setShuffledVariants([]);
    setIsNewGame(true);
    setPracticeMode(false);
    setWordsWithErrors([]);
    wordsWithErrorsRef.current = [];
    errorWordIndicesRef.current = [];
    practiceModeRef.current = false;
    usedPracticeWordsRef.current = [];
    statsSavedRef.current = false;
    
    // Принудительно запускаем игру с пустым wordCorrectCount
    setTimeout(() => loadNextWord({}), 100);
  };
  
  // Запуск режима "Работа над ошибками"
  const handlePracticeMode = () => {
    // Слова с ошибками в последней игре
    const wordsWithErrs = [...errorWordIndicesRef.current];
    
    
    if (wordsWithErrs.length === 0) {
        showToast('Нет слов с ошибками');
        return;
    }
    
    // Устанавливаем ref и state ПЕРЕД вызовом loadNextWord
    wordsWithErrorsRef.current = wordsWithErrs;
    practiceModeRef.current = true;
    setPracticeMode(true); // Это важно - state должен измениться ДО вызова loadNextWord
    
    // Сброс состояния
    setWordsWithErrors(wordsWithErrs);
    setCurrentGameErrors(0);
    setWordCorrectCount({});
    setShowResult(false);
    setLastWordIndex(-1);
    setSegments([]);
    setAnsweredSegments([]);
    setSegmentResults([]);
    practiceWordProgressRef.current = {}; // Сброс прогресса practice mode
    
    
    // Вызываем БЕЗ параметров - practiceMode в state уже true
    loadNextWord();
  };

  const handleBackToMain = () => {
    // Practice mode не сохраняется - показываем предупреждение
    if (practiceModeRef.current) {
      if (!confirm('Режим "Работа над ошибками" закончится. Продолжить?')) {
        return;
      }
    } else {
      // Сохраняем состояние игры
      saveGameState();
    }
    
    // Сбрасываем состояние при выходе
    const dictId = getCurrentDictId();
    errorWordIndicesRef.current = [];
    wordsWithErrorsRef.current = [];
    setIsNewGame(true);
    setPracticeMode(false);
    setWordsWithErrors([]);
    practiceModeRef.current = false;
    usedPracticeWordsRef.current = [];
    practiceWordProgressRef.current = {};
    setWordCorrectCount({});
    setCurrentGameErrors(0);
    setShowResult(false);
    statsSavedRef.current = false;
    
    onNavigate('main');
  };

  // Render word segments
  const renderSegments = () => {
    return segments.map((seg, idx) => {
      const isAnswered = answeredSegments[idx];
      const isActive = idx === currentSegmentIndex && !isAnswered;
      const hasError = segmentResults[idx] === false;
      
      return (
        <div 
          key={idx}
          className={`exercise-segment ${isAnswered ? 'filled' : 'empty'} ${isActive ? 'active' : ''} ${hasError ? 'error' : ''}`}
        >
          {isAnswered || seg.variants.length === 0 ? (
            <span className="exercise-segment-letter">{seg.content}</span>
          ) : (
            <span className="exercise-segment-letter">?</span>
          )}
        </div>
      );
    });
  };

  // Render indicator dots
  const renderIndicator = () => {
    const count = wordCorrectCount[currentIndex] || 0;
    return (
      <div className="exercise-word-indicator">
        {[0, 1, 2].map(i => (
          <div key={i} className={`exercise-word-dot ${i < count ? 'lit' : ''}`} />
        ))}
      </div>
    );
  };

  // Render variant buttons
  const renderVariants = () => {
    if (currentSegmentIndex >= segments.length) return null;
    
    const currentSegment = segments[currentSegmentIndex];
    if (!currentSegment || currentSegment.variants.length === 0) return null;
    
    const correctVariant = currentSegment.variants[0];
    const variants = shuffledVariants.length > 0 ? shuffledVariants : currentSegment.variants;
    
    return (
      <div className="exercise-variant-buttons">
        {variants.map((variant, idx) => {
          let btnClass = 'exercise-variant-btn';
          if (buttonsDisabled && selectedVariant) {
            if (variant.toLowerCase() === correctVariant.toLowerCase()) {
              btnClass += ' correct';
            } else if (variant === selectedVariant) {
              btnClass += ' wrong';
            }
          }
          
          return (
            <button
              key={idx}
              className={btnClass}
              disabled={buttonsDisabled}
              onClick={() => checkAnswer(variant, correctVariant)}
            >
              {variant}
            </button>
          );
        })}
      </div>
    );
  };

  // Render result screen
  if (showResult) {
    // Проверяем, есть ли слова с ошибками для режима практики
    const hasWordsWithErrors = Object.entries(wordCorrectCount).some(([idx, count]) => count === 0);
    
    return (
      <div className="exercise-screen active">
        <div className="exercise-result active">
          {practiceMode ? (
            <div className="exercise-result-score">
              {currentGameErrors === 0 ? 'Отлично! Все слова без ошибок!' : `Работа над ошибками завершена! Ошибок: ${currentGameErrors}`}
            </div>
          ) : (
            <div className="exercise-result-score">
              {currentGameErrors === 0 ? 'Отлично! Без ошибок!' : `Поздравляем! Ошибок: ${currentGameErrors}`}
            </div>
          )}
          <div className="exercise-result-buttons">
            {practiceMode ? (
              <>
                <button className="btn btn-primary" onClick={handleRestart}>Начать сначала</button>
                <button className="btn btn-secondary" onClick={handleBackToMain}>К списку</button>
              </>
            ) : (
              <>
                <button className="btn btn-primary" onClick={handleRestart}>Ещё раз</button>
                {currentGameErrors > 0 && (
                  <button 
                    className="btn btn-primary" 
                    onClick={() => {
                      
                      handlePracticeMode();
                    }}
                  >
                    Работа над ошибками
                  </button>
                )}
                <button className="btn btn-secondary" onClick={handleBackToMain}>К списку</button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="exercise-screen active">
      <div className="exercise-header">
        <div className="exercise-header-left">
          <button className="practice-exit-header-btn" onClick={handleBackToMain}>←</button>
        </div>
        <div className="exercise-header-center">
          {isPlusDictionary && (
            <span style={{ color: '#f5a623', fontWeight: 600, fontSize: '16px' }}>
              Словарь+
            </span>
          )}
          {practiceMode && (
            <span style={{ color: '#f5a623', fontWeight: 600 }}>
              Работа над ошибками
            </span>
          )}
          {(isPlusDictionary || !practiceMode) && currentGameErrors > 0 && (
            <span style={{ color: '#f37272', fontWeight: 600 }}>
              Ошибок: {currentGameErrors}
            </span>
          )}
        </div>
        <div className="exercise-header-actions">
          <button className="menu-btn" onClick={() => setSettingsOpen(true)}>⚙</button>
          <button className="menu-btn" onClick={() => setMenuOpen(true)}>☰</button>
        </div>
      </div>

      {exerciseWords.length > 0 ? (
        <>
          <div className="exercise-word-container">
            {renderSegments()}
          </div>
          
          {renderIndicator()}
          
          {renderVariants()}
        </>
      ) : (
        <div className="empty-message">Нет слов для тренировки</div>
      )}

      {/* Menu */}
      <div className={`menu-overlay ${menuOpen ? 'active' : ''}`} onClick={() => setMenuOpen(false)}>
        <div className="menu-panel" onClick={(e) => e.stopPropagation()}>
          <div className="menu-stats visible">
            Выучено: {Object.values(wordCorrectCount).filter(c => c >= LEARNED_THRESHOLD).length} / {exerciseWords.length}
            {currentGameErrors > 0 && <span style={{ color: '#f37272', marginLeft: '10px' }}>Ошибки: {currentGameErrors}</span>}
          </div>
          <div className="menu-dict-header">
            <span className="menu-dict-title">Словарь</span>
          </div>
          <input type="text" className="menu-search" placeholder="Поиск..." />
          <button className="menu-option" onClick={() => { setMenuOpen(false); onNavigate('stats', currentDictIndex); }}>Статистика</button>
          <button className="menu-option menu-new-game" onClick={() => { setMenuOpen(false); handleRestart(); }}>Новая игра</button>
        </div>
      </div>

      {/* Settings Modal */}
      <div className={`menu-overlay ${settingsOpen ? 'active' : ''}`} onClick={() => setSettingsOpen(false)}>
        <div className="menu-panel" onClick={(e) => e.stopPropagation()}>
          <div className="menu-dict-header">
            <span className="menu-dict-title">Настройки</span>
          </div>
          <div style={{ padding: '16px' }}>
            <label style={{ display: 'block', marginBottom: '8px' }}>
              Скорость: {gameSpeed.toFixed(1)} сек
            </label>
            <input
              type="range"
              min="0.2"
              max="2"
              step="0.1"
              value={gameSpeed}
              onChange={(e) => setGameSpeed(parseFloat(e.target.value))}
              style={{ width: '100%' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px', fontSize: '12px', color: 'var(--text-secondary)' }}>
              <span>0.2 сек</span>
              <span>2 сек</span>
            </div>
            <button className="menu-option" onClick={() => setSettingsOpen(false)}>Готово</button>
          </div>
        </div>
      </div>
    </div>
  );
}