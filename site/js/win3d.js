// ウィンドウを3Dの世界に立てる(「講義がちる。」のマイクラモードと同じしくみ)。
//  ・ウィンドウは本物のHTML。3D変換をかけた層にのせて、世界の中に立てる
//  ・開くと、視線の先にうすく表示(プレビュー)。視点を動かして位置を決め、左クリック(か Enter)で置く
//  ・置いたあとは、十字がそのままカーソル。十字を合わせて左クリックで、ボタンを押す・入力欄を選ぶ
//  ・見出しを左クリックすると、もう一度持ち上げて、置きなおせる
//  ・うしろから見ると、字が正しく読めるように裏返る
//  ・ホイール: 十字がウィンドウの上ならスクロール、プレビュー中なら近く/遠く
const KPX = 100;            // 3Dの層の単位は px。1ブロック = 100px
const PANEL_W = 3.2, WSIZE = 150, STEVE_H = 1.8, FAR0 = 3, NEAR = 0.8;
const epsl = (v) => (Math.abs(v) < 1e-10 ? 0 : v);

export function createWin3D(T, camera, controls, say) {
  const cssRoot = document.createElement("div");
  cssRoot.style.cssText = "position:fixed;inset:0;overflow:hidden;pointer-events:none;z-index:5";
  const cssCam = document.createElement("div");
  cssCam.style.cssText = "position:absolute;left:0;top:0;transform-style:preserve-3d;pointer-events:none";
  cssRoot.appendChild(cssCam);
  document.getElementById("view").after(cssRoot);
  const ban = document.createElement("div");
  ban.className = "pv-ban"; ban.hidden = true;
  ban.textContent = "ウィンドウの位置：十字の先に表示中（視点を動かして調整／ホイールで近く・遠く）　左クリックで決定";
  document.body.appendChild(ban);

  const panels = [];
  const poseV = new T.Vector3(), poseQ = new T.Quaternion(), poseE = new T.Euler();
  const camCss = (m) => { const e = m.elements; return "matrix3d(" + [e[0], -e[1], e[2], e[3], e[4], -e[5], e[6], e[7], e[8], -e[9], e[10], e[11], e[12], -e[13], e[14], e[15]].map(epsl).join(",") + ")"; };
  const objCss = (m) => { const e = m.elements; return "matrix3d(" + [e[0], e[1], e[2], e[3], -e[4], -e[5], -e[6], -e[7], e[8], e[9], e[10], e[11], e[12], e[13], e[14], e[15]].map(epsl).join(",") + ")"; };
  const geom = (w0, cap) => { const s = PANEL_W / Math.max(260, w0) * WSIZE / 100; return { s, hh: Math.min(cap, 560) * s / 2, w: w0 * s }; };
  // 視線の先(はじまりのプレビューの位置)
  function poseFor(p, k) {
    const P = controls.p, L = controls.lookDir(), eye = [P.x, P.y + controls.eyeH(), P.z];
    const t = Math.max(NEAR, STEVE_H * p.far), g = geom(p.w0, p.cap);
    const rx = Math.cos(P.yaw), rz = -Math.sin(P.yaw), off = k * (g.w + 0.3);
    poseV.set(eye[0] + L[0] * t + rx * off, eye[1] + L[1] * t, eye[2] + L[2] * t + rz * off);
    poseQ.setFromEuler(poseE.set(P.pitch, P.yaw, 0, "YXZ"));
    return g;
  }
  function place(p) {
    p.mat.compose(p.pos.clone().multiplyScalar(KPX), p.quat, new T.Vector3(p.s * KPX, p.s * KPX, p.s * KPX));
    p.wrap.style.transform = objCss(p.mat);
  }
  // ウィンドウ(.pop)を3Dにのせる。はじめはプレビュー
  function adopt(el) {
    const wrap = document.createElement("div");
    wrap.style.cssText = "position:absolute;left:0;top:0;width:0;height:0;transform-origin:0 0;pointer-events:none";
    cssCam.appendChild(wrap); wrap.appendChild(el);
    const w0 = el.offsetWidth || 400, cap = Math.max(120, Math.min(el.offsetHeight || 400, 560));
    el.style.left = -w0 / 2 + "px"; el.style.top = -cap / 2 + "px";
    const p = { el, wrap, w0, cap, far: FAR0, fixed: false, pos: new T.Vector3(), quat: new T.Quaternion(), mat: new T.Matrix4(), s: geom(w0, cap).s, back: false };
    panels.push(p);
    preview(p);
    return p;
  }
  function preview(p) {
    p.fixed = false; p.el.style.pointerEvents = "none"; p.el.style.opacity = "0.6";
    const f = document.activeElement; if (f && p.el.contains(f)) f.blur();
  }
  function fixAll() {
    let last = null;
    for (const p of panels) if (!p.fixed) { p.fixed = true; p.el.style.pointerEvents = "auto"; p.el.style.opacity = ""; last = p; }
    if (!last) return false;
    say("ウィンドウを置きました");
    // 入力欄があれば、すぐ書けるように
    const f = last.el.querySelector("textarea, input[type=text], input[type=url]");
    if (f) { try { f.focus({ preventScroll: true }); } catch (e) { /* なし */ } }
    return true;
  }
  function remove(el) {
    const i = panels.findIndex((p) => p.el === el);
    if (i < 0) return;
    const p = panels[i]; panels.splice(i, 1);
    if (p.wrap.parentNode) p.wrap.remove();
  }
  // 十字(画面の真ん中)の下にある、ウィンドウの中の要素
  function under() {
    const x = window.innerWidth / 2, y = window.innerHeight / 2;
    const el = document.elementFromPoint(x, y);
    const pop = el && el.closest && el.closest(".pop");
    return pop ? { el, pop, x, y } : null;
  }
  // 十字で左クリック: ふつうのマウスでクリックしたのと同じことを起こす
  function click() {
    if (panels.some((p) => !p.fixed)) { fixAll(); return true; }
    const u = under();
    if (!u) return false;
    const { el, pop, x, y } = u;
    if (el.closest(".pop-h") && !el.closest("button")) {   // 見出し: 持ち上げて、置きなおす
      const p = panels.find((q) => q.el === pop);
      if (p) { p.far = Math.max(0.6, p.pos.distanceTo(new T.Vector3(controls.p.x, controls.p.y + controls.eyeH(), controls.p.z)) / STEVE_H); preview(p); say("ウィンドウを持ち上げました：視点で位置を決めて左クリック"); }
      return true;
    }
    const o = { bubbles: true, cancelable: true, composed: true, view: window, clientX: x, clientY: y, screenX: x, screenY: y, button: 0, buttons: 1, detail: 1 };
    const fire = (t, b) => { o.buttons = b; el.dispatchEvent(t.startsWith("pointer") ? new PointerEvent(t, Object.assign({ pointerId: 1, pointerType: "mouse", isPrimary: true }, o)) : new MouseEvent(t, o)); };
    fire("pointerdown", 1); fire("mousedown", 1);
    const f = el.closest("input, textarea, select, button, a, [tabindex]");
    if (f && f.focus) { try { f.focus({ preventScroll: true }); } catch (e) { /* なし */ } }
    else if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
    fire("pointerup", 0); fire("mouseup", 0); fire("click", 0);
    if (f && f.tagName === "A" && f.href && f.target === "_blank") { /* リンクは click で開く */ }
    pop.style.zIndex = String(++zTop);
    return true;
  }
  let zTop = 10;
  // ホイール。使ったら true
  function wheel(e) {
    const pv = panels.filter((p) => !p.fixed);
    if (pv.length) {
      const d = e.deltaY * (e.deltaMode === 1 ? 16 : 1) * 0.004, f = Math.exp(d);
      for (const p of pv) p.far = Math.max(0.5, Math.min(6, p.far * f));
      return true;
    }
    const u = under();
    if (!u) return false;
    let sc = u.el;
    while (sc && sc !== u.pop.parentNode) { if (sc.scrollHeight > sc.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(sc).overflowY)) break; sc = sc.parentNode; }
    if (sc && sc.scrollBy) sc.scrollBy(0, e.deltaY * (e.deltaMode === 1 ? 16 : 1));
    return true;
  }

  return {
    adopt, remove, click, wheel, fixAll, under,
    get previewing() { return panels.some((p) => !p.fixed); },
    get count() { return panels.length; },
    // 毎フレーム: プレビューを視線に合わせ、3Dの層をカメラに合わせる
    update() {
      let k = 0;
      for (const p of panels) {
        if (!p.el.isConnected || p.el.parentNode !== p.wrap) continue;
        if (!p.fixed) { const g = poseFor(p, k++); p.pos.copy(poseV); p.quat.copy(poseQ); p.s = g.s; place(p); }
        // うしろから見ると、裏返して、字を正しく読めるように
        const zx = p.mat.elements, dx = camera.position.x - p.pos.x, dy = camera.position.y - p.pos.y, dz = camera.position.z - p.pos.z;
        const back = (zx[8] * dx + zx[9] * dy + zx[10] * dz) < 0;
        if (p.back !== back) { p.back = back; p.el.style.transform = back ? "rotateY(180deg)" : ""; }
      }
      ban.hidden = k === 0;
      if (!panels.length) return;
      const W = window.innerWidth, H = window.innerHeight, hw = W / 2, hh = H / 2;
      camera.updateMatrixWorld();
      const inv = new T.Matrix4().copy(camera.matrixWorld).invert(), me = inv.elements;
      me[12] *= KPX; me[13] *= KPX; me[14] *= KPX;
      const fov = camera.projectionMatrix.elements[5] * hh;
      cssRoot.style.perspective = fov + "px"; cssCam.style.width = W + "px"; cssCam.style.height = H + "px";
      cssCam.style.transform = "translateZ(" + fov + "px)" + camCss(inv) + " translate(" + hw + "px," + hh + "px)";
    },
  };
}
