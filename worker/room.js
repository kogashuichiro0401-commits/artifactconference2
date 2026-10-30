// ゲームの「部屋」。全員の接続を預かり、位置を配る。
// 各プレイヤーの情報は、接続(WebSocket)にくっつけて持つ(休止から起きても消えない)。
import { VERSION } from "../site/js/version.js";
import { SX, SY, SZ } from "../site/js/world.js";

const MAX_PLAYERS = 8;
const MIN_INTERVAL = 30;   // これより速く届いた位置は捨てる(ミリ秒)

const num = (v, lo, hi, d = 0) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
const r2 = (v) => Math.round(v * 100) / 100;

function cleanName(s) {
  const t = String(s ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 12);
  return t || "ななし";
}

// 届いた位置・向きを検査して、安全な値にそろえる(世界の外や、数でない値は直す)
function pose(m, base) {
  return {
    x: r2(num(m.x, 0, SX, base?.x ?? SX / 2)),
    y: r2(num(m.y, -5, SY + 60, base?.y ?? 12)),
    z: r2(num(m.z, 0, SZ, base?.z ?? SZ / 2)),
    yaw: r2(num(m.yaw, -1000, 1000, base?.yaw ?? 0)),
    pitch: r2(num(m.pitch, -1.6, 1.6, base?.pitch ?? 0)),
    fly: m.fly === true,
    sneak: m.sneak === true,
  };
}

const pub = (a) => ({ id: a.id, name: a.name, x: a.x, y: a.y, z: a.z, yaw: a.yaw, pitch: a.pitch, fly: a.fly, sneak: a.sneak });
const posMsg = (a) => ({ t: "pos", id: a.id, x: a.x, y: a.y, z: a.z, yaw: a.yaw, pitch: a.pitch, fly: a.fly, sneak: a.sneak });

export class Room {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    // "ping" には、部屋を起こさずに "pong" を返す(つなぎっぱなしを保つため)
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  async fetch(request) {
    if (request.headers.get("Upgrade") !== "websocket") return new Response("WebSocketでつないでください", { status: 426 });
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  // 参加済み(helloを送ってきた)プレイヤーの一覧
  players() {
    const out = [];
    for (const ws of this.ctx.getWebSockets()) {
      const a = ws.deserializeAttachment();
      if (a && a.id) out.push({ ws, a });
    }
    return out;
  }

  send(ws, obj) {
    try { ws.send(JSON.stringify(obj)); } catch (e) { /* 切れていたら何もしない */ }
  }

  broadcast(obj, except) {
    const s = JSON.stringify(obj);
    for (const { ws } of this.players()) {
      if (ws === except) continue;
      try { ws.send(s); } catch (e) { /* 切れていたら何もしない */ }
    }
  }

  async webSocketMessage(ws, message) {
    if (typeof message !== "string" || message.length > 500) return;
    let m;
    try { m = JSON.parse(message); } catch (e) { return; }
    if (!m || typeof m !== "object") return;
    const a = ws.deserializeAttachment();

    if (m.t === "hello") {
      if (a && a.id) return;   // 参加済み
      const list = this.players();
      if (list.length >= MAX_PLAYERS) {
        this.send(ws, { t: "full", max: MAX_PLAYERS });
        try { ws.close(1000, "full"); } catch (e) { /* すでに閉じている */ }
        return;
      }
      const me = { id: crypto.randomUUID().slice(0, 8), name: cleanName(m.name), ...pose(m), at: 0 };
      ws.serializeAttachment(me);
      this.send(ws, { t: "welcome", id: me.id, version: VERSION, max: MAX_PLAYERS, players: list.map((p) => pub(p.a)) });
      this.broadcast({ t: "join", p: pub(me) }, ws);
      return;
    }

    if (!a || !a.id) return;   // helloの前は、何も受けつけない

    if (m.t === "pos") {
      const now = Date.now();
      if (now - a.at < MIN_INTERVAL) return;
      Object.assign(a, pose(m, a), { at: now });
      ws.serializeAttachment(a);
      this.broadcast(posMsg(a), ws);
    } else if (m.t === "name") {
      a.name = cleanName(m.name);
      ws.serializeAttachment(a);
      this.broadcast({ t: "name", id: a.id, name: a.name });
    }
  }

  drop(ws) {
    const a = ws.deserializeAttachment();
    if (a && a.id) {
      try { ws.serializeAttachment({}); } catch (e) { /* すでに閉じている */ }   // 二重に「退出」を送らないため
      this.broadcast({ t: "leave", id: a.id }, ws);
    }
  }

  async webSocketClose(ws) {
    this.drop(ws);
    try { ws.close(1000, "bye"); } catch (e) { /* すでに閉じている */ }
  }

  async webSocketError(ws) {
    this.drop(ws);
  }
}
