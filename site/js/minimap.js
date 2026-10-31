// 左上の現在地(3D)。世界の立方体を小さな別の場面に作り、自分の位置・向きを、青い点と扇(円すい)で示す。
// 背景は塗らない(キャラの表示と同じく、うしろの景色が透ける)。地図の「右上」が北。
import { N, YMIN, YN } from "./shared.js";

export function createMinimap(T, el) {
  const scene = new T.Scene();
  const cx = N / 2 - 0.5, cy = YMIN + YN / 2 - 0.5, cz = N / 2 - 0.5, yb = YMIN - 0.5;
  const line = (geo, color, opacity) => new T.LineSegments(geo, new T.LineBasicMaterial({ color, transparent: true, opacity, depthTest: false }));
  // 立方体のふちと、床、16ブロックごとの区切り
  const box = line(new T.EdgesGeometry(new T.BoxGeometry(N, YN, N)), 0xcfe1ff, 0.95);
  box.position.set(cx, cy, cz); scene.add(box);
  const floor = new T.Mesh(new T.PlaneGeometry(N, N), new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3, side: T.DoubleSide, depthWrite: false }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(cx, yb, cz); scene.add(floor);
  const gv = [];
  for (let i = 1; i < N / 16; i++) { const k = -0.5 + i * 16; gv.push(k, yb, -0.5, k, yb, N - 0.5, -0.5, yb, k, N - 0.5, yb, k); }
  const gg = new T.BufferGeometry(); gg.setAttribute("position", new T.Float32BufferAttribute(gv, 3));
  scene.add(line(gg, 0xffffff, 0.5));
  // 自分: 白ふちの青い点、床までの線、床のかげ、向きの円すい
  const ring = new T.Mesh(new T.SphereGeometry(3.4, 16, 12), new T.MeshBasicMaterial({ color: 0xffffff, depthTest: false }));
  const dot = new T.Mesh(new T.SphereGeometry(2.5, 16, 12), new T.MeshBasicMaterial({ color: 0x4285f4, depthTest: false }));
  ring.renderOrder = 10; dot.renderOrder = 11;
  const drop = new T.Line(new T.BufferGeometry().setFromPoints([new T.Vector3(), new T.Vector3(0, -1, 0)]), new T.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthTest: false }));
  const shadow = new T.Mesh(new T.CircleGeometry(2.6, 20), new T.MeshBasicMaterial({ color: 0x4285f4, transparent: true, opacity: 0.55, depthTest: false }));
  shadow.rotation.x = -Math.PI / 2;
  // 向き: 画面(PCのモニター)に映っている範囲を、四角すいで示す。先が自分の目、ひろがる先が見えている範囲
  const L = 15, view = new T.Group(), pyr = new T.BufferGeometry();
  const fm = new T.MeshBasicMaterial({ color: 0x4285f4, transparent: true, opacity: 0.32, side: T.DoubleSide, depthWrite: false, depthTest: false });
  const fl = new T.LineBasicMaterial({ color: 0xbcd4ff, transparent: true, opacity: 0.95, depthTest: false });
  const fmesh = new T.Mesh(pyr, fm), fedge = new T.LineSegments(new T.BufferGeometry(), fl);
  fmesh.renderOrder = 9; fedge.renderOrder = 9;
  view.add(fmesh, fedge);
  let lastShape = "";
  const cone = view;
  scene.add(ring, dot, drop, shadow, view);
  // カメラ: 南東の上から北西をながめる(北が右上になる)
  const cam = new T.PerspectiveCamera(30, 1, 10, 600);
  const off = new T.Vector3(0.55, 0.78, 0.83).normalize().multiplyScalar(165);
  cam.position.set(cx + off.x, cy + off.y - 8, cz + off.z); cam.lookAt(cx, cy - 4, cz);
  const eu = new T.Euler(0, 0, 0, "YXZ");
  return {
    // p: 自分の状態、dir: 見ている向き(3成分)、renderer: 描画器
    render(p, fov, renderer) {
      const r = el.getBoundingClientRect();
      if (r.width < 2) return;
      ring.position.set(p.x, p.y + 1.6, p.z); dot.position.copy(ring.position); view.position.copy(ring.position);
      drop.position.copy(ring.position); drop.scale.set(1, ring.position.y - yb, 1);
      shadow.position.set(p.x, yb + 0.05, p.z);
      const asp = window.innerWidth / window.innerHeight, hh = L * Math.tan((fov * Math.PI) / 360), ww = hh * asp, key = hh.toFixed(2) + "," + ww.toFixed(2);
      if (key !== lastShape) {   // 画角(視野角・画面の縦横比)がかわったら、形を作りなおす
        lastShape = key;
        const c = [[-ww, -hh, -L], [ww, -hh, -L], [ww, hh, -L], [-ww, hh, -L]], o = [0, 0, 0], v = [];
        for (let i = 0; i < 4; i++) v.push(...o, ...c[i], ...c[(i + 1) % 4]);
        pyr.setAttribute("position", new T.Float32BufferAttribute(v, 3));
        const e = [];
        for (let i = 0; i < 4; i++) e.push(...o, ...c[i], ...c[i], ...c[(i + 1) % 4]);
        fedge.geometry.setAttribute("position", new T.Float32BufferAttribute(e, 3));
      }
      eu.set(p.pitch, p.yaw, 0); view.quaternion.setFromEuler(eu);
      const H = window.innerHeight;
      cam.aspect = r.width / r.height; cam.updateProjectionMatrix();
      renderer.setScissorTest(true);
      renderer.setViewport(r.left, H - r.bottom, r.width, r.height);
      renderer.setScissor(r.left, H - r.bottom, r.width, r.height);
      renderer.autoClear = false;
      renderer.clearDepth();   // 色は消さない
      renderer.render(scene, cam);
      renderer.autoClear = true;
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, window.innerWidth, H);
    },
  };
}
