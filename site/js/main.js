// 全体をつなぐ場所。3D表示の準備、ループ、マウスのロック、パネルの開閉、通信。
import { World, SX, SZ, CHUNK, buildChunkData } from "./world.js";
import { Controls } from "./controls.js";
import { createHud } from "./hud.js";
import { Net } from "./net.js";
import { RemotePlayers } from "./players.js";
import { VERSION } from "./version.js";

const THREE = window.THREE;
const canvas = document.getElementById("view");
if (!THREE) {
  document.getElementById("fatal").hidden = false;
  throw new Error("three.js が読み込めませんでした");
}

// ----- 設定(ブラウザに保存される) -----
const SKEY = "craft-settings";
const settings = { fov: 70, sens: 5, name: "" };
try { Object.assign(settings, JSON.parse(localStorage.getItem(SKEY) || "{}")); } catch (e) { /* 読めなければ初期値 */ }

// ----- 3D表示 -----
const SKY = 0x87ceeb;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
const scene = new THREE.Scene();
scene.background = new THREE.Color(SKY);
scene.fog = new THREE.Fog(SKY, 50, 120);
const camera = new THREE.PerspectiveCamera(settings.fov, 1, 0.05, 300);
camera.rotation.order = "YXZ";

const world = new World();
const material = new THREE.MeshBasicMaterial({ vertexColors: true });
for (let cz = 0; cz < SZ / CHUNK; cz++) {
  for (let cx = 0; cx < SX / CHUNK; cx++) {
    const d = buildChunkData(world, cx, cz);
    if (!d.indices.length) continue;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(d.positions, 3));
    g.setAttribute("color", new THREE.BufferAttribute(d.colors, 3));
    g.setIndex(new THREE.BufferAttribute(d.indices, 1));
    scene.add(new THREE.Mesh(g, material));
  }
}

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize);
resize();

// ----- 操作 -----
// スタート地点の平らな場所の中で、少しずらす(みんなが同じ場所に重ならないように)
const spawn = world.spawnPoint();
spawn.x += (Math.random() - 0.5) * 6;
spawn.z += (Math.random() - 0.5) * 6;
const controls = new Controls(world, spawn, window, document);
function applySettings() {
  controls.sens = 0.0022 * (settings.sens / 5);
  camera.fov = settings.fov;
  camera.updateProjectionMatrix();
}
applySettings();

// ----- パネル(メニュー/持ち物/本)とマウスのロック -----
let panel = "menu";   // null のときは、世界を操作している
let locked = false;
const hud = createHud({
  settings,
  onSettings: () => { applySettings(); try { localStorage.setItem(SKEY, JSON.stringify(settings)); } catch (e) { /* 保存できなくても動く */ } },
  onEnter: () => setPanel(null),
  onClose: () => setPanel(null),
});

// ----- 通信(ほかのプレイヤー) -----
const remotes = new RemotePlayers(THREE, scene);
let netState = "idle";   // idle | connecting | open | closed | full
let everConnected = false;
let myName = "";
let netStarted = false;
let forceSend = false;

function cleanName(s) {
  return String(s || "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 12) || "ななし";
}
function poseNow() {
  const p = controls.p;
  return { x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch, fly: p.fly, sneak: p.sneak };
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
  pose: poseNow,
  onStatus: (s) => { netState = s; refreshOnline(); },
  onReset: () => remotes.clear(),
  onWelcome: (m) => {
    everConnected = true;
    netState = "open";
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
});

// 世界に入ったときに、つなぐ(初回)/ニックネームが変わっていたら伝える
function ensureOnline() {
  const name = cleanName(settings.name);
  if (!netStarted) {
    netStarted = true;
    myName = name;
    net.start(name);
  } else if (name !== myName) {
    myName = name;
    net.setName(name);
    refreshOnline();
  }
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
  panel = name;
  hud.show(name);
  if (name) { exitLock(); hud.setResume(false); } else { ensureOnline(); requestLock(); hud.setResume(!locked); }
}
setPanel("menu");

let unlockedAt = 0;   // ロックが外れた時刻(そのEscでメニューをすぐ閉じてしまわないため)
document.addEventListener("pointerlockchange", () => {
  locked = document.pointerLockElement === canvas;
  controls.locked = locked;
  if (!locked) { controls.release(); unlockedAt = performance.now(); }
  if (locked && panel) { panel = null; hud.show(null); }       // 世界に入った
  if (!locked && !panel) setPanel("menu");                       // Escでロックが外れた → メニュー
  hud.setResume(!locked && !panel);
});
document.addEventListener("pointerlockerror", () => { if (!panel) hud.setResume(true); });

canvas.addEventListener("click", () => { if (!panel && !locked) requestLock(); });
window.addEventListener("mousedown", (e) => {
  if (!locked || panel) return;
  if (e.button === 0 || e.button === 2) {
    if (hud.selectedItem() === "book") setPanel("book");   // 本を使うと開く(弓や攻撃は次の更新)
  }
});
window.addEventListener("contextmenu", (e) => e.preventDefault());
window.addEventListener("wheel", (e) => {
  if (!locked || panel) return;
  hud.select(hud.selected() + (e.deltaY > 0 ? 1 : -1));
}, { passive: true });

window.addEventListener("keydown", (e) => {
  if (e.repeat) return;
  if (e.code === "Escape") {
    if (panel && performance.now() - unlockedAt > 400) setPanel(null);   // 開いているパネルを閉じて、世界にもどる
    return;
  }
  if (e.target && e.target.tagName === "INPUT") return;   // 文字を入力している間は、操作キーを使わない
  if (e.code === "KeyE") {
    if (panel === "inventory") setPanel(null);
    else if (!panel && locked) setPanel("inventory");
    return;
  }
  if (e.code === "F3") { e.preventDefault(); hud.toggleDebug(); return; }
  if (panel && panel !== "inventory") return;
  const m = /^Digit([1-9])$/.exec(e.code);
  if (m) hud.select(+m[1] - 1);
});

// ----- メインループ -----
let last = performance.now(), dbgT = 0, fps = 0;
function frame(t) {
  const dt = Math.min(0.05, (t - last) / 1000);
  last = t;
  controls.update(dt);
  remotes.update(dt);
  const p = controls.p;
  camera.position.set(p.x, p.y + controls.eye, p.z);
  camera.rotation.set(p.pitch, p.yaw, 0);
  renderer.render(scene, camera);
  sendPose(t);

  fps = fps * 0.9 + (dt > 0 ? 1 / dt : 0) * 0.1;
  dbgT += dt;
  if (dbgT > 0.25) {
    dbgT = 0;
    hud.setDebug(`v${VERSION}\nXYZ ${p.x.toFixed(1)} ${p.y.toFixed(1)} ${p.z.toFixed(1)}\nFPS ${fps.toFixed(0)}${p.fly ? "\n飛行中" : ""}\n通信 ${netState}`);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
