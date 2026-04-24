// ТИПЫ ДАННЫХ

export interface User {
  uid: string;
  username: string;
  email: string;
  settings: UserSettings;
}

export interface UserSettings {
  sound: boolean;
  vibration: boolean;
}

export interface Dictionary {
  id: string;
  name: string;
  userId: string;
  isDefault?: boolean;
  words: DictionaryWord[];
  plusDictionary?: {
    words: DictionaryWord[];
    name: string;
    gamesHistory?: number[];
    wordErrors?: Record<string, number>;
  };
  wordErrors?: Record<string, number>;
  gamesHistory?: number[];
  createdAt: number;
  updatedAt: number;
}

export interface DictionaryWord {
  id: string;
  word: string;
  variants: Record<string, string[]>;
  merges: Merge[];
  plusCells?: number[];
  gamesHistory?: GameResult[];
  wordErrors?: Record<string, number>;
}

export interface Merge {
  start: number;
  end: number;
}

export interface GameResult {
  date: number;
  errors: number;
  totalSegments: number;
  correctSegments: number;
}

export interface UserStats {
  totalGames: number;
  totalErrors: number;
  games: GameResult[];
  wordErrors: Record<string, number>;
}

export interface SyncPendingChanges {
  dictionaries: Record<string, DictionaryChanges>;
}

export interface DictionaryChanges {
  added: string[];
  updated: string[];
  deleted: string[];
}

// ЛОКАЛЬНЫЕ ТИПЫ (ДЛЯ РЕДАКТОРА)

export interface CellData {
  index: number;
  char: string;
  variants: string[];
  isMerged: boolean;
  mergeStart?: number;
  mergeEnd?: number;
}

export interface EditorState {
  currentWord: string;
  cellVariants: Record<string, string[]>;
  mergedCells: Merge[];
  plusCells: number[];
  editingWordId: string | null;
}

export interface ExerciseState {
  currentDictIndex: number;
  exerciseWords: DictionaryWord[];
  exerciseCurrentIndex: number;
  currentSegmentIndex: number;
  answeredSegments: boolean[];
  practiceMode: boolean;
  practiceModeWords: string[];
}

// ЛИМИТЫ

export const MAX_USER_DICTIONARIES = 5;
export const MAX_WORDS_PER_DICTIONARY = 500;

// Firebase пути

export const FIREBASE_PATHS = {
  users: 'users',
  defaultDictionaries: 'defaultDictionaries',
};