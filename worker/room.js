// ゲームの「部屋」。全員の接続を預かり、位置を配る。
// 各プレイヤーの情報は、接続(WebSocket)にくっつけて持つ(休止から起きても消えない)。
import { VERSION } from "../site/js/version.js";
import { N, YMIN, YN, BLOCK, NAME_MAX, REACH, mod, defaultCell, inRangeY, keyOf, wrapDelta } from "../site/js/shared.js";
import { verifyToken } from "./site.js";

const MAX_PLAYERS = 8;
const MIN_INTERVAL = 30;   // これより速く届いた位置は捨てる(ミリ秒)

const num = (v, lo, hi, d = 0) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
const r2 = (v) => Math.round(v * 100) / 100;

function cleanName(s) {
  const t = String(s ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, NAME_MAX);
  return t || "ななし";
}

// 届いた位置・向きを検査して、安全な値にそろえる(世界の外や、数でない値は直す)
function pose(m, base) {
  return {
    x: r2(num(m.x, -1, N, base?.x ?? N / 2)),
    y: r2(num(m.y, YMIN - 1, YMIN + YN + 1, base?.y ?? 1.5)),
    z: r2(num(m.z, -1, N, base?.z ?? N / 2)),
    yaw: r2(num(m.yaw, -1000, 1000, base?.yaw ?? 0)),
    pitch: r2(num(m.pitch, -1.6, 1.6, base?.pitch ?? 0)),
    fly: m.fly === true,
    sneak: m.sneak === true,
    glide: m.glide === true,
  };
}

const pub = (a) => ({ id: a.id, name: a.name, x: a.x, y: a.y, z: a.z, yaw: a.yaw, pitch: a.pitch, fly: a.fly, sneak: a.sneak, glide: a.glide });
const posMsg = (a) => ({ t: "pos", id: a.id, x: a.x, y: a.y, z: a.z, yaw: a.yaw, pitch: a.pitch, fly: a.fly, sneak: a.sneak, glide: a.glide });

export class Room {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    // "ping" には、部屋を起こさずに "pong" を返す(つなぎっぱなしを保つため)
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
    // 建築の変更(はじめの世界との差)を、保存してあるものから読み込む
    this.edits = new Map();   // "x,y,z" → セルの値
    ctx.blockConcurrencyWhile(async () => {
      const all = await ctx.storage.list({ prefix: "e:" });
      for (const [k, v] of all) {
        const [ex, ey, ez] = k.slice(2).split(",").map(Number);
        if (!inRangeY(ey) || ex < 0 || ex >= N || ez < 0 || ez >= N) { ctx.storage.delete(k); continue; }   // 世界の範囲が変わる前の古い建築は捨てる
        this.edits.set(k.slice(2), v);
      }
    });
  }

  cellValue(x, y, z) {
    const k = keyOf(x, y, z);
    return this.edits.has(k) ? this.edits.get(k) : defaultCell(x, y, z);
  }

  setCell(x, y, z, v) {
    const k = keyOf(x, y, z);
    if (v === defaultCell(x, y, z)) { this.edits.delete(k); this.ctx.storage.delete("e:" + k); }
    else { this.edits.set(k, v); this.ctx.storage.put("e:" + k, v); }
  }

  // 建築・破壊の依頼を確かめて、よければ反映して全員に知らせる
  handleEdit(ws, a, m) {
    if (!a.admin) return this.send(ws, { t: "deny", why: "権限がありません(管理者だけが建築・破壊できます)" });
    const now = Date.now();
    if (now - (a.editAt || 0) < 40) return;
    a.editAt = now;
    ws.serializeAttachment(a);
    const x = Math.floor(Number(m.x)), y = Math.floor(Number(m.y)), z = Math.floor(Number(m.z));
    if (![x, y, z].every(Number.isFinite) || x < 0 || x >= N || z < 0 || z >= N || !inRangeY(y)) return;
    // 手の届く距離(世界のループを考える)
    const dx = wrapDelta(a.x, x, N), dz = wrapDelta(a.z, z, N), dy = wrapDelta(a.y + 1, y, YN);
    if (Math.hypot(dx, dy, dz) > REACH + 3) return;
    const cur = this.cellValue(x, y, z);
    let v = cur;
    if (m.op === "b+") { if (cur !== 0) return; v = BLOCK; }
    else if (m.op === "b-") { if (!(cur & BLOCK)) return; v = 0; }
    else if (m.op === "p+") { const i = m.i | 0; if (i < 0 || i > 11 || (cur & BLOCK) || (cur & (1 << i))) return; v = cur | (1 << i); }
    else if (m.op === "p-") { const i = m.i | 0; if (i < 0 || i > 11 || (cur & BLOCK) || !(cur & (1 << i))) return; v = cur & ~(1 << i); }
    else return;
    this.setCell(x, y, z, v);
    this.broadcast({ t: "edit", x, y, z, v });
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
    if (typeof message !== "string" || message.length > 600) return;
    let m;
    try { m = JSON.parse(message); } catch (e) { return; }
    if (!m || typeof m !== "object") return;
    const a = ws.deserializeAttachment();

    if (m.t === "hello") {
      if (a && (a.id || a.pending)) return;   // 参加済み、または確認中
      ws.serializeAttachment({ pending: true });
      const user = await verifyToken(this.env, m.token);   // artifact学会のログインを確認する
      if (!user) {
        this.send(ws, { t: "auth" });
        try { ws.close(1000, "auth"); } catch (e) { /* すでに閉じている */ }
        return;
      }
      // 同じ人が、別の画面でつないでいたら、古いほうを外す
      for (const o of this.players()) {
        if (o.a.uid === user.uid) {
          this.send(o.ws, { t: "kicked" });
          this.drop(o.ws);
          try { o.ws.close(1000, "kicked"); } catch (e) { /* すでに閉じている */ }
        }
      }
      const list = this.players();
      if (list.length >= MAX_PLAYERS) {
        this.send(ws, { t: "full", max: MAX_PLAYERS });
        try { ws.close(1000, "full"); } catch (e) { /* すでに閉じている */ }
        return;
      }
      const me = { id: crypto.randomUUID().slice(0, 8), uid: user.uid, name: cleanName(user.name), admin: !!user.admin, ...pose(m), at: 0 };
      ws.serializeAttachment(me);
      const edits = [];
      for (const [k, v] of this.edits) { const [ex, ey, ez] = k.split(",").map(Number); edits.push([ex, ey, ez, v]); }
      this.send(ws, { t: "welcome", id: me.id, name: me.name, admin: me.admin, version: VERSION, max: MAX_PLAYERS, players: list.map((p) => pub(p.a)), edits });
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
    } else if (m.t === "edit") {
      this.handleEdit(ws, a, m);
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
