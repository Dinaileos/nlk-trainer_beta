import { create } from 'zustand';
import {
  User,
  Dictionary,
  DictionaryWord,
  UserStats,
  GameResult,
  EditorState,
  ExerciseState,
  MAX_USER_DICTIONARIES,
  MAX_WORDS_PER_DICTIONARY,
} from '@/types';
import * as authLib from '@/lib/auth';
import * as db from '@/lib/database';
import * as sync from '@/lib/syncService';
import { getDefaultDictionariesHardcoded } from '@/lib/database';

// ============ AUTH STORE ============

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isInitialized: boolean;
  
  // Actions
  initialize: () => Promise<void>;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (username: string, email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  updateSettings: (settings: Partial<User['settings']>) => Promise<void>;
  isAdmin: () => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isLoading: true,
  isInitialized: false,
  
  initialize: async () => {
    try {
      const localUser = await authLib.getCurrentUserFromLocalStorage();
      if (localUser) {
        set({ user: localUser, isLoading: false, isInitialized: true });
      } else {
        set({ user: null, isLoading: false, isInitialized: true });
      }
    } catch (error) {
      console.error('Auth init error:', error);
      set({ user: null, isLoading: false, isInitialized: true });
    }
  },
  
  login: async (email, password) => {
    set({ isLoading: true });
    const result = await authLib.loginUser(email, password);
    
    if (result.success && result.user) {
      set({ user: result.user, isLoading: false });
      return { success: true };
    }
    
    set({ isLoading: false });
    return { success: false, error: result.error };
  },
  
  register: async (username, email, password) => {
    set({ isLoading: true });
    const result = await authLib.registerUser(username, email, password);
    
    if (result.success && result.user) {
      set({ user: result.user, isLoading: false });
      return { success: true };
    }
    
    set({ isLoading: false });
    return { success: false, error: result.error };
  },
  
  logout: async () => {
    await authLib.logoutUser();
    set({ user: null });
  },
  
  updateSettings: async (settings) => {
    const user = useAuthStore.getState().user;
    if (!user) return;
    
    // Р”РµРјРѕ СЂРµР¶РёРј - РїСЂРѕСЃС‚Рѕ РѕР±РЅРѕРІР»СЏРµРј Р»РѕРєР°Р»СЊРЅРѕ
    const updatedUser = {
      ...user,
      settings: { ...user.settings, ...settings },
    };
    localStorage.setItem('nlk_current_user', JSON.stringify(updatedUser));
    set({ user: updatedUser });
  },
  
  isAdmin: () => {
    const user = get().user;
    return user?.uid === 'admin_123';
  },
}));

// ============ DICTIONARIES STORE ============

interface DictionariesState {
  dictionaries: Dictionary[];
  defaultDictionaries: Dictionary[];
  currentDictIndex: number;
  isLoading: boolean;
  
  // Actions
  loadDictionaries: () => Promise<void>;
  createDictionary: (userId: string, name: string) => Promise<string | null>;
  updateDictionary: (dictId: string, updates: Partial<Dictionary>) => Promise<void>;
  deleteDictionary: (dictId: string) => Promise<void>;
  deleteWord: (dictId: string, wordId: string) => Promise<void>;
  setCurrentDict: (index: number) => void;
}

export const useDictionariesStore = create<DictionariesState>((set, get) => ({
  dictionaries: [],
  defaultDictionaries: [],
  currentDictIndex: -1,
  isLoading: false,
  
  loadDictionaries: async () => {
    const user = useAuthStore.getState().user;
    const isDemoUser = user?.uid?.startsWith('demo_') || !user;
    
    // Р§РёС‚Р°РµРј Р»РѕРєР°Р»СЊРЅС‹Рµ Р±Р°Р·РѕРІС‹Рµ СЃР»РѕРІР°СЂРё
    const stored = localStorage.getItem('nlk_default_dictionaries');
    let localDefaults: Dictionary[] = [];
    
    if (stored) {
      try {
        localDefaults = JSON.parse(stored);
      } catch (e) {
        console.error('loadDictionaries: failed to parse stored defaults', e);
      }
    }
    
    // РЈРґР°Р»СЏРµРј РґСѓР±Р»РёРєР°С‚С‹ РїРѕ РЅР°Р·РІР°РЅРёСЋ
    const seen = new Set<string>();
    const deduped: Dictionary[] = [];
    for (const d of localDefaults) {
      if (!seen.has(d.name)) {
        seen.add(d.name);
        deduped.push(d);
      }
    }
    
    localStorage.setItem('nlk_default_dictionaries', JSON.stringify(deduped));
    localDefaults = deduped;
    
    if (isDemoUser) {
      try {
        const demoDicts = JSON.parse(localStorage.getItem('nlk_demo_dictionaries') || '[]');
        set({ defaultDictionaries: localDefaults, dictionaries: demoDicts, isLoading: false });
      } catch (e) {
        console.error('loadDictionaries: failed to parse demo dictionaries', e);
        set({ defaultDictionaries: localDefaults, isLoading: false });
      }
      return;
    }
    
    // Р”Р»СЏ СЂРµР°Р»СЊРЅС‹С… РїРѕР»СЊР·РѕРІР°С‚РµР»РµР№: РјРµСЂР¶РёРј СЃРµСЂРІРµСЂРЅС‹Рµ Рё Р»РѕРєР°Р»СЊРЅС‹Рµ Р±Р°Р·РѕРІС‹Рµ СЃР»РѕРІР°СЂРё
    try {
      const serverDefaults = await db.getDefaultDictionaries();
      
      // РЎРѕР·РґР°РµРј РјР°РїСѓ СЃРµСЂРІРµСЂРЅС‹С… СЃР»РѕРІР°СЂРµР№
      const mergedMap = new Map<string, Dictionary>();
      for (const d of serverDefaults) {
        mergedMap.set(d.id, d);
      }
      
      // Р›РѕРєР°Р»СЊРЅС‹Рµ Р±Р°Р·РѕРІС‹Рµ СЃР»РѕРІР°СЂРё РёРјРµСЋС‚ РїСЂРёРѕСЂРёС‚РµС‚ (СЌС‚Рѕ СЂРµР·СѓР»СЊС‚Р°С‚ СЂРµРґР°РєС‚РёСЂРѕРІР°РЅРёСЏ Р°РґРјРёРЅРѕРј)
      for (const localDict of localDefaults) {
        mergedMap.set(localDict.id, localDict);
      }
      
      const mergedDefaults = Array.from(mergedMap.values());
      
      // Р—Р°РіСЂСѓР¶Р°РµРј РїРѕР»СЊР·РѕРІР°С‚РµР»СЊСЃРєРёРµ СЃР»РѕРІР°СЂРё
      const localDicts = JSON.parse(localStorage.getItem('nlk_demo_dictionaries') || '[]');
      await sync.syncPendingChanges(user.uid);
      const mergedDicts = await sync.loadAndMergeDictionaries(user.uid, localDicts);
      localStorage.setItem('nlk_demo_dictionaries', JSON.stringify(mergedDicts));
      
      set({ defaultDictionaries: mergedDefaults, dictionaries: mergedDicts, isLoading: false });
      return; // Р’Р°Р¶РЅРѕ: РІС‹С…РѕРґРёРј, С‡С‚РѕР±С‹ РЅРµ РІС‹РїРѕР»РЅСЏР»СЃСЏ Р»РёС€РЅРёР№ РєРѕРґ
    } catch (e) {
      console.error('loadDictionaries: failed to load dictionaries', e);
      const localDicts = JSON.parse(localStorage.getItem('nlk_demo_dictionaries') || '[]');
      set({ defaultDictionaries: localDefaults, dictionaries: localDicts, isLoading: false });
    }
  },

  createDictionary: async (userId: string, name: string): Promise<string | null> => {
    try {
      const dictionaries = get().dictionaries;
      
      if (dictionaries.length >= MAX_USER_DICTIONARIES) {
        return null;
      }
      
      const demoDicts = JSON.parse(localStorage.getItem('nlk_demo_dictionaries') || '[]');
      
      const nameLower = name.toLowerCase().trim();
      const exists = demoDicts.some((d: any) => d.name.toLowerCase() === nameLower);
      if (exists) {
        return null;
      }
      
      const newDict = {
        id: 'dict_' + Date.now(),
        name: name || 'РќРѕРІС‹Р№ СЃР»РѕРІР°СЂСЊ',
        userId: userId || 'demo',
        words: [],
        isDefault: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      
      demoDicts.push(newDict);
      localStorage.setItem('nlk_demo_dictionaries', JSON.stringify(demoDicts));
      
      await get().loadDictionaries();
      const newIndex = get().dictionaries.length - 1;
      get().setCurrentDict(newIndex);
      
      return newDict.id;
    } catch (error) {
      return null;
    }
  },

  updateDictionary: async (dictId, updates) => {
    const user = useAuthStore.getState().user;
    
    // Demo mode - С‚РѕР»СЊРєРѕ localStorage
    if (!user || user.uid.startsWith('demo_')) {
      const demoDicts = JSON.parse(localStorage.getItem('nlk_demo_dictionaries') || '[]');
      const idx = demoDicts.findIndex((d: any) => d.id === dictId);
      if (idx >= 0) {
        demoDicts[idx] = { ...demoDicts[idx], ...updates, updatedAt: Date.now() };
        localStorage.setItem('nlk_demo_dictionaries', JSON.stringify(demoDicts));
        await get().loadDictionaries();
      }
      return;
    }
    
    // Real Firebase user
    try {
      // 1. РЎРёРЅС…СЂРѕРЅРёР·РёСЂСѓРµРј СЃР»РѕРІР°СЂСЊ РїРµСЂРµРґ РёР·РјРµРЅРµРЅРёРµРј
      const syncedDict = await sync.syncDictionary(user.uid, dictId);
      
      // 2. РџСЂРёРјРµРЅСЏРµРј РѕР±РЅРѕРІР»РµРЅРёСЏ Рє СЃРёРЅС…СЂРѕРЅРёР·РёСЂРѕРІР°РЅРЅРѕР№ РІРµСЂСЃРёРё
      const updatedDict = { ...syncedDict, ...updates, updatedAt: Date.now() };
      
      // 3. РЎРѕС…СЂР°РЅСЏРµРј РІ Firebase
      const { set: setDb } = await import('firebase/database');
      const { database } = await import('@/lib/firebase');
      const { FIREBASE_PATHS } = await import('@/types');
      
      const dictRef = ref(database, `${FIREBASE_PATHS.users}/${user.uid}/dictionaries/${dictId}`);
      await setDb(dictRef, { ...updatedDict });
      
      // 4. РћР±РЅРѕРІР»СЏРµРј Р»РѕРєР°Р»СЊРЅС‹Р№ СЃС‚РѕСЂ Рё localStorage
      const dictionaries = get().dictionaries;
      const updatedDicts = dictionaries.map(d => d.id === dictId ? updatedDict : d);
      set({ dictionaries: updatedDicts });
      if (typeof window !== 'undefined') {
        localStorage.setItem('nlk_demo_dictionaries', JSON.stringify(updatedDicts));
      }
      
    } catch (error) {
      console.error('Error updating dictionary:', error);
      // Fallback: РїСЂРѕСЃС‚Рѕ РѕР±РЅРѕРІР»СЏРµРј Р»РѕРєР°Р»СЊРЅРѕ
      const dictionaries = get().dictionaries;
      const updatedDicts = dictionaries.map(d => 
        d.id === dictId ? { ...d, ...updates, updatedAt: Date.now() } : d
      );
      set({ dictionaries: updatedDicts });
      if (typeof window !== 'undefined') {
        localStorage.setItem('nlk_demo_dictionaries', JSON.stringify(updatedDicts));
      }
    }
  },

  deleteDictionary: async (dictId) => {
    const user = useAuthStore.getState().user;
    
    // Demo mode - РёСЃРїРѕР»СЊР·СѓРµРј localStorage РґР»СЏ demo РїРѕР»СЊР·РѕРІР°С‚РµР»РµР№
    if (!user || user.uid.startsWith('demo_')) {
      const demoDicts = JSON.parse(localStorage.getItem('nlk_demo_dictionaries') || '[]');
      const dictToDelete = demoDicts.find((d: any) => d.id === dictId);
      
      // Р—Р°С‰РёС‚Р° Р±Р°Р·РѕРІС‹С… СЃР»РѕРІР°СЂРµР№
      if (dictToDelete?.isDefault) {
        return;
      }
      
      const filtered = demoDicts.filter((d: any) => d.id !== dictId);
      localStorage.setItem('nlk_demo_dictionaries', JSON.stringify(filtered));
      // РћР±РЅРѕРІР»СЏРµРј РЅР°РїСЂСЏРјСѓСЋ
      set({ dictionaries: filtered });
      return;
    }
    
    // Real Firebase user
    try {
      // 1. РЎРёРЅС…СЂРѕРЅРёР·РёСЂСѓРµРј, С‡С‚РѕР±С‹ СѓРґР°Р»РёС‚СЊ Р°РєС‚СѓР°Р»СЊРЅСѓСЋ РІРµСЂСЃРёСЋ
      await sync.syncDictionary(user.uid, dictId);
      
      // 2. РџРѕРјРµС‡Р°РµРј СѓРґР°Р»С‘РЅРЅС‹Рј РІ Firebase
      const { update } = await import('firebase/database');
      const { database } = await import('@/lib/firebase');
      const { FIREBASE_PATHS } = await import('@/types');
      
      const dictRef = ref(database, `${FIREBASE_PATHS.users}/${user.uid}/dictionaries/${dictId}`);
      await update(dictRef, { deleted: true, deletedAt: Date.now() });
      
      // 3. РЈРґР°Р»СЏРµРј РёР· Р»РѕРєР°Р»СЊРЅРѕРіРѕ СЃС‚РѕСЂР°
      const dictionaries = get().dictionaries;
      const updatedDicts = dictionaries.filter(d => d.id !== dictId);
      set({ dictionaries: updatedDicts });
      if (typeof window !== 'undefined') {
        localStorage.setItem('nlk_demo_dictionaries', JSON.stringify(updatedDicts));
      }
      
    } catch (error) {
      console.error('Error deleting dictionary:', error);
    }
  },
  
  deleteWord: async (dictId, wordId) => {
    const user = useAuthStore.getState().user;
    
    // Demo mode
    if (!user || user.uid.startsWith('demo_')) {
      const demoDicts = JSON.parse(localStorage.getItem('nlk_demo_dictionaries') || '[]');
      const dict = demoDicts.find((d: any) => d.id === dictId);
      if (dict) {
        dict.words = dict.words.filter((w: any) => w.id !== wordId);
        
        // Р•СЃР»Рё СЃР»РѕРІР°СЂСЊ РїСѓСЃС‚ - СѓРґР°Р»РёС‚СЊ
        if (dict.words.length === 0) {
          const filtered = demoDicts.filter((d: any) => d.id !== dictId);
          localStorage.setItem('nlk_demo_dictionaries', JSON.stringify(filtered));
        } else {
          localStorage.setItem('nlk_demo_dictionaries', JSON.stringify(demoDicts));
        }
      }
      await get().loadDictionaries();
      return;
    }
    
    // Real Firebase user
    try {
      // 1. РЎРёРЅС…СЂРѕРЅРёР·РёСЂСѓРµРј СЃР»РѕРІР°СЂСЊ РїРµСЂРµРґ СѓРґР°Р»РµРЅРёРµРј
      await sync.syncDictionary(user.uid, dictId);

      // 2. РЈРґР°Р»СЏРµРј СЃР»РѕРІРѕ РёР· Firebase
      await db.deleteWordFromDictionary(user.uid, dictId, wordId);

      // 3. РћР±РЅРѕРІР»СЏРµРј Р»РѕРєР°Р»СЊРЅС‹Р№ СЃС‚РѕСЂ
      const dictionaries = get().dictionaries;
      const updatedDicts = dictionaries.map(d => {
        if (d.id === dictId) {
          return { ...d, words: d.words.filter(w => w.id !== wordId), updatedAt: Date.now() };
        }
        return d;
      });
      
      set({ dictionaries: updatedDicts });
      if (typeof window !== 'undefined') {
        localStorage.setItem('nlk_demo_dictionaries', JSON.stringify(updatedDicts));
      }
      
    } catch (error) {
      console.error('Error deleting word:', error);
      // Fallback: СѓРґР°Р»СЏРµРј Р»РѕРєР°Р»СЊРЅРѕ
      const dictionaries = get().dictionaries;
      const updatedDicts = dictionaries.map(d => {
        if (d.id === dictId) {
          return { ...d, words: d.words.filter(w => w.id !== wordId), updatedAt: Date.now() };
        }
        return d;
      });
      set({ dictionaries: updatedDicts });
      if (typeof window !== 'undefined') {
        localStorage.setItem('nlk_demo_dictionaries', JSON.stringify(updatedDicts));
      }
    }
  },
  
  setCurrentDict: (index) => {
    set({ currentDictIndex: index });
  },
}));

// ============ EDITOR STORE ============

interface EditorStoreState extends EditorState {
  // Actions
  setCurrentWord: (word: string) => void;
  setCellVariants: (variants: Record<string, string[]>) => void;
  setMergedCells: (merges: EditorState['mergedCells']) => void;
  setPlusCells: (cells: number[]) => void;
  loadWord: (word: DictionaryWord) => void;
  clearEditor: () => void;
  saveWord: (dictId: string, editingWordId?: string | null) => Promise<{ success: boolean; error?: string }>;
}

export const useEditorStore = create<EditorStoreState>((set, get) => ({
  currentWord: '',
  cellVariants: {},
  mergedCells: [],
  plusCells: [],
  editingWordId: null,
  
  setCurrentWord: (word) => set({ currentWord: word }),
  setCellVariants: (variants) => set({ cellVariants: variants }),
  setMergedCells: (merges) => set({ mergedCells: merges }),
  setPlusCells: (cells) => set({ plusCells: cells }),
  
  loadWord: (word) => {
    set({
      currentWord: word.word,
      cellVariants: word.variants || {},
      mergedCells: word.merges || [],
      plusCells: word.plusCells || [],
      editingWordId: word.id,
    });
  },
  
  clearEditor: () => {
    set({
      currentWord: '',
      cellVariants: {},
      mergedCells: [],
      plusCells: [],
      editingWordId: null,
    });
  },
  
  saveWord: async (dictId, editingWordId) => {
    const user = useAuthStore.getState().user;
    const { currentWord, cellVariants, mergedCells, plusCells } = get();
    
    if (!currentWord) {
      return { success: false, error: 'Р’РІРµРґРёС‚Рµ СЃР»РѕРІРѕ' };
    }
    
    const isEditing = !!editingWordId;
    
    // РџСЂРѕРІРµСЂСЏРµРј, СЌС‚Рѕ Р±Р°Р·РѕРІС‹Р№ СЃР»РѕРІР°СЂСЊ (РЅР°С‡РёРЅР°РµС‚СЃСЏ СЃ default_)
    const isDefaultDict = dictId.startsWith('default_');
    
    // Check if demo user (uid starts with demo_)
    const isDemoUser = user?.uid?.startsWith('demo_') || !user;
    
    try {
      if (isDefaultDict) {
        // Р РµРґР°РєС‚РёСЂРѕРІР°РЅРёРµ Р±Р°Р·РѕРІС‹С… СЃР»РѕРІР°СЂРµР№ (СЃРѕС…СЂР°РЅСЏРµРј РІ localStorage)
        const defaultDicts = JSON.parse(localStorage.getItem('nlk_default_dictionaries') || '[]');
        let dictIndex = defaultDicts.findIndex((d: any) => d.id === dictId);
        
        if (dictIndex < 0) {
          return { success: false, error: 'РЎР»РѕРІР°СЂСЊ РЅРµ РЅР°Р№РґРµРЅ' };
        }
        
        // Р“Р°СЂР°РЅС‚РёСЂСѓРµРј РЅР°Р»РёС‡РёРµ РїРѕР»СЏ words
        if (!defaultDicts[dictIndex].words) {
          defaultDicts[dictIndex].words = [];
        }
        
        if (isEditing) {
          const wordIndex = defaultDicts[dictIndex].words.findIndex((w: any) => w.id === editingWordId);
          if (wordIndex >= 0) {
            defaultDicts[dictIndex].words[wordIndex] = {
              ...defaultDicts[dictIndex].words[wordIndex],
              word: currentWord,
              variants: cellVariants,
              merges: mergedCells,
              plusCells: plusCells,
            };
          }
        } else {
          const wordId = 'word_' + Date.now();
          const wordData = {
            id: wordId,
            word: currentWord,
            variants: cellVariants,
            merges: mergedCells,
            plusCells: plusCells,
            gamesHistory: [],
            wordErrors: {},
          };
          defaultDicts[dictIndex].words.push(wordData);
        }
        
        // РћР±РЅРѕРІР»СЏРµРј updatedAt СЃР»РѕРІР°СЂСЏ, С‡С‚РѕР±С‹ СЃРёСЃС‚РµРјР° СЃС‡РёС‚Р°Р»Р° РµРіРѕ РЅРѕРІРµРµ СЃРµСЂРІРµСЂРЅРѕРіРѕ
        defaultDicts[dictIndex].updatedAt = Date.now();
        
        localStorage.setItem('nlk_default_dictionaries', JSON.stringify(defaultDicts));
        
        // Р§РёС‚Р°РµРј С‚РµРєСѓС‰РёР№ СЃС‚РѕСЂ Рё РѕР±РЅРѕРІР»СЏРµРј С‚РѕР»СЊРєРѕ РёР·РјРµРЅРµРЅРЅС‹Р№ СЃР»РѕРІР°СЂСЊ
        const currentDefaults = useDictionariesStore.getState().defaultDictionaries;
        const updatedDefaults = currentDefaults.map(d => 
          d.id === dictId ? defaultDicts[dictIndex] : d
        );
        useDictionariesStore.setState({ 
          defaultDictionaries: updatedDefaults 
        });
        
        get().clearEditor();
        return { success: true };
      }
      
      if (isDemoUser) {
        const demoDicts = JSON.parse(localStorage.getItem('nlk_demo_dictionaries') || '[]');
        let dict = demoDicts.find((d: any) => d.id === dictId);
        
        if (!dict && !isEditing) {
          dict = {
            id: dictId,
            name: 'РњРѕР№ СЃР»РѕРІР°СЂСЊ',
            userId: 'demo',
            words: [],
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };
          demoDicts.push(dict);
        }
        
        if (isEditing && dict) {
          const wordIndex = dict.words.findIndex((w: any) => w.id === editingWordId);
          if (wordIndex >= 0) {
            dict.words[wordIndex] = {
              ...dict.words[wordIndex],
              word: currentWord,
              variants: cellVariants,
              merges: mergedCells,
              plusCells: plusCells,
            };
          }
        } else if (dict) {
          const wordId = 'word_' + Date.now();
          const wordData: DictionaryWord = {
            id: wordId,
            word: currentWord,
            variants: cellVariants,
            merges: mergedCells,
            plusCells: plusCells,
          };
          dict.words.push(wordData);
        }
        
        localStorage.setItem('nlk_demo_dictionaries', JSON.stringify(demoDicts));
        await useDictionariesStore.getState().loadDictionaries();
        get().clearEditor();
        return { success: true };
      }
      
      // Real Firebase user
      if (!user) {
        return { success: false, error: 'РћС€РёР±РєР° СЃРѕС…СЂР°РЅРµРЅРёСЏ' };
      }
      
      // 0. РЎРёРЅС…СЂРѕРЅРёР·РёСЂСѓРµРј СЃР»РѕРІР°СЂСЊ РїРµСЂРµРґ РґРѕР±Р°РІР»РµРЅРёРµРј/РѕР±РЅРѕРІР»РµРЅРёРµРј СЃР»РѕРІР°
      try {
        await sync.syncDictionary(user.uid, dictId);
      } catch (syncError) {
        console.error('syncDictionary failed in saveWord, proceeding with local save:', syncError);
      }
      
      // РџСЂРѕРІРµСЂСЏРµРј Р»РёРјРёС‚ СЃР»РѕРІ (С‚РѕР»СЊРєРѕ РґР»СЏ РЅРѕРІС‹С… СЃР»РѕРІ)
      if (!isEditing) {
        const dict = useDictionariesStore.getState().dictionaries.find(d => d.id === dictId);
        const wordCount = dict?.words?.length || 0;
        
        if (wordCount >= MAX_WORDS_PER_DICTIONARY) {
          return { success: false, error: `РњР°РєСЃРёРјСѓРј ${MAX_WORDS_PER_DICTIONARY} СЃР»РѕРІ` };
        }
      }
      
      const wordData: DictionaryWord = {
        id: editingWordId || '',
        word: currentWord,
        variants: cellVariants,
        merges: mergedCells,
        plusCells: plusCells,
        gamesHistory: [],
        wordErrors: {},
      };
      
      let result;
      if (isEditing) {
        result = await db.updateWordInDictionary(user.uid, dictId, editingWordId, wordData);
      } else {
        result = await db.addWordToDictionary(user.uid, dictId, wordData);
      }
      
      if (result.success) {
        await useDictionariesStore.getState().loadDictionaries();
        get().clearEditor();
        return { success: true };
      }
      
      return { success: false, error: result.error };
    } catch (e) {
      console.error('saveWord: failed to save word', e);
      return { success: false, error: 'РћС€РёР±РєР° СЃРѕС…СЂР°РЅРµРЅРёСЏ' };
    }
  },
}));

// ============ EXERCISE STORE ============

interface ExerciseStoreState extends ExerciseState {
  // Actions
  startExercise: (dictId: string) => void;
  nextWord: () => void;
  answerSegment: (answer: string, correct: boolean) => void;
  finishExercise: () => Promise<void>;
}

export const useExerciseStore = create<ExerciseStoreState>((set, get) => ({
  currentDictIndex: -1,
  exerciseWords: [],
  exerciseCurrentIndex: 0,
  currentSegmentIndex: 0,
  answeredSegments: [],
  practiceMode: false,
  practiceModeWords: [],
  
  startExercise: (dictId) => {
    const { dictionaries, defaultDictionaries } = useDictionariesStore.getState();
    
    // РС‰РµРј СЃР»РѕРІР°СЂСЊ
    let dict = dictionaries.find(d => d.id === dictId);
    let allDicts = [...defaultDictionaries, ...dictionaries];
    
    if (!dict) {
      dict = defaultDictionaries.find(d => d.id === dictId);
    }
    
    if (!dict) return;
    
    const dictIndex = allDicts.findIndex(d => d.id === dictId);
    const words = [...(dict.words || [])];
    
    // Р¤РёР»СЊС‚СЂСѓРµРј РЅРµРёР·СѓС‡РµРЅРЅС‹Рµ СЃР»РѕРІР°
    const unlearnedWords = words.filter(w => {
      const correctCount = w.gamesHistory?.filter(g => g.errors === 0).length || 0;
      return correctCount < 3;
    });
    
    set({
      currentDictIndex: dictIndex >= 0 ? dictIndex : -1,
      exerciseWords: unlearnedWords.length > 0 ? unlearnedWords : words,
      exerciseCurrentIndex: 0,
      currentSegmentIndex: 0,
      answeredSegments: new Array(unlearnedWords.length > 0 ? unlearnedWords[0]?.word.length || 0 : 0).fill(false),
      practiceMode: false,
      practiceModeWords: [],
    });
  },
  
  nextWord: () => {
    const { exerciseCurrentIndex, exerciseWords } = get();
    const nextIndex = exerciseCurrentIndex + 1;
    
    if (nextIndex >= exerciseWords.length) {
      // Р’СЃРµ СЃР»РѕРІР° РїСЂРѕР№РґРµРЅС‹
      set({ exerciseCurrentIndex: exerciseWords.length });
      return;
    }
    
    const nextWord = exerciseWords[nextIndex];
    set({
      exerciseCurrentIndex: nextIndex,
      currentSegmentIndex: 0,
      answeredSegments: new Array(nextWord?.word.length || 0).fill(false),
    });
  },
  
  answerSegment: (answer, correct) => {
    const { answeredSegments, currentSegmentIndex } = get();
    const newAnswered = [...answeredSegments];
    newAnswered[currentSegmentIndex] = true;
    
    set({ answeredSegments: newAnswered });
  },
  
  finishExercise: async () => {
    const { user } = useAuthStore.getState();
    const { currentDictIndex, exerciseWords, exerciseCurrentIndex } = get();
    
    if (!user || currentDictIndex < 0) return;
    
    const dictionaries = [...useDictionariesStore.getState().defaultDictionaries, ...useDictionariesStore.getState().dictionaries];
    const dict = dictionaries[currentDictIndex];
    
    if (!dict) return;
    
    // РџРѕРґСЃС‡РёС‚С‹РІР°РµРј СЂРµР·СѓР»СЊС‚Р°С‚С‹
    // (СѓРїСЂРѕС‰РµРЅРЅР°СЏ РІРµСЂСЃРёСЏ - РІ СЂРµР°Р»СЊРЅРѕРј РїСЂРёР»РѕР¶РµРЅРёРё РЅСѓР¶РЅРѕ СЃС‡РёС‚Р°С‚СЊ РѕС€РёР±РєРё РїРѕ СЃРµРіРјРµРЅС‚Р°Рј)
    const gameResult = {
      errors: 0, // TODO: РїРѕРґСЃС‡РёС‚Р°С‚СЊ РѕС€РёР±РєРё
      totalSegments: exerciseWords.reduce((sum, w) => sum + w.word.length, 0),
      correctSegments: 0,
    };
    
    await db.addGameResult(user.uid, dict.id, gameResult);
    
    set({
      currentDictIndex: -1,
      exerciseWords: [],
      exerciseCurrentIndex: 0,
    });
  },
}));

// ============ STATS STORE ============

interface StatsState {
  stats: UserStats | null;
  isLoading: boolean;
  
  loadStats: () => Promise<void>;
}

export const useStatsStore = create<StatsState>((set) => ({
  stats: null,
  isLoading: false,
  
  loadStats: async () => {
    const { user } = useAuthStore.getState();
    if (!user) return;
    
    set({ isLoading: true });
    
    try {
      const stats = await db.getUserStats(user.uid);
      set({ stats, isLoading: false });
    } catch (error) {
      console.error('Error loading stats:', error);
      set({ isLoading: false });
    }
  },
}));