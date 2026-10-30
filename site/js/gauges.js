// メーターパネルの3つの丸い画面。左=(準備中)、真ん中=ダッシュボード(投稿一覧)、右=掲示板(つぶやき)。
// 針は本物のメーターのように、プレイヤーの速さで動く。
const FONT = '"Hiragino Sans","Yu Gothic UI","Noto Sans JP","Noto Sans CJK JP",system-ui,sans-serif';
const ACC = "#6f9be8";

function fit(ctx, text, maxW) {   // はみ出さないように、文字を切る
  text = String(text || "").replace(/\s+/g, " ").trim();
  if (ctx.measureText(text).width <= maxW) return text;
  while (text.length > 1 && ctx.measureText(text + "…").width > maxW) text = text.slice(0, -1);
  return text + "…";
}
function wrap(ctx, text, maxW, maxLines) {
  text = String(text || "").replace(/\s+/g, " ").trim();
  const lines = [];
  let cur = "";
  for (const ch of text) {
    if (ctx.measureText(cur + ch).width > maxW) { lines.push(cur); cur = ch; if (lines.length >= maxLines) break; } else cur += ch;
  }
  if (lines.length < maxLines && cur) lines.push(cur);
  else if (lines.length >= maxLines) lines[maxLines - 1] = fit(ctx, lines[maxLines - 1] + "…", maxW);
  return lines;
}
function rrect(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

// 目盛りの輪(角度は、数学の向き(右が0、反時計まわり)で、度)
function dialFace(g, o) {
  const c = 256;
  g.fillStyle = "#08090b"; g.beginPath(); g.arc(c, c, 252, 0, 7); g.fill();
  g.strokeStyle = "#2b2e35"; g.lineWidth = 6; g.beginPath(); g.arc(c, c, 247, 0, 7); g.stroke();
  const a0 = o.from, sweep = o.sweep;
  for (let i = 0; i <= o.max / o.minor; i++) {
    const v = i * o.minor, a = ((a0 - (v / o.max) * sweep) * Math.PI) / 180, major = v % o.major === 0;
    const r1 = major ? 192 : 205, r2 = 224;
    g.strokeStyle = o.red && v >= o.red ? "#ff4a3a" : "#f0f0f0"; g.lineWidth = major ? 7 : 3;
    g.beginPath(); g.moveTo(c + Math.cos(a) * r1, c - Math.sin(a) * r1); g.lineTo(c + Math.cos(a) * r2, c - Math.sin(a) * r2); g.stroke();
    if (major) {
      g.fillStyle = o.red && v >= o.red ? "#ff4a3a" : "#fff"; g.font = "bold 30px " + FONT; g.textAlign = "center"; g.textBaseline = "middle";
      g.fillText(String(o.label ? o.label(v) : v), c + Math.cos(a) * 158, c - Math.sin(a) * 158);
    }
  }
}
function panel(g, x, y, w, h, title) {
  g.fillStyle = "rgba(12,24,44,.92)"; rrect(g, x, y, w, h, 14); g.fill();
  g.strokeStyle = ACC; g.lineWidth = 3; rrect(g, x, y, w, h, 14); g.stroke();
  g.fillStyle = ACC; g.font = "bold 22px " + FONT; g.textAlign = "left"; g.textBaseline = "middle";
  g.fillText(title, x + 16, y + 22);
}

export function createGauges(THREE, car, h) {
  const T = THREE, { ux, uy, uz, S } = h;
  const zf = -0.358;               // メーターのフードの前の面
  const specs = {
    left: { x: 0.24, r: 0.07 },
    center: { x: 0.395, r: 0.085 },
    right: { x: 0.55, r: 0.07 },
  };
  const out = { tex: {} };
  const state = { posts: null, tweets: null, note: "", msg: "" };
  const cv = {}, ctx = {};
  const needles = {};

  for (const k of Object.keys(specs)) {
    const sp = specs[k];
    cv[k] = document.createElement("canvas"); cv[k].width = cv[k].height = 512;
    ctx[k] = cv[k].getContext("2d");
    const tex = new T.CanvasTexture(cv[k]);
    tex.anisotropy = 8;
    out.tex[k] = tex;
    const mesh = new T.Mesh(new T.CircleGeometry(sp.r * S, 48), new T.MeshBasicMaterial({ map: tex }));
    mesh.position.set(ux(sp.x), uy(0.735), uz(zf) + 0.04);
    car.add(mesh);
    const ring = new T.Mesh(new T.TorusGeometry(sp.r * S, 0.012 * S, 8, 48), new T.MeshPhongMaterial({ color: 0x9a9da4, shininess: 80 }));
    ring.position.set(ux(sp.x), uy(0.735), uz(zf) + 0.06);
    car.add(ring);
    // 針(中心から外へ)
    const len = sp.r * S * 0.78;
    const g = new T.BoxGeometry(len, 0.005 * S, 0.004 * S);
    g.translate(len / 2 - len * 0.12, 0, 0);
    const needle = new T.Mesh(g, new T.MeshBasicMaterial({ color: k === "center" ? 0xff3b2a : 0xff6a2a }));
    needle.position.set(ux(sp.x), uy(0.735), uz(zf) + 0.1);
    car.add(needle);
    needles[k] = needle;
    const cap = new T.Mesh(new T.CircleGeometry(0.012 * S, 16), new T.MeshBasicMaterial({ color: 0x15161a }));
    cap.position.set(ux(sp.x), uy(0.735), uz(zf) + 0.12);
    car.add(cap);
  }

  function drawLeft() {
    const g = ctx.left;
    dialFace(g, { from: 225, sweep: 270, max: 8, major: 1, minor: 0.5, red: 7 });
    g.fillStyle = "#cfd2d8"; g.font = "20px " + FONT; g.textAlign = "center"; g.fillText("x1000r/min", 256, 316);
    panel(g, 116, 168, 280, 100, "メニュー");
    g.fillStyle = "#9aa4b6"; g.font = "22px " + FONT; g.textAlign = "left";
    g.fillText(state.note || "(じゅんび中)", 132, 236);
    out.tex.left.needsUpdate = true;
  }
  function drawCenter() {
    const g = ctx.center;
    dialFace(g, { from: 225, sweep: 270, max: 180, major: 20, minor: 10 });
    g.fillStyle = "#cfd2d8"; g.font = "20px " + FONT; g.textAlign = "center"; g.fillText("km/h", 256, 440);
    panel(g, 96, 164, 320, 236, "ダッシュボード");
    g.textBaseline = "middle"; g.textAlign = "left";
    const posts = state.posts;
    if (!posts) {
      g.fillStyle = "#9aa4b6"; g.font = "22px " + FONT; g.fillText(state.msg || "よみこみ中…", 112, 280);
    } else if (!posts.length) {
      g.fillStyle = "#9aa4b6"; g.font = "22px " + FONT; g.fillText("まだ投稿がありません", 112, 280);
    } else {
      const page = state.page || 0, per = 4, n = Math.max(1, Math.ceil(posts.length / per));
      const list = posts.slice((page % n) * per, (page % n) * per + per);
      list.forEach((p, i) => {
        const y = 212 + i * 44;
        g.fillStyle = "#fff"; g.font = "bold 22px " + FONT; g.fillText(fit(g, p.title, 290), 112, y);
        g.fillStyle = "#8fa3c8"; g.font = "16px " + FONT; g.fillText(fit(g, (p.author || "") + (p.cat ? "  ・  " + p.cat : ""), 290), 112, y + 21);
      });
      g.fillStyle = "#8fa3c8"; g.font = "15px " + FONT; g.textAlign = "right"; g.fillText((page % n) + 1 + " / " + n, 400, 186);
    }
    out.tex.center.needsUpdate = true;
  }
  function drawRight() {
    const g = ctx.right;
    dialFace(g, { from: 225, sweep: 270, max: 4, major: 1, minor: 0.5, label: (v) => ["E", "", "½", "", "F"][v] || "" });
    panel(g, 100, 164, 312, 236, "掲示板");
    g.textBaseline = "middle"; g.textAlign = "left";
    const tw = state.tweets;
    if (!tw) {
      g.fillStyle = "#9aa4b6"; g.font = "22px " + FONT; g.fillText(state.msg || "よみこみ中…", 116, 280);
    } else if (!tw.length) {
      g.fillStyle = "#9aa4b6"; g.font = "22px " + FONT; g.fillText("まだつぶやきがありません", 116, 280);
    } else {
      const page = state.tpage || 0, per = 3, n = Math.max(1, Math.ceil(tw.length / per));
      const list = tw.slice((page % n) * per, (page % n) * per + per);
      list.forEach((t, i) => {
        const y = 204 + i * 64;
        g.fillStyle = "#8fa3c8"; g.font = "bold 16px " + FONT; g.fillText(fit(g, t.name, 280), 116, y);
        g.fillStyle = "#fff"; g.font = "19px " + FONT;
        wrap(g, t.text, 280, 2).forEach((ln, j) => g.fillText(ln, 116, y + 22 + j * 21));
      });
      g.fillStyle = "#8fa3c8"; g.font = "15px " + FONT; g.textAlign = "right"; g.fillText((page % n) + 1 + " / " + n, 396, 186);
    }
    out.tex.right.needsUpdate = true;
  }
  drawLeft(); drawCenter(); drawRight();

  const redraw = () => { drawCenter(); drawRight(); drawLeft(); };
  out.setPosts = (list) => { state.posts = list; state.page = 0; drawCenter(); };
  out.setTweets = (list) => { state.tweets = list; state.tpage = 0; drawRight(); };
  out.setMessage = (m) => { state.msg = m; if (!state.posts || !state.tweets) redraw(); };
  out.setNote = (m) => { state.note = m; drawLeft(); };
  // 数秒ごとにページを送る
  let pt = 0;
  out.tick = (dt, kmh) => {
    pt += dt;
    if (pt > 6) { pt = 0; state.page = (state.page || 0) + 1; state.tpage = (state.tpage || 0) + 1; drawCenter(); drawRight(); }
    const sp = Math.min(kmh, 180);
    needles.center.rotation.z = ((225 - (sp / 180) * 270) * Math.PI) / 180;
    const rpm = Math.min(8, 0.9 + kmh / 40);
    needles.left.rotation.z = ((225 - (rpm / 8) * 270) * Math.PI) / 180;
    needles.right.rotation.z = ((225 - 0.75 * 270) * Math.PI) / 180;   // 燃料は、まあまあ入っている
  };
  return out;
}
