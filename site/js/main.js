// 全体をつなぐ場所。3D表示の準備、ログイン、ループ、マウスのロック、パネルの開閉、通信。
import { Controls } from "./controls.js";
import { createHud } from "./hud.js";
import { Net } from "./net.js";
import { RemotePlayers, createAvatar } from "./players.js";
import { buildSwift } from "./swift.js";
import { createFirstPerson } from "./fp.js";
import { startData } from "./data.js";
import { restore, login, logout, getToken } from "./auth.js";
import { VERSION } from "./version.js";

const THREE = window.THREE;
const canvas = document.getElementById("view");
if (!THREE) {
  document.getElementById("fatal").hidden = false;
  throw new Error("three.js が読み込めませんでした");
}

// ----- 設定(ブラウザに保存される) -----
const SKEY = "craft-settings";
const settings = { fov: 70, sens: 5 };
try { Object.assign(settings, JSON.parse(localStorage.getItem(SKEY) || "{}")); } catch (e) { /* 読めなければ初期値 */ }

// ----- 3D表示: 白い床・青い空・平ら -----
const SKY = 0x5ab4ee;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
const scene = new THREE.Scene();
scene.background = new THREE.Color(SKY);
scene.fog = new THREE.Fog(SKY, 500, 2600);
const camera = new THREE.PerspectiveCamera(settings.fov, 1, 0.05, 4000);
camera.rotation.order = "YXZ";

scene.add(new THREE.HemisphereLight(0xffffff, 0xaab6c4, 0.8));
const sun = new THREE.DirectionalLight(0xffffff, 0.4);
sun.position.set(300, 600, 200);
scene.add(sun);

// 床: ほぼ真っ白。かすかな目地だけ入れて、動いているのがわかるようにする
const gridCv = document.createElement("canvas");
gridCv.width = gridCv.height = 64;
{
  const g = gridCv.getContext("2d");
  g.fillStyle = "#ffffff"; g.fillRect(0, 0, 64, 64);
  g.fillStyle = "#e6ebf1"; g.fillRect(0, 0, 64, 2); g.fillRect(0, 0, 2, 64);
}
const gridTex = new THREE.CanvasTexture(gridCv);
gridTex.wrapS = gridTex.wrapT = THREE.RepeatWrapping;
gridTex.anisotropy = 8;
const GSIZE = 6000, GCELL = 60;
gridTex.repeat.set(GSIZE / GCELL, GSIZE / GCELL);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(GSIZE, GSIZE), new THREE.MeshLambertMaterial({ map: gridTex }));
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

const swift = buildSwift(THREE, scene);
const gauges = swift.gauges;
const data = startData(gauges);

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
const controls = new Controls({ colliders: swift.colliders, spawn: swift.spawn, win: window, doc: document, say: (t) => hud && hud.say(t) });
const firstPerson = createFirstPerson(THREE, camera, scene, controls);
const me3d = createAvatar(THREE, "#c0392b");
scene.add(me3d.root);
function applySettings() {
  controls.sens = settings.sens / 5;
  controls.baseFov = settings.fov;
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
  onEnter: () => { if (user) setPanel(null); },
  onClose: () => setPanel(null),
  onRespawn: () => controls.respawn(),
  onLogin: async (u, p) => {
    const r = await login(u, p);
    if (r.error) return r;
    signedIn(r.user);
    return {};
  },
  onLogout: async () => {
    await logout();
    net.stop(); netStarted = false; remotes.clear(); data.stop();
    user = null; netState = "idle"; refreshOnline();
    setPanel("login");
  },
});

function signedIn(u) {
  user = u;
  hud.setUser(u);
  data.start();
  setPanel("menu");
}

// ----- 通信(ほかのプレイヤー) -----
const remotes = new RemotePlayers(THREE, scene);
let netState = "idle";   // idle | connecting | open | closed | full
let everConnected = false;
let myName = "";
let forceSend = false;

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
    remotes.clear();
    for (const p of m.players) remotes.add(p);
    if (m.version !== VERSION) hud.setUpdate(m.version);   // 古い画面のまま遊んでいる
    forceSend = true;
    refreshOnline();
  },
  onJoin: (p) => { remotes.add(p); refreshOnline(); },
  onLeave: (id) => { remotes.remove(id); refreshOnline(); },
  onPos: (m) => remotes.setPos(m),
  onName: (m) => { remotes.setName(m.id, m.name); refreshOnline(); },
  onFull: () => { netState = "full"; refreshOnline(); },
  onAuth: () => {   // ログインが無効になった(期限切れなど)
    logout().then(() => { user = null; netStarted = false; remotes.clear(); data.stop(); setPanel("login"); hud.renderLogin("ログインの期限が切れました。もう一度ログインしてください。"); });
  },
  onKicked: () => { netState = "closed"; netStarted = false; remotes.clear(); refreshOnline(); hud.say("ほかの画面で入ったため、こちらは切断されました"); },
});

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
  try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (e) { /* 失敗したらクリックで再開 */ }
}
function exitLock() { if (document.pointerLockElement === canvas) document.exitPointerLock(); }
function setPanel(name) {
  if (!user && name !== "login") name = "login";   // ログインしていない人は、世界に入れない
  panel = name;
  hud.show(name);
  if (name) { exitLock(); hud.setResume(false); } else { ensureOnline(); requestLock(); hud.setResume(!locked); }
}

let unlockedAt = 0;   // ロックが外れた時刻(そのEscでメニューをすぐ閉じてしまわないため)
document.addEventListener("pointerlockchange", () => {
  locked = document.pointerLockElement === canvas;
  controls.locked = locked;
  if (!locked) { controls.release(); unlockedAt = performance.now(); }
  if (locked && panel) { panel = null; hud.show(null); }
  if (!locked && !panel) setPanel("menu");
  hud.setResume(!locked && !panel);
});
document.addEventListener("pointerlockerror", () => { if (!panel) hud.setResume(true); });

canvas.addEventListener("click", () => { if (!panel && !locked) requestLock(); });
window.addEventListener("mousedown", (e) => {
  if (!locked || panel || controls.p.glide) return;
  if ((e.button === 0 || e.button === 2) && hud.selectedItem() === "book") setPanel("book");
});
window.addEventListener("contextmenu", (e) => e.preventDefault());
window.addEventListener("wheel", (e) => {
  if (!locked || panel) return;
  e.preventDefault();
  controls.wheel(e);
}, { passive: false });

window.addEventListener("keydown", (e) => {
  if (e.repeat) return;
  if (e.code === "Escape") {
    if (panel && panel !== "login" && performance.now() - unlockedAt > 400) setPanel(null);
    return;
  }
  if (e.target && e.target.tagName === "INPUT") return;   // 文字を入力している間は、操作キーを使わない
  if (e.code === "KeyE") {
    if (panel === "inventory") setPanel(null);
    else if (!panel && locked) setPanel("inventory");
    return;
  }
  if (e.code === "KeyR" && !panel && locked) { controls.respawn(); hud.say("ダッシュボードの中央にもどりました"); return; }
  if (e.code === "F3") { e.preventDefault(); hud.toggleDebug(); return; }
  if (panel && panel !== "inventory") return;
  const m = /^Digit([1-9])$/.exec(e.code);
  if (m) hud.select(+m[1] - 1);
});

// ----- はじめ: 保存してあるログインを確かめる -----
setPanel("login");
restore().then((u) => {
  if (u) signedIn(u);
  else if (u === undefined) hud.renderLogin("artifact学会につながりません。しばらくしてからもう一度試してください。");
});

// ----- メインループ -----
let last = performance.now(), dbgT = 0, fps = 0;
function frame(t) {
  const dt = Math.min(0.05, (t - last) / 1000);
  last = t;
  controls.update(dt);
  controls.camera(camera, dt);
  const p = controls.p;
  me3d.root.visible = p.view !== 0;
  if (p.view !== 0) {
    me3d.pose({ hs: controls.hs || 0, bodyYaw: p.bodyYaw, yaw: p.yaw, pitch: p.pitch, glide: p.glide, fly: p.fly, sneak: p.sneak, sprint: p.sprint, air: !p.ground, rocket: p.boost > 0 }, dt);
    me3d.root.position.set(p.x, p.y, p.z);
  }
  firstPerson(dt);
  remotes.update(dt);
  floor.position.set(Math.round(camera.position.x / GCELL) * GCELL, 0, Math.round(camera.position.z / GCELL) * GCELL);
  const kmh = Math.hypot(p.vx, p.vy, p.vz) * 3;
  gauges.tick(dt, kmh);
  renderer.render(scene, camera);
  sendPose(t);

  fps = fps * 0.9 + (dt > 0 ? 1 / dt : 0) * 0.1;
  dbgT += dt;
  if (dbgT > 0.25) {
    dbgT = 0;
    hud.setDebug(`v${VERSION}\nXYZ ${p.x.toFixed(1)} ${p.y.toFixed(1)} ${p.z.toFixed(1)}\nFPS ${fps.toFixed(0)}  ${kmh.toFixed(0)}km/h${p.fly ? "\n飛行中" : ""}${p.glide ? "\n滑空中" : ""}\n通信 ${netState}`);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// 動作確認用(ブラウザの開発者ツールからのぞける)
window.__craft = { controls, swift, scene, camera, hud, gauges };
