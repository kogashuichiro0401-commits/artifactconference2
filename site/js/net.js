// サーバー(部屋)との通信。切れたら自動でつなぎ直す。
import { VERSION } from "./version.js";

export class Net {
  // h = { pose(), onStatus(s), onReset(), onWelcome(m), onJoin(p), onLeave(id), onPos(m), onName(m), onFull() }
  constructor(h) {
    this.h = h;
    this.ws = null;
    this.id = null;
    this.name = "";
    this.wanted = false;
    this.full = false;
    this.retry = 0;
    this.pingTimer = 0;
  }

  start(name) {
    this.name = name;
    this.wanted = true;
    this.open();
  }

  ready() {
    return !!(this.ws && this.ws.readyState === 1 && this.id);
  }

  send(obj) {
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(obj));
  }

  setName(name) {
    this.name = name;
    this.send({ t: "name", name });
  }

  sendPos(p) {
    if (!this.ready()) return;
    this.send({ t: "pos", x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch, fly: p.fly, sneak: p.sneak });
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
      ws.send(JSON.stringify({ t: "hello", name: this.name, version: VERSION, x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch }));
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
      case "full": this.full = true; this.wanted = false; this.h.onFull(); break;
      default: break;
    }
  }
}
