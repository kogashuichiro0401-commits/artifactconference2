// 壁の大きなディスプレイ: artifact学会のダッシュボード。
// 世界の壁(z=0 のブロック)の手前の面に、x=1〜48・y=1〜30 のマスをおおう大きさで貼る(ブロックではなく、画面だけの表示)。
// 投稿一覧は、絵(テクスチャ)をずらすだけでゆっくり下へ流れ続ける。いちばん下まで来たら、先頭がつながって、また出てくる(ループ)。
// 表示するのは、だれにでも見える投稿・つぶやきだけ(非公開・非表示のものは出さない)。

const BW = 48, BH = 30;          // ディスプレイの大きさ(ブロック数)
const P = 48;                    // 1ブロックあたりのピクセル数
const X0 = 0.5, Y1 = 30.5;       // 左のはし(x=1のセルの左がわ)、上のはし(y=30のセルの上がわ)。壁の手前の面は z=0.5
const Z = 0.5 + 0.015;
const FONT = "'Hiragino Sans','Noto Sans JP','Yu Gothic','Meiryo',sans-serif";
// 一覧の窓(パネル上のピクセル)
const LIST = { x: 60, y: 440, w: 1340, h: 940 };
const ROW_H = 144, MAX_ROWS = 28, MIN_ROWS = 8;
const SPEED = 0.8;               // 一覧の流れる速さ(ブロック/秒)
const REFRESH_MS = 60000;

const CAT_COLORS = ["#4f8cff", "#ff7a59", "#35c28b", "#c77dff", "#ffb703", "#2ec4d6", "#ef476f", "#8ac926"];
const hashColor = (s) => { let h = 0; for (const c of String(s || "")) h = (h * 31 + c.charCodeAt(0)) >>> 0; return CAT_COLORS[h % CAT_COLORS.length]; };

function fit(ctx, text, maxW) {
  text = String(text || "");
  if (ctx.measureText(text).width <= maxW) return text;
  let lo = 0, hi = text.length;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (ctx.measureText(text.slice(0, mid) + "…").width <= maxW) lo = mid; else hi = mid - 1; }
  return text.slice(0, lo) + "…";
}
function wrap(ctx, text, maxW, maxLines) {
  const lines = []; let cur = "";
  for (const ch of String(text || "").replace(/\s+/g, " ")) {
    if (ctx.measureText(cur + ch).width > maxW) { lines.push(cur); cur = ch; if (lines.length === maxLines) break; } else cur += ch;
  }
  if (lines.length < maxLines && cur) lines.push(cur);
  else if (lines.length === maxLines) lines[maxLines - 1] = fit(ctx, lines[maxLines - 1] + "…", maxW);
  return lines;
}
const md = (t) => { const d = new Date(Number(t) || 0); return (d.getMonth() + 1) + "/" + d.getDate(); };
const rr = (ctx, x, y, w, h, r) => { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); };

export function createDisplay(THREE, scene, { api, getToken }) {
  const cx = (px) => X0 + px / P, cy = (py) => Y1 - py / P;
  const group = new THREE.Group();
  scene.add(group);
  const tex = (cv) => { const t = new THREE.CanvasTexture(cv); t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter; t.anisotropy = 4; return t; };
  const plane = (w, h, map, z) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map, transparent: true, fog: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
    m.position.z = z; group.add(m); return m;
  };

  // --- 台紙(見出し・数字・カテゴリ・つぶやき) ---
  const panel = document.createElement("canvas"); panel.width = BW * P; panel.height = BH * P;
  const panelTex = tex(panel);
  const panelMesh = plane(BW, BH, panelTex, Z);
  panelMesh.position.set(cx(BW * P / 2), cy(BH * P / 2), Z);

  // --- 時計 ---
  const clock = document.createElement("canvas"); clock.width = 720; clock.height = 150;
  const clockTex = tex(clock);
  const clockMesh = plane(720 / P, 150 / P, clockTex, Z + 0.004);
  clockMesh.position.set(cx(1560 + 360), cy(10 + 75), Z + 0.004);

  // --- 一覧(流れる) ---
  const listCv = document.createElement("canvas"); listCv.width = LIST.w; listCv.height = ROW_H * MIN_ROWS;
  const listTex = tex(listCv);
  listTex.wrapS = THREE.ClampToEdgeWrapping; listTex.wrapT = THREE.RepeatWrapping;
  const listMesh = plane(LIST.w / P, LIST.h / P, listTex, Z + 0.004);
  listMesh.position.set(cx(LIST.x + LIST.w / 2), cy(LIST.y + LIST.h / 2), Z + 0.004);

  let data = { posts: [], tweets: [], users: {}, error: "読み込み中…", at: 0 };
  let off = 0, rows = MIN_ROWS, clockT = 0, refreshT = 0, busy = false;

  function drawPanel() {
    const c = panel.getContext("2d"), W = panel.width, H = panel.height;
    const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "#111a30"); g.addColorStop(1, "#0a0f1c");
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    c.strokeStyle = "#2a3a66"; c.lineWidth = 8; c.strokeRect(4, 4, W - 8, H - 8);
    c.textBaseline = "alphabetic";
    // 見出し
    c.fillStyle = "#ffffff"; c.font = `bold 84px ${FONT}`; c.fillText("artifact学会。", 60, 105);
    const tw0 = c.measureText("artifact学会。").width;
    c.fillStyle = "#6fa3ff"; c.font = `bold 46px ${FONT}`; c.fillText("ダッシュボード", 60 + tw0 + 36, 105);
    c.fillStyle = "#7d8bb3"; c.font = `28px ${FONT}`;
    c.fillText(data.error ? data.error : "更新: " + new Date(data.at).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" }) + "(1分ごとに自動で更新)", 64, 150);
    const posts = data.posts, now = Date.now();
    const authors = new Set(posts.map((p) => p.uid));
    const stats = [
      ["投稿", posts.length, "#4f8cff"],
      ["24時間の投稿", posts.filter((p) => now - Number(p.createdAt) < 86400000).length, "#35c28b"],
      ["投稿した人", authors.size, "#c77dff"],
      ["閲覧の合計", posts.reduce((a, p) => a + (p.views || 0), 0), "#ffb703"],
      ["高評価の合計", posts.reduce((a, p) => a + (p.likes || 0), 0), "#ef476f"],
    ];
    const cw = (W - 120 - 24 * 4) / 5;
    stats.forEach(([label, val, col], i) => {
      const x = 60 + i * (cw + 24), y = 190;
      c.fillStyle = "#18233f"; rr(c, x, y, cw, 180, 22); c.fill();
      c.fillStyle = col; rr(c, x, y, 12, 180, 6); c.fill();
      c.fillStyle = "#9fb0d9"; c.font = `30px ${FONT}`; c.fillText(label, x + 40, y + 55);
      c.fillStyle = "#fff"; c.font = `bold 84px ${FONT}`; c.fillText(Number(val).toLocaleString("ja-JP"), x + 40, y + 148);
    });
    // 見出し(一覧・カテゴリ・つぶやき)
    c.fillStyle = "#cfd9f5"; c.font = `bold 40px ${FONT}`;
    c.fillText("投稿一覧(新しい順)", LIST.x, 415);
    c.fillText("カテゴリ別の投稿", 1450, 415);
    c.fillStyle = "#18233f"; rr(c, LIST.x - 14, LIST.y - 14, LIST.w + 28, LIST.h + 28, 22); c.fill();
    // カテゴリ
    const cnt = {}; posts.forEach((p) => { const k = p.cat || "(なし)"; cnt[k] = (cnt[k] || 0) + 1; });
    const cats = Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 6), mx = cats.length ? cats[0][1] : 1;
    cats.forEach(([name, n], i) => {
      const y = 450 + i * 66;
      c.fillStyle = "#e6ecff"; c.font = `32px ${FONT}`; c.fillText(fit(c, name, 250), 1450, y + 36);
      const bw = 420 * n / mx;
      c.fillStyle = hashColor(name); rr(c, 1720, y + 6, Math.max(14, bw), 40, 10); c.fill();
      c.fillStyle = "#fff"; c.font = `bold 32px ${FONT}`; c.fillText(String(n), 1720 + Math.max(14, bw) + 16, y + 38);
    });
    // つぶやき
    c.fillStyle = "#cfd9f5"; c.font = `bold 40px ${FONT}`; c.fillText("新しいつぶやき", 1450, 905);
    const tw = data.tweets.slice(0, 4);
    tw.forEach((t, i) => {
      const y = 935 + i * 112;
      c.fillStyle = "#18233f"; rr(c, 1450, y, 794, 100, 16); c.fill();
      const u = data.users[t.uid] || {};
      c.fillStyle = "#6fa3ff"; c.font = `bold 26px ${FONT}`; c.fillText(fit(c, u.name || "だれか", 500), 1474, y + 34);
      c.fillStyle = "#7d8bb3"; c.font = `24px ${FONT}`; const d = md(t.createdAt); c.fillText(d, 2244 - 24 - c.measureText(d).width, y + 34);
      c.fillStyle = "#e6ecff"; c.font = `28px ${FONT}`;
      const ls = wrap(c, t.text, 746, 2); ls.forEach((l, k) => c.fillText(l, 1474, y + 64 + k * 30));
    });
    if (!tw.length) { c.fillStyle = "#7d8bb3"; c.font = `30px ${FONT}`; c.fillText("つぶやきはまだありません", 1474, 990); }
    panelTex.needsUpdate = true;
  }

  function drawList() {
    const posts = data.posts, n = posts.length;
    rows = n ? Math.min(MAX_ROWS, Math.max(MIN_ROWS, n)) : MIN_ROWS;
    listCv.width = LIST.w; listCv.height = ROW_H * rows;
    const c = listCv.getContext("2d");
    c.fillStyle = "#18233f"; c.fillRect(0, 0, listCv.width, listCv.height);
    c.textBaseline = "alphabetic";
    for (let i = 0; i < rows; i++) {
      const y = i * ROW_H;
      c.fillStyle = i % 2 ? "#1b2846" : "#16213b"; c.fillRect(0, y, LIST.w, ROW_H);
      if (!n) { if (i === 3) { c.fillStyle = "#7d8bb3"; c.font = `34px ${FONT}`; c.fillText(data.error || "投稿はまだありません", 40, y + 80); } continue; }
      const p = posts[i % n];
      const col = hashColor(p.cat);
      c.fillStyle = col; c.fillRect(0, y + 14, 10, ROW_H - 28);
      c.fillStyle = "#ffffff"; c.font = `bold 44px ${FONT}`; c.fillText(fit(c, p.title, LIST.w - 380), 36, y + 62);
      c.fillStyle = "#9fb0d9"; c.font = `28px ${FONT}`;
      c.fillText(fit(c, (p.author || "") + "   ・   " + md(p.createdAt), 520), 36, y + 112);
      // カテゴリのチップ
      const cat = p.cat || "";
      if (cat) { c.font = `bold 26px ${FONT}`; const tw = Math.min(260, c.measureText(cat).width + 36); c.fillStyle = col; rr(c, 580, y + 82, tw, 40, 20); c.fill(); c.fillStyle = "#0a0f1c"; c.fillText(fit(c, cat, tw - 24), 598, y + 111); }
      // 数字(右がわ)
      c.textAlign = "right"; c.fillStyle = "#ffd166"; c.font = `bold 34px ${FONT}`; c.fillText("高評価 " + (p.likes || 0), LIST.w - 30, y + 62);
      c.fillStyle = "#9fb0d9"; c.font = `28px ${FONT}`; c.fillText("閲覧 " + (p.views || 0).toLocaleString("ja-JP"), LIST.w - 30, y + 112);
      c.textAlign = "left";
    }
    listTex.repeat.set(1, LIST.h / listCv.height);
    listTex.needsUpdate = true;
  }

  function drawClock() {
    const c = clock.getContext("2d"), d = new Date();
    c.clearRect(0, 0, clock.width, clock.height);
    c.textAlign = "right"; c.textBaseline = "alphabetic";
    c.fillStyle = "#ffffff"; c.font = `bold 84px ${FONT}`;
    c.fillText(d.toLocaleTimeString("ja-JP", { hour12: false }), 690, 90);
    c.fillStyle = "#9fb0d9"; c.font = `32px ${FONT}`;
    c.fillText(d.toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric", weekday: "short" }), 690, 135);
    clockTex.needsUpdate = true;
  }

  // 見せてよい投稿だけにして、画面に反映
  function setData(d) {
    const pub = (d.posts || []).filter((p) => !p.priv && !p.adminHidden && !p.needChange);
    data = { posts: pub, tweets: (d.tweets || []).filter((t) => !t.adminHidden && !t.parentId), users: d.users || {}, error: d.error || "", at: Date.now() };
    drawPanel(); drawList();
  }

  async function refresh() {
    if (busy) return;
    busy = true;
    try {
      const token = getToken();
      const [a, b] = await Promise.all([api({ action: "list", token }), api({ action: "listTweets", token })]);
      if (a && a.ok) setData({ posts: a.posts, tweets: b && b.ok ? b.tweets : [], users: b && b.ok ? b.users : {} });
      else { data.error = "投稿を読み込めませんでした"; drawPanel(); drawList(); }
    } catch (e) { data.error = "投稿を読み込めませんでした"; drawPanel(); drawList(); }
    busy = false;
  }

  drawPanel(); drawList(); drawClock();
  off = 1 - listTex.repeat.y;

  return {
    group, setData, refresh,
    // 毎フレーム: 一覧を下へ流す(絵のずらしだけ)。ログイン中は1分ごとに読み直す
    update(dt, active) {
      off -= (SPEED * P / listCv.height) * dt;   // 窓が下へ動く = 中身が上へ流れる
      if (off < -100) off += 100;
      listTex.offset.set(0, off - Math.floor(off));
      clockT += dt;
      if (clockT >= 1) { clockT = 0; drawClock(); }
      if (active) { refreshT -= dt * 1000; if (refreshT <= 0) { refreshT = REFRESH_MS; refresh(); } }
    },
  };
}
