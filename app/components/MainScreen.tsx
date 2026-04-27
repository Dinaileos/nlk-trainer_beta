'use client';

import { useState, useEffect } from 'react';
import { useAuthStore, useDictionariesStore } from '@/lib/store';
import * as storage from '@/lib/storage';

interface Dictionary {
  id: string;
  name: string;
  words: any[];
  isDefault?: boolean;
  plusDictionary?: {
    name: string;
    words: any[];
    wordErrors?: Record<string, number>;
    gamesHistory?: any[];
  };
  wordErrors?: Record<string, number>;
}

interface MainScreenProps {
  onNavigate: (screen: 'main' | 'editor' | 'exercise' | 'stats' | 'editorPlus' | 'quickMode', dictIndex?: number) => void;
  showToast: (message: string, isError?: boolean) => void;
}

export default function MainScreen({ onNavigate, showToast }: MainScreenProps) {
  const { user } = useAuthStore();
  const { dictionaries, defaultDictionaries, loadDictionaries, setCurrentDict, createDictionary } = useDictionariesStore();
  const isAdmin = useAuthStore.getState().isAdmin();
  const [flippedCards, setFlippedCards] = useState<Set<number>>(new Set());
  const [newDictModalOpen, setNewDictModalOpen] = useState(false);
  const [newDictName, setNewDictName] = useState('');
  const [newDefaultDictModalOpen, setNewDefaultDictModalOpen] = useState(false);
  const [newDefaultDictName, setNewDefaultDictName] = useState('');

  useEffect(() => {
    loadDictionaries();
  }, [loadDictionaries]);

  const handleCreateDict = async () => {
    const name = newDictName.trim();
    if (!name) {
      showToast('Р’РІРµРґРёС‚Рµ РЅР°Р·РІР°РЅРёРµ СЃР»РѕРІР°СЂСЏ', true);
      return;
    }
    
    const nameLower = name.toLowerCase();
    const exists = dictionaries.some(d => d.name.toLowerCase() === nameLower);
    if (exists) {
      showToast('РЎР»РѕРІР°СЂСЊ СЃ С‚Р°РєРёРј РЅР°Р·РІР°РЅРёРµРј СѓР¶Рµ СЃСѓС‰РµСЃС‚РІСѓРµС‚', true);
      return;
    }
    
    const userId = user?.uid || 'demo';
    const newDictId = await createDictionary(userId, name);
    if (newDictId) {
      setNewDictModalOpen(false);
      setNewDictName('');
      const newIndex = dictionaries.length;
      setCurrentDict(newIndex);
      onNavigate('editor', newIndex);
    } else {
      showToast('РћС€РёР±РєР° СЃРѕР·РґР°РЅРёСЏ', true);
    }
  };

  const handleCreateDefaultDict = () => {
    setNewDefaultDictModalOpen(true);
  };



  const handleCreateDefaultDictSubmit = () => {
    const name = newDefaultDictName.trim();
    if (!name) {
      showToast('Р’РІРµРґРёС‚Рµ РЅР°Р·РІР°РЅРёРµ СЃР»РѕРІР°СЂСЏ', true);
      return;
    }
  
    const defaultDicts = JSON.parse(localStorage.getItem('nlk_default_dictionaries') || '[]');
    
    // Check for duplicates
    const nameLower = name.toLowerCase();
    const exists = defaultDicts.some((d: any) => d.name.toLowerCase() === nameLower);
    if (exists) {
      showToast('Р‘Р°Р·РѕРІС‹Р№ СЃР»РѕРІР°СЂСЊ СЃ С‚Р°РєРёРј РЅР°Р·РІР°РЅРёРµРј СѓР¶Рµ СЃСѓС‰РµСЃС‚РІСѓРµС‚', true);
      return;
    }
  
    const newDict = {
      id: 'default_' + Date.now(),
      name: name,
      userId: 'system',
      isDefault: true,
      words: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  
    defaultDicts.push(newDict);
    localStorage.setItem('nlk_default_dictionaries', JSON.stringify(defaultDicts));
    
    // Properly update store
    loadDictionaries();
    
    setNewDefaultDictModalOpen(false);
    setNewDefaultDictName('');
    showToast('Р‘Р°Р·РѕРІС‹Р№ СЃР»РѕРІР°СЂСЊ СЃРѕР·РґР°РЅ');
  };

  const handleDefaultDictClick = (index: number) => {
    setCurrentDict(-1 - index); // Negative for default dicts
    onNavigate('exercise', -1 - index);
  };

  const handleUserDictClick = (index: number, event: React.MouseEvent) => {
    if ((event.target as HTMLElement).closest('.dict-card-btn') || 
        (event.target as HTMLElement).closest('.plus-btn') ||
        (event.target as HTMLElement).closest('.back-to-main-btn')) {
      return;
    }
    storage.setCurrentMode('main');
    setCurrentDict(index);
    onNavigate('exercise', index);
  };

  const handlePlusCardClick = (index: number, event: React.MouseEvent) => {
    event.stopPropagation();
    const flipBtn = (event.target as HTMLElement).closest('.flip-btn');
    if (!flipBtn) return;
    
    const dict = dictionaries[index];
    
    if (dict?.isDefault && !useAuthStore.getState().isAdmin()) {
      showToast('Р‘Р°Р·РѕРІС‹Рµ СЃР»РѕРІР°СЂРё РјРѕР¶РµС‚ СЂРµРґР°РєС‚РёСЂРѕРІР°С‚СЊ С‚РѕР»СЊРєРѕ Р°РґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂ', true);
      return;
    }
    
    if (!dict.plusDictionary) {
      useDictionariesStore.getState().updateDictionary(dict.id, {
        plusDictionary: {
          name: dict.name + '+',
          words: [],
          wordErrors: {},
          gamesHistory: []
        }
      });
      showToast('РЎР»РѕРІР°СЂСЊ+ СЃРѕР·РґР°РЅ');
    }
    
    setFlippedCards(prev => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  };

  const createNewDictionary = () => {
    if (!user) {
      showToast('Р’РѕР№РґРёС‚Рµ РІ Р°РєРєР°СѓРЅС‚ РґР»СЏ СЃРѕР·РґР°РЅРёСЏ СЃР»РѕРІР°СЂРµР№', true);
      return;
    }
    setNewDictModalOpen(true);
  };

  const handleCardFlip = (index: number, event: React.MouseEvent) => {
    event.stopPropagation();
    const flipBtn = (event.target as HTMLElement).closest('.flip-btn');
    if (!flipBtn) return;
    
    setFlippedCards(prev => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  };

  const handleEditDictionary = (index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const dict = dictionaries[index];
    
    if (dict?.isDefault && !useAuthStore.getState().isAdmin()) {
      showToast('Р‘Р°Р·РѕРІС‹Рµ СЃР»РѕРІР°СЂРё РјРѕР¶РµС‚ СЂРµРґР°РєС‚РёСЂРѕРІР°С‚СЊ С‚РѕР»СЊРєРѕ Р°РґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂ', true);
      return;
    }
    
    setCurrentDict(index);
    onNavigate('editor', index);
  };

  const handleDeleteDictionary = (index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const dict = dictionaries[index];
    
    if (dict?.isDefault) {
      if (!useAuthStore.getState().isAdmin()) {
        showToast('Р‘Р°Р·РѕРІС‹Рµ СЃР»РѕРІР°СЂРё РјРѕР¶РµС‚ СЂРµРґР°РєС‚РёСЂРѕРІР°С‚СЊ С‚РѕР»СЊРєРѕ Р°РґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂ', true);
        return;
      }
      if (!confirm('Р’С‹ СѓРІРµСЂРµРЅС‹, С‡С‚Рѕ С…РѕС‚РёС‚Рµ СѓРґР°Р»РёС‚СЊ Р±Р°Р·РѕРІС‹Р№ СЃР»РѕРІР°СЂСЊ? Р­С‚Рѕ РґРµР№СЃС‚РІРёРµ РЅРµР»СЊР·СЏ РѕС‚РјРµРЅРёС‚СЊ.')) {
        return;
      }
      // Delete from localStorage
      const defaultDicts = JSON.parse(localStorage.getItem('nlk_default_dictionaries') || '[]');
      const filtered = defaultDicts.filter((d: any) => d.id !== dict.id);
      localStorage.setItem('nlk_default_dictionaries', JSON.stringify(filtered));
      loadDictionaries();
      showToast('Р‘Р°Р·РѕРІС‹Р№ СЃР»РѕРІР°СЂСЊ СѓРґР°Р»С‘РЅ');
    } else if (confirm(`РЈРґР°Р»РёС‚СЊ СЃР»РѕРІР°СЂСЊ "${dictionaries[index].name}"?`)) {
      useDictionariesStore.getState().deleteDictionary(dictionaries[index].id);
      showToast('РЎР»РѕРІР°СЂСЊ СѓРґР°Р»С‘РЅ');
    }
  };

  const handleEditDefaultDictionary = (dict: Dictionary, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!useAuthStore.getState().isAdmin()) {
      showToast('Р‘Р°Р·РѕРІС‹Рµ СЃР»РѕРІР°СЂРё РјРѕР¶РµС‚ СЂРµРґР°РєС‚РёСЂРѕРІР°С‚СЊ С‚РѕР»СЊРєРѕ Р°РґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂ', true);
      return;
    }
    const idx = defaultDictionaries.findIndex(d => d.id === dict.id);
    setCurrentDict(-1 - idx);
    onNavigate('editor', -1 - idx);
  };

  const handleDeleteDefaultDictionary = (dict: Dictionary, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!useAuthStore.getState().isAdmin()) {
      showToast('Р‘Р°Р·РѕРІС‹Рµ СЃР»РѕРІР°СЂРё РјРѕР¶РµС‚ СЂРµРґР°РєС‚РёСЂРѕРІР°С‚СЊ С‚РѕР»СЊРєРѕ Р°РґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂ', true);
      return;
    }
    if (!confirm('Р’С‹ СѓРІРµСЂРµРЅС‹, С‡С‚Рѕ С…РѕС‚РёС‚Рµ СѓРґР°Р»РёС‚СЊ Р±Р°Р·РѕРІС‹Р№ СЃР»РѕРІР°СЂСЊ? Р­С‚Рѕ РґРµР№СЃС‚РІРёРµ РЅРµР»СЊР·СЏ РѕС‚РјРµРЅРёС‚СЊ.')) {
      return;
    }
    // Delete from localStorage
    const defaultDicts = JSON.parse(localStorage.getItem('nlk_default_dictionaries') || '[]');
    const filtered = defaultDicts.filter((d: any) => d.id !== dict.id);
    localStorage.setItem('nlk_default_dictionaries', JSON.stringify(filtered));
    loadDictionaries();
    showToast('Р‘Р°Р·РѕРІС‹Р№ СЃР»РѕРІР°СЂСЊ СѓРґР°Р»С‘РЅ');
  };

  return (
    <div className="screen active" id="mainScreen">
      <div className="dictionary-grid">
        {/* Default dictionaries */}
        {defaultDictionaries.map((dict, idx) => (
          <div 
            key={`default-${dict.id}`}
            className="dict-card default"
            style={{ position: 'relative' }}
            onClick={() => handleDefaultDictClick(idx)}
          >
            <span className="dict-card-label">Р‘Р°Р·РѕРІС‹Р№</span>
            <div className="dict-card-title">{dict.name}</div>
            <div className="dict-card-count">{dict.words.length} СЃР»РѕРІ</div>
            {isAdmin && (
              <div style={{ position: 'absolute', top: '8px', right: '8px', display: 'flex', gap: '4px' }}>
                <button className="dict-card-btn-small edit" onClick={(e) => handleEditDefaultDictionary(dict, e)} title="РР·РјРµРЅРёС‚СЊ" />
                <button className="dict-card-btn-small delete" onClick={(e) => handleDeleteDefaultDictionary(dict, e)} title="РЈРґР°Р»РёС‚СЊ" />
              </div>
            )}
          </div>
        ))}

        {/* User dictionaries */}
        {user && dictionaries.map((dict, idx) => {
          const wordErrorsCount = dict.wordErrors ? Object.values(dict.wordErrors).reduce((a, b) => a + b, 0) : 0;
          const hasErrors = wordErrorsCount > 0;
          const hasPlus = dict.plusDictionary?.words && dict.plusDictionary.words.length > 0;
          const isFlipped = flippedCards.has(idx);
          const localStats = storage.getStats(dict.id);
          let record = '-';
          if (localStats.games && localStats.games.length > 0) {
            const errors = localStats.games.map((g: any) => g.errors);
            record = Math.min(...errors) === 0 ? '0' : String(Math.min(...errors));
          }
           
          let recForNoPlus = record;
          
          if (hasPlus) {
            return (
              <div key={dict.id} className="dict-card-flip-wrapper" style={{ perspective: '1000px', width: '200px', height: '180px' }}>
                <div 
                  style={{
                    width: '100%', 
                    height: '100%', 
                    transition: 'transform 0.6s',
                    transformStyle: 'preserve-3d',
                    transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)'
                  }}
                >
                  <div 
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '200px',
                      height: '180px',
                      backfaceVisibility: 'hidden',
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border-gray)',
                      borderRadius: '8px',
                      padding: '16px',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer'
                    }}
                    onClick={() => { storage.setCurrentMode('main'); setCurrentDict(idx); onNavigate('exercise', idx); }}
                  >
                    <div className="dict-card-title">{dict.name}</div>
                    <div className="dict-card-count">{dict.words.length} СЃР»РѕРІ</div>
                    {recForNoPlus === '-' ? 'Р РµРєРѕСЂРґ: -' : recForNoPlus === '0' ? <span style={{ color: '#FFD700', fontWeight: 'bold' }}>РРґРµР°Р»СЊРЅРѕ</span> : `Р РµРєРѕСЂРґ: ${recForNoPlus}`}
                  </div>
                  <div 
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '200px',
                      height: '180px',
                      backfaceVisibility: 'hidden',
                      background: 'var(--bg-surface)',
                      border: '2px solid var(--border-gray)',
                      borderRadius: '8px',
                      padding: '16px',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                    onClick={() => { storage.setCurrentMode('plus'); setCurrentDict(idx); onNavigate('exercise', idx); }}
                  >
                    <div className="dict-card-title" style={{ color: '#f5a623' }}>{dict.name}+</div>
                    <div className="dict-card-count">{dict.plusDictionary?.words.length || 0} СЃР»РѕРІ</div>
                    {dict.plusDictionary?.gamesHistory && dict.plusDictionary.gamesHistory.length > 0 && (
                      (() => {
                        const errors = dict.plusDictionary!.gamesHistory.map((g: any) => g.errors || 0);
                        const minErrors = Math.min(...errors);
                        return <div className="dict-card-record">
                          {minErrors === 0 ? <span style={{ color: '#FFD700', fontWeight: 'bold' }}>РРґРµР°Р»СЊРЅРѕ</span> : `Р РµРєРѕСЂРґ: ${minErrors}`}
                        </div>;
                      })()
                    )}
                    <button 
                      className="flip-btn"
                      onClick={(e) => handleCardFlip(idx, e)}
                      title="РќР°Р·Р°Рґ"
                    >
                      в†ђ
                    </button>
                  </div>
                </div>
              </div>
            );
          }

          return (
            <div
              key={dict.id}
              className="dict-card saved"
              onClick={(e) => handleUserDictClick(idx, e)}
              style={{ position: 'relative' }}
            >
              <div className="dict-card-title">{dict.name}</div>
              <div className="dict-card-count">{dict.words.length} СЃР»РѕРІ</div>
              <div className="dict-card-record">
                {recForNoPlus === '-' ? 'Р РµРєРѕСЂРґ: -' : recForNoPlus === '0' ? <span style={{ color: '#FFD700', fontWeight: 'bold' }}>РРґРµР°Р»СЊРЅРѕ</span> : `Р РµРєРѕСЂРґ: ${recForNoPlus}`}
              </div>
              <div style={{ 
                position: 'absolute', 
                top: '8px', 
                right: '8px',
                display: 'flex', 
                gap: '4px' 
              }}>
                <button 
                  className="dict-card-btn-small edit" 
                  onClick={(e) => handleEditDictionary(idx, e)}
                  title="РР·РјРµРЅРёС‚СЊ"
                />
                <button 
                  className="dict-card-btn-small delete" 
                  onClick={(e) => handleDeleteDictionary(idx, e)}
                  title="РЈРґР°Р»РёС‚СЊ"
                />
              </div>
            </div>
          );
        })}

        {/* Add card */}
        {user && dictionaries.length < 5 ? (
          <div className="dict-card add-card" onClick={createNewDictionary}>
            <div className="add-icon"></div>
            <div className="add-text">Р”РѕР±Р°РІРёС‚СЊ СЃР»РѕРІР°СЂСЊ</div>
          </div>
        ) : user ? (
          <div className="dict-card" style={{ opacity: 0.5, cursor: 'not-allowed' }}>
            <div className="add-icon"></div>
            <div className="add-text">Р›РёРјРёС‚: РјР°РєСЃРёРјСѓРј 5 СЃР»РѕРІР°СЂРµР№</div>
          </div>
        ) : (
          <div 
            className="dict-card" 
            onClick={() => showToast('Р’РѕР№РґРёС‚Рµ РІ Р°РєРєР°СѓРЅС‚ РґР»СЏ СЃРѕР·РґР°РЅРёСЏ СЃР»РѕРІР°СЂРµР№')}
            style={{ opacity: 0.7 }}
          >
            <div className="add-icon"></div>
            <div className="add-text">Р’РѕР№РґРёС‚Рµ РґР»СЏ СЃРѕР·РґР°РЅРёСЏ СЃР»РѕРІР°СЂРµР№</div>
          </div>
        )}

        {/* Add default dictionary card (admin only) */}

        {/* Restore default dictionaries button (admin only) */}
        {isAdmin && (
          <div 
            className="dict-card add-card"
            style={{ border: '2px dashed #f5a623' }}
            onClick={handleRestoreDefaultDicts}
          >
            <div className="add-icon" style={{ color: '#f5a623' }}>в†є</div>
            <div className="add-text">Р’РѕСЃСЃС‚Р°РЅРѕРІРёС‚СЊ Р±Р°Р·РѕРІС‹Рµ</div>
          </div>
        )}
      </div>

      {/* Create Dictionary Modal */}
      {newDictModalOpen && (
        <div className="modal-overlay active" onClick={() => setNewDictModalOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close-icon" onClick={() => setNewDictModalOpen(false)}>Г—</button>
            <div className="modal-title">РќР°Р·РІР°РЅРёРµ СЃР»РѕРІР°СЂСЏ</div>
            <input
              type="text"
              className="modal-input"
              value={newDictName}
              onChange={(e) => setNewDictName(e.target.value)}
              placeholder="Р’РІРµРґРёС‚Рµ РЅР°Р·РІР°РЅРёРµ..."
              autoFocus
              onKeyPress={(e) => e.key === 'Enter' && handleCreateDict()}
            />
            <div className="controls" style={{ gap: '12px', marginTop: '16px' }}>
              <button className="btn btn-primary" onClick={handleCreateDict}>РЎРѕР·РґР°С‚СЊ</button>
              <button className="btn btn-secondary" onClick={() => setNewDictModalOpen(false)}>РћС‚РјРµРЅР°</button>
            </div>
          </div>
        </div>
      )}

      {/* Create Default Dictionary Modal */}
      {newDefaultDictModalOpen && (
        <div className="modal-overlay active" onClick={() => setNewDefaultDictModalOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close-icon" onClick={() => setNewDefaultDictModalOpen(false)}>Г—</button>
            <div className="modal-title">РќР°Р·РІР°РЅРёРµ Р±Р°Р·РѕРІРѕРіРѕ СЃР»РѕРІР°СЂСЏ</div>
            <input
              type="text"
              className="modal-input"
              value={newDefaultDictName}
              onChange={(e) => setNewDefaultDictName(e.target.value)}
              placeholder="Р’РІРµРґРёС‚Рµ РЅР°Р·РІР°РЅРёРµ..."
              autoFocus
              onKeyPress={(e) => e.key === 'Enter' && handleCreateDefaultDictSubmit()}
            />
            <div className="controls" style={{ gap: '12px', marginTop: '16px' }}>
              <button className="btn btn-primary" onClick={handleCreateDefaultDictSubmit}>РЎРѕР·РґР°С‚СЊ</button>
              <button className="btn btn-secondary" onClick={() => setNewDefaultDictModalOpen(false)}>РћС‚РјРµРЅР°</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
