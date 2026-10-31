// ブロックとプレートの世界(ブラウザ側)。保存・判定・光線・メッシュ作り。
import { N, YMIN, YN, BLOCK, mod, defaultCell } from "./shared.js";
import { PLATES, T } from "./plates.js";

const HW = 0.3;
export const CH = 16;   // メッシュの区画の大きさ(横)
const LIGHT = (() => { const l = [0.4, 0.8, 0.3], m = Math.hypot(...l); return l.map((v) => v / m); })();
// 面の向きによる明るさ(上=1、横=0.75〜0.8、下=0.6)
export function shade(n) {
  const d = n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2];
  return 0.85 + 0.15 * Math.min(1, Math.max(0, d) / LIGHT[1]);
}

export class World {
  constructor() {
    this.cells = new Uint16Array(N * YN * N);
    for (let y = YMIN; y < YMIN + YN; y++) for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) this.cells[this.idx(x, y, z)] = defaultCell(x, y, z);
    this.dirty = new Set();
  }
  idx(x, y, z) { return (mod(y - YMIN, YN) * N + mod(z, N)) * N + mod(x, N); }
  get(x, y, z) { return this.cells[this.idx(x, y, z)]; }
  set(x, y, z, v) {
    this.cells[this.idx(x, y, z)] = v;
    const cx = mod(x, N) >> 4, cz = mod(z, N) >> 4, nc = N / CH;
    this.dirty.add(cx * nc + cz);
    const lx = mod(x, N) & 15, lz = mod(z, N) & 15;   // 区画のはしなら、となりも作り直す
    if (lx === 0) this.dirty.add(mod(cx - 1, nc) * nc + cz);
    if (lx === CH - 1) this.dirty.add(mod(cx + 1, nc) * nc + cz);
    if (lz === 0) this.dirty.add(cx * nc + mod(cz - 1, nc));
    if (lz === CH - 1) this.dirty.add(cx * nc + mod(cz + 1, nc));
  }

  // 体(横の半幅 HW、高さ h)が、ブロックやプレートに重なっているか。重なった箱 [x0,y0,z0,x1,y1,z1] を返す
  hits(x, y, z, h) {
    const x0 = Math.floor(x - HW + 0.5), x1 = Math.floor(x + HW + 0.5);
    const y0 = Math.floor(y + 0.5), y1 = Math.floor(y + h + 0.5);
    const z0 = Math.floor(z - HW + 0.5), z1 = Math.floor(z + HW + 0.5);
    for (let ix = x0; ix <= x1; ix++) for (let iy = y0; iy <= y1; iy++) for (let iz = z0; iz <= z1; iz++) {
      const v = this.get(ix, iy, iz);
      if (!v) continue;
      if (v & BLOCK) {
        const b = [ix - 0.5, iy - 0.5, iz - 0.5, ix + 0.5, iy + 0.5, iz + 0.5];
        if (x + HW > b[0] && x - HW < b[3] && z + HW > b[2] && z - HW < b[5] && y + h > b[1] && y < b[4]) return b;
        continue;
      }
      for (let i = 0; i < 12; i++) {
        if (!(v & (1 << i))) continue;
        for (const q of PLATES[i].boxes) {
          const b = [ix + q[0], iy + q[1], iz + q[2], ix + q[3], iy + q[4], iz + q[5]];
          if (x + HW > b[0] && x - HW < b[3] && z + HW > b[2] && z - HW < b[5] && y + h > b[1] && y < b[4]) return b;
        }
      }
    }
    return null;
  }

  // 目から出る光線。ブロックやプレートに当たった最初のものを返す。(ix,iy,iz は、ループしない通しの番号)
  raycast(o, d, reach, blocksOnly) {
    let ix = Math.floor(o[0] + 0.5), iy = Math.floor(o[1] + 0.5), iz = Math.floor(o[2] + 0.5);
    const step = [d[0] > 0 ? 1 : -1, d[1] > 0 ? 1 : -1, d[2] > 0 ? 1 : -1];
    const idxs = [ix, iy, iz];
    const tMax = [0, 1, 2].map((a) => (d[a] === 0 ? Infinity : (idxs[a] + (step[a] > 0 ? 0.5 : -0.5) - o[a]) / d[a]));
    const tDelta = [0, 1, 2].map((a) => (d[a] === 0 ? Infinity : Math.abs(1 / d[a])));
    let t = 0, face = [0, 0, 0];
    for (let n = 0; n < 40 && t <= reach; n++) {
      const v = this.get(idxs[0], idxs[1], idxs[2]);
      if (v) {
        if (v & BLOCK) {
          if (t > 0) return { kind: "block", cell: idxs.slice(), face, t, point: [o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t] };
        } else if (!blocksOnly) {
          let best = null;
          for (let i = 0; i < 12; i++) {
            if (!(v & (1 << i))) continue;
            const r = rayPlate(o, d, idxs, PLATES[i]);
            if (r && r.t <= reach && (!best || r.t < best.t)) best = { kind: "plate", cell: idxs.slice(), plate: i, face: r.n, t: r.t, point: [o[0] + d[0] * r.t, o[1] + d[1] * r.t, o[2] + d[2] * r.t] };
          }
          if (best) return best;
        }
      }
      const a = tMax[0] < tMax[1] ? (tMax[0] < tMax[2] ? 0 : 2) : (tMax[1] < tMax[2] ? 1 : 2);
      t = tMax[a]; tMax[a] += tDelta[a]; idxs[a] += step[a];
      face = [0, 0, 0]; face[a] = -step[a];
    }
    return null;
  }
}

// 板(向きのついた薄い箱)と光線の交点
function rayPlate(o, d, cell, pl) {
  let tn = -Infinity, tf = Infinity, hitAxis = -1, hitSign = 1;
  for (let k = 0; k < 3; k++) {
    const A = pl.axes[k];
    const oc = [o[0] - cell[0] - pl.c[0], o[1] - cell[1] - pl.c[1], o[2] - cell[2] - pl.c[2]];
    const ol = oc[0] * A[0] + oc[1] * A[1] + oc[2] * A[2];
    const dl = d[0] * A[0] + d[1] * A[1] + d[2] * A[2];
    const h = pl.half[k];
    if (Math.abs(dl) < 1e-9) { if (ol < -h || ol > h) return null; continue; }
    let t1 = (-h - ol) / dl, t2 = (h - ol) / dl, sg = -1;
    if (t1 > t2) { const s = t1; t1 = t2; t2 = s; sg = 1; }
    if (t1 > tn) { tn = t1; hitAxis = k; hitSign = sg * (dl > 0 ? 1 : 1); }
    if (t2 < tf) tf = t2;
    if (tn > tf) return null;
  }
  if (tn < 0 || hitAxis < 0) return null;
  const A = pl.axes[hitAxis];
  // 当たった面の外向きの法線(光線がやってきた側)
  const dl = d[0] * A[0] + d[1] * A[1] + d[2] * A[2];
  const s = dl > 0 ? -1 : 1;
  return { t: tn, n: [A[0] * s, A[1] * s, A[2] * s] };
}

// ---- メッシュ(区画ごと) ----
const FACES = [
  { n: [1, 0, 0], v: [[0.5, -0.5, -0.5], [0.5, 0.5, -0.5], [0.5, 0.5, 0.5], [0.5, -0.5, 0.5]] },
  { n: [-1, 0, 0], v: [[-0.5, -0.5, 0.5], [-0.5, 0.5, 0.5], [-0.5, 0.5, -0.5], [-0.5, -0.5, -0.5]] },
  { n: [0, 1, 0], v: [[-0.5, 0.5, -0.5], [-0.5, 0.5, 0.5], [0.5, 0.5, 0.5], [0.5, 0.5, -0.5]] },
  { n: [0, -1, 0], v: [[-0.5, -0.5, 0.5], [-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, -0.5, 0.5]] },
  { n: [0, 0, 1], v: [[0.5, -0.5, 0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5], [-0.5, -0.5, 0.5]] },
  { n: [0, 0, -1], v: [[-0.5, -0.5, -0.5], [-0.5, 0.5, -0.5], [0.5, 0.5, -0.5], [0.5, -0.5, -0.5]] },
];

export function buildChunk(world, cx, cz) {
  const pos = [], col = [], idx = [];
  const quad = (p, s) => {
    const base = pos.length / 3;
    for (const q of p) { pos.push(q[0], q[1], q[2]); col.push(s, s, s); }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  for (let x = cx * CH; x < cx * CH + CH; x++) for (let z = cz * CH; z < cz * CH + CH; z++) for (let y = YMIN; y < YMIN + YN; y++) {
    const v = world.get(x, y, z);
    if (!v) continue;
    if (v & BLOCK) {
      for (const f of FACES) {
        if (world.get(x + f.n[0], y + f.n[1], z + f.n[2]) & BLOCK) continue;
        quad(f.v.map((q) => [x + q[0], y + q[1], z + q[2]]), shade(f.n));
      }
    } else {
      for (let i = 0; i < 12; i++) {
        if (!(v & (1 << i))) continue;
        // プレートは厚みのない1まいの面。両面とも同じ明るさ(明るいほうの向き)
        const pl = PLATES[i], h = pl.half;
        const kt = h[0] < 0.1 ? 0 : h[1] < 0.1 ? 1 : 2;
        const B = pl.axes[(kt + 1) % 3], C = pl.axes[(kt + 2) % 3], hb = h[(kt + 1) % 3], hc = h[(kt + 2) % 3];
        const k = pl.diag ? 1 : (0.5 - 0.004) / (0.5 - T / 2);
        const ctr = [x + pl.c[0] * k, y + pl.c[1] * k, z + pl.c[2] * k];
        const corner = (sb, sc) => [ctr[0] + B[0] * hb * sb + C[0] * hc * sc, ctr[1] + B[1] * hb * sb + C[1] * hc * sc, ctr[2] + B[2] * hb * sb + C[2] * hc * sc];
        quad([corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)], Math.max(shade(pl.n), shade([-pl.n[0], -pl.n[1], -pl.n[2]])));
      }
    }
  }
  return { pos: new Float32Array(pos), col: new Float32Array(col), idx: pos.length / 3 > 65535 ? new Uint32Array(idx) : new Uint16Array(idx) };
}
