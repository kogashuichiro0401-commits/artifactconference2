// 世界にうかぶボタン。十字を合わせて左クリック(スマホはタップ)、または矢を当てると押せる。
// 形はサイトのボタンと同じ(丸い端)。押すと、台にしずみこむ(立体のボタン)。sticky のボタン(並べ替え)は、選ばれている間しずんだまま。
import { drawButtonFace, C } from "./sitecards.js";

const DEPTH = 0.36;     // ボタンの厚み(ブロック)
const OUT = 0.24;       // ふだん、台から出ている高さ
const IN = 0.03;        // しずんだときに、出ている高さ

// ボタンの形(角の丸み)。l / r: 左・右の角を丸くするか
function shapeOf(THREE, w, h, l, r) {
  const s = new THREE.Shape(), x0 = -w / 2, x1 = w / 2, y0 = -h / 2, y1 = h / 2, rr = Math.min(h / 2, w / 2);
  if (l) { s.moveTo(x0 + rr, y0); } else s.moveTo(x0, y0);
  if (r) { s.lineTo(x1 - rr, y0); s.absarc(x1 - rr, 0, rr, -Math.PI / 2, Math.PI / 2, false); } else { s.lineTo(x1, y0); s.lineTo(x1, y1); }
  if (l) { s.lineTo(x0 + rr, y1); s.absarc(x0 + rr, 0, rr, Math.PI / 2, Math.PI * 1.5, false); } else { s.lineTo(x0, y1); s.lineTo(x0, y0); }
  return s;
}
const SIDE = { surface: 0xd2d2d2, accent: 0x173b78, white: 0xdedede, dark: 0x2a2a2a, soft: 0xc3d0e6 };

export function createButtons(THREE) {
  const list = [];
  const ray = new THREE.Raycaster();
  const mats = new Map();
  const sideMat = (key) => { if (!mats.has(key)) mats.set(key, new THREE.MeshBasicMaterial({ color: SIDE[key] })); return mats.get(key); };

  // spec: { parent, x, y, z (台の面の中心。parentの座標), w, h (ブロック), face: {label,icon,style,pressed}, pxPerBlock, cssH, sticky, onPress }
  function add(spec) {
    const g = new THREE.Group();
    const cv = document.createElement("canvas");
    const ppb = spec.pxPerBlock || 64;
    cv.width = Math.max(8, Math.round(spec.w * ppb)); cv.height = Math.max(8, Math.round(spec.h * ppb));
    const tex = new THREE.CanvasTexture(cv); tex.generateMipmaps = false; tex.minFilter = THREE.LinearFilter; tex.anisotropy = 4;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(spec.w, spec.h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, fog: false }));
    face.position.z = DEPTH / 2 + 0.003;
    const st = (spec.face && spec.face.style) || "btn";
    const roundL = !/(^sort$|seg-r|sort-r)/.test(st), roundR = !/(^sort$|seg-l|sort-l)/.test(st);
    const geo = new THREE.ExtrudeGeometry(shapeOf(THREE, spec.w, spec.h, roundL, roundR), { depth: DEPTH, bevelEnabled: false, curveSegments: 10 });
    geo.translate(0, 0, -DEPTH / 2);
    const body = new THREE.Mesh(geo, sideMat("surface"));
    g.add(body, face);
    g.position.set(spec.x, spec.y, spec.z);
    if (spec.rotY) g.rotation.y = spec.rotY;
    spec.parent.add(g);
    const b = {
      g, face, body, tex, cv, spec, pressed: !!(spec.face && spec.face.pressed), anim: 0, z0: spec.z,
      draw() {
        const f = Object.assign({}, spec.face, { pressed: b.pressed });
        drawButtonFace(cv, f, cv.height / (spec.cssH || 44));
        body.material = sideMat(f.pressed ? "soft" : f.style === "primary" ? "accent" : f.style === "subscribe" ? "dark" : f.style === "go" ? "white" : "surface");
        tex.needsUpdate = true;
      },
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
  function press(b, how) {
    if (!b.spec.sticky) b.anim = 0.001;
    if (b.spec.onPress) b.spec.onPress(how);
  }
  function isShown(o) { for (let x = o; x; x = x.parent) if (!x.visible) return false; return true; }
  function meshes() { const out = []; for (const b of list) if (isShown(b.g)) out.push(b.body, b.face); return out; }
  function owner(m) { return list.find((b) => b.body === m || b.face === m); }

  // 台(角の丸い板)。並べ替えのボタンが、この上にしずみこむ(サイトの .seg と同じ形)
  function base(parent, x, y, z, w, h) {
    const geo = new THREE.ExtrudeGeometry(shapeOf(THREE, w, h, true, true), { depth: 0.12, bevelEnabled: false, curveSegments: 12 });
    geo.translate(0, 0, -0.12);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xc9c9c9 }));
    m.position.set(x, y, z); parent.add(m); return m;
  }
  return {
    add, press, base,
    pick(eye, dir, maxT) {
      ray.set(new THREE.Vector3(eye[0], eye[1], eye[2]), new THREE.Vector3(dir[0], dir[1], dir[2]));
      ray.near = 0; ray.far = maxT;
      const hit = ray.intersectObjects(meshes(), false)[0];
      return hit ? { b: owner(hit.object), t: hit.distance } : null;
    },
    segment(a, b2) {
      const d = [b2[0] - a[0], b2[1] - a[1], b2[2] - a[2]], len = Math.hypot(d[0], d[1], d[2]);
      if (len < 1e-6) return null;
      ray.set(new THREE.Vector3(a[0], a[1], a[2]), new THREE.Vector3(d[0] / len, d[1] / len, d[2] / len));
      ray.near = 0; ray.far = len;
      const hit = ray.intersectObjects(meshes(), false)[0];
      return hit ? { b: owner(hit.object), f: hit.distance / len } : null;
    },
    update(dt) {
      for (const b of list) {
        let target;
        if (b.spec.sticky) target = b.pressed ? IN : OUT;
        else if (b.anim > 0) { b.anim += dt / 0.32; const k = b.anim < 0.35 ? b.anim / 0.35 : Math.max(0, 1 - (b.anim - 0.35) / 0.65); target = OUT - (OUT - IN) * k; if (b.anim >= 1) b.anim = 0; }
        else target = OUT;
        b.cur += (target - b.cur) * (1 - Math.exp(-dt * 18));
        place(b);
      }
    },
    get list() { return list; },
  };
}
export { C };
