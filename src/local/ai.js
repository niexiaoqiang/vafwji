// 电脑玩家的攻击策略（概率推理）。
//
// 枚举对方飞机所有可能的位置，剔除与已知信息矛盾的（压到未命中格、机头落在
// 已知机身格、和已击落飞机重叠），然后统计每个未攻击格子被覆盖的权重：
//   - 能解释更多“已命中但未击落”格子的位置权重更高（顺着命中继续追）；
//   - 机头格额外加权，因为只有打中机头才算击落。
// 在得分最高的几个格子里随机挑一个，避免每局走法完全一样。
// 难度通过“随手乱打”的比例和候选范围控制。
import { allPlacements, COLUMNS } from '../../shared/planes.js';

const key = (row, col) => `${row},${col}`;
const PLACEMENTS = allPlacements();

export const LEVELS = {
  easy: { label: '简单', randomRate: 0.85, band: 0.5, top: 10 },
  normal: { label: '普通', randomRate: 0.5, band: 0.7, top: 6 },
  hard: { label: '困难', randomRate: 0, band: 0.85, top: 4 },
};

export class PlaneHunter {
  constructor({ level = 'normal', random = Math.random } = {}) {
    this.level = LEVELS[level] || LEVELS.normal;
    this.random = random;
    this.reset();
  }

  reset() {
    this.shots = new Map(); // key -> miss | hit | sink
    this.sunkCells = new Set();
  }

  record(position, result, sunkPlane) {
    this.shots.set(key(position.row, position.col), result);
    if (result === 'sink' && Array.isArray(sunkPlane)) {
      sunkPlane.forEach((c) => this.sunkCells.add(key(c.row, c.col)));
    }
  }

  next() {
    const open = [];
    for (let row = 1; row <= 10; row++) {
      for (const col of COLUMNS) if (!this.shots.has(key(row, col))) open.push({ row, col });
    }
    if (this.random() < this.level.randomRate) {
      return open[Math.floor(this.random() * open.length)];
    }
    const openHits = [...this.shots.entries()]
      .filter(([k, r]) => r === 'hit' && !this.sunkCells.has(k))
      .map(([k]) => k);
    const scores = new Map();

    for (const plane of PLACEMENTS) {
      let consistent = true;
      let covered = 0;
      for (const c of plane.coordinates) {
        const k = key(c.row, c.col);
        const shot = this.shots.get(k);
        if (this.sunkCells.has(k) || shot === 'miss' || (c.isHead && shot === 'hit')) {
          consistent = false;
          break;
        }
        if (shot === 'hit') covered += 1;
      }
      if (!consistent) continue;
      // 有未解决的命中时，强烈偏向能解释它们的位置
      const weight = openHits.length ? (covered ? 1 + covered * 8 : 0.05) : 1;
      for (const c of plane.coordinates) {
        const k = key(c.row, c.col);
        if (this.shots.has(k)) continue;
        scores.set(k, (scores.get(k) || 0) + weight * (c.isHead ? 3 : 1));
      }
    }

    const candidates = [...scores.entries()].sort((a, b) => b[1] - a[1]);
    // 理论上不会为空；兜底随便找个没打过的格子
    if (candidates.length === 0) return open[Math.floor(this.random() * open.length)];
    const best = candidates[0][1];
    const top = candidates.filter(([, score]) => score >= best * this.level.band).slice(0, this.level.top);
    const [chosen] = top[Math.floor(this.random() * top.length)];
    const [row, col] = chosen.split(',');
    return { row: Number(row), col };
  }
}
