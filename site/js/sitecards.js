// artifact学会。の見た目を、そのままキャンバスに描く(サイトの style.css・app.js の数値と同じ)。
// 大きさは、サイトの CSS の px で考えて、S 倍して描く。ボタンは描かない(3Dのうかぶボタンになる)。位置だけ返す。

export const C = { bg: "#ffffff", surface: "#f2f2f2", surface2: "#e3e3e3", fg: "#0f0f0f", muted: "#5f5f5f", line: "#dcdcdc", accent: "#1f4e9e", accentFg: "#ffffff", accentSoft: "#e6edf8", danger: "#b3261e" };
export const FONT = "system-ui,-apple-system,'Hiragino Sans','Hiragino Kaku Gothic ProN','Yu Gothic UI','Yu Gothic','Noto Sans JP','Noto Sans CJK JP',Meiryo,sans-serif";

// ---- サイトと同じ計算(app.js) ----
export function hash(s) { s = String(s || ""); let x = 2166136261; for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619); } return x >>> 0; }
function rng(seed) { let a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const MOTIFS = ["waves", "grid", "circles", "rays", "dots", "bars"];
const PALETTES = [["#1f3b73", "#4b2c83"], ["#0f5c5c", "#1d3f72"], ["#7a2e4d", "#3b2a6b"], ["#8a3b12", "#5c1f3f"], ["#1e5a3a", "#0f4a6e"], ["#43307a", "#10526b"], ["#6b2b2b", "#2a3f7a"], ["#2f4858", "#5a3478"]];
const isHex = (c) => typeof c === "string" && /^#[0-9a-fA-F]{6}$/.test(c);
function lum(c) { const v = [1, 3, 5].map((i) => { const x = parseInt(c.substr(i, 2), 16) / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; }
function darken(c) { let n = 0; while (lum(c) > 0.12 && n < 12) { c = "#" + [1, 3, 5].map((i) => ("0" + Math.round(parseInt(c.substr(i, 2), 16) * 0.85).toString(16)).slice(-2)).join(""); n++; } return c; }
function thumbParams(p) {
  const s = hash(p.url || p.id), pal = PALETTES[s % PALETTES.length], t = p.thumb || {};
  return { a: isHex(t.a) ? darken(t.a) : pal[0], b: isHex(t.b) ? darken(t.b) : pal[1], m: MOTIFS.indexOf(t.m) >= 0 ? t.m : MOTIFS[(s >>> 3) % MOTIFS.length], s };
}
function wrapTitle(t) {
  const chars = Array.from(String(t || "")), MAX = 11.5;
  const cw = chars.map((c) => (/[\x20-\x7e]/.test(c) ? 0.56 : 1));
  const total = cw.reduce((a, b) => a + b, 0);
  if (total <= MAX) return [chars.join("")];
  let best = 1, bestScore = Infinity, acc = 0;
  for (let i = 1; i < chars.length; i++) { acc += cw[i - 1]; const score = Math.max(acc, total - acc); if (score < bestScore) { bestScore = score; best = i; } }
  let a = chars.slice(0, best), b = chars.slice(best), wb = 0;
  for (let k = 0; k < b.length; k++) { wb += cw[best + k]; if (wb > MAX) { b = b.slice(0, k); b.push("…"); break; } }
  let wa = 0; for (let k = 0; k < a.length; k++) wa += cw[k];
  if (wa > MAX) { let x = 0; for (let k = 0; k < a.length; k++) { x += cw[k]; if (x > MAX) { a = a.slice(0, k); break; } } }
  return [a.join(""), b.join("")];
}
function motifSvg(m, r) {
  let o = "";
  if (m === "waves") { for (let i = 0; i < 4; i++) { const y = 60 + i * 30 + r() * 10; o += '<path d="M-10 ' + y + " Q 70 " + (y - 34) + " 160 " + y + " T 330 " + y + '"/>'; } }
  else if (m === "grid") { for (let i = 1; i < 10; i++) o += '<path d="M' + (i * 34) + ' 0V180"/>'; for (let i = 1; i < 6; i++) o += '<path d="M0 ' + (i * 32) + 'H320"/>'; }
  else if (m === "circles") { const cx = 60 + r() * 200, cy = 20 + r() * 110; for (let i = 1; i < 6; i++) o += '<circle cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" r="' + (i * 26) + '"/>'; }
  else if (m === "rays") { const rx = r() * 320, ry = r() * 90; for (let i = 0; i < 16; i++) { const an = i / 16 * Math.PI * 2; o += '<path d="M' + rx.toFixed(1) + " " + ry.toFixed(1) + "L" + (rx + Math.cos(an) * 400).toFixed(1) + " " + (ry + Math.sin(an) * 400).toFixed(1) + '"/>'; } }
  else if (m === "dots") { for (let i = 0; i < 15; i++) for (let k = 0; k < 6; k++) o += '<circle cx="' + (i * 22 + 12) + '" cy="' + (k * 24 + 14) + '" r="' + (1.5 + r() * 3.5).toFixed(1) + '" fill="#fff" stroke="none" fill-opacity=".5"/>'; }
  else { for (let i = 0; i < 12; i++) { const bh = 24 + r() * 90; o += '<rect x="' + (i * 27 + 8) + '" y="' + (110 - bh).toFixed(1) + '" width="16" height="' + bh.toFixed(1) + '" rx="3" fill="#fff" stroke="none" fill-opacity=".5"/>'; } }
  return o;
}
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function coverSvg(p) {
  const t = thumbParams(p), r = rng(t.s), lines = wrapTitle(p.title), n = lines.length;
  let txt = "";
  for (let i = 0; i < n; i++) {
    const y = n === 1 ? 160 : (i === 0 ? 130 : 160);
    txt += '<text x="18" y="' + y + '" font-size="25" font-weight="900" fill="#fff" font-family="\'Zen Kaku Gothic New\',\'Noto Sans JP\',\'Hiragino Sans\',sans-serif">' + esc(lines[i]) + "</text>";
  }
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180" width="1280" height="720" preserveAspectRatio="xMidYMid slice">'
    + '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + t.a + '"/><stop offset="1" stop-color="' + t.b + '"/></linearGradient></defs>'
    + '<rect width="320" height="180" fill="url(#g)"/>'
    + '<g fill="none" stroke="#fff" stroke-opacity=".17" stroke-width="2">' + motifSvg(t.m, r) + "</g>"
    + '<rect y="96" width="320" height="84" fill="#000" fill-opacity=".3"/>'
    + txt + "</svg>";
}
// 自動のサムネ(画像)。読み込めたら cb(img)
const coverCache = new Map();
export function coverImage(p, cb) {
  const key = (p.url || p.id) + "|" + p.title + "|" + JSON.stringify(p.thumb || null);
  let e = coverCache.get(key);
  if (e) { if (e.ok) cb(e.img); else e.wait.push(cb); return; }
  e = { ok: false, img: new Image(), wait: [cb] };
  coverCache.set(key, e);
  e.img.onload = () => { e.ok = true; for (const f of e.wait) f(e.img); e.wait = []; };
  e.img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(coverSvg(p));
}
export const avatarColor = (name, uid) => "hsl(" + (hash(uid || name || "") % 360) + ",42%,36%)";
export function ago(t) {
  const s0 = (Date.now() - t) / 1000, s = s0 >= 0 ? s0 : 0;
  if (s < 60) return "たった今"; const m = s / 60; if (m < 60) return Math.floor(m) + "分前";
  const hr = m / 60; if (hr < 24) return Math.floor(hr) + "時間前"; const d = hr / 24; if (d < 30) return Math.floor(d) + "日前";
  if (d < 365) return Math.floor(d / 30) + "か月前"; return Math.floor(d / 365) + "年前";
}
export const agoNi = (t) => { const a = ago(t); return /前$/.test(a) ? a + "に" : a; };
export const fmtSize = (n) => { n = Number(n) || 0; return n >= 1048576 ? (n / 1048576).toFixed(1).replace(/\.0$/, "") + "MB" : n >= 1024 ? Math.round(n / 1024) + "KB" : n + "B"; };
const WD = ["日", "月", "火", "水", "木", "金", "土"];
export function twDate(ms) { const d = new Date(Number(ms) + 9 * 3600000), z = (n) => (n < 10 ? "0" : "") + n; return d.getUTCFullYear() + "年" + (d.getUTCMonth() + 1) + "月" + d.getUTCDate() + "日(" + WD[d.getUTCDay()] + ") " + z(d.getUTCHours()) + ":" + z(d.getUTCMinutes()); }
export const isFile = (p) => p.kind === "file";
export const isWeb = (p) => p.kind === "website";

// ---- アイコン(app.js の ICO と同じ形。24×24、線の太さ2) ----
export const ICO = {
  dl: "M12 4v11M7 11l5 5 5-5M5 20h14", back: "M15 5l-7 7 7 7", open: "M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5",
  like: "M7 11v9H4v-9zM7 11l4-7a2 2 0 0 1 2 2v4h5.5a1.5 1.5 0 0 1 1.5 1.8l-1.3 6.5A2 2 0 0 1 16.8 20H7",
  dislike: "M7 13V4H4v9zM7 13l4 7a2 2 0 0 0 2-2v-4h5.5a1.5 1.5 0 0 0 1.5-1.8l-1.3-6.5A2 2 0 0 0 16.8 4H7",
  share: "M14 4l7 7-7 7v-4c-6 0-9 2-11 6 1-7 4-11 11-12z", save: "M6 4h12v17l-6-4-6 4z",
  play: "M8 5v14l11-7z", cursor: "M5 3l14 8-6 2-3 6z", list: "M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01",
  reply: "M10 8L4 13l6 5v-3c5 0 8 1 10 5-1-6-4-10-10-10z", trash: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13",
  tbub: "M5 4h14a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-8l-5 4v-4H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z",
  trt: "M17 3l3 3-3 3M4 11V9a3 3 0 0 1 3-3h13M7 21l-3-3 3-3M20 13v2a3 3 0 0 1-3 3H4",
  theart: "M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z", tview: "M5 20v-8M12 20V5M19 20v-11",
  heart: "M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z", edit: "M4 20h4L19 9l-4-4L4 16zM14 6l4 4",
};
const pathCache = new Map();
export function drawIcon(c, name, x, y, size, color) {
  if (name === "dots") { c.fillStyle = color; for (const cy of [5, 12, 19]) { c.beginPath(); c.arc(x + 12 * size / 24, y + cy * size / 24, 1.4 * size / 24, 0, Math.PI * 2); c.fill(); } return; }
  let p = pathCache.get(name);
  if (!p) { p = new Path2D(ICO[name]); pathCache.set(name, p); }
  c.save(); c.translate(x, y); c.scale(size / 24, size / 24);
  c.strokeStyle = color; c.lineWidth = 2; c.lineCap = "round"; c.lineJoin = "round";
  if (name === "play" || name === "cursor") { c.fillStyle = "rgba(0,0,0,0)"; }
  c.stroke(p); c.restore();
}
export function rr(c, x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
// 文字を、はばに収まるように行に分ける(改行も)
export function lines(c, text, maxW, maxLines) {
  const out = [];
  for (const para of String(text || "").split("\n")) {
    let cur = "";
    for (const ch of Array.from(para)) {
      if (cur && c.measureText(cur + ch).width > maxW) { out.push(cur); cur = ch; if (out.length >= maxLines) break; } else cur += ch;
    }
    if (out.length >= maxLines) break;
    out.push(cur);
    if (out.length >= maxLines) break;
  }
  const full = String(text || "").replace(/\n/g, "") ;
  if (out.length >= maxLines && out.join("").length < full.length) {
    let l = out[maxLines - 1];
    while (l && c.measureText(l + "…").width > maxW) l = l.slice(0, -1);
    out[maxLines - 1] = l + "…";
  }
  return out.slice(0, maxLines);
}
const font = (px, w) => `${w || 400} ${px}px ${FONT}`;

// アイコン(.av): 画像があれば画像、なければ色と頭文字
export function drawAvatar(c, x, y, size, name, uid, img) {
  c.save(); c.beginPath(); c.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2); c.closePath(); c.clip();
  if (img) { const r = Math.max(size / img.width, size / img.height); c.drawImage(img, x + (size - img.width * r) / 2, y + (size - img.height * r) / 2, img.width * r, img.height * r); }
  else {
    c.fillStyle = avatarColor(name, uid); c.fillRect(x, y, size, size);
    c.fillStyle = "#fff"; c.font = font(Math.round(size * 15 / 36), 700); c.textAlign = "center"; c.textBaseline = "middle";
    c.fillText(Array.from(name || "？")[0] || "？", x + size / 2, y + size / 2 + size * 0.03);
    c.textAlign = "left"; c.textBaseline = "alphabetic";
  }
  c.restore();
}
// 画像を、枠いっぱいに(object-fit: cover)
export function drawCover(c, img, x, y, w, h) {
  const r = Math.max(w / img.width, h / img.height), iw = img.width * r, ih = img.height * r;
  c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip(); c.drawImage(img, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih); c.restore();
}
// .kind-tag(題名の右の小さな帯)
function tag(c, x, yMid, text, px, bg, fg) {
  c.font = font(px * 0.62, 700);
  const w = c.measureText(text).width + 18, h = px * 0.62 * 1.6;
  c.fillStyle = bg; rr(c, x, yMid - h / 2, w, h, 6); c.fill();
  c.fillStyle = fg; c.textBaseline = "middle"; c.fillText(text, x + 9, yMid + 1); c.textBaseline = "alphabetic";
  return w;
}
// 題名と帯(系列アプリ有 → Webサイト/その他 → 〇〇の系列)
function titleBlock(c, p, x, y, maxW, px, weight, lh, maxLines, info) {
  c.font = font(px, weight); c.fillStyle = C.fg;
  const tags = [];
  if (info && info.kids) tags.push(["系列アプリ有", "#e7f1e7", "#216a2b"]);
  if (isWeb(p) || isFile(p)) tags.push([isFile(p) ? "その他" : "Webサイト", C.accentSoft, C.accent]);
  if (info && info.parentTitle) tags.push([info.parentTitle + "の系列", "#e7f1e7", "#216a2b"]);
  const ls = lines(c, p.title, maxW, maxLines);
  ls.forEach((l, i) => { c.font = font(px, weight); c.fillStyle = C.fg; c.fillText(l, x, y + px + (lh - px) / 2 - 2 + i * lh); });
  // 帯は、最後の行のうしろ(入らなければ次の行)
  let tx = x + (c.font = font(px, weight), c.measureText(ls[ls.length - 1] || "").width) + 8, ty = y + (ls.length - 1) * lh + lh / 2, used = ls.length;
  for (const [t, bg, fg] of tags) {
    c.font = font(px * 0.62, 700); const w = c.measureText(t).width + 18;
    if (tx + w > x + maxW) { tx = x; ty += lh; used++; }
    tx += tag(c, tx, ty, t, px, bg, fg) + 8;
  }
  return used * lh;
}
// 1行の小さな情報(アイコン + 文字)。行が足りなければ折り返す。返り値: 使った高さ
function statLine(c, p, x, y, maxW, S) {
  const px = 12 * S, lh = 12 * S * 1.55 + 2 * S;
  c.font = font(px); c.fillStyle = C.muted;
  const parts = [["play", "view " + (p.views || 0)], [null, "/"], ["cursor", "click " + (p.clicks || 0)], [null, "・"], [null, agoNi(p.createdAt) + "投稿" + (p.editedAt ? "（" + agoNi(p.editedAt) + "編集済み）" : "")]];
  let cx = x, cy = y, rows = 1;
  for (const [ic, t] of parts) {
    const w = (ic ? 18 * S : 0) + c.measureText(t).width;
    if (cx > x && cx + w > x + maxW) { cx = x; cy += lh; rows++; }
    if (ic) { drawIcon(c, ic, cx, cy + (lh - 14 * S) / 2, 14 * S, C.muted); cx += 18 * S; }
    c.globalAlpha = t === "/" || t === "・" ? 0.6 : 1;
    c.fillStyle = C.muted; c.fillText(t, cx, cy + lh / 2 + px * 0.36); c.globalAlpha = 1;
    cx += c.measureText(t).width + 5 * S;
  }
  return rows * lh;
}
function catLine(c, p, x, y, S) {
  const px = 12 * S, lh = 12 * S * 1.55 + 2 * S;
  drawIcon(c, "list", x, y + (lh - 14 * S) / 2, 14 * S, C.muted);
  c.font = font(px); c.fillStyle = C.muted; c.fillText(p.cat || "", x + 18 * S, y + lh / 2 + px * 0.36);
  return lh;
}

// ==== 投稿のカード(一覧の1件: .card-item)。幅 W(CSS px)、S 倍 ====
// info: { thumb: Image|null, avatar: Image|null, handle, kids, parentTitle, menu }
// 返り値: { thumbH } (サムネの高さ。キャンバスpx)
export function drawPostCard(c, p, info, W, S) {
  const cw = c.canvas.width, ch = c.canvas.height;
  c.clearRect(0, 0, cw, ch);
  const th = W * 9 / 16 * S, rad = 12 * S;
  // カードの台(白)は、サムネの下から
  c.fillStyle = C.bg; c.fillRect(0, th, cw, ch - th);
  // サムネ(角丸12)。うしろは少し透ける
  c.save(); rr(c, 0, 0, W * S, th, rad); c.clip();
  c.globalAlpha = info.thumbAlpha ?? 1;
  c.fillStyle = C.surface; c.fillRect(0, 0, W * S, th);
  if (info.thumb) drawCover(c, info.thumb, 0, 0, W * S, th);
  c.restore(); c.globalAlpha = 1;
  // .meta: 12px あけて、アイコン36 + 12 + 文字
  const y0 = th + 12 * S, tx = (36 + 12) * S, tw = W * S - tx - (info.menu ? 36 * S : 0);
  drawAvatar(c, 0, y0, 36 * S, p.author, p.uid, info.avatar);
  let y = y0;
  y += titleBlock(c, p, tx, y, tw, 15 * S, 500, 15 * S * 1.5, 2, info);
  // by-line(13px、上に2px)
  y += 2 * S; c.font = font(13 * S); c.fillStyle = C.muted;
  const by = "by " + (p.author || "") + (info.handle ? "  @" + info.handle : "");
  c.fillText(lines(c, by, tw, 1)[0], tx, y + 13 * S * 1.55 / 2 + 13 * S * 0.36); y += 13 * S * 1.55;
  y += statLine(c, p, tx, y, tw, S);
  if (p.cat) y += catLine(c, p, tx, y, S);
  if (info.menu) drawIcon(c, "dots", W * S - 32 * S, y0 - 4 * S, 20 * S, C.fg);
  return { thumbH: th };
}

// ==== 投稿のページ(.watch)。幅 W(CSS px)。ボタンは描かず、位置を返す ====
// info: { thumb, avatar, handle, kids, parentTitle, subs, comments: [{name,uid,text,createdAt,owner,likes,avatar}] | null, commentsErr }
export function drawWatchPage(c, p, info, W, S) {
  const cw = c.canvas.width, chH = c.canvas.height;
  c.fillStyle = C.bg; c.fillRect(0, 0, cw, chH);
  const btns = [];
  const gap = 28, mainW = (W - gap) * 0.7, cmX = mainW + gap, cmW = W - cmX;
  // 一覧にもどる(.btn.back: 高さ44、角22、アイコン18、太字、下に14)
  c.font = font(15 * S, 700);
  const backW = 20 + 18 + 8 + c.measureText("一覧にもどる").width / S + 20;
  btns.push({ id: "back", x: 0, y: 0, w: backW, h: 44, label: "一覧にもどる", icon: "back", style: "btn" });
  let y = 44 + 14;
  // プレイヤー(16:9、角14)。下は暗く
  const ph = mainW * 9 / 16;
  c.save(); rr(c, 0, y * S, mainW * S, ph * S, 14 * S); c.clip();
  c.fillStyle = C.surface; c.fillRect(0, y * S, mainW * S, ph * S);
  if (info.thumb) drawCover(c, info.thumb, 0, y * S, mainW * S, ph * S);
  const g = c.createLinearGradient(0, y * S, 0, (y + ph) * S); g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(0.55, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0,0.35)");
  c.fillStyle = g; c.fillRect(0, y * S, mainW * S, ph * S); c.restore();
  // 開く / ダウンロードのボタン(.go-main: 高さ56、角28、白、17px太字、アイコン22)
  const fl = p.files && p.files.length ? p.files : p.fileName ? [{ name: p.fileName, size: p.fileSize }] : [];
  const goLabel = isFile(p) ? (fl.length > 1 ? "ダウンロード（" + fl.length + "個のファイル・" + fmtSize(p.fileSize) + "）" : "ダウンロード（" + (p.fileName || "ファイル") + "・" + fmtSize(p.fileSize) + "）") : isWeb(p) ? "Webサイトを開く" : "artifactを開く";
  c.font = font(17 * S, 700);
  const goW = 26 + 22 + 10 + c.measureText(goLabel).width / S + 26;
  btns.push({ id: "go", x: mainW / 2 - goW / 2, y: y + ph / 2 - 28, w: goW, h: 56, label: goLabel, icon: isFile(p) ? "dl" : "open", style: "go" });
  y += ph;
  // h1(21px 太字、上16)
  y += 16;
  y += titleBlock(c, p, 0, y * S, mainW * S, 21 * S, 700, 21 * S * 1.45, 3, info) / S;
  // ファイルの行
  c.font = font(13 * S); c.fillStyle = C.muted;
  if (isFile(p)) {
    const t = fl.length > 1 ? " " + fl.length + "個のファイル（合計 " + fmtSize(p.fileSize) + "）" : " " + (p.fileName || "ファイル") + "（" + fmtSize(p.fileSize) + "）";
    y += 4; drawIcon(c, "dl", 0, (y + 2) * S, 16 * S, C.muted); c.fillStyle = C.muted; c.fillText(t, 18 * S, (y + 15) * S); y += 22;
  }
  // .watch-meta(上6、下6)
  y += 6; y += statLine(c, p, 0, y * S, mainW * S, S) / S; if (p.cat) y += catLine(c, p, 0, y * S, S) / S; y += 6;
  // .watch-row: 投稿者(アイコン36 + 名前・登録者数) + 登録ボタン ... 右に 高評価|低評価・共有・保存・⋮
  y += 12;
  drawAvatar(c, 0, (y + 4) * S, 36 * S, p.author, p.uid, info.avatar);
  c.font = font(15 * S, 700); c.fillStyle = C.fg; c.fillText(p.author || "", 48 * S, (y + 20) * S);
  c.font = font(13 * S); c.fillStyle = C.muted; c.fillText("チャンネル登録者数 " + (info.subs || 0) + "人", 48 * S, (y + 40) * S);
  c.font = font(15 * S, 700);
  const nameW = Math.max(c.measureText(p.author || "").width / S, (c.font = font(13 * S), c.measureText("チャンネル登録者数 " + (info.subs || 0) + "人").width / S));
  if (!info.mine) btns.push({ id: "sub", x: 48 + nameW + 16, y, w: 40 + (c.font = font(15 * S, 700), c.measureText(info.subbed ? "登録済み" : "チャンネル登録").width / S), h: 44, label: info.subbed ? "登録済み" : "チャンネル登録", style: info.subbed ? "btn" : "subscribe" });
  // 右の動作ボタン(右から並べる)
  const acts = [];
  acts.push({ id: "like", label: String(p.likes || 0), icon: "like", style: "seg-l", pressed: info.rx === "like" });
  acts.push({ id: "dislike", label: String(p.dislikes || 0), icon: "dislike", style: "seg-r", pressed: info.rx === "dislike" });
  acts.push({ id: "share", label: "共有", icon: "share", style: "act" });
  acts.push({ id: "save", label: info.saved ? "保存済み" : "保存", icon: "save", style: "act", pressed: !!info.saved });
  acts.push({ id: "dots", label: "", icon: "dots", style: "dots" });
  c.font = font(15 * S, 700);
  for (const a of acts) a.w = a.style === "dots" ? 44 : 16 + 18 + (a.label ? 8 + c.measureText(a.label).width / S : 0) + 16;
  let ax = mainW;
  for (let i = acts.length - 1; i >= 0; i--) { const a = acts[i]; ax -= a.w; a.x = ax; a.y = y; a.h = 44; btns.push(a); ax -= a.style === "seg-r" ? 0 : 8; }
  y += 44 + 4;
  // 説明(.desc: 上16、内14/16、角12、灰色)
  if (p.desc) {
    y += 16;
    c.font = font(15 * S);
    const ls = lines(c, p.desc, (mainW - 32) * S, 14);
    const dh = 28 + ls.length * 15 * 1.6;
    c.fillStyle = C.surface; rr(c, 0, y * S, mainW * S, dh * S, 12 * S); c.fill();
    c.fillStyle = C.fg; ls.forEach((l, i) => c.fillText(l, 16 * S, (y + 14 + 15 * 1.6 * (i + 0.72)) * S));
    y += dh;
  }
  // コメント(右の列)
  let cy = 0;
  const cms = info.comments;
  c.font = font(18 * S, 900); c.fillStyle = C.fg; c.fillText("コメント" + (cms ? " " + cms.length + "件" : ""), cmX * S, (cy + 22) * S); cy += 22 + 14;
  drawAvatar(c, cmX * S, cy * S, 36 * S, info.me ? info.me.name : "？", info.me ? info.me.uid : "", info.me ? info.me.avatar : null);
  c.strokeStyle = C.line; c.lineWidth = 1 * S; c.beginPath(); c.moveTo((cmX + 48) * S, (cy + 36) * S); c.lineTo((cmX + cmW) * S, (cy + 36) * S); c.stroke();
  c.font = font(15 * S); c.fillStyle = C.muted; c.fillText("コメントを追加…", (cmX + 50) * S, (cy + 24) * S);
  cy += 36 + 20;
  if (!cms) { c.font = font(13 * S); c.fillStyle = C.muted; c.fillText(info.commentsErr || "読み込み中…", cmX * S, (cy + 16) * S); }
  else if (!cms.length) { c.font = font(13 * S); c.fillStyle = C.muted; c.fillText("まだコメントはありません", cmX * S, (cy + 16) * S); }
  else for (const m of cms) {
    if ((cy + 60) * S > chH) break;
    drawAvatar(c, cmX * S, (cy + 6) * S, 40 * S, m.name, m.uid, m.avatar);
    let hx = cmX + 52;
    c.font = font(13 * S, 700); c.fillStyle = C.fg; c.fillText(m.name || "", hx * S, (cy + 20) * S); hx += c.measureText(m.name || "").width / S + 8;
    if (m.owner) { c.font = font(11 * S, 700); const ow = c.measureText("投稿者").width / S + 16; c.fillStyle = C.fg; rr(c, hx * S, (cy + 8) * S, ow * S, 18 * S, 10 * S); c.fill(); c.fillStyle = C.bg; c.fillText("投稿者", (hx + 8) * S, (cy + 21) * S); hx += ow + 8; }
    c.font = font(13 * S); c.fillStyle = C.muted; c.fillText(ago(m.createdAt), hx * S, (cy + 20) * S);
    c.font = font(14 * S); c.fillStyle = C.fg;
    const tl = lines(c, m.text, (cmW - 52) * S, 6);
    tl.forEach((l, i) => c.fillText(l, (cmX + 52) * S, (cy + 30 + 14 * 1.65 * (i + 0.75)) * S));
    let ay = cy + 30 + tl.length * 14 * 1.65 + 2;
    c.font = font(13 * S, 500); c.fillStyle = C.muted;
    drawIcon(c, "reply", (cmX + 52) * S, (ay + 9) * S, 16 * S, C.muted); c.fillText("返信", (cmX + 72) * S, (ay + 22) * S);
    drawIcon(c, "heart", (cmX + 120) * S, (ay + 9) * S, 16 * S, C.muted); c.fillText(String(m.likes || 0), (cmX + 140) * S, (ay + 22) * S);
    cy = ay + 36 + 6;
  }
  return { btns, height: Math.max(y, 0) };
}

// ==== ツイート(.tw)。detail: 右の表示(日時を細かく) ====
// info: { name, handle, avatar, image: Image|null }
// 返り値: 使った高さ(CSS px)
export function drawTweet(c, t, info, x0, y0, W, S, detail) {
  const pad = 8, padY = 12;
  const x = x0 + pad, y = y0 + padY, tx = x + 36 + 12, tw = W - pad * 2 - 36 - 12;
  drawAvatar(c, x * S, y * S, 36 * S, info.name, t.uid, info.avatar);
  // 名前 @ID ・ 時刻
  let hx = tx;
  c.font = font(14 * S, 700); c.fillStyle = C.fg; c.fillText(info.name || "チャンネル", hx * S, (y + 16) * S); hx += c.measureText(info.name || "チャンネル").width / S + 6;
  c.font = font(13 * S); c.fillStyle = C.muted;
  for (const s of [info.handle ? "@" + info.handle : "", "・", detail ? twDate(t.createdAt) : ago(t.createdAt), t.editedAt ? "（" + agoNi(t.editedAt) + "編集済み）" : ""]) { if (!s) continue; c.fillText(s, hx * S, (y + 16) * S); hx += c.measureText(s).width / S + 6; }
  let yy = y + 22;
  // 本文(15px、行の高さ1.55)
  if (t.text) {
    c.font = font(15 * S); c.fillStyle = C.fg;
    const ls = lines(c, t.text, tw * S, detail ? 30 : 6);
    ls.forEach((l, i) => c.fillText(l, tx * S, (yy + 4 + 15 * 1.55 * (i + 0.75)) * S));
    yy += 4 + ls.length * 15 * 1.55;
  }
  if (info.image && info.showImage) {
    const ih = tw * 9 / 16;
    yy += 8;
    c.save(); rr(c, tx * S, yy * S, tw * S, ih * S, 14 * S); c.clip(); drawCover(c, info.image, tx * S, yy * S, tw * S, ih * S); c.restore();
    c.strokeStyle = C.line; c.lineWidth = S; rr(c, tx * S, yy * S, tw * S, ih * S, 14 * S); c.stroke();
    yy += ih;
  }
  // 返信・リツイート・ハート・表示数(アイコン18、13px、間22)
  yy += 8;
  let ax = tx - 6;
  c.font = font(13 * S); c.fillStyle = C.muted;
  for (const [ic, n, on] of [["tbub", t.replies, false], ["trt", t.rts, t.myRt], ["theart", t.likes, t.myLike], ["tview", t.views, false]]) {
    const col = on ? (ic === "trt" ? "#0b8a4a" : "#d6245f") : C.muted;
    drawIcon(c, ic, (ax + 6) * S, (yy + 4) * S, 18 * S, col);
    c.font = font(13 * S, on ? 700 : 400); c.fillStyle = col; c.fillText(String(n || 0), (ax + 30) * S, (yy + 18) * S);
    ax += 6 + 18 + 6 + c.measureText(String(n || 0)).width / S + 6 + 22;
  }
  yy += 26 + padY;
  if (!detail) { c.strokeStyle = C.line; c.lineWidth = S; c.beginPath(); c.moveTo(x0 * S, yy * S); c.lineTo((x0 + W) * S, yy * S); c.stroke(); }
  return yy - y0;
}

// ==== ボタンの面(うかぶボタン)。b: { label, icon, style, pressed }。キャンバスに、ボタンの大きさいっぱいに描く ====
export function drawButtonFace(cv, b, S) {
  const c = cv.getContext("2d"), w = cv.width, h = cv.height;
  c.clearRect(0, 0, w, h);
  let bg = C.surface, fg = C.fg, r = h / 2, fw = 700, px = 15;
  if (b.style === "go") { bg = "#ffffff"; fg = "#0f0f0f"; px = 17; }
  if (b.style === "subscribe") { bg = C.fg; fg = C.bg; }
  if (b.style === "dots") { r = h / 2; }
  if (b.pressed) { bg = C.accentSoft; fg = C.accent; }
  if (b.style === "sort") { bg = b.pressed ? C.accentSoft : C.surface; fg = b.pressed ? C.accent : C.fg; r = 0; }
  if (b.style === "sort-l" || b.style === "sort-r") { bg = b.pressed ? C.accentSoft : C.surface; fg = b.pressed ? C.accent : C.fg; }
  if (b.style === "seg-l" || b.style === "seg-r" || b.style === "sort-l" || b.style === "sort-r") r = 0;
  c.fillStyle = bg;
  if (b.style === "seg-l" || b.style === "sort-l") { rr(c, 0, 0, w, h, h / 2); c.fill(); c.fillRect(w / 2, 0, w / 2, h); }
  else if (b.style === "seg-r" || b.style === "sort-r") { rr(c, 0, 0, w, h, h / 2); c.fill(); c.fillRect(0, 0, w / 2, h); }
  else { rr(c, 0, 0, w, h, r); c.fill(); }
  if (b.style === "seg-r" || b.style === "sort-r" || b.style === "sort") { c.fillStyle = C.line; c.fillRect(0, 0, Math.max(1, S), h); }
  const isz = (b.style === "go" ? 22 : 18) * S;
  c.font = font(px * S, fw);
  const tw = b.label ? c.measureText(b.label).width : 0, gapW = b.icon && b.label ? (b.style === "go" ? 10 : 8) * S : 0;
  const total = (b.icon ? isz : 0) + gapW + tw;
  let x = (w - total) / 2;
  if (b.icon) { drawIcon(c, b.icon, x, (h - isz) / 2, isz, fg); x += isz + gapW; }
  if (b.label) { c.fillStyle = fg; c.textBaseline = "middle"; c.fillText(b.label, x, h / 2 + S); c.textBaseline = "alphabetic"; }
}
