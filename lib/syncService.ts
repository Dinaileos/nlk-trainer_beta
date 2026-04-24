import { ref, set, get, update, runTransaction, onValue, off } from 'firebase/database';
import { database } from './firebase';
import { FIREBASE_PATHS, Dictionary, DictionaryWord, UserStats, GameResult } from '@/types';

// ============ ТИПЫ ДАННЫХ ============

export interface PendingChanges {
  dictionaries?: Record<string, DictionaryChange>;
  stats?: StatsChange;
  gameState?: GameStateChange;
}

export interface DictionaryChange {
  action: 'add' | 'update' | 'delete';
  dictId?: string;
  wordId?: string;
  data?: any;
  timestamp: number;
}

export interface StatsChange {
  action: 'addErrors' | 'addGame';
  wordErrors?: Record<string, number>;
  gameResult?: GameResult;
  timestamp: number;
}

export interface GameStateChange {
  action: 'save' | 'clear';
  data?: any;
  timestamp: number;
}

// ============ ЛОКАЛЬНОЕ ХРАНИЛИЩЕ ============

const PENDING_CHANGES_KEY = 'nlk_pending_sync';
const OFFLINE_QUEUE_KEY = 'nlk_offline_queue';
const LAST_SYNC_KEY = 'nlk_last_sync';

export const getPendingChanges = (): PendingChanges | null => {
  if (typeof window === 'undefined') return null;
  const stored = localStorage.getItem(PENDING_CHANGES_KEY);
  return stored ? JSON.parse(stored) : null;
};

export const savePendingChanges = (changes: PendingChanges): void => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(PENDING_CHANGES_KEY, JSON.stringify(changes));
};

export const clearPendingChanges = (): void => {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(PENDING_CHANGES_KEY);
};

export const getLastSyncTime = (): number => {
  if (typeof window === 'undefined') return 0;
  return parseInt(localStorage.getItem(LAST_SYNC_KEY) || '0');
};

export const setLastSyncTime = (time: number): void => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(LAST_SYNC_KEY, time.toString());
};

// ============ ПРОВЕРКА ИНТЕРНЕТА ============

export const isOnline = (): boolean => {
  if (typeof window === 'undefined') return false;
  return navigator.onLine;
};

export const subscribeToOnlineStatus = (callback: (online: boolean) => void): (() => void) => {
  if (typeof window === 'undefined') return () => {};
  
  const handleOnline = () => callback(true);
  const handleOffline = () => callback(false);
  
  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);
  
  return () => {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
  };
};

// ============ СИНХРОНИЗАЦИЯ СЛОВАРЕЙ ============

export const queueDictionaryChange = (
  action: 'add' | 'update' | 'delete',
  dictId?: string,
  wordId?: string,
  data?: any
): void => {
  const changes = getPendingChanges() || {};
  
  if (!changes.dictionaries) changes.dictionaries = {};
  
  const key = dictId ? (wordId ? `${dictId}_${wordId}` : dictId) : `new_${Date.now()}`;
  
  // Если удаление - оно имеет приоритет над другими изменениями
  if (action === 'delete') {
    changes.dictionaries[key] = {
      action: 'delete',
      dictId,
      wordId,
      timestamp: Date.now()
    };
  } else {
    // Не добавлять если уже есть удаление
    const existing = changes.dictionaries[key];
    if (existing?.action === 'delete') return;
    
    changes.dictionaries[key] = {
      action,
      dictId,
      wordId,
      data,
      timestamp: Date.now()
    };
  }
  
  savePendingChanges(changes);
};

// ============ СИНХРОНИЗАЦИЯ СТАТИСТИКИ ============

export const queueStatsChange = (
  wordErrors?: Record<string, number>,
  gameResult?: GameResult
): void => {
  const changes = getPendingChanges() || {};
  
  if (!changes.stats) changes.stats = {
    action: 'addErrors',
    timestamp: Date.now()
  };
  
  // Накапливаем ошибки
  if (wordErrors) {
    if (!changes.stats.wordErrors) changes.stats.wordErrors = {};
    for (const [word, count] of Object.entries(wordErrors)) {
      changes.stats.wordErrors[word] = (changes.stats.wordErrors[word] || 0) + count;
    }
  }
  
  if (gameResult) {
    changes.stats.gameResult = gameResult;
  }
  
  changes.stats.timestamp = Date.now();
  savePendingChanges(changes);
};

// ============ СИНХРОНИЗАЦИЯ СОСТОЯНИЯ ИГРЫ ============

export const queueGameStateChange = (data: any): void => {
  const changes = getPendingChanges() || {};
  
  changes.gameState = {
    action: 'save',
    data,
    timestamp: Date.now()
  };
  
  savePendingChanges(changes);
};

export const clearQueuedGameState = (): void => {
  const changes = getPendingChanges() || {};
  changes.gameState = {
    action: 'clear',
    timestamp: Date.now()
  };
  savePendingChanges(changes);
};

// ============ ОТПРАВКА ИЗМЕНЕНИЙ В FIREBASE ============

export const syncPendingChanges = async (uid: string): Promise<{ success: boolean; error?: string }> => {
  if (!isOnline()) {
    return { success: false, error: 'Нет интернета' };
  }
  
  const changes = getPendingChanges();
  if (!changes || Object.keys(changes).length === 0) {
    return { success: true };
  }
  
  try {
    // 1. Синхронизация словарей
    if (changes.dictionaries) {
      for (const [key, change] of Object.entries(changes.dictionaries)) {
        await syncDictionaryChange(uid, change as DictionaryChange);
      }
    }
    
    // 2. Синхронизация статистики
    if (changes.stats) {
      await syncStatsChange(uid, changes.stats);
    }
    
    // 3. Синхронизация состояния игры
    if (changes.gameState) {
      await syncGameStateChange(uid, changes.gameState);
    }
    
    // Очистить очередь после успешной синхронизации
    clearPendingChanges();
    setLastSyncTime(Date.now());
    
    return { success: true };
  } catch (error: any) {
    console.error('Sync failed:', error);
    return { success: false, error: error.message };
  }
};

const syncDictionaryChange = async (uid: string, change: DictionaryChange) => {
  if (change.action === 'delete') {
    if (change.wordId) {
      // Удаление слова
      const wordRef = ref(database, `${FIREBASE_PATHS.users}/${uid}/dictionaries/${change.dictId}/words/${change.wordId}`);
      await update(wordRef, { deleted: true, deletedAt: Date.now() });
    } else if (change.dictId) {
      // Удаление словаря
      const dictRef = ref(database, `${FIREBASE_PATHS.users}/${uid}/dictionaries/${change.dictId}`);
      await update(dictRef, { deleted: true, deletedAt: Date.now() });
    }
  } else if (change.action === 'add' || change.action === 'update') {
    if (change.wordId && change.dictId) {
      const wordRef = ref(database, `${FIREBASE_PATHS.users}/${uid}/dictionaries/${change.dictId}/words/${change.wordId}`);
      await set(wordRef, {
        ...change.data,
        updatedAt: Date.now()
      });
    } else if (change.dictId) {
      const dictRef = ref(database, `${FIREBASE_PATHS.users}/${uid}/dictionaries/${change.dictId}`);
      await set(dictRef, {
        ...change.data,
        updatedAt: Date.now()
      });
    }
  }
};

const syncStatsChange = async (uid: string, change: StatsChange) => {
  const statsRef = ref(database, `${FIREBASE_PATHS.users}/${uid}/stats`);
  
  // Читаем текущую статистику
  const snapshot = await get(statsRef);
  const currentStats: UserStats = snapshot.exists() ? snapshot.val() : {
    totalGames: 0,
    totalErrors: 0,
    games: [],
    wordErrors: {}
  };
  
  const updates: any = {};
  
  // Добавляем ошибки слов (простое сложение)
  if (change.wordErrors) {
    const newWordErrors = { ...currentStats.wordErrors };
    for (const [word, count] of Object.entries(change.wordErrors)) {
      newWordErrors[word] = (newWordErrors[word] || 0) + count;
    }
    updates.wordErrors = newWordErrors;
    updates.totalErrors = Object.values(newWordErrors).reduce((a: number, b: number) => a + b, 0);
  }
  
  // Добавляем результат игры
  if (change.gameResult) {
    const games = [...(currentStats.games || []), change.gameResult];
    games.sort((a, b) => a.date - b.date); // Сортируем по времени
    updates.games = games;
    updates.totalGames = games.length;
  }
  
  if (Object.keys(updates).length > 0) {
    await update(statsRef, updates);
  }
};

const syncGameStateChange = async (uid: string, change: GameStateChange) => {
  const stateRef = ref(database, `${FIREBASE_PATHS.users}/${uid}/gameState`);
  
  if (change.action === 'save' && change.data) {
    await set(stateRef, {
      ...change.data,
      lastUpdated: Date.now()
    });
  } else if (change.action === 'clear') {
    await set(stateRef, null);
  }
};

// ============ ЗАГРУЗКА ДАННЫХ С СИНХРОНИЗАЦИЕЙ ============

export const loadAndMergeDictionaries = async (uid: string, localDicts: Dictionary[]): Promise<Dictionary[]> => {
  if (!isOnline()) {
    return localDicts;
  }
  
  try {
    const remoteRef = ref(database, `${FIREBASE_PATHS.users}/${uid}/dictionaries`);
    const snapshot = await get(remoteRef);
    
    if (!snapshot.exists()) {
      return localDicts;
    }
    
    const remoteDicts: Record<string, any> = snapshot.val();
    const mergedDicts = [...localDicts];
    
    for (const [remoteId, remoteDict] of Object.entries(remoteDicts)) {
      // Пропускаем удалённые
      if (remoteDict.deleted) continue;
      
      const localIndex = mergedDicts.findIndex(d => d.id === remoteId);
      
      if (localIndex === -1) {
        // Нет локально - добавляем с сервера
        mergedDicts.push({ id: remoteId, ...remoteDict });
      } else {
        // Есть локально - мержим (удаления имеют приоритет)
        const local = mergedDicts[localIndex];
        const mergedWords = mergeWords(local.words || [], remoteDict.words || {}, remoteDict.deletedWords || {});
        mergedDicts[localIndex] = { ...local, ...remoteDict, words: mergedWords };
      }
    }
    
    return mergedDicts;
  } catch (error) {
    console.error('Error loading dictionaries:', error);
    return localDicts;
  }
};

const mergeWords = (
  localWords: DictionaryWord[],
  remoteWords: Record<string, any>,
  deletedWordIds: Record<string, boolean>
): DictionaryWord[] => {
  // Удаляем слова, которые удалены на сервере
  const filteredLocal = localWords.filter(w => !deletedWordIds[w.id]);
  
  // Добавляем новые слова с сервера
  for (const [id, word] of Object.entries(remoteWords)) {
    if (deletedWordIds[id]) continue; // Пропускаем удалённые
    
    const exists = filteredLocal.find(w => w.id === id);
    if (!exists) {
      filteredLocal.push({ id, ...word });
    }
  }
  
  return filteredLocal;
};

export const loadGameState = async (uid: string): Promise<any | null> => {
  if (!isOnline()) {
    // В офлайне возвращаем локальное состояние если есть
    const pending = getPendingChanges();
    return pending?.gameState?.data || null;
  }
  
  try {
    const stateRef = ref(database, `${FIREBASE_PATHS.users}/${uid}/gameState`);
    const snapshot = await get(stateRef);
    return snapshot.exists() ? snapshot.val() : null;
  } catch (error) {
    console.error('Error loading game state:', error);
    return null;
  }
};

export const loadStats = async (uid: string): Promise<UserStats | null> => {
  if (!isOnline()) {
    return null;
  }
  
  try {
    const statsRef = ref(database, `${FIREBASE_PATHS.users}/${uid}/stats`);
    const snapshot = await get(statsRef);
    return snapshot.exists() ? snapshot.val() : null;
  } catch (error) {
    console.error('Error loading stats:', error);
    return null;
  }
};