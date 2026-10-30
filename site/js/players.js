// プレイヤーの体(自分の三人称視点・ほかの人)。マイクラと同じ、箱でできた体。エリトラつき。
const SHIRTS = ["#3f7fd0", "#d04f4f", "#4fb06a", "#d0a43f", "#8a5fd0", "#d06fa8", "#3fb0b0", "#e07a3f"];
const PX = 1.8 / 32;

export function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
function lerpAngle(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2; else if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export function createAvatar(T, shirt) {
  const lam = (c) => new T.MeshLambertMaterial({ color: c });
  const part = (w, h, d, c, dy = 0) => { const m = new T.Mesh(new T.BoxGeometry(w * PX, h * PX, d * PX), lam(c)); m.position.y = dy * PX; return m; };
  const root = new T.Group();       // 足もと
  const model = new T.Group();      // 前が +z。回転はここ
  root.add(model);
  const upper = new T.Group(); upper.position.set(0, 12 * PX, 0); model.add(upper);
  const legR = new T.Group(), legL = new T.Group(), armR = new T.Group(), armL = new T.Group(), head = new T.Group();
  legR.position.set(-2 * PX, 12 * PX, 0); legR.add(part(4, 12, 4, "#3b3f8c", -6)); model.add(legR);
  legL.position.set(2 * PX, 12 * PX, 0); legL.add(part(4, 12, 4, "#3b3f8c", -6)); model.add(legL);
  const torso = part(8, 12, 4, shirt, 6); upper.add(torso);
  armR.position.set(-6 * PX, 10 * PX, 0); armR.add(part(4, 12, 4, shirt, -4)); upper.add(armR);
  armL.position.set(6 * PX, 10 * PX, 0); armL.add(part(4, 12, 4, shirt, -4)); upper.add(armL);
  head.position.set(0, 12 * PX, 0); head.add(part(8, 8, 8, "#c69c6d", 4)); upper.add(head);
  for (const x of [-2, 2]) { const e = part(1.6, 1.6, 0.5, "#2a1d12", 4.5); e.position.set(x * PX, 4.5 * PX, 4.2 * PX); head.add(e); }
  // エリトラ(背中にたたんである。ひらくと広がる)
  const wingMat = new T.MeshLambertMaterial({ color: 0x8c8aa0, side: T.DoubleSide });
  const mkWing = (side) => {
    const g = new T.Group(); g.position.set(side * 1.5 * PX, 10 * PX, -2.3 * PX);
    const m = new T.Mesh(new T.BoxGeometry(10 * PX, 16 * PX, 0.8 * PX), wingMat);
    m.position.set(side * 5 * PX, -7 * PX, 0); g.add(m); upper.add(g); return g;
  };
  const wingL = mkWing(1), wingR = mkWing(-1);
  const st = { phase: 0, amp: 0, wing: 0, t: 0, body: 0 };

  // s = { hs: 水平の速さ, bodyYaw, yaw, pitch, glide, fly, sneak, air }
  function pose(s, dt) {
    st.t += dt;
    st.phase += s.hs * dt * 1.9;
    const want = !s.air || s.fly ? Math.min(1, s.hs / 4.3) * (s.sprint ? 1.2 : 0.9) : 0.35;
    st.amp += ((s.air && !s.fly ? 0.35 : want) - st.amp) * (1 - Math.exp(-14 * dt));
    let sw = Math.sin(st.phase) * st.amp;
    const idle = Math.sin(st.t * 1.6) * 0.04;
    armR.rotation.x = -sw + idle; armL.rotation.x = sw - idle; armR.rotation.z = 0.04; armL.rotation.z = -0.04;
    if (s.swing > 0) armR.rotation.x -= Math.sin(s.swing * Math.PI) * 1.5;
    if (s.glide) { armR.rotation.x = 0; armL.rotation.x = s.rocket ? 3.0 : 0; sw = 0; }
    legR.rotation.x = sw; legL.rotation.x = -sw;
    st.wing += ((s.glide ? 1 : 0) - st.wing) * (1 - Math.exp(-8 * dt));
    const w = st.wing;
    wingL.scale.set(0.85 + 0.9 * w, 0.9 + 0.2 * w, 1); wingR.scale.copy(wingL.scale);
    wingL.rotation.z = -0.05 - 0.5 * w; wingR.rotation.z = -wingL.rotation.z;
    wingL.rotation.y = -0.35 * w; wingR.rotation.y = -wingL.rotation.y;
    upper.rotation.x = s.sneak ? 0.45 : s.fly && s.hs > 6 ? 0.35 : 0;
    upper.position.set(0, (s.sneak ? 11 : 12) * PX, s.sneak ? -1 * PX : 0);
    head.rotation.y = s.glide ? 0 : s.yaw - s.bodyYaw;
    head.rotation.x = s.glide ? 0 : -s.pitch;
    model.rotation.set(s.glide ? Math.PI / 2 - s.pitch : 0, s.bodyYaw + Math.PI, 0, "YXZ");
    model.position.set(0, 0, 0);
    if (s.glide) {
      const o = new T.Vector3(0, -0.9, 0).applyEuler(model.rotation);
      model.position.set(o.x, o.y + 0.9, o.z);
    }
  }
  return { root, model, pose };
}

export class RemotePlayers {
  constructor(THREE, scene) {
    this.T = THREE;
    this.scene = scene;
    this.map = new Map();
  }

  makeTag(name) {
    const T = this.T;
    const cv = document.createElement("canvas");
    const ctx = cv.getContext("2d");
    const font = "22px system-ui, 'Hiragino Sans', 'Yu Gothic UI', 'Noto Sans JP', sans-serif";
    ctx.font = font;
    cv.width = Math.ceil(ctx.measureText(name).width) + 20;
    cv.height = 34;
    ctx.font = font;
    ctx.fillStyle = "rgba(15,15,15,0.6)";
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(0, 0, cv.width, cv.height, 10) : ctx.rect(0, 0, cv.width, cv.height); ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.textBaseline = "middle";
    ctx.fillText(name, 10, 18);
    const tex = new T.CanvasTexture(cv);
    tex.minFilter = T.LinearFilter;
    tex.generateMipmaps = false;
    const sp = new T.Sprite(new T.SpriteMaterial({ map: tex, transparent: true, depthTest: false, fog: false }));
    sp.scale.set((cv.width / 34) * 0.32, 0.32, 1);
    sp.position.set(0, 2.2, 0);
    sp.renderOrder = 10;
    return sp;
  }
  disposeTag(tag) { tag.material.map.dispose(); tag.material.dispose(); }

  add(p) {
    if (!p || !p.id || this.map.has(p.id)) return;
    const av = createAvatar(this.T, SHIRTS[hashStr(p.id) % SHIRTS.length]);
    const tag = this.makeTag(p.name || "ななし");
    av.root.add(tag);
    this.scene.add(av.root);
    const pose = { x: p.x, y: p.y, z: p.z, yaw: p.yaw || 0, pitch: p.pitch || 0 };
    this.map.set(p.id, {
      av, tag, name: p.name || "ななし", cur: { ...pose }, tgt: { ...pose }, flags: { fly: !!p.fly, sneak: !!p.sneak, glide: !!p.glide },
      speed: 0, bodyYaw: pose.yaw,
    });
    av.root.position.set(pose.x, pose.y, pose.z);
  }

  remove(id) {
    const e = this.map.get(id);
    if (!e) return;
    this.scene.remove(e.av.root);
    e.av.root.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    this.disposeTag(e.tag);
    this.map.delete(id);
  }
  clear() { for (const id of [...this.map.keys()]) this.remove(id); }

  setPos(m) {
    const e = this.map.get(m.id);
    if (!e) return;
    e.tgt = { x: m.x, y: m.y, z: m.z, yaw: m.yaw, pitch: m.pitch };
    e.flags = { fly: !!m.fly, sneak: !!m.sneak, glide: !!m.glide };
  }
  setName(id, name) {
    const e = this.map.get(id);
    if (!e || e.name === name) return;
    e.av.root.remove(e.tag); this.disposeTag(e.tag); e.tag = this.makeTag(name); e.av.root.add(e.tag); e.name = name;
  }
  count() { return this.map.size; }
  names() { return [...this.map.values()].map((e) => e.name); }

  update(dt) {
    if (dt <= 0) return;
    const k = 1 - Math.exp(-dt * 14);
    for (const e of this.map.values()) {
      const c = e.cur, t = e.tgt, ox = c.x, oz = c.z;
      c.x += (t.x - c.x) * k; c.y += (t.y - c.y) * k; c.z += (t.z - c.z) * k;
      c.yaw = lerpAngle(c.yaw, t.yaw, k); c.pitch += (t.pitch - c.pitch) * k;
      const hs = Math.hypot(c.x - ox, c.z - oz) / dt;
      e.speed += (hs - e.speed) * 0.2;
      const f = e.flags, moving = e.speed > 0.3;
      const dy = Math.atan2(Math.sin(c.yaw - e.bodyYaw), Math.cos(c.yaw - e.bodyYaw));
      if (f.glide) e.bodyYaw = c.yaw;
      else if (moving) e.bodyYaw += dy * (1 - Math.exp(-12 * dt));
      else if (Math.abs(dy) > 0.9) e.bodyYaw = c.yaw - Math.sign(dy) * 0.9;
      e.av.pose({ hs: e.speed, bodyYaw: e.bodyYaw, yaw: c.yaw, pitch: c.pitch, glide: f.glide, fly: f.fly, sneak: f.sneak, air: f.fly || f.glide }, dt);
      e.av.root.position.set(c.x, c.y, c.z);
      e.tag.position.y = f.sneak ? 2.0 : 2.2;
    }
  }
}
