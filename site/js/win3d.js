// ウィンドウを3Dの世界に立てる(「講義がちる。」のマイクラモードと同じしくみ)。
//  ・ウィンドウは本物のHTML。3D変換をかけた層にのせて、世界の中に立てる。ひとつの構造物として、手前のブロックや箱にはかくれる
//    (しくみ: HTMLの層は、3Dの絵のうしろ。3Dの絵の、ウィンドウの所だけを透明にぬく。手前に物があれば、そこはぬかれない)
//  ・開くと、視線の先にうすく表示(プレビュー)。視点で位置を決めて、左クリック(か Enter)で置く
//  ・置いたあとは、十字がそのままカーソル。見出しを左クリックで、持ち上げて置きなおし
//  ・うしろから見ると、字が正しく読めるように裏返る。当たり判定はない
//  ・ほかのプレイヤーのウィンドウも見える(さわれない)
const KPX = 100;            // 3Dの層の単位は px。1ブロック = 100px
const ZOOM = 2;             // HTMLを2倍の大きさで作って、小さく立てる(字がぼやけない)
const PANEL_W = 3.2, WSIZE = 150, STEVE_H = 1.8, FAR0 = 3, NEAR = 0.8;
const epsl = (v) => (Math.abs(v) < 1e-10 ? 0 : v);

export function createWin3D(T, scene, camera, controls, say, onPlaced) {
  const view = document.getElementById("view");
  const cssRoot = document.createElement("div");
  cssRoot.id = "css3d";
  cssRoot.style.cssText = "position:fixed;inset:0;overflow:hidden;pointer-events:none;z-index:0";
  const cssCam = document.createElement("div");
  cssCam.style.cssText = "position:absolute;left:0;top:0;transform-style:preserve-3d;pointer-events:none";
  cssRoot.appendChild(cssCam);
  view.before(cssRoot);   // 3Dの絵のうしろ
  const ban = document.createElement("div");
  ban.className = "pv-ban"; ban.hidden = true;
  ban.textContent = "ウィンドウの位置：十字の先に表示中（視点を動かして調整／ピンチで近く・遠く）　左クリックで決定";
  document.body.appendChild(ban);
  // 3Dの絵を、ウィンドウの所だけ透明にする板(手前に物があると、そこは残る)
  const holeMat = new T.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, blending: T.NoBlending, side: T.DoubleSide, fog: false, toneMapped: false, depthWrite: true });

  const panels = [];
  const poseV = new T.Vector3(), poseQ = new T.Quaternion(), poseE = new T.Euler();
  const camCss = (m) => { const e = m.elements; return "matrix3d(" + [e[0], -e[1], e[2], e[3], e[4], -e[5], e[6], e[7], e[8], -e[9], e[10], e[11], e[12], -e[13], e[14], e[15]].map(epsl).join(",") + ")"; };
  const objCss = (m) => { const e = m.elements; return "matrix3d(" + [e[0], e[1], e[2], e[3], -e[4], -e[5], -e[6], -e[7], e[8], e[9], e[10], e[11], e[12], e[13], e[14], e[15]].map(epsl).join(",") + ")"; };
  const scaleFor = (w0) => PANEL_W / Math.max(260, w0 / ZOOM) * WSIZE / 100 / ZOOM;   // 1px が何ブロックか
  function rounded(w, h, r) {
    const s = new T.Shape(), x0 = -w / 2, y0 = -h / 2;
    s.moveTo(x0 + r, y0); s.lineTo(x0 + w - r, y0); s.quadraticCurveTo(x0 + w, y0, x0 + w, y0 + r);
    s.lineTo(x0 + w, y0 + h - r); s.quadraticCurveTo(x0 + w, y0 + h, x0 + w - r, y0 + h);
    s.lineTo(x0 + r, y0 + h); s.quadraticCurveTo(x0, y0 + h, x0, y0 + h - r); s.lineTo(x0, y0 + r); s.quadraticCurveTo(x0, y0, x0 + r, y0);
    return new T.ShapeGeometry(s, 4);
  }
  function poseFor(p, k) {
    const P = controls.p, L = controls.lookDir(), eye = [P.x, P.y + controls.eyeH(), P.z];
    const t = Math.max(NEAR, STEVE_H * p.far), w = p.w0 * p.s;
    const rx = Math.cos(P.yaw), rz = -Math.sin(P.yaw), off = k * (w + 0.3);
    poseV.set(eye[0] + L[0] * t + rx * off, eye[1] + L[1] * t, eye[2] + L[2] * t + rz * off);
    poseQ.setFromEuler(poseE.set(P.pitch, P.yaw, 0, "YXZ"));
  }
  function place(p) {
    p.mat.compose(p.pos.clone().multiplyScalar(KPX), p.quat, new T.Vector3(p.s * KPX, p.s * KPX, p.s * KPX));
    p.wrap.style.transform = objCss(p.mat);
  }
  // ウィンドウ(.pop)を3Dにのせる。opt: { remote: true, pose } はほかの人のウィンドウ(さわれない・置いた場所に出す)
  function adopt(el, opt = {}) {
    el.style.zoom = String(ZOOM);
    const rw = el.getBoundingClientRect().width;
    const zf = el.offsetWidth ? rw / el.offsetWidth : ZOOM;   // offsetHeight を、見た目の大きさにする倍率(ブラウザによって 1 か ZOOM)
    const w0 = rw || 800;
    const wrap = document.createElement("div");
    wrap.style.cssText = "position:absolute;left:0;top:0;width:0;height:0;transform-origin:0 0;pointer-events:none";
    cssCam.appendChild(wrap); wrap.appendChild(el);
    el.style.left = (-w0 / 2 / ZOOM) + "px"; el.style.top = "0px";
    const p = { el, wrap, w0, zf, far: FAR0, fixed: false, remote: !!opt.remote, pos: new T.Vector3(), quat: new T.Quaternion(), mat: new T.Matrix4(), s: scaleFor(w0), back: false, h: 0, hole: null, meta: opt.meta || null };
    p.hole = new T.Mesh(rounded(1, 1, 0.01), holeMat); p.hole.renderOrder = -10; scene.add(p.hole);
    panels.push(p);
    if (opt.pose) setPose(p, opt.pose);
    else preview(p);
    if (p.remote) el.style.pointerEvents = "none";
    return p;
  }
  function setPose(p, ps) {
    p.pos.set(ps.pos[0], ps.pos[1], ps.pos[2]); p.quat.set(ps.quat[0], ps.quat[1], ps.quat[2], ps.quat[3]);
    if (ps.s) p.s = ps.s;
    p.fixed = true; p.el.style.opacity = ""; if (!p.remote) p.el.style.pointerEvents = "auto";
    place(p);
  }
  function preview(p) {
    p.fixed = false; p.el.style.pointerEvents = "none"; p.el.style.opacity = "0.6";
    const f = document.activeElement; if (f && p.el.contains(f)) f.blur();
  }
  function fixAll() {
    let last = null;
    for (const p of panels) if (!p.fixed && !p.remote) { p.fixed = true; p.el.style.pointerEvents = "auto"; p.el.style.opacity = ""; last = p; if (onPlaced) onPlaced(p); }
    if (!last) return false;
    say("ウィンドウを置きました");
    const f = last.el.querySelector("textarea, input[type=text], input[type=url]");
    if (f) { try { f.focus({ preventScroll: true }); } catch (e) { /* なし */ } }
    return true;
  }
  function remove(el) {
    const i = panels.findIndex((p) => p.el === el);
    if (i < 0) return;
    const p = panels[i]; panels.splice(i, 1);
    if (p.wrap.parentNode) p.wrap.remove();
    scene.remove(p.hole); p.hole.geometry.dispose();
  }
  // 十字(画面の真ん中)の下にあるもの(3Dの絵をいったん外して調べる)
  function under() {
    const x = window.innerWidth / 2, y = window.innerHeight / 2;
    const pe = view.style.pointerEvents; view.style.pointerEvents = "none";
    let el = null;
    try { el = document.elementFromPoint(x, y); } finally { view.style.pointerEvents = pe; }
    const pop = el && el.closest && el.closest(".pop");
    if (!pop) return null;
    const p = panels.find((q) => q.el === pop);
    if (!p || !p.fixed || p.remote) return null;
    if (!visibleAtCenter(p)) return null;   // 手前のブロックなどにかくれている
    return { el, pop, x, y, p };
  }
  // 十字の線が、ウィンドウに届く前に、物に当たっていないか
  let occluder = null;
  function setOccluder(fn) { occluder = fn; }
  function hitPlane(p) {   // 十字の線と、ウィンドウの面の交点(距離と、ウィンドウの中のpx)
    const P = controls.p, L = controls.lookDir(), o = new T.Vector3(P.x, P.y + controls.eyeH(), P.z), d = new T.Vector3(L[0], L[1], L[2]);
    const n = new T.Vector3(0, 0, 1).applyQuaternion(p.quat), den = n.dot(d);
    if (Math.abs(den) < 1e-6) return null;
    const t = n.dot(p.pos.clone().sub(o)) / den;
    if (t <= 0) return null;
    const hit = o.clone().addScaledVector(d, t).sub(p.pos);
    const ux = new T.Vector3(1, 0, 0).applyQuaternion(p.quat), uy = new T.Vector3(0, 1, 0).applyQuaternion(p.quat);
    return { t, x: hit.dot(ux) / p.s, y: -hit.dot(uy) / p.s };   // ウィンドウの上のまんなかが (0,0)
  }
  function visibleAtCenter(p) {
    const h = hitPlane(p);
    if (!h || !occluder) return true;
    return occluder(h.t) >= h.t - 0.05;
  }
  // 左クリック: ふつうのマウスでクリックしたのと同じことを起こす
  let zTop = 10, drag = null;
  function click() {
    if (panels.some((p) => !p.fixed && !p.remote)) { fixAll(); return true; }
    const u = under();
    if (!u) return false;
    const { el, pop, x, y, p } = u;
    if (el.closest(".pop-h") && !el.closest("button")) {   // 見出し: 持ち上げて、置きなおす
      p.far = Math.max(0.6, p.pos.distanceTo(new T.Vector3(controls.p.x, controls.p.y + controls.eyeH(), controls.p.z)) / STEVE_H);
      preview(p); say("ウィンドウを持ち上げました：視点で位置を決めて左クリック");
      return true;
    }
    // スクロールのバー(右のはし)をつかんだら、マウスを上下に動かしてスクロール
    const sc = scroller(el, pop);
    if (sc) {
      const hp = hitPlane(p), r = sc.getBoundingClientRect(), pr = pop.getBoundingClientRect();
      const lx = hp ? hp.x * 1 + p.w0 / 2 : 0;   // ウィンドウの左はしからの距離(拡大前のpx×ZOOM)
      const scRight = (sc.offsetLeft + sc.offsetWidth) * p.zf;
      if (hp && sc.scrollHeight > sc.clientHeight + 1 && lx > scRight - 18 * p.zf && lx <= scRight + 2) { drag = { sc }; return true; }
      void r; void pr;
    }
    const o = { bubbles: true, cancelable: true, composed: true, view: window, clientX: x, clientY: y, screenX: x, screenY: y, button: 0, buttons: 1, detail: 1 };
    const fire = (t, b) => { o.buttons = b; el.dispatchEvent(t.startsWith("pointer") ? new PointerEvent(t, Object.assign({ pointerId: 1, pointerType: "mouse", isPrimary: true }, o)) : new MouseEvent(t, o)); };
    fire("pointerdown", 1); fire("mousedown", 1);
    const f = el.closest("input, textarea, select, button, a, [tabindex]");
    if (f && f.focus) { try { f.focus({ preventScroll: true }); } catch (e) { /* なし */ } }
    else if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
    fire("pointerup", 0); fire("mouseup", 0);
    if (f && f.tagName === "BUTTON") f.click(); else fire("click", 0);
    pop.style.zIndex = String(++zTop);
    return true;
  }
  function scroller(el, pop) {
    let sc = el;
    while (sc && sc !== pop.parentNode) { if (sc.scrollHeight > sc.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(sc).overflowY)) return sc; sc = sc.parentNode; }
    return pop.querySelector(".pop-b");
  }
  // ホイール。プレビュー中: 近く・遠く(ピンチ)。置いたウィンドウ: スクロール(二本指・スクロールモード)
  function previewWheel(e) {
    const pv = panels.filter((p) => !p.fixed && !p.remote);
    if (!pv.length) return false;
    const d = e.deltaY * (e.deltaMode === 1 ? 16 : 1) * (e.ctrlKey ? 0.012 : 0.004), f = Math.exp(d);
    for (const p of pv) p.far = Math.max(0.5, Math.min(6, p.far * f));
    return true;
  }
  function scrollUnder(dy, dx) {
    const u = under();
    if (!u) return false;
    const sc = scroller(u.el, u.pop);
    if (sc && sc.scrollBy) sc.scrollBy(dx || 0, dy);
    return true;
  }

  return {
    adopt, remove, click, previewWheel, scrollUnder, fixAll, under, setOccluder,
    setPose: (p, ps) => { if (p) setPose(p, ps); },
    panelOf: (el) => panels.find((q) => q.el === el) || null,
    get previewing() { return panels.some((p) => !p.fixed && !p.remote); },
    get dragging() { return !!drag; },
    dragMove(dy) { if (!drag) return; const sc = drag.sc; sc.scrollTop += dy * Math.max(1, sc.scrollHeight / sc.clientHeight); },
    dragEnd() { drag = null; },
    poseOf(el) { const p = panels.find((q) => q.el === el); return p ? { pos: p.pos.toArray().map((v) => Math.round(v * 100) / 100), quat: p.quat.toArray().map((v) => Math.round(v * 1e4) / 1e4), s: p.s } : null; },
    // 毎フレーム: プレビューを視線に合わせ、ぬく板と、HTMLの層をカメラに合わせる
    update() {
      let k = 0;
      for (const p of panels) {
        if (!p.el.isConnected || p.el.parentNode !== p.wrap) continue;
        if (!p.fixed && !p.remote) { poseFor(p, k++); p.pos.copy(poseV); p.quat.copy(poseQ); place(p); }
        const zx = p.mat.elements, dx = camera.position.x - p.pos.x, dy = camera.position.y - p.pos.y, dz = camera.position.z - p.pos.z;
        const back = (zx[8] * dx + zx[9] * dy + zx[10] * dz) < 0;
        if (p.back !== back) { p.back = back; p.el.style.transform = back ? "rotateY(180deg)" : ""; }
        // ぬく板: ウィンドウと同じ大きさ・場所(高さは、中身で変わる)
        const h = p.el.offsetHeight * p.zf, w = p.w0;
        if (Math.abs(h - p.h) > 0.5) { p.h = h; p.hole.geometry.dispose(); p.hole.geometry = rounded(w * p.s, h * p.s, 12 * ZOOM * p.s); }
        p.hole.visible = p.fixed || p.remote;   // 置く前のプレビューは、HTMLの層ごと手前に出す
        p.hole.position.copy(p.pos).addScaledVector(new T.Vector3(0, -1, 0).applyQuaternion(p.quat), h * p.s / 2);
        p.hole.quaternion.copy(p.quat);
        p.el.style.visibility = "";
      }
      ban.hidden = k === 0;
      cssRoot.style.zIndex = k > 0 ? "3" : "0";   // 置く前のプレビューは、絵の手前に出す
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
