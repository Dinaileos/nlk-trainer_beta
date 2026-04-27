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
    set({ isLoading: true });
    
    const isDemoUser = user?.uid?.startsWith('demo_') || !user;
    
    // РџРѕРєР°Р·С‹РІР°РµРј РєРµС€ Р±Р°Р·РѕРІС‹С… СЃР»РѕРІР°СЂРµР№ СЃСЂР°Р·Сѓ
    const cachedDefaults = localStorage.getItem('nlk_default_dictionaries');
    if (cachedDefaults) {
      try {
        set({ defaultDictionaries: JSON.parse(cachedDefaults) });
      } catch (e) {
        console.error('loadDictionaries: failed to parse cached defaults', e);
      }
    }
    
    if (isDemoUser) {
      try {
        const demoDicts = JSON.parse(localStorage.getItem('nlk_demo_dictionaries') || '[]');
        set({ dictionaries: demoDicts, isLoading: false });
      } catch (e) {
        console.error('loadDictionaries: failed to parse demo dictionaries', e);
      }
      // РџСЂРѕРІРµСЂСЏРµРј РѕР±РЅРѕРІР»РµРЅРёСЏ Р±Р°Р·РѕРІС‹С… СЃР»РѕРІР°СЂРµР№ РІ С„РѕРЅРµ
      try {
        const defaultDicts = await db.getDefaultDictionaries();
        set({ defaultDictionaries: defaultDicts });
      } catch (e) {
        console.error('loadDictionaries: failed to fetch default dictionaries', e);
      }
      return;
    }
    
    try {
      const localDicts = JSON.parse(localStorage.getItem('nlk_demo_dictionaries') || '[]');
      await sync.syncPendingChanges(user.uid);
      const mergedDicts = await sync.loadAndMergeDictionaries(user.uid, localDicts);
      localStorage.setItem('nlk_demo_dictionaries', JSON.stringify(mergedDicts));
      set({ dictionaries: mergedDicts });
    } catch {
      const localDicts = JSON.parse(localStorage.getItem('nlk_demo_dictionaries') || '[]');
      set({ dictionaries: localDicts });
    }
    
    // РџСЂРѕРІРµСЂСЏРµРј РѕР±РЅРѕРІР»РµРЅРёСЏ Р±Р°Р·РѕРІС‹С… СЃР»РѕРІР°СЂРµР№ РІ С„РѕРЅРµ
    try {
      const defaultDicts = await db.getDefaultDictionaries();
      set({ defaultDictionaries: defaultDicts });
    } catch {}
    
    set({ isLoading: false });
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
    
    // Demo mode
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
    
    await db.updateDictionary(user.uid, dictId, updates);
    await get().loadDictionaries();
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
    
    await db.deleteDictionary(user.uid, dictId);
    await get().loadDictionaries();
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
    
    await db.deleteWordFromDictionary(user.uid, dictId, wordId);
    await get().loadDictionaries();
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
        const dictIndex = defaultDicts.findIndex((d: any) => d.id === dictId);
        
        if (dictIndex < 0) {
          return { success: false, error: 'РЎР»РѕРІР°СЂСЊ РЅРµ РЅР°Р№РґРµРЅ' };
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
        
        localStorage.setItem('nlk_default_dictionaries', JSON.stringify(defaultDicts));
        await useDictionariesStore.getState().loadDictionaries();
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