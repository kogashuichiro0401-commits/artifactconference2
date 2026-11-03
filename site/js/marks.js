// 始点ブロック(緑)・終点ブロック(赤): /fill や /clone の範囲を、ブロックを置いて決めるための目印。
// 世界のブロックではなく、自分の画面だけにある目印。置いた座標を集めて、そろったらコマンドを実行する。
import { NX, NZ } from "./shared.js";

const GREEN = 0x2ecc40, RED = 0xe0302a;

export class Marks {
  constructor(THREE, scene) {
    this.T = THREE;
    this.scene = scene;
    this.unit = new THREE.BoxGeometry(1.02, 1.02, 1.02);
    this.edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.04, 1.04, 1.04));
    this.job = null;   // { kind:"fill"|"clone", mat, pts:[ {cell,obj}|null ... ] }
  }

  active() { return !!this.job; }

  start(kind, mat, need) {
    this.clear();
    this.job = { kind, mat, pts: new Array(need).fill(null) };
  }

  clear() {
    if (this.job) for (const p of this.job.pts) if (p) this.scene.remove(p.obj);
    this.job = null;
  }

  // 次に置く目印の番号(いちばん小さい空き)。偶数=始点(緑)、奇数=終点(赤)
  nextIndex() { return this.job ? this.job.pts.findIndex((p) => !p) : -1; }
  held() { const i = this.nextIndex(); return i < 0 ? null : (i % 2 === 0 ? "mark_s" : "mark_e"); }
  placedCount() { return this.job ? this.job.pts.filter(Boolean).length : 0; }

  occupied(cell) { return !!this.job && this.job.pts.some((p) => p && p.cell[0] === cell[0] && p.cell[1] === cell[1] && p.cell[2] === cell[2]); }

  // 置く。全部そろったら、座標の一覧を返す(そろわなければ null)
  place(cell) {
    const i = this.nextIndex();
    if (i < 0) return null;
    const T = this.T, col = i % 2 === 0 ? GREEN : RED;
    const obj = new T.Group();
    const m = new T.Mesh(this.unit, new T.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.4, depthWrite: false }));
    const l = new T.LineSegments(this.edges, new T.LineBasicMaterial({ color: col }));
    m.renderOrder = 6; l.renderOrder = 7;
    obj.add(m); obj.add(l);
    this.scene.add(obj);
    this.job.pts[i] = { cell, obj };
    if (this.nextIndex() >= 0) return null;
    return this.job.pts.flatMap((p) => p.cell);
  }

  remove(i) {
    const p = this.job && this.job.pts[i];
    if (!p) return;
    this.scene.remove(p.obj);
    this.job.pts[i] = null;
  }

  // 自分のいる所に近い側のコピーで表示する(世界はループしているため)
  near(cell, v) {
    return [cell[0] + NX * Math.round((v.x - cell[0]) / NX), cell[1], cell[2] + NZ * Math.round((v.z - cell[2]) / NZ)];
  }
  update(v) {
    if (!this.job) return;
    for (const p of this.job.pts) if (p) { const c = this.near(p.cell, v); p.obj.position.set(c[0], c[1], c[2]); }
  }

  // 目線(eye, dir)が、置いた目印に当たるか。いちばん近いもの { i, t }
  ray(eye, dir, maxT) {
    if (!this.job) return null;
    let best = null;
    this.job.pts.forEach((p, i) => {
      if (!p) return;
      const c = this.near(p.cell, { x: eye[0], y: eye[1], z: eye[2] });
      let t0 = 0, t1 = maxT;
      for (let k = 0; k < 3; k++) {
        const lo = c[k] - 0.5 - eye[k], hi = c[k] + 0.5 - eye[k];
        if (Math.abs(dir[k]) < 1e-9) { if (lo > 0 || hi < 0) return; continue; }
        let a = lo / dir[k], b = hi / dir[k];
        if (a > b) [a, b] = [b, a];
        t0 = Math.max(t0, a); t1 = Math.min(t1, b);
        if (t0 > t1) return;
      }
      if (!best || t0 < best.t) best = { i, t: t0 };
    });
    return best;
  }
}
