// ブロックとプレートの世界(ブラウザ側)。保存・判定・光線・メッシュ作り。
// 世界は、横にどこまでも広がる(ループしない)。ブロックがある所だけ、16×16の区画(縦は YMIN〜YMIN+YN)で持つ。
import { YMIN, YN, BLOCK, ROPE, defaultCell, DEFAULT_BLOCKS } from "./shared.js";
import { PLATES, T } from "./plates.js";

const HW = 0.3;
export const RHW = 0.07;   // 縄の太さの半分
export const CH = 16;   // メッシュの区画の大きさ(横)
export const chunkKey = (cx, cz) => cx + "," + cz;
// ---- マイクラ式の明るさ ----
// 1. 面の向き: 上がいちばん明るく、横は少し暗く、下がいちばん暗い(ほかのブロックは関係ない)
export function shade(n) {
  return n[0] * n[0] * 0.74 + n[2] * n[2] * 0.86 + (n[1] > 0 ? n[1] * n[1] * 1.0 : n[1] * n[1] * 0.62);
}
// 2. 空の光: 真上にブロックがなければ15、あれば11(かげ)
// 光のレベル(0〜15) → 明るさのかけ算。1段ごとに約0.9倍
const LIGHT_F = Array.from({ length: 16 }, (_, l) => Math.pow(0.9, 15 - l));
// 3. 角のかげ(AO): ブロックの角・くぼみの頂点を、すこし暗くする
const AO_STEP = 0.17;

class Chunk {
  constructor(cx, cz) {
    this.cx = cx; this.cz = cz;
    this.cells = new Uint16Array(CH * CH * YN);
    this.top = new Int32Array(CH * CH).fill(YMIN - 1);   // 列ごとの、いちばん上のブロックの高さ
    this.lo = Infinity; this.hi = -Infinity;             // 何かがある高さの範囲(メッシュ作りを速くする)
  }
}

export class World {
  constructor() {
    this.chunks = new Map();
    this.virtual = null;   // 画面だけの展示物(投稿の箱・リフト)の当たり判定: { hits(x,y,z,h) }
    this.dirty = new Set();   // 作りなおす区画のキー
    for (const [x, y, z] of DEFAULT_BLOCKS) this.set(x, y, z, defaultCell(x, y, z));
  }
  chunkAt(x, z, make) {
    const cx = Math.floor(x / CH), cz = Math.floor(z / CH), L = this._last;
    if (L && L.cx === cx && L.cz === cz) return L;
    const k = chunkKey(cx, cz);
    let c = this.chunks.get(k);
    if (c) this._last = c;
    if (!c && make) { c = new Chunk(cx, cz); this.chunks.set(k, c); }
    return c;
  }
  get(x, y, z) {
    if (y < YMIN || y >= YMIN + YN) return 0;
    const c = this.chunkAt(x, z, false);
    if (!c) return 0;
    return c.cells[((y - YMIN) * CH + (z - c.cz * CH)) * CH + (x - c.cx * CH)];
  }
  set(x, y, z, v) {
    if (y < YMIN || y >= YMIN + YN) return;
    const c = this.chunkAt(x, z, !!v);
    if (!c) return;
    const lx = x - c.cx * CH, lz = z - c.cz * CH;
    c.cells[((y - YMIN) * CH + lz) * CH + lx] = v;
    if (v) { if (y < c.lo) c.lo = y; if (y > c.hi) c.hi = y; }
    // 列のいちばん上(かげの計算)
    const ci = lz * CH + lx;
    if (v & BLOCK) { if (y > c.top[ci]) c.top[ci] = y; }
    else if (y === c.top[ci]) { let t = y - 1; while (t >= YMIN && !(c.cells[((t - YMIN) * CH + lz) * CH + lx] & BLOCK)) t--; c.top[ci] = t; }
    // この区画と、となりの区画(さかいめの面・かげが変わる)を作りなおす
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      if ((dx === -1 && lx > 0) || (dx === 1 && lx < CH - 1) || (dz === -1 && lz > 0) || (dz === 1 && lz < CH - 1)) continue;
      this.dirty.add(chunkKey(c.cx + dx, c.cz + dz));
    }
  }
  lightAt(x, y, z) {
    const c = this.chunkAt(x, z, false);
    if (!c) return 15;
    return y > c.top[(z - c.cz * CH) * CH + (x - c.cx * CH)] ? 15 : 11;
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
    return this.virtual ? this.virtual.hits(x, y, z, h) : null;
  }

  // 体(横の半幅 HW、高さ h)が、縄にふれているか(のぼれる)
  touchRope(x, y, z, h) {
    const m = 0.03;
    const x0 = Math.floor(x - HW - m + 0.5), x1 = Math.floor(x + HW + m + 0.5);
    const y0 = Math.floor(y + 0.5), y1 = Math.floor(y + h + 0.5);
    const z0 = Math.floor(z - HW - m + 0.5), z1 = Math.floor(z + HW + m + 0.5);
    for (let ix = x0; ix <= x1; ix++) for (let iy = y0; iy <= y1; iy++) for (let iz = z0; iz <= z1; iz++) {
      if (!(this.get(ix, iy, iz) & ROPE)) continue;
      if (x + HW + m > ix - RHW && x - HW - m < ix + RHW && z + HW + m > iz - RHW && z - HW - m < iz + RHW && y + h > iy - 0.5 && y < iy + 0.5) return true;
    }
    return false;
  }

  // 目から出る光線。ブロックやプレートに当たった最初のものを返す。(ix,iy,iz は、ループしない通しの番号)
  raycast(o, d, reach, blocksOnly) {
    let ix = Math.floor(o[0] + 0.5), iy = Math.floor(o[1] + 0.5), iz = Math.floor(o[2] + 0.5);
    const step = [d[0] > 0 ? 1 : -1, d[1] > 0 ? 1 : -1, d[2] > 0 ? 1 : -1];
    const idxs = [ix, iy, iz];
    const tMax = [0, 1, 2].map((a) => (d[a] === 0 ? Infinity : (idxs[a] + (step[a] > 0 ? 0.5 : -0.5) - o[a]) / d[a]));
    const tDelta = [0, 1, 2].map((a) => (d[a] === 0 ? Infinity : Math.abs(1 / d[a])));
    let t = 0, face = [0, 0, 0];
    for (let n = 0; n < 80 && t <= reach; n++) {
      const v = this.get(idxs[0], idxs[1], idxs[2]);
      if (v) {
        if (v & BLOCK) {
          if (t > 0) return { kind: "block", cell: idxs.slice(), face, t, point: [o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t] };
        } else if (!blocksOnly) {
          let best = null;
          if (v & ROPE) {
            const r = rayRope(o, d, idxs);
            if (r && r.t <= reach) best = { kind: "rope", cell: idxs.slice(), face: r.n, t: r.t, point: [o[0] + d[0] * r.t, o[1] + d[1] * r.t, o[2] + d[2] * r.t] };
          }
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

// 縄(セルの中央の細い柱)と光線の交点
function rayRope(o, d, cell) {
  let tn = 0, tf = Infinity, ax = -1, sg = 1;
  for (let k = 0; k < 3; k++) {
    const h = k === 1 ? 0.5 : RHW, lo = cell[k] - h - o[k], hi = cell[k] + h - o[k];
    if (Math.abs(d[k]) < 1e-9) { if (lo > 0 || hi < 0) return null; continue; }
    let a = lo / d[k], b = hi / d[k], s = -1;
    if (a > b) { const q = a; a = b; b = q; s = 1; }
    if (a > tn) { tn = a; ax = k; sg = s; }
    if (b < tf) tf = b;
    if (tn > tf) return null;
  }
  if (ax < 0) return null;
  const n = [0, 0, 0]; n[ax] = d[ax] > 0 ? -1 : 1;
  return { t: tn, n };
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
  const opq = (x, y, z) => (world.get(x, y, z) & BLOCK ? 1 : 0);   // 角のかげ(AO)は、ブロックだけで決める
  // プレートの面の明るさ: そのセルの光と、まわりの空いたセルの光(−1)の大きいほう(プレート自身のせいで暗くならないように)
  const plateLight = (x, y, z) => {
    let m = world.lightAt(x, y, z);
    for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
      if (world.get(x + dx, y + dy, z + dz) & BLOCK) continue;
      const l = world.lightAt(x + dx, y + dy, z + dz) - 1;
      if (l > m) m = l;
    }
    return Math.max(0, m);
  };
  const ck = world.chunks.get(chunkKey(cx, cz));
  if (!ck || ck.lo > ck.hi) return { pos: new Float32Array(0), col: new Float32Array(0), idx: new Uint16Array(0) };
  for (let x = cx * CH; x < cx * CH + CH; x++) for (let z = cz * CH; z < cz * CH + CH; z++) for (let y = ck.lo; y <= ck.hi; y++) {
    const v = world.get(x, y, z);
    if (!v) continue;
    if (v & BLOCK) {
      for (const f of FACES) {
        const fx = x + f.n[0], fy = y + f.n[1], fz = z + f.n[2];
        if (world.get(fx, fy, fz) & BLOCK) continue;
        const s = shade(f.n), L0 = world.lightAt(fx, fy, fz), base = pos.length / 3, cc = [];
        const ax = f.n[0] ? 0 : f.n[1] ? 1 : 2, t1 = (ax + 1) % 3, t2 = (ax + 2) % 3;
        const frontOcc = 0;
        for (const q of f.v) {
          const s1 = q[t1] > 0 ? 1 : -1, s2 = q[t2] > 0 ? 1 : -1;
          const P1 = [fx, fy, fz], P2 = [fx, fy, fz], PC = [fx, fy, fz];
          P1[t1] += s1; P2[t2] += s2; PC[t1] += s1; PC[t2] += s2;
          const o1 = opq(P1[0], P1[1], P1[2]), o2 = opq(P2[0], P2[1], P2[2]);
          const oc = o1 >= 1 && o2 >= 1 ? 1 : opq(PC[0], PC[1], PC[2]);
          const l1 = o1 >= 1 ? L0 : world.lightAt(P1[0], P1[1], P1[2]), l2 = o2 >= 1 ? L0 : world.lightAt(P2[0], P2[1], P2[2]);
          const lc = o1 >= 1 && o2 >= 1 ? L0 : opq(PC[0], PC[1], PC[2]) >= 1 ? L0 : world.lightAt(PC[0], PC[1], PC[2]);
          const light = (L0 + l1 + l2 + lc) / 4;
          const lo = Math.floor(light), fr = light - lo, fac = LIGHT_F[lo] * (1 - fr) + LIGHT_F[Math.min(15, lo + 1)] * fr;
          const ao = 1 - AO_STEP * (Math.min(1, o1) + Math.min(1, o2) + Math.min(1, oc) + frontOcc * 0.5);
          const c = s * fac * Math.max(0.35, ao);
          pos.push(x + q[0], y + q[1], z + q[2]); col.push(c, c, c); cc.push(c);
        }
        if (cc[0] + cc[2] < cc[1] + cc[3]) idx.push(base + 1, base + 2, base + 3, base + 1, base + 3, base);   // 暗さのつながりがなめらかな対角線で割る
        else idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
    } else {
      if (v & ROPE) {   // 縄: 細い四角い柱を、4つの帯(色が交互)に分けて作る
        const lv = LIGHT_F[world.lightAt(x, y, z)];
        for (const f of FACES) {
          if (f.n[1] !== 0) continue;
          const s = shade(f.n) * lv;
          for (let b = 0; b < 4; b++) {
            const base = pos.length / 3, tone = b % 2 ? [0.62, 0.46, 0.24] : [0.82, 0.64, 0.36];
            const y0 = y - 0.5 + b * 0.25, y1 = y0 + 0.25;
            for (const q of f.v) {
              pos.push(x + q[0] * 2 * RHW, q[1] > 0 ? y1 : y0, z + q[2] * 2 * RHW);
              col.push(s * tone[0], s * tone[1], s * tone[2]);
            }
            idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
          }
        }
      }
      for (let i = 0; i < 12; i++) {
        if (!(v & (1 << i))) continue;
        // プレートは厚みのない1まいの面。両面とも、明るいほうの向き + そのセルの光
        const pl = PLATES[i], h = pl.half;
        const kt = h[0] < 0.1 ? 0 : h[1] < 0.1 ? 1 : 2;
        const B = pl.axes[(kt + 1) % 3], C = pl.axes[(kt + 2) % 3], hb = h[(kt + 1) % 3], hc = h[(kt + 2) % 3];
        const k = pl.diag ? 1 : (0.5 - 0.004) / (0.5 - T / 2);
        const ctr = [x + pl.c[0] * k, y + pl.c[1] * k, z + pl.c[2] * k];
        const corner = (sb, sc) => [ctr[0] + B[0] * hb * sb + C[0] * hc * sc, ctr[1] + B[1] * hb * sb + C[1] * hc * sc, ctr[2] + B[2] * hb * sb + C[2] * hc * sc];
        const c = Math.max(shade(pl.n), shade(pl.n.map((q) => -q))) * LIGHT_F[plateLight(x, y, z)], base = pos.length / 3;
        for (const q of [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)]) { pos.push(q[0], q[1], q[2]); col.push(c, c, c); }
        idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
    }
  }
  return { pos: new Float32Array(pos), col: new Float32Array(col), idx: pos.length / 3 > 65535 ? new Uint32Array(idx) : new Uint16Array(idx) };
}
