// 飞机形状的唯一权威定义（服务端与浏览器共用）：校验玩家布局、生成规范化坐标、
// 为电脑玩家随机布置和枚举所有可能位置。
// 形状与前端 RoomView.createPlane 一致：以机翼中心为锚点，共 10 格。
//
//   朝上 (direction 0)：
//         H          机头
//     W W C W W      机翼（C 为机翼中心）
//         B          机身
//       T T T        尾翼

export const COLUMNS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
export const PLANE_COUNT = 3;
export const PLANE_SIZE = 10;

// 朝上时各部位相对机翼中心的偏移 [dRow, dCol]
const SHAPE_UP = [
  ['head', -1, 0],
  ['wing-center', 0, 0],
  ['wing-left', 0, -1],
  ['wing-left-tip', 0, -2],
  ['wing-right', 0, 1],
  ['wing-right-tip', 0, 2],
  ['body', 1, 0],
  ['tail-center', 2, 0],
  ['tail-left', 2, -1],
  ['tail-right', 2, 1],
];

// 其他方向的部位命名沿用前端：名称表示棋盘上的实际方位
// （左右朝向时机翼称 up/down；朝下时左右与朝上相反）
const PART_RENAME = {
  1: { 'wing-left': 'wing-up', 'wing-left-tip': 'wing-up-tip', 'wing-right': 'wing-down', 'wing-right-tip': 'wing-down-tip', 'tail-left': 'tail-up', 'tail-right': 'tail-down' },
  2: { 'wing-left': 'wing-right', 'wing-left-tip': 'wing-right-tip', 'wing-right': 'wing-left', 'wing-right-tip': 'wing-left-tip', 'tail-left': 'tail-right', 'tail-right': 'tail-left' },
  3: { 'wing-left': 'wing-down', 'wing-left-tip': 'wing-down-tip', 'wing-right': 'wing-up', 'wing-right-tip': 'wing-up-tip', 'tail-left': 'tail-down', 'tail-right': 'tail-up' },
};

// 把“朝上”的偏移旋转到指定方向（顺时针 0 上 / 1 右 / 2 下 / 3 左）
function rotate([dr, dc], direction) {
  switch (direction) {
    case 1: return [dc, -dr];
    case 2: return [-dr, -dc];
    case 3: return [-dc, dr];
    default: return [dr, dc];
  }
}

/** 按锚点和方向生成飞机坐标；越界返回 null。 */
export function buildPlane(row, colIndex, direction) {
  const coordinates = [];
  for (const [part, dr, dc] of SHAPE_UP) {
    const [r, c] = rotate([dr, dc], direction);
    const nr = row + r;
    const nc = colIndex + c;
    if (nr < 1 || nr > 10 || nc < 0 || nc > 9) return null;
    coordinates.push({
      row: nr,
      col: COLUMNS[nc],
      part: PART_RENAME[direction]?.[part] || part,
      isHead: part === 'head',
    });
  }
  return { direction, coordinates, sunk: false };
}

const key = (row, col) => `${row},${col}`;

function toCell(coord) {
  if (!coord || typeof coord !== 'object') return null;
  const row = Number(coord.row);
  const col = typeof coord.col === 'string' ? coord.col.trim().toUpperCase() : '';
  if (!Number.isInteger(row) || row < 1 || row > 10 || !COLUMNS.includes(col)) return null;
  return { row, col };
}

/**
 * 校验客户端提交的飞机布局，返回规范化后的飞机数组。
 * 只认坐标集合本身：客户端声明的 part / isHead / direction 一律不信任，
 * 而是在所有锚点和方向中找出与之完全一致的标准飞机。
 */
export function normalizePlanes(planes) {
  if (!Array.isArray(planes) || planes.length !== PLANE_COUNT) {
    return { error: `需要恰好 ${PLANE_COUNT} 架飞机` };
  }
  const occupied = new Set();
  const result = [];
  for (const [index, plane] of planes.entries()) {
    const coords = Array.isArray(plane?.coordinates) ? plane.coordinates.map(toCell) : [];
    if (coords.length !== PLANE_SIZE || coords.some((c) => !c)) {
      return { error: `第 ${index + 1} 架飞机坐标无效` };
    }
    const wanted = new Set(coords.map((c) => key(c.row, c.col)));
    if (wanted.size !== PLANE_SIZE) return { error: `第 ${index + 1} 架飞机坐标重复` };

    let match = null;
    for (let direction = 0; direction < 4 && !match; direction++) {
      for (let row = 1; row <= 10 && !match; row++) {
        for (let colIndex = 0; colIndex < 10 && !match; colIndex++) {
          const candidate = buildPlane(row, colIndex, direction);
          if (candidate && candidate.coordinates.every((c) => wanted.has(key(c.row, c.col)))) {
            match = candidate;
          }
        }
      }
    }
    if (!match) return { error: `第 ${index + 1} 架飞机形状不正确` };
    for (const c of match.coordinates) {
      const k = key(c.row, c.col);
      if (occupied.has(k)) return { error: '飞机之间不能重叠' };
      occupied.add(k);
    }
    result.push(match);
  }
  return { planes: result };
}

/** 棋盘上所有放得下的飞机位置（不考虑重叠），供随机布置和电脑推理使用。 */
export function allPlacements() {
  const list = [];
  for (let direction = 0; direction < 4; direction++) {
    for (let row = 1; row <= 10; row++) {
      for (let colIndex = 0; colIndex < 10; colIndex++) {
        const plane = buildPlane(row, colIndex, direction);
        if (plane) list.push(plane);
      }
    }
  }
  return list;
}

/** 随机布置 PLANE_COUNT 架互不重叠的飞机。 */
export function randomPlanes(random = Math.random) {
  const placements = allPlacements();
  for (let attempt = 0; attempt < 200; attempt++) {
    const occupied = new Set();
    const planes = [];
    for (let tries = 0; tries < 500 && planes.length < PLANE_COUNT; tries++) {
      const candidate = placements[Math.floor(random() * placements.length)];
      if (candidate.coordinates.some((c) => occupied.has(key(c.row, c.col)))) continue;
      candidate.coordinates.forEach((c) => occupied.add(key(c.row, c.col)));
      planes.push(JSON.parse(JSON.stringify(candidate)));
    }
    if (planes.length === PLANE_COUNT) return planes;
  }
  throw new Error('无法随机布置飞机');
}
