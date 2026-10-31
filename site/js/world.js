// ブロックとプレートの世界(ブラウザ側)。保存・判定・光線・メッシュ作り。
import { N, YMIN, YN, BLOCK, mod, defaultCell, SUN } from "./shared.js";
import { PLATES, T } from "./plates.js";

const HW = 0.3;
export const CH = 16;   // メッシュの区画の大きさ(横)
// 面の向きによる明るさ(太陽がわ=白、反対がわ=すこしだけ暗い)
export function shade(n) {
  const d = (n[0] * SUN[0] + n[1] * SUN[1] + n[2] * SUN[2]) / SUN[1];
  return 0.84 + 0.16 * (Math.max(-1, Math.min(1, d)) * 0.5 + 0.5);
}
const SHADOW = 0.72;      // 影になった所の明るさ(かけ算)
const SHADOW_LEN = 16;    // 影をさがす距離(太陽に向かって)

// 点 o から太陽にむかう光が、ブロックやプレートにさえぎられるか(高速版: 配列を作らない)
const SX = SUN[0], SY = SUN[1], SZ = SUN[2];
const STX = SX > 0 ? 1 : -1, STY = SY > 0 ? 1 : -1, STZ = SZ > 0 ? 1 : -1;
const DX = Math.abs(1 / SX), DY = Math.abs(1 / SY), DZ = Math.abs(1 / SZ);
const _o = [0, 0, 0], _c = [0, 0, 0];
function occluded(world, ox, oy, oz) {
  let ix = Math.floor(ox + 0.5), iy = Math.floor(oy + 0.5), iz = Math.floor(oz + 0.5);
  let tx = ((STX > 0 ? ix + 0.5 : ix - 0.5) - ox) / SX, ty = ((STY > 0 ? iy + 0.5 : iy - 0.5) - oy) / SY, tz = ((STZ > 0 ? iz + 0.5 : iz - 0.5) - oz) / SZ;
  const cells = world.cells;
  for (let first = true, n = 0; ; first = false) {
    if (++n > 80) { if (n === 81) console.warn("occluded loop", ox, oy, oz, tx, ty, tz); return false; }
    const v = cells[((((iy - YMIN) % YN) + YN) % YN * N + (((iz % N) + N) % N)) * N + (((ix % N) + N) % N)];
    if (v) {
      if (v & BLOCK) { if (!first) return true; }
      else {
        _o[0] = ox; _o[1] = oy; _o[2] = oz; _c[0] = ix; _c[1] = iy; _c[2] = iz;
        for (let i = 0; i < 12; i++) if ((v & (1 << i)) && rayPlate(_o, SUN, _c, PLATES[i])) return true;
      }
    }
    if (tx < ty) { if (tx < tz) { if (tx > SHADOW_LEN) return false; tx += DX; ix += STX; } else { if (tz > SHADOW_LEN) return false; tz += DZ; iz += STZ; } }
    else if (ty < tz) { if (ty > SHADOW_LEN) return false; ty += DY; iy += STY; }
    else { if (tz > SHADOW_LEN) return false; tz += DZ; iz += STZ; }
  }
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
    // 影は、東(+x)とすこし北(-z)にのびる
    this.dirty.add(mod(cx + 1, nc) * nc + cz); this.dirty.add(cx * nc + mod(cz - 1, nc)); this.dirty.add(mod(cx + 1, nc) * nc + mod(cz - 1, nc));
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

const SUB = 4;   // 1まいの面を 4×4 に分けて、小さなマスごとに影を決める
export function buildChunk(world, cx, cz) {
  const pos = [], col = [], idx = [];
  // 四角形 p0..p3(つながった順)を分けて、マスごとに 明るさ × 影 をつける。sn=太陽にむいた法線、s=向きの明るさ
  const quad = (p, sn, s) => {
    const facing = sn[0] * SUN[0] + sn[1] * SUN[1] + sn[2] * SUN[2] > 0.02;
    const P = [0, 0, 0];
    const at = (u, v) => {
      const a = (1 - u) * (1 - v), b = u * (1 - v), c = u * v, d = (1 - u) * v;
      P[0] = p[0][0] * a + p[1][0] * b + p[2][0] * c + p[3][0] * d; P[1] = p[0][1] * a + p[1][1] * b + p[2][1] * c + p[3][1] * d; P[2] = p[0][2] * a + p[1][2] * b + p[2][2] * c + p[3][2] * d;
      return P;
    };
    // マスの中の5か所で、光がさえぎられるかを見て、割合でやわらかく暗くする
    const offs = [[0.5, 0.5], [0.2, 0.2], [0.8, 0.2], [0.2, 0.8], [0.8, 0.8]];
    const cs = [];
    let lo = 9, hi = -9;
    for (let j = 0; j < SUB; j++) for (let i = 0; i < SUB; i++) {
      let c = s;
      if (facing) {
        let hit = 0;
        for (const [a, b] of offs) {
          const P = at((i + a) / SUB, (j + b) / SUB);
          if (occluded(world, P[0] + sn[0] * 0.045, P[1] + sn[1] * 0.045, P[2] + sn[2] * 0.045)) hit++;
        }
        c = s * (1 - (1 - SHADOW) * (hit / offs.length));
      }
      cs.push(c); if (c < lo) lo = c; if (c > hi) hi = c;
    }
    const emit = (u0, v0, u1, v1, c) => {
      const base = pos.length / 3;
      for (const [u, v] of [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]) { const P = at(u, v); pos.push(P[0], P[1], P[2]); col.push(c, c, c); }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    };
    if (hi - lo < 0.004) { emit(0, 0, 1, 1, cs[0]); return; }   // 影がなければ1まい(三角形をふやさない)
    for (let j = 0; j < SUB; j++) for (let i = 0; i < SUB; i++) emit(i / SUB, j / SUB, (i + 1) / SUB, (j + 1) / SUB, cs[j * SUB + i]);
  };
  for (let x = cx * CH; x < cx * CH + CH; x++) for (let z = cz * CH; z < cz * CH + CH; z++) for (let y = YMIN; y < YMIN + YN; y++) {
    const v = world.get(x, y, z);
    if (!v) continue;
    if (v & BLOCK) {
      for (const f of FACES) {
        if (world.get(x + f.n[0], y + f.n[1], z + f.n[2]) & BLOCK) continue;
        quad(f.v.map((q) => [x + q[0], y + q[1], z + q[2]]), f.n, shade(f.n));
      }
    } else {
      for (let i = 0; i < 12; i++) {
        if (!(v & (1 << i))) continue;
        // プレートは厚みのない1まいの面。太陽がわの向きで明るさと影を決める(裏も同じ)
        const pl = PLATES[i], h = pl.half;
        const kt = h[0] < 0.1 ? 0 : h[1] < 0.1 ? 1 : 2;
        const B = pl.axes[(kt + 1) % 3], C = pl.axes[(kt + 2) % 3], hb = h[(kt + 1) % 3], hc = h[(kt + 2) % 3];
        const k = pl.diag ? 1 : (0.5 - 0.004) / (0.5 - T / 2);
        const ctr = [x + pl.c[0] * k, y + pl.c[1] * k, z + pl.c[2] * k];
        const corner = (sb, sc) => [ctr[0] + B[0] * hb * sb + C[0] * hc * sc, ctr[1] + B[1] * hb * sb + C[1] * hc * sc, ctr[2] + B[2] * hb * sb + C[2] * hc * sc];
        const toSun = pl.n[0] * SUN[0] + pl.n[1] * SUN[1] + pl.n[2] * SUN[2] >= 0;
        const sn = toSun ? pl.n : pl.n.map((q) => -q);
        quad([corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)], sn, Math.max(shade(pl.n), shade(pl.n.map((q) => -q))));
      }
    }
  }
  return { pos: new Float32Array(pos), col: new Float32Array(col), idx: pos.length / 3 > 65535 ? new Uint32Array(idx) : new Uint16Array(idx) };
}
