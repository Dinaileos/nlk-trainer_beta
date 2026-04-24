'use client';

import { useState, useEffect } from 'react';
import { useDictionariesStore } from '@/lib/store';
import * as storage from '@/lib/storage';

interface StatsScreenProps {
  onNavigate: (screen: 'main' | 'editor' | 'exercise' | 'stats' | 'editorPlus' | 'quickMode', index?: number) => void;
  showToast: (message: string, isError?: boolean) => void;
}

interface LocalStats {
  totalGames: number;
  totalErrors: number;
  games: Array<{
    date: number;
    errors: number;
    totalSegments: number;
    correctSegments: number;
  }>;
  wordErrors: Record<string, number>;
}

export default function StatsScreen({ onNavigate, showToast }: StatsScreenProps) {
  const { dictionaries, currentDictIndex } = useDictionariesStore();
  const [periodStart, setPeriodStart] = useState(0);
  const [rangeEnd, setRangeEnd] = useState(0);
  const [gamesHistory, setGamesHistory] = useState<number[]>([]);
  const [gamesSegments, setGamesSegments] = useState<number[]>([]);
  const [wordErrors, setWordErrors] = useState<Record<string, number>>({});
  const [totalGames, setTotalGames] = useState(0);
  const [statsLoaded, setStatsLoaded] = useState(false);
  const [showPlusStats, setShowPlusStats] = useState(false);
  
  const dict = dictionaries[currentDictIndex];
  const hasPlusDict = dict?.plusDictionary && dict.plusDictionary.words && dict.plusDictionary.words.length > 0;
  const hasErrors = Object.keys(wordErrors).length > 0;
  
  const handlePlusButtonClick = () => {
    if (!dict) return;
    
    // Запоминаем какой словарь+ открываем
    storage.setCurrentPlusDictId(dict.id);
    
    // Если словарь+ пустой, создаём его
    if (!hasPlusDict) {
      useDictionariesStore.getState().updateDictionary(dict.id, {
        plusDictionary: {
          name: dict.name + '+',
          words: [],
          wordErrors: {},
          gamesHistory: []
        }
      });
    }
    
    // Открываем редактор словаря+
    onNavigate('editorPlus', currentDictIndex);
  };
  
  useEffect(() => {
    if (!dict) return;
    const loadStats = () => {
      const localStats = showPlusStats 
        ? storage.getPlusStats(dict.id)
        : storage.getStats(dict.id);
      setTotalGames(localStats.totalGames);
      setGamesHistory(localStats.games.map((g: any) => g.errors));
      setGamesSegments(localStats.games.map((g: any) => g.totalSegments || 15));
      setWordErrors(localStats.wordErrors || {});
      setStatsLoaded(true);
    };
    loadStats();
    const interval = setInterval(loadStats, 300);
    return () => clearInterval(interval);
  }, [dict?.id, showPlusStats]);
  
  useEffect(() => {
    if (gamesHistory.length > 0) {
      setRangeEnd(gamesHistory.length);
      setPeriodStart(0);
    }
  }, [gamesHistory.length]);
  
  const record = gamesHistory.length > 0 ? Math.min(...gamesHistory) : 0;
  const actualRangeStart = Math.min(periodStart, rangeEnd);
  const actualRangeEnd = Math.max(periodStart, rangeEnd);
  const displayGames = gamesHistory.slice(actualRangeStart, actualRangeEnd);
  const displaySegments = gamesSegments.slice(actualRangeStart, actualRangeEnd);
  
  const avgErrors = displayGames.length > 0 
    ? displayGames.reduce((a, b) => a + b, 0) / displayGames.length
    : 0;
  
  const totalSegmentsInRange = displaySegments.reduce((a, b) => a + b, 0);
  const totalErrorsInRange = displayGames.reduce((a, b) => a + b, 0);
  const accuracy = totalSegmentsInRange > 0 
    ? (1 - totalErrorsInRange / totalSegmentsInRange) * 100 
    : 0;
  
  // Лучшая точность в выбранном диапа��оне
  const bestAccuracy = displayGames.length > 0 
    ? Math.max(...displayGames.map((errors, idx) => {
        const segments = displaySegments[idx] || 15;
        return segments > 0 ? (1 - errors / segments) * 100 : 100;
      }))
    : 0;

  const sortedWords = Object.entries(wordErrors)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 50);

  const handleClose = () => onNavigate('main');
  
  const totalGamesCount = gamesHistory.length;
  
  const barWidth = Math.max(4, Math.min(20, 600 / Math.max(displayGames.length, 1)));
  const barGap = 2;
  const chartHeight = 240;
  const maxErrorsInRange = displayGames.length > 0 ? Math.max(...displayGames, 1) : 1;
  const maxChartValue = maxErrorsInRange * 1.2;
  
  function getErrorColor(errors: number, segments: number): string {
    if (errors === 0) return '#FFD700'; // Ярко-золотой за идеальную игру
    const percent = errors / segments;
    if (percent <= 0.1) return '#1ed760'; // Зелёный: ≤10% ошибок
    if (percent <= 0.3) return '#FF8C00'; // Тёмно-оранжевый: 11-30% ошибок
    return '#f37272'; // Красный: >30% ошибок
  }

  return (
    <div className="stats-screen dashboard">
      <div className="dashboard-header">
        <button className="dashboard-back-btn" onClick={handleClose}>←</button>
        <div className="dashboard-title">
          {dict?.name || 'Словарь'}
        </div>
        {hasErrors && (
          <button 
            className="plus-edit-btn"
            onClick={handlePlusButtonClick}
            title={hasPlusDict ? 'Редактировать словарь+' : 'Создать словарь+'}
          >
            {hasPlusDict ? '✏️' : '+'}
          </button>
        )}
        {hasPlusDict && (
          <div className="stats-toggle">
            <button 
              className={`stats-toggle-btn ${!showPlusStats ? 'active' : ''}`}
              onClick={() => setShowPlusStats(false)}
            >
              Словарь
            </button>
            <button 
              className={`stats-toggle-btn ${showPlusStats ? 'active' : ''}`}
              onClick={() => setShowPlusStats(true)}
            >
              Словарь+
            </button>
          </div>
        )}
      </div>

      <div className="dashboard-grid">
        <div className="dashboard-left">
          <div className="kpi-row">
            <div className="kpi-card">
              <div className="kpi-label">Точность</div>
              <div className="kpi-value percentage">{accuracy.toFixed(1)}%</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Среднее</div>
              <div className="kpi-value">{avgErrors.toFixed(1)}</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Лучшее</div>
              <div className="kpi-value record">{bestAccuracy.toFixed(1)}%</div>
            </div>
          </div>

          {statsLoaded && totalGamesCount > 0 && (
            <div className="chart-section">
              <div className="chart-container">
                {displayGames.length === 0 ? (
                  <div className="chart-empty">Нет данных</div>
                ) : (
                  <svg className="chart-svg bar-chart" viewBox={`0 0 ${displayGames.length * (barWidth + barGap)} ${chartHeight}`} preserveAspectRatio="xMidYMid meet">
                    {displayGames.map((val, idx) => {
                      const barHeight = Math.max(2, (val / maxChartValue) * chartHeight);
                      const x = idx * (barWidth + barGap);
                      const y = chartHeight - barHeight;
                      const segments = displaySegments[idx] || 15;
                      const color = getErrorColor(val, segments);
                      return (
                        <rect
                          key={idx}
                          x={x}
                          y={y}
                          width={barWidth}
                          height={barHeight}
                          fill={color}
                          rx="2"
                        />
                      );
                    })}
                  </svg>
                )}
              </div>
              
              <div className="range-slider-section">
<div className="range-labels" />
                <div className="double-range-slider" style={{ display: totalGamesCount > 1 ? 'block' : 'none' }}>
                  <div className="range-track-bg" />
                  <div 
                    className="range-track" 
                    style={{
                      left: totalGamesCount > 0 ? `${(actualRangeStart / totalGamesCount) * 100}%` : '0%',
                      width: totalGamesCount > 0 ? `${((actualRangeEnd - actualRangeStart) / totalGamesCount) * 100}%` : '100%'
                    }}
                  />
                  <input 
                    type="range" 
                    min="0" 
                    max={totalGamesCount} 
                    value={actualRangeStart}
                    onChange={(e) => {
                      const val = parseInt(e.target.value);
                      setPeriodStart(val);
                      if (val >= rangeEnd) setRangeEnd(Math.min(val + 1, totalGamesCount));
                    }}
                    className="range-input range-start"
                  />
                  <input 
                    type="range" 
                    min="0" 
                    max={totalGamesCount} 
                    value={actualRangeEnd}
                    onChange={(e) => {
                      const val = parseInt(e.target.value);
                      setRangeEnd(val);
                      if (val <= periodStart) setPeriodStart(Math.max(0, val - 1));
                    }}
                    className="range-input range-end"
                  />
                </div>
                <div className="range-values">
                  <span className="range-count">{actualRangeEnd - actualRangeStart} игр</span>
                  <span style={{ color: 'var(--text-secondary)' }}>
                    {((actualRangeEnd - actualRangeStart) / totalGamesCount * 100).toFixed(0)}% выборки
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="dashboard-right">
          <div className="word-list-section">
            <div className="word-list-header">
              <span>Ошибки слов</span>
              <span className="word-count">{sortedWords.length}</span>
            </div>
            <div className="word-list">
              {sortedWords.length === 0 ? (
                <div className="word-list-empty">Нет ошибок</div>
              ) : (
                sortedWords.map(([word, count]) => (
                  <div key={word} className="word-list-item">
                    <span className="word-text">{word}</span>
                    <span className="word-error-count">{count}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}