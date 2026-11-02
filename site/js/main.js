// 全体をつなぐ場所。3D表示の準備、ログイン、ループ、マウスのロック、パネルの開閉、通信。
import { Controls } from "./controls.js";
import { createHud } from "./hud.js";
import { Net } from "./net.js";
import { RemotePlayers, createAvatar } from "./players.js";
import { createFirstPerson } from "./fp.js";
import { createArrows } from "./arrows.js";
import { restore, login, logout, getToken, loginGoogle, googleButton } from "./auth.js";
import { VERSION } from "./version.js";
import { World, buildChunk, CH } from "./world.js";
import { BuildTool } from "./build.js";
import { N, YMIN, YN, BLOCK, mod, wrapDelta, SUN } from "./shared.js";
import { createMinimap } from "./minimap.js";
import { PLATE_NAMES } from "./plates.js";
import { createTouch, detectTouch } from "./touch.js";

const THREE = window.THREE;
const isTouch = detectTouch();   // スマホ・タブレット(?touch=1 でパソコンでも試せる)
const canvas = document.getElementById("view");
if (!THREE) {
  document.getElementById("fatal").hidden = false;
  throw new Error("three.js が読み込めませんでした");
}

// ----- 設定(ブラウザに保存される) -----
const SKEY = "craft-settings";
const settings = { fov: 70, sens: 5, speed: 100 };
try { Object.assign(settings, JSON.parse(localStorage.getItem(SKEY) || "{}")); } catch (e) { /* 読めなければ初期値 */ }

// ----- 3D表示: 白い床・青い空・平ら -----
const SKY = 0xf0a070;   // 夕日: 地平線のオレンジ(遠くのかすみの色)
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.shadowMap.enabled = !window.__NOSHADOW;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
const scene = new THREE.Scene();
scene.background = new THREE.Color(SKY);
scene.fog = new THREE.Fog(SKY, 70, 190);
// 世界(49x49x49)のはしを、青い枠で示す
{
  const g = new THREE.EdgesGeometry(new THREE.BoxGeometry(N, YN, N));
  const fr = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x1f6bff, fog: false }));
  fr.position.set(N / 2 - 0.5, YMIN + YN / 2 - 0.5, N / 2 - 0.5);
  scene.add(fr);
}
// F2: 16ブロックごとの区切り(16×16×16の箱)
const chunkGrid = (() => {
  const v = [], x0 = -0.5, y0 = YMIN - 0.5, z0 = -0.5, S = 16, pos = [];
  for (let k = 0; k < N; k += S) pos.push(k);
  pos.push(N);   // 16ごとの区切り。さいごのはんぱな区画のはしも
  for (const a of pos) for (const b of pos) {
    v.push(x0, y0 + a, z0 + b, x0 + N, y0 + a, z0 + b);   // x方向
    v.push(x0 + a, y0, z0 + b, x0 + a, y0 + YN, z0 + b);   // y方向
    v.push(x0 + a, y0 + b, z0, x0 + a, y0 + b, z0 + N);   // z方向
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(v, 3));
  const l = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xffa51f, transparent: true, opacity: 0.85 }));
  l.visible = false;
  scene.add(l);
  return l;
})();
const camera = new THREE.PerspectiveCamera(settings.fov, 1, 0.05, 400);
camera.rotation.order = "YXZ";

scene.add(new THREE.HemisphereLight(0xffe0c8, 0x9a8a80, 0.75));
const sun = new THREE.DirectionalLight(0xffc890, 0.9);
sun.position.set(SUN[0] * 300, SUN[1] * 300, SUN[2] * 300);
sun.target.position.set(0, 10, 0);
sun.castShadow = false;
scene.add(sun, sun.target);

// 夕焼けの空と、西にしずむ太陽
const skyDome = (() => {
  const g = new THREE.SphereGeometry(300, 32, 20), P = g.attributes.position, cols = [];
  const mix = (a, b, t) => a.map((q, i) => q + (b[i] - q) * t);
  const stops = [[0, [1.0, 0.62, 0.36]], [0.16, [0.95, 0.45, 0.5]], [0.45, [0.5, 0.34, 0.62]], [1, [0.16, 0.2, 0.46]]];
  for (let i = 0; i < P.count; i++) {
    const e = Math.max(0, P.getY(i) / 300), d = [P.getX(i) / 300, P.getY(i) / 300, P.getZ(i) / 300];
    let c = stops[0][1];
    for (let k = 1; k < stops.length; k++) if (e <= stops[k][0]) { c = mix(stops[k - 1][1], stops[k][1], (e - stops[k - 1][0]) / (stops[k][0] - stops[k - 1][0])); break; } else c = stops[k][1];
    const gl = Math.pow(Math.max(0, d[0] * SUN[0] + d[1] * SUN[1] + d[2] * SUN[2]), 6) * 0.55;   // 太陽のまわりの光
    cols.push(Math.min(1, c[0] + gl), Math.min(1, c[1] + gl * 0.7), Math.min(1, c[2] + gl * 0.35));
  }
  g.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
  const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  mesh.renderOrder = -10; mesh.frustumCulled = false;
  scene.add(mesh);
  return mesh;
})();
const sunSprite = (() => {
  const cv = document.createElement("canvas"); cv.width = cv.height = 128;
  const x = cv.getContext("2d"), gr = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, "rgba(255,255,240,1)"); gr.addColorStop(0.22, "rgba(255,236,170,1)"); gr.addColorStop(0.3, "rgba(255,190,100,.55)"); gr.addColorStop(1, "rgba(255,150,80,0)");
  x.fillStyle = gr; x.fillRect(0, 0, 128, 128);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), fog: false, depthWrite: false, transparent: true }));
  s.scale.set(120, 120, 1); s.renderOrder = -9;
  scene.add(s);
  return s;
})();

// ----- 世界: ブロックとプレート。横・縦ともにループするので、まわりに27個のコピーを並べて、切れ目なく見せる -----
const world = new World();
world.spawn = { x: Math.floor(N / 2), y: YMIN + 0.5, z: Math.floor(N / 2), yaw: 0, pitch: 0 };
const worldMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
const NC = Math.ceil(N / CH);
const offsets = [];
for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) offsets.push([dx * N, dy * YN, dz * N]);
const chunkMeshes = [];
for (let i = 0; i < NC * NC; i++) {
  chunkMeshes.push(offsets.map((o) => { const m = new THREE.Mesh(new THREE.BufferGeometry(), worldMat); m.position.set(o[0], o[1], o[2]); m.visible = false; scene.add(m); return m; }));
  world.dirty.add(i);
}
function rebuildDirty(budgetMs = Infinity) {
  const t0 = performance.now();
  for (const ci of [...world.dirty]) {
    if (performance.now() - t0 > budgetMs) break;
    world.dirty.delete(ci);
    const d = buildChunk(world, Math.floor(ci / NC), ci % NC);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(d.pos, 3));
    g.setAttribute("color", new THREE.BufferAttribute(d.col, 3));
    g.setIndex(new THREE.BufferAttribute(d.idx, 1));
    g.computeBoundingSphere();
    for (const m of chunkMeshes[ci]) { m.geometry.dispose(); m.geometry = g; m.visible = d.idx.length > 0; }
  }
}
rebuildDirty();

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize);
resize();

// ----- 操作 -----
let hud;
const controls = new Controls({ world, spawn: world.spawn, win: window, doc: document, say: (t) => hud && hud.say(t) });
const firstPerson = createFirstPerson(THREE, camera, scene, controls);
const arrows = createArrows(THREE, scene, world, (a, b) => remotes.segHit(a, b), (id) => { if (net.ready()) net.sendHit(id, "arrow"); });
const build = new BuildTool(THREE, scene, world);
let isAdmin = false, buildMode = false;
// F2〜F5の状態は、更新(再読み込み)しても引きつぐ(ブラウザに保存)
const UKEY = "craft-ui";
const uiPrefs = { f2: false, f3: false, f4: false, view: 0 };
try { Object.assign(uiPrefs, JSON.parse(localStorage.getItem(UKEY) || "{}")); } catch (e) { /* 初期値 */ }
function saveUi() { try { localStorage.setItem(UKEY, JSON.stringify(uiPrefs)); } catch (e) { /* 保存できなくても動く */ } }
controls.p.view = [0, 1, 2].includes(uiPrefs.view) ? uiPrefs.view : 0;
const me3d = createAvatar(THREE, "#c0392b");
// 左上の「はたから見た自分」: 小さな別の場面に、もう一人の自分を置いて映す(画面の左上にだけ描く)
const selfScene = new THREE.Scene();
const selfAv = createAvatar(THREE, "#c0392b");
selfScene.add(selfAv.root);
selfScene.add(new THREE.HemisphereLight(0xffe0c8, 0x8a7a70, 0.8));
{ const dl = new THREE.DirectionalLight(0xffc890, 0.9); dl.position.set(SUN[0] * 10, SUN[1] * 10, SUN[2] * 10); selfScene.add(dl); }
const selfCam = new THREE.PerspectiveCamera(32, 118 / 150, 0.1, 50);
selfCam.position.set(3.7, 2.4, 3.7);   // 南東から北西をながめる(ミニ地図と同じ向き)
selfCam.lookAt(0, 0.85, 0);
const selfEl = document.getElementById("selfview");
function renderSelf(p, dt) {
  const r = selfEl.getBoundingClientRect();
  if (r.width < 2) return;
  selfCam.aspect = r.width / r.height; selfCam.updateProjectionMatrix();
  selfAv.pose({ hs: controls.hs || 0, bodyYaw: p.bodyYaw, yaw: p.yaw, pitch: p.pitch, glide: p.glide, fly: p.fly, sneak: p.sneak, sprint: p.sprint, air: !p.ground, rocket: p.boost > 0, swing: controls.swingP }, dt);
  const H = window.innerHeight;
  renderer.setScissorTest(true);
  renderer.setViewport(r.left, H - r.bottom, r.width, r.height);
  renderer.setScissor(r.left, H - r.bottom, r.width, r.height);
  renderer.autoClear = false;
  renderer.clearDepth();   // 色は消さない: キャラ以外は、うしろの景色がそのまま透ける
  renderer.render(selfScene, selfCam);
  renderer.autoClear = true;
  renderer.setScissorTest(false);
  renderer.setViewport(0, 0, window.innerWidth, H);
}
scene.add(me3d.root);
function applySettings() {
  controls.sens = settings.sens / 5;
  controls.baseFov = settings.fov;
  controls.speedMul = Math.max(10, Math.min(500, +settings.speed || 100)) / 100;
}
applySettings();

// ----- パネル(ログイン/メニュー/持ち物/本)とマウスのロック -----
let panel = "login";   // null のときは、世界を操作している
let locked = false;
let user = null;
let netStarted = false;

hud = createHud({
  settings,
  onSettings: () => { applySettings(); try { localStorage.setItem(SKEY, JSON.stringify(settings)); } catch (e) { /* 保存できなくても動く */ } },
  onEnter: () => { askNotify(); if (user) { if (isTouch) tryFullscreen(); setPanel(null); } },
  onClose: () => setPanel(null),
  onRespawn: () => controls.respawn(),
  onTouchEdit: () => { setPanel(null); if (touch) touch.startEdit(); },
  onGoogleBtn: (host, note) => googleButton(host, async (cred) => {
    const r = await loginGoogle(cred);
    if (r.error) hud.renderLogin(r.error); else signedIn(r.user);
  }, (why) => note(why === "off" ? "Googleでのログインは、まだ設定されていません。" : "Googleの部品を読み込めませんでした。IDとパスワードで入るか、しばらくしてからやり直してください。")),
  onLogin: async (u, p) => {
    const r = await login(u, p);
    if (r.error) return r;
    signedIn(r.user);
    return {};
  },
  onLogout: async () => {
    await logout();
    net.stop(); netStarted = false; remotes.clear();
    saveState(); stateUid = ""; worldReady = false; welcomed = false; loadStart = performance.now();
    user = null; isAdmin = false; controls.canFly = false; if (touch) { touch.setAdmin(false); touch.setBuild(false); } buildMode = false; hud.setAdmin(false); hud.setBuildMode(false);
    netState = "idle"; refreshOnline();
    setPanel("login");
  },
});

// ----- 引きつぎ: 位置・向き・持っているもの・飛行・ズームなどを保存して、開き直したら続きから -----
let stateUid = "";   // 復元が済んだ人(これが空のあいだは、保存しない)
function stateKey(u) { return "craft-state:" + (u.uid || u.username || "x"); }
function saveState() {
  if (!stateUid || !user) return;
  const p = controls.p;
  const st = { x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch, fly: p.fly, zt: p.zt, sel: hud.selected(), plate: build.plateMode };
  try { localStorage.setItem(stateKey(user), JSON.stringify(st)); } catch (e) { /* 保存できなくても動く */ }
}
function restoreState(u) {
  let st = null;
  try { st = JSON.parse(localStorage.getItem(stateKey(u)) || "null"); } catch (e) { st = null; }
  const num = (v, lo, hi, d) => (Number.isFinite(v) && v >= lo && v <= hi ? v : d);
  if (st && typeof st === "object") {
    const p = controls.p;
    p.x = num(st.x, -1, N, p.x); p.y = num(st.y, YMIN - 1, YMIN + YN + 1, p.y); p.z = num(st.z, -1, N, p.z);
    p.yaw = num(st.yaw, -1000, 1000, p.yaw); p.pitch = num(st.pitch, -1.5707, 1.5707, p.pitch);
    p.vx = p.vy = p.vz = 0; p.ground = false; p.glide = false; p.boost = 0; p.bodyYaw = p.yaw;
    p.fly = !!st.fly && isAdmin;
    p.zt = p.zm = num(st.zt, 1, 14, 1);
    if (Number.isInteger(st.sel)) hud.select(st.sel);
    if ([0, 1, 2].includes(st.plate)) build.plateMode = st.plate;
    forceSend = true;
  }
  stateUid = u.uid || u.username || "x";
}
// 建築が反映されたあと、体がブロックの中に入っていたら、上に出す
function unstick() {
  const p = controls.p;
  for (let i = 0; i < YN && controls.hits(p.x, p.y, p.z, controls.curH()); i++) p.y += 1;
}
window.addEventListener("pagehide", saveState);
document.addEventListener("visibilitychange", () => { if (document.hidden) saveState(); });
setInterval(saveState, 1000);

function signedIn(u) {
  user = u;
  isAdmin = u.role === "admin"; buildMode = isAdmin && uiPrefs.f4; controls.canFly = isAdmin; if (touch) { touch.setAdmin(isAdmin); touch.setBuild(buildMode); }
  hud.setUser(u); hud.setAdmin(isAdmin); hud.setBuildMode(buildMode);
  loadLocalHist();
  startLoading(); ensureOnline();
  setPanel("menu");
}

// ----- 更新の検知: 新しいバージョンが公開されたら、タブの題名・通知で知らせる -----
const BASE_TITLE = document.title;
let updateSeen = "", titleTimer = 0;
function askNotify() {
  try { if ("Notification" in window && Notification.permission === "default") Notification.requestPermission(); } catch (e) { /* 使えない端末では、タブの題名だけ */ }
}
function updateFound(v) {
  if (!v || v === VERSION || v === updateSeen) return;
  updateSeen = v;
  hud.setUpdate(v);
  clearInterval(titleTimer);
  let on = false;
  titleTimer = setInterval(() => { on = !on; document.title = on ? `【更新あり v${v}】${BASE_TITLE}` : BASE_TITLE; }, 1000);   // タブの題名を点滅
  try {
    if ("Notification" in window && Notification.permission === "granted") {
      const n = new Notification("artifact学会。 3D が更新されました", { body: `新しいバージョン v${v} があります。タブにもどって、再読み込みしてください。`, tag: "craft-update" });
      n.onclick = () => { window.focus(); n.close(); };
    }
  } catch (e) { /* 通知が出せなくても、題名とお知らせは出る */ }
}
async function pollVersion() {
  try {
    const r = await fetch("/api/version", { cache: "no-store" });
    const j = await r.json();
    if (j && j.version) updateFound(String(j.version));
  } catch (e) { /* つながらないときは、次の回に */ }
}
setInterval(pollVersion, 20000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) pollVersion(); });

// ----- 通信(ほかのプレイヤー) -----
const remotes = new RemotePlayers(THREE, scene);
let netState = "idle";   // idle | connecting | open | closed | full
let everConnected = false;
let myName = "";
let forceSend = false;
let hpNow = 20, regenT = 0;   // 体力(3秒に1つ回復)
const hurtEl = document.getElementById("hurt");

function poseNow() {
  const p = controls.p;
  return { x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch, fly: p.fly, sneak: p.sneak, glide: p.glide };
}
function refreshOnline() {
  let head = "";
  if (netState === "open") head = `オンライン ${remotes.count() + 1}人`;
  else if (netState === "connecting") head = "接続中…";
  else if (netState === "full") head = "満員です(ひとりで遊べます)";
  else if (netState === "closed") head = everConnected ? "再接続中…" : "オフライン(ひとりで遊べます)";
  if (!head) { hud.setOnline([]); return; }
  hud.setOnline(netState === "open" ? [head, "*" + myName, ...remotes.names()] : [head]);
}

const net = new Net({
  token: getToken,
  pose: poseNow,
  onStatus: (s) => { netState = s; refreshOnline(); },
  onReset: () => remotes.clear(),
  onWelcome: (m) => {
    everConnected = true;
    netState = "open";
    myName = m.name || "";
    isAdmin = !!m.admin; controls.canFly = isAdmin; if (touch) touch.setAdmin(isAdmin);
    if (!isAdmin) { buildMode = false; hud.setBuildMode(false); }
    hud.setAdmin(isAdmin);
    for (const e of m.edits || []) world.set(e[0], e[1], e[2], e[3]);   // みんなが作った建築を反映
    unstick();
    remotes.clear();
    for (const p of m.players) remotes.add(p);
    if (m.version !== VERSION) updateFound(m.version);   // 古い画面のまま遊んでいる
    forceSend = true; welcomed = true;
    chatMore = !!m.chatMore;
    for (const r of m.chat || []) addChatRec(r, false);   // 過去のチャット(サーバーに全部残っている)
    if (!histEl.hidden) renderHist(true);
    hpNow = 20; hud.setHealth(20, false);
    refreshOnline();
  },
  onJoin: (p) => { remotes.add(p); refreshOnline(); },
  onLeave: (id) => { remotes.remove(id); refreshOnline(); },
  onPos: (m) => remotes.setPos(m),
  onArrow: (m) => arrows.shoot([m.x, m.y, m.z], [m.vx, m.vy, m.vz]),
  onFill: (m) => { for (let x = m.x1; x <= m.x2; x++) for (let y = m.y1; y <= m.y2; y++) for (let z = m.z1; z <= m.z2; z++) world.set(x, y, z, m.v ? BLOCK : 0); logSys((m.by ? m.by + " が " : "") + m.n + (m.v ? "ブロックをうめました" : "ブロックぶんを空気にしました")); },
  onClone: (m) => {   // 自分の世界の中身を、先に全部読んでから、貼りつける(重なっていてもよい)
    const sx = m.x2 - m.x1, sy = m.y2 - m.y1, sz = m.z2 - m.z1, snap = [];
    for (let x = 0; x <= sx; x++) for (let y = 0; y <= sy; y++) for (let z = 0; z <= sz; z++) snap.push(world.get(m.x1 + x, m.y1 + y, m.z1 + z));
    let i = 0;
    for (let x = 0; x <= sx; x++) for (let y = 0; y <= sy; y++) for (let z = 0; z <= sz; z++) world.set(m.dx + x, m.dy + y, m.dz + z, snap[i++]);
    logSys((m.by ? m.by + " が " : "") + m.n + "ブロックぶんをコピーしました");
  },
  onChat: (m) => logChat(m),
  onHistMore: (m) => {
    chatAsking = false; chatMore = !!m.more;
    for (const r of m.items || []) addChatRec(r, false);
    if (!histEl.hidden) renderHist("older");
  },
  onSwing: (m) => remotes.swing(m.id),
  onHit: (m) => remotes.flash(m.id),
  onHurt: (m) => {   // 自分がやられた: 体力・ノックバック
    hpNow = m.hp; regenT = 0;
    hurtEl.classList.add("on"); setTimeout(() => hurtEl.classList.remove("on"), 120);
    if (m.dead) { controls.respawn(); hud.setHealth(20, false); hud.say((m.by ? m.by + " に" : "") + "やられました。スタート地点にもどります"); }
    else { hud.setHealth(m.hp, true); controls.knock(m.kx, m.kz); }
  },
  onEdit: (m) => world.set(m.x, m.y, m.z, m.v),
  onDeny: (m) => hud.say(m.why || "できません"),
  onName: (m) => { remotes.setName(m.id, m.name); refreshOnline(); },
  onFull: () => { netState = "full"; refreshOnline(); },
  onAuth: () => {   // ログインが無効になった(期限切れなど)
    logout().then(() => { user = null; netStarted = false; remotes.clear(); setPanel("login"); hud.renderLogin("ログインの期限が切れました。もう一度ログインしてください。"); });
  },
  onKicked: () => { netState = "closed"; netStarted = false; remotes.clear(); refreshOnline(); hud.say("ほかの画面で入ったため、こちらは切断されました"); },
});

// ワールドの読み込み: サーバーから建築を受けとり、ブロックの見た目を作り終えるまで、世界に入れない
let worldReady = false, welcomed = false, loadStart = performance.now();   // 読み込みは、ページを開いた瞬間から始まる
function startLoading() {
  worldReady = false;
  hud.setLoading(true);
}
function checkLoaded() {
  if (worldReady || !user) return;
  const give = netState === "full" || performance.now() - loadStart > 12000;   // つながらないときは、ひとりで遊べるように
  if ((welcomed && !world.dirty.size) || give) {   // ブロックができあがってから、前回の続き(位置・持ち物など)を引きつぐ
    restoreState(user); unstick();
    worldReady = true; hud.setLoading(false);
  }
}
function ensureOnline() {
  if (!netStarted && user) { netStarted = true; net.start(); }
}

// 位置は、動いたときだけ、0.1秒に1回まで送る
let sentAt = 0;
const sent = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 };
function sendPose(t) {
  if (!net.ready()) return;
  if (!forceSend && t - sentAt < 100) return;
  const p = controls.p;
  const moved = Math.abs(p.x - sent.x) + Math.abs(p.y - sent.y) + Math.abs(p.z - sent.z) > 0.01 ||
    Math.abs(p.yaw - sent.yaw) + Math.abs(p.pitch - sent.pitch) > 0.01;
  if (!moved && !forceSend) return;
  forceSend = false;
  net.sendPos(poseNow());
  sentAt = t;
  sent.x = p.x; sent.y = p.y; sent.z = p.z; sent.yaw = p.yaw; sent.pitch = p.pitch;
}

function requestLock() {
  if (isTouch) { locked = true; controls.locked = true; hud.setResume(false); return; }
  try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (e) { /* 失敗したらクリックで再開 */ }
}
function exitLock() {
  if (isTouch) { if (locked) { locked = false; controls.locked = false; controls.release(); if (touch) touch.releaseAll(); } return; }
  if (document.pointerLockElement === canvas) document.exitPointerLock();
}
function setPanel(name) {
  if (!user && name !== "login") name = "login";   // ログインしていない人は、世界に入れない
  if (user && !worldReady && !name) { name = "menu"; hud.say("ワールドを読み込み中です。少し待ってください"); }   // ブロックを読み込むまでは、操作できない
  panel = name;
  hud.show(name);
  if (touch) touch.setMenu(name === "menu");
  if (name) { exitLock(); hud.setResume(false); } else { ensureOnline(); requestLock(); hud.setResume(!locked); }
}

// ----- ログ(左上。しばらくすると消える)とチャット・コマンド(/ か T で左下に入力欄) -----
const logEl = document.getElementById("chatlog"), histEl = document.getElementById("chathist");
// 履歴(入力欄の上)は、絶対に消さない: チャットはサーバーに全部残り、自分のコマンドと結果は、このブラウザに全部残る
const history = [];   // { kind: "chat" | "cmd" | "sys", name, text, at, seq? } 古いものが前、新しいものが後ろ
const chatSeen = new Set();   // 追加ずみのチャットの通し番号(つなぎ直しても、重ならないように)
let chatMore = false, chatOldest = 0, chatAsking = false;
const LKEY = () => "craft-hist:" + (user && (user.uid || user.username) || "x");
function saveLocalHist() {
  try { localStorage.setItem(LKEY(), JSON.stringify(history.filter((h) => h.kind !== "chat").map((h) => [h.kind, h.text, h.at]))); } catch (e) { /* 入りきらないときは、メモリには残る */ }
}
function loadLocalHist() {
  try {
    const arr = JSON.parse(localStorage.getItem(LKEY()) || "[]");
    for (const [kind, text, at] of arr) if (!history.some((h) => h.kind === kind && h.at === at && h.text === text)) history.push({ kind, name: "", text, at });
    history.sort((x, y) => x.at - y.at);
  } catch (e) { /* 読めなければ、なし */ }
}
function addHist(h) {
  history.push(h);
  if (h.kind !== "chat") saveLocalHist();
  if (!histEl.hidden) renderHist(true);
}
function logLine(cls, name, text, ms = 9000) {
  const el = document.createElement("div");
  el.className = "cl " + cls;
  if (name) { const n = document.createElement("b"); n.textContent = name; el.append(n, " "); }
  el.append(text);
  logEl.appendChild(el);
  while (logEl.children.length > 8) logEl.firstChild.remove();   // 画面の通知を減らすだけ(履歴は消えない)
  setTimeout(() => el.classList.add("out"), ms);
  setTimeout(() => el.remove(), ms + 700);
}
function renderHist(keepBottom) {
  const wasBottom = histEl.scrollHeight - histEl.scrollTop - histEl.clientHeight < 30, oldH = histEl.scrollHeight, oldTop = histEl.scrollTop;
  histEl.textContent = "";
  for (const h of history) {
    const d = document.createElement("div");
    d.className = "hl " + h.kind;
    if (h.name) { const n = document.createElement("b"); n.textContent = h.name; d.append(n, " "); }
    d.append(h.text);
    histEl.appendChild(d);
  }
  if (keepBottom === "older") histEl.scrollTop = oldTop + (histEl.scrollHeight - oldH);   // 古いものを足したときは、見ていた位置のまま
  else if (keepBottom !== true || wasBottom) histEl.scrollTop = histEl.scrollHeight;
  else histEl.scrollTop = oldTop;
}
function addChatRec(r, live) {
  if (chatSeen.has(r.seq)) return;
  chatSeen.add(r.seq);
  if (!chatOldest || r.seq < chatOldest) chatOldest = r.seq;
  const h = { kind: "chat", name: r.name || "?", text: r.text || "", at: r.at || Date.now(), seq: r.seq };
  if (live) { history.push(h); } else { history.push(h); history.sort((x, y) => x.at - y.at); }
}
function logSys(text) {                                                 // 実行の結果(返り値)・お知らせ
  addHist({ kind: "sys", name: "", text, at: Date.now() });
  logLine("sys", "", text);
}
function logChat(r) {                                                    // 誰かのチャット(全員に見える)
  addChatRec(r, true);
  if (!histEl.hidden) renderHist(true);
  logLine("chat", r.name || "?", r.text || "", 12000);
}
function logCmd(text) {                                                  // 自分が実行したコマンド
  addHist({ kind: "cmd", name: "", text, at: Date.now() });
  logLine("cmd", "", text);
}
// 履歴のいちばん上までスクロールしたら、もっと古いチャットをサーバーに頼む
histEl.addEventListener("scroll", () => {
  if (histEl.scrollTop < 4 && chatMore && !chatAsking && net.ready()) { chatAsking = true; net.sendHistMore(chatOldest); }
});

// コマンドは、入力欄にカーソルを置かず(=日本語入力が働かない)、キーを直接うけとって、自分で文字を組み立てる
let cmdBuf = "/", cmdPos = 1;
let cmdOpen = false, cmdMode = "cmd";   // "cmd": / から始まるコマンド(英語だけ)  "chat": チャット
const cmdBar = document.getElementById("cmdbar"), cmdIn = document.getElementById("cmd"), cmdShow = document.getElementById("cmdshow");
// コマンドの文字は、入力欄ではなく、この重ねた表示(cmdShow)で見せる
function updateShow() {
  if (cmdMode !== "cmd") return;
  const i = Math.min(cmdBuf.length, cmdPos);
  document.getElementById("cs-a").textContent = cmdBuf.slice(0, i);
  document.getElementById("cs-b").textContent = cmdBuf.slice(i);
}
function setMode(mode) {
  cmdMode = mode;
  // コマンドは、入力欄を使わない(日本語入力が働かず、英数入力になる)
  cmdIn.type = "text"; cmdIn.readOnly = mode === "cmd"; cmdIn.tabIndex = mode === "cmd" ? -1 : 0;
  cmdIn.classList.toggle("plain", mode === "cmd");
  cmdShow.hidden = mode !== "cmd";
  cmdIn.placeholder = mode === "chat" ? "チャット (Enterで送る / Escでやめる)" : "";
}
function openCmd(mode) {
  if (cmdOpen || panel || !user) return;
  cmdOpen = true; exitLock();
  setMode(mode);
  cmdBar.hidden = false; histEl.hidden = false; renderHist();
  cmdIn.value = "";
  if (mode === "cmd") { cmdBuf = "/"; cmdPos = 1; if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); updateShow(); }
  else cmdIn.focus();
}
function closeCmd() {
  if (!cmdOpen) return;
  cmdOpen = false; cmdBar.hidden = true; histEl.hidden = true; cmdIn.blur(); cmdIn.value = ""; cmdBuf = "/"; cmdPos = 1;
  if (!panel) requestLock();
}
// 数字、または ~(いまの位置)・~3(いまの位置から+3)
function coord(tok, base) {
  const m = /^~(-?\d+)?$/.exec(tok);
  if (m) return base + (m[1] ? parseInt(m[1], 10) : 0);
  return /^-?\d+$/.test(tok) ? parseInt(tok, 10) : NaN;
}
function runCommand(line) {
  const a = line.trim().replace(/^\//, "").split(/\s+/).filter(Boolean);
  if (!a.length) return;
  const cmd = a[0].toLowerCase();
  logCmd("/" + a.join(" "));
  if (cmd === "fill") {
    const usage = "Usage: /fill x1 y1 z1 x2 y2 z2 block|air   (~ = your position)";
    if (!isAdmin) { logSys("権限がありません(管理者だけが使えるコマンドです)"); return; }
    if (a.length !== 8) { logSys(usage); return; }
    const mat = a[7].toLowerCase();
    if (mat !== "block" && mat !== "air") { logSys("使えるのは block と air だけです。" + usage); return; }
    const p = controls.p, base = [Math.round(p.x), Math.floor(p.y + 0.5 + 1e-6), Math.round(p.z)];
    const c = [0, 1, 2, 3, 4, 5].map((i) => coord(a[i + 1], base[i % 3]));
    if (c.some((v) => !Number.isFinite(v))) { logSys("座標は整数か ~ で書いてください。" + usage); return; }
    if (!net.ready()) { logSys("オフラインのときは、使えません"); return; }
    net.sendFill(c, mat);
    return;
  }
  if (cmd === "clone") {
    const usage = "Usage: /clone x1 y1 z1 x2 y2 z2 x y z   (囲んだ構造を、最後の x y z を始点にコピー。~ = your position)";
    if (!isAdmin) { logSys("権限がありません(管理者だけが使えるコマンドです)"); return; }
    if (a.length !== 10) { logSys(usage); return; }
    const p = controls.p, base = [Math.round(p.x), Math.floor(p.y + 0.5 + 1e-6), Math.round(p.z)];
    const c = [0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => coord(a[i + 1], base[i % 3]));
    if (c.some((v) => !Number.isFinite(v))) { logSys("座標は整数か ~ で書いてください。" + usage); return; }
    if (!net.ready()) { logSys("オフラインのときは、使えません"); return; }
    net.sendClone(c);
    return;
  }
  if (cmd === "data") {
    const usage = "Usage: /data get pos";
    if (a.length === 3 && a[1].toLowerCase() === "get" && a[2].toLowerCase() === "pos") {
      const p = controls.p;   // いちばん近い整数(Yは、足があるブロックの高さ)
      logSys(`${Math.round(p.x)} ${Math.round(p.y + 0.5)} ${Math.round(p.z)}`);
    } else logSys(usage);
    return;
  }
  logSys("Unknown command: /" + cmd + "   (使えるコマンド: /fill, /clone, /data)");
}
function submitCmd() {
  const line = (cmdMode === "cmd" ? cmdBuf : cmdIn.value).trim(); closeCmd();
  if (!line) return;
  if (line.startsWith("/")) { runCommand(line); return; }
  if (!net.ready()) { logSys("オフラインのときは、チャットできません"); return; }
  net.sendChat(line);
}
cmdIn.addEventListener("keydown", (e) => {
  e.stopPropagation();
  if (e.code === "Escape") { e.preventDefault(); closeCmd(); return; }
  if (e.code === "Enter" || e.code === "NumpadEnter") {
    e.preventDefault();
    if (!e.isComposing && e.keyCode !== 229) submitCmd();   // 変換の確定のEnterでは、送らない
    return;
  }
  // チャットの欄が空のまま、消すキーを押したら、やめる
  if ((e.code === "Backspace" || e.code === "Delete") && cmdMode === "chat" && cmdIn.value === "") { e.preventDefault(); closeCmd(); }
});
cmdIn.addEventListener("keyup", (e) => e.stopPropagation());
// コマンドモードのキー入力(入力欄を使わない)
function cmdKey(e) {
  if (e.isComposing) return;
  const ins = (t) => { t = t.replace(/[^\x20-\x7e]/g, ""); if (!t) return; cmdBuf = (cmdBuf.slice(0, cmdPos) + t + cmdBuf.slice(cmdPos)).slice(0, 120); cmdPos = Math.min(cmdBuf.length, cmdPos + t.length); };
  if (e.ctrlKey || e.metaKey) { if (e.code === "KeyV") return; e.preventDefault(); return; }   // 貼りつけは paste で
  e.preventDefault();
  if (e.code === "Escape") { closeCmd(); return; }
  if (e.code === "Enter" || e.code === "NumpadEnter") { if (!e.repeat) submitCmd(); return; }
  if (e.code === "Backspace") {
    if (cmdPos <= 1) { closeCmd(); return; }   // / を消したら、コマンドモードをやめる(なかったことに)
    cmdBuf = cmdBuf.slice(0, cmdPos - 1) + cmdBuf.slice(cmdPos); cmdPos--;
  } else if (e.code === "Delete") cmdBuf = cmdBuf.slice(0, cmdPos) + cmdBuf.slice(cmdPos + 1);
  else if (e.code === "ArrowLeft") cmdPos = Math.max(1, cmdPos - 1);
  else if (e.code === "ArrowRight") cmdPos = Math.min(cmdBuf.length, cmdPos + 1);
  else if (e.code === "Home") cmdPos = 1;
  else if (e.code === "End") cmdPos = cmdBuf.length;
  else if (e.key && e.key.length === 1) ins(e.key);
  updateShow();
}
document.addEventListener("paste", (e) => {
  if (!cmdOpen || cmdMode !== "cmd") return;
  e.preventDefault();
  const t = (e.clipboardData && e.clipboardData.getData("text") || "").replace(/[\r\n]+/g, " ").replace(/[^\x20-\x7e]/g, "");
  cmdBuf = (cmdBuf.slice(0, cmdPos) + t + cmdBuf.slice(cmdPos)).slice(0, 120); cmdPos = Math.min(cmdBuf.length, cmdPos + t.length); updateShow();
});


let unlockedAt = 0;   // ロックが外れた時刻(そのEscでメニューをすぐ閉じてしまわないため)
document.addEventListener("pointerlockchange", () => {
  locked = document.pointerLockElement === canvas;
  controls.locked = locked;
  if (!locked) { controls.release(); unlockedAt = performance.now(); }
  if (locked && panel) { panel = null; hud.show(null); }
  if (!locked && !panel && !cmdOpen) setPanel("menu");
  hud.setResume(!locked && !panel);
});
document.addEventListener("pointerlockerror", () => { if (!panel) hud.setResume(true); });

canvas.addEventListener("click", () => { if (!panel && !locked) requestLock(); });
const wrapCell = (c) => [mod(c[0], N), YMIN + mod(c[1] - YMIN, YN), mod(c[2], N)];
// ----- 建築・破壊(クリック・長押し) -----
let lastAct = { key: "", at: 0 };
const sendEdit = (op, cu, i) => {   // cu: ループしていない通しの座標
  const c = wrapCell(cu), key = op + c.join(",") + ":" + i, now = performance.now();
  if (key === lastAct.key && now - lastAct.at < 250) return false;   // 同じ所へ、さっき送ったばかり
  lastAct = { key, at: now };
  net.sendEdit(op, c[0], c[1], c[2], i);
  return true;
};
// 手をふる(自分の手と、ほかの人の画面)
let swingSentAt = 0;
function swingHand() {
  controls.swing();
  const now = performance.now();
  if (net.ready() && now - swingSentAt > 150) { swingSentAt = now; net.sendSwing(); }
}
// なぐる(左クリック / タップ): 3ブロック先までの人にダメージ1。間に壁があると当たらない
let lastHit = 0;
function attack() {
  swingHand();
  const p = controls.p, L = controls.lookDir(), eye = [p.x, p.y + controls.eyeH(), p.z], now = performance.now();
  const h = remotes.pick(eye, L, 3.2);
  if (!h || now - lastHit < 380 || !net.ready()) return;
  if (world.raycast(eye, L, h.t, false)) return;
  lastHit = now;
  net.sendHit(h.id, "melee");
}
// 持っているアイテムを使う(右クリック / 長タップ)
function useItem() {
  const it = hud.selectedItem();
  if (it === "rocket") {
    if (controls.p.glide && controls.cfg.rks) controls.fireRocket();
    else hud.say("ロケット花火は、エリトラで滑空中に使えます");
  } else if (it === "book") setPanel("book");
}
// 建築モードのクリック(0=壊す 2=置く)。手もふる
function buildClick(button) { swingHand(); act(button); }
// 1回だけ(クリックしたとき、長押しの最初)。送れたら、何をしたか返す
function act(button) {
  if (!net.ready()) { hud.say("オフラインのときは、建築・破壊できません"); return null; }
  if (button === 0 && build.target) {   // 左クリック = 壊す
    const t = build.target, op = t.kind === "block" ? "b-" : "p-";
    return sendEdit(op, t.cell, t.plate) ? { kind: t.kind, op, cell: t.cell.slice(), i: t.plate } : null;
  }
  if (button === 2 && build.place) {   // 右クリック = 置く
    const pl = build.place, op = pl.kind === "block" ? "b+" : "p+", cell = [pl.x, pl.y, pl.z];
    return sendEdit(op, cell, pl.i) ? { kind: pl.kind, op, cell, i: pl.i } : null;
  }
  return null;
}
// ----- 弓: 右クリックを押しつづけてため、はなすと矢がとぶ -----
let charge = null;   // { t0 }
const chargeFrac = () => (charge ? Math.min(1, (performance.now() - charge.t0) / 1000) : 0);   // 1秒でいっぱい
const chargeEl = document.getElementById("charge");
function cancelCharge() { charge = null; chargeEl.hidden = true; }
function releaseBow() {
  if (!charge) return;
  const f = chargeFrac(); cancelCharge();
  const power = Math.min(1, (f * f + f * 2) / 3);   // マイクラと同じ式
  if (power < 0.1) return;
  const p = controls.p, L = controls.lookDir(), eye = [p.x, p.y + controls.eyeH(), p.z];
  const pos = [eye[0] + L[0] * 0.5, eye[1] + L[1] * 0.5 - 0.1, eye[2] + L[2] * 0.5], vel = [L[0] * power * 3, L[1] * power * 3, L[2] * power * 3];
  arrows.shoot(pos, vel, true);
  if (net.ready()) net.sendShoot(pos, vel);
}
window.addEventListener("mouseup", (e) => { if (!isTouch && e.button === 2) releaseBow(); });
window.addEventListener("blur", cancelCharge);
function startCharge() { charge = { t0: performance.now() }; chargeEl.hidden = false; }
window.addEventListener("mousedown", (e) => {
  if (isTouch || !locked || panel) return;
  const it = hud.selectedItem(), glide = controls.p.glide;
  if (e.button === 2) {   // 右クリック: 使う / ためる / 置く
    if (it === "rocket") { useItem(); return; }
    if (glide) return;
    if (it === "bow") { startCharge(); return; }
    if (buildMode && isAdmin) { buildClick(2); return; }
    if (it === "book") useItem();
  } else if (e.button === 0 && !glide) {   // 左クリック: 壊す(建築モード) / なぐる
    if (buildMode && isAdmin) buildClick(0); else attack();
  }
});
window.addEventListener("contextmenu", (e) => e.preventDefault());
window.addEventListener("wheel", (e) => {
  if (!locked || panel) return;
  e.preventDefault();
  controls.wheel(e);
}, { passive: false });

window.addEventListener("keydown", (e) => {
  if (cmdOpen && cmdMode === "cmd") { cmdKey(e); return; }
  if (e.repeat) return;
  if (e.code === "Escape") {
    if (panel && panel !== "login" && performance.now() - unlockedAt > 400) setPanel(null);
    return;
  }
  if (e.target && e.target.tagName === "INPUT") return;   // 文字を入力している間は、操作キーを使わない
  if ((e.code === "Slash" && !e.shiftKey || e.key === "/") && !panel && locked) { e.preventDefault(); openCmd("cmd"); return; }
  if (e.code === "KeyT" && !e.ctrlKey && !e.metaKey && !e.altKey && !panel && locked) { e.preventDefault(); openCmd("chat"); return; }
  if (e.code === "KeyE") {
    if (panel === "inventory") setPanel(null);
    else if (!panel && locked) setPanel("inventory");
    return;
  }
  if (e.code === "F4") {
    e.preventDefault();
    if (!isAdmin) { hud.say("権限がありません(建築・破壊は管理者だけです)"); return; }
    buildMode = !buildMode; hud.setBuildMode(buildMode); if (touch) touch.setBuild(buildMode);
    uiPrefs.f4 = buildMode; saveUi();
    hud.say(buildMode ? "建築破壊モード: 左クリック=壊す / 右クリック=置く" : "通常モード");
    return;
  }
  if (e.code === "KeyC" && !panel && locked && buildMode) { hud.say("プレートの置き方: " + build.cycleMode()); return; }
  if (e.code === "KeyR" && !panel && locked) { controls.respawn(); hud.say("スタート地点にもどりました"); return; }
  if (e.code === "F2") { e.preventDefault(); chunkGrid.visible = !chunkGrid.visible; uiPrefs.f2 = chunkGrid.visible; saveUi(); hud.say(chunkGrid.visible ? "16×16の区切りを表示(F2で消す)" : "区切りを消しました"); return; }
  if (e.code === "F3") { e.preventDefault(); uiPrefs.f3 = hud.toggleDebug(); saveUi(); return; }
  if (panel && panel !== "inventory") return;
  const m = /^Digit([1-9])$/.exec(e.code);
  if (m) hud.select(+m[1] - 1);
});

// ----- スマホの操作 -----
let touch = null;
function tryFullscreen() {
  try {
    const el = document.documentElement, f = el.requestFullscreen || el.webkitRequestFullscreen;
    if (f && !document.fullscreenElement) { const r = f.call(el); if (r && r.catch) r.catch(() => {}); }
    if (screen.orientation && screen.orientation.lock) screen.orientation.lock("landscape").catch(() => {});
  } catch (e) { /* 使えない端末ではそのまま */ }
}
if (isTouch) {
  touch = createTouch({
    controls,
    say: (t) => hud.say(t),
    blocked: () => !!panel || !locked,
    isBow: () => hud.selectedItem() === "bow",
    bowDown: () => startCharge(),
    bowUp: (cancel) => { if (cancel) cancelCharge(); else releaseBow(); },
    tap: () => { if (buildMode && isAdmin) buildClick(2); else attack(); },
    longPress: () => { if (buildMode && isAdmin) buildClick(0); else useItem(); },
    menu: () => { if (panel === "menu") setPanel(null); else if (!panel) setPanel("menu"); else setPanel(null); },
    key: (code) => {   // 画面上のキーのボタン: 本物のキーを押したのと同じにする
      for (const t of ["keydown", "keyup"]) window.dispatchEvent(new KeyboardEvent(t, { code, key: code }));
    },
    editStart: () => { setPanel(null); },
    editEnd: () => { hud.say("ボタン配置を保存しました"); },
  });
  touch.setAdmin(isAdmin);
}

chunkGrid.visible = !!uiPrefs.f2; hud.setDebugShown(!!uiPrefs.f3);

// ログインの確認を待たずに、ワールド(ブロック)の読み込みを始める(ログインが無効なら、サーバーが知らせてくれる)
if (getToken()) { netStarted = true; net.start(); }

// ----- はじめ: 保存してあるログインを確かめる -----
if (getToken()) hud.showChecking(); else setPanel("login");   // 保存ずみログインがあるあいだは、入力欄を出さずに確かめる
restore().then((u) => {
  if (u) signedIn(u);
  else if (u === null && getToken() === "") setPanel("login");
  else if (u === undefined) hud.renderLogin("artifact学会につながりません。しばらくしてからもう一度試してください。");
});

// ----- メインループ -----
let last = performance.now(), dbgT = 0, uiT = 0, fps = 0;
const map3d = createMinimap(THREE, document.getElementById("minimap"));
function frame(t) {
  const dt = Math.min(0.05, (t - last) / 1000);
  last = t;
  checkLoaded();
  if (!user || worldReady) controls.update(dt);   // 読み込みのあいだは、体も動かさない
  controls.camera(camera, dt);
  skyDome.position.copy(camera.position);
  sunSprite.position.set(camera.position.x + SUN[0] * 270, camera.position.y + SUN[1] * 270, camera.position.z + SUN[2] * 270);
  const p = controls.p;
  if (uiPrefs.view !== p.view) { uiPrefs.view = p.view; saveUi(); }
  me3d.root.visible = p.view !== 0;
  if (p.view !== 0) {
    me3d.pose({ hs: controls.hs || 0, bodyYaw: p.bodyYaw, yaw: p.yaw, pitch: p.pitch, glide: p.glide, fly: p.fly, sneak: p.sneak, sprint: p.sprint, air: !p.ground, rocket: p.boost > 0, swing: controls.swingP }, dt);
    me3d.root.position.set(p.x, controls.visY(), p.z);
  }
  if (charge && (panel || !locked || controls.p.glide || hud.selectedItem() !== "bow")) cancelCharge();
  const cf = chargeFrac();
  if (charge) { chargeEl.firstChild.style.width = (cf * 100) + "%"; chargeEl.classList.toggle("full", cf >= 1); }
  firstPerson(dt, { held: hud.selectedItem() === "bow" && !panel, charge: cf, item: panel ? null : hud.selectedItem() });
  if (hpNow < 20 && net.ready()) { regenT += dt; if (regenT >= 3) { regenT = 0; hpNow++; hud.setHealth(hpNow, false); } }
  arrows.setViewer(controls.p); arrows.update(dt);
  remotes.update(dt);
  if (world.dirty.size) rebuildDirty(8);
  remotes.setViewer({ x: p.x, y: p.y, z: p.z });
  const dirv = controls.lookDir(), eye = [p.x, p.y + controls.eyeH(), p.z];
  if (panel) { build.outline.visible = build.ghost.visible = build.ghostLine.visible = false; build.target = build.place = null; }
  else build.update(eye, dirv, buildMode && isAdmin, hud.selectedItem(), [p.x - 0.3, p.y, p.z - 0.3, p.x + 0.3, p.y + controls.curH(), p.z + 0.3]);
  const kmh = Math.hypot(p.vx, p.vy, p.vz) * 3;
  renderer.render(scene, camera);
  if (!panel) { renderSelf(p, dt); map3d.render(p, camera.fov, renderer); }
  sendPose(t);

  fps = fps * 0.9 + (dt > 0 ? 1 / dt : 0) * 0.1;
  uiT += dt;
  if (uiT > 0.1) {
    uiT = 0;
  }
  dbgT += dt;
  if (dbgT > 0.25) {
    dbgT = 0;
    const yawDeg = ((((-p.yaw * 180) / Math.PI) % 360) + 360) % 360;   // 北(-z)が0度、東(+x)が90度
    const face = ["北 (-z)", "東 (+x)", "南 (+z)", "西 (-x)"][Math.round(yawDeg / 90) % 4];
    const tg = build.target;
    const look = tg ? (tg.kind === "block" ? `ブロック ${wrapCell(tg.cell).join(" ")}` : `プレート ${PLATE_NAMES[tg.plate]} @ ${wrapCell(tg.cell).join(" ")}`) : "なし";
    hud.setDebug([
      `artifact学会。 3D v${VERSION}   ${fps.toFixed(0)} fps`,
      `XYZ: ${p.x.toFixed(3)} / ${(p.y + 0.5).toFixed(3)} / ${p.z.toFixed(3)}   (Yは足があるブロックの高さ。ブロックの上では整数)`,
      `ブロック: ${mod(Math.round(p.x), N)} ${Math.floor(p.y + 0.5 + 1e-6)} ${mod(Math.round(p.z), N)}   (世界 ${N}x${YN}x${N}、ループ)`,
      `向き: ${face}  (yaw ${yawDeg.toFixed(1)} / pitch ${((-p.pitch * 180) / Math.PI).toFixed(1)})`,
      `見ている先: ${look}`,
      `権限: ${isAdmin ? "管理者" : "泳者"}   モード: ${buildMode ? "建築破壊" : "通常"}${buildMode ? `   プレート: ${["自動", "面だけ", "斜めだけ"][build.plateMode]}` : ""}`,
      `速さ: ${kmh.toFixed(0)}  ${p.fly ? "飛行中 " : ""}${p.glide ? "滑空中 " : ""}${p.sprint ? "ダッシュ " : ""}${p.sneak ? "しゃがみ" : ""}`,
      `通信: ${netState}`,
    ].join("\n"));
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// 動作確認用(ブラウザの開発者ツールからのぞける)
window.__craft = { arrows, test: { set locked(v) { locked = v; }, set buildMode(v) { buildMode = v; }, act, attack, useItem }, remotes, controls, scene, camera, hud, world, build, net, get buildMode() { return buildMode; } };
window.__info = () => JSON.stringify({ calls: renderer.info.render.calls, tris: renderer.info.render.triangles, geos: renderer.info.memory.geometries, tex: renderer.info.memory.textures });
