// 操作。「講義がちる。」のマイクラモードと同じ動きをそのまま移したもの。
//  歩く 4.32/ダッシュ 5.6/しゃがみ 1.31、ジャンプ 9・重力 32、飛行 10.9(ダッシュ 21)、
//  落下中にSpaceでエリトラ(1tick=0.05秒ごとの揚力・急降下で加速)、右クリックでロケット花火、
//  F5で視点切り替え、ホイールでズーム(視野角をせまく)、視点移動 0.0035/ズーム倍率。
import { N, YMIN, YN } from "./shared.js";

const HW = 0.3;               // 体の半分の幅
const VMAX = 40;              // エリトラの最高速度
const GAME = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "Space", "ShiftLeft", "ShiftRight", "F5", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);

export class Controls {
  constructor({ world, spawn, win, doc, say }) {
    this.world = world;
    this.spawn = spawn;
    this.say = say || (() => {});
    this.canFly = false;   // 空中浮遊は管理者だけ
    this.cfg = { ely: true, rks: true, rkt: 2, rka: 30 };   // エリトラ / ロケット(あり・時間・加速度)
    this.keys = {};
    this.locked = false;
    this.sens = 1;                 // 視点の感度(倍率)
    this.baseFov = 70;
    this.lastW = -1000; this.lastS = -1000; this.lastSp = -1000;
    this.sprintKey = "KeyW";
    this.gAcc = 0;
    this.kick = 0;
    this.rocketT = 1;              // ロケットを打ったあとの手の動き
    this.swingP = 0;               // 手をふる動き(0=していない、0〜1で進む)
    this.kbT = 0;                  // ノックバックで、ふき飛ばされている残り時間
    this.p = { zm: 1, zt: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, yaw: 0, pitch: 0, ground: false, glide: false, boost: 0, fly: false, sprint: false, sneak: false, view: 0, fov: 70, bodyYaw: 0, t: 0 };
    this.respawn();
    win.addEventListener("keydown", (e) => this.key(e, true));
    win.addEventListener("keyup", (e) => this.key(e, false));
    win.addEventListener("blur", () => this.release());
    doc.addEventListener("mousemove", (e) => this.mouse(e));
  }

  respawn() {
    const p = this.p, s = this.spawn;
    Object.assign(p, { x: s.x, y: s.y, z: s.z, vx: 0, vy: 0, vz: 0, yaw: s.yaw, pitch: s.pitch, ground: true, glide: false, boost: 0, fly: false, sprint: false, sneak: false, bodyYaw: s.yaw });
  }
  release() { this.keys = {}; this.p.sprint = false; this.p.sneak = false; }
  eyeH() { return this.p.sneak ? 1.27 : 1.62; }
  curH() { return this.p.sneak ? 1.5 : 1.8; }
  lookDir() { const p = this.p, cp = Math.cos(p.pitch); return [-Math.sin(p.yaw) * cp, Math.sin(p.pitch), -Math.cos(p.yaw) * cp]; }

  // 手をふる(なぐる・壊す・置くとき)
  swing() { this.swingP = 0.001; }
  // ふき飛ばされる(kx,kz は水平の向き。マイクラの近接攻撃と同じくらい)
  knock(kx, kz, power = 1) {
    const p = this.p, l = Math.hypot(kx, kz) || 1;
    p.vx = (kx / l) * 8 * power; p.vz = (kz / l) * 8 * power;
    if (!p.fly) { p.vy = Math.max(p.vy, 6.5 * power); p.ground = false; }
    this.kbT = 0.4;
  }

  fireRocket(e) {
    if (e) e.preventDefault();
    this.p.boost = this.cfg.rkt; this.rocketT = 0;
    this.say("ロケット花火！");
  }

  mouse(e) {
    if (!this.locked) return;
    const p = this.p, k = 0.0035 * this.sens / p.zm;
    p.yaw -= (e.movementX || 0) * k;
    p.pitch = Math.max(-1.5707, Math.min(1.5707, p.pitch - (e.movementY || 0) * k));
  }

  wheel(e) {
    const p = this.p;
    const dz = e.deltaY * (e.deltaMode === 1 ? 16 : 1) * (e.ctrlKey ? 0.012 : 0.004);
    p.zt = Math.max(1, Math.min(14, p.zt * Math.exp(-dz)));
    if (p.zt < 1.02) p.zt = 1;
  }

  key(e, down) {
    const code = e.code, p = this.p;
    if (!this.locked && down) return;
    if (GAME.has(code) && this.locked) e.preventDefault();
    if (code === "ShiftLeft" || code === "ShiftRight") {
      this.keys.Shift = down;
      if (down) { if (!p.fly) { p.sneak = true; p.sprint = false; } } else p.sneak = false;
      return;
    }
    if (e.repeat && down) return;
    if (down) {
      const now = performance.now();
      if (code === "KeyW") { if (now - this.lastW < 300) { p.sprint = !p.sneak; this.sprintKey = "KeyW"; } this.lastW = now; }
      if (code === "KeyS") { if (now - this.lastS < 300) { p.sprint = !p.sneak; this.sprintKey = "KeyS"; } this.lastS = now; }
      if (code === "Space") {
        if (now - this.lastSp < 300 && !this.canFly) { this.lastSp = -1000; this.say("飛行できるのは管理者だけです"); }
        else if (now - this.lastSp < 300) { p.fly = !p.fly; p.vy = 0; this.lastSp = -1000; p.glide = false; p.boost = 0; if (p.fly) p.sneak = false; }
        else {
          this.lastSp = now;
          if (p.glide) { p.glide = false; p.boost = 0; this.say("滑空を終えました(自由落下)"); }
          else if (this.cfg.ely && !p.fly && !p.ground && p.vy < -1) { p.glide = true; this.say("エリトラが開きました(ロケット花火を持って右クリック)"); }
        }
        this.kick = 1;
      }
      if (code === "F5") p.view = (p.view + 1) % 3;
      this.keys[code] = true;
    } else {
      this.keys[code] = false;
      if (code === this.sprintKey) p.sprint = false;
    }
  }

  hits(x, y, z, h) { return this.world.hits(x, y, z, h); }

  // マイクラのエリトラ(1秒に20回の計算): 揚力・急降下で加速・上向きで減速・向いた方へ勢いが曲がる
  glideTick(dt, v) {
    const p = this.p;
    this.gAcc += dt;
    while (this.gAcc >= 0.05) {
      this.gAcc -= 0.05;
      const L = this.lookDir();
      let vx = v[0] / 20, vy = v[1] / 20, vz = v[2] / 20;
      const hl = Math.hypot(L[0], L[2]), hv = Math.hypot(vx, vz), lift = hl * hl;
      let d;
      vy += -0.08 + lift * 0.06;
      if (vy < 0 && hl > 0) { d = vy * -0.1 * lift; vx += L[0] * d / hl; vy += d; vz += L[2] * d / hl; }
      if (p.pitch > 0 && hl > 0) { d = hv * Math.sin(p.pitch) * 0.04; vx -= L[0] * d / hl; vy += d * 3.2; vz -= L[2] * d / hl; }
      if (hl > 0) { vx += (L[0] / hl * hv - vx) * 0.1; vz += (L[2] / hl * hv - vz) * 0.1; }
      vx *= 0.99; vy *= 0.98; vz *= 0.99;
      if (p.boost > 0) {   // ロケット花火: 向いている方向に押される
        p.boost -= 0.05;
        const a = this.cfg.rka / 400;
        vx += L[0] * a; vy += L[1] * a; vz += L[2] * a;
        const sp2 = Math.hypot(vx, vy, vz) * 20;
        if (sp2 > VMAX) { const q = VMAX / sp2; vx *= q; vy *= q; vz *= q; }
      }
      v[0] = vx * 20; v[1] = vy * 20; v[2] = vz * 20;
    }
    p.vx = v[0]; p.vy = v[1]; p.vz = v[2];
  }

  // 横にぶつかったとき、0.6より低い段差(45度の斜面など)なら、のぼる
  stepUp(nx, nz, h) {
    const p = this.p;
    if (!p.ground || p.fly) return false;
    let yy = p.y;
    for (let k = 0; k < 4; k++) {
      const b = this.hits(nx, yy, nz, h);
      if (!b) break;
      yy = b[4] + 1e-4;
    }
    if (yy - p.y > 0.6 || this.hits(nx, yy, nz, h)) return false;
    p.x = nx; p.z = nz; p.y = yy;
    return true;
  }

  update(dt) {
    const p = this.p, keys = this.keys;
    if (this.rocketT < 1) this.rocketT = Math.min(1, this.rocketT + dt / 0.4);
    if (this.swingP > 0) { this.swingP += dt / 0.28; if (this.swingP >= 1) this.swingP = 0; }
    if (this.kbT > 0) this.kbT -= dt;
    if (p.glide && (p.fly || p.ground || !this.cfg.ely)) { p.glide = false; p.boost = 0; }
    const gv = p.glide ? [p.vx, p.vy, p.vz] : null;
    let f = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0), s = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
    const ln = Math.hypot(f, s);
    if (ln > 1) { f /= ln; s /= ln; }
    if (keys.ArrowLeft) p.yaw += 1.8 * dt;
    if (keys.ArrowRight) p.yaw -= 1.8 * dt;
    if (keys.ArrowUp) p.pitch = Math.min(1.5707, p.pitch + 1.5 * dt);
    if (keys.ArrowDown) p.pitch = Math.max(-1.5707, p.pitch - 1.5 * dt);
    if (!keys[this.sprintKey] || p.sneak) p.sprint = false;
    const sp = p.fly ? (p.sprint ? 21 : 10.9) : p.sneak ? 1.31 : p.sprint ? 5.6 : 4.32;
    const sy = Math.sin(p.yaw), cy = Math.cos(p.yaw);
    const tx = (-sy * f + cy * s) * sp, tz = (-cy * f - sy * s) * sp;
    const rate = this.kbT > 0 ? 1.2 : p.ground ? 16 : p.fly ? 6 : 4, k = 1 - Math.exp(-rate * dt);
    p.vx += (tx - p.vx) * k; p.vz += (tz - p.vz) * k;
    if (p.fly) {
      const ty = ((keys.Space ? 1 : 0) - (keys.Shift ? 1 : 0)) * 8;
      p.vy += (ty - p.vy) * (1 - Math.exp(-10 * dt));
    } else {
      p.vy = Math.max(-78, p.vy - 32 * dt);
      if (keys.Space && p.ground) { p.vy = 9; p.ground = false; }
    }
    if (gv) this.glideTick(dt, gv);
    const h = this.curH(), nx = p.x + p.vx * dt;
    if (!this.canFly && p.fly) p.fly = false;
    if (!this.hits(nx, p.y, p.z, h)) p.x = nx; else if (!this.stepUp(nx, p.z, h)) p.vx = 0;
    const nz = p.z + p.vz * dt;
    if (!this.hits(p.x, p.y, nz, h)) p.z = nz; else if (!this.stepUp(p.x, nz, h)) p.vz = 0;
    let ny = p.y + p.vy * dt;
    p.ground = false;
    const b = this.hits(p.x, ny, p.z, h);
    if (b) { if (p.vy < 0) { ny = b[4]; p.ground = true; } else ny = b[1] - h; p.vy = 0; }
    p.y = ny;
    // 世界はループ: はしを越えたら、反対がわから出る(上下も)
    if (p.x >= N - 0.5) p.x -= N; else if (p.x < -0.5) p.x += N;
    if (p.z >= N - 0.5) p.z -= N; else if (p.z < -0.5) p.z += N;
    if (p.y < YMIN - 0.5) p.y += YN; else if (p.y >= YMIN + YN - 0.5) p.y -= YN;
    if (p.glide && p.ground) { p.glide = false; p.boost = 0; }
    if (p.fly && p.ground && keys.Shift) p.fly = false;
    // 体の向き(三人称視点で見える)
    const hs = Math.hypot(p.vx, p.vz);
    const dy = Math.atan2(Math.sin(p.yaw - p.bodyYaw), Math.cos(p.yaw - p.bodyYaw));
    if (hs > 0.3) p.bodyYaw += dy * (1 - Math.exp(-12 * dt));
    else if (Math.abs(dy) > 0.9) p.bodyYaw = p.yaw - Math.sign(dy) * 0.9;
    if (p.glide) p.bodyYaw = p.yaw;
    p.t += dt;
    this.hs = hs;
  }

  // カメラを置く。視野角(ダッシュ・飛行・滑空で広がる)とズーム、視点(F5)
  camera(cam, dt) {
    const p = this.p, ex = p.x, ey = p.y + this.eyeH(), ez = p.z, d = this.lookDir();
    const tf = this.baseFov + (p.sprint ? 9 : 0) + (p.fly ? 3 : 0) + (p.glide ? Math.min(22, Math.hypot(p.vx, p.vy, p.vz) * 0.45) : 0);
    p.fov += (tf - p.fov) * (1 - Math.exp(-10 * dt));
    p.zm += (p.zt - p.zm) * (1 - Math.exp(-12 * dt));
    const ef = (2 * Math.atan(Math.tan((p.fov * Math.PI) / 360) / p.zm) * 180) / Math.PI;
    if (Math.abs(cam.fov - ef) > 0.005) { cam.fov = ef; cam.updateProjectionMatrix(); }
    if (this.kick > 0) this.kick = Math.max(0, this.kick - dt * 5);
    const ky = this.kick * 0.07;
    if (p.view === 0) { cam.position.set(ex, ey - ky, ez); cam.rotation.set(p.pitch, p.yaw, 0, "YXZ"); }
    else if (p.view === 1) { cam.position.set(ex - d[0] * 4, Math.max(0.2, ey - d[1] * 4), ez - d[2] * 4); cam.rotation.set(p.pitch, p.yaw, 0, "YXZ"); }
    else { cam.position.set(ex + d[0] * 4, Math.max(0.2, ey + d[1] * 4), ez + d[2] * 4); cam.rotation.set(-p.pitch, p.yaw + Math.PI, 0, "YXZ"); }
  }
}
