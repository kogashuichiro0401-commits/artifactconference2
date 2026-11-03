// 投稿ホール(北)と、つぶやきホール(南)。
//  ・投稿: 1件が、ひとつの大きな箱(前面 30×30、奥行き 30)。横に3列、上から下へ積む(すきまをあける)
//    前面はサイトのカードと同じ。サムネイルの部分だけ、通りぬけて中に入れる。中の奥の壁に、投稿のページ
//  ・つぶやき: 掲示板の左(タイムライン)と同じ形の、大きな縦長の壁。上から下へ1件ずつ
//  ・はじまりの板の北と南に、リフト。Shift: リフト1枚ぶん前へ出てから下へ。Space: 上へ、もどる
//  ・はじまりの場所の右に、ななめにうかぶ台: 投稿(ツイートする)ボタンと、並べ替え
//  ・カードのアイコン・⋮、つぶやき、ページの投稿者などを押すと、ウィンドウが出る(ui.*)
// 箱・壁・リフトは、ブロックではなく画面だけの展示物。当たり判定は、ここで持っている(world.virtual)。
import * as SC from "./sitecards.js";

const W = 30, ROWH = 30, Y0 = 0.5, FRONT = 40.5, D = 20;   // 前面は、はじまりの場所から 40.5(1段目の上のふちが画面のいちばん上)。奥行き 20
const PITCH_X = 33.5, PITCH_Y = 31.5;              // 箱どうしの間かく(となりとは、少しだけすきまをあける)
const THUMB = W * 9 / 16, OPEN_Y = ROWH - THUMB;   // サムネイル(16:9)の高さ / その下のはし。箱の中は、サムネのうしろだけ
const IN_H = ROWH - 0.5 - OPEN_Y;                  // 箱の中の高さ
const MAXN = 150;
const CARD_W = 330, FS = 512;                      // カードの幅(サイトのpx)/ 前面の絵の大きさ
// 奥の壁: サイトの画面(はば1280px)。上の見出しは止まったまま、下はホイールでスクロール
const VIEW_W = 1280, VIEW_H = Math.round(IN_H / W * VIEW_W), BAR_H = 60, PAGE_W = 1240, PAGE_X = 20, PAGE_H = 1500, PAGE_S = 1.5, K = W / VIEW_W;
const NEAR = 120, FAR = 160, TEX_PER_FRAME = 2, TEX_MAX = 48;
const LIFT_V = 24, LIFT_SLIDE = 3;
// つぶやきの壁
const TW_W = 600, TW_S = 1.6, TW_K = 0.08;         // サイトのpx / 絵の倍率 / 1pxが何ブロック(600px = 48ブロック)
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

const SHELL = [
  [-16, -0.5, -(D + 1), -15, ROWH, 0],       // 左の壁
  [15, -0.5, -(D + 1), 16, ROWH, 0],         // 右の壁
  [-15, -0.5, -(D + 1), 15, ROWH, -D],       // 奥の壁
  [-15, -0.5, -D, 15, OPEN_Y, 0],            // 下(カードの文字の部分のうしろは、つまっている。上の面が、中の床)
  [-15, ROWH - 0.5, -D, 15, ROWH, 0],        // 天井
];

export function createHalls(THREE, scene, { api, getToken, buttons, getMe, say, onBack, ui }) {
  // ---- 箱の形: 壁・床・天井を1つにまとめ、面の向きで少しだけ明るさを変える(色はサイトの白) ----
  const shellGeo = (() => {
    const pos = [], col = [];
    for (const b of SHELL) {
      const g = new THREE.BoxGeometry(b[3] - b[0], b[4] - b[1], b[5] - b[2]).toNonIndexed();
      g.translate((b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2);
      const P = g.attributes.position.array, N = g.attributes.normal.array;
      for (let i = 0; i < P.length; i += 3) {
        pos.push(P[i], P[i + 1], P[i + 2]);
        const n = [N[i], N[i + 1], N[i + 2]];
        const v = n[1] < -0.5 ? 0.97 : 1;   // サイトと同じ白(形は、ふちの線で見せる)
        col.push(v, v, v);
      }
      g.dispose();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    return g;
  })();
  const shellMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  const edgeGeo = (() => {   // ふちの線(サイトの線の色)
    const v = [];
    for (const b of SHELL) { const e = new THREE.EdgesGeometry(new THREE.BoxGeometry(b[3] - b[0], b[4] - b[1], b[5] - b[2])); e.translate((b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2); v.push(...e.attributes.position.array); e.dispose(); }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(v, 3)); return g;
  })();
  const edgeMat = new THREE.LineBasicMaterial({ color: 0xdcdcdc });
  // ---- マイクラの影(角のかげ): 箱の中の、面と面がまじわる角を暗くする ----
  function aoTex(wb, hb, e) {   // wb×hb ブロックの面。e = [左, 右, 上, 下] のどのふちを暗くするか
    const P = 12, c = document.createElement("canvas"); c.width = Math.round(wb * P); c.height = Math.round(hb * P);
    const g = c.getContext("2d"), r = 1.1 * P, A = 0.34;
    const band = (x0, y0, x1, y1, w, h) => { const gr = g.createLinearGradient(x0, y0, x1, y1); gr.addColorStop(0, `rgba(0,0,0,${A})`); gr.addColorStop(0.45, `rgba(0,0,0,${A * 0.35})`); gr.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = gr; g.fillRect(...w, ...h); };
    if (e[0]) band(0, 0, r, 0, [0, 0], [r, c.height]);
    if (e[1]) band(c.width, 0, c.width - r, 0, [c.width - r, 0], [r, c.height]);
    if (e[2]) band(0, 0, 0, r, [0, 0], [c.width, r]);
    if (e[3]) band(0, c.height, 0, c.height - r, [0, c.height - r], [c.width, r]);
    const t = new THREE.CanvasTexture(c); t.minFilter = THREE.LinearFilter; return t;
  }
  const aoMat = (t) => new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, toneMapped: false, fog: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  const AO = (() => {
    const yc = OPEN_Y + IN_H / 2, list = [];
    const add = (geo, tex, f) => { const m = new THREE.Mesh(geo, aoMat(tex)); f(m); list.push(m); };
    add(new THREE.PlaneGeometry(W, D), aoTex(W, D, [1, 1, 1, 0]), (m) => { m.rotation.x = -Math.PI / 2; m.position.set(0, OPEN_Y + 0.01, -D / 2); });          // 床
    add(new THREE.PlaneGeometry(W, D), aoTex(W, D, [1, 1, 0, 1]), (m) => { m.rotation.x = Math.PI / 2; m.position.set(0, ROWH - 0.51, -D / 2); });          // 天井
    add(new THREE.PlaneGeometry(D, IN_H), aoTex(D, IN_H, [0, 1, 1, 1]), (m) => { m.rotation.y = Math.PI / 2; m.position.set(-14.99, yc, -D / 2); });       // 左の壁
    add(new THREE.PlaneGeometry(D, IN_H), aoTex(D, IN_H, [1, 0, 1, 1]), (m) => { m.rotation.y = -Math.PI / 2; m.position.set(14.99, yc, -D / 2); });      // 右の壁
    add(new THREE.PlaneGeometry(W, IN_H), aoTex(W, IN_H, [1, 1, 1, 1]), (m) => { m.position.set(0, yc, -D + 0.01); });                                     // 奥の壁
    return list;
  })();
  function aoGroup() { const g = new THREE.Group(); for (const m of AO) { const c = new THREE.Mesh(m.geometry, m.material); c.position.copy(m.position); c.rotation.copy(m.rotation); c.renderOrder = 1; g.add(c); } return g; }
  // 中から見たサムネ(裏から見るので、左右が反対。カードの絵の上の 9/16 だけ)
  const innerGeo = (() => {
    const g = new THREE.PlaneGeometry(W, THUMB), uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, 1 - uv.getX(i), 1 - THUMB / ROWH + uv.getY(i) * THUMB / ROWH);
    return g;
  })();
  const frontGeo = new THREE.PlaneGeometry(W, ROWH);

  const avatars = new Map();
  function avatarImg(uid, src, cb) {
    if (!src || typeof src !== "string" || !src.startsWith("data:image/")) return null;
    const e = avatars.get(uid);
    if (e) { if (e.ok) return e.img; if (cb) e.wait.push(cb); return null; }
    const n = { ok: false, img: new Image(), wait: cb ? [cb] : [] };
    avatars.set(uid, n);
    n.img.onload = () => { n.ok = true; n.wait.forEach((f) => f()); n.wait = []; };
    n.img.src = src;
    return null;
  }

  // ==== ホール ====
  function makeHall(kind, s) {
    const H = { kind, s, items: [], sort: "new", rows: 1, data: [], users: {}, extra: {}, images: new Map(), asked: new Set(), anim: null, seg: [], height: 30 };
    H.root = new THREE.Group(); scene.add(H.root);
    H.slotPos = (i) => { const row = Math.floor(i / 3), col = i % 3; return { u: (col - 1) * PITCH_X, y: Y0 - row * PITCH_Y }; };
    H.world = (u, y) => [s < 0 ? u : -u, y, s * FRONT];
    H.bottom = () => (kind === "post" ? Y0 - (H.rows - 1) * PITCH_Y : Y0 + ROWH - H.height);
    return H;
  }
  const halls = [makeHall("post", -1), makeHall("tweet", 1)];
  const [PH, TH] = halls;

  // ==== はじまりの場所の右の台(投稿/ツイートするボタン + 並べ替え) ====
  function makeKiosk(H) {
    const s = H.s, g = new THREE.Group();
    const cx = -s * 5.2, cz = s * 0.4;   // 北を向いたときの右 = +x、南を向いたときの右 = -x
    g.position.set(cx, 1.45, cz);
    g.rotation.order = "YXZ";
    g.rotation.y = Math.atan2(0 - cx, 0 - cz); g.rotation.x = -0.42;   // はじまりの場所の方へ、ななめに向ける(上を向いて、立っている人の目に向く)
    scene.add(g);
    const ppb = 110, bh = 0.62, bw = 1.25;
    const main = H.kind === "post"
      ? { label: "投稿", icon: "plus", style: "pill", onPress: () => ui.postForm() }
      : { label: "ツイートする", icon: "edit", style: "primary", onPress: () => ui.tweetForm() };
    buttons.add({ parent: g, x: 0, y: 0.5, z: 0, w: H.kind === "post" ? 1.5 : 2.4, h: bh * 1.05, pxPerBlock: ppb, cssH: 44, face: main, onPress: main.onPress });
    const opts = H.kind === "post" ? [["popular", "人気順"], ["new", "新しい順"], ["old", "古い順"]] : [["new", "新しい順"], ["popular", "人気順"], ["old", "古い順"]];
    opts.forEach(([key, label], i) => {
      const b = buttons.add({ parent: g, x: (i - 1) * bw, y: -0.32, z: 0, w: bw - 0.02, h: bh, pxPerBlock: ppb, cssH: 44, sticky: true,
        face: { label, style: i === 0 ? "sort-l" : i === 2 ? "sort-r" : "sort", pressed: key === H.sort },
        onPress: () => setSort(H, key) });
      H.seg.push([key, b]);
    });
  }
  halls.forEach(makeKiosk);

  // ======== 投稿の箱 ========
  function makeItem(H, d, i) {
    const g = new THREE.Group();
    g.rotation.y = H.s < 0 ? 0 : Math.PI;
    g.add(new THREE.Mesh(shellGeo, shellMat), new THREE.LineSegments(edgeGeo, edgeMat), aoGroup());
    const it = { H, d, id: d.id, slot: i, cur: H.slotPos(i), g, cv: null, tex: null, front: null, inner: null, page: null, dist: 1e9 };
    const mk = () => new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, toneMapped: false });
    it.front = new THREE.Mesh(frontGeo, mk()); it.front.position.set(0, ROWH / 2, 0.03); it.front.renderOrder = 3;
    it.inner = new THREE.Mesh(innerGeo, mk()); it.inner.position.set(0, OPEN_Y + THUMB / 2, -0.03); it.inner.rotation.y = Math.PI; it.inner.renderOrder = 3;
    it.front.userData.item = it; it.inner.userData.item = it;
    g.add(it.front, it.inner);
    H.root.add(g);
    placeItem(it, 0);
    return it;
  }
  function placeItem(it, pull) {
    const w = it.H.world(it.cur.u, it.cur.y);
    it.g.position.set(w[0], w[1], w[2] + it.H.s * -(pull || 0));
  }
  function freeTex(it) {
    if (!it.cv) return;
    it.front.material.map = null; it.inner.material.map = null; it.front.material.needsUpdate = it.inner.material.needsUpdate = true;
    it.tex.dispose(); it.cv = it.tex = null;
  }
  function dropItem(it) { freeTex(it); freePage(it); it.H.root.remove(it.g); it.front.material.dispose(); it.inner.material.dispose(); }
  function ensureTex(it) {
    if (it.cv) return;
    it.cv = document.createElement("canvas"); it.cv.width = it.cv.height = FS;
    it.tex = new THREE.CanvasTexture(it.cv); it.tex.generateMipmaps = false; it.tex.minFilter = THREE.LinearFilter; it.tex.anisotropy = 4;
    it.front.material.map = it.tex; it.inner.material.map = it.tex;
    it.front.material.needsUpdate = it.inner.material.needsUpdate = true;
    drawFront(it);
  }
  const redraw = (it) => () => { if (it.cv) drawFront(it); if (it.page) drawPage(it); };
  function cardInfo(H, d, it) {
    const u = H.users[d.uid] || {};
    const info = { avatar: avatarImg(d.uid, u.avatar, redraw(it)), handle: u.handle || "", menu: true, thumbAlpha: 0.5, name: u.name || d.author || "チャンネル" };
    const ex = H.extra;
    info.kids = H.data.some((x) => x.parentId === d.id);
    const par = d.parentId ? H.data.find((x) => x.id === d.parentId) : null;
    info.parentTitle = par ? par.title : "";
    info.subs = (ex.subCounts || {})[d.uid] || 0;
    info.rx = (ex.myRx || {})[d.id] || ""; info.saved = !!(ex.mySaves || {})[d.id];
    info.subbed = (ex.mySubs || []).indexOf(d.uid) >= 0;
    const me = getMe(); info.mine = !!me && me.uid === d.uid;
    const img = H.images.get(d.id);
    if (img) info.thumb = img;
    else {
      let sync = true;
      SC.coverImage(d, (im) => { it._cover = im; info.thumb = im; if (!sync && !H.images.get(d.id)) { if (it.cv) drawFront(it); if (it.page) drawPage(it); } });
      sync = false;
      if (!info.thumb) info.thumb = it._cover || null;
    }
    return info;
  }
  function drawFront(it) {
    const c = it.cv.getContext("2d");
    SC.drawPostCard(c, it.d, cardInfo(it.H, it.d, it), CARD_W, FS / CARD_W);
    it.tex.needsUpdate = true;
  }
  // ---- 奥の壁のページ ----
  function ensurePage(it) {
    if (it.page) return;
    const mk = (w, h) => { const cv = document.createElement("canvas"); cv.width = w; cv.height = h; const tex = new THREE.CanvasTexture(cv); tex.generateMipmaps = false; tex.minFilter = THREE.LinearFilter; tex.anisotropy = 8; return { cv, tex }; };
    const bar = mk(VIEW_W * PAGE_S, BAR_H * PAGE_S), body = mk(VIEW_W * PAGE_S, PAGE_H * PAGE_S);
    body.tex.wrapT = THREE.ClampToEdgeWrapping;
    const top = ROWH - 0.5, bh = BAR_H * K, vh = (VIEW_H - BAR_H) * K;
    const barMesh = new THREE.Mesh(new THREE.PlaneGeometry(W, bh), new THREE.MeshBasicMaterial({ map: bar.tex, toneMapped: false, fog: false }));
    barMesh.position.set(0, top - bh / 2, -D + 0.03);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(W, vh), new THREE.MeshBasicMaterial({ map: body.tex, toneMapped: false, fog: false }));
    mesh.position.set(0, top - bh - vh / 2, -D + 0.02);
    mesh.userData.page = it; barMesh.userData.page = it;
    const grp = new THREE.Group(); grp.add(barMesh, mesh); it.g.add(grp);
    it.page = { bar, body, mesh, barMesh, grp, top, btns: [], spots: [], comments: null, key: "", scroll: 0, maxScroll: 0 };
    drawBar(it); drawPage(it);
    loadComments(it);
  }
  function freePage(it) {
    if (!it.page) return;
    const pg = it.page;
    for (const b of pg.btns) b.dispose();
    it.g.remove(pg.grp);
    for (const m of [pg.mesh, pg.barMesh]) { m.geometry.dispose(); m.material.dispose(); }
    pg.bar.tex.dispose(); pg.body.tex.dispose();
    it.page = null;
  }
  // サイトの上の見出し(ロゴ・投稿・掲示板・更新履歴・通知・アイコン)
  function drawBar(it) {
    const c = it.page.bar.cv.getContext("2d"), S = PAGE_S, me = getMe();
    c.fillStyle = SC.C.bg; c.fillRect(0, 0, VIEW_W * S, BAR_H * S);
    c.fillStyle = SC.C.line; c.fillRect(0, (BAR_H - 1) * S, VIEW_W * S, S);
    c.font = `900 ${20 * S}px ${SC.FONT}`; c.fillStyle = SC.C.fg; c.textBaseline = "middle";
    c.fillText("artifact", 24 * S, 30 * S); const aw = c.measureText("artifact").width;
    c.fillStyle = SC.C.accent; c.fillText("学会。", 24 * S + aw, 30 * S); c.textBaseline = "alphabetic";
    let x = VIEW_W - 24 - 44;
    SC.drawAvatar(c, (x + 4) * S, 12 * S, 36 * S, me ? me.name : "？", me ? me.uid : "", null);
    for (const ic of ["bell", "log", "board"]) { x -= 54; c.fillStyle = SC.C.surface; SC.rr(c, x * S, 8 * S, 44 * S, 44 * S, 22 * S); c.fill(); SC.drawIcon(c, ic === "board" ? "tbub" : ic === "log" ? "list" : "pin", (x + 12) * S, 20 * S, 20 * S, SC.C.fg); }
    c.font = `500 ${15 * S}px ${SC.FONT}`; const pw = 16 + 20 + 6 + c.measureText("投稿").width / S + 16; x -= pw + 10;
    c.fillStyle = SC.C.surface; SC.rr(c, x * S, 8 * S, pw * S, 44 * S, 22 * S); c.fill();
    SC.drawIcon(c, "plus", (x + 16) * S, 20 * S, 20 * S, SC.C.fg); c.fillStyle = SC.C.fg; c.textBaseline = "middle"; c.fillText("投稿", (x + 42) * S, 30 * S); c.textBaseline = "alphabetic";
    it.page.bar.tex.needsUpdate = true;
  }
  function drawPage(it) {
    const H = it.H, d = it.d, pg = it.page, cv = pg.body.cv, c = cv.getContext("2d");
    const info = cardInfo(H, d, it);
    const me = getMe();
    info.me = me ? { name: me.name, uid: me.uid, avatar: me.avatar ? avatarImg(me.uid, me.avatar, redraw(it)) : null } : null;
    info.comments = pg.comments ? pg.comments.map((m) => Object.assign({}, m, { avatar: avatarImg(m.uid, m.avatarSrc, redraw(it)) })) : null;
    info.commentsErr = pg.commentsErr;
    // サイトのページ(左右に20pxのすきま、上に16px)
    c.fillStyle = SC.C.bg; c.fillRect(0, 0, cv.width, cv.height);
    c.save(); c.translate(PAGE_X * PAGE_S, 16 * PAGE_S);
    const r = SC.drawWatchPage(c, d, info, PAGE_W, PAGE_S, true);
    c.restore();
    pg.spots = r.spots.map((sp) => Object.assign({}, sp, { x: sp.x + PAGE_X, y: sp.y + 16 }));
    pg.btnsCss = r.btns.map((b) => Object.assign({}, b, { x: b.x + PAGE_X, y: b.y + 16 }));
    pg.maxScroll = Math.max(0, Math.min(PAGE_H, r.height + 16 + 40) - (VIEW_H - BAR_H));
    const key = r.btns.map((b) => b.id + b.label + (b.pressed ? 1 : 0) + Math.round(b.x) + "," + Math.round(b.y)).join("|");
    if (key !== pg.key) {
      pg.key = key;
      for (const b of pg.btns) b.dispose();
      pg.btns = pg.btnsCss.map((b) => {
        const bt = buttons.add({ parent: pg.grp, x: -W / 2 + (b.x + b.w / 2) * K, y: 0, z: -D + 0.04,
          w: b.w * K, h: b.h * K, pxPerBlock: PAGE_S / K, cssH: b.h,
          face: { label: b.label, icon: b.icon, style: b.style, pressed: b.pressed },
          onPress: () => pageAction(it, b.id) });
        bt.css = b;
        return bt;
      });
    }
    applyScroll(it);
    pg.body.tex.needsUpdate = true;
  }
  // スクロール: 絵の見える範囲と、うかぶボタンの位置を合わせる
  function applyScroll(it) {
    const pg = it.page, vh = VIEW_H - BAR_H;
    pg.scroll = Math.max(0, Math.min(pg.maxScroll, pg.scroll));
    pg.body.tex.repeat.set(1, vh / PAGE_H);
    pg.body.tex.offset.set(0, 1 - (pg.scroll + vh) / PAGE_H);
    for (const b of pg.btns) {
      const yv = b.css.y + b.css.h / 2 - pg.scroll;   // ページの見える所の上からの位置
      b.g.position.y = pg.top - BAR_H * K - yv * K;
      b.g.visible = b.css.y - pg.scroll >= -2 && b.css.y + b.css.h - pg.scroll <= vh + 2;
    }
  }
  async function loadComments(it) {
    try {
      const r = await api({ action: "listComments", token: getToken(), postId: it.d.id });
      if (!it.page) return;
      if (r && r.ok) {
        const us = r.users || {};
        it.page.comments = (r.comments || []).filter((m) => !m.deleted && !m.parentId).map((m) => ({ uid: m.uid, name: (us[m.uid] || {}).name || "チャンネル", avatarSrc: (us[m.uid] || {}).avatar, text: m.text, createdAt: m.createdAt, likes: m.likes, owner: m.uid === it.d.uid }));
      } else it.page.commentsErr = "コメントを読み込めませんでした";
    } catch (e) { if (it.page) it.page.commentsErr = "コメントを読み込めませんでした"; }
    if (it.page) drawPage(it);
  }
  function pageAction(it, id) {
    const d = it.d;
    if (id === "back") { onBack(); return; }
    if (id === "go") {
      if (d.kind === "file") { ui.download(d); return; }
      if (d.url) { const w = window.open(d.url, "_blank", "noopener"); if (!w) say("新しいタブを開けませんでした(ブラウザにブロックされました)"); }
      return;
    }
    if (id === "dots") { ui.postMenu(d); return; }
    if (id === "share") { ui.share(d); return; }
    say("このボタンは、まだ3Dの中では使えません");
  }

  // ======== つぶやきの壁(掲示板の左と同じ) ========
  const TW_GAP = 0.9;   // つぶやきどうしのすきま(ブロック)
  function layoutTweets(H, list) {
    const keep = new Map(H.items.map((it) => [it.id, it]));
    const next = [];
    let y = 0;
    const pinned = H.data.find((t) => t.pinned);
    const order = (pinned ? [pinned] : []).concat(list.filter((t) => !t.pinned));
    for (const t of order) {
      const u = H.users[t.uid] || {};
      const info = { name: u.name || "チャンネル", handle: u.handle || "", label: t === pinned ? "固定されたツイート" : "", sel: t === pinned, image: H.images.get(t.id) || null };
      const hcss = SC.drawTweetItem(null, t, info, 0, 0, TW_W, 1);
      let it = keep.get(t.id);
      const top = Y0 + ROWH - y;
      if (it && Math.abs(it.hcss - hcss) < 0.5) {
        keep.delete(t.id); it.d = t; it.info = Object.assign(it.info, info); it.from = it.top; it.to = top;
        if (it.cv) drawTweetTex(it);
      } else {
        if (it) { keep.delete(t.id); dropTweet(it); }
        it = { H, d: t, id: t.id, hcss, info, mesh: null, cv: null, tex: null, dist: 1e9, top, from: top, to: top };
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(TW_W * TW_K, hcss * TW_K), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, transparent: true }));
        mesh.rotation.y = H.s < 0 ? 0 : Math.PI;
        mesh.userData.tweet = it;
        // 裏からも見える(字が読めるように、裏返した板)
        const back = new THREE.Mesh(mesh.geometry, mesh.material); back.rotation.y = Math.PI; back.position.z = -0.02; back.userData.tweet = it; mesh.add(back);
        it.mesh = mesh; H.root.add(mesh);
      }
      next.push(it);
      y += hcss * TW_K + TW_GAP;
    }
    for (const it of keep.values()) dropTweet(it);
    H.items = next;
    H.height = Math.max(30, y + 2);
    const moving = next.some((it) => it.from !== it.to);
    H.anim = moving ? { t: 0, dur: 1.6 } : null;
    for (const it of next) placeTweet(it, it.from, 0);
  }
  function placeTweet(it, top, pull) {
    it.top = top;
    it.mesh.position.set(0, top - it.hcss * TW_K / 2, it.H.s * (FRONT - pull));
  }
  function dropTweet(it) { freeTweetTex(it); it.H.root.remove(it.mesh); it.mesh.geometry.dispose(); it.mesh.material.dispose(); }
  // 並べ替え: 加減速しながら、すこし手前に出て、新しい場所へ
  function stepTweetAnim(H, dt) {
    if (!H.anim) return;
    H.anim.t += dt / H.anim.dur;
    const t = Math.min(1, H.anim.t), m = ease(t), pull = Math.sin(Math.PI * t) * 2.5;
    for (const it of H.items) placeTweet(it, it.from + (it.to - it.from) * m, it.from === it.to ? 0 : pull);
    if (t >= 1) { H.anim = null; for (const it of H.items) { it.from = it.to; placeTweet(it, it.to, 0); } }
  }
  function ensureTweetTex(it) {
    if (it.cv) return;
    it.cv = document.createElement("canvas"); it.cv.width = TW_W * TW_S; it.cv.height = Math.ceil(it.hcss * TW_S);
    it.tex = new THREE.CanvasTexture(it.cv); it.tex.generateMipmaps = false; it.tex.minFilter = THREE.LinearFilter; it.tex.anisotropy = 4;
    it.mesh.material.map = it.tex; it.mesh.material.needsUpdate = true;
    drawTweetTex(it);
  }
  function drawTweetTex(it) {
    const c = it.cv.getContext("2d"), H = it.H, u = H.users[it.d.uid] || {};
    // 1件ずつの、角の丸い白いカード(サイトの線の色のふち)
    c.clearRect(0, 0, it.cv.width, it.cv.height);
    c.fillStyle = it.info.sel ? SC.C.accentSoft : SC.C.bg; SC.rr(c, 0, 0, it.cv.width, it.cv.height, 12 * TW_S); c.fill();
    c.strokeStyle = SC.C.line; c.lineWidth = TW_S; SC.rr(c, TW_S / 2, TW_S / 2, it.cv.width - TW_S, it.cv.height - TW_S, 12 * TW_S); c.stroke();
    it.info.noLine = true;
    it.info.avatar = avatarImg(it.d.uid, u.avatar, () => { if (it.cv) drawTweetTex(it); });
    it.info.image = H.images.get(it.d.id) || null;
    SC.drawTweetItem(c, it.d, it.info, 0, 0, TW_W, TW_S);
    it.tex.needsUpdate = true;
  }
  function freeTweetTex(it) { if (!it.cv) return; it.mesh.material.map = null; it.mesh.material.needsUpdate = true; it.tex.dispose(); it.cv = it.tex = null; }


  // ======== データ ========
  function layout(H, list) {
    if (H.kind === "tweet") { layoutTweets(H, list); return; }
    const keep = new Map(H.items.map((it) => [it.id, it]));
    const next = [];
    list.forEach((d, i) => {
      let it = keep.get(d.id);
      if (it) { keep.delete(d.id); it.d = d; it.slot = i; if (it.cv) drawFront(it); if (it.page) drawPage(it); }
      else it = makeItem(H, d, i);
      next.push(it);
    });
    for (const it of keep.values()) dropItem(it);
    H.items = next; H.rows = Math.max(1, Math.ceil(next.length / 3));
    startAnim(H);
  }
  function sorted(H) {
    const a = H.data.slice();
    const pop = H.kind === "post" ? (x) => x.views + x.clicks : (t) => t.likes + t.views + t.rts + t.replies;
    if (H.sort === "old") a.sort((x, y) => x.createdAt - y.createdAt);
    else if (H.sort === "popular") a.sort((x, y) => pop(y) - pop(x) || y.createdAt - x.createdAt);
    else a.sort((x, y) => y.createdAt - x.createdAt);
    return a;
  }
  function setSort(H, key) {
    for (const [k, b] of H.seg) b.setPressed(k === key);   // いちばん新しく押されたボタンが優先
    if (H.sort === key) return;
    H.sort = key;
    layout(H, sorted(H).slice(0, MAXN));
  }
  // 並べ替え: すこしだけ手前に出ながら、加減速して新しい場所へ
  function startAnim(H) {
    for (const it of H.items) { it.from = Object.assign({}, it.cur); it.to = H.slotPos(it.slot); }
    const moving = H.items.some((it) => it.from.u !== it.to.u || it.from.y !== it.to.y);
    H.anim = moving ? { t: 0, dur: 1.6 } : null;
    if (!moving) for (const it of H.items) { it.cur = it.to; placeItem(it, 0); }
  }
  function stepAnim(H, dt, ctl) {
    if (!H.anim) return;
    H.anim.t += dt / H.anim.dur;
    const t = Math.min(1, H.anim.t), m = ease(t), pull = Math.sin(Math.PI * t) * 2.5;
    for (const it of H.items) {
      const same = it.from.u === it.to.u && it.from.y === it.to.y;
      const old = it.g.position.clone();
      it.cur = { u: it.from.u + (it.to.u - it.from.u) * m, y: it.from.y + (it.to.y - it.from.y) * m };
      placeItem(it, same ? 0 : pull);
      if (focus && focus.it === it) { ctl.p.x += it.g.position.x - old.x; ctl.p.y += it.g.position.y - old.y; ctl.p.z += it.g.position.z - old.z; }
    }
    if (t >= 1) { H.anim = null; for (const it of H.items) { it.cur = it.to; placeItem(it, 0); } }
  }
  function setData(kind, list, users, extra) {
    const H = kind === "post" ? PH : TH;
    H.users = users || {}; H.extra = extra || {};
    H.data = (list || []).slice(0, 2000);
    layout(H, sorted(H).slice(0, MAXN));
    loadImages(H);
  }
  async function loadImages(H) {
    const ids = H.items.map((it) => it.d).filter((d) => (H.kind === "post" ? d.thumbOk : d.hasImg) && !H.asked.has(d.id)).map((d) => d.id);
    for (let i = 0; i < ids.length; i += 12) {
      const part = ids.slice(i, i + 12); part.forEach((id) => H.asked.add(id));
      try {
        const r = await api(H.kind === "post" ? { action: "getThumbs", token: getToken(), ids: part } : { action: "getTweetImages", token: getToken(), ids: part });
        const got = r && r.ok ? (H.kind === "post" ? r.thumbs : r.images) || {} : {};
        let changed = false;
        for (const id of Object.keys(got)) {
          const src = got[id];
          if (typeof src !== "string" || !src.startsWith("data:image/")) continue;
          const img = new Image();
          img.onload = () => {
            H.images.set(id, img);
            if (H.kind === "post") { const it = H.items.find((x) => x.id === id); if (it) { if (it.cv) drawFront(it); if (it.page) drawPage(it); } }
            else { clearTimeout(H.relayT); H.relayT = setTimeout(() => layout(H, sorted(H).slice(0, MAXN)), 200); }   // 画像のぶん高さが変わる
          };
          img.src = src; changed = true;
        }
      } catch (e) { /* 読めなくても出る */ }
    }
  }
  let busy = false, refreshT = 0, categories = [];
  async function refresh() {
    if (busy) return; busy = true;
    try {
      const token = getToken();
      const [a, b] = await Promise.all([api({ action: "list", token }), api({ action: "listTweets", token })]);
      if (a && a.ok) {
        categories = a.categories || categories;
        const posts = (a.posts || []).filter((p) => !p.priv && !p.adminHidden && !p.needChange);
        const users = {}; for (const [k, v] of Object.entries(a.users || {})) users[k] = { name: v.name, avatar: v.avatar, handle: v.handle };
        setData("post", posts, users, { subCounts: a.subCounts, myRx: a.myRx, mySaves: a.mySaves, mySubs: a.mySubs });
      }
      if (b && b.ok) setData("tweet", (b.tweets || []).filter((t) => !t.parentId && !t.adminHidden), b.users || {}, {});
    } catch (e) { /* 次の読み込みで */ }
    busy = false;
  }

  // ======== リフト(北と南) ========
  const liftGeo = new THREE.BoxGeometry(3, 1, 3);
  const liftMat = new THREE.MeshLambertMaterial({ color: 0xfff6cf, emissive: 0x6b6340, transparent: true, opacity: 0.62, depthWrite: false });
  function liftMesh() { const m = new THREE.Mesh(liftGeo, liftMat); m.renderOrder = 2; m.add(new THREE.LineSegments(new THREE.EdgesGeometry(liftGeo), new THREE.LineBasicMaterial({ color: 0xb8a24a, transparent: true, opacity: 0.8 }))); scene.add(m); return m; }
  function makeLift(H) {
    const L = { H, s: H.s, slide: 0, top: Y0, rider: false, mesh: liftMesh() };
    L.box = () => { const zn = L.s * (2.5 + L.slide), zf = L.s * (5.5 + L.slide); return [-1.5, L.top - 1, Math.min(zn, zf), 1.5, L.top, Math.max(zn, zf)]; };
    L.place = () => { const b = L.box(); L.mesh.position.set(0, L.top - 0.5, (b[2] + b[5]) / 2); };
    L.place();
    return L;
  }
  const lifts = halls.map(makeLift);
  // ほかの人のリフト(見えるけれど、さわれない)
  const ghosts = new Map();   // id → { mesh, cur:[s,slide,top], to }
  function remoteLift(id, lf) {
    let g = ghosts.get(id);
    if (!lf) { if (g) { scene.remove(g.mesh); ghosts.delete(id); } return; }
    if (!g) { g = { mesh: liftMesh(), cur: lf.slice(), to: lf.slice() }; ghosts.set(id, g); }
    g.to = lf.slice();
  }

  // ======== 当たり判定 ========
  const HW = 0.3;
  function worldBoxes(it, out) {
    const o = it.g.position, rot = it.H.s > 0;
    for (const b of SHELL) {
      if (!rot) out.push([o.x + b[0], o.y + b[1], o.z + b[2], o.x + b[3], o.y + b[4], o.z + b[5]]);
      else out.push([o.x - b[3], o.y + b[1], o.z - b[5], o.x - b[0], o.y + b[4], o.z - b[2]]);
    }
  }
  const near = [];
  function gatherNear(x, y, z, r) {
    near.length = 0;
    for (const it of PH.items) {
      const o = it.g.position;
      if (Math.abs(o.x - x) > 20 + r || o.y - 1 > y + r || o.y + ROWH + 1 < y - r || Math.abs(o.z + PH.s * D / 2 - z) > D / 2 + 3 + r) continue;
      worldBoxes(it, near);
    }
    // つぶやきの壁
    near.push(fixBox([-TW_W * TW_K / 2 - 1, Y0 + ROWH - TH.height, TH.s * FRONT, TW_W * TW_K / 2 + 1, Y0 + ROWH, TH.s * (FRONT + 0.6)]));
    for (const L of lifts) near.push(L.box());   // 自分のリフトだけ(ほかの人のリフトにはさわれない)
  }
  function fixBox(b) { return [Math.min(b[0], b[3]), Math.min(b[1], b[4]), Math.min(b[2], b[5]), Math.max(b[0], b[3]), Math.max(b[1], b[4]), Math.max(b[2], b[5])]; }
  function rayBox(o, d, b, maxT) {
    let t0 = 0, t1 = maxT;
    for (let k = 0; k < 3; k++) {
      if (Math.abs(d[k]) < 1e-9) { if (o[k] < b[k] || o[k] > b[k + 3]) return Infinity; continue; }
      let a = (b[k] - o[k]) / d[k], c = (b[k + 3] - o[k]) / d[k];
      if (a > c) [a, c] = [c, a];
      if (a > t0) t0 = a; if (c < t1) t1 = c;
      if (t0 > t1) return Infinity;
    }
    return t0;
  }
  const collider = {
    hits(x, y, z, h) {
      for (const b of near) if (x + HW > b[0] && x - HW < b[3] && z + HW > b[2] && z - HW < b[5] && y + h > b[1] && y < b[4]) return b;
      return null;
    },
    ray(o, d, maxT) {
      let best = Infinity;
      const boxes = [];
      for (const it of PH.items) worldBoxes(it, boxes);
      for (const b of boxes) { const t = rayBox(o, d, b, maxT); if (t < best) best = t; }
      return best;
    },
  };

  // ======== クリック(十字・矢)で押せるところ: カードのアイコン・⋮、つぶやき、ページの投稿者 ========
  const ray = new THREE.Raycaster();
  function pickSpot(o, d, maxT) {
    const targets = [];
    for (const it of PH.items) { if (it.cv) targets.push(it.front); if (it.page) targets.push(it.page.mesh, it.page.barMesh); }
    for (const it of TH.items) targets.push(it.mesh);
    ray.set(new THREE.Vector3(o[0], o[1], o[2]), new THREE.Vector3(d[0], d[1], d[2])); ray.near = 0; ray.far = maxT;
    const hit = ray.intersectObjects(targets, false)[0];
    if (!hit || !hit.uv) return null;
    const ud = hit.object.userData, u = hit.uv.x, v = 1 - hit.uv.y;
    if (ud.item) {   // カード: CSS px にもどす
      const x = u * CARD_W, y = v * CARD_W, th = CARD_W * 9 / 16;
      const it = ud.item;
      if (Math.hypot(x - 18, y - (th + 12 + 18)) < 20) return { t: hit.distance, fn: () => ui.channel(it.d.uid) };
      if (x > CARD_W - 44 && y > th && y < th + 48) return { t: hit.distance, fn: () => ui.postMenu(it.d) };
      return null;
    }
    if (ud.page) {
      const pg = ud.page.page;
      if (!pg || hit.object !== pg.mesh) return null;
      const x = u * VIEW_W, y = v * (VIEW_H - BAR_H) + pg.scroll;
      for (const sp of pg.spots) if (x >= sp.x && x <= sp.x + sp.w && y >= sp.y && y <= sp.y + sp.h) return { t: hit.distance, fn: () => ui.channel(sp.uid) };
      return null;
    }
    if (ud.tweet) {
      const it = ud.tweet, x = u * TW_W, y = v * it.hcss, a = it.info.avatarAt, dt = it.info.dotsAt;
      if (a && x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h) return { t: hit.distance, fn: () => ui.channel(it.d.uid) };
      if (dt && x >= dt.x && x <= dt.x + dt.w && y >= dt.y && y <= dt.y + dt.h) return { t: hit.distance, fn: () => ui.tweetMenu(it.d) };
      return { t: hit.distance, fn: () => ui.tweet(it.d) };
    }
    return null;
  }

  // ======== 中に入っている箱 ========
  let focus = null;
  function findFocus(p) {
    for (const it of PH.items) {
      const o = it.g.position;
      const lx = p.x - o.x, lz = p.z - o.z;
      if (lx > -15 && lx < 15 && lz < 0.5 && lz > -D && p.y > o.y + OPEN_Y - 0.6 && p.y < o.y + ROWH) return it;
    }
    return null;
  }

  return {
    collider, halls, lifts, refresh, setData, remoteLift, pickSpot,
    get categories() { return categories; },
    get voidY() { return Math.min(...halls.map((H) => H.bottom())) - 60; },
    // 自分のリフトの状態(ほかの人に見せる)。休んでいるときは null
    myLift() { for (const L of lifts) if (L.slide > 0.01 || L.top < Y0 - 0.01) return [L.s, Math.round(L.slide * 100) / 100, Math.round(L.top * 100) / 100]; return null; },
    // チャンネル(その人の投稿・つぶやき)
    channelData(uid) {
      const u = PH.users[uid] || TH.users[uid] || {};
      const name = u.name || (PH.data.find((p) => p.uid === uid) || {}).author || "チャンネル";
      return { uid, name, handle: u.handle || "", avatar: u.avatar || "", subs: (PH.extra.subCounts || {})[uid] || 0, posts: PH.data.filter((p) => p.uid === uid).sort((a, b) => b.createdAt - a.createdAt), tweets: TH.data.filter((t) => t.uid === uid).sort((a, b) => b.createdAt - a.createdAt) };
    },
    postById(id) { return PH.data.find((p) => p.id === id) || null; },
    tweetById(id) { return TH.data.find((t) => t.id === id) || null; },
    tweetUser(uid) { return TH.users[uid] || PH.users[uid] || {}; },
    // 投稿の箱の中へ(チャンネルのウィンドウから)
    goInto(id, ctl) {
      const it = PH.items.find((x) => x.id === id);
      if (!it) { say("その投稿は、いまの並びには出ていません"); return; }
      const o = it.g.position;
      Object.assign(ctl.p, { x: o.x, y: o.y + OPEN_Y + 0.01, z: o.z - 12, vx: 0, vy: 0, vz: 0, yaw: 0, pitch: 0.05, ground: true, glide: false });
    },
    update(dt, ctl, active) {
      const p = ctl.p;
      stepAnim(PH, dt, ctl); stepTweetAnim(TH, dt);
      // リフト
      let riding = false;
      for (const L of lifts) {
        const b = L.box();
        const inFoot = p.x > b[0] - 0.1 && p.x < b[3] + 0.1 && p.z > b[2] - 0.1 && p.z < b[5] + 0.1;
        const on = inFoot && Math.abs(p.y - L.top) < 0.15 && p.vy <= 0.5 && !p.fly;
        if (on) {
          riding = true; L.rider = true;
          const dir = (ctl.keys.Space ? 1 : 0) - (ctl.keys.Shift ? 1 : 0);
          if (dir < 0) {
            if (L.slide < LIFT_SLIDE) { const n = Math.min(LIFT_SLIDE, L.slide + LIFT_V * dt); p.z += L.s * (n - L.slide); L.slide = n; }   // まず、リフト1枚ぶん前へ
            else L.top = Math.max(L.H.bottom(), L.top - LIFT_V * dt);
            p.sneak = false;
          } else if (dir > 0) {
            if (L.top < Y0) L.top = Math.min(Y0, L.top + LIFT_V * dt);
            else if (L.slide > 0) { const n = Math.max(0, L.slide - LIFT_V * dt); p.z += L.s * (n - L.slide); L.slide = n; }
          }
          p.y = L.top; p.vy = 0; p.ground = true;
        } else if (L.rider) {
          L.rider = false;
          if (L.slide > 0.01 || L.top < Y0 - 0.01) { L.slide = 0; L.top = Y0; }   // 足を出したら、リフトは消えて、もとの場所に新しいのが用意される
        }
        L.place();
      }
      ctl.riding = riding;
      // ほかの人のリフト(なめらかに)
      for (const g of ghosts.values()) {
        for (let k = 1; k < 3; k++) g.cur[k] += (g.to[k] - g.cur[k]) * (1 - Math.exp(-dt * 14));
        g.cur[0] = g.to[0];
        const s = g.cur[0], zn = s * (2.5 + g.cur[1]), zf = s * (5.5 + g.cur[1]);
        g.mesh.position.set(0, g.cur[2] - 0.5, (zn + zf) / 2);
      }
      gatherNear(p.x, p.y, p.z, 6);
      // 前面の絵: 近いものから、少しずつ
      const cand = [];
      let alive = 0;
      for (const it of PH.items) {
        const o = it.g.position; it.dist = Math.hypot(o.x - p.x, o.y + 15 - p.y, o.z - p.z);
        if (it.cv) { if (it.dist > FAR) freeTex(it); else alive++; } else if (it.dist < NEAR) cand.push(it);
      }
      for (const it of TH.items) {
        it.dist = Math.hypot(p.x, it.top - it.hcss * TW_K / 2 - p.y, it.mesh.position.z - p.z);
        if (it.cv) { if (it.dist > FAR) freeTweetTex(it); else alive++; } else if (it.dist < NEAR) cand.push(it);
      }
      cand.sort((a, b) => a.dist - b.dist);
      for (let i = 0; i < cand.length && i < TEX_PER_FRAME; i++) {
        if (alive >= TEX_MAX) {
          let far = null;
          for (const it of PH.items.concat(TH.items)) if (it.cv && (!far || it.dist > far.dist)) far = it;
          if (!far || far.dist <= cand[i].dist) break;
          if (far.mesh) freeTweetTex(far); else freeTex(far);
          alive--;
        }
        if (cand[i].mesh) ensureTweetTex(cand[i]); else ensureTex(cand[i]);
        alive++;
      }
      const f = findFocus(p);
      if ((f || null) !== (focus ? focus.it : null)) {
        if (focus) freePage(focus.it);
        focus = f ? { it: f } : null;
        if (f) ensurePage(f);
      }
      if (active) { refreshT -= dt; if (refreshT <= 0) { refreshT = 300; refresh(); } }
    },
    refreshSoon() { refreshT = 0.5; },
    // ホイール: 十字が奥のページの上なら、スクロール
    wheelPage(o, d, dy) {
      if (!focus || !focus.it.page) return false;
      const pg = focus.it.page;
      ray.set(new THREE.Vector3(o[0], o[1], o[2]), new THREE.Vector3(d[0], d[1], d[2])); ray.near = 0; ray.far = 120;
      if (!ray.intersectObjects([pg.mesh, pg.barMesh], false).length) return false;
      pg.scroll += dy; applyScroll(focus.it);
      return true;
    },
  };
}
