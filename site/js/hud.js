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

const HINT = "<b>WASD</b>=移動　<b>Space</b>=ジャンプ(2回=飛行、飛行中 Space↑ Shift↓)　<b>Wを2回</b>=ダッシュ　<b>Shift</b>=しゃがみ<br>" +
  "<b>マウス</b>=視点　<b>1〜9・ホイール</b>=持ち物の切り替え　<b>E</b>=持ち物　<b>Esc</b>=メニュー";

const BOOK = `
  <h2>使い方の本</h2>
  <ul>
    <li><b>WASD</b>…あるく</li>
    <li><b>Space</b>…ジャンプ。すばやく2回押すと、空を飛べる</li>
    <li>飛んでいる間は、<b>Space</b>で上、<b>Shift</b>で下</li>
    <li><b>Wを2回</b>…ダッシュ</li>
    <li><b>Shift</b>…しゃがむ</li>
    <li><b>マウス</b>…見る方向を変える。中央の十字が、さしている場所</li>
    <li><b>1〜9・ホイール</b>…手に持つものを変える</li>
    <li><b>E</b>…持ち物を開く</li>
    <li><b>Esc</b>…メニュー</li>
  </ul>
  <p style="font-size:13px">この世界は、まだ作っている途中です。</p>`;

export function createHud({ settings, onSettings, onEnter, onClose }) {
  const $ = (id) => document.getElementById(id);
  const inv = new Array(36).fill(null);   // 0〜8がホットバー
  inv[0] = "bow";
  inv[1] = "book";
  let sel = 0, hp = 20, nameTimer = 0, entered = false;

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
    $("hotbar").appendChild(d);
    slotEls.push(d);
  }
  function itemAt(i) { return inv[i] ? ITEMS[inv[i]] : null; }
  function renderHotbar() {
    slotEls.forEach((el, i) => {
      const it = itemAt(i);
      el.className = "slot" + (i === sel ? " sel" : "");
      el.innerHTML = `<span class="n">${i + 1}</span>${it ? esc(it.icon) : ""}`;
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
    const slot = (i) => { const it = itemAt(i); return `<div class="slot">${it ? esc(it.icon) : ""}</div>`; };
    let main = "", bar = "";
    for (let i = 9; i < 36; i++) main += slot(i);
    for (let i = 0; i < 9; i++) bar += slot(i);
    $("panel-inventory").innerHTML =
      `<h2>持ち物</h2><div class="grid">${main}</div><div class="grid">${bar}</div>` +
      `<button class="mcbtn close" id="btn-inv-close">とじる (E)</button>`;
    $("btn-inv-close").onclick = onClose;
  }

  // ----- 本 -----
  $("panel-book").innerHTML = BOOK + `<button class="mcbtn close" id="btn-book-close">とじる</button>`;
  $("btn-book-close").onclick = onClose;

  // ----- メニュー -----
  function renderMenu() {
    const log = CHANGELOG.map((c) => `<li><b>${esc(c.at)}</b> v${esc(c.version)}<br>${esc(c.summary)}</li>`).join("");
    $("panel-menu").innerHTML = `
      <h1>クラフト(仮)</h1>
      <p class="ver">バージョン ${esc(VERSION)}</p>
      <button class="mcbtn big" id="btn-enter">${entered ? "世界にもどる" : "世界に入る"}</button>
      <h2>設定</h2>
      <label>視野角 <input type="range" id="set-fov" min="50" max="110" step="1" value="${settings.fov}"><span id="set-fov-v">${settings.fov}</span></label>
      <label>マウス感度 <input type="range" id="set-sens" min="1" max="10" step="0.5" value="${settings.sens}"><span id="set-sens-v">${settings.sens}</span></label>
      <h2>操作</h2>
      <ul>
        <li>WASD=移動　Space=ジャンプ(2回=飛行、飛行中 Space↑ Shift↓)</li>
        <li>Wを2回=ダッシュ　Shift=しゃがみ　マウス=視点</li>
        <li>1〜9・ホイール=持ち物の切り替え　E=持ち物　F3=座標表示　Esc=メニュー</li>
      </ul>
      <h2>更新履歴</h2>
      <ul class="log">${log}</ul>`;
    $("btn-enter").onclick = () => { entered = true; onEnter(); };
    const bind = (id, key) => {
      $(id).oninput = (e) => {
        settings[key] = +e.target.value;
        $(id + "-v").textContent = settings[key];
        onSettings(settings);
      };
    };
    bind("set-fov", "fov");
    bind("set-sens", "sens");
  }

  // ----- パネルの切り替え -----
  function show(name) {
    if (name === "menu") renderMenu();
    if (name === "inventory") renderInventory();
    for (const n of ["menu", "inventory", "book"]) $("panel-" + n).hidden = n !== name;
    $("shade").hidden = !name;
    document.body.classList.toggle("ui", !!name);
  }

  $("hint").innerHTML = HINT;
  setTimeout(() => { $("hint").style.opacity = "0"; }, 9000);
  setHealth(20);
  select(0);

  return {
    setHealth,
    select,
    selected: () => sel,
    selectedItem: () => inv[sel],
    show,
    setResume: (on) => { $("resume").hidden = !on; },
    toggleDebug: () => { $("debug").hidden = !$("debug").hidden; },
    setDebug: (text) => { if (!$("debug").hidden) $("debug").textContent = text; },
  };
}
