// 矢。マイクラと同じ動き: 1tick(0.05秒)ごとに、位置 += 速度、速度 *= 0.99、速度のy -= 0.05。
// 何かにあたったら、そこに刺さって、しばらくしたら消える。(通信では「撃った」ことだけを送り、各画面で同じように飛ばす)
import { N, YMIN, YN, mod, wrapDelta } from "./shared.js";

const TICK = 0.05, DRAG = 0.99, GRAV = 0.05, STUCK_LIFE = 3.0, FLY_LIFE = 12;

export function createArrows(T, scene, world) {
  const shaftGeo = new T.BoxGeometry(0.035, 0.035, 0.8);
  const headGeo = new T.ConeGeometry(0.06, 0.16, 6); headGeo.rotateX(-Math.PI / 2); headGeo.translate(0, 0, -0.48);
  const fletchGeo = new T.BoxGeometry(0.13, 0.012, 0.16);
  const wood = new T.MeshLambertMaterial({ color: 0xb98a52 }), iron = new T.MeshLambertMaterial({ color: 0x8d9096 }), feather = new T.MeshLambertMaterial({ color: 0xf2f2f2, side: T.DoubleSide });
  const list = [];
  const _d = new T.Vector3(), _q = new T.Quaternion(), FWD = new T.Vector3(0, 0, -1);
  let acc = 0, viewer = { x: 0, y: 0, z: 0 };

  function make() {
    const g = new T.Group();
    g.add(new T.Mesh(shaftGeo, wood), new T.Mesh(headGeo, iron));
    const f1 = new T.Mesh(fletchGeo, feather); f1.position.z = 0.34; g.add(f1);
    const f2 = f1.clone(); f2.rotation.z = Math.PI / 2; g.add(f2);
    scene.add(g);
    return g;
  }

  return {
    setViewer(p) { viewer = p; },
    debug() { return list.map((a) => ({ p: a.p.map((v) => +v.toFixed(2)), stuck: a.stuck, life: +a.life.toFixed(1) })); },
    // 撃つ。pos: 位置、vel: 1tickあたりの速度(マイクラと同じ単位)
    shoot(pos, vel) {
      if (list.length > 60) { scene.remove(list[0].g); list.shift(); }
      list.push({ g: make(), p: [pos[0], pos[1], pos[2]], q: [pos[0], pos[1], pos[2]], v: [vel[0], vel[1], vel[2]], stuck: false, life: FLY_LIFE });
    },
    update(dt) {
      acc += dt;
      let ticks = 0;
      while (acc >= TICK && ticks < 6) {   // tickごとに進める
        acc -= TICK; ticks++;
        for (const a of list) {
          a.q = a.p.slice();
          if (a.stuck) continue;
          const len = Math.hypot(a.v[0], a.v[1], a.v[2]);
          const d = [a.v[0] / len, a.v[1] / len, a.v[2] / len];
          const hit = world.raycast(a.p, d, len, false);
          if (hit) {   // あたったところに刺さる
            a.p = hit.point.slice(); a.stuck = true; a.life = STUCK_LIFE; a.q = a.p.slice();
            continue;
          }
          a.p = [a.p[0] + a.v[0], a.p[1] + a.v[1], a.p[2] + a.v[2]];
          a.v = [a.v[0] * DRAG, a.v[1] * DRAG - GRAV, a.v[2] * DRAG];
          // 世界のはしを越えたら、反対がわへ
          for (let k = 0; k < 3; k++) {
            const lo = k === 1 ? YMIN - 0.5 : -0.5, n = k === 1 ? YN : N;
            if (a.p[k] >= lo + n) { a.p[k] -= n; a.q[k] -= n; } else if (a.p[k] < lo) { a.p[k] += n; a.q[k] += n; }
          }
        }
      }
      const f = Math.min(1, acc / TICK);
      for (let i = list.length - 1; i >= 0; i--) {
        const a = list[i];
        a.life -= dt;
        if (a.life <= 0) { scene.remove(a.g); list.splice(i, 1); continue; }
        // いま見ている人から見て、いちばん近い「ループのコピー」の位置に出す
        const x = a.q[0] + (a.p[0] - a.q[0]) * f, y = a.q[1] + (a.p[1] - a.q[1]) * f, z = a.q[2] + (a.p[2] - a.q[2]) * f;
        a.g.position.set(viewer.x + wrapDelta(viewer.x, x, N), viewer.y + wrapDelta(viewer.y, y, YN), viewer.z + wrapDelta(viewer.z, z, N));
        if (!a.stuck || !a.dirSet) {
          _d.set(a.v[0], a.v[1], a.v[2]);
          if (_d.lengthSq() > 1e-8) { _d.normalize(); a.g.quaternion.copy(_q.setFromUnitVectors(FWD, _d)); a.dirSet = a.stuck; }
        }
      }
    },
  };
}
