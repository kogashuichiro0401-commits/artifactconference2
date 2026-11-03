// ウィンドウ(ポップアップ)。カードの⋮・アイコン、つぶやき、投稿/ツイートするボタンなどで出る。
// 新しいものが前。Shift+→ で新しい順に消す、Shift+← で消したものをもどす。
// 中身は artifact学会。と同じ見た目(サイトのダイアログ・カード・ツイート)。
import { C, ago, agoNi, twDate, fmtSize, avatarColor, coverImage, isFile, isWeb } from "./sitecards.js";

const SITE = "https://artifactconference.sharesite.workers.dev/";
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const ICON = {
  close: '<path d="M6 6l12 12M18 6L6 18"/>', back: '<path d="M15 5l-7 7 7 7"/>', chart: '<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4"/>', flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>', link: '<path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>',
  dl: '<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>', open: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  tbub: '<path d="M5 4h14a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-8l-5 4v-4H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z"/>', trt: '<path d="M17 3l3 3-3 3M4 11V9a3 3 0 0 1 3-3h13M7 21l-3-3 3-3M20 13v2a3 3 0 0 1-3 3H4"/>',
  theart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>', tview: '<path d="M5 20v-8M12 20V5M19 20v-11"/>',
  play: '<path d="M8 5v14l11-7z"/>', cursor: '<path d="M5 3l14 8-6 2-3 6z"/>', list: '<path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01"/>',
  share: '<path d="M14 4l7 7-7 7v-4c-6 0-9 2-11 6 1-7 4-11 11-12z"/>', go: '<path d="M5 12h14M13 6l6 6-6 6"/>',
};
const ico = (n, s = 18) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[n] || ""}</svg>`;
const okImg = (s) => typeof s === "string" && /^data:image\/(png|jpeg|webp);base64,/.test(s);
function av(name, uid, src, size = 36) {
  if (okImg(src)) return `<span class="av" style="width:${size}px;height:${size}px"><img src="${src}" alt=""></span>`;
  return `<span class="av" style="width:${size}px;height:${size}px;font-size:${Math.round(size * 15 / 36)}px;background:${avatarColor(name, uid)}">${esc(Array.from(name || "？")[0] || "？")}</span>`;
}
function rich(text) {   // ハッシュタグ・URL を青く
  return esc(text).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>').replace(/(^|[\s])(#[^\s#<]+)/g, '$1<span class="hashtag">$2</span>');
}

export function createWindows({ api, getToken, halls, say, goInto, getMe, win3d, send }) {
  const open = [], closed = [];
  let ctx = null;          // いま作っているウィンドウの種類 { kind, arg, remote, owner, wid, pose }
  const remotes = new Map();   // ほかの人のウィンドウ: "人id:wid" → w
  // ウィンドウを作る(講義がちる。と同じ形: 見出し + 最小化 + 閉じる)。build(body, w) で中身を入れる
  function make(title, build, o = {}) {
    const el = document.createElement("section");
    el.className = "pop" + (o.wide ? " wide" : "");
    el.innerHTML = `<div class="pop-h"><b>${esc(title)}</b><button type="button" class="pop-m" aria-label="最小化" title="最小化">–</button><button type="button" class="pop-x" aria-label="閉じる" title="閉じる(Shift+→)">×</button></div><div class="pop-b"></div>`;
    const c = ctx || {};
    const w = { el, title, body: el.querySelector(".pop-b"), kind: c.kind, arg: c.arg, remote: !!c.remote, owner: c.owner, wid: c.wid || Math.random().toString(36).slice(2, 10), pose: c.pose };
    if (w.remote) el.classList.add("remote");
    el.querySelector(".pop-x").onclick = () => close(w);
    el.querySelector(".pop-m").onclick = () => el.classList.toggle("min");
    build(w.body, w);
    show(w);
    return w;
  }
  function show(w) {
    document.body.appendChild(w.el);   // 大きさを測るため、いったんふつうに置く
    if (w.remote) { win3d.adopt(w.el, { remote: true, pose: w.pose }); remotes.set(w.owner + ":" + w.wid, w); return; }
    win3d.adopt(w.el);
    open.push(w);
  }
  function close(w) {
    if (w.remote) { win3d.remove(w.el); w.el.remove(); remotes.delete(w.owner + ":" + w.wid); return; }
    const i = open.indexOf(w);
    if (i < 0) return;
    open.splice(i, 1); win3d.remove(w.el); w.el.remove();
    closed.push(w); if (closed.length > 20) closed.shift();
    if (w.kind) send({ t: "win", op: "close", wid: w.wid });
  }
  // 置いたら、ほかの人にも見えるように知らせる
  function placed(el) {
    const w = open.find((x) => x.el === el);
    if (!w || !w.kind) return;
    send({ t: "win", op: "open", w: { wid: w.wid, kind: w.kind, arg: w.arg ?? "", pose: win3d.poseOf(el) } });
  }
  // 種類と引数から、ウィンドウを作る(自分のも、ほかの人のも)
  function openKind(kind, arg, extra) {
    const K = KINDS[kind];
    if (!K) return;
    const obj = K[0](arg);
    if (obj === undefined) return;
    ctx = Object.assign({ kind, arg }, extra || {});
    try { K[1](obj); } finally { ctx = null; }
  }
  const postById = (id) => halls.postById(id) || undefined, tweetById = (id) => halls.tweetById(id) || undefined;
  const api2 = (action, body) => api(Object.assign({ action, token: getToken() }, body || {}));

  // ---------- 中身 ----------
  // ⋮ のメニュー(投稿)
  function postMenu(p) {
    const me = getMe();
    make("メニュー", (b) => {
      const items = [["chart", "アナリティクス", () => openKind("analytics", p.id)], ["share", "共有", () => openKind("share", p.id)]];
      if (me && me.uid === p.uid) items.push(["edit", "投稿の情報を編集…", () => openKind("onSite", "投稿の情報を編集|#/watch/" + p.id)]);
      else items.push(["flag", "通報", () => openKind("onSite", "通報|#/watch/" + p.id)]);
      items.push(["open", "サイトで開く", () => window.open(SITE + "#/watch/" + encodeURIComponent(p.id), "_blank", "noopener")]);
      b.innerHTML = `<div class="gmenu">${items.map((x, i) => `<button type="button" data-i="${i}">${ico(x[0])}<span>${esc(x[1])}</span></button>`).join("")}</div>`;
      b.querySelectorAll("button").forEach((bt) => { bt.onclick = () => items[+bt.dataset.i][2](); });
    });
  }
  function analytics(p) {
    make("アナリティクス", (b) => {
      const rows = [["閲覧数(view)", p.views], ["クリック数(click)", p.clicks], ["高評価", p.likes], ["低評価", p.dislikes]];
      b.innerHTML = `<p class="sub">「${esc(p.title)}」</p><div class="an-grid">${rows.map((r) => `<div class="an-cell"><div class="sub">${esc(r[0])}</div><div class="an-n">${Number(r[1] || 0).toLocaleString("ja-JP")}</div></div>`).join("")}</div><p class="sub">投稿: ${esc(agoNi(p.createdAt))}投稿${p.editedAt ? "（" + esc(agoNi(p.editedAt)) + "編集済み）" : ""}</p>`;
    });
  }
  function share(p) {
    const url = SITE + "#/watch/" + encodeURIComponent(p.id);
    make("共有", (b) => {
      b.innerHTML = `<p class="lead">この投稿のリンク</p><div class="share-row"><input type="text" readonly value="${esc(url)}"><button class="btn primary" type="button">コピー</button></div>`;
      b.querySelector("button").onclick = async () => { try { await navigator.clipboard.writeText(url); say("リンクをコピーしました"); } catch (e) { b.querySelector("input").select(); say("選んだリンクをコピーしてください"); } };
    });
  }
  function onSite(what, hash) {
    make(what, (b) => {
      b.innerHTML = `<p class="lead">「${esc(what)}」は、いまは artifact学会。のサイトで行えます。</p><div class="dlg-acts"><a class="btn primary" href="${SITE + hash}" target="_blank" rel="noopener">サイトで開く</a></div>`;
    });
  }
  // チャンネル(その人の投稿・つぶやき)
  function channel(uid) {
    const c = halls.channelData(uid);
    make(c.name + "のチャンネル", (b, w) => {
      let tab = "posts";
      const render = () => {
        const list = tab === "posts"
          ? (c.posts.length ? c.posts.map((p) => `<button class="ch-post" type="button" data-id="${esc(p.id)}"><span class="ch-thumb" data-p="${esc(p.id)}"></span><span class="ch-t"><span class="ttl">${esc(p.title)}</span><span class="sub">${ico("play", 13)} view ${p.views || 0} / ${ico("cursor", 13)} click ${p.clicks || 0} ・ ${esc(agoNi(p.createdAt))}投稿</span><span class="sub ch-go">${ico("go", 13)} この投稿の箱へ行く</span></span></button>`).join("") : `<p class="sub">まだ投稿がありません</p>`)
          : (c.tweets.length ? c.tweets.map((t) => tweetHtml(t, c, false)).join("") : `<p class="sub">まだツイートがありません</p>`);
        b.innerHTML = `<div class="ch-head">${av(c.name, uid, c.avatar, 80)}<div><div class="ch-name">${esc(c.name)}</div><div class="sub">${c.handle ? "@" + esc(c.handle) + " ・ " : ""}チャンネル登録者数 ${c.subs}人 ・ 投稿 ${c.posts.length}本</div></div></div>
          <div class="chips"><button class="chip" type="button" data-tab="posts" aria-pressed="${tab === "posts"}">投稿</button><button class="chip" type="button" data-tab="tweets" aria-pressed="${tab === "tweets"}">ツイート</button></div><div class="ch-list">${list}</div>`;
        b.querySelectorAll("[data-tab]").forEach((x) => { x.onclick = () => { tab = x.dataset.tab; render(); }; });
        b.querySelectorAll(".ch-post").forEach((x) => { x.onclick = () => { goInto(x.dataset.id); close(w); }; });
        b.querySelectorAll(".ch-thumb").forEach((x) => { const p = c.posts.find((q) => q.id === x.dataset.p); if (p) coverImage(p, (img) => { x.style.backgroundImage = `url("${img.src}")`; }); });
        b.querySelectorAll(".tw[data-id]").forEach((x) => { x.onclick = () => openKind("tweet", x.dataset.id); });
      };
      render();
    }, { wide: true });
  }
  function tweetHtml(t, u, detail, label) {
    const name = u.name || "チャンネル";
    return `<article class="tw${detail ? " detail" : ""}" data-id="${esc(t.id)}"><span class="av-link">${av(name, t.uid, u.avatar)}</span><div class="tw-body">
      ${label ? `<div class="tw-label">${esc(label)}</div>` : ""}
      <div class="tw-head"><span class="tw-name">${esc(name)}</span>${u.handle ? `<span class="sub">@${esc(u.handle)}</span>` : ""}<span class="sub">・</span><span class="sub">${esc(detail ? twDate(t.createdAt) : ago(t.createdAt))}</span>${t.editedAt ? `<span class="sub">（${esc(agoNi(t.editedAt))}編集済み）</span>` : ""}</div>
      ${t.text ? `<div class="tw-text">${rich(t.text)}</div>` : ""}
      <div class="tw-acts"><span class="tw-act">${ico("tbub")}<span>${t.replies || 0}</span></span><span class="tw-act">${ico("trt")}<span>${t.rts || 0}</span></span><span class="tw-act">${ico("theart")}<span>${t.likes || 0}</span></span><span class="tw-act">${ico("tview")}<span>${t.views || 0}</span></span></div>
      </div></article>`;
  }
  // つぶやき(掲示板の右と同じ: 1件をくわしく + 返信 + 返信する)
  function tweet(t) {
    if (!t) return;
    make("ツイート", async (b, w) => {
      const users = {};
      const u0 = halls.tweetUser(t.uid);
      users[t.uid] = u0;
      b.innerHTML = tweetHtml(t, u0, true, t.pinned ? "固定されたツイート" : "") + `<div class="tw-tools"><strong>返信</strong></div><div class="tw-replies"><p class="sub">読み込み中…</p></div>` + composer("返信をツイート");
      bindComposer(b, (text) => api2("postTweet", { text, parentId: t.id }), () => { close(w); tweet(t); });
      try {
        const r = await api2("getTweet", { id: t.id });
        const rep = b.querySelector(".tw-replies");
        if (!r || !r.ok) { rep.innerHTML = `<p class="sub">返信を読み込めませんでした</p>`; return; }
        Object.assign(users, r.users || {});
        const list = (r.replies || []).slice().sort((a, b2) => a.createdAt - b2.createdAt);
        b.querySelector(".tw-tools strong").textContent = "返信 " + list.length + "件";
        rep.innerHTML = list.length ? list.map((x) => tweetHtml(x, users[x.uid] || {}, false)).join("") : `<p class="sub tw-none">まだ返信がありません。</p>`;
      } catch (e) { b.querySelector(".tw-replies").innerHTML = `<p class="sub">返信を読み込めませんでした</p>`; }
    }, { wide: true });
  }
  function tweetMenu(t) {
    make("メニュー", (b) => {
      const items = [["chart", "アナリティクス", () => openKind("tweetAnalytics", t.id)],
        ["open", "サイトで開く", () => window.open(SITE + "#/board/" + encodeURIComponent(t.id), "_blank", "noopener")]];
      b.innerHTML = `<div class="gmenu">${items.map((x, i) => `<button type="button" data-i="${i}">${ico(x[0])}<span>${esc(x[1])}</span></button>`).join("")}</div>`;
      b.querySelectorAll("button").forEach((bt) => { bt.onclick = () => items[+bt.dataset.i][2](); });
    });
  }
  function tweetAnalytics(t) {
    make("アナリティクス", (bb) => { bb.innerHTML = `<div class="an-grid">${[["表示数", t.views], ["返信", t.replies], ["リツイート", t.rts], ["ハート", t.likes]].map((r) => `<div class="an-cell"><div class="sub">${r[0]}</div><div class="an-n">${Number(r[1] || 0).toLocaleString("ja-JP")}</div></div>`).join("")}</div>`; });
  }
  function composer(ph) {
    return `<form class="tw-comp" novalidate><textarea maxlength="20000" rows="3" placeholder="${esc(ph)}"></textarea><p class="err"></p><div class="dlg-acts"><button class="btn primary" type="submit">${ico("edit")}<span>ツイートする</span></button></div></form>`;
  }
  function bindComposer(b, send, done) {
    const f = b.querySelector(".tw-comp"), ta = f.querySelector("textarea"), er = f.querySelector(".err"), bt = f.querySelector("button");
    f.onsubmit = async (e) => {
      e.preventDefault();
      const text = ta.value.trim();
      if (!text) { er.textContent = "ツイートの内容を入力してください。"; ta.focus(); return; }
      bt.disabled = true; er.textContent = "";
      const r = await send(text);
      bt.disabled = false;
      if (!r || !r.ok) { er.textContent = (r && r.message) || "ツイートできませんでした。"; return; }
      say("ツイートしました"); halls.refreshSoon(); done();
    };
  }
  const busyNote = (b, what) => { b.innerHTML = `<p class="lead">${esc(what)}を書いています…</p>`; };
  function tweetForm() {
    if (ctx && ctx.remote) { make("ツイートする", (b) => busyNote(b, "ツイート")); return; }
    make("ツイートする", (b, w) => { b.innerHTML = composer("いまどうしてる？"); bindComposer(b, (text) => api2("postTweet", { text }), () => close(w)); });
  }
  // 投稿する(サイトの投稿ダイアログと同じ項目)
  function postForm() {
    if (ctx && ctx.remote) { make("投稿する", (b) => busyNote(b, "投稿")); return; }
    make("投稿する", (b, w) => {
      const cats = halls.categories.length ? halls.categories : ["学習"];
      b.innerHTML = `<p class="lead">artifact や Webサイトの URL を貼って、投稿します。</p>
        <form novalidate>
        <div class="field"><span>型式</span><div class="seg"><button class="btn act" type="button" data-k="artifact" aria-pressed="true">artifact</button><button class="btn act" type="button" data-k="website" aria-pressed="false">Webサイト</button></div></div>
        <label class="field"><span>URL</span><input type="url" name="url" placeholder="https://claude.ai/artifact/…" required></label>
        <label class="field"><span>タイトル<small>空なら、URLのページから自動で入ります</small></span><input type="text" name="title" maxlength="60"></label>
        <label class="field"><span>説明</span><textarea name="desc" maxlength="2000"></textarea></label>
        <div class="field"><span>カテゴリ</span><div class="chips wrap" data-g="cat">${cats.map((c, i) => `<button class="chip" type="button" data-v="${esc(c)}" aria-pressed="${i === 0}">${esc(c)}</button>`).join("")}</div></div>
        <div class="field"><span>公開設定</span><div class="seg" data-g="vis"><button class="btn act" type="button" data-v="public" aria-pressed="true">公開</button><button class="btn act" type="button" data-v="private" aria-pressed="false">非公開(自分だけ)</button></div></div>
        <p class="err"></p><div class="dlg-acts"><button class="btn primary" type="submit">投稿する</button></div></form>`;
      let kind = "artifact";
      const f = b.querySelector("form"), er = f.querySelector(".err");
      const pick = (g) => { const x = f.querySelector(`[data-g=${g}] [aria-pressed=true]`); return x ? x.dataset.v : ""; };
      f.querySelectorAll("[data-g] [data-v]").forEach((x) => { x.onclick = () => { x.parentNode.querySelectorAll("[data-v]").forEach((y) => y.setAttribute("aria-pressed", String(y === x))); }; });
      f.querySelectorAll("[data-k]").forEach((x) => { x.onclick = () => { kind = x.dataset.k; f.querySelectorAll("[data-k]").forEach((y) => y.setAttribute("aria-pressed", String(y === x))); f.url.placeholder = kind === "artifact" ? "https://claude.ai/artifact/…" : "https://…"; }; });
      f.onsubmit = async (e) => {
        e.preventDefault();
        const url = f.url.value.trim();
        if (!url) { er.textContent = "URLを入れてください。"; f.url.focus(); return; }
        const bt = f.querySelector("[type=submit]"); bt.disabled = true; er.textContent = "";
        const r = await api2("createPost", { kind, url, title: f.title.value, desc: f.desc.value, cat: pick("cat"), visibility: pick("vis") });
        bt.disabled = false;
        if (!r || !r.ok) { er.textContent = (r && r.message) || "投稿できませんでした。"; return; }
        say("投稿しました"); halls.refreshSoon(); close(w);
      };
    });
  }
  // ダウンロード(ファイルが2つ以上なら、選ぶ)
  async function saveOne(p, i) {
    const r = await api2("downloadFile", { id: p.id, index: i });
    if (!r || !r.ok || typeof r.data !== "string") { say((r && r.message) || "ダウンロードできませんでした"); return false; }
    const bin = atob(r.data), bytes = new Uint8Array(bin.length);
    for (let k = 0; k < bin.length; k++) bytes[k] = bin.charCodeAt(k);
    const url = URL.createObjectURL(new Blob([bytes], { type: "application/octet-stream" })), a = document.createElement("a");
    a.href = url; a.download = r.name || "file"; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    return true;
  }
  function download(p) {
    const fl = p.files && p.files.length ? p.files : [{ name: p.fileName, size: p.fileSize }];
    if (fl.length <= 1 && !(ctx && ctx.kind)) { say("ダウンロード中…"); saveOne(p, 0).then((ok) => ok && say("ダウンロードしました")); return; }
    if (!(ctx && ctx.kind)) { openKind("download", p.id); return; }
    make("ダウンロードするファイルを選ぶ", (b, w) => {
      b.innerHTML = `<p class="lead">${fl.length}個のファイル（合計 ${esc(fmtSize(p.fileSize))}）</p><div class="files">${fl.map((f, i) => `<label class="file-row"><input type="checkbox" data-i="${i}" checked><span class="fn">${esc(f.name || "ファイル")}</span><span class="sub">${esc(fmtSize(f.size))}</span></label>`).join("")}</div><div class="dlg-acts"><button class="btn" type="button" data-all>すべて選ぶ</button><button class="btn primary" type="button" data-go>${ico("dl")}<span>ダウンロード</span></button></div>`;
      b.querySelector("[data-all]").onclick = () => b.querySelectorAll("input[type=checkbox]").forEach((x) => { x.checked = true; });
      b.querySelector("[data-go]").onclick = async () => {
        const ix = [...b.querySelectorAll("input[type=checkbox]")].filter((x) => x.checked).map((x) => +x.dataset.i);
        if (!ix.length) return;
        close(w); say("ダウンロード中…");
        let ok = 0; for (const i of ix) { if (await saveOne(p, i)) ok++; await new Promise((r) => setTimeout(r, 350)); }
        say(ok + "個のファイルを保存しました");
      };
    });
  }

  const onSiteArg = (a) => { const [what, hash] = String(a).split("|"); onSite(what, hash || ""); };
  const KINDS = {
    postMenu: [postById, postMenu], analytics: [postById, analytics], share: [postById, share], download: [postById, download],
    channel: [(uid) => uid, channel], tweet: [tweetById, tweet], tweetMenu: [tweetById, tweetMenu], tweetAnalytics: [tweetById, tweetAnalytics],
    postForm: [() => null, postForm], tweetForm: [() => null, tweetForm], onSite: [(a) => a, onSiteArg],
  };
  const pub = (kind, idOf) => (x) => openKind(kind, idOf ? idOf(x) : x);
  return {
    postMenu: pub("postMenu", (p) => p.id), channel: pub("channel"), tweet: pub("tweet", (t) => t.id), tweetMenu: pub("tweetMenu", (t) => t.id),
    postForm: () => openKind("postForm", ""), tweetForm: () => openKind("tweetForm", ""), download: (p) => download(p), share: pub("share", (p) => p.id),
    placed,
    // ほかの人のウィンドウ(開く・動かす・閉じる)
    onRemote(m) {
      if (m.op === "closeAll") { for (const [k, w] of [...remotes]) if (k.startsWith(m.id + ":")) close(w); return; }
      const key = m.id + ":" + (m.op === "close" ? m.wid : m.w && m.w.wid);
      const old = remotes.get(key);
      if (m.op === "close") { if (old) close(old); return; }
      if (!m.w || !m.w.pose) return;
      if (old && old.kind === m.w.kind && old.arg === m.w.arg) { win3d.setPose(win3d.panelOf ? win3d.panelOf(old.el) : null, m.w.pose); return; }
      if (old) close(old);
      openKind(m.w.kind, m.w.arg, { remote: true, owner: m.id, wid: m.w.wid, pose: m.w.pose });
    },
    get count() { return open.length; },
    // Shift+→: いちばん新しいウィンドウを消す / Shift+←: 消したものをもどす
    closeTop() { const w = open[open.length - 1]; if (w) close(w); return !!w; },
    restore() { const w = closed.pop(); if (w) { w.el.classList.remove("min"); show(w); } return !!w; },
    closeAll() { while (open.length) close(open[open.length - 1]); },
  };
}
