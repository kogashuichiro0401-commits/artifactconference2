// 投稿ホール(北)。投稿1つが、ひとつの大きな箱。
//  ・前面は 30×30。サムネイルの部分は、すこし透ける。奥行きは 50。箱は 横に3列、縦に何段も積まれている
//  ・箱の中は歩ける。いちばん奥の壁に、投稿のページ(詳細)が映っている
//  ・スポーン地点の前にリフトがあって、Space で上、Shift で下。リフトの外に足を踏み出すと、リフトは消えて、下に新しいのが用意される
// 箱もリフトも、ブロックではなく画面だけの展示物。当たり判定は、ここで持っている(world.virtual)。
import { SPAWN } from "./shared.js";

// ---- 形 ----
export const COLS = 3;
const W = 30, D = 50, PX = 33, X0 = 3;       // 箱の中の幅 / 奥行き / 列のはば / 左の列の中の左はし
const ZF = 52;                                // 前面の位置(ここから北へ、奥行き50)
const ROWH = 30, Y0 = 0.5;                    // 1段の高さ / 床の上面
const SLAB = 0.5;                             // 床板・壁の厚み(横の壁は1)
const MAXP = 36;                              // 並べる投稿の数(12段)
const FONT = "'Hiragino Sans','Noto Sans JP','Yu Gothic','Meiryo',sans-serif";
// リフト
const LIFT = { x0: SPAWN.x - 1.5, x1: SPAWN.x + 1.5, z0: SPAWN.z - 7.5, z1: SPAWN.z - 4.5, speed: 7 };

const PALETTES = [["#4f8cff", "#8e6bff"], ["#ff7a59", "#ffb347"], ["#35c28b", "#2ec4d6"], ["#ef476f", "#ff9e7a"], ["#7b8cff", "#4fd1c5"], ["#f6a609", "#f2635b"]];
const hash = (s) => { let h = 0; for (const c of String(s || "")) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
const rr = (c, x, y, w, h, r) => { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); };
function fit(c, text, maxW) {
  text = String(text || "");
  if (c.measureText(text).width <= maxW) return text;
  let lo = 0, hi = text.length;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (c.measureText(text.slice(0, m) + "…").width <= maxW) lo = m; else hi = m - 1; }
  return text.slice(0, lo) + "…";
}
function wrap(c, text, maxW, maxLines) {
  const out = []; let cur = "";
  const src = String(text || "").split("\n");
  for (const para of src) {
    cur = "";
    for (const ch of para) {
      if (c.measureText(cur + ch).width > maxW) { out.push(cur); cur = ch; if (out.length === maxLines) break; } else cur += ch;
    }
    if (out.length === maxLines) break;
    out.push(cur);
    if (out.length >= maxLines) break;
  }
  if (out.length > maxLines) out.length = maxLines;
  return out;
}
function ago(t) {
  let s = (Date.now() - t) / 1000; if (!(s >= 0)) s = 0;
  if (s < 60) return "たった今"; const m = s / 60; if (m < 60) return Math.floor(m) + "分前";
  const hr = m / 60; if (hr < 24) return Math.floor(hr) + "時間前"; const d = hr / 24; if (d < 30) return Math.floor(d) + "日前";
  if (d < 365) return Math.floor(d / 30) + "か月前"; return Math.floor(d / 365) + "年前";
}
const fmtSize = (n) => { n = Number(n) || 0; return n >= 1048576 ? (n / 1048576).toFixed(1).replace(/\.0$/, "") + "MB" : n >= 1024 ? Math.round(n / 1024) + "KB" : n + "B"; };
const fileList = (p) => (p.files && p.files.length ? p.files : p.fileName ? [{ name: p.fileName, size: p.fileSize }] : []);

// 並べ替え
export const SORTS = {
  new: (a, b) => b.createdAt - a.createdAt,
  old: (a, b) => a.createdAt - b.createdAt,
  popular: (a, b) => (b.views + b.clicks) - (a.views + a.clicks) || b.createdAt - a.createdAt,
};

export function createHall(THREE, scene, { api, getToken }) {
  const group = new THREE.Group(); scene.add(group);
  let posts = [], users = {}, subCounts = {}, items = [], sortKey = "new", rows = 1, status = "読み込み中…";
  const thumbs = new Map();       // 投稿id → 画像(Image)
  const asked = new Set();
  let focus = null;               // いま中に入っている箱
  let busy = false, refreshT = 0;

  // ---- 当たり判定(箱のかべ・床板・リフト) ----
  const boxes = [];               // [x0,y0,z0,x1,y1,z1]
  const lift = { top: Y0, base: Y0, rider: false, group: null, slab: null };
  function rebuildBoxes() {
    boxes.length = 0;
    items.forEach((it) => {
      const x0 = it.x0, yb = it.yb, zb = ZF - D - 1;
      const top = yb + ROWH - SLAB;
      boxes.push([x0 - 1, yb - SLAB, zb, x0, top + SLAB, ZF]);                 // 左の壁
      boxes.push([x0 + W, yb - SLAB, zb, x0 + W + 1, top + SLAB, ZF]);         // 右の壁
      boxes.push([x0, yb - SLAB, zb, x0 + W, top + SLAB, zb + 1]);             // 奥の壁
      if (it.row > 0) boxes.push([x0, yb - SLAB, zb, x0 + W, yb, ZF]);         // 床板(1段目は、世界の床)
      if (it.row === rows - 1) boxes.push([x0, top, zb, x0 + W, top + SLAB, ZF]);   // いちばん上の屋根
    });
  }
  const HW = 0.3;
  const collider = {
    hits(x, y, z, h) {
      const lb = [LIFT.x0, lift.top - 0.5, LIFT.z0, LIFT.x1, lift.top, LIFT.z1];
      const all = lift.top > Y0 + 0.01 ? boxes.concat([lb]) : boxes;
      for (const b of all) if (x + HW > b[0] && x - HW < b[3] && z + HW > b[2] && z - HW < b[5] && y + h > b[1] && y < b[4]) return b;
      if (lift.top > Y0 + 0.01) return null;
      return null;
    },
  };

  // ---- 見た目: 箱 ----
  const wallMat = new THREE.MeshLambertMaterial({ color: 0xf1f2f5, emissive: 0x555a66 });
  const floorMat = new THREE.MeshLambertMaterial({ color: 0xdde1ea, emissive: 0x4a4f5c });
  function addBox(g, b, mat) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(b[3] - b[0], b[4] - b[1], b[5] - b[2]), mat);
    m.position.set((b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2);
    g.add(m);
  }
  const FW = 512;   // 前面の絵の大きさ(正方形)
  function clearItems() {
    for (const it of items) { group.remove(it.g); it.g.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material && o.material.map) o.material.map.dispose(); }); }
    items = []; focus = null;
  }

  // ---- 前面の絵 ----
  function drawFront(it) {
    const p = it.p, c = it.frontCv.getContext("2d"), S = FW;
    c.clearRect(0, 0, S, S);
    const th = it.thumbH;     // サムネイルの高さ(16:9)
    // サムネイル: すこし透かす
    c.save(); c.globalAlpha = 0.55;
    drawThumb(c, p, 0, 0, S, th);
    c.restore();
    // 情報の面(不透明)
    c.fillStyle = "#ffffff"; c.fillRect(0, th, S, S - th);
    const u = users[p.uid] || {}, col = PALETTES[hash(p.uid) % PALETTES.length][0];
    c.fillStyle = col; c.beginPath(); c.arc(54, th + 62, 34, 0, Math.PI * 2); c.fill();
    c.fillStyle = "#fff"; c.font = `bold 34px ${FONT}`; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(String(p.author || "?").slice(0, 1), 54, th + 64); c.textAlign = "left"; c.textBaseline = "alphabetic";
    c.fillStyle = "#111"; c.font = `bold 30px ${FONT}`;
    const tl = wrap(c, p.title, S - 130 - 20, 2);
    tl.forEach((l, i) => c.fillText(l, 106, th + 44 + i * 36));
    let y = th + 44 + tl.length * 36 + 6;
    if (p.cat) {
      c.font = `bold 20px ${FONT}`; const w = Math.min(220, c.measureText(p.cat).width + 28);
      c.fillStyle = "#e0e8fb"; rr(c, 106, y - 18, w, 30, 15); c.fill(); c.fillStyle = "#1c3f8c"; c.fillText(fit(c, p.cat, w - 20), 120, y + 4); y += 36;
    }
    c.fillStyle = "#555"; c.font = `22px ${FONT}`;
    c.fillText(fit(c, "by " + (p.author || "") + (u.handle ? "  @" + u.handle : ""), S - 130), 106, y + 8); y += 32;
    c.fillText(`▷ view ${p.views || 0} / click ${p.clicks || 0}`, 106, y + 8);
    it.frontTex.needsUpdate = true;
  }
  // サムネイル(画像があれば画像、なければ題名から作った色の絵)
  function drawThumb(c, p, x, y, w, h) {
    const img = thumbs.get(p.id);
    if (img) {
      const r = Math.max(w / img.width, h / img.height), iw = img.width * r, ih = img.height * r;
      c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip(); c.drawImage(img, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih); c.restore();
      return;
    }
    const pal = PALETTES[hash(p.url || p.id) % PALETTES.length];
    const g = c.createLinearGradient(x, y, x + w, y + h); g.addColorStop(0, pal[0]); g.addColorStop(1, pal[1]);
    c.fillStyle = g; c.fillRect(x, y, w, h);
    c.fillStyle = "rgba(255,255,255,0.95)"; c.textAlign = "center"; c.textBaseline = "middle";
    const fs = Math.round(h / 8); c.font = `bold ${fs}px ${FONT}`;
    const ls = wrap(c, p.title, w * 0.82, 3);
    ls.forEach((l, i) => c.fillText(l, x + w / 2, y + h / 2 + (i - (ls.length - 1) / 2) * fs * 1.3));
    c.textAlign = "left"; c.textBaseline = "alphabetic";
  }

  // ---- 奥の壁: 投稿のページ ----
  const DW = 1536, DH = 1228;   // 30 × 24 ブロック
  function drawDetail(it) {
    const p = it.p, c = it.detCv.getContext("2d"), u = users[p.uid] || {};
    c.fillStyle = "#ffffff"; c.fillRect(0, 0, DW, DH);
    c.textBaseline = "alphabetic";
    // 戻るボタン
    c.fillStyle = "#f2f2f2"; rr(c, 28, 20, 190, 52, 26); c.fill(); c.fillStyle = "#111"; c.font = `bold 26px ${FONT}`; c.fillText("‹  一覧にもどる", 52, 55);
    // サムネイル
    const tx = 30, ty = 96, tw = 1000, th = 562;
    c.save(); rr(c, tx, ty, tw, th, 18); c.clip(); drawThumb(c, p, tx, ty, tw, th);
    // 下がしだいに暗くなる(画像2のように)
    const gr = c.createLinearGradient(0, ty + th * 0.55, 0, ty + th); gr.addColorStop(0, "rgba(0,0,0,0)"); gr.addColorStop(1, "rgba(0,0,0,0.35)"); c.fillStyle = gr; c.fillRect(tx, ty, tw, th);
    c.restore();
    // 題名・カテゴリ
    c.fillStyle = "#111"; c.font = `bold 36px ${FONT}`; let ty2 = ty + th + 52;
    const tl = wrap(c, p.title, tw, 2); tl.forEach((l, i) => c.fillText(l, tx, ty2 + i * 44)); ty2 += (tl.length - 1) * 44;
    if (p.cat) { c.font = `bold 22px ${FONT}`; const w = c.measureText(p.cat).width + 28; c.fillStyle = "#e0e8fb"; rr(c, tx + c.measureText("").width, ty2 + 14, w, 32, 16); c.fill(); c.fillStyle = "#1c3f8c"; c.fillText(p.cat, tx + 14, ty2 + 38); }
    const fl = fileList(p);
    c.fillStyle = "#606060"; c.font = `22px ${FONT}`;
    let ly = ty2 + 82;
    if (fl.length) { c.fillText(`⤓ ${fl.length}個のファイル（合計 ${fmtSize(fl.reduce((a, f) => a + (f.size || 0), 0))}）`, tx, ly); ly += 34; }
    c.fillText(`▷ view ${p.views || 0} /  click ${p.clicks || 0}  ・  ${ago(p.createdAt)}に投稿${p.editedAt ? `（${ago(p.editedAt)}に編集済み）` : ""}`, tx, ly); ly += 34;
    if (p.cat) { c.fillText(`≡ ${p.cat}`, tx, ly); ly += 34; }
    // 投稿者の行
    const ay = ly - 6;
    const col = PALETTES[hash(p.uid) % PALETTES.length][0];
    c.fillStyle = col; c.beginPath(); c.arc(30 + 30, ay + 30, 30, 0, Math.PI * 2); c.fill();
    c.fillStyle = "#fff"; c.font = `bold 30px ${FONT}`; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(String(p.author || "?").slice(0, 1), 60, ay + 32); c.textAlign = "left"; c.textBaseline = "alphabetic";
    c.fillStyle = "#111"; c.font = `bold 26px ${FONT}`; c.fillText(p.author || "", 106, ay + 28);
    c.fillStyle = "#606060"; c.font = `20px ${FONT}`; c.fillText(`チャンネル登録者数 ${subCounts[p.uid] || 0}人`, 106, ay + 58);
    // ボタン(いいね・よくない・共有・保存)
    const btn = (x, w, label) => { c.fillStyle = "#f2f2f2"; rr(c, x, ay, w, 62, 31); c.fill(); c.fillStyle = "#111"; c.font = `bold 22px ${FONT}`; c.textAlign = "center"; c.fillText(label, x + w / 2, ay + 39); c.textAlign = "left"; };
    btn(500, 150, "👍 " + (p.likes || 0)); btn(660, 150, "👎 " + (p.dislikes || 0)); btn(820, 110, "共有"); btn(940, 100 - 10, "保存");
    // 説明
    const dy0 = ay + 84, dh = DH - 16 - dy0;
    c.fillStyle = "#f2f2f2"; rr(c, 30, dy0, 1010, dh, 14); c.fill();
    c.fillStyle = "#111"; c.font = `22px ${FONT}`;
    wrap(c, p.desc || "(説明はありません)", 970, Math.max(1, Math.floor((dh - 20) / 30))).forEach((l, i) => c.fillText(l, 52, dy0 + 36 + i * 30));
    // コメント(右)
    c.fillStyle = "#111"; c.font = `bold 28px ${FONT}`; c.fillText("コメント", 1090, 96);
    c.fillStyle = "#8a8a8a"; c.font = `22px ${FONT}`; c.fillText("(コメントは、このあと対応します)", 1090, 140);
    // ダウンロード / 開く のボタン(サムネイルの中央に浮かぶ)
    const label = fl.length ? `ダウンロード（${fl.length}個のファイル・${fmtSize(fl.reduce((a, f) => a + (f.size || 0), 0))}）` : p.kind === "website" ? "Webサイトを開く" : "artifactを開く";
    c.font = `bold 26px ${FONT}`; const bw = c.measureText(label).width + 90, bh = 66, bx = tx + tw / 2 - bw / 2, by = ty + th / 2 - bh / 2;
    c.shadowColor = "rgba(0,0,0,0.3)"; c.shadowBlur = 24; c.fillStyle = "#fff"; rr(c, bx, by, bw, bh, 33); c.fill(); c.shadowBlur = 0;
    c.fillStyle = "#111"; c.fillText("⤓  " + label, bx + 34, by + 43);
    it.detTex.needsUpdate = true;
  }

  // ---- 箱を1つ作る ----
  function makeItem(p, i) {
    const row = Math.floor(i / COLS), col = i % COLS;
    const x0 = X0 + col * PX, yb = Y0 + row * ROWH;
    const g = new THREE.Group();
    const it = { p, i, row, col, x0, yb, g, thumbH: Math.round(FW * 9 / 16), detCv: null, detTex: null, detMesh: null };
    // 壁・床板
    const zb = ZF - D - 1, top = yb + ROWH - SLAB;
    addBox(g, [x0 - 1, yb - SLAB, zb, x0, top + SLAB, ZF], wallMat);
    addBox(g, [x0 + W, yb - SLAB, zb, x0 + W + 1, top + SLAB, ZF], wallMat);
    addBox(g, [x0, yb - SLAB, zb, x0 + W, top + SLAB, zb + 1], wallMat);
    if (row > 0) addBox(g, [x0, yb - SLAB, zb, x0 + W, yb, ZF], floorMat);
    // 前面(サムネイルは、すこし透ける)
    it.frontCv = document.createElement("canvas"); it.frontCv.width = it.frontCv.height = FW;
    it.frontTex = new THREE.CanvasTexture(it.frontCv); it.frontTex.generateMipmaps = false; it.frontTex.minFilter = THREE.LinearFilter; it.frontTex.anisotropy = 4;
    const front = new THREE.Mesh(new THREE.PlaneGeometry(W, ROWH), new THREE.MeshBasicMaterial({ map: it.frontTex, transparent: true, fog: false, toneMapped: false, depthWrite: false }));
    front.position.set(x0 + W / 2, yb + ROWH / 2, ZF + 0.02); front.renderOrder = 3;
    g.add(front);
    group.add(g);
    drawFront(it);
    return it;
  }
  // 奥の壁のページは、近づいたときだけ作る(絵が大きいので)
  function buildDetail(it) {
    if (it.detMesh) return;
    it.detCv = document.createElement("canvas"); it.detCv.width = DW; it.detCv.height = DH;
    it.detTex = new THREE.CanvasTexture(it.detCv); it.detTex.generateMipmaps = false; it.detTex.minFilter = THREE.LinearFilter; it.detTex.anisotropy = 4;
    it.detMesh = new THREE.Mesh(new THREE.PlaneGeometry(W, W * DH / DW), new THREE.MeshBasicMaterial({ map: it.detTex, fog: false, toneMapped: false }));
    it.detMesh.position.set(it.x0 + W / 2, it.yb + 14.5, ZF - D + 0.03);
    it.g.add(it.detMesh);
    drawDetail(it);
  }
  function freeDetail(it) {
    if (!it.detMesh) return;
    it.g.remove(it.detMesh); it.detMesh.geometry.dispose(); it.detMesh.material.dispose(); it.detTex.dispose();
    it.detMesh = it.detTex = it.detCv = null;
  }

  // ---- リフト ----
  {
    const g = new THREE.Group(); lift.group = g; scene.add(g);
    const slab = new THREE.Mesh(new THREE.BoxGeometry(LIFT.x1 - LIFT.x0, 0.5, LIFT.z1 - LIFT.z0), new THREE.MeshLambertMaterial({ color: 0xfff4c2, emissive: 0x6b5d1c }));
    const edge = new THREE.LineSegments(new THREE.EdgesGeometry(slab.geometry), new THREE.LineBasicMaterial({ color: 0x8a6a00 }));
    slab.add(edge);
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1, 0.16), new THREE.MeshBasicMaterial({ color: 0xffd84d, transparent: true, opacity: 0.55 }));
    g.add(slab, beam); lift.slab = slab; lift.beam = beam;
    g.position.set((LIFT.x0 + LIFT.x1) / 2, 0, (LIFT.z0 + LIFT.z1) / 2);
  }
  function placeLiftMeshes() {
    lift.slab.position.y = lift.top - 0.25;
    const h = Math.max(0.1, lift.top - Y0);
    lift.beam.scale.set(1, h, 1); lift.beam.position.y = Y0 + h / 2;
    lift.beam.visible = lift.top > Y0 + 0.05;
  }
  placeLiftMeshes();

  // ---- データ ----
  function layout() {
    clearItems();
    const sorted = posts.slice().sort(SORTS[sortKey]).slice(0, MAXP);
    rows = Math.max(1, Math.ceil(sorted.length / COLS));
    items = sorted.map(makeItem);
    rebuildBoxes();
    loadThumbs();
  }
  function setData(d) {
    posts = (d.posts || []).filter((p) => !p.priv && !p.adminHidden && !p.needChange);
    users = d.users || {}; subCounts = d.subCounts || {};
    status = posts.length ? "" : "投稿はまだありません";
    layout();
  }
  function setSort(k) { if (!SORTS[k] || k === sortKey) return; sortKey = k; layout(); }
  // サムネイルの画像を、12まいずつ読む
  async function loadThumbs() {
    const need = items.map((it) => it.p).filter((p) => p.thumbOk && !thumbs.has(p.id) && !asked.has(p.id)).map((p) => p.id);
    for (let i = 0; i < need.length; i += 12) {
      const ids = need.slice(i, i + 12);
      ids.forEach((id) => asked.add(id));
      try {
        const r = await api({ action: "getThumbs", token: getToken(), ids });
        if (!r || !r.ok || !r.thumbs) continue;
        for (const id of Object.keys(r.thumbs)) {
          const data = r.thumbs[id];
          if (typeof data !== "string" || !data.startsWith("data:image/")) continue;
          const img = new Image();
          img.onload = () => { thumbs.set(id, img); for (const it of items) if (it.p.id === id) { drawFront(it); if (it.detMesh) drawDetail(it); } };
          img.src = data;
        }
      } catch (e) { /* 読めなくても、色の絵で出る */ }
    }
  }
  async function refresh() {
    if (busy) return; busy = true;
    try {
      const j = await api({ action: "list", token: getToken() });
      if (j && j.ok) { status = ""; setData({ posts: j.posts, users: j.users, subCounts: j.subCounts }); }
      else status = "投稿を読み込めませんでした";
    } catch (e) { status = "投稿を読み込めませんでした"; }
    busy = false;
  }

  return {
    group, collider, setData, setSort, refresh,
    get sortKey() { return sortKey; }, get items() { return items; }, get rows() { return rows; }, get lift() { return lift; },
    get status() { return status; },
    // 毎フレーム(体を動かす前に呼ぶ): リフトを動かす・箱の中に入ったらページを作る・データを読み直す
    update(dt, ctl, active) {
      const p = ctl.p;
      const inFoot = p.x > LIFT.x0 - 0.1 && p.x < LIFT.x1 + 0.1 && p.z > LIFT.z0 - 0.1 && p.z < LIFT.z1 + 0.1;
      const onLift = inFoot && Math.abs(p.y - lift.top) < 0.12 && p.vy <= 0.5 && !p.fly;
      ctl.riding = onLift;
      if (onLift) {
        const dir = (ctl.keys.Space ? 1 : 0) - (ctl.keys.Shift ? 1 : 0);
        const maxTop = Y0 + rows * ROWH;
        lift.top = Math.max(lift.base, Math.min(maxTop, lift.top + dir * LIFT.speed * dt));
        p.y = lift.top; p.vy = 0; p.ground = true;
        lift.rider = true;
      } else if (lift.rider) {
        lift.rider = false;
        if (lift.top > lift.base + 0.05) lift.top = lift.base;   // 足を踏み出したら、リフトは消えて、下に新しいのができる
      }
      placeLiftMeshes();
      // 中に入った箱
      let f = null;
      if (p.z < ZF + 2 && p.z > ZF - D - 1) for (const it of items) if (p.x > it.x0 && p.x < it.x0 + W && p.y > it.yb - 1 && p.y < it.yb + ROWH) { f = it; break; }
      if (f !== focus) { if (focus) freeDetail(focus); focus = f; if (f) buildDetail(f); }
      if (active) { refreshT -= dt; if (refreshT <= 0) { refreshT = 300; refresh(); } }
    },
  };
}
