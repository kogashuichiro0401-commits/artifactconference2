// 全体をつなぐ場所。3D表示の準備、ログイン、ループ、マウスのロック、パネルの開閉、通信。
import { Controls } from "./controls.js";
import { createHud } from "./hud.js";
import { Net } from "./net.js";
import { RemotePlayers, createAvatar } from "./players.js";
import { createFirstPerson } from "./fp.js";
import { restore, login, logout, getToken } from "./auth.js";
import { VERSION } from "./version.js";
import { World, buildChunk, CH } from "./world.js";
import { BuildTool } from "./build.js";
import { N, YMIN, YN, BLOCK, mod } from "./shared.js";
import { PLATE_NAMES } from "./plates.js";

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
renderer.shadowMap.enabled = !window.__NOSHADOW;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
const scene = new THREE.Scene();
scene.background = new THREE.Color(SKY);
scene.fog = new THREE.Fog(SKY, 70, 190);
// 世界(64x64x64)のはしを、青い枠で示す
{
  const g = new THREE.EdgesGeometry(new THREE.BoxGeometry(N, YN, N));
  const fr = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x1f6bff, fog: false }));
  fr.position.set(N / 2 - 0.5, YMIN + YN / 2 - 0.5, N / 2 - 0.5);
  scene.add(fr);
}
const camera = new THREE.PerspectiveCamera(settings.fov, 1, 0.05, 400);
camera.rotation.order = "YXZ";

scene.add(new THREE.HemisphereLight(0xdfeeff, 0x9aa3ae, 0.62));
const sun = new THREE.DirectionalLight(0xfff6e8, 0.95);
sun.position.set(200, 330, 140);
sun.target.position.set(0, 10, 0);
sun.castShadow = false;
sun.shadow.mapSize.set(window.__LO ? 1024 : 2048, window.__LO ? 1024 : 2048);
Object.assign(sun.shadow.camera, { left: -110, right: 110, top: 110, bottom: -110, near: 10, far: 900 });
sun.shadow.bias = -0.0006;
sun.shadow.normalBias = 0.05;
scene.add(sun, sun.target);

// ----- 世界: ブロックとプレート。横・縦ともにループするので、まわりに27個のコピーを並べて、切れ目なく見せる -----
const world = new World();
world.spawn = { x: N / 2, y: 0.5, z: N / 2, yaw: 0, pitch: 0 };
const worldMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
const NC = N / CH;
const offsets = [];
for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) offsets.push([dx * N, dy * YN, dz * N]);
const chunkMeshes = [];
for (let i = 0; i < NC * NC; i++) {
  chunkMeshes.push(offsets.map((o) => { const m = new THREE.Mesh(new THREE.BufferGeometry(), worldMat); m.position.set(o[0], o[1], o[2]); m.visible = false; scene.add(m); return m; }));
  world.dirty.add(i);
}
function rebuildDirty() {
  for (const ci of world.dirty) {
    const d = buildChunk(world, Math.floor(ci / NC), ci % NC);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(d.pos, 3));
    g.setAttribute("color", new THREE.BufferAttribute(d.col, 3));
    g.setIndex(new THREE.BufferAttribute(d.idx, 1));
    g.computeBoundingSphere();
    for (const m of chunkMeshes[ci]) { m.geometry.dispose(); m.geometry = g; m.visible = d.idx.length > 0; }
  }
  world.dirty.clear();
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
const build = new BuildTool(THREE, scene, world);
let isAdmin = false, buildMode = false;
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
    net.stop(); netStarted = false; remotes.clear();
    user = null; isAdmin = false; controls.canFly = false; buildMode = false; hud.setAdmin(false); hud.setBuildMode(false);
    netState = "idle"; refreshOnline();
    setPanel("login");
  },
});

function signedIn(u) {
  user = u;
  isAdmin = u.role === "admin"; buildMode = false; controls.canFly = isAdmin;
  hud.setUser(u); hud.setAdmin(isAdmin); hud.setBuildMode(false);
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
    isAdmin = !!m.admin; controls.canFly = isAdmin;
    if (!isAdmin) { buildMode = false; hud.setBuildMode(false); }
    hud.setAdmin(isAdmin);
    for (const e of m.edits || []) world.set(e[0], e[1], e[2], e[3]);   // みんなが作った建築を反映
    remotes.clear();
    for (const p of m.players) remotes.add(p);
    if (m.version !== VERSION) hud.setUpdate(m.version);   // 古い画面のまま遊んでいる
    forceSend = true;
    refreshOnline();
  },
  onJoin: (p) => { remotes.add(p); refreshOnline(); },
  onLeave: (id) => { remotes.remove(id); refreshOnline(); },
  onPos: (m) => remotes.setPos(m),
  onEdit: (m) => world.set(m.x, m.y, m.z, m.v),
  onDeny: (m) => hud.say(m.why || "できません"),
  onName: (m) => { remotes.setName(m.id, m.name); refreshOnline(); },
  onFull: () => { netState = "full"; refreshOnline(); },
  onAuth: () => {   // ログインが無効になった(期限切れなど)
    logout().then(() => { user = null; netStarted = false; remotes.clear(); setPanel("login"); hud.renderLogin("ログインの期限が切れました。もう一度ログインしてください。"); });
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
const wrapCell = (c) => [mod(c[0], N), YMIN + mod(c[1] - YMIN, YN), mod(c[2], N)];
window.addEventListener("mousedown", (e) => {
  if (!locked || panel || controls.p.glide) return;
  if (buildMode && isAdmin) {
    if (!net.ready()) { hud.say("オフラインのときは、建築・破壊できません"); return; }
    if (e.button === 0 && build.target) {   // 左クリック = 壊す
      const t = build.target, c = wrapCell(t.cell);
      net.sendEdit(t.kind === "block" ? "b-" : "p-", c[0], c[1], c[2], t.plate);
    } else if (e.button === 2 && build.place) {   // 右クリック = 置く
      const pl = build.place, c = wrapCell([pl.x, pl.y, pl.z]);
      net.sendEdit(pl.kind === "block" ? "b+" : "p+", c[0], c[1], c[2], pl.i);
    }
    return;
  }
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
  if (e.code === "F4") {
    e.preventDefault();
    if (!isAdmin) { hud.say("権限がありません(建築・破壊は管理者だけです)"); return; }
    buildMode = !buildMode; hud.setBuildMode(buildMode);
    hud.say(buildMode ? "建築破壊モード: 左クリック=壊す / 右クリック=置く" : "通常モード");
    return;
  }
  if (e.code === "KeyC" && !panel && locked && buildMode) { hud.say("プレートの置き方: " + build.cycleMode()); return; }
  if (e.code === "KeyR" && !panel && locked) { controls.respawn(); hud.say("スタート地点にもどりました"); return; }
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
  if (world.dirty.size) rebuildDirty();
  remotes.setViewer({ x: p.x, y: p.y, z: p.z });
  const dirv = controls.lookDir(), eye = [p.x, p.y + controls.eyeH(), p.z];
  if (panel) { build.outline.visible = build.ghost.visible = build.ghostLine.visible = false; build.target = build.place = null; }
  else build.update(eye, dirv, buildMode && isAdmin, hud.selectedItem(), [p.x - 0.3, p.y, p.z - 0.3, p.x + 0.3, p.y + controls.curH(), p.z + 0.3]);
  const kmh = Math.hypot(p.vx, p.vy, p.vz) * 3;
  renderer.render(scene, camera);
  sendPose(t);

  fps = fps * 0.9 + (dt > 0 ? 1 / dt : 0) * 0.1;
  dbgT += dt;
  if (dbgT > 0.25) {
    dbgT = 0;
    const yawDeg = ((((-p.yaw * 180) / Math.PI) % 360) + 360) % 360;   // 北(-z)が0度、東(+x)が90度
    const face = ["北 (-z)", "東 (+x)", "南 (+z)", "西 (-x)"][Math.round(yawDeg / 90) % 4];
    const tg = build.target;
    const look = tg ? (tg.kind === "block" ? `ブロック ${wrapCell(tg.cell).join(" ")}` : `プレート ${PLATE_NAMES[tg.plate]} @ ${wrapCell(tg.cell).join(" ")}`) : "なし";
    hud.setDebug([
      `artifact学会。 3D v${VERSION}   ${fps.toFixed(0)} fps`,
      `XYZ: ${p.x.toFixed(3)} / ${p.y.toFixed(3)} / ${p.z.toFixed(3)}`,
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
window.__craft = { controls, scene, camera, hud, world, build, net, get buildMode() { return buildMode; } };
window.__info = () => JSON.stringify({ calls: renderer.info.render.calls, tris: renderer.info.render.triangles, geos: renderer.info.memory.geometries, tex: renderer.info.memory.textures });
