// ============ LOCAL STORAGE ============

const KEYS = {
  demoDictionaries: 'nlk_demo_dictionaries',
  defaultDictionaries: 'nlk_default_dictionaries',
  defaultDictionariesMeta: 'nlk_default_dictionaries_meta',
  gameSpeed: 'nlk_game_speed',
  currentMode: 'nlk_current_mode',
  currentPlusDictId: 'nlk_current_plus_dict_id',
  practiceMode: 'nlk_practice_mode',
  practiceState: (dictId: string) => `nlk_practice_state_${dictId}`,
  gameState: (dictId: string, isPlus: boolean) => `nlk_game_state_${dictId}${isPlus ? '_plus' : ''}`,
  progress: (dictId: string) => `nlk_progress_${dictId}`,
  stats: (dictId: string) => `nlk_stats_${dictId}`,
  plusStats: (dictId: string) => `nlk_plus_stats_${dictId}`,
  localStats: (userId: string) => `nlk_local_stats_${userId}`,
};

// Demo dictionaries
export function getDemoDictionaries(): any[] {
  return JSON.parse(localStorage.getItem(KEYS.demoDictionaries) || '[]');
}

export function setDemoDictionaries(dicts: any[]): void {
  localStorage.setItem(KEYS.demoDictionaries, JSON.stringify(dicts));
}

// Default dictionaries
export function getDefaultDictionaries(): any[] | null {
  const cached = localStorage.getItem(KEYS.defaultDictionaries);
  return cached ? JSON.parse(cached) : null;
}

export function setDefaultDictionaries(dicts: any[]): void {
  localStorage.setItem(KEYS.defaultDictionaries, JSON.stringify(dicts));
}

export function getDefaultDictionariesMeta(): any | null {
  const cached = localStorage.getItem(KEYS.defaultDictionariesMeta);
  return cached ? JSON.parse(cached) : null;
}

export function setDefaultDictionariesMeta(meta: any): void {
  localStorage.setItem(KEYS.defaultDictionariesMeta, JSON.stringify(meta));
}

// Game speed
export function getGameSpeed(): number {
  const saved = localStorage.getItem(KEYS.gameSpeed);
  return saved ? parseFloat(saved) : 0.8;
}

export function setGameSpeed(speed: number): void {
  localStorage.setItem(KEYS.gameSpeed, speed.toString());
}

// Current mode
export function getCurrentMode(): string | null {
  return localStorage.getItem(KEYS.currentMode);
}

export function setCurrentMode(mode: string): void {
  localStorage.setItem(KEYS.currentMode, mode);
}

export function clearCurrentMode(): void {
  localStorage.removeItem(KEYS.currentMode);
}

// Current plus dict
export function getCurrentPlusDictId(): string | null {
  return localStorage.getItem(KEYS.currentPlusDictId);
}

export function setCurrentPlusDictId(dictId: string): void {
  localStorage.setItem(KEYS.currentPlusDictId, dictId);
}

// Practice mode
export function isPracticeMode(): boolean {
  return localStorage.getItem(KEYS.practiceMode) === 'true';
}

export function setPracticeMode(enabled: boolean): void {
  localStorage.setItem(KEYS.practiceMode, enabled ? 'true' : 'false');
}

export function clearPracticeMode(): void {
  localStorage.removeItem(KEYS.practiceMode);
}

// Game state
export function getGameState(dictId: string, isPlus: boolean): any | null {
  const key = KEYS.gameState(dictId, isPlus);
  const data = localStorage.getItem(key);
  if (!data) return null;
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

export function setGameState(dictId: string, isPlus: boolean, state: any): void {
  const key = KEYS.gameState(dictId, isPlus);
  localStorage.setItem(key, JSON.stringify(state));
}

export function clearGameState(dictId: string, isPlus: boolean): void {
  localStorage.removeItem(KEYS.gameState(dictId, isPlus));
}

// Progress
export function getProgress(dictId: string): { errors: number; answers: Record<number, number> } {
  const key = KEYS.progress(dictId);
  const data = localStorage.getItem(key);
  return data ? JSON.parse(data) : { errors: 0, answers: {} };
}

export function setProgress(dictId: string, progress: { errors: number; answers: Record<number, number> }): void {
  const key = KEYS.progress(dictId);
  localStorage.setItem(key, JSON.stringify(progress));
}

export function clearProgress(dictId: string): void {
  localStorage.removeItem(KEYS.progress(dictId));
}

// Stats
export interface LocalStats {
  totalGames: number;
  totalErrors: number;
  games: any[];
  wordErrors: Record<string, number>;
}

export function getStats(dictId: string): LocalStats {
  const key = KEYS.stats(dictId);
  const data = localStorage.getItem(key);
  return data ? JSON.parse(data) : { totalGames: 0, totalErrors: 0, games: [], wordErrors: {} };
}

export function setStats(dictId: string, stats: LocalStats): void {
  const key = KEYS.stats(dictId);
  localStorage.setItem(key, JSON.stringify(stats));
}

export function getPlusStats(dictId: string): LocalStats {
  const key = KEYS.plusStats(dictId);
  const data = localStorage.getItem(key);
  return data ? JSON.parse(data) : { totalGames: 0, totalErrors: 0, games: [], wordErrors: {} };
}

export function setPlusStats(dictId: string, stats: LocalStats): void {
  const key = KEYS.plusStats(dictId);
  localStorage.setItem(key, JSON.stringify(stats));
}

export function getLocalStats(userId: string): LocalStats {
  const key = KEYS.localStats(userId);
  const data = localStorage.getItem(key);
  return data ? JSON.parse(data) : { totalGames: 0, totalErrors: 0, games: [], wordErrors: {} };
}

export function setLocalStats(userId: string, stats: LocalStats): void {
  const key = KEYS.localStats(userId);
  localStorage.setItem(key, JSON.stringify(stats));
}

// Practice state (24h expiry)
const PRACTICE_STATE_EXPIRY_MS = 24 * 60 * 60 * 1000;

export function savePracticeState(dictId: string, state: any): void {
  const key = KEYS.practiceState(dictId);
  localStorage.setItem(key, JSON.stringify({ ...state, savedAt: Date.now() }));
}

export function loadPracticeState(dictId: string): any | null {
  const key = KEYS.practiceState(dictId);
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
  localStorage.removeItem(KEYS.practiceState(dictId));
}