// 2代目スズキ・スイフト(右ハンドル)の室内を、巨大な世界として組み立てる。
// 寸法はメートルで書いて、S倍(1m=30ユニット)する。x=右(運転席側が+)、z=後ろが+(前が−)、h=床からの高さ。
import { S } from "./shared.js";
import { makeMaterials } from "./textures.js";
import { createGauges } from "./gauges.js";

export const FY = 0.18 * S;   // 床の面の高さ(地面から)

export function buildSwift(THREE, scene) {
  const T = THREE;
  const M = makeMaterials(T);
  const colliders = [];     // [x0,y0,z0,x1,y1,z1]
  const car = new T.Group();
  scene.add(car);

  const wood = new T.MeshPhongMaterial({ color: 0x2a1c16, shininess: 70, specular: 0x555555 });
  const lcd = (() => {
    const c = document.createElement("canvas"); c.width = 256; c.height = 96;
    const g = c.getContext("2d");
    g.fillStyle = "#2a1204"; g.fillRect(0, 0, 256, 96);
    g.fillStyle = "#ff9a2e"; g.font = "bold 64px monospace"; g.textBaseline = "middle"; g.fillText("25.0", 22, 52);
    g.font = "bold 18px monospace"; g.fillText("FULL AUTO A/C", 120, 20); g.fillText("℃", 205, 70);
    const t = new T.CanvasTexture(c);
    return new T.MeshBasicMaterial({ map: t });
  })();
  const slats = (() => {
    const c = document.createElement("canvas"); c.width = 64; c.height = 32;
    const g = c.getContext("2d");
    g.fillStyle = "#17181a"; g.fillRect(0, 0, 64, 32);
    g.fillStyle = "#3a3c40";
    for (let y = 4; y < 30; y += 6) g.fillRect(3, y, 58, 3);
    return new T.MeshLambertMaterial({ map: new T.CanvasTexture(c) });
  })();
  const emblem = (() => {
    const c = document.createElement("canvas"); c.width = c.height = 128;
    const g = c.getContext("2d");
    g.fillStyle = "#b9bdc3"; g.fillRect(0, 0, 128, 128);
    g.strokeStyle = "#5c6068"; g.lineWidth = 6; g.strokeRect(3, 3, 122, 122);
    g.fillStyle = "#4a4d54"; g.font = "bold 104px sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("S", 64, 70);
    return new T.MeshPhongMaterial({ map: new T.CanvasTexture(c), shininess: 80 });
  })();
  const knob = (() => {
    const c = document.createElement("canvas"); c.width = c.height = 128;
    const g = c.getContext("2d");
    g.fillStyle = "#18181a"; g.fillRect(0, 0, 128, 128);
    g.strokeStyle = "#dcdcdc"; g.lineWidth = 3; g.font = "bold 20px sans-serif"; g.fillStyle = "#e8e8e8"; g.textAlign = "center";
    g.beginPath(); g.moveTo(30, 28); g.lineTo(30, 100); g.moveTo(64, 28); g.lineTo(64, 100); g.moveTo(98, 28); g.lineTo(98, 100); g.moveTo(30, 64); g.lineTo(98, 64); g.stroke();
    ["1", "3", "5"].forEach((n, i) => g.fillText(n, 30 + i * 34, 22));
    ["2", "4", "R"].forEach((n, i) => g.fillText(n, 30 + i * 34, 122));
    return new T.MeshPhongMaterial({ map: new T.CanvasTexture(c), shininess: 30 });
  })();

  // ---- 箱を置く道具 ----
  const ux = (m) => m * S, uy = (h) => FY + h * S, uz = (m) => m * S;
  // 角を丸めた箱。面を細かく割って、縁だけ丸める(模様の座標はそのまま)
  const NS = 6;
  function roundBox(w, h, d, r) {
    const g = new T.BoxGeometry(1, 1, 1, NS, NS, NS);
    const pos = g.attributes.position, nor = g.attributes.normal;
    const hw = w / 2, hh = h / 2, hd = d / 2;
    const fr = [0, 0.3, 1];
    // 座標の並び: 端, 端から0.3r内側, 端からr内側, 中央
    const coord = (half, t) => {
      const i = Math.round((t + 0.5) * NS);
      if (i === 3) return 0;
      const sign = i < 3 ? -1 : 1, k = i < 3 ? i : NS - i;
      const inset = k === 0 ? 0 : k === 1 ? 0.3 * r : r;
      return sign * (half - inset);
    };
    const ix = hw - r, iy = hh - r, iz = hd - r;
    for (let i = 0; i < pos.count; i++) {
      const x = coord(hw, pos.getX(i)), y = coord(hh, pos.getY(i)), z = coord(hd, pos.getZ(i));
      const cx = Math.max(-ix, Math.min(ix, x)), cy = Math.max(-iy, Math.min(iy, y)), cz = Math.max(-iz, Math.min(iz, z));
      let dx = x - cx, dy = y - cy, dz = z - cz;
      const len = Math.hypot(dx, dy, dz);
      if (len > 1e-9) { dx /= len; dy /= len; dz /= len; pos.setXYZ(i, cx + dx * r, cy + dy * r, cz + dz * r); nor.setXYZ(i, dx, dy, dz); }
      else pos.setXYZ(i, x, y, z);
    }
    return g;
  }
  function uvFix(g, w, h, d, tile) {
    const uv = g.attributes.uv, k = 1 / tile, per = uv.count / 6;
    const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    for (let f = 0; f < 6; f++) for (let v = 0; v < per; v++) {
      const i = f * per + v;
      uv.setXY(i, uv.getX(i) * dims[f][0] * k, uv.getY(i) * dims[f][1] * k);
    }
  }
  // x0..x1, h0..h1, z0..z1 はメートル。mat は材質、または6面(+x,-x,+y,-y,+z,-z)の配列
  function B(x0, x1, h0, h1, z0, z1, mat, o = {}) {
    const w = (x1 - x0) * S, hh = (h1 - h0) * S, d = (z1 - z0) * S;
    if (o.hide) { colliders.push([ux(x0), uy(h0), uz(z0), ux(x1), uy(h1), uz(z1)]); return null; }
    const rr = o.r !== undefined ? o.r : Math.min(0.012 * S, Math.min(w, hh, d) * 0.45);
    const g = rr > 0.04 ? roundBox(w, hh, d, rr) : new T.BoxGeometry(w, hh, d);
    const m0 = Array.isArray(mat) ? mat[0] : mat;
    uvFix(g, x1 - x0, h1 - h0, z1 - z0, (m0.userData && m0.userData.tile) || 1);
    const mesh = new T.Mesh(g, mat);
    mesh.position.set(ux((x0 + x1) / 2), uy((h0 + h1) / 2), uz((z0 + z1) / 2));
    if (o.rx) mesh.rotation.x = o.rx;
    if (o.ry) mesh.rotation.y = o.ry;
    (o.parent || car).add(mesh);
    const col = o.col === undefined ? !(o.rx || o.ry) : o.col;
    if (col) colliders.push([ux(x0), uy(h0), uz(z0), ux(x1), uy(h1), uz(z1)]);
    return mesh;
  }
  function C(x0, x1, h0, h1, z0, z1) {   // 見えない当たり判定だけ
    colliders.push([ux(x0), uy(h0), uz(z0), ux(x1), uy(h1), uz(z1)]);
  }
  function cyl(rt, rb, len, mat, x, h, z, axis = "z", o = {}) {   // 円柱(axis方向に伸びる)
    const g = new T.CylinderGeometry(rt * S, rb * S, len * S, o.seg || 36);
    const mesh = new T.Mesh(g, mat);
    if (axis === "z") mesh.rotation.x = Math.PI / 2;
    if (axis === "x") mesh.rotation.z = Math.PI / 2;
    mesh.position.set(ux(x), uy(h), uz(z));
    (o.parent || car).add(mesh);
    return mesh;
  }
  function ball(r, mat, x, h, z) {
    const mesh = new T.Mesh(new T.SphereGeometry(r * S, 16, 12), mat);
    mesh.position.set(ux(x), uy(h), uz(z));
    car.add(mesh);
    return mesh;
  }

  const L = 0.66, W = 0.72;   // 室内の半幅、ボディの半幅

  // ================= 床・下回り =================
  B(-W, W, -0.05, 0, -0.95, 2.1, [M.plasticBk, M.plasticBk, M.carpet, M.plasticBk, M.plasticBk, M.plasticBk]);
  B(-0.12, 0.12, 0, 0.26, -0.30, 0.42, [M.carpet, M.carpet, M.carpet, M.carpet, M.carpet, M.carpet]);   // センタートンネル
  // 紙のフロアマット(足あと)
  B(0.12, 0.60, 0, 0.006, -0.88, -0.35, [M.mat, M.mat, M.mat, M.mat, M.mat, M.mat], { col: false });
  B(-0.60, -0.12, 0, 0.006, -0.88, -0.35, [M.mat, M.mat, M.mat, M.mat, M.mat, M.mat], { col: false });
  // ペダル(左からクラッチ・ブレーキ・アクセル)
  [[0.215, 0.055], [0.30, 0.05], [0.40, 0.045]].forEach(([x, w], i) => {
    B(x - w / 2, x + w / 2, 0.10, 0.20, -0.62, -0.60, M.rubber, { col: false });
    B(x - 0.008, x + 0.008, 0.02, 0.10, -0.66, -0.64, M.silver, { col: false });
  });
  B(0.10, 0.17, 0.06, 0.16, -0.70, -0.68, M.rubber, { col: false });   // フットレスト

  // ================= ダッシュボード =================
  B(-W, W, 0, 0.60, -0.95, -0.40, M.plasticDk, { hide: true });       // 本体(当たり判定。見た目は下で曲面に作る)
  B(-0.64, 0.64, 0.60, 0.68, -0.93, -0.80, slats, { col: true });     // デフロスター
  B(-0.66, 0.66, 0.60, 0.61, -0.80, -0.62, M.plasticDk, { col: false });
  // センタースタック
  B(-0.19, 0.19, 0.10, 0.60, -0.40, -0.30, M.plasticMid);
  B(-0.17, -0.01, 0.50, 0.56, -0.302, -0.298, slats, { col: false });   // 吹き出し口 ×2
  B(0.01, 0.17, 0.50, 0.56, -0.302, -0.298, slats, { col: false });
  B(-0.015, 0.015, 0.455, 0.485, -0.302, -0.298, M.red, { col: false });  // ハザード
  B(-0.17, 0.17, 0.36, 0.45, -0.302, -0.296, M.silver, { col: false });   // オーディオ
  B(-0.10, 0.07, 0.385, 0.425, -0.298, -0.294, M.black, { col: false });
  cyl(0.022, 0.022, 0.02, M.chrome, -0.135, 0.405, -0.30, "z");
  cyl(0.016, 0.016, 0.02, M.chrome, 0.12, 0.405, -0.30, "z");
  B(-0.17, 0.17, 0.27, 0.34, -0.302, -0.30, M.black, { col: false });    // 小物入れ
  B(-0.17, 0.17, 0.12, 0.25, -0.302, -0.296, M.plasticBk, { col: false }); // エアコン操作部
  B(-0.07, 0.07, 0.17, 0.225, -0.298, -0.294, lcd, { col: false });
  cyl(0.034, 0.034, 0.03, M.plasticMid, -0.125, 0.185, -0.30, "z");
  cyl(0.034, 0.034, 0.03, M.plasticMid, 0.125, 0.185, -0.30, "z");
  for (let i = 0; i < 4; i++) B(-0.07 + i * 0.038, -0.05 + i * 0.038, 0.135, 0.155, -0.298, -0.294, M.silver, { col: false });
  // 両はしの丸い吹き出し口
  [-0.62, 0.64].forEach((x) => {
    cyl(0.038, 0.038, 0.012, slats, x, 0.50, -0.399, "z");
    cyl(0.044, 0.044, 0.008, M.plasticBk, x, 0.50, -0.402, "z");
  });
  // グローブボックスと運転席のひざ前
  B(-0.60, -0.12, 0.16, 0.48, -0.404, -0.40, M.plasticMid, { col: false });
  B(-0.40, -0.30, 0.44, 0.47, -0.408, -0.404, M.plasticBk, { col: false });
  B(0.10, 0.62, 0.20, 0.44, -0.404, -0.40, M.plasticMid, { col: false });
  for (let i = 0; i < 5; i++) B(0.14 + i * 0.05, 0.17 + i * 0.05, 0.40, 0.43, -0.408, -0.404, M.plasticBk, { col: false });
  // メーターのフード(中にメーターが入る)。ブローは目の前の庇
  B(0.14, 0.65, 0.60, 0.85, -0.62, -0.36, M.plasticBk);
  B(0.13, 0.66, 0.83, 0.88, -0.62, -0.28, M.plasticBk);
  B(0.13, 0.15, 0.60, 0.83, -0.62, -0.30, M.plasticBk, { col: false });
  B(0.64, 0.66, 0.60, 0.83, -0.62, -0.30, M.plasticBk, { col: false });
  // ステアリング(柱・輪・ハブ・スポーク)
  B(0.33, 0.39, 0.38, 0.52, -0.40, -0.14, M.plasticBk, { col: false });
  const wheel = new T.Group();
  wheel.position.set(ux(0.36), uy(0.53), uz(-0.12));
  wheel.rotation.x = -0.47;
  car.add(wheel);
  wheel.add(new T.Mesh(new T.TorusGeometry(0.185 * S, 0.0165 * S, 12, 36), M.leatherBk));
  const hub = new T.Mesh(new T.CylinderGeometry(0.058 * S, 0.062 * S, 0.05 * S, 24), M.leatherBk);
  hub.rotation.x = Math.PI / 2; wheel.add(hub);
  const em = new T.Mesh(new T.PlaneGeometry(0.07 * S, 0.07 * S), emblem);
  em.position.z = 0.0265 * S; wheel.add(em);
  [[-1, 0], [1, 0]].forEach(([sx]) => {
    const sp = new T.Mesh(new T.BoxGeometry(0.13 * S, 0.034 * S, 0.02 * S), M.silver);
    sp.position.set(sx * 0.12 * S, 0, 0); wheel.add(sp);
  });
  const sb = new T.Mesh(new T.BoxGeometry(0.034 * S, 0.12 * S, 0.02 * S), M.silver);
  sb.position.set(0, -0.12 * S, 0); wheel.add(sb);
  // センターコンソール(シフト・ハンドブレーキ・カップ)
  B(-0.12, 0.12, 0.26, 0.275, -0.30, 0.42, M.plasticDk, { col: false });
  cyl(0.052, 0.052, 0.02, M.silver, 0, 0.285, -0.12, "y");
  cyl(0.024, 0.05, 0.085, M.leatherBk, 0, 0.32, -0.12, "y");
  cyl(0.012, 0.012, 0.11, M.black, 0, 0.405, -0.12, "y");
  ball(0.03, M.leatherBk, 0, 0.47, -0.12);
  const kt = new T.Mesh(new T.CircleGeometry(0.02 * S, 16), knob);
  kt.rotation.x = -Math.PI / 2; kt.position.set(ux(0), uy(0.5) + 0.05, uz(-0.12)); car.add(kt);
  B(-0.09, 0.09, 0.275, 0.285, 0.14, 0.34, M.black, { col: false });    // カップホルダー
  cyl(0.032, 0.03, 0.11, M.white, -0.04, 0.34, 0.24, "y");              // 紙コップ
  cyl(0.034, 0.034, 0.014, M.cardboard, -0.04, 0.4, 0.24, "y");
  B(0.115, 0.145, 0.28, 0.33, 0.0, 0.24, M.black, { rx: -0.3 });         // ハンドブレーキ
  B(0.112, 0.148, 0.325, 0.345, 0.17, 0.23, M.plasticBk, { col: false });
  B(0.118, 0.142, 0.345, 0.352, 0.2, 0.225, M.red, { col: false });
  B(0.10, 0.12, 0.26, 0.40, 0.34, 0.40, M.plasticBk, { col: false });  // 運転席わきの小物入れ

  // ================= フロントガラスと柱 =================
  const z0 = -0.93, h0 = 0.68, z1 = -0.16, h1 = 1.12, wl = Math.hypot(z1 - z0, h1 - h0);
  const wsMesh = new T.Mesh(new T.PlaneGeometry(2 * 0.66 * S, wl * S), M.glass);
  wsMesh.position.set(0, uy((h0 + h1) / 2), uz((z0 + z1) / 2));
  wsMesh.rotation.x = Math.atan2(z1 - z0, h1 - h0);
  car.add(wsMesh);
  const N = 8;
  for (let i = 0; i < N; i++) {   // 斜めの面を、階段のように近づけた当たり判定
    const t = (i + 0.5) / N, zc = z0 + (z1 - z0) * t, hc = h0 + (h1 - h0) * t;
    C(-0.66, 0.66, hc - 0.03, hc + 0.03, zc - (z1 - z0) / N / 2 - 0.01, zc + (z1 - z0) / N / 2 + 0.01);
    [-1, 1].forEach((s) => C(s > 0 ? 0.64 : -0.72, s > 0 ? 0.72 : -0.64, hc - 0.04, hc + 0.04, zc - 0.06, zc + 0.06));
  }
  [-1, 1].forEach((s) => {   // Aピラー(斜め)
    const m = new T.Mesh(new T.BoxGeometry(0.07 * S, wl * S, 0.05 * S), s > 0 ? [M.paint, M.plasticBk, M.paint, M.paint, M.plasticBk, M.paint] : [M.plasticBk, M.paint, M.paint, M.paint, M.plasticBk, M.paint]);
    m.position.set(ux(s * 0.69), uy((h0 + h1) / 2), uz((z0 + z1) / 2));
    m.rotation.x = Math.atan2(z1 - z0, h1 - h0);
    car.add(m);
  });

  // ================= 天井 =================
  B(-0.70, 0.70, 1.10, 1.16, -0.18, 1.98, [M.paint, M.paint, M.paint, M.headliner, M.paint, M.paint]);
  B(-0.70, 0.70, 1.02, 1.14, -0.30, -0.14, M.plasticMid);
  B(-0.05, 0.05, 1.07, 1.10, 0.50, 0.65, M.white, { col: false });                 // ルームランプ
  [-0.36, 0.36].forEach((x) => B(x - 0.11, x + 0.11, 1.075, 1.095, -0.28, -0.12, M.headliner, { col: false })); // サンバイザー
  B(-0.005, 0.005, 1.0, 1.1, -0.26, -0.25, M.black, { col: false });               // ルームミラー
  B(-0.07, 0.07, 0.97, 1.01, -0.27, -0.24, M.black, { col: false });
  // 吊るしたエアフレッシュナー
  B(-0.002, 0.002, 0.88, 1.0, -0.265, -0.263, M.black, { col: false });
  B(-0.03, 0.03, 0.80, 0.88, -0.268, -0.262, M.green, { col: false });
  [-0.62, 0.62].forEach((x) => [0.1, 0.9].forEach((z) => B(x - 0.02, x + 0.02, 1.05, 1.1, z - 0.05, z + 0.05, M.plasticMid, { col: false })));  // アシストグリップ

  // ================= ドア・ボディの側面 =================
  [-1, 1].forEach((s) => {
    const outer = s > 0 ? [M.paint, M.plasticDk] : [M.plasticDk, M.paint];
    const side = (z0_, z1_, h0_, h1_) => B(s > 0 ? L : -W, s > 0 ? W : -L, h0_, h1_, z0_, z1_, [...outer, M.plasticDk, M.plasticDk, M.plasticDk, M.plasticDk]);
    side(-0.45, 0.58, 0, 0.62);        // 前ドア
    side(0.58, 1.55, 0, 0.62);         // 後ドア
    side(1.55, 2.10, 0, 0.62);         // 後ろの側面
    B(s > 0 ? L : -W, s > 0 ? W : -L, 0.62, 0.66, -0.45, 1.98, wood);          // ベルトラインの濃い木目調
    B(s > 0 ? 0.64 : -0.72, s > 0 ? 0.72 : -0.64, 0.62, 1.14, 0.54, 0.62, M.plasticBk);   // Bピラー
    B(s > 0 ? 0.60 : -0.72, s > 0 ? 0.72 : -0.60, 0.62, 1.14, 1.84, 1.98, M.plasticBk);   // Cピラー
    B(s > 0 ? 0.66 : -0.72, s > 0 ? 0.72 : -0.66, 1.08, 1.14, -0.45, 1.98, M.plasticBk);  // ルーフレール
    // うしろのガラス(前のドアの窓は、下がっていて、そこから出入りできる)
    const gm = new T.Mesh(new T.PlaneGeometry(1.22 * S, 0.42 * S), M.glass);
    gm.rotation.y = Math.PI / 2; gm.position.set(ux(s * 0.70), uy(0.87), uz(1.23)); car.add(gm);
    C(s > 0 ? 0.69 : -0.71, s > 0 ? 0.71 : -0.69, 0.66, 1.08, 0.62, 1.84);
    // ドアの内側の部品
    const f = s > 0 ? 1 : -1, ix = s > 0 ? L : -L;      // 室内側の面
    const px0 = s > 0 ? 0.60 : -0.66, px1 = s > 0 ? 0.66 : -0.60;
    B(px0, px1, 0.30, 0.38, 0.00, 0.45, M.stitch);                              // 前ドアの肘かけ(青いステッチ)
    B(px0, px1, 0.30, 0.38, 0.65, 1.05, M.stitch);
    B(s > 0 ? 0.62 : -0.66, s > 0 ? 0.66 : -0.62, 0.10, 0.22, -0.10, 0.45, M.plasticBk, { col: false });      // ドアポケット
    B(s > 0 ? 0.62 : -0.66, s > 0 ? 0.66 : -0.62, 0.52, 0.57, 0.38, 0.50, M.chrome, { col: false });          // ドアハンドル
    B(s > 0 ? 0.62 : -0.66, s > 0 ? 0.66 : -0.62, 0.52, 0.57, 1.0, 1.12, M.chrome, { col: false });
    cyl(0.05, 0.05, 0.01, M.plasticBk, ix - f * 0.008, 0.15, 0.18, "x");                                      // スピーカー
    // ドアミラー(外)
    B(s > 0 ? 0.72 : -0.86, s > 0 ? 0.86 : -0.72, 0.64, 0.80, -0.50, -0.36, M.paint, { col: false });
  });
  // 運転席ドアのパワーウィンドウスイッチ
  B(0.60, 0.66, 0.38, 0.46, -0.12, 0.20, M.plasticBk, { col: false });
  for (let i = 0; i < 4; i++) B(0.598, 0.60, 0.395, 0.425, -0.10 + i * 0.07, -0.05 + i * 0.07, M.plasticMid, { col: false });
  cyl(0.014, 0.014, 0.01, M.black, 0.596, 0.44, -0.20, "x");
  B(0.60, 0.66, 0.38, 0.44, -0.20, -0.14, M.plasticBk, { col: false });

  // ================= シート =================
  function seat(cx) {
    const x0 = cx - 0.25, x1 = cx + 0.25;
    B(cx - 0.12, cx + 0.12, 0, 0.14, 0.10, 0.50, M.plasticBk);                  // レール
    B(x0, x1, 0.14, 0.30, 0.02, 0.58, M.fabric);                                  // 座面
    B(x0 - 0.01, x0 + 0.05, 0.30, 0.36, 0.08, 0.56, M.fabricDk, { col: false }); // 座面のふくらみ
    B(x1 - 0.05, x1 + 0.01, 0.30, 0.36, 0.08, 0.56, M.fabricDk, { col: false });
    B(x0, x1, 0.30, 0.88, 0.58, 0.72, M.fabric, { col: true });                    // 背もたれの当たり判定
    B(x0, x1, 0.30, 0.88, 0.60, 0.70, M.fabric, { rx: 0.24, col: false });
    B(x0 - 0.01, x0 + 0.06, 0.34, 0.80, 0.60, 0.70, M.fabricDk, { rx: 0.24, col: false });
    B(x1 - 0.06, x1 + 0.01, 0.34, 0.80, 0.60, 0.70, M.fabricDk, { rx: 0.24, col: false });
    B(cx - 0.12, cx + 0.12, 0.80, 0.97, 0.66, 0.77, M.fabric, { rx: 0.24 });      // ヘッドレスト
    [-0.06, 0.06].forEach((d) => B(cx + d - 0.008, cx + d + 0.008, 0.74, 0.82, 0.68, 0.70, M.chrome, { col: false }));
  }
  seat(0.36);    // 運転席(右)
  seat(-0.36);   // 助手席
  // 後席(ベンチ)
  B(-L, L, 0.14, 0.30, 1.00, 1.50, M.fabric);
  B(-L, L, 0.30, 0.86, 1.46, 1.60, M.fabric);
  B(-L, L, 0.30, 0.86, 1.48, 1.58, M.fabric, { rx: 0.2, col: false });
  B(-0.004, 0.004, 0.30, 0.86, 1.43, 1.47, M.plasticBk, { rx: 0.2, col: false });
  [-0.31, 0.31].forEach((x) => B(x - 0.11, x + 0.11, 0.84, 1.00, 1.50, 1.60, M.fabric, { rx: 0.2 }));
  // シートベルトの赤いバックル
  [[0.12, 0.30, 0.50], [-0.12, 0.30, 0.50], [-0.20, 0.30, 1.28], [0.20, 0.30, 1.28]].forEach(([x, h, z]) => {
    B(x - 0.012, x + 0.012, h, h + 0.07, z - 0.012, z + 0.012, M.plasticBk, { col: false });
    B(x - 0.014, x + 0.014, h + 0.06, h + 0.075, z - 0.014, z + 0.014, M.red, { col: false });
  });

  // ================= 荷室 =================
  B(-0.64, 0.64, 0.28, 0.34, 1.60, 2.06, M.cargo);
  [-1, 1].forEach((s) => B(s > 0 ? 0.58 : -0.66, s > 0 ? 0.66 : -0.58, 0.34, 0.80, 1.60, 2.0, M.plasticMid));   // 荷室の側面の内張り
  B(-0.64, 0.64, 0, 0.28, 1.58, 2.06, M.plasticBk);
  B(-W, W, 0, 0.3, 2.06, 2.12, M.paint);                            // 後ろの下の板
  B(-W, W, -0.12, 0.2, 2.12, 2.22, M.plasticBk);                    // 後ろのバンパー
  [-1, 1].forEach((s) => B(s * 0.62 - 0.07, s * 0.62 + 0.07, 0.34, 0.5, 2.12, 2.14, M.red, { col: false }));
  // 開いたハッチゲート
  const lid = B(-0.66, 0.66, 1.14, 2.04, 1.99, 2.03, [M.paint, M.paint, M.paint, M.paint, M.paint, M.plasticDk], { rx: 0.17, col: false });
  lid.position.z = uz(2.07); lid.position.y = uy(1.60);
  // 荷室の荷物
  B(-0.5, -0.1, 0.34, 0.60, 1.68, 2.0, M.cardboard);
  B(-0.46, -0.14, 0.60, 0.605, 1.80, 1.86, M.white, { col: false });
  B(0.12, 0.40, 0.34, 0.52, 1.72, 1.98, M.cardboard);
  B(0.42, 0.58, 0.34, 0.56, 1.76, 1.96, M.green);                   // エコバッグ

  // ================= ダッシュの上の飾り =================
  // ぬいぐるみ(くま)
  const bear = 0x9a6a3e, bm = new T.MeshLambertMaterial({ color: bear }), bd = new T.MeshLambertMaterial({ color: 0x2a1a10 });
  B(-0.34, -0.26, 0.60, 0.68, -0.64, -0.56, bm);
  B(-0.33, -0.27, 0.68, 0.75, -0.635, -0.575, bm, { col: false });
  B(-0.335, -0.315, 0.75, 0.775, -0.63, -0.61, bm, { col: false });
  B(-0.285, -0.265, 0.75, 0.775, -0.63, -0.61, bm, { col: false });
  B(-0.32, -0.31, 0.71, 0.72, -0.576, -0.572, bd, { col: false });
  B(-0.29, -0.28, 0.71, 0.72, -0.576, -0.572, bd, { col: false });
  // 観葉植物
  cyl(0.04, 0.03, 0.06, M.silver, -0.52, 0.63, -0.66, "y");
  B(-0.55, -0.49, 0.66, 0.72, -0.69, -0.63, M.green);
  B(-0.54, -0.50, 0.72, 0.76, -0.68, -0.64, M.green, { col: false });
  // ティッシュ箱(後ろの棚)
  B(-0.20, 0.06, 0.34, 0.44, 1.64, 1.80, M.white);
  B(-0.14, 0.0, 0.44, 0.46, 1.68, 1.76, M.white, { col: false });

  // ================= ボディ(前と車輪) =================
  B(-W, W, -0.12, 0.58, -2.0, -0.93, [M.paint, M.paint, M.paint, M.plasticBk, M.paint, M.paint]);
  B(-W, W, -0.12, 0.16, -2.1, -2.0, M.plasticBk);
  [-1, 1].forEach((s) => B(s * 0.5 - 0.15, s * 0.5 + 0.15, 0.30, 0.42, -2.002, -2.0, M.white, { col: false }));
  [-1, 1].forEach((s) => {
    [-1.40, 1.0].forEach((z) => {
      const w = new T.Mesh(new T.CylinderGeometry(0.30 * S, 0.30 * S, 0.19 * S, 28), [M.tire, M.silver, M.silver]);
      w.rotation.z = Math.PI / 2; w.position.set(ux(s * 0.76), uy(0.12), uz(z)); car.add(w);
      C(s > 0 ? 0.665 : -0.855, s > 0 ? 0.855 : -0.665, -0.18, 0.40, z - 0.25, z + 0.25);
    });
  });


  // ================= 細部(写真を見ながら足したもの) =================
  const scaled = (mat, tile) => { const m = mat.clone(); m.map = mat.map.clone(); m.map.needsUpdate = true; m.bumpMap = m.map; m.map.repeat.set(1 / (tile * S), 1 / (tile * S)); return m; };
  // ダッシュ本体: 横から見た輪郭を、なめらかな曲線でつないで押し出す
  {
    const sh = new T.Shape(), P = (z, h) => [z * S, h * S];
    sh.moveTo(...P(-0.95, 0)); sh.lineTo(...P(-0.95, 0.625));
    sh.bezierCurveTo(...P(-0.85, 0.64), ...P(-0.72, 0.612), ...P(-0.60, 0.602));
    sh.lineTo(...P(-0.46, 0.60)); sh.quadraticCurveTo(...P(-0.395, 0.598), ...P(-0.388, 0.55));
    sh.lineTo(...P(-0.388, 0.36)); sh.quadraticCurveTo(...P(-0.388, 0.31), ...P(-0.43, 0.29));
    sh.lineTo(...P(-0.43, 0.22)); sh.quadraticCurveTo(...P(-0.40, 0.20), ...P(-0.40, 0.14));
    sh.lineTo(...P(-0.40, 0)); sh.closePath();
    const g = new T.ExtrudeGeometry(sh, { depth: 1.36 * S, bevelEnabled: true, bevelThickness: 0.35, bevelSize: 0.35, bevelSegments: 3, curveSegments: 14 });
    g.translate(0, 0, -0.68 * S); g.rotateY(-Math.PI / 2);
    const m = new T.Mesh(g, scaled(M.plasticDk, 0.12));
    m.position.set(0, uy(0), 0); car.add(m);
    // 助手席側のエアバッグの継ぎ目(うすい線)
    B(-0.62, -0.08, 0.602, 0.604, -0.80, -0.78, M.black, { col: false, r: 0 });
    B(-0.62, -0.60, 0.602, 0.604, -0.80, -0.50, M.black, { col: false, r: 0 });
    B(-0.10, 0.10, 0.602, 0.608, -0.62, -0.56, M.black, { col: false });   // 日射センサーのスリット
  }
  // 立体のルーバー(吹き出し口): 枠 + 羽根5枚 + 縦のフィン
  function louver(x, h, w, hh, z, face = 1) {
    B(x - w / 2, x + w / 2, h - hh / 2, h + hh / 2, z - 0.006 * face, z + 0.004 * face, M.plasticBk, { col: false });
    for (let i = 0; i < 5; i++) {
      const y = h - hh / 2 + 0.008 + (hh - 0.016) * (i / 4);
      B(x - w / 2 + 0.004, x + w / 2 - 0.004, y - 0.0025, y + 0.0025, z - 0.002 * face, z + 0.014 * face, M.plasticMid, { col: false, r: 0, rx: -0.35 * face });
    }
    B(x - 0.003, x + 0.003, h - hh / 2 + 0.004, h + hh / 2 - 0.004, z, z + 0.012 * face, M.plasticBk, { col: false, r: 0 });
  }
  louver(-0.09, 0.535, 0.12, 0.055, -0.30); louver(0.09, 0.535, 0.12, 0.055, -0.30);
  function roundVent(x, h, z) {
    cyl(0.046, 0.046, 0.012, M.plasticBk, x, h, z, "z");
    for (let i = 0; i < 5; i++) B(x - 0.034, x + 0.034, h - 0.032 + i * 0.016 - 0.002, h - 0.032 + i * 0.016 + 0.002, z - 0.004, z + 0.01, M.plasticMid, { col: false, r: 0 });
  }
  roundVent(-0.62, 0.50, -0.386); roundVent(0.64, 0.50, -0.386);
  // オーディオ: ボタンの列と、表示窓、ノブ
  for (let i = 0; i < 6; i++) B(-0.15 + i * 0.027, -0.13 + i * 0.027, 0.368, 0.380, -0.298, -0.292, M.plasticBk, { col: false });
  B(0.00, 0.14, 0.390, 0.428, -0.297, -0.292, lcd, { col: false });
  B(-0.10, 0.07, 0.40, 0.404, -0.294, -0.290, M.black, { col: false, r: 0 });   // カセットの口
  // エアコンのダイヤルに指かけの溝
  for (const x of [-0.125, 0.125]) {
    cyl(0.04, 0.04, 0.012, M.plasticBk, x, 0.185, -0.295, "z");
    for (let k = 0; k < 18; k++) { const a = (k / 18) * 6.283; B(x + Math.cos(a) * 0.039 - 0.002, x + Math.cos(a) * 0.039 + 0.002, 0.185 + Math.sin(a) * 0.039 - 0.002, 0.185 + Math.sin(a) * 0.039 + 0.002, -0.304, -0.288, M.plasticMid, { col: false, r: 0 }); }
    B(x - 0.002, x + 0.002, 0.185 + 0.016, 0.185 + 0.036, -0.309, -0.305, M.white, { col: false, r: 0 });
  }
  // ステアリングコラムのレバー(ウインカー/ライトとワイパー)
  const stalk = (x0, x1, h, rx) => {
    cyl(0.011, 0.011, Math.abs(x1 - x0), M.plasticBk, (x0 + x1) / 2, h, -0.30, "x");
    cyl(0.016, 0.016, 0.04, M.plasticBk, x1 + Math.sign(x1 - x0) * 0.015, h, -0.30, "x");
    cyl(0.017, 0.017, 0.006, M.silver, x1 - Math.sign(x1 - x0) * 0.005, h, -0.30, "x");
  };
  stalk(0.40, 0.56, 0.50); stalk(0.32, 0.17, 0.50);
  B(0.37, 0.43, 0.47, 0.53, -0.37, -0.31, M.plasticBk, { col: false });      // コラムカバー
  cyl(0.016, 0.016, 0.02, M.silver, 0.30, 0.47, -0.30, "z");               // キーまわり
  // ペダルのすべり止め
  [[0.215, 0.055], [0.30, 0.05], [0.40, 0.045]].forEach(([x, w]) => { for (let i = 0; i < 6; i++) B(x - w / 2 + 0.003, x + w / 2 - 0.003, 0.11 + i * 0.015, 0.115 + i * 0.015, -0.622, -0.616, M.black, { col: false, r: 0 }); });
  // シートベルト(Bピラーから、反対がわの腰へ)
  function belt(x0, h0, z0, x1, h1, z1) {
    const a = new T.Vector3(ux(x0), uy(h0), uz(z0)), b = new T.Vector3(ux(x1), uy(h1), uz(z1)), L_ = a.distanceTo(b);
    const m = new T.Mesh(new T.BoxGeometry(0.05 * S, L_, 0.004 * S), M.black);
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    car.add(m);
  }
  belt(0.62, 0.98, 0.58, 0.22, 0.34, 0.52); belt(-0.62, 0.98, 0.58, -0.22, 0.34, 0.52);
  [[0.62, 0.66], [-0.62, 0.66]].forEach(([x, z]) => B(x - 0.025, x + 0.025, 0.9, 1.0, z - 0.02, z + 0.02, M.plasticBk, { col: false }));
  // シートの調整レバーとレール
  [-1, 1].forEach((sg) => {
    [0.36, -0.36].forEach((cx) => {
      B(cx + sg * 0.265, cx + sg * 0.285, 0.06, 0.12, 0.05, 0.40, M.plasticBk, { col: false });
      B(cx + sg * 0.12, cx + sg * 0.14, 0.0, 0.03, 0.0, 0.60, M.silver, { col: false, r: 0 });
    });
  });
  B(0.265, 0.30, 0.12, 0.135, 0.06, 0.26, M.silver, { col: false });   // 運転席の前後レバー
  // ドア: 窓枠のゴム・ドアロックのピン・プルカップ・肩の面
  [-1, 1].forEach((sg) => {
    const x0 = sg > 0 ? 0.625 : -0.67, x1 = sg > 0 ? 0.67 : -0.625;
    B(x0, x1, 0.44, 0.62, -0.42, 0.55, M.plasticMid, { col: false });             // 肩の面(前ドア)
    B(x0, x1, 0.44, 0.62, 0.62, 1.50, M.plasticMid, { col: false });             // 肩の面(後ドア)
    B(sg > 0 ? 0.655 : -0.67, sg > 0 ? 0.67 : -0.655, 0.665, 0.68, -0.42, 1.84, M.black, { col: false, r: 0 }); // 窓枠ゴム
    cyl(0.006, 0.006, 0.05, M.silver, sg * 0.64, 0.665, 0.30, "y");               // ロックピン
    cyl(0.012, 0.012, 0.012, M.black, sg * 0.64, 0.7, 0.30, "y");
    B(sg > 0 ? 0.64 : -0.66, sg > 0 ? 0.66 : -0.64, 0.52, 0.575, 0.34, 0.52, M.plasticBk, { col: false });   // ハンドルの窪み
    B(x0 + 0.01, x1 - 0.01, 0.57, 0.585, -0.38, 0.52, M.chrome, { col: false, r: 0 });                        // 細い加飾
  });
  // 荷室: フック・ネット・トノカバー
  [[-0.58, 1.75], [0.58, 1.75], [-0.58, 1.95], [0.58, 1.95]].forEach(([x, z]) => B(x - 0.015, x + 0.015, 0.34, 0.36, z - 0.015, z + 0.015, M.chrome, { col: false }));
  B(-0.60, 0.60, 0.68, 0.70, 1.62, 1.97, M.plasticMid, { col: false });
  // 天井: マップランプと、バイザーのミラー
  [-0.1, 0.1].forEach((x) => B(x - 0.04, x + 0.04, 1.09, 1.105, -0.12, -0.04, M.white, { col: false }));
  [-0.36, 0.36].forEach((x) => B(x - 0.07, x + 0.07, 1.07, 1.076, -0.275, -0.2, M.silver, { col: false, r: 0 }));
  // ペダル周りのフロアのでこぼこ(カーペットの段差)
  B(-0.60, 0.60, 0.0, 0.015, -0.80, -0.64, M.carpet, { col: false });

  // ================= 白いスイッチ(広場) =================
  // 地面は main.js の白い床。ここでは室内の明かり
  const lights = [];
  const inner = new T.PointLight(0xfff4e0, 0.55, 90 * 1.2);
  inner.position.set(0, uy(0.9), uz(0.4));
  car.add(inner); lights.push(inner);


  // ================= 同じ材質の部品を1つにまとめる(描画を軽くする) =================
  (function mergeStatic() {
    car.updateMatrixWorld(true);
    const list = [];
    car.traverse((o) => { if (o.isMesh && o.geometry && o.material && !(o.material.transparent) && !(Array.isArray(o.material) && o.material.some((m) => m.transparent))) list.push(o); });
    const buckets = new Map();
    const bucket = (m) => { let b = buckets.get(m); if (!b) { b = { m, pos: [], nor: [], uv: [], idx: [], n: 0 }; buckets.set(m, b); } return b; };
    const v = new T.Vector3(), nm = new T.Matrix3();
    for (const o of list) {
      const g = o.geometry, pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv, index = g.index;
      nm.getNormalMatrix(o.matrixWorld);
      const groups = Array.isArray(o.material) ? g.groups : [{ start: 0, count: index ? index.count : pos.count, materialIndex: 0 }];
      // 頂点ごとの所属先(どの材質の面か)
      const owner = new Int16Array(pos.count).fill(-1);
      for (const gr of groups) for (let k = gr.start; k < gr.start + gr.count; k++) owner[index ? index.getX(k) : k] = gr.materialIndex;
      const base = new Map();
      for (let i = 0; i < pos.count; i++) {
        if (owner[i] < 0) continue;
        const mat = Array.isArray(o.material) ? o.material[owner[i]] : o.material, b = bucket(mat);
        if (!base.has(owner[i])) base.set(owner[i], new Map());
        v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
        b.pos.push(v.x, v.y, v.z);
        v.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize();
        b.nor.push(v.x, v.y, v.z);
        b.uv.push(uv.getX(i), uv.getY(i));
        base.get(owner[i]).set(i, b.n++);
      }
      for (const gr of groups) {
        const mat = Array.isArray(o.material) ? o.material[gr.materialIndex] : o.material, b = bucket(mat), mp = base.get(gr.materialIndex);
        for (let k = gr.start; k < gr.start + gr.count; k++) b.idx.push(mp.get(index ? index.getX(k) : k));
      }
    }
    for (const o of list) { o.parent.remove(o); o.geometry.dispose(); }
    for (const b of buckets.values()) {
      const g = new T.BufferGeometry();
      g.setAttribute("position", new T.Float32BufferAttribute(b.pos, 3));
      g.setAttribute("normal", new T.Float32BufferAttribute(b.nor, 3));
      g.setAttribute("uv", new T.Float32BufferAttribute(b.uv, 2));
      g.setIndex(b.n > 65535 ? new T.Uint32BufferAttribute(b.idx, 1) : new T.Uint16BufferAttribute(b.idx, 1));
      car.add(new T.Mesh(g, b.m));
    }
  })();

  // ================= メーター(3画面) =================
  const gauges = createGauges(THREE, car, { ux, uy, uz, S, M, tubes: null });

  car.traverse((o) => {
    if (o.isMesh) { const t = o.material && o.material.transparent; o.castShadow = !t; o.receiveShadow = true; }
  });
  const spawn = { x: 0, y: uy(0.60) + 0.02, z: uz(-0.62), yaw: Math.PI, pitch: 0 };
  return { colliders, gauges, spawn, group: car };
}
