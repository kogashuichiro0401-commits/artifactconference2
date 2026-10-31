// 十字の先のブロック/プレートを黒い細い枠で囲む(プレビュー)。建築破壊モードでは、置いた場合の薄い表示も出す。
import { REACH, BLOCK, inRangeY } from "./shared.js";
import { PLATES, T } from "./plates.js";

export class BuildTool {
  constructor(THREE, scene, world) {
    this.T = THREE;
    this.world = world;
    this.plateMode = 0;   // 0=自動 1=面だけ 2=斜めだけ
    const unit = new THREE.BoxGeometry(1, 1, 1);
    const edges = new THREE.EdgesGeometry(unit);
    const mk = (color, opacity) => { const l = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity })); l.matrixAutoUpdate = false; l.visible = false; l.renderOrder = 5; scene.add(l); return l; };
    this.outline = mk(0x000000, 1);
    this.ghostLine = mk(0x2a4a7a, 0.8);
    this.ghost = new THREE.Mesh(unit, new THREE.MeshBasicMaterial({ color: 0x9cc3ff, transparent: true, opacity: 0.45, depthWrite: false }));
    this.ghost.matrixAutoUpdate = false; this.ghost.visible = false; this.ghost.renderOrder = 4;
    scene.add(this.ghost);
    this.target = null;   // いま十字が指しているもの
    this.place = null;    // 置くとしたら { x,y,z, kind:"block" } / { x,y,z, kind:"plate", i }
    this.m = new THREE.Matrix4();
  }

  setBoxMatrix(obj, center, axes, half, pad) {
    const a = axes.map((A, k) => new this.T.Vector3(A[0], A[1], A[2]).multiplyScalar(2 * half[k] + pad));
    this.m.makeBasis(a[0], a[1], a[2]);
    this.m.setPosition(center[0], center[1], center[2]);
    obj.matrix.copy(this.m);
    obj.matrixWorldNeedsUpdate = true;
  }

  cycleMode() { this.plateMode = (this.plateMode + 1) % 3; return ["自動", "面だけ", "斜めだけ"][this.plateMode]; }

  // eye: 目の位置、dir: 見ている向き、buildOn: 建築破壊モードか、held: 持っているもの("block"/"plate"/他)、body: 自分の体の箱(めりこみ防止)
  update(eye, dir, buildOn, held, body) {
    const w = this.world;
    this.target = w.raycast(eye, dir, REACH, false);
    this.place = null;
    // 枠
    const tg = this.target;
    if (tg) {
      if (tg.kind === "block") this.setBoxMatrix(this.outline, tg.cell, [[1, 0, 0], [0, 1, 0], [0, 0, 1]], [0.5, 0.5, 0.5], 0.006);
      else { const p = PLATES[tg.plate]; this.setBoxMatrix(this.outline, [tg.cell[0] + p.c[0], tg.cell[1] + p.c[1], tg.cell[2] + p.c[2]], p.axes, p.half.map((q) => (q < 0.1 ? 0 : q)), 0.006); }
      this.outline.visible = true;
    } else this.outline.visible = false;
    // 置いた場合
    this.ghost.visible = this.ghostLine.visible = false;
    if (!buildOn || (held !== "block" && held !== "plate")) return;
    const sup = w.raycast(eye, dir, REACH, true);   // ささえになるブロック
    if (!sup) return;
    const c = [sup.cell[0] + sup.face[0], sup.cell[1] + sup.face[1], sup.cell[2] + sup.face[2]];
    if (!inRangeY(c[1])) return;
    const cur = w.get(c[0], c[1], c[2]);
    if (cur & BLOCK) return;
    if (held === "block") {
      if (cur) return;   // プレートがあるセルには、ブロックは置けない
      if (body && overlaps(body, [c[0] - 0.5, c[1] - 0.5, c[2] - 0.5, c[0] + 0.5, c[1] + 0.5, c[2] + 0.5])) return;
      this.place = { x: c[0], y: c[1], z: c[2], kind: "block" };
      this.setBoxMatrix(this.ghost, c, [[1, 0, 0], [0, 1, 0], [0, 0, 1]], [0.5, 0.5, 0.5], 0);
      this.setBoxMatrix(this.ghostLine, c, [[1, 0, 0], [0, 1, 0], [0, 0, 1]], [0.5, 0.5, 0.5], 0.006);
    } else {
      const i = this.pickPlate(dir, sup, c, cur);
      if (i < 0) return;
      this.place = { x: c[0], y: c[1], z: c[2], kind: "plate", i };
      const p = PLATES[i], ctr = [c[0] + p.c[0], c[1] + p.c[1], c[2] + p.c[2]];
      this.setBoxMatrix(this.ghost, ctr, p.axes, p.half, 0);
      this.setBoxMatrix(this.ghostLine, ctr, p.axes, p.half.map((q) => (q < 0.1 ? 0 : q)), 0.006);
    }
    this.ghost.visible = this.ghostLine.visible = true;
  }

  // 目線に垂直な向き(法線が目線にいちばん近い)のプレートを選ぶ
  pickPlate(dir, sup, c, cur) {
    let best = -1, bs = -1;
    for (let i = 0; i < 12; i++) {
      if (this.plateMode === 1 && i >= 6) continue;
      if (this.plateMode === 2 && i < 6) continue;
      const n = PLATES[i].n;
      let sc = Math.abs(n[0] * dir[0] + n[1] * dir[1] + n[2] * dir[2]);
      if (i < 6 && (i & 1)) continue;          // 面は、± を後で決める(+側だけで比べる)
      if (i < 6) sc += 1e-6;                     // 同点なら面を優先
      if (sc > bs) { bs = sc; best = i; }
    }
    if (best < 0) return -1;
    if (best < 6) {
      const a = best >> 1;
      let s;
      if (sup.face[a] !== 0) s = -sup.face[a];            // ささえのブロックにふれている面
      else s = sup.point[a] - c[a] >= 0 ? 1 : -1;          // それ以外は、当たった点に近い側
      best = a * 2 + (s > 0 ? 0 : 1);
    }
    if (cur & (1 << best)) return -1;
    return best;
  }
}

function overlaps(a, b) {
  return a[3] > b[0] && a[0] < b[3] && a[4] > b[1] && a[1] < b[4] && a[5] > b[2] && a[2] < b[5];
}
