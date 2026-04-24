import { ref, set, get, update, remove, onValue, off } from 'firebase/database';
import { database } from './firebase';
import {
  Dictionary,
  DictionaryWord,
  UserStats,
  SyncPendingChanges,
  DictionaryChanges,
  MAX_USER_DICTIONARIES,
  MAX_WORDS_PER_DICTIONARY,
  FIREBASE_PATHS,
} from '@/types';

// ============ СЛОВАРИ ============

export async function getUserDictionaries(uid: string): Promise<Dictionary[]> {
  const userDictsRef = ref(database, `${FIREBASE_PATHS.users}/${uid}/dictionaries`);
  const snapshot = await get(userDictsRef);
  
  if (!snapshot.exists()) return [];
  
  const data = snapshot.val();
  return Object.entries(data).map(([dictId, dict]) => {
    const { id, ...rest } = dict as Dictionary;
    return {
      id: dictId,
      ...rest,
    };
  });
}

export interface DefaultDictsMeta {
  lastUpdated: number;
  version: string;
}

export async function getDefaultDictionariesMeta(): Promise<DefaultDictsMeta | null> {
  const metaRef = ref(database, FIREBASE_PATHS.defaultDictionaries + '/_meta');
  const snapshot = await get(metaRef);
  
  if (!snapshot.exists()) return null;
  
  return snapshot.val() as DefaultDictsMeta;
}

export async function getDefaultDictionaries(forceRefresh = false): Promise<Dictionary[]> {
  const cachedDefaults = localStorage.getItem('nlk_default_dictionaries');
  const cachedMeta = JSON.parse(localStorage.getItem('nlk_default_dictionaries_meta') || '{}');
  
  try {
    const remoteMeta = await getDefaultDictionariesMeta();
    
    // Если есть кеш и он свежий - используем его
    if (cachedDefaults && cachedMeta && remoteMeta) {
      if (remoteMeta.lastUpdated <= cachedMeta.lastUpdated && !forceRefresh) {
        return JSON.parse(cachedDefaults);
      }
    }
    
    const defaultDictsRef = ref(database, FIREBASE_PATHS.defaultDictionaries);
    const snapshot = await get(defaultDictsRef);
    
    if (!snapshot.exists()) {
      const hardcoded = getDefaultDictionariesHardcoded();
      // Сохраняем в кеш
      localStorage.setItem('nlk_default_dictionaries', JSON.stringify(hardcoded));
      localStorage.setItem('nlk_default_dictionaries_meta', JSON.stringify({ lastUpdated: Date.now(), version: '1.0' }));
      return hardcoded;
    }
    
    const data = snapshot.val();
    const dicts = Object.entries(data)
      .filter(([key]) => key !== '_meta')
      .map(([dictId, dict]) => {
        const { id: _dictId, ...rest } = dict as Dictionary;
        return {
          id: dictId,
          ...rest,
          isDefault: true,
        };
      });
    
    // Обновляем кеш
    localStorage.setItem('nlk_default_dictionaries', JSON.stringify(dicts));
    localStorage.setItem('nlk_default_dictionaries_meta', JSON.stringify(remoteMeta || { lastUpdated: Date.now(), version: '1.0' }));
    
    return dicts;
  } catch (error) {
    // При ошибке возвращаем кеш если есть
    if (cachedDefaults) {
      return JSON.parse(cachedDefaults);
    }
    // Иначе fallback на hardcoded
    return getDefaultDictionariesHardcoded();
  }
}

function getDefaultDictionariesHardcoded(): Dictionary[] {
  return [
    {
      id: 'default_1',
      name: '常用词',
      userId: 'system',
      isDefault: true,
      words: [
        { id: '1', word: 'привет', variants: {}, merges: [], gamesHistory: [], wordErrors: {} },
        { id: '2', word: 'пока', variants: {}, merges: [], gamesHistory: [], wordErrors: {} },
        { id: '3', word: 'спасибо', variants: {}, merges: [], gamesHistory: [], wordErrors: {} },
        { id: '4', word: 'пожалуйста', variants: {}, merges: [], gamesHistory: [], wordErrors: {} },
        { id: '5', word: 'извините', variants: {}, merges: [], gamesHistory: [], wordErrors: {} },
      ],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    {
      id: 'default_2',
      name: 'Частые ошибки',
      userId: 'system',
      isDefault: true,
      words: [
        { id: '6', word: 'кофеёжка', variants: {}, merges: [{ start: 2, end: 3 }], gamesHistory: [], wordErrors: {} },
        { id: '7', word: 'однако', variants: { 4: ['нако', 'днако'] }, merges: [], gamesHistory: [], wordErrors: {} },
        { id: '8', word: 'зависит', variants: { 7: ['ит', 'ет'] }, merges: [], gamesHistory: [], wordErrors: {} },
        { id: '9', word: 'красивее', variants: { 8: ['ей', 'ее'] }, merges: [], gamesHistory: [], wordErrors: {} },
        { id: '10', word: 'звонит', variants: { 5: ['ит', 'ит'] }, merges: [], gamesHistory: [], wordErrors: {} },
      ],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  ];
}

export async function createDictionary(
  uid: string,
  name: string
): Promise<{ success: boolean; dict?: Dictionary; error?: string }> {
  // Проверяем лимит
  const existingDicts = await getUserDictionaries(uid);
  if (existingDicts.length >= MAX_USER_DICTIONARIES) {
    return { success: false, error: `Максимум ${MAX_USER_DICTIONARIES} словарей` };
  }

  const dictId = `dict_${Date.now()}`;
  const now = Date.now();
  
  const newDict: Dictionary = {
    id: dictId,
    name,
    userId: uid,
    words: [],
    createdAt: now,
    updatedAt: now,
  };

  const dictRef = ref(database, `${FIREBASE_PATHS.users}/${uid}/dictionaries/${dictId}`);
  await set(dictRef, newDict);

  return { success: true, dict: newDict };
}

export async function updateDictionary(
  uid: string,
  dictId: string,
  updates: Partial<Dictionary>
): Promise<void> {
  const dictRef = ref(database, `${FIREBASE_PATHS.users}/${uid}/dictionaries/${dictId}`);
  await update(dictRef, {
    ...updates,
    updatedAt: Date.now(),
  });
}

export async function deleteDictionary(uid: string, dictId: string): Promise<void> {
  const dictRef = ref(database, `${FIREBASE_PATHS.users}/${uid}/dictionaries/${dictId}`);
  await remove(dictRef);
}

// ============ СЛОВА ============

export async function addWordToDictionary(
  uid: string,
  dictId: string,
  word: DictionaryWord
): Promise<{ success: boolean; error?: string }> {
  // Проверяем лимит слов
  const dictRef = ref(database, `${FIREBASE_PATHS.users}/${uid}/dictionaries/${dictId}`);
  const snapshot = await get(dictRef);
  
  if (!snapshot.exists()) {
    return { success: false, error: 'Словарь не найден' };
  }
  
  const dict = snapshot.val() as Dictionary;
  if (dict.words && Object.keys(dict.words).length >= MAX_WORDS_PER_DICTIONARY) {
    return { success: false, error: `Максимум ${MAX_WORDS_PER_DICTIONARY} слов в словаре` };
  }

  const wordId = `word_${Date.now()}`;
  const wordWithId = { ...word, id: wordId };
  
  const wordsRef = ref(database, `${FIREBASE_PATHS.users}/${uid}/dictionaries/${dictId}/words/${wordId}`);
  await set(wordsRef, wordWithId);

  return { success: true };
}

export async function updateWordInDictionary(
  uid: string,
  dictId: string,
  wordId: string,
  word: DictionaryWord
): Promise<{ success: boolean; error?: string }> {
  const wordRef = ref(database, `${FIREBASE_PATHS.users}/${uid}/dictionaries/${dictId}/words/${wordId}`);
  await update(wordRef, {
    word: word.word,
    variants: word.variants,
    merges: word.merges,
    plusCells: word.plusCells,
  });
  return { success: true };
}

export async function deleteWordFromDictionary(
  uid: string,
  dictId: string,
  wordId: string
): Promise<void> {
  const wordRef = ref(database, `${FIREBASE_PATHS.users}/${uid}/dictionaries/${dictId}/words/${wordId}`);
  await remove(wordRef);
}

// ============ СТАТИСТИКА ============

export async function getUserStats(uid: string): Promise<UserStats> {
  const statsRef = ref(database, `${FIREBASE_PATHS.users}/${uid}/stats`);
  const snapshot = await get(statsRef);
  
  if (!snapshot.exists()) {
    return {
      totalGames: 0,
      totalErrors: 0,
      games: [],
      wordErrors: {},
    };
  }
  
  return snapshot.val() as UserStats;
}

export async function addGameResult(
  uid: string,
  dictId: string,
  gameResult: {
    errors: number;
    totalSegments: number;
    correctSegments: number;
    wordErrors?: Record<string, number>;
  }
): Promise<void> {
  const statsRef = ref(database, `${FIREBASE_PATHS.users}/${uid}/stats`);
  
  // Получаем текущую статистику
  const snapshot = await get(statsRef);
  const currentStats = snapshot.exists() ? (snapshot.val() as UserStats) : {
    totalGames: 0,
    totalErrors: 0,
    games: [],
    wordErrors: {},
  };
  
  // Обновляем
  const newGame = {
    dictId,
    date: Date.now(),
    ...gameResult,
  };
  
  const updates: any = {
    totalGames: currentStats.totalGames + 1,
    totalErrors: currentStats.totalErrors + gameResult.errors,
    games: [...(currentStats.games || []), newGame],
  };
  
  // Обновляем ошибки по словам
  if (gameResult.wordErrors) {
    const wordErrors = { ...currentStats.wordErrors };
    for (const [word, count] of Object.entries(gameResult.wordErrors)) {
      wordErrors[word] = (wordErrors[word] || 0) + count;
    }
    updates.wordErrors = wordErrors;
  }
  
  await update(statsRef, updates);
}

// ============ СИНХРОНИЗАЦИЯ ============

export async function getSyncPendingChanges(uid: string): Promise<SyncPendingChanges | null> {
  const syncRef = ref(database, `${FIREBASE_PATHS.users}/${uid}/sync/pendingChanges`);
  const snapshot = await get(syncRef);
  
  if (!snapshot.exists()) return null;
  return snapshot.val() as SyncPendingChanges;
}

export async function updateSyncPendingChanges(
  uid: string,
  dictId: string,
  changes: DictionaryChanges
): Promise<void> {
  const syncRef = ref(database, `${FIREBASE_PATHS.users}/${uid}/sync/pendingChanges/dictionaries/${dictId}`);
  
  // Получаем текущие изменения
  const snapshot = await get(syncRef);
  const current = snapshot.exists() ? (snapshot.val() as DictionaryChanges) : {
    added: [],
    updated: [],
    deleted: [],
  };
  
  // Объединяем новые изменения
  const merged: DictionaryChanges = {
    added: [...new Set([...current.added, ...changes.added])],
    updated: [...new Set([...current.updated, ...changes.updated])],
    deleted: [...new Set([...current.deleted, ...changes.deleted])],
  };
  
  await set(syncRef, merged);
}

export async function clearSyncPendingChanges(uid: string): Promise<void> {
  const syncRef = ref(database, `${FIREBASE_PATHS.users}/${uid}/sync`);
  await update(syncRef, { pendingChanges: null });
}

// ============ ПОДПИСКИ (REAL-TIME) ============

export function subscribeToUserDictionaries(
  uid: string,
  callback: (dictionaries: Dictionary[]) => void
): () => void {
  const userDictsRef = ref(database, `${FIREBASE_PATHS.users}/${uid}/dictionaries`);
  
  onValue(userDictsRef, (snapshot) => {
    if (!snapshot.exists()) {
      callback([]);
      return;
    }
    
    const data = snapshot.val();
    const dictionaries = Object.entries(data).map(([dictId, dict]) => {
      const { id: _dictId, ...rest } = dict as Dictionary;
      return {
        id: dictId,
        ...rest,
      };
    });
    
    callback(dictionaries);
  });

  return () => off(userDictsRef);
}

export function subscribeToUserStats(
  uid: string,
  callback: (stats: UserStats) => void
): () => void {
  const statsRef = ref(database, `${FIREBASE_PATHS.users}/${uid}/stats`);
  
  onValue(statsRef, (snapshot) => {
    if (!snapshot.exists()) {
      callback({ totalGames: 0, totalErrors: 0, games: [], wordErrors: {} });
      return;
    }
    
    callback(snapshot.val() as UserStats);
  });

  return () => off(statsRef);
}

// ============ НАСТРОЙКИ ПОЛЬЗОВАТЕЛЯ ============

export async function updateUserSettings(
  uid: string,
  settings: { sound?: boolean; vibration?: boolean }
): Promise<void> {
  const settingsRef = ref(database, `${FIREBASE_PATHS.users}/${uid}/settings`);
  await update(settingsRef, settings);
}

// ============ PRACTICE STATE ============

const PRACTICE_STATE_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

export function savePracticeState(dictId: string, state: any): void {
  const key = `nlk_practice_state_${dictId}`;
  const data = {
    ...state,
    savedAt: Date.now(),
  };
  localStorage.setItem(key, JSON.stringify(data));
}

export function loadPracticeState(dictId: string): any | null {
  const key = `nlk_practice_state_${dictId}`;
  const dataStr = localStorage.getItem(key);
  if (!dataStr) return null;
  
  try {
    const data = JSON.parse(dataStr);
    if (Date.now() - data.savedAt > PRACTICE_STATE_EXPIRY_MS) {
      localStorage.removeItem(key);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

export function clearPracticeState(dictId: string): void {
  localStorage.removeItem(`nlk_practice_state_${dictId}`);
}