// ゲームの「部屋」。全員の接続を預かり、位置を配る。
// 各プレイヤーの情報は、接続(WebSocket)にくっつけて持つ(休止から起きても消えない)。
import { VERSION } from "../site/js/version.js";
import { YMIN, YN, XZ_MAX, BLOCK, ROPE, NAME_MAX, REACH, SPAWN, defaultCell, inRangeY, inWorld, keyOf } from "../site/js/shared.js";
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
// リフトの状態 [向き(-1|1), 前に出た量(0〜3), 高さ]。休んでいるときは null
function liftOf(v) {
  if (!Array.isArray(v) || v.length !== 3 || (v[0] !== -1 && v[0] !== 1)) return null;
  const a = Number(v[1]), b = Number(v[2]);
  if (!Number.isFinite(a) || !Number.isFinite(b) || a < 0 || a > 3 || b < -1e5 || b > 10) return null;
  return [v[0], Math.round(a * 100) / 100, Math.round(b * 100) / 100];
}
function pose(m, base) {
  return {
    x: r2(num(m.x, -1e5, 1e5, base?.x ?? SPAWN.x)),
    y: r2(num(m.y, -1e5, 1e5, base?.y ?? SPAWN.y)),
    z: r2(num(m.z, -1e5, 1e5, base?.z ?? SPAWN.z)),
    yaw: r2(num(m.yaw, -1000, 1000, base?.yaw ?? 0)),
    pitch: r2(num(m.pitch, -1.6, 1.6, base?.pitch ?? 0)),
    fly: m.fly === true,
    sneak: m.sneak === true,
    glide: m.glide === true,
    lf: liftOf(m.lf),
  };
}

const pub = (a) => ({ id: a.id, name: a.name, x: a.x, y: a.y, z: a.z, yaw: a.yaw, pitch: a.pitch, fly: a.fly, sneak: a.sneak, glide: a.glide, lf: a.lf || null });
const posMsg = (a) => ({ t: "pos", id: a.id, x: a.x, y: a.y, z: a.z, yaw: a.yaw, pitch: a.pitch, fly: a.fly, sneak: a.sneak, glide: a.glide, lf: a.lf || null });

const SWEEP_MS = 15000;     // 切れた人がいないか、見はる間隔
const IDLE_MS = 60000;      // これだけ何も届かない人は、退出あつかい(画面からは20秒ごとに ping が届く)
const WORLD_VER = "void1";   // 世界の作りが変わったら、ここを変える(古い建築データが消える)

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
      // 世界の作りが変わったときは、古い建築データ(e:)をぜんぶ消す。チャットは消さない
      if ((await ctx.storage.get("worldv")) !== WORLD_VER) {
        const old = await ctx.storage.list({ prefix: "e:" });
        const keys = [...old.keys()];
        for (let i = 0; i < keys.length; i += 100) await ctx.storage.delete(keys.slice(i, i + 100));
        await ctx.storage.put("worldv", WORLD_VER);
      }
      const all = await ctx.storage.list({ prefix: "e:" });
      for (const [k, v] of all) {
        const [ex, ey, ez] = k.slice(2).split(",").map(Number);
        if (!inWorld(ex, ey, ez)) { ctx.storage.delete(k); continue; }   // 世界の範囲が変わる前の古い建築は捨てる
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
    if (![x, y, z].every(Number.isFinite) || !inWorld(x, y, z)) return;
    // 手の届く距離(世界のループを考える)
    const dx = x - a.x, dz = z - a.z, dy = y - (a.y + 1);
    if (Math.hypot(dx, dy, dz) > REACH + 3) return;
    const cur = this.cellValue(x, y, z);
    let v = cur;
    if (m.op === "b+") { if (cur !== 0) return; v = BLOCK; }
    else if (m.op === "r+") { if (cur !== 0) return; v = ROPE; }
    else if (m.op === "r-") { if (!(cur & ROPE)) return; v = 0; }
    else if (m.op === "b-") { if (!(cur & BLOCK)) return; v = 0; }
    else if (m.op === "p+") { const i = m.i | 0; if (i < 0 || i > 11 || (cur & BLOCK) || (cur & ROPE) || (cur & (1 << i))) return;
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
    const v = ["x1", "y1", "z1", "x2", "y2", "z2", "a1", "b1", "c1", "a2", "b2", "c2"].map((k) => Math.floor(Number(m[k])));
    if (!v.every(Number.isFinite)) return;
    const lo = (p, q) => Math.min(p, q), hi = (p, q) => Math.max(p, q);
    const x1 = lo(v[0], v[3]), x2 = hi(v[0], v[3]), y1 = lo(v[1], v[4]), y2 = hi(v[1], v[4]), z1 = lo(v[2], v[5]), z2 = hi(v[2], v[5]);
    const dx = lo(v[6], v[9]), dy = lo(v[7], v[10]), dz = lo(v[8], v[11]);   // 貼りつけ先は、小さいほうの角から
    const sx = x2 - x1, sy = y2 - y1, sz = z2 - z1;
    const tx = hi(v[6], v[9]) - dx, ty = hi(v[7], v[10]) - dy, tz = hi(v[8], v[11]) - dz;
    const inW = inWorld;
    if (!inW(x1, y1, z1) || !inW(x2, y2, z2) || !inW(dx, dy, dz) || !inW(dx + tx, dy + ty, dz + tz)) return this.send(ws, { t: "deny", why: "世界の外です(コピー元・貼りつけ先は、世界の中におさめてください)" });
    const vol = (sx + 1) * (sy + 1) * (sz + 1), vol2 = (tx + 1) * (ty + 1) * (tz + 1);
    if (vol !== vol2) return this.send(ws, { t: "deny", why: "体積がちがいます(コピー元 " + vol + "、貼りつけ先 " + vol2 + ")" });
    if (sx !== tx || sy !== ty || sz !== tz) return this.send(ws, { t: "deny", why: "形がちがいます(コピー元 " + (sx + 1) + "×" + (sy + 1) + "×" + (sz + 1) + "、貼りつけ先 " + (tx + 1) + "×" + (ty + 1) + "×" + (tz + 1) + ")" });
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
    if (!inWorld(x1, y1, z1) || !inWorld(x2, y2, z2)) return this.send(ws, { t: "deny", why: "世界の外です(yは" + YMIN + "〜" + (YMIN + YN - 1) + "、x・zは-" + XZ_MAX + "〜" + XZ_MAX + ")" });
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
    const dx = T.x - a.x, dy = T.y - a.y, dz = T.z - a.z;
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
      const me = { id: crypto.randomUUID().slice(0, 8), uid: user.uid, name: cleanName(user.name), admin: !!user.admin, ...pose(m), at: 0, joinedAt: Date.now(), hp: 20, hpAt: Date.now() };
      ws.serializeAttachment(me);
      const edits = [];
      for (const [k, v] of this.edits) { const [ex, ey, ez] = k.split(",").map(Number); edits.push([ex, ey, ez, v]); }
      const recent = await this.chatPage(null);
      const wins = []; if (this.wins) for (const p of list) { const mw = this.wins.get(p.a.id); if (mw) for (const w of mw.values()) wins.push({ id: p.a.id, w }); }
      this.send(ws, { t: "welcome", wins, chat: recent.items, chatMore: recent.more, id: me.id, name: me.name, admin: me.admin, version: VERSION, max: MAX_PLAYERS, players: list.map((p) => pub(p.a)), edits });
      this.broadcast({ t: "join", p: pub(me) }, ws);
      this.ctx.storage.setAlarm(Date.now() + SWEEP_MS);   // 見はり開始
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
    } else if (m.t === "win") {
      this.handleWin(ws, a, m);
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
      if (Math.hypot(v[0] - a.x, v[1] - a.y, v[2] - a.z) > 6) return;
      a.shotAt = now; ws.serializeAttachment(a);
      this.broadcast({ t: "arrow", id: a.id, x: v[0], y: v[1], z: v[2], vx: v[3], vy: v[4], vz: v[5] }, ws);
    }
  }

  // ウィンドウ(ほかの人にも見える)。開いた・動かした(open)/閉じた(close)を、みんなに知らせる
  handleWin(ws, a, m) {
    const now = Date.now();
    if (now - (a.winAt || 0) < 80) return;
    a.winAt = now; ws.serializeAttachment(a);
    if (!this.wins) this.wins = new Map();
    let mine = this.wins.get(a.id);
    if (!mine) { mine = new Map(); this.wins.set(a.id, mine); }
    const okId = (v) => typeof v === "string" && /^[a-z0-9]{1,12}$/.test(v);
    if (m.op === "close") {
      if (!okId(m.wid)) return;
      mine.delete(m.wid);
      this.broadcast({ t: "win", id: a.id, op: "close", wid: m.wid }, ws);
      return;
    }
    if (m.op !== "open" || !m.w || typeof m.w !== "object") return;
    const w = m.w, ps = w.pose || {};
    const KINDS = ["postMenu", "analytics", "share", "download", "channel", "tweet", "tweetMenu", "tweetAnalytics", "postForm", "tweetForm", "onSite"];
    const nums = (v, n, lim) => Array.isArray(v) && v.length === n && v.every((x) => typeof x === "number" && Number.isFinite(x) && Math.abs(x) <= lim);
    if (!okId(w.wid) || KINDS.indexOf(w.kind) < 0 || typeof w.arg !== "string" || w.arg.length > 120) return;
    if (!nums(ps.pos, 3, 1e5) || !nums(ps.quat, 4, 1.01) || !(typeof ps.s === "number" && ps.s > 0 && ps.s < 1)) return;
    const clean = { wid: w.wid, kind: w.kind, arg: w.arg, pose: { pos: ps.pos, quat: ps.quat, s: ps.s } };
    mine.delete(w.wid); mine.set(w.wid, clean);
    while (mine.size > 8) mine.delete(mine.keys().next().value);   // 1人8つまで
    this.broadcast({ t: "win", id: a.id, op: "open", w: clean }, ws);
  }

  drop(ws) {
    const a = ws.deserializeAttachment();
    if (a && a.id) {
      try { ws.serializeAttachment({}); } catch (e) { /* すでに閉じている */ }   // 二重に「退出」を送らないため
      if (this.wins) this.wins.delete(a.id);
      this.broadcast({ t: "leave", id: a.id, name: a.name }, ws);
    }
  }

  // 通信が切れたまま残った人(ログアウト・タブを閉じた・電波切れ)を、時間がたったら消す
  async alarm() {
    const now = Date.now();
    let alive = 0;
    for (const { ws, a } of this.players()) {
      let last = Math.max(a.joinedAt || 0, a.at || 0);
      try { const t = this.ctx.getWebSocketAutoResponseTimestamp(ws); if (t) last = Math.max(last, t.getTime()); } catch (e) { /* なければ無視 */ }
      if (now - last > IDLE_MS) {
        this.drop(ws);
        try { ws.close(1000, "timeout"); } catch (e) { /* すでに閉じている */ }
      } else alive++;
    }
    if (alive > 0) this.ctx.storage.setAlarm(now + SWEEP_MS);
  }

  async webSocketClose(ws) {
    this.drop(ws);
    try { ws.close(1000, "bye"); } catch (e) { /* すでに閉じている */ }
  }

  async webSocketError(ws) {
    this.drop(ws);
  }
}
