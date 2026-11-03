// 世界にうかぶボタン。十字を合わせて左クリック(スマホはタップ)、または矢を当てると押せる。
// 押すと、台にしずみこむ(立体のボタン)。sticky のボタン(並べ替え)は、選ばれている間しずんだまま。
import { drawButtonFace } from "./sitecards.js";

const DEPTH = 0.5;      // ボタンの厚み(ブロック)
const OUT = 0.32;       // ふだん、台から出ている高さ
const IN = 0.04;        // しずんだときに、出ている高さ

export function createButtons(THREE) {
  const list = [];
  const ray = new THREE.Raycaster();
  const sideMat = new THREE.MeshLambertMaterial({ color: 0xc9cbd1, emissive: 0x3a3c44 });

  // spec: { parent, x, y, z (台の面の中心。parentの座標), w, h (ブロック), face: {label,icon,style,pressed}, S (絵の倍率), pxPerBlock, sticky, onPress }
  function add(spec) {
    const g = new THREE.Group();
    const cv = document.createElement("canvas");
    const ppb = spec.pxPerBlock || 64;
    cv.width = Math.max(8, Math.round(spec.w * ppb)); cv.height = Math.max(8, Math.round(spec.h * ppb));
    const tex = new THREE.CanvasTexture(cv); tex.generateMipmaps = false; tex.minFilter = THREE.LinearFilter; tex.anisotropy = 4;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(spec.w, spec.h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, fog: false }));
    face.position.z = DEPTH / 2 + 0.002;
    // 側面(角の丸みは、面の絵で見せる)
    const body = new THREE.Mesh(new THREE.BoxGeometry(spec.w * 0.985, spec.h * 0.9, DEPTH), sideMat);
    g.add(body, face);
    g.position.set(spec.x, spec.y, spec.z);
    spec.parent.add(g);
    const b = {
      g, face, body, tex, cv, spec, pressed: !!(spec.face && spec.face.pressed), anim: 0,
      z0: spec.z, out: OUT,
      draw() { drawButtonFace(cv, Object.assign({}, spec.face, { pressed: b.pressed }), cv.height / (spec.cssH || 44)); tex.needsUpdate = true; },
      setPressed(on) { if (b.pressed === on) return; b.pressed = on; b.draw(); },
      dispose() { spec.parent.remove(g); face.geometry.dispose(); face.material.dispose(); tex.dispose(); body.geometry.dispose(); const i = list.indexOf(b); if (i >= 0) list.splice(i, 1); },
    };
    b.cur = spec.sticky && b.pressed ? IN : OUT;
    b.draw();
    place(b);
    list.push(b);
    return b;
  }
  function place(b) { b.g.position.z = b.z0 + b.cur - DEPTH / 2; }

  // 押す(しずむ動きと、はたらき)
  function press(b, how) {
    if (b.spec.sticky) { b.anim = 0; }
    else b.anim = 0.001;
    if (b.spec.onPress) b.spec.onPress(how);
  }
  function meshes() { return list.filter((b) => b.g.visible && isShown(b.g)).map((b) => b.body).concat(list.filter((b) => b.g.visible && isShown(b.g)).map((b) => b.face)); }
  function isShown(o) { for (let x = o; x; x = x.parent) if (!x.visible) return false; return true; }
  function owner(m) { return list.find((b) => b.body === m || b.face === m); }

  return {
    add,
    // 十字の先のボタン(いちばん近いもの)。{ b, t } か null
    pick(eye, dir, maxT) {
      ray.set(new THREE.Vector3(eye[0], eye[1], eye[2]), new THREE.Vector3(dir[0], dir[1], dir[2]));
      ray.near = 0; ray.far = maxT;
      const hit = ray.intersectObjects(meshes(), false)[0];
      return hit ? { b: owner(hit.object), t: hit.distance } : null;
    },
    // 線分 a→b にボタンがあるか(矢)。{ b, f(0〜1) } か null
    segment(a, b2) {
      const d = [b2[0] - a[0], b2[1] - a[1], b2[2] - a[2]], len = Math.hypot(d[0], d[1], d[2]);
      if (len < 1e-6) return null;
      ray.set(new THREE.Vector3(a[0], a[1], a[2]), new THREE.Vector3(d[0] / len, d[1] / len, d[2] / len));
      ray.near = 0; ray.far = len;
      const hit = ray.intersectObjects(meshes(), false)[0];
      return hit ? { b: owner(hit.object), f: hit.distance / len } : null;
    },
    press,
    update(dt) {
      for (const b of list) {
        let target;
        if (b.spec.sticky) target = b.pressed ? IN : OUT;
        else if (b.anim > 0) { b.anim += dt / 0.32; const k = b.anim < 0.35 ? b.anim / 0.35 : Math.max(0, 1 - (b.anim - 0.35) / 0.65); target = OUT - (OUT - IN) * k; if (b.anim >= 1) b.anim = 0; }
        else target = OUT;
        // 加減速(ばねのように近づく)
        b.cur += (target - b.cur) * (1 - Math.exp(-dt * 18));
        place(b);
      }
    },
    get list() { return list; },
  };
}
