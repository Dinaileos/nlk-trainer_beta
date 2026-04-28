import { ref, set, get, update, runTransaction, onValue, off } from 'firebase/database';
import { database } from './firebase';
import { FIREBASE_PATHS, Dictionary, DictionaryWord, UserStats, GameResult } from '@/types';

// ============ РўРРџР« Р”РђРќРќР«РҐ ============

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

// ============ Р›РћРљРђР›Р¬РќРћР• РҐР РђРќРР›РР©Р• ============

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

// ============ РџР РћР’Р•Р РљРђ РРќРўР•Р РќР•РўРђ ============

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

// ============ РЎРРќРҐР РћРќРР—РђР¦РРЇ РЎР›РћР’РђР Р•Р™ ============

export const queueDictionaryChange = (
  action: 'add' | 'update' | 'delete',
  dictId?: string,
  wordId?: string,
  data?: any
): void => {
  const changes = getPendingChanges() || {};
  
  if (!changes.dictionaries) changes.dictionaries = {};
  
  const key = dictId ? (wordId ? `${dictId}_${wordId}` : dictId) : `new_${Date.now()}`;
  
  // Р•СЃР»Рё СѓРґР°Р»РµРЅРёРµ - РѕРЅРѕ РёРјРµРµС‚ РїСЂРёРѕСЂРёС‚РµС‚ РЅР°Рґ РґСЂСѓРіРёРјРё РёР·РјРµРЅРµРЅРёСЏРјРё
  if (action === 'delete') {
    changes.dictionaries[key] = {
      action: 'delete',
      dictId,
      wordId,
      timestamp: Date.now()
    };
  } else {
    // РќРµ РґРѕР±Р°РІР»СЏС‚СЊ РµСЃР»Рё СѓР¶Рµ РµСЃС‚СЊ СѓРґР°Р»РµРЅРёРµ
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

// ============ РЎРРќРҐР РћРќРР—РђР¦РРЇ РЎРўРђРўРРЎРўРРљР ============

export const queueStatsChange = (
  wordErrors?: Record<string, number>,
  gameResult?: GameResult
): void => {
  const changes = getPendingChanges() || {};
  
  if (!changes.stats) changes.stats = {
    action: 'addErrors',
    timestamp: Date.now()
  };
  
  // РќР°РєР°РїР»РёРІР°РµРј РѕС€РёР±РєРё
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

// ============ РЎРРќРҐР РћРќРР—РђР¦РРЇ РЎРћРЎРўРћРЇРќРРЇ РР“Р Р« ============

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

// ============ РћРўРџР РђР’РљРђ РР—РњР•РќР•РќРР™ Р’ FIREBASE ============

export const syncPendingChanges = async (uid: string): Promise<{ success: boolean; error?: string }> => {
  if (!isOnline()) {
    return { success: false, error: 'РќРµС‚ РёРЅС‚РµСЂРЅРµС‚Р°' };
  }
  
  const changes = getPendingChanges();
  if (!changes || Object.keys(changes).length === 0) {
    return { success: true };
  }
  
  try {
    // 1. РЎРёРЅС…СЂРѕРЅРёР·Р°С†РёСЏ СЃР»РѕРІР°СЂРµР№
    if (changes.dictionaries) {
      for (const [key, change] of Object.entries(changes.dictionaries)) {
        await syncDictionaryChange(uid, change as DictionaryChange);
      }
    }
    
    // 2. РЎРёРЅС…СЂРѕРЅРёР·Р°С†РёСЏ СЃС‚Р°С‚РёСЃС‚РёРєРё
    if (changes.stats) {
      await syncStatsChange(uid, changes.stats);
    }
    
    // 3. РЎРёРЅС…СЂРѕРЅРёР·Р°С†РёСЏ СЃРѕСЃС‚РѕСЏРЅРёСЏ РёРіСЂС‹
    if (changes.gameState) {
      await syncGameStateChange(uid, changes.gameState);
    }
    
    // РћС‡РёСЃС‚РёС‚СЊ РѕС‡РµСЂРµРґСЊ РїРѕСЃР»Рµ СѓСЃРїРµС€РЅРѕР№ СЃРёРЅС…СЂРѕРЅРёР·Р°С†РёРё
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
      // РЈРґР°Р»РµРЅРёРµ СЃР»РѕРІР°
      const wordRef = ref(database, `${FIREBASE_PATHS.users}/${uid}/dictionaries/${change.dictId}/words/${change.wordId}`);
      await update(wordRef, { deleted: true, deletedAt: Date.now() });
    } else if (change.dictId) {
      // РЈРґР°Р»РµРЅРёРµ СЃР»РѕРІР°СЂСЏ
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
  
  // Р§РёС‚Р°РµРј С‚РµРєСѓС‰СѓСЋ СЃС‚Р°С‚РёСЃС‚РёРєСѓ
  const snapshot = await get(statsRef);
  const currentStats: UserStats = snapshot.exists() ? snapshot.val() : {
    totalGames: 0,
    totalErrors: 0,
    games: [],
    wordErrors: {}
  };
  
  const updates: any = {};
  
  // Р”РѕР±Р°РІР»СЏРµРј РѕС€РёР±РєРё СЃР»РѕРІ (РїСЂРѕСЃС‚РѕРµ СЃР»РѕР¶РµРЅРёРµ)
  if (change.wordErrors) {
    const newWordErrors = { ...currentStats.wordErrors };
    for (const [word, count] of Object.entries(change.wordErrors)) {
      newWordErrors[word] = (newWordErrors[word] || 0) + count;
    }
    updates.wordErrors = newWordErrors;
    updates.totalErrors = Object.values(newWordErrors).reduce((a: number, b: number) => a + b, 0);
  }
  
  // Р”РѕР±Р°РІР»СЏРµРј СЂРµР·СѓР»СЊС‚Р°С‚ РёРіСЂС‹
  if (change.gameResult) {
    const games = [...(currentStats.games || []), change.gameResult];
    games.sort((a, b) => a.date - b.date); // РЎРѕСЂС‚РёСЂСѓРµРј РїРѕ РІСЂРµРјРµРЅРё
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

// ============ Р—РђР“Р РЈР—РљРђ Р”РђРќРќР«РҐ РЎ РЎРРќРҐР РћРќРР—РђР¦РР•Р™ ============

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
      // РџСЂРѕРїСѓСЃРєР°РµРј СѓРґР°Р»С‘РЅРЅС‹Рµ
      if (remoteDict.deleted) continue;
      
      const localIndex = mergedDicts.findIndex(d => d.id === remoteId);
      
      if (localIndex === -1) {
        // РќРµС‚ Р»РѕРєР°Р»СЊРЅРѕ - РґРѕР±Р°РІР»СЏРµРј СЃ СЃРµСЂРІРµСЂР°
        mergedDicts.push({ id: remoteId, ...remoteDict });
      } else {
        // Р•СЃС‚СЊ Р»РѕРєР°Р»СЊРЅРѕ - РјРµСЂР¶РёРј (СѓРґР°Р»РµРЅРёСЏ РёРјРµСЋС‚ РїСЂРёРѕСЂРёС‚РµС‚)
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
  // РЈРґР°Р»СЏРµРј СЃР»РѕРІР°, РєРѕС‚РѕСЂС‹Рµ СѓРґР°Р»РµРЅС‹ РЅР° СЃРµСЂРІРµСЂРµ
  const filteredLocal = localWords.filter(w => !deletedWordIds[w.id]);
  
  // Р”РѕР±Р°РІР»СЏРµРј РЅРѕРІС‹Рµ СЃР»РѕРІР° СЃ СЃРµСЂРІРµСЂР°
  for (const [id, word] of Object.entries(remoteWords)) {
    if (deletedWordIds[id]) continue; // РџСЂРѕРїСѓСЃРєР°РµРј СѓРґР°Р»С‘РЅРЅС‹Рµ
    
    const exists = filteredLocal.find(w => w.id === id);
    if (!exists) {
      filteredLocal.push({ id, ...word });
    }
  }
  
  return filteredLocal;
};

export const loadGameState = async (uid: string): Promise<any | null> => {
  if (!isOnline()) {
    // Р’ РѕС„Р»Р°Р№РЅРµ РІРѕР·РІСЂР°С‰Р°РµРј Р»РѕРєР°Р»СЊРЅРѕРµ СЃРѕСЃС‚РѕСЏРЅРёРµ РµСЃР»Рё РµСЃС‚СЊ
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

// ============ РћР‘РЄР•Р”РРќР•РќРР• РЎР›РћР’РђР Р•Р™ ============

/**
 * РћР±СЉРµРґРёРЅСЏРµС‚ РґРІРµ РІРµСЂСЃРёРё СЃР»РѕРІР°СЂСЏ РїРѕ РїСЂР°РІРёР»Р°Рј:
 * 1. Р’С‹Р±РёСЂР°РµС‚СЃСЏ РІРµСЂСЃРёСЏ СЃ Р±РѕР»СЊС€РёРј updatedAt РєР°Рє РѕСЃРЅРѕРІР°
 * 2. Р”РѕР±Р°РІР»СЏСЋС‚СЃСЏ СЃР»РѕРІР° РёР· РІС‚РѕСЂРѕР№ РІРµСЂСЃРёРё, РєРѕС‚РѕСЂС‹С… РЅРµС‚ РІ РїРµСЂРІРѕР№ (РїРѕ word, Р±РµР· СѓС‡С‘С‚Р° СЂРµРіРёСЃС‚СЂР°)
 * 3. РџСЂРё РєРѕРЅС„Р»РёРєС‚Рµ СЃР»РѕРІР° (РѕРґРёРЅР°РєРѕРІС‹Р№ word) РѕСЃС‚Р°С‘С‚СЃСЏ РІР°СЂРёР°РЅС‚ СЃ Р±РѕР»СЊС€РёРј updatedAt
 * 4. Р’СЃРµ РїРѕР»СЏ СЃР»РѕРІР°СЂСЏ (name, userId, isDefault, plusDictionary Рё С‚.Рґ.) Р±РµСЂСѓС‚СЃСЏ РёР· Р±РѕР»РµРµ РЅРѕРІРѕР№ РІРµСЂСЃРёРё
 * 5. РС‚РѕРіРѕРІС‹Р№ updatedAt СѓСЃС‚Р°РЅР°РІР»РёРІР°РµС‚СЃСЏ РІ Date.now()
 */
export function mergeDictionaries(newDict: Dictionary, oldDict: Dictionary): Dictionary {
  // РћРїСЂРµРґРµР»СЏРµРј, РєР°РєР°СЏ РІРµСЂСЃРёСЏ СЃР»РѕРІР°СЂСЏ РЅРѕРІРµРµ РїРѕ updatedAt
  const isNewDictNewer = newDict.updatedAt >= oldDict.updatedAt;
  const baseDict = isNewDictNewer ? newDict : oldDict;
  const otherDict = isNewDictNewer ? oldDict : newDict;

  // Map РґР»СЏ РѕР±СЉРµРґРёРЅРµРЅРёСЏ СЃР»РѕРІ: РєР»СЋС‡ - word РІ РЅРёР¶РЅРµРј СЂРµРіРёСЃС‚СЂРµ
  const wordsMap = new Map<string, DictionaryWord>();

  // Р”РѕР±Р°РІР»СЏРµРј СЃР»РѕРІР° РёР· Р±Р°Р·РѕРІРѕР№ (Р±РѕР»РµРµ РЅРѕРІРѕР№) РІРµСЂСЃРёРё
  for (const word of baseDict.words) {
    const key = word.word.toLowerCase();
    wordsMap.set(key, word);
  }

  // РћР±СЂР°Р±Р°С‚С‹РІР°РµРј СЃР»РѕРІР° РёР· РІС‚РѕСЂРѕР№ РІРµСЂСЃРёРё
  for (const word of otherDict.words) {
    const key = word.word.toLowerCase();
    const existing = wordsMap.get(key);

    if (!existing) {
      // РЎР»РѕРІР° РЅРµС‚ РІ Р±Р°Р·РѕРІРѕР№ РІРµСЂСЃРёРё - РґРѕР±Р°РІР»СЏРµРј
      wordsMap.set(key, word);
    } else {
      // РЎР»РѕРІРѕ СѓР¶Рµ РµСЃС‚СЊ - РІС‹Р±РёСЂР°РµРј Р±РѕР»РµРµ РЅРѕРІРѕРµ РїРѕ updatedAt
      const existingTs = (existing as any).updatedAt || 0;
      const wordTs = (word as any).updatedAt || 0;
      if (wordTs > existingTs) {
        wordsMap.set(key, word);
      }
    }
  }

  // РЎРѕР±РёСЂР°РµРј РёС‚РѕРіРѕРІС‹Р№ СЃР»РѕРІР°СЂСЊ: РІСЃРµ РїРѕР»СЏ РёР· Р±РѕР»РµРµ РЅРѕРІРѕР№ РІРµСЂСЃРёРё + РѕР±СЉРµРґРёРЅС‘РЅРЅС‹Рµ СЃР»РѕРІР° + РЅРѕРІС‹Р№ updatedAt
  const mergedDict: Dictionary = {
    ...baseDict,
    words: Array.from(wordsMap.values()),
    updatedAt: Date.now(),
  };

  return mergedDict;
}

/**
 * РЎРёРЅС…СЂРѕРЅРёР·РёСЂСѓРµС‚ СЃР»РѕРІР°СЂСЊ РјРµР¶РґСѓ Р»РѕРєР°Р»СЊРЅС‹Рј С…СЂР°РЅРёР»РёС‰РµРј Рё Firebase.
 * РџСЂРё РѕС€РёР±РєРµ СЃРµС‚Рё РІРѕР·РІСЂР°С‰Р°РµС‚ Р»РѕРєР°Р»СЊРЅСѓСЋ РІРµСЂСЃРёСЋ.
 */
export async function syncDictionary(uid: string, dictId: string): Promise<Dictionary> {
  // 1. Р§РёС‚Р°РµРј Р»РѕРєР°Р»СЊРЅСѓСЋ РІРµСЂСЃРёСЋ СЃР»РѕРІР°СЂСЏ РёР· localStorage (РєР»СЋС‡ 'nlk_dictionaries')
  let localDicts: Dictionary[] = [];
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('nlk_dictionaries');
    if (stored) {
      try {
        localDicts = JSON.parse(stored);
      } catch (e) {
        console.error('Error parsing local dictionaries:', e);
        localDicts = [];
      }
    }
  }
  const localDict = localDicts.find(d => d.id === dictId);

  // 2. Р§РёС‚Р°РµРј СЃРµСЂРІРµСЂРЅСѓСЋ РІРµСЂСЃРёСЋ РёР· Firebase (РїСѓС‚СЊ: users/{uid}/dictionaries/{dictId})
  let serverDict: Dictionary | null = null;

  if (!isOnline()) {
    // РќРµС‚ РёРЅС‚РµСЂРЅРµС‚Р° вЂ” РІРѕР·РІСЂР°С‰Р°РµРј Р»РѕРєР°Р»СЊРЅСѓСЋ РІРµСЂСЃРёСЋ, РµСЃР»Рё РµСЃС‚СЊ
    if (localDict) {
      return localDict;
    }
    throw new Error('РќРµС‚ РёРЅС‚РµСЂРЅРµС‚Р° Рё Р»РѕРєР°Р»СЊРЅР°СЏ РІРµСЂСЃРёСЏ СЃР»РѕРІР°СЂСЏ РѕС‚СЃСѓС‚СЃС‚РІСѓРµС‚');
  }

  try {
    const dictRef = ref(database, `${FIREBASE_PATHS.users}/${uid}/dictionaries/${dictId}`);
    const snapshot = await get(dictRef);

    if (snapshot.exists()) {
      const data = snapshot.val();
      // РџСЂРѕРїСѓСЃРєР°РµРј СѓРґР°Р»С‘РЅРЅС‹Рµ СЃР»РѕРІР°СЂРё
      if (!data.deleted) {
        serverDict = { id: dictId, ...data };
      }
    }
  } catch (error) {
    console.error('Error reading dictionary from Firebase:', error);
    // РџСЂРё РѕС€РёР±РєРµ СЃРµС‚Рё РІРѕР·РІСЂР°С‰Р°РµРј Р»РѕРєР°Р»СЊРЅСѓСЋ РІРµСЂСЃРёСЋ
    if (localDict) {
      return localDict;
    }
    throw error;
  }

  // 3. Р•СЃР»Рё СЃРµСЂРІРµСЂРЅРѕР№ РІРµСЂСЃРёРё РЅРµС‚ вЂ” Р·Р°РїРёСЃС‹РІР°РµРј Р»РѕРєР°Р»СЊРЅСѓСЋ РІ Firebase Рё РІРѕР·РІСЂР°С‰Р°РµРј РµС‘
  if (!serverDict) {
    if (localDict) {
      try {
        const dictRef = ref(database, `${FIREBASE_PATHS.users}/${uid}/dictionaries/${dictId}`);
        await set(dictRef, { ...localDict, updatedAt: Date.now() });
      } catch (error) {
        console.error('Error writing local dict to Firebase:', error);
      }
      return localDict;
    }
    throw new Error('РЎР»РѕРІР°СЂСЊ РЅРµ РЅР°Р№РґРµРЅ РЅРё Р»РѕРєР°Р»СЊРЅРѕ, РЅРё РЅР° СЃРµСЂРІРµСЂРµ');
  }

  // 4. Р•СЃР»Рё Р»РѕРєР°Р»СЊРЅРѕР№ РІРµСЂСЃРёРё РЅРµС‚ вЂ” Р·Р°РїРёСЃС‹РІР°РµРј СЃРµСЂРІРµСЂРЅСѓСЋ РІ localStorage Рё РІРѕР·РІСЂР°С‰Р°РµРј РµС‘
  if (!localDict) {
    localDicts.push(serverDict);
    if (typeof window !== 'undefined') {
      localStorage.setItem('nlk_dictionaries', JSON.stringify(localDicts));
    }
    return serverDict;
  }

  // 5. Р•СЃС‚СЊ РѕР±Рµ РІРµСЂСЃРёРё вЂ” РѕР±СЉРµРґРёРЅСЏРµРј С‡РµСЂРµР· mergeDictionaries
  const merged = mergeDictionaries(localDict, serverDict);

  // 5b. Р—Р°РїРёСЃС‹РІР°РµРј СЂРµР·СѓР»СЊС‚Р°С‚ РІ localStorage
  const updatedLocalDicts = localDicts.map(d => d.id === dictId ? merged : d);
  if (typeof window !== 'undefined') {
    localStorage.setItem('nlk_dictionaries', JSON.stringify(updatedLocalDicts));
  }

  // 5c. Р—Р°РїРёСЃС‹РІР°РµРј СЂРµР·СѓР»СЊС‚Р°С‚ РІ Firebase
  try {
    const dictRef = ref(database, `${FIREBASE_PATHS.users}/${uid}/dictionaries/${dictId}`);
    await set(dictRef, { ...merged, updatedAt: Date.now() });
  } catch (error) {
    console.error('Error writing merged dict to Firebase:', error);
  }

  // 5d. Р’РѕР·РІСЂР°С‰Р°РµРј РѕР±СЉРµРґРёРЅС‘РЅРЅС‹Р№ СЃР»РѕРІР°СЂСЊ
  return merged;
}