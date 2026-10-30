// キーボードとマウスによる操作と、プレイヤーの状態。
import { move } from "./physics.js";

const MOVE_CODES = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "Space", "ShiftLeft", "ShiftRight"]);

export class Controls {
  constructor(world, spawn, win, doc) {
    this.world = world;
    this.p = {
      x: spawn.x, y: spawn.y, z: spawn.z,
      vx: 0, vy: 0, vz: 0,
      yaw: 0, pitch: 0,
      onGround: false, fly: false, sprint: false, sneak: false,
    };
    this.keys = new Set();
    this.locked = false;        // マウスが「視点モード」になっているか
    this.sens = 0.0022;         // マウス感度
    this.eye = 1.62;            // 目の高さ
    this.lastSpace = -1000;   // 直前に押した時刻(ダブル押しの判定用)
    this.lastW = -1000;
    win.addEventListener("keydown", (e) => this.keydown(e));
    win.addEventListener("keyup", (e) => this.keyup(e));
    win.addEventListener("blur", () => this.release());
    doc.addEventListener("mousemove", (e) => this.mousemove(e));
  }

  release() {
    this.keys.clear();
    this.p.sprint = false;
  }

  keydown(e) {
    if (!this.locked) return;
    if (MOVE_CODES.has(e.code)) e.preventDefault();
    if (e.repeat) return;
    const now = performance.now();
    if (e.code === "Space") {
      if (now - this.lastSpace < 300) {   // ダブルSpace = 飛行の切り替え
        this.p.fly = !this.p.fly;
        this.p.vy = 0;
        this.lastSpace = -1000;
      } else {
        this.lastSpace = now;
      }
    }
    if (e.code === "KeyW") {
      if (now - this.lastW < 300) this.p.sprint = true;   // Wを2回 = ダッシュ
      this.lastW = now;
    }
    this.keys.add(e.code);
  }

  keyup(e) {
    this.keys.delete(e.code);
    if (e.code === "KeyW") this.p.sprint = false;
  }

  mousemove(e) {
    if (!this.locked) return;
    const p = this.p;
    p.yaw -= (e.movementX || 0) * this.sens;
    p.pitch -= (e.movementY || 0) * this.sens;
    const lim = (89 * Math.PI) / 180;
    p.pitch = Math.max(-lim, Math.min(lim, p.pitch));
  }

  update(dt) {
    const p = this.p, k = this.keys;
    const f = (k.has("KeyW") ? 1 : 0) - (k.has("KeyS") ? 1 : 0);
    const r = (k.has("KeyD") ? 1 : 0) - (k.has("KeyA") ? 1 : 0);
    p.sneak = k.has("ShiftLeft") || k.has("ShiftRight");
    if (f <= 0) p.sprint = false;

    const speed = p.fly ? (p.sprint ? 20 : 10) : p.sneak ? 1.3 : p.sprint ? 5.6 : 4.3;
    const len = Math.hypot(f, r) || 1;
    const sin = Math.sin(p.yaw), cos = Math.cos(p.yaw);
    const tx = ((-sin * f + cos * r) / len) * speed;
    const tz = ((-cos * f - sin * r) / len) * speed;
    const a = Math.min(1, dt * (p.fly || p.onGround ? 18 : 8));
    p.vx += (tx - p.vx) * a;
    p.vz += (tz - p.vz) * a;

    if (p.fly) {
      const t = ((k.has("Space") ? 1 : 0) - (p.sneak ? 1 : 0)) * 8;
      p.vy += (t - p.vy) * Math.min(1, dt * 12);
    } else {
      p.vy = Math.max(-60, p.vy - 32 * dt);
      if (k.has("Space") && p.onGround) { p.vy = 9; p.onGround = false; }   // 約1.27ブロックの高さ
    }

    move(this.world, p, dt);
    if (p.fly && p.onGround && p.sneak) p.fly = false;   // 飛行中に地面でShift = 飛行終了

    const eyeT = p.sneak && !p.fly ? 1.27 : 1.62;
    this.eye += (eyeT - this.eye) * Math.min(1, dt * 20);
  }
}
