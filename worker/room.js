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
    this.chatSeq = 0;
    ctx.blockConcurrencyWhile(async () => {
      // チャットの記録は、消さずにすべて残す(通し番号の最後を読む)
      const last = await ctx.storage.list({ prefix: "m:", reverse: true, limit: 1 });
      for (const [k] of last) this.chatSeq = parseInt(k.slice(2), 10) || 0;
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
    else if (m.op === "p+") { const i = m.i | 0; if (i < 0 || i > 11 || (cur & BLOCK) || (cur & (1 << i))) return;
      if (i >= 6 && (cur & 0xfc0)) return this.send(ws, { t: "deny", why: "斜めのプレートは、1つの座標に1つまでです" });
      v = cur | (1 << i); }
    else if (m.op === "p-") { const i = m.i | 0; if (i < 0 || i > 11 || (cur & BLOCK) || !(cur & (1 << i))) return; v = cur & ~(1 << i); }
    else return;
    this.setCell(x, y, z, v);
    this.broadcast({ t: "edit", x, y, z, v });
  }

  // /clone x1 y1 z1 x2 y2 z2 dx dy dz: 始点と終点で囲んだ構造を、(dx,dy,dz) を始点にして、コピーする(管理者だけ)
  handleClone(ws, a, m) {
    if (!a.admin) return this.send(ws, { t: "deny", why: "権限がありません(管理者だけが使えるコマンドです)" });
    const now = Date.now();
    if (now - (a.fillAt || 0) < 400) return this.send(ws, { t: "deny", why: "コマンドが続けて送られました。少し待ってください" });
    a.fillAt = now; ws.serializeAttachment(a);
    const v = ["x1", "y1", "z1", "x2", "y2", "z2", "dx", "dy", "dz"].map((k) => Math.floor(Number(m[k])));
    if (!v.every(Number.isFinite)) return;
    const x1 = Math.min(v[0], v[3]), x2 = Math.max(v[0], v[3]), y1 = Math.min(v[1], v[4]), y2 = Math.max(v[1], v[4]), z1 = Math.min(v[2], v[5]), z2 = Math.max(v[2], v[5]);
    const [dx, dy, dz] = [v[6], v[7], v[8]], sx = x2 - x1, sy = y2 - y1, sz = z2 - z1;
    const inW = (x, y, z) => x >= 0 && x < N && z >= 0 && z < N && inRangeY(y);
    if (!inW(x1, y1, z1) || !inW(x2, y2, z2) || !inW(dx, dy, dz) || !inW(dx + sx, dy + sy, dz + sz)) return this.send(ws, { t: "deny", why: "世界の外です(コピー元・貼りつけ先は、世界の中におさめてください)" });
    const vol = (sx + 1) * (sy + 1) * (sz + 1);
    if (vol > 32768) return this.send(ws, { t: "deny", why: "広すぎます(最大32768ブロック。今回は" + vol + ")" });
    const snap = [];   // 重なっていてもこわれないよう、先に全部読む
    for (let x = 0; x <= sx; x++) for (let y = 0; y <= sy; y++) for (let z = 0; z <= sz; z++) snap.push(this.cellValue(x1 + x, y1 + y, z1 + z));
    let i = 0;
    for (let x = 0; x <= sx; x++) for (let y = 0; y <= sy; y++) for (let z = 0; z <= sz; z++) { const val = snap[i++]; if (this.cellValue(dx + x, dy + y, dz + z) !== val) this.setCell(dx + x, dy + y, dz + z, val); }
    this.broadcast({ t: "clone", x1, y1, z1, x2, y2, z2, dx, dy, dz, n: vol, by: a.name });
  }

  // 過去のチャットを、新しい順に300件(before より前)。古い順にならべて返す
  async chatPage(before) {
    const opt = { prefix: "m:", reverse: true, limit: 301 };
    if (Number.isFinite(before) && before > 0) opt.end = "m:" + String(before).padStart(10, "0");
    const got = await this.ctx.storage.list(opt), items = [];
    for (const [, v] of got) items.push(v);
    const more = items.length > 300;
    if (more) items.pop();
    return { items: items.reverse(), more };
  }

  // /fill x1 y1 z1 x2 y2 z2 block|air: 直方体の中を、すべてブロック(または空気)にする(管理者だけ)
  handleFill(ws, a, m) {
    if (!a.admin) return this.send(ws, { t: "deny", why: "権限がありません(管理者だけが使えるコマンドです)" });
    const now = Date.now();
    if (now - (a.fillAt || 0) < 400) return this.send(ws, { t: "deny", why: "コマンドが続けて送られました。少し待ってください" });
    a.fillAt = now; ws.serializeAttachment(a);
    const v = ["x1", "y1", "z1", "x2", "y2", "z2"].map((k) => Math.floor(Number(m[k])));
    if (!v.every(Number.isFinite)) return;
    const [x1, x2] = [Math.min(v[0], v[3]), Math.max(v[0], v[3])], [y1, y2] = [Math.min(v[1], v[4]), Math.max(v[1], v[4])], [z1, z2] = [Math.min(v[2], v[5]), Math.max(v[2], v[5])];
    if (x1 < 0 || x2 >= N || z1 < 0 || z2 >= N || !inRangeY(y1) || !inRangeY(y2)) return this.send(ws, { t: "deny", why: "世界の外です(x,zは0〜" + (N - 1) + "、yは" + YMIN + "〜" + (YMIN + YN - 1) + ")" });
    const val = m.m === "air" ? 0 : BLOCK;   // air=空気(ブロックもプレートも消す) / block=ブロック
    const vol = (x2 - x1 + 1) * (y2 - y1 + 1) * (z2 - z1 + 1);
    if (vol > 32768) return this.send(ws, { t: "deny", why: "広すぎます(最大32768ブロック。今回は" + vol + ")" });
    for (let x = x1; x <= x2; x++) for (let y = y1; y <= y2; y++) for (let z = z1; z <= z2; z++) if (this.cellValue(x, y, z) !== val) this.setCell(x, y, z, val);
    this.broadcast({ t: "fill", x1, y1, z1, x2, y2, z2, n: vol, v: val, by: a.name });
  }

  // なぐった/矢が当たった: 近さと間隔を確かめて、ダメージ1。当たった人にはノックバックの向きも送る
  handleHit(ws, a, m) {
    const kind = m.k === "arrow" ? "arrow" : "melee";
    const now = Date.now();
    if (now - (a.hitAt || 0) < (kind === "arrow" ? 150 : 350)) return;
    const target = this.players().find((p) => p.a.id === m.id);
    if (!target || target.a.id === a.id) return;
    const T = target.a;
    const dx = wrapDelta(a.x, T.x, N), dy = wrapDelta(a.y, T.y, YN), dz = wrapDelta(a.z, T.z, N);
    if (Math.hypot(dx, dy, dz) > (kind === "arrow" ? 90 : 5.5)) return;
    a.hitAt = now; ws.serializeAttachment(a);
    // 体力は3秒に1つ、もどる(ここで数え直す)
    const base = Math.min(20, (T.hp ?? 20) + Math.floor((now - (T.hpAt || now)) / 3000));
    const left = base - 1, dead = left <= 0;
    T.hp = dead ? 20 : left; T.hpAt = now;
    target.ws.serializeAttachment(T);
    this.broadcast({ t: "hit", id: T.id });
    this.send(target.ws, { t: "hurt", hp: T.hp, dead, kx: r2(dx), kz: r2(dz), by: a.name });
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
      const me = { id: crypto.randomUUID().slice(0, 8), uid: user.uid, name: cleanName(user.name), admin: !!user.admin, ...pose(m), at: 0, hp: 20, hpAt: Date.now() };
      ws.serializeAttachment(me);
      const edits = [];
      for (const [k, v] of this.edits) { const [ex, ey, ez] = k.split(",").map(Number); edits.push([ex, ey, ez, v]); }
      const recent = await this.chatPage(null);
      this.send(ws, { t: "welcome", chat: recent.items, chatMore: recent.more, id: me.id, name: me.name, admin: me.admin, version: VERSION, max: MAX_PLAYERS, players: list.map((p) => pub(p.a)), edits });
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
    } else if (m.t === "chat") {
      // チャット: 全員に(自分にも)届ける。長さと間隔を制限する
      const now = Date.now();
      if (now - (a.chatAt || 0) < 400) return;
      const text = String(m.text ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 120);
      if (!text) return;
      a.chatAt = now; ws.serializeAttachment(a);
      const seq = ++this.chatSeq, rec = { seq, name: a.name, text, at: now };
      this.ctx.storage.put("m:" + String(seq).padStart(10, "0"), rec);   // 保存(消さない)
      this.broadcast({ t: "chat", id: a.id, ...rec });
    } else if (m.t === "histmore") {
      const now = Date.now();
      if (now - (a.histAt || 0) < 300) return;
      a.histAt = now; ws.serializeAttachment(a);
      const pg = await this.chatPage(Math.floor(Number(m.before)));
      this.send(ws, { t: "histmore", items: pg.items, more: pg.more });
    } else if (m.t === "clone") {
      this.handleClone(ws, a, m);
    } else if (m.t === "fill") {
      this.handleFill(ws, a, m);
    } else if (m.t === "swing") {
      // 手をふった: ほかの全員に知らせる(見た目だけ)
      const now = Date.now();
      if (now - (a.swAt || 0) < 120) return;
      a.swAt = now; ws.serializeAttachment(a);
      this.broadcast({ t: "swing", id: a.id }, ws);
    } else if (m.t === "hit") {
      this.handleHit(ws, a, m);
    } else if (m.t === "shoot") {
      // 矢を撃った: 近くから、ふつうの速さで撃ったものだけ、ほかの全員に知らせる(飛び方は各画面で同じ計算)
      const now = Date.now();
      if (now - (a.shotAt || 0) < 250) return;
      const v = ["x", "y", "z", "vx", "vy", "vz"].map((k) => Number(m[k]));
      if (!v.every(Number.isFinite)) return;
      const sp = Math.hypot(v[3], v[4], v[5]);
      if (sp < 0.2 || sp > 3.2) return;   // 1tickあたり、最大3ブロック(マイクラと同じ)
      if (Math.hypot(wrapDelta(a.x, v[0], N), wrapDelta(a.y, v[1], YN), wrapDelta(a.z, v[2], N)) > 6) return;
      a.shotAt = now; ws.serializeAttachment(a);
      this.broadcast({ t: "arrow", id: a.id, x: v[0], y: v[1], z: v[2], vx: v[3], vy: v[4], vz: v[5] }, ws);
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
