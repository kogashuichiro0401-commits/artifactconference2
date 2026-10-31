// 画面の表示まわり(ハート・ホットバー・持ち物・本・メニュー)。
import { VERSION, CHANGELOG } from "./version.js";
import { ITEMS } from "./items.js";

// マイクラ風のハート(9x9ドット)
const HEART = [
  "011000110", "111101111", "111111111", "111111111", "111111111",
  "011111110", "001111100", "000111000", "000010000",
];

function heartSVG(color, highlight) {
  let r = "";
  for (let y = 0; y < 9; y++)
    for (let x = 0; x < 9; x++)
      if (HEART[y][x] === "1") r += `<rect x="${x}" y="${y}" width="1" height="1" fill="${color}"/>`;
  if (highlight) r += `<rect x="1" y="1" width="1" height="1" fill="${highlight}"/><rect x="1" y="2" width="1" height="1" fill="${highlight}"/>`;
  return `<svg viewBox="0 0 9 9" width="18" height="18" shape-rendering="crispEdges">${r}</svg>`;
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const HINT = "<b>WASD</b>=移動　<b>Space</b>=ジャンプ(2回=飛行、飛行中 Space↑ Shift↓)　<b>W/Sを2回</b>=ダッシュ　<b>Shift</b>=しゃがみ<br>" +
  "落下中に<b>Space</b>=エリトラ(ロケット花火を持って右クリック)　<b>F5</b>=視点　<b>ホイール</b>=ズーム　<b>E</b>=持ち物　<b>Esc</b>=メニュー";

const BOOK = `
  <h2>使い方の本</h2>
  <ul>
    <li><b>WASD</b>…あるく。<b>Space</b>…ジャンプ。すばやく2回押すと、空を飛べる(飛行中は Space で上、Shift で下)</li>
    <li><b>WかSを2回</b>…ダッシュ。<b>Shift</b>…しゃがむ</li>
    <li>落下している間に <b>Space</b>…エリトラが開いて、滑空できる。急降下で加速、上向きで減速。もう一度 Space で閉じる</li>
    <li><b>ロケット花火</b>は持ち物(5番)。持って、滑空中に<b>右クリック</b>(スマホは長タップ)で加速する</li>
    <li><b>左クリック</b>(スマホはタップ)…なぐる。ダメージ1とノックバック。矢が当たっても同じ。本は<b>右クリック</b>(スマホは長タップ)で開く</li>
    <li><b>マウス</b>…見る方向。<b>ホイール</b>…ズーム。<b>F5</b>…視点の切り替え(一人称/後ろ/前)</li>
    <li><b>十字の先</b>のブロック/プレートは、黒い細い枠で囲まれる</li>
    <li>(管理者だけ)<b>F4</b>…建築破壊モード。<b>左クリック</b>=壊す、<b>右クリック</b>=置く(白いブロック/プレートを持っているとき)。プレートは、目線に垂直な向きのものが薄く表示されて置かれる。<b>C</b>…プレートの置き方(自動/面だけ/斜めだけ)</li>
    <li><b>F3</b>…座標などの情報。世界は48×48×48で、はしは反対側につながっている(上下も)</li>
    <li><b>1〜9</b>…手に持つものを変える。<b>E</b>…持ち物。<b>Esc</b>…メニュー</li>
  </ul>`;

export function createHud({ settings, onSettings, onEnter, onClose, onLogin, onLogout, onRespawn, onTouchEdit }) {
  const $ = (id) => document.getElementById(id);
  const inv = new Array(36).fill(null);   // 0〜8がホットバー
  inv[0] = "bow";
  inv[1] = "book";
  inv[4] = "rocket";
  const setItems = (admin) => { inv[2] = admin ? "block" : null; inv[3] = admin ? "plate" : null; };
  let sel = 0, hp = 20, nameTimer = 0, entered = false, updateVer = null, user = null, sayTimer = 0;

  // ----- ハート(体力は0〜20。1つのハートが2) -----
  const heartEls = [];
  for (let i = 0; i < 10; i++) {
    const d = document.createElement("div");
    d.className = "heart full";
    d.innerHTML = `<div class="back">${heartSVG("#3b3b3b")}</div><div class="fill">${heartSVG("#e0202a", "#ff8a8a")}</div>`;
    $("hearts").appendChild(d);
    heartEls.push(d);
  }
  function setHealth(v, hurt) {
    const old = hp;
    hp = Math.max(0, Math.min(20, v));
    heartEls.forEach((el, i) => {
      const left = hp - i * 2;
      el.className = "heart " + (left >= 2 ? "full" : left >= 1 ? "half" : "");
      if (hurt && hp < old) { el.classList.remove("hurt"); void el.offsetWidth; el.classList.add("hurt"); }
    });
  }

  // ----- ホットバー -----
  const slotEls = [];
  for (let i = 0; i < 9; i++) {
    const d = document.createElement("div");
    d.className = "slot";
    d.addEventListener("pointerdown", (e) => { if (document.body.classList.contains("touch")) { e.preventDefault(); e.stopPropagation(); select(i); } });
    $("hotbar").appendChild(d);
    slotEls.push(d);
  }
  function itemAt(i) { return inv[i] ? ITEMS[inv[i]] : null; }
  function renderHotbar() {
    slotEls.forEach((el, i) => {
      const it = itemAt(i);
      el.className = "slot" + (i === sel ? " sel" : "");
      el.innerHTML = it ? it.icon : "";
    });
  }
  function select(i) {
    sel = ((i % 9) + 9) % 9;
    renderHotbar();
    const it = itemAt(sel), nm = $("itemname");
    nm.textContent = it ? it.name : "";
    nm.classList.remove("show");
    if (it) {
      void nm.offsetWidth;
      nm.classList.add("show");
      clearTimeout(nameTimer);
      nameTimer = setTimeout(() => nm.classList.remove("show"), 1500);
    }
  }

  // ----- 持ち物 -----
  function renderInventory() {
    const slot = (i) => { const it = itemAt(i); return `<div class="slot">${it ? it.icon : ""}</div>`; };
    let main = "", bar = "";
    for (let i = 9; i < 36; i++) main += slot(i);
    for (let i = 0; i < 9; i++) bar += slot(i);
    $("panel-inventory").innerHTML =
      `<h2>持ち物</h2><div class="grid">${main}</div><div class="grid">${bar}</div>` +
      `<button class="pill block" id="btn-inv-close">とじる (E)</button>`;
    $("btn-inv-close").onclick = onClose;
  }

  // ----- 本 -----
  $("panel-book").innerHTML = BOOK + `<button class="pill block" id="btn-book-close">とじる</button>`;
  $("btn-book-close").onclick = onClose;

  // ----- ログイン -----
  const FILE_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/></svg>`;
  const MOUSE_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="2.5" width="12" height="19" rx="6"/><path d="M12 2.5v7M6 9.5h12"/></svg>`;
  const brand = (sub, file) => `<div class="brand"><span>artifact学会<b>。</b></span><small>${esc(sub)}</small>${file ? `<button class="filebtn" id="btn-ops" title="操作" aria-label="操作">${MOUSE_ICON}操作</button>` : ""}${file ? `<button class="filebtn" id="btn-log" title="更新履歴" aria-label="更新履歴">${FILE_ICON}更新履歴</button>` : ""}</div>`;
  const K = (...k) => k.map((x) => `<kbd>${x}</kbd>`).join(" ");
  const KEYS = [
    ["移動", ["歩く", K("W", "A", "S", "D")], ["ダッシュ", K("W") + " か " + K("S") + " を2回"], ["しゃがむ", K("Shift")]],
    ["空中", ["ジャンプ", K("Space")], ["飛行(管理者のみ)", K("Space") + " を2回 → 上 " + K("Space") + " / 下 " + K("Shift")], ["エリトラ", "落下中に " + K("Space") + "(もう一度で閉じる)"], ["ロケット花火", "花火を持って(5)、滑空中に右クリック / 長タップ"]],
    ["画面", ["視点", K("F5")], ["ズーム", "ホイール"], ["座標など", K("F3")], ["16×16の区切り", K("F2")], ["メニュー", K("Esc")], ["スタート地点へ", K("R")]],
    ["戦う", ["なぐる", "左クリック / タップ(ダメージ1、ふき飛ぶ)"], ["弓", "弓を持って右クリックを長押し → はなす(当たるとダメージ1)"]],
    ["持ち物", ["切り替え", K("1") + "〜" + K("9")], ["持ち物の画面", K("E")]],
    ["建築(管理者のみ)", ["建築破壊モード", K("F4")], ["壊す / 置く", "左クリック / 右クリック(1クリックにつき1回)"], ["プレートの置き方", K("C") + "(自動 → 面だけ → 斜めだけ)"]],
  ];
  const keysTable = `<table class="keys"><tr><th>やること</th><th>操作</th></tr>${KEYS.map(([sec, ...rows]) => `<tr class="sec"><td colspan="2">${sec}</td></tr>` + rows.map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`).join("")).join("")}</table>`;
  function renderLogin(msg) {
    $("panel-login").innerHTML = `
      ${brand("3D")}
      <p class="muted">artifact学会。のアカウントでログインしてください。(アカウントがない人は入れません)</p>
      ${msg ? `<div class="err">${esc(msg)}</div>` : ""}
      <form id="login-form" autocomplete="on">
        <label class="field"><span>チャンネルID</span><input type="text" id="li-user" autocomplete="username" autocapitalize="off" spellcheck="false"></label>
        <label class="field"><span>パスワード</span><input type="password" id="li-pass" autocomplete="current-password"></label>
        <button class="pill primary block" id="li-go" type="submit">ログイン</button>
      </form>`;
    const form = $("login-form");
    form.onsubmit = async (e) => {
      e.preventDefault();
      const btn = $("li-go"); btn.disabled = true; btn.textContent = "確認中…";
      const r = await onLogin($("li-user").value, $("li-pass").value);
      if (r && r.error) renderLogin(r.error);
    };
    $("li-pass").onkeydown = (e) => e.stopPropagation();
    $("li-user").onkeydown = (e) => e.stopPropagation();
  }

  // ----- メニュー -----
  function renderMenu() {
    const log = CHANGELOG.map((c) => `<li><b>${esc(c.at)}</b> v${esc(c.version)}<br>${esc(c.summary)}</li>`).join("");
    const notice = updateVer
      ? `<div class="notice">新しいバージョン (v${esc(updateVer)}) があります。再読み込みすると新しくなります。<button class="pill primary block" id="btn-reload">再読み込み</button></div>`
      : "";
    const nm = user ? user.displayName || user.username || "" : "";
    const av = user && user.avatar ? `<img src="${esc(user.avatar)}" alt="">` : esc(nm.slice(0, 1));
    $("panel-menu").innerHTML = `
      ${brand("v" + VERSION, true)}
      ${notice}
      <div class="me-row"><span class="av">${av}</span><span class="nm">${esc(nm)}<span class="role">${user && user.role === "admin" ? "管理者" : "泳者"}</span></span><button class="pill" id="btn-logout">ログアウト</button></div>
      <button class="pill primary block" id="btn-enter">${entered ? "世界にもどる" : "世界に入る"}</button>
      <button class="pill block" id="btn-respawn">スタート地点にもどる (R)</button>
      <h2>設定</h2>
      <label>視野角 <input type="range" id="set-fov" min="50" max="110" step="1" value="${settings.fov}"><span id="set-fov-v">${settings.fov}</span></label>
      <label>マウス感度 <input type="range" id="set-sens" min="1" max="10" step="0.5" value="${settings.sens}"><span id="set-sens-v">${settings.sens}</span></label>
      <div id="opsbox" hidden><h2>操作</h2>${keysTable}</div>
      <div id="logbox" hidden><h2>更新履歴</h2><ul class="log">${log}</ul></div>`;
    $("btn-ops").onclick = () => { const b = $("opsbox"); b.hidden = !b.hidden; if (!b.hidden) b.scrollIntoView({ block: "nearest" }); };
    $("btn-log").onclick = () => { const b = $("logbox"); b.hidden = !b.hidden; if (!b.hidden) b.scrollIntoView({ block: "nearest" }); };
    $("btn-enter").onclick = () => { entered = true; onEnter(); };
    $("btn-logout").onclick = () => onLogout();
    $("btn-respawn").onclick = () => { onRespawn(); onEnter(); };
    const bind = (id, key) => {
      $(id).oninput = (e) => {
        settings[key] = +e.target.value;
        $(id + "-v").textContent = settings[key];
        onSettings(settings);
      };
    };
    bind("set-fov", "fov");
    bind("set-sens", "sens");
    if (updateVer) $("btn-reload").onclick = () => location.reload();
  }

  // ----- パネルの切り替え -----
  function show(name) {
    if (name === "login") renderLogin();
    if (name === "menu") renderMenu();
    if (name === "inventory") renderInventory();
    for (const n of ["login", "menu", "inventory", "book"]) $("panel-" + n).hidden = n !== name;
    $("shade").hidden = !name;
    document.body.classList.toggle("ui", !!name);
    document.body.classList.toggle("login", name === "login");
  }

  $("hint").hidden = true;   // 操作の説明は、メニューのマウスアイコンから
  setHealth(20);
  select(0);

  return {
    setHealth,
    select,
    selected: () => sel,
    selectedItem: () => inv[sel],
    show,
    renderLogin,
    // 管理者だけ、白いブロック・プレートを持てる
    setAdmin: (a) => { setItems(a); renderHotbar(); select(sel); },
    setBuildMode: (on) => { $("mode").hidden = !on; $("mode").textContent = "建築破壊モード(F4で切り替え)"; },
    setUser: (u) => { user = u; entered = false; },
    // 右上に流れるお知らせ(エリトラが開きました、など)
    say: (text) => {
      const feed = $("feed"), el = document.createElement("div");
      el.className = "fe"; el.textContent = text;
      feed.appendChild(el);
      while (feed.children.length > 4) feed.firstChild.remove();
      setTimeout(() => el.classList.add("out"), 3000);
      setTimeout(() => el.remove(), 3600);
    },
    setPose: () => {},
    setResume: (on) => { $("resume").hidden = !on; },
    // 右上の「オンライン」表示。lines の先頭が見出し、"*" で始まる行は自分
    setOnline: (lines) => {
      const el = $("online");
      el.textContent = "";
      for (const l of lines) {
        const d = document.createElement("div");
        if (l.startsWith("*")) { d.className = "me"; d.textContent = l.slice(1); } else d.textContent = l;
        el.appendChild(d);
      }
    },
    // サーバーが新しいバージョンになっている(古い画面で遊んでいる)ときのお知らせ
    setUpdate: (v) => {
      updateVer = v;
      $("update").hidden = false;
      $("update").textContent = `新しいバージョン (v${v}) があります。Escでメニューを開いて、再読み込みしてください`;
    },
    toggleDebug: () => { $("debug").hidden = !$("debug").hidden; },
    setDebug: (text) => { if (!$("debug").hidden) $("debug").textContent = text; },
  };
}
