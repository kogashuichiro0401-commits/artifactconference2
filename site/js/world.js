// ブロックの世界(データと、描画用の形の作り方)。画面には依存しない。
export const SX = 64, SY = 32, SZ = 64, CHUNK = 16;
export const B = { AIR: 0, GRASS: 1, DIRT: 2, STONE: 3 };

// 地面の高さ。中央(スタート地点)は平らにしてある。
export function surfaceHeight(x, z) {
  let h = 10 + 3 * Math.sin(x * 0.11) + 3 * Math.cos(z * 0.09) + 2 * Math.sin((x + z) * 0.07) + 1.5 * Math.sin(x * 0.31) * Math.cos(z * 0.27);
  const d = Math.hypot(x - SX / 2, z - SZ / 2);
  const t = Math.min(1, Math.max(0, (d - 6) / 10));
  h = 10 * (1 - t) + h * t;
  return Math.max(1, Math.min(SY - 4, Math.floor(h)));
}

export class World {
  constructor() {
    this.data = new Uint8Array(SX * SY * SZ);
    this.generate();
  }
  idx(x, y, z) { return (y * SZ + z) * SX + x; }
  // 範囲の外は「かべ」(石)。下にも落ちない。
  get(x, y, z) {
    if (y < 0) return B.STONE;
    if (x < 0 || x >= SX || z < 0 || z >= SZ) return B.STONE;
    if (y >= SY) return B.AIR;
    return this.data[this.idx(x, y, z)];
  }
  solid(x, y, z) { return this.get(x, y, z) !== B.AIR; }
  generate() {
    for (let z = 0; z < SZ; z++) {
      for (let x = 0; x < SX; x++) {
        const h = surfaceHeight(x, z);
        for (let y = 0; y <= h; y++) {
          this.data[this.idx(x, y, z)] = y === h ? B.GRASS : y >= h - 3 ? B.DIRT : B.STONE;
        }
      }
    }
  }
  spawnPoint() {
    const bx = SX / 2, bz = SZ / 2;
    return { x: bx + 0.5, y: surfaceHeight(bx, bz) + 1, z: bz + 0.5 };
  }
}

// 面ごとの形(外側から見て反時計回り)
const FACES = [
  { dir: [-1, 0, 0], shade: 0.6, corners: [[0, 1, 0], [0, 0, 0], [0, 1, 1], [0, 0, 1]] },
  { dir: [1, 0, 0], shade: 0.6, corners: [[1, 1, 1], [1, 0, 1], [1, 1, 0], [1, 0, 0]] },
  { dir: [0, -1, 0], shade: 0.5, corners: [[1, 0, 1], [0, 0, 1], [1, 0, 0], [0, 0, 0]] },
  { dir: [0, 1, 0], shade: 1.0, corners: [[0, 1, 1], [1, 1, 1], [0, 1, 0], [1, 1, 0]] },
  { dir: [0, 0, -1], shade: 0.8, corners: [[1, 0, 0], [0, 0, 0], [1, 1, 0], [0, 1, 0]] },
  { dir: [0, 0, 1], shade: 0.8, corners: [[0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]] },
];

const DIRT = [0.48, 0.35, 0.22];
const PALETTE = {
  [B.GRASS]: { top: [0.36, 0.66, 0.22], side: DIRT, bottom: DIRT },
  [B.DIRT]: { top: DIRT, side: DIRT, bottom: DIRT },
  [B.STONE]: { top: [0.55, 0.55, 0.55], side: [0.55, 0.55, 0.55], bottom: [0.55, 0.55, 0.55] },
};

// ブロックごとに少しだけ色をゆらす(のっぺりしないように)
function hash(x, y, z) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

// 1つの区画(16x16)の、描画用データを作る。見える面だけ作る。
export function buildChunkData(world, cx, cz) {
  const positions = [], colors = [], indices = [];
  const x0 = cx * CHUNK, z0 = cz * CHUNK;
  for (let y = 0; y < SY; y++) {
    for (let z = z0; z < z0 + CHUNK; z++) {
      for (let x = x0; x < x0 + CHUNK; x++) {
        const b = world.get(x, y, z);
        if (!b) continue;
        const pal = PALETTE[b];
        const v = 0.94 + hash(x, y, z) * 0.12;
        for (const f of FACES) {
          const [dx, dy, dz] = f.dir;
          if (world.solid(x + dx, y + dy, z + dz)) continue;
          const col = dy === 1 ? pal.top : dy === -1 ? pal.bottom : pal.side;
          const s = f.shade * v;
          const n = positions.length / 3;
          for (const c of f.corners) {
            positions.push(x + c[0], y + c[1], z + c[2]);
            colors.push(col[0] * s, col[1] * s, col[2] * s);
          }
          indices.push(n, n + 1, n + 2, n + 2, n + 1, n + 3);
        }
      }
    }
  }
  return {
    positions: new Float32Array(positions),
    colors: new Float32Array(colors),
    indices: new Uint32Array(indices),
  };
}
