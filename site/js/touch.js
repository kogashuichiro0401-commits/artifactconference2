// スマホ・タブレットの操作(マイクラPE風)。
//  左: 十字キー(移動)と中央ボタン(ダブルタップでしゃがむ/解除)  右: ジャンプ(Spaceと同じ)
//  画面のどこかをドラッグ=見まわす / タップ=置く / 少し長くおす=壊す / 弓は、おしつづけてため、はなして発射
//  上: メニュー・建築モード・プレートの置き方・ボタン配置。ボタンの位置と大きさは、左右べつべつに変えられる。
const STORE = "craft-touch-layout";
const DEF = { l: { x: 0.15, y: 0.7, s: 1 }, r: { x: 0.87, y: 0.72, s: 1 } };
const BASE_L = 156, BASE_R = 92;
const LONG_MS = 380, MOVE_PX = 10;

const ARROW = (rot) => `<svg viewBox="0 0 24 24" width="26" height="26" style="transform:rotate(${rot}deg)"><path d="M12 6 L19 17 H5 Z" fill="rgba(255,255,255,.92)" stroke="rgba(0,0,0,.45)" stroke-width="1.2" stroke-linejoin="round"/></svg>`;
const HAND = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11V5a1.6 1.6 0 0 1 3.2 0v5"/><path d="M12.2 9.5a1.6 1.6 0 0 1 3.2 0V11"/><path d="M15.4 10.5a1.6 1.6 0 0 1 3.2 0V15a6 6 0 0 1-6 6h-1.2a6 6 0 0 1-4.6-2.1L4 15.6a1.6 1.6 0 0 1 2.4-2.1L9 15.5"/></svg>`;

export function detectTouch() {
  try {
    if (/[?&]touch=1/.test(location.search)) return true;
    return ("ontouchstart" in window || navigator.maxTouchPoints > 0) && window.matchMedia("(pointer:coarse)").matches;
  } catch (e) { return false; }
}

export function createTouch(o) {
  const { controls } = o;
  document.body.classList.add("touch");
  let layout = JSON.parse(JSON.stringify(DEF));
  try { const s = JSON.parse(localStorage.getItem(STORE) || "null"); if (s && s.l && s.r) layout = s; } catch (e) { /* 初期配置 */ }

  const root = document.createElement("div");
  root.id = "touch";
  root.innerHTML = `
    <div id="tlook"></div>
    <div id="tl" class="tc"><div class="tb up">${ARROW(0)}</div><div class="tb right">${ARROW(90)}</div><div class="tb down">${ARROW(180)}</div><div class="tb left">${ARROW(270)}</div><div class="tb mid"></div><span class="tlabel">十字キー</span></div>
    <div id="tr" class="tc"><div class="tb jump">${ARROW(0)}</div><span class="tlabel">ジャンプ</span></div>
    <div id="tbar">
      <button id="tb-menu" class="tbtn">メニュー</button>
      <button id="tb-build" class="tbtn" hidden>建築</button>
      <button id="tb-plate" class="tbtn" hidden>板</button>
      <button id="tb-edit" class="tbtn icon" title="ボタン配置" aria-label="ボタン配置">${HAND}</button>
    </div>
    <div id="tedit" hidden><div class="tpanel">
      <b>ボタン配置</b><span class="tsub">ボタンをドラッグして、位置を変えられます</span>
      <label>左(十字キー)の大きさ<input type="range" id="te-l" min="0.6" max="1.8" step="0.05"></label>
      <label>右(ジャンプ)の大きさ<input type="range" id="te-r" min="0.6" max="1.8" step="0.05"></label>
      <div class="trow"><button id="te-reset" class="tbtn">もとにもどす</button><button id="te-ok" class="tbtn ok">OK</button></div>
    </div></div>
    <div id="trotate">スマホを横向きにしてください</div>`;
  document.body.appendChild(root);
  const $ = (id) => root.querySelector("#" + id);
  const tl = $("tl"), tr = $("tr"), look = $("tlook"), edit = $("tedit");
  let editing = false;

  const fake = (code) => ({ code, repeat: false, preventDefault() {} });
  const press = (code, on) => controls.key(fake(code), on);

  // ----- 配置 -----
  function place() {
    const vw = window.innerWidth, vh = window.innerHeight;
    for (const [el, k, base] of [[tl, "l", BASE_L], [tr, "r", BASE_R]]) {
      const c = layout[k], half = (base * c.s) / 2;
      c.x = Math.min(1 - half / vw, Math.max(half / vw, c.x)); c.y = Math.min(1 - half / vh, Math.max(half / vh, c.y));
      el.style.width = el.style.height = base + "px";
      el.style.left = c.x * vw - base / 2 + "px"; el.style.top = c.y * vh - base / 2 + "px";
      el.style.transform = `scale(${c.s})`;
    }
  }
  window.addEventListener("resize", place);
  const save = () => { try { localStorage.setItem(STORE, JSON.stringify(layout)); } catch (e) { /* 保存できなくても動く */ } };
  place();

  // ----- 十字キー -----
  const dirKeys = { KeyW: false, KeyA: false, KeyS: false, KeyD: false };
  const setKey = (code, on) => { if (dirKeys[code] !== on) { dirKeys[code] = on; press(code, on); } };
  const dirEls = { KeyW: tl.querySelector(".up"), KeyA: tl.querySelector(".left"), KeyS: tl.querySelector(".down"), KeyD: tl.querySelector(".right") };
  const midEl = tl.querySelector(".mid");
  let dpadId = -1, lastMid = -1000;
  function dpad(e) {
    const r = tl.getBoundingClientRect(), dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2), dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2), d = Math.hypot(dx, dy);
    const on = { KeyW: false, KeyA: false, KeyS: false, KeyD: false };
    if (d >= 0.3) { const ux = dx / d, uy = dy / d; on.KeyW = uy < -0.38; on.KeyS = uy > 0.38; on.KeyA = ux < -0.38; on.KeyD = ux > 0.38; }
    for (const k in on) { setKey(k, on[k]); dirEls[k].classList.toggle("on", on[k]); }
    return d;
  }
  function releaseDpad() { for (const k in dirKeys) { setKey(k, false); dirEls[k].classList.remove("on"); } dpadId = -1; }
  function toggleSneak() {
    const on = !controls.keys.Shift;
    press("ShiftLeft", on);
    o.say(on ? "しゃがみ(中央ボタンをダブルタップで解除)" : "しゃがみを解除");
  }
  tl.addEventListener("pointerdown", (e) => {
    if (editing) return;
    e.preventDefault(); tl.setPointerCapture(e.pointerId); dpadId = e.pointerId;
    const d = dpad(e);
    if (d < 0.3) {   // 中央ボタン: ダブルタップでしゃがむ/解除
      const now = performance.now();
      if (now - lastMid < 320) { toggleSneak(); lastMid = -1000; } else lastMid = now;
    }
  });
  tl.addEventListener("pointermove", (e) => { if (e.pointerId === dpadId && !editing) dpad(e); });
  for (const t of ["pointerup", "pointercancel"]) tl.addEventListener(t, (e) => { if (e.pointerId === dpadId) releaseDpad(); });

  // ----- ジャンプ -----
  const jumpEl = tr.querySelector(".jump");
  let jumpId = -1;
  tr.addEventListener("pointerdown", (e) => { if (editing) return; e.preventDefault(); tr.setPointerCapture(e.pointerId); jumpId = e.pointerId; press("Space", true); jumpEl.classList.add("on"); });
  for (const t of ["pointerup", "pointercancel"]) tr.addEventListener(t, (e) => { if (e.pointerId === jumpId) { press("Space", false); jumpEl.classList.remove("on"); jumpId = -1; } });

  // ----- 画面: 見まわす / タップ / 長タップ / 弓 -----
  let g = null;   // { id, x, y, moved, timer, long, bow }
  look.addEventListener("pointerdown", (e) => {
    if (editing || o.blocked() || g) return;
    e.preventDefault(); look.setPointerCapture(e.pointerId);
    g = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: false, long: false, bow: false, timer: 0 };
    if (o.isBow() && !controls.p.glide) { g.bow = true; o.bowDown(); }
    else g.timer = setTimeout(() => { if (g && !g.moved) { g.long = true; if (navigator.vibrate) navigator.vibrate(15); o.longPress(); } }, LONG_MS);
  });
  look.addEventListener("pointermove", (e) => {
    if (!g || e.pointerId !== g.id) return;
    const dx = e.clientX - g.x, dy = e.clientY - g.y; g.x = e.clientX; g.y = e.clientY;
    controls.mouse({ movementX: dx * 1.5, movementY: dy * 1.5 });
    if (!g.moved && Math.hypot(e.clientX - g.sx, e.clientY - g.sy) > MOVE_PX) { g.moved = true; clearTimeout(g.timer); }
  });
  const end = (e, cancel) => {
    if (!g || e.pointerId !== g.id) return;
    clearTimeout(g.timer);
    if (g.bow) o.bowUp(cancel);
    else if (!cancel && !g.moved && !g.long) o.tap();
    g = null;
  };
  look.addEventListener("pointerup", (e) => end(e, false));
  look.addEventListener("pointercancel", (e) => end(e, true));

  // ----- 上のボタン -----
  $("tb-menu").onclick = () => o.menu();
  $("tb-build").onclick = () => o.build();
  $("tb-plate").onclick = () => o.plate();
  $("tb-edit").onclick = () => startEdit();

  // ----- ボタン配置の調整 -----
  let drag = null;
  function startEdit() {
    if (editing) return;
    editing = true; releaseDpad(); press("Space", false);
    root.classList.add("editing"); edit.hidden = false;
    $("te-l").value = layout.l.s; $("te-r").value = layout.r.s;
    o.editStart();
  }
  function endEdit() {
    editing = false; root.classList.remove("editing"); edit.hidden = true; save(); o.editEnd();
  }
  for (const [el, k] of [[tl, "l"], [tr, "r"]]) {
    el.addEventListener("pointerdown", (e) => { if (!editing) return; e.preventDefault(); el.setPointerCapture(e.pointerId); drag = { el, k, id: e.pointerId, dx: e.clientX - layout[k].x * window.innerWidth, dy: e.clientY - layout[k].y * window.innerHeight }; });
    el.addEventListener("pointermove", (e) => { if (!drag || drag.el !== el || e.pointerId !== drag.id) return; layout[k].x = (e.clientX - drag.dx) / window.innerWidth; layout[k].y = (e.clientY - drag.dy) / window.innerHeight; place(); });
    for (const t of ["pointerup", "pointercancel"]) el.addEventListener(t, (e) => { if (drag && e.pointerId === drag.id) drag = null; });
  }
  $("te-l").oninput = (e) => { layout.l.s = +e.target.value; place(); };
  $("te-r").oninput = (e) => { layout.r.s = +e.target.value; place(); };
  $("te-reset").onclick = () => { layout = JSON.parse(JSON.stringify(DEF)); $("te-l").value = 1; $("te-r").value = 1; place(); };
  $("te-ok").onclick = endEdit;

  // 見た目の同期(しゃがみ中は中央ボタンを光らせる)
  setInterval(() => { midEl.classList.toggle("on", !!controls.keys.Shift); }, 150);

  return {
    setAdmin(a) { $("tb-build").hidden = !a; if (!a) $("tb-plate").hidden = true; },
    setBuild(on) { $("tb-build").classList.toggle("on", on); $("tb-plate").hidden = !on; },
    startEdit,
    isEditing: () => editing,
    releaseAll() { releaseDpad(); press("Space", false); if (g) { clearTimeout(g.timer); if (g.bow) o.bowUp(true); g = null; } },
  };
}
