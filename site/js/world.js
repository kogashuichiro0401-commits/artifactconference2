// ブロックとプレートの世界(ブラウザ側)。保存・判定・光線・メッシュ作り。
import { N, YMIN, YN, BLOCK, mod, defaultCell } from "./shared.js";
import { PLATES, T } from "./plates.js";

const HW = 0.3;
export const CH = 16;   // メッシュの区画の大きさ(横)
// ---- マイクラ式の明るさ ----
// 1. 面の向き: 上がいちばん明るく、横は少し暗く、下がいちばん暗い(ほかのブロックは関係ない)
export function shade(n) {
  return n[0] * n[0] * 0.74 + n[2] * n[2] * 0.86 + (n[1] > 0 ? n[1] * n[1] * 1.0 : n[1] * n[1] * 0.62);
}
// 2. 空の光: 上にさえぎるものがなければ15。そこから横・下へ、1ブロックごとに1ずつ弱まりながら広がる
// 3. ブロックの光: 光るもの(いまは無し)から、同じように広がる。 EMISSIVE[セルの値] = 明るさ(1〜15)
export const EMISSIVE = new Map();
// プレートが空の光をさえぎる強さ(上から下へ通るときだけ)。上をおおう板ほど強く、立てた板は通す
const PLATE_SKY = PLATES.map((p) => (p.diag ? Math.round(Math.abs(p.n[1]) * 3) : Math.abs(p.n[1]) > 0.5 ? 3 : 0));
const skyCost = (v) => { let c = 0; for (let i = 0; i < 12; i++) if ((v & (1 << i)) && PLATE_SKY[i] > c) c = PLATE_SKY[i]; return c; };
// 光のレベル(0〜15) → 明るさのかけ算。1段ごとに約0.9倍
const LIGHT_F = Array.from({ length: 16 }, (_, l) => Math.pow(0.9, 15 - l));
// 4. 角のかげ(AO): ブロックの角・くぼみの頂点を、すこし暗くする
const AO_STEP = 0.17;

export class World {
  constructor() {
    this.cells = new Uint16Array(N * YN * N);
    for (let y = YMIN; y < YMIN + YN; y++) for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) this.cells[this.idx(x, y, z)] = defaultCell(x, y, z);
    this.dirty = new Set();
    this.lightDirty = true;
    this.light = null;
  }
  idx(x, y, z) { return (mod(y - YMIN, YN) * N + mod(z, N)) * N + mod(x, N); }
  get(x, y, z) { return this.cells[this.idx(x, y, z)]; }
  set(x, y, z, v) {
    this.cells[this.idx(x, y, z)] = v;
    // 光は遠くまで広がるので、変更があったら、明るさを計算しなおして、全部の区画を作りなおす
    this.lightDirty = true;
    const nc = N / CH;
    for (let i = 0; i < nc * nc; i++) this.dirty.add(i);
  }

  // 光の計算(空の光 + ブロックの光)。light[idx] = 0〜15
  relight() {
    this.lightDirty = false;
    const cells = this.cells, light = this.light || (this.light = new Uint8Array(cells.length));
    light.fill(0);
    const buckets = Array.from({ length: 16 }, () => []);
    const cost = (v) => (v & BLOCK ? -1 : 1);   // 広がるときの弱まり方(-1=通れない)。プレートは横には通す
    // 空の光: 上から下へ。ブロックでさえぎられたら0、プレートを通ると弱まる
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
      let lv = 15;
      for (let y = YMIN + YN - 1; y >= YMIN; y--) {
        const i = this.idx(x, y, z), v = cells[i];
        if (v & BLOCK) lv = 0;
        else if (v) lv = Math.max(0, lv - skyCost(v));
        light[i] = lv;
      }
    }
    for (let i = 0; i < cells.length; i++) {
      const e = EMISSIVE.size ? EMISSIVE.get(cells[i]) : 0;
      if (e && e > light[i]) light[i] = e;
      if (light[i] > 0) buckets[light[i]].push(i);
    }
    // 広がり
    const NN = N * N;
    for (let lv = 15; lv >= 2; lv--) {
      const b = buckets[lv];
      for (let k = 0; k < b.length; k++) {
        const i = b[k];
        if (light[i] !== lv) continue;
        const xi = i % N, zi = ((i / N) | 0) % N, yi = (i / NN) | 0;
        for (let d = 0; d < 6; d++) {
          let nx = xi, nz = zi, ny = yi;
          if (d === 0) nx = xi === N - 1 ? 0 : xi + 1; else if (d === 1) nx = xi === 0 ? N - 1 : xi - 1;
          else if (d === 2) nz = zi === N - 1 ? 0 : zi + 1; else if (d === 3) nz = zi === 0 ? N - 1 : zi - 1;
          else if (d === 4) ny = yi === YN - 1 ? 0 : yi + 1; else ny = yi === 0 ? YN - 1 : yi - 1;
          const j = (ny * N + nz) * N + nx, c = cost(cells[j]);
          if (c < 0) continue;
          const nl = lv - c;
          if (nl > light[j]) { light[j] = nl; if (nl > 1) buckets[nl].push(j); }
        }
      }
    }
  }
  lightAt(x, y, z) { return this.light[this.idx(x, y, z)]; }

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
  if (world.lightDirty || !world.light) world.relight();
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
  for (let x = cx * CH; x < cx * CH + CH; x++) for (let z = cz * CH; z < cz * CH + CH; z++) for (let y = YMIN; y < YMIN + YN; y++) {
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
