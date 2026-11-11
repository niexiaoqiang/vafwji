// 战绩：分别记录联机和人机（按难度）的胜负与命中情况，保存在本机。
import { persistent } from './platform.js';

const KEY = 'plane-stats-v1';
const empty = () => ({ online: { win: 0, lose: 0 }, ai: {}, shots: 0, hits: 0, best: null });
let writes = Promise.resolve();

export async function loadStats() {
  try {
    const raw = await persistent.get(KEY);
    return raw ? { ...empty(), ...JSON.parse(raw) } : empty();
  } catch {
    return empty();
  }
}

/**
 * 记录一局结果。
 * @param {{ mode: 'online'|'ai', level?: string, win: boolean, shots: number, hits: number }} result
 */
export function recordResult(result) {
  const next = writes.then(() => saveResult(result));
  writes = next.catch(() => {});
  return next;
}

async function saveResult({ gameId, mode, level, win, shots, hits, reason }) {
  const stats = await loadStats();
  const recorded = Array.isArray(stats.recorded) ? stats.recorded : [];
  if (gameId && recorded.includes(gameId)) return stats;
  const bucket = mode === 'ai'
    ? (stats.ai[level || 'normal'] = stats.ai[level || 'normal'] || { win: 0, lose: 0 })
    : stats.online;
  bucket[win ? 'win' : 'lose'] += 1;
  stats.shots += shots;
  stats.hits += hits;
  // 最少攻击次数获胜纪录
  if (win && !reason && shots > 0 && (stats.best === null || shots < stats.best)) stats.best = shots;
  if (gameId) stats.recorded = [...recorded, gameId].slice(-1000);
  await persistent.set(KEY, JSON.stringify(stats));
  return stats;
}
