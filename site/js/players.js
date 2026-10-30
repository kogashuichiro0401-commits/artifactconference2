// ほかのプレイヤーの表示(箱型の体・名札・歩く動き)。
const SHIRTS = ["#3f7fd0", "#d04f4f", "#4fb06a", "#d0a43f", "#8a5fd0", "#d06fa8", "#3fb0b0", "#e07a3f"];
const SKIN = "#c69c6d", PANTS = "#3b3f8c", EYE = "#2a1d12";
const SHADE = [0.6, 0.6, 1.0, 0.5, 0.8, 0.8];   // BoxGeometry の面の順: +x -x +y -y +z -z

function lerpAngle(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  else if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export class RemotePlayers {
  constructor(THREE, scene) {
    this.T = THREE;
    this.scene = scene;
    this.map = new Map();
    this.mat = new THREE.MeshBasicMaterial({ vertexColors: true });
  }

  // 面ごとに明るさを変えた箱(世界のブロックと同じ見え方)。dy だけ上にずらして作る
  box(w, h, d, hex, dy = 0) {
    const T = this.T;
    const g = new T.BoxGeometry(w, h, d);
    if (dy) g.translate(0, dy, 0);
    const c = new T.Color(hex), col = [];
    for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) col.push(c.r * SHADE[f], c.g * SHADE[f], c.b * SHADE[f]);
    g.setAttribute("color", new T.BufferAttribute(new Float32Array(col), 3));
    return new T.Mesh(g, this.mat);
  }

  // 名札(文字を絵にして、いつもこちらを向く板に貼る)
  makeTag(name) {
    const T = this.T;
    const cv = document.createElement("canvas");
    const ctx = cv.getContext("2d");
    const font = "22px DotGothic16, system-ui, sans-serif";
    ctx.font = font;
    cv.width = Math.ceil(ctx.measureText(name).width) + 16;
    cv.height = 32;
    ctx.font = font;
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.fillStyle = "#fff";
    ctx.textBaseline = "middle";
    ctx.fillText(name, 8, 17);
    const tex = new T.CanvasTexture(cv);
    tex.minFilter = T.LinearFilter;
    tex.generateMipmaps = false;
    const sp = new T.Sprite(new T.SpriteMaterial({ map: tex, transparent: true, depthTest: false, fog: false }));
    sp.scale.set((cv.width / 32) * 0.3, 0.3, 1);
    sp.position.set(0, 2.15, 0);
    sp.renderOrder = 10;
    return sp;
  }

  disposeTag(tag) {
    tag.material.map.dispose();
    tag.material.dispose();
  }

  build(id) {
    const T = this.T;
    const shirt = SHIRTS[hashStr(id) % SHIRTS.length];
    const g = new T.Group();
    const legL = new T.Group(), legR = new T.Group(), armL = new T.Group(), armR = new T.Group(), head = new T.Group();
    legL.position.set(-0.1125, 0.675, 0); legL.add(this.box(0.225, 0.675, 0.225, PANTS, -0.3375));
    legR.position.set(0.1125, 0.675, 0); legR.add(this.box(0.225, 0.675, 0.225, PANTS, -0.3375));
    armL.position.set(-0.3375, 1.35, 0); armL.add(this.box(0.225, 0.675, 0.225, shirt, -0.3375));
    armR.position.set(0.3375, 1.35, 0); armR.add(this.box(0.225, 0.675, 0.225, shirt, -0.3375));
    head.position.set(0, 1.35, 0);
    head.add(this.box(0.45, 0.45, 0.45, SKIN, 0.225));
    for (const x of [-0.1, 0.1]) {   // 目(-z側が正面)
      const eye = this.box(0.07, 0.07, 0.02, EYE);
      eye.position.set(x, 0.25, -0.226);
      head.add(eye);
    }
    const body = this.box(0.45, 0.675, 0.225, shirt, 0.3375);
    body.position.set(0, 0.675, 0);
    g.add(legL, legR, body, armL, armR, head);
    return { g, legL, legR, armL, armR, head };
  }

  add(p) {
    if (!p || !p.id || this.map.has(p.id)) return;
    const m = this.build(p.id);
    const tag = this.makeTag(p.name || "ななし");
    m.g.add(tag);
    this.scene.add(m.g);
    const pose = { x: p.x, y: p.y, z: p.z, yaw: p.yaw || 0, pitch: p.pitch || 0 };
    this.map.set(p.id, {
      ...m, tag, name: p.name || "ななし",
      cur: { ...pose }, tgt: { ...pose }, speed: 0, phase: 0,
    });
    m.g.position.set(pose.x, pose.y, pose.z);
  }

  remove(id) {
    const e = this.map.get(id);
    if (!e) return;
    this.scene.remove(e.g);
    e.g.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    this.disposeTag(e.tag);
    this.map.delete(id);
  }

  clear() {
    for (const id of [...this.map.keys()]) this.remove(id);
  }

  setPos(m) {
    const e = this.map.get(m.id);
    if (!e) return;
    e.tgt = { x: m.x, y: m.y, z: m.z, yaw: m.yaw, pitch: m.pitch };
  }

  setName(id, name) {
    const e = this.map.get(id);
    if (!e || e.name === name) return;
    e.g.remove(e.tag);
    this.disposeTag(e.tag);
    e.tag = this.makeTag(name);
    e.g.add(e.tag);
    e.name = name;
  }

  count() { return this.map.size; }
  names() { return [...this.map.values()].map((e) => e.name); }

  // 目標の位置へなめらかに近づける。歩く速さに合わせて、手足をふる
  update(dt) {
    if (dt <= 0) return;
    const k = 1 - Math.exp(-dt * 14);
    for (const e of this.map.values()) {
      const c = e.cur, t = e.tgt;
      const ox = c.x, oz = c.z;
      c.x += (t.x - c.x) * k;
      c.y += (t.y - c.y) * k;
      c.z += (t.z - c.z) * k;
      c.yaw = lerpAngle(c.yaw, t.yaw, k);
      c.pitch += (t.pitch - c.pitch) * k;
      const sp = Math.hypot(c.x - ox, c.z - oz) / dt;
      e.speed += (sp - e.speed) * 0.2;
      e.phase += e.speed * dt * 2.4;
      const amp = Math.min(1, e.speed / 4.3) * 0.9;
      const a = Math.sin(e.phase) * amp;
      e.legL.rotation.x = a; e.legR.rotation.x = -a;
      e.armL.rotation.x = -a; e.armR.rotation.x = a;
      e.head.rotation.x = c.pitch;
      e.g.position.set(c.x, c.y, c.z);
      e.g.rotation.y = c.yaw;
    }
  }
}
