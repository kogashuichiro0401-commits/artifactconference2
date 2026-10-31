// サーバー(部屋)との通信。切れたら自動でつなぎ直す。
import { VERSION } from "./version.js";

export class Net {
  // h = { token(), pose(), onStatus(s), onReset(), onWelcome(m), onJoin(p), onLeave(id), onPos(m), onName(m), onFull(), onAuth(), onKicked(), onEdit(m), onDeny(m) }
  constructor(h) {
    this.h = h;
    this.ws = null;
    this.id = null;
    this.wanted = false;
    this.full = false;
    this.retry = 0;
    this.pingTimer = 0;
  }

  start() {
    this.wanted = true;
    this.open();
  }

  stop() {
    this.wanted = false;
    clearInterval(this.pingTimer);
    try { if (this.ws) this.ws.close(); } catch (e) { /* すでに閉じている */ }
  }

  ready() {
    return !!(this.ws && this.ws.readyState === 1 && this.id);
  }

  send(obj) {
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(obj));
  }

  sendEdit(op, x, y, z, i) {
    this.send({ t: "edit", op, x, y, z, i });
  }

  sendPos(p) {
    if (!this.ready()) return;
    this.send({ t: "pos", x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch, fly: p.fly, sneak: p.sneak, glide: p.glide });
  }

  open() {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    let ws;
    try {
      ws = new WebSocket(`${proto}://${location.host}/ws`);
    } catch (e) {
      this.h.onStatus("closed");
      return;
    }
    this.ws = ws;
    this.h.onStatus("connecting");

    ws.onopen = () => {
      this.retry = 0;
      const p = this.h.pose();
      ws.send(JSON.stringify({ t: "hello", token: this.h.token(), version: VERSION, x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch }));
      clearInterval(this.pingTimer);
      this.pingTimer = setInterval(() => { try { ws.send("ping"); } catch (e) { /* 切れていたら onclose で直す */ } }, 20000);
    };
    ws.onmessage = (ev) => {
      if (ev.data === "pong") return;
      let m;
      try { m = JSON.parse(ev.data); } catch (e) { return; }
      this.handle(m);
    };
    ws.onclose = () => {
      clearInterval(this.pingTimer);
      this.id = null;
      this.h.onReset();
      this.h.onStatus(this.full ? "full" : "closed");
      if (this.wanted && !this.full) {
        this.retry++;
        setTimeout(() => this.open(), Math.min(10000, 1000 * this.retry));   // 少しずつ間をあけて再接続
      }
    };
    ws.onerror = () => { /* 切れたら onclose に来る */ };
  }

  handle(m) {
    if (!m || typeof m !== "object") return;
    switch (m.t) {
      case "welcome": this.id = m.id; this.h.onWelcome(m); break;
      case "join": if (m.p && m.p.id !== this.id) this.h.onJoin(m.p); break;
      case "leave": this.h.onLeave(m.id); break;
      case "pos": if (m.id !== this.id) this.h.onPos(m); break;
      case "name": this.h.onName(m); break;
      case "edit": this.h.onEdit(m); break;
      case "deny": this.h.onDeny(m); break;
      case "auth": this.wanted = false; this.h.onAuth(); break;
      case "kicked": this.wanted = false; this.h.onKicked(); break;
      case "full": this.full = true; this.wanted = false; this.h.onFull(); break;
      default: break;
    }
  }
}
