// Best-record persistence. localStorage only, no network. Every access is
// guarded: private mode and disabled storage must never break the game.
const KEY = 'emberkeep.best.v1';

export function loadBest() {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return null;
    return {
      bestTimeSec: data.bestTimeSec | 0,
      bestKills: data.bestKills | 0,
      bestLevel: data.bestLevel | 0,
      wins: data.wins | 0,
      gamesPlayed: data.gamesPlayed | 0,
    };
  } catch {
    return null;
  }
}

export function saveBest(record) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(record));
  } catch {
    // Storage unavailable — the game plays on without a saved record.
  }
}

export function formatTime(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
