// 投稿ホール(北)と、つぶやきホール(南)。
//  ・1件が、ひとつの大きな箱(前面 30×30、奥行き 30)。横に3列、上から下へ積む(いちばん上の段が、はじまりの場所と同じ高さ)
//  ・前面はサイトのカードと同じ。サムネイルの部分だけ、通りぬけて中に入れる(すこし透けている)。それより下は壁
//  ・中から振り返ると、前面の裏が見える。いちばん奥の壁に、投稿のページ(ツイートは、右の表示)が映る
//  ・はじまりの板の北と南に、リフト。Shift で下へ、Space で上へ(はじまりの高さまで)。リフトから足を出すと、リフトは消えて、上に新しいのができる
//  ・並べ替えボタン(人気順・新しい順・古い順)と、ページのボタンは、うかんでいて、クリックか矢で押せる
// 箱もリフトも、ブロックではなく画面だけの展示物。当たり判定は、ここで持っている(world.virtual)。
import * as SC from "./sitecards.js";

const W = 30, D = 30, ROWH = 30, Y0 = 0.5, PITCH = 33, FRONT = 40.5;   // 前面は、はじまりの場所から 40.5(1段目の上のふちが画面のいちばん上に来る)
const THUMB = W * 9 / 16;          // サムネイルの高さ(16:9)
const OPEN_Y = ROWH - THUMB;       // サムネイルの下のはし(床からの高さ)。ここから上だけ通れる
const MAXN = 150;                  // 1つのホールに並べる数
const CARD_W = 330, FS = 640;      // カードの幅(サイトのpx)/ 前面の絵の大きさ
const PAGE_W = 1240, PAGE_H = 1150, PAGE_S = 1.5;   // 奥のページ(サイトのpx)
const K = W / PAGE_W;              // ページの 1px が何ブロックか
const NEAR = 170, FAR = 230;       // 前面の絵を作る / 捨てる 距離
const LIFT_SPEED = 8;
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// 箱の形(箱の原点 = 前面の、下の真ん中。+z が外(はじまりの場所の方)、中は -z)
const SHELL = [
  [-16, -0.5, -31, -15, ROWH, 0],      // 左の壁
  [15, -0.5, -31, 16, ROWH, 0],        // 右の壁
  [-15, -0.5, -31, 15, ROWH, -30],     // 奥の壁
  [-15, -0.5, -30, 15, 0, 0],          // 床
  [-15, ROWH - 0.5, -30, 15, ROWH, 0], // 天井
];
const FRONT_WALL = [-15, -0.5, -0.25, 15, OPEN_Y, 0.25];   // 前面の、サムネより下(壁)

export function createHalls(THREE, scene, { api, getToken, buttons, getMe, say, onBack }) {
  // ---- 共通の形 ----
  const shellGeo = (() => {   // 壁・床・天井を1つの形にまとめる(描く回数を減らす)
    const pos = [], nor = [];
    for (const b of SHELL) {
      const g = new THREE.BoxGeometry(b[3] - b[0], b[4] - b[1], b[5] - b[2]).toNonIndexed();
      g.translate((b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2);
      pos.push(...g.attributes.position.array); nor.push(...g.attributes.normal.array);
      g.dispose();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
    return g;
  })();
  const shellMat = new THREE.MeshLambertMaterial({ color: 0xf4f4f6, emissive: 0x5a5c63 });
  const frontGeo = new THREE.PlaneGeometry(W, ROWH);
  const blankCv = document.createElement("canvas"); blankCv.width = blankCv.height = 4;
  { const c = blankCv.getContext("2d"); c.fillStyle = "#fff"; c.fillRect(0, 0, 4, 4); }

  const avatars = new Map();   // uid → Image
  function avatarImg(uid, src, cb) {
    if (!src || typeof src !== "string" || !src.startsWith("data:image/")) return null;
    const e = avatars.get(uid);
    if (e) { if (e.ok) return e.img; e.wait.push(cb); return null; }
    const n = { ok: false, img: new Image(), wait: [cb] };
    avatars.set(uid, n);
    n.img.onload = () => { n.ok = true; n.wait.forEach((f) => f()); n.wait = []; };
    n.img.src = src;
    return null;
  }

  // ==== ホール ====
  function makeHall(kind, s) {   // s = -1(北) / +1(南)
    const H = { kind, s, items: [], byId: new Map(), sort: "new", rows: 1, data: [], users: {}, extra: {}, images: new Map(), asked: new Set(), anim: null, seg: [] };
    const root = new THREE.Group(); scene.add(root); H.root = root;
    // 箱の原点(ワールド)。列 0 は、はじまりの場所から見て左
    H.slotPos = (i) => { const row = Math.floor(i / 3), col = i % 3; return { u: (col - 1) * PITCH, y: Y0 - row * ROWH }; };
    H.world = (u, y) => [s < 0 ? u : -u, y, s * FRONT];
    H.bottom = () => Y0 - (H.rows - 1) * ROWH;

    // -- 並べ替えボタン(人気順・新しい順・古い順)。サイトと同じく、一覧の上にうかぶ(いちばん上の段の、すぐ上) --
    {
      const seg = new THREE.Group();
      seg.position.set(0, Y0 + ROWH + 2.6, s * (FRONT - 1)); seg.rotation.y = s < 0 ? 0 : Math.PI;
      root.add(seg);
      const opts = [["popular", "人気順"], ["new", "新しい順"], ["old", "古い順"]];
      const bw = 6.4, bh = 3.2, ppb = 48;
      // 台(ボタンがしずみこむ板)。サイトの .seg と同じ、丸い端の灰色
      const base = new THREE.Mesh(new THREE.BoxGeometry(bw * 3 - bh * 1.1, bh * 0.9, 0.2), new THREE.MeshLambertMaterial({ color: 0xd8d8d8, emissive: 0x404040 }));
      base.position.z = -0.1; seg.add(base);
      opts.forEach(([key, label], i) => {
        const b = buttons.add({ parent: seg, x: (i - 1) * bw, y: 0, z: 0, w: bw - 0.06, h: bh, pxPerBlock: ppb, cssH: 44, sticky: true,
          face: { label, style: i === 0 ? "sort-l" : i === 2 ? "sort-r" : "sort", pressed: key === H.sort },
          onPress: () => setSort(H, key) });
        H.seg.push([key, b]);
      });
    }
    return H;
  }
  const halls = [makeHall("post", -1), makeHall("tweet", 1)];

  // ---- 箱を作る・捨てる ----
  function makeItem(H, d, i) {
    const g = new THREE.Group();
    g.rotation.y = H.s < 0 ? 0 : Math.PI;
    const shell = new THREE.Mesh(shellGeo, shellMat);
    g.add(shell);
    const it = { H, d, id: d.id, slot: i, cur: H.slotPos(i), from: null, g, cv: null, tex: null, texIn: null, front: null, inner: null, page: null };
    // 前面(外向き)と、その裏(中から見る。裏がわ向きの板なので、中からも字が正しく読める)
    const matOut = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, toneMapped: false });
    const matIn = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, toneMapped: false });
    it.front = new THREE.Mesh(frontGeo, matOut); it.front.position.set(0, ROWH / 2, 0.03); it.front.renderOrder = 3;
    it.inner = new THREE.Mesh(frontGeo, matIn); it.inner.position.set(0, ROWH / 2, -0.03); it.inner.rotation.y = Math.PI; it.inner.renderOrder = 3;
    g.add(it.front, it.inner);
    H.root.add(g);
    placeItem(it);
    return it;
  }
  function placeItem(it) {
    const w = it.H.world(it.cur.u, it.cur.y);
    it.g.position.set(w[0], w[1], w[2]);
  }
  function freeTex(it) {
    if (!it.cv) return;
    it.front.material.map = null; it.inner.material.map = null; it.front.material.needsUpdate = it.inner.material.needsUpdate = true;
    it.tex.dispose(); it.texIn.dispose(); it.cv = it.tex = it.texIn = null;
  }
  function dropItem(it) { freeTex(it); freePage(it); it.H.root.remove(it.g); it.front.material.dispose(); it.inner.material.dispose(); }
  // 前面の絵(近づいたときだけ作る)
  function ensureTex(it) {
    if (it.cv) return;
    it.cv = document.createElement("canvas"); it.cv.width = it.cv.height = FS;
    it.tex = new THREE.CanvasTexture(it.cv); it.tex.generateMipmaps = false; it.tex.minFilter = THREE.LinearFilter; it.tex.anisotropy = 4;
    it.texIn = new THREE.CanvasTexture(it.cv); it.texIn.generateMipmaps = false; it.texIn.minFilter = THREE.LinearFilter; it.texIn.anisotropy = 4;
    it.front.material.map = it.tex; it.inner.material.map = it.texIn;
    it.front.material.needsUpdate = it.inner.material.needsUpdate = true;
    drawFront(it);
  }
  const redraw = (it) => () => { if (it.cv) drawFront(it); if (it.page) drawPage(it); };
  function cardInfo(H, d, it) {
    const u = H.users[d.uid] || {};
    const info = { avatar: avatarImg(d.uid, u.avatar, redraw(it)), handle: u.handle || "", menu: true, thumbAlpha: 0.5, name: u.name || d.author || "チャンネル" };
    if (H.kind === "post") {
      const ex = H.extra;
      info.kids = H.data.some((x) => x.parentId === d.id);
      const par = d.parentId ? H.data.find((x) => x.id === d.parentId) : null;
      info.parentTitle = par ? par.title : "";
      info.subs = (ex.subCounts || {})[d.uid] || 0;
      info.rx = (ex.myRx || {})[d.id] || ""; info.saved = !!(ex.mySaves || {})[d.id];
      info.subbed = (ex.mySubs || []).indexOf(d.uid) >= 0;
      const me = getMe(); info.mine = !!me && me.uid === d.uid;
    }
    // サムネ: 投稿者の画像があればそれ、なければサイトと同じ自動の絵
    const img = H.images.get(d.id);
    if (img) info.thumb = img;
    else {
      const p = H.kind === "post" ? d : { id: d.id, url: d.id, title: String(d.text || "").replace(/\s+/g, " ").slice(0, 40) || "つぶやき" };
      let sync = true;
      SC.coverImage(p, (im) => {
        it._cover = im; info.thumb = im;
        if (!sync && !H.images.get(d.id)) { if (it.cv) drawFront(it); if (it.page) drawPage(it); }   // あとから読めたときだけ描きなおす
      });
      sync = false;
      if (!info.thumb) info.thumb = it._cover || null;
    }
    return info;
  }
  function drawFront(it) {
    const H = it.H, d = it.d, c = it.cv.getContext("2d"), S = FS / CARD_W;
    const info = cardInfo(H, d, it);
    if (H.kind === "post") SC.drawPostCard(c, d, info, CARD_W, S);
    else {
      // つぶやき: 上に 16:9 のサムネ(画像があれば画像、なければ自動の絵)、その下に、掲示板の1件
      c.clearRect(0, 0, FS, FS);
      const th = CARD_W * 9 / 16 * S;
      c.save(); SC.rr(c, 0, 0, FS, th, 12 * S); c.clip(); c.globalAlpha = 0.5; c.fillStyle = SC.C.surface; c.fillRect(0, 0, FS, th);
      if (info.thumb) SC.drawCover(c, info.thumb, 0, 0, FS, th); c.restore(); c.globalAlpha = 1;
      c.fillStyle = SC.C.bg; c.fillRect(0, th, FS, FS - th);
      SC.drawTweet(c, d, info, 0, CARD_W * 9 / 16, CARD_W, S, false);
    }
    it.tex.needsUpdate = true; it.texIn.needsUpdate = true;
  }

  // ---- 奥の壁のページ(中に入ったときだけ) ----
  function ensurePage(it) {
    if (it.page) return;
    const cv = document.createElement("canvas"); cv.width = PAGE_W * PAGE_S; cv.height = PAGE_H * PAGE_S;
    const tex = new THREE.CanvasTexture(cv); tex.generateMipmaps = false; tex.minFilter = THREE.LinearFilter; tex.anisotropy = 8;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(W, PAGE_H * K), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, fog: false }));
    const top = ROWH - 1.2;
    mesh.position.set(0, top - PAGE_H * K / 2, -30 + 0.02);
    const grp = new THREE.Group(); grp.add(mesh); it.g.add(grp);
    it.page = { cv, tex, mesh, grp, top, btns: [], comments: null, key: "" };
    drawPage(it);
    if (it.H.kind === "post") loadComments(it);
  }
  function freePage(it) {
    if (!it.page) return;
    for (const b of it.page.btns) b.dispose();
    it.g.remove(it.page.grp); it.page.mesh.geometry.dispose(); it.page.mesh.material.dispose(); it.page.tex.dispose();
    it.page = null;
  }
  function drawPage(it) {
    const H = it.H, d = it.d, pg = it.page, c = pg.cv.getContext("2d"), S = PAGE_S;
    const info = cardInfo(H, d, it);
    let btns;
    if (H.kind === "post") {
      const me = getMe();
      info.me = me ? { name: me.name, uid: me.uid, avatar: me.avatar ? avatarImg(me.uid, me.avatar, redraw(it)) : null } : null;
      info.comments = pg.comments ? pg.comments.map((m) => Object.assign({}, m, { avatar: avatarImg(m.uid, m.avatarSrc, redraw(it)) })) : null;
      info.commentsErr = pg.commentsErr;
      btns = SC.drawWatchPage(c, d, info, PAGE_W, S).btns;
    } else {
      // つぶやき: 右の表示(戻るボタン + 1件をくわしく)
      c.fillStyle = SC.C.bg; c.fillRect(0, 0, pg.cv.width, pg.cv.height);
      c.font = `700 ${15 * S}px ${SC.FONT}`;
      const backW = 20 + 18 + 8 + c.measureText("一覧にもどる").width / S + 20;
      btns = [{ id: "back", x: 0, y: 0, w: backW, h: 44, label: "一覧にもどる", icon: "back", style: "btn" }];
      const img = H.images.get(d.id);
      SC.drawTweet(c, d, Object.assign({}, info, { image: img, showImage: !!img }), 0, 58, PAGE_W * 0.62, S, true);
    }
    // うかぶボタン(形が変わったときだけ作りなおす)
    const key = btns.map((b) => b.id + b.label + (b.pressed ? 1 : 0) + Math.round(b.x) + "," + Math.round(b.y)).join("|");
    if (key !== pg.key) {
      pg.key = key;
      for (const b of pg.btns) b.dispose();
      pg.btns = btns.map((b) => buttons.add({
        parent: pg.grp, x: -W / 2 + (b.x + b.w / 2) * K, y: pg.top - (b.y + b.h / 2) * K, z: -30 + 0.06,
        w: b.w * K, h: b.h * K, pxPerBlock: PAGE_S / K, cssH: b.h,
        face: { label: b.label, icon: b.icon, style: b.style, pressed: b.pressed },
        onPress: () => pageAction(it, b.id),
      }));
    }
    pg.tex.needsUpdate = true;
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
  // ページのボタンのはたらき
  async function pageAction(it, id) {
    const d = it.d;
    if (id === "back") { onBack(); return; }
    if (id === "go") {
      if (d.kind === "file") {
        const fl = d.files && d.files.length ? d.files : [{ name: d.fileName }];
        if (fl.length > 1) { say("ファイルが" + fl.length + "個あります。どれを保存するか選ぶウィンドウは、次の更新で作ります"); return; }
        say("ダウンロード中…");
        try {
          const r = await api({ action: "downloadFile", token: getToken(), id: d.id, index: 0 });
          if (!r || !r.ok || typeof r.data !== "string") { say((r && r.message) || "ダウンロードできませんでした"); return; }
          const bin = atob(r.data), bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          const url = URL.createObjectURL(new Blob([bytes], { type: "application/octet-stream" })), a = document.createElement("a");
          a.href = url; a.download = r.name || fl[0].name || "file"; document.body.appendChild(a); a.click(); a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 30000);
          say("ダウンロードしました: " + (r.name || ""));
        } catch (e) { say("ダウンロードできませんでした"); }
        return;
      }
      if (d.url) { const w = window.open(d.url, "_blank", "noopener"); if (!w) say("新しいタブを開けませんでした(ブラウザにブロックされました)"); }
      return;
    }
    say("このボタンは、まだ3Dの中では使えません");
  }

  // ---- データ ----
  function layout(H, list) {
    // 前と同じものは残し(並べ替えのアニメーションのため)、ないものは捨てる
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
    if (H.kind === "post") {
      if (H.sort === "old") a.sort((x, y) => x.createdAt - y.createdAt);
      else if (H.sort === "popular") a.sort((x, y) => (y.views + y.clicks) - (x.views + x.clicks) || y.createdAt - x.createdAt);
      else a.sort((x, y) => y.createdAt - x.createdAt);
    } else {
      const pop = (t) => t.likes + t.views + t.rts + t.replies;
      if (H.sort === "old") a.sort((x, y) => x.createdAt - y.createdAt);
      else if (H.sort === "popular") a.sort((x, y) => pop(y) - pop(x) || y.createdAt - x.createdAt);
      else a.sort((x, y) => y.createdAt - x.createdAt);
    }
    return a;
  }
  function setSort(H, key) {
    for (const [k, b] of H.seg) b.setPressed(k === key);   // いちばん新しく押されたボタンが優先
    if (H.sort === key) return;
    H.sort = key;
    layout(H, sorted(H));
  }
  // 並べ替えのアニメーション: 手前に引き出す → 新しい場所へ → 奥へもどす(加減速つき)
  function startAnim(H) {
    for (const it of H.items) { it.from = Object.assign({}, it.cur); it.to = H.slotPos(it.slot); }
    const moving = H.items.some((it) => it.from.u !== it.to.u || it.from.y !== it.to.y);
    H.anim = moving ? { t: 0, dur: 2.2 } : null;
    if (!moving) for (const it of H.items) { it.cur = it.to; it.pull = 0; placeItem(it); }
  }
  function stepAnim(H, dt, ctl) {
    if (!H.anim) return;
    H.anim.t += dt / H.anim.dur;
    const t = Math.min(1, H.anim.t);
    for (const it of H.items) {
      const same = it.from.u === it.to.u && it.from.y === it.to.y;
      const old = it.g.position.clone();
      // 引き出す量(0〜1〜0)と、移動
      const pull = same ? 0 : t < 0.25 ? ease(t / 0.25) : t > 0.75 ? ease((1 - t) / 0.25) : 1;
      const m = same ? 1 : t <= 0.25 ? 0 : t >= 0.75 ? 1 : ease((t - 0.25) / 0.5);
      it.cur = { u: it.from.u + (it.to.u - it.from.u) * m, y: it.from.y + (it.to.y - it.from.y) * m };
      it.pull = pull * 12;
      placeItem(it);
      it.g.position.z += H.s * -it.pull;   // 手前へ(はじまりの場所の方へ)
      // 中にいる人は、いっしょに運ぶ
      if (focus && focus.it === it) { ctl.p.x += it.g.position.x - old.x; ctl.p.y += it.g.position.y - old.y; ctl.p.z += it.g.position.z - old.z; }
    }
    if (t >= 1) { H.anim = null; for (const it of H.items) { it.cur = it.to; it.pull = 0; placeItem(it); } }
  }
  function setData(kind, list, users, extra) {
    const H = halls.find((h) => h.kind === kind);
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
        for (const id of Object.keys(got)) {
          const src = got[id];
          if (typeof src !== "string" || !src.startsWith("data:image/")) continue;
          const img = new Image();
          img.onload = () => { H.images.set(id, img); const it = H.items.find((x) => x.id === id); if (it) { if (it.cv) drawFront(it); if (it.page) drawPage(it); } };
          img.src = src;
        }
      } catch (e) { /* 読めなくても、自動の絵で出る */ }
    }
  }
  let busy = false, refreshT = 0;
  async function refresh() {
    if (busy) return; busy = true;
    try {
      const token = getToken();
      const [a, b] = await Promise.all([api({ action: "list", token }), api({ action: "listTweets", token })]);
      if (a && a.ok) {
        const posts = (a.posts || []).filter((p) => !p.priv && !p.adminHidden && !p.needChange);
        const users = {}; for (const [k, v] of Object.entries(a.users || {})) users[k] = { name: v.name, avatar: v.avatar, handle: v.handle };
        setData("post", posts, users, { subCounts: a.subCounts, myRx: a.myRx, mySaves: a.mySaves, mySubs: a.mySubs });
      }
      if (b && b.ok) setData("tweet", (b.tweets || []).filter((t) => !t.parentId && !t.adminHidden), b.users || {}, {});
    } catch (e) { /* 次の読み込みで */ }
    busy = false;
  }

  // ==== リフト(北と南。はじまりの板のとなり) ====
  function makeLift(H) {
    const s = H.s, L = { H, x0: -1.5, x1: 1.5, z0: s < 0 ? -5.5 : 2.5, z1: s < 0 ? -2.5 : 5.5, top: Y0, rider: false };
    const g = new THREE.Group(); scene.add(g);
    const slab = new THREE.Mesh(new THREE.BoxGeometry(3, 0.5, 3), new THREE.MeshLambertMaterial({ color: 0xfff4c2, emissive: 0x6b5d1c }));
    slab.add(new THREE.LineSegments(new THREE.EdgesGeometry(slab.geometry), new THREE.LineBasicMaterial({ color: 0x8a6a00 })));
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1, 0.12), new THREE.MeshBasicMaterial({ color: 0xffd84d, transparent: true, opacity: 0.6 }));
    g.add(slab, rail); g.position.set(0, 0, (L.z0 + L.z1) / 2);
    L.place = () => {
      slab.position.y = L.top - 0.25;
      const bottom = H.bottom(), h = Math.max(0.1, Y0 - bottom);
      rail.scale.set(1, h, 1); rail.position.set(s < 0 ? 0 : 0, bottom + h / 2, s * 1.6);   // 下まで続くレール(行ける深さの目印)
    };
    L.place();
    return L;
  }
  const lifts = halls.map(makeLift);

  // ==== 当たり判定 ====
  const HW = 0.3;
  function worldBoxes(it, out) {
    const o = it.g.position, rot = it.H.s > 0;
    for (const b of SHELL.concat([FRONT_WALL])) {
      if (!rot) out.push([o.x + b[0], o.y + b[1], o.z + b[2], o.x + b[3], o.y + b[4], o.z + b[5]]);
      else out.push([o.x - b[3], o.y + b[1], o.z - b[5], o.x - b[0], o.y + b[4], o.z - b[2]]);
    }
  }
  const near = [];   // 体の近くの箱だけ(毎フレーム作りなおす)
  function gatherNear(x, y, z, r) {
    near.length = 0;
    for (const H of halls) for (const it of H.items) {
      const o = it.g.position;
      if (Math.abs(o.x - x) > 20 + r || o.y - 1 > y + r || o.y + ROWH + 1 < y - r || Math.abs(o.z + H.s * 15 - z) > 18 + r) continue;
      worldBoxes(it, near);
    }
    for (const L of lifts) near.push([L.x0, L.top - 0.5, L.z0, L.x1, L.top, L.z1]);
  }
  const collider = {
    hits(x, y, z, h) {
      for (const b of near) if (x + HW > b[0] && x - HW < b[3] && z + HW > b[2] && z - HW < b[5] && y + h > b[1] && y < b[4]) return b;
      return null;
    },
    // 光線が、箱の壁(サムネの穴をのぞく)に当たる距離(なければ Infinity)
    ray(o, d, maxT) {
      let best = Infinity;
      const boxes = [];
      for (const H of halls) for (const it of H.items) worldBoxes(it, boxes);
      for (const b of boxes) {
        let t0 = 0, t1 = maxT, ok = true;
        for (let k = 0; k < 3 && ok; k++) {
          if (Math.abs(d[k]) < 1e-9) { if (o[k] < b[k] || o[k] > b[k + 3]) ok = false; continue; }
          let a = (b[k] - o[k]) / d[k], c = (b[k + 3] - o[k]) / d[k];
          if (a > c) [a, c] = [c, a];
          if (a > t0) t0 = a; if (c < t1) t1 = c;
          if (t0 > t1) ok = false;
        }
        if (ok && t0 < best) best = t0;
      }
      return best;
    },
  };

  // ==== 中に入っている箱 ====
  let focus = null;   // { it }
  function findFocus(p) {
    for (const H of halls) for (const it of H.items) {
      const o = it.g.position;
      const lx = H.s < 0 ? p.x - o.x : o.x - p.x, lz = H.s < 0 ? p.z - o.z : o.z - p.z;
      if (lx > -15 && lx < 15 && lz < 0.5 && lz > -30 && p.y > o.y - 0.6 && p.y < o.y + ROWH) return it;
    }
    return null;
  }

  return {
    collider, halls, lifts, refresh, setData,
    get voidY() { return Math.min(...halls.map((H) => H.bottom())) - 60; },
    // 体を動かす前に呼ぶ: リフト・アニメーション・近くの当たり判定・前面の絵の出し入れ・中に入った箱
    update(dt, ctl, active) {
      const p = ctl.p;
      for (const H of halls) stepAnim(H, dt, ctl);
      // リフト
      let riding = false;
      for (const L of lifts) {
        const inFoot = p.x > L.x0 - 0.1 && p.x < L.x1 + 0.1 && p.z > L.z0 - 0.1 && p.z < L.z1 + 0.1;
        const on = inFoot && Math.abs(p.y - L.top) < 0.15 && p.vy <= 0.5 && !p.fly;
        if (on) {
          riding = true;
          const dir = (ctl.keys.Space ? 1 : 0) - (ctl.keys.Shift ? 1 : 0);
          L.top = Math.max(L.H.bottom(), Math.min(Y0, L.top + dir * LIFT_SPEED * dt));
          p.y = L.top; p.vy = 0; p.ground = true; L.rider = true;
          if (dir < 0) p.sneak = false;   // 下りるときは、しゃがまない
        } else if (L.rider) {
          L.rider = false;
          if (L.top < Y0 - 0.05) L.top = Y0;   // 足を出したら、リフトは消えて、上に新しいのが用意される
        }
        L.place();
      }
      ctl.riding = riding;
      gatherNear(p.x, p.y, p.z, 6);
      // 前面の絵: 近いものだけ
      for (const H of halls) for (const it of H.items) {
        const o = it.g.position, dist = Math.hypot(o.x - p.x, o.y + 15 - p.y, o.z - p.z);
        if (dist < NEAR) ensureTex(it); else if (dist > FAR) freeTex(it);
      }
      const f = findFocus(p);
      if ((f || null) !== (focus ? focus.it : null)) {
        if (focus) freePage(focus.it);
        focus = f ? { it: f } : null;
        if (f) ensurePage(f);
      }
      if (active) { refreshT -= dt; if (refreshT <= 0) { refreshT = 300; refresh(); } }
    },
  };
}
