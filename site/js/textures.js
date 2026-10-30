// 素材感をつくる、絵(テクスチャ)の自動生成。写真は使わず、プログラムで描く。
// 1つの材質 = 色 + ざらざら/織り目/しぼ の模様。tile = 模様が1回くり返す長さ(メートル)。
let seed = 12345;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

function canvas(n) {
  const c = document.createElement("canvas");
  c.width = c.height = n;
  return c;
}

// 細かいつぶつぶ(樹脂のシボ・カーペットなど)
function grain(base, lights, darks, n = 256, count = 5200, size = 2) {
  const c = canvas(n), g = c.getContext("2d");
  g.fillStyle = base; g.fillRect(0, 0, n, n);
  for (let i = 0; i < count; i++) {
    g.fillStyle = (i & 1 ? lights : darks);
    g.globalAlpha = 0.08 + rnd() * 0.22;
    g.fillRect(rnd() * n, rnd() * n, 1 + rnd() * size, 1 + rnd() * size);
  }
  g.globalAlpha = 1;
  return c;
}

// 織物(シート・ドアの布)。縦横の糸と、青い糸のななめ模様
function weave(base, thread, blue, n = 256) {
  const c = canvas(n), g = c.getContext("2d");
  g.fillStyle = base; g.fillRect(0, 0, n, n);
  for (let y = 0; y < n; y += 4) {
    for (let x = 0; x < n; x += 4) {
      const k = ((x + y) / 4) & 3;
      g.fillStyle = k === 0 ? blue : thread;
      g.globalAlpha = k === 0 ? 0.55 : 0.18 + rnd() * 0.12;
      g.fillRect(x, y, 3, 3);
    }
  }
  g.globalAlpha = 0.12;
  g.fillStyle = "#000";
  for (let y = 0; y < n; y += 4) g.fillRect(0, y + 3, n, 1);
  g.globalAlpha = 1;
  return c;
}

// 革のしぼ(細かい網目)
function leather(base, line, n = 256) {
  const c = canvas(n), g = c.getContext("2d");
  g.fillStyle = base; g.fillRect(0, 0, n, n);
  g.strokeStyle = line; g.lineWidth = 1.4;
  for (let i = 0; i < 900; i++) {
    const x = rnd() * n, y = rnd() * n, r = 3 + rnd() * 4;
    g.globalAlpha = 0.18 + rnd() * 0.3;
    g.beginPath();
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * 6.283 + rnd() * 0.6;
      g[k ? "lineTo" : "moveTo"](x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    g.closePath(); g.stroke();
  }
  g.globalAlpha = 1;
  return c;
}

// 青いステッチが入った、ドアの肘かけ(格子の布)
function stitchCloth(n = 256) {
  const c = weave("#2c2f35", "#5a606b", "#3c5ea8", n), g = c.getContext("2d");
  g.strokeStyle = "#4a74d0"; g.lineWidth = 2; g.globalAlpha = 0.85;
  for (let i = -n; i < n * 2; i += 16) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + n, n); g.stroke(); g.beginPath(); g.moveTo(i, n); g.lineTo(i + n, 0); g.stroke(); }
  g.globalAlpha = 1;
  return c;
}

// 金属(ヘアライン)
function brushed(base, n = 128) {
  const c = canvas(n), g = c.getContext("2d");
  g.fillStyle = base; g.fillRect(0, 0, n, n);
  for (let i = 0; i < 260; i++) { g.globalAlpha = 0.05 + rnd() * 0.12; g.fillStyle = rnd() > 0.5 ? "#fff" : "#000"; g.fillRect(0, rnd() * n, n, 1); }
  g.globalAlpha = 1;
  return c;
}

// ゴムのリブ(ペダル・タイヤ)
function ribs(base, line, n = 128) {
  const c = canvas(n), g = c.getContext("2d");
  g.fillStyle = base; g.fillRect(0, 0, n, n);
  g.fillStyle = line;
  for (let y = 0; y < n; y += 12) g.fillRect(0, y, n, 5);
  return c;
}

// 光沢のあるボディ(うすい水色のメタリック)
function paint(base, n = 128) {
  const c = canvas(n), g = c.getContext("2d");
  g.fillStyle = base; g.fillRect(0, 0, n, n);
  for (let i = 0; i < 700; i++) { g.globalAlpha = 0.1 + rnd() * 0.2; g.fillStyle = rnd() > 0.5 ? "#fff" : "#7fb3c4"; g.fillRect(rnd() * n, rnd() * n, 1, 1); }
  g.globalAlpha = 1;
  return c;
}

// 床マット(紙)の足あと
function footprints(n = 256) {
  const c = canvas(n), g = c.getContext("2d");
  g.fillStyle = "#eeeeea"; g.fillRect(0, 0, n, n);
  g.fillStyle = "#c9c9c4"; g.fillRect(8, 8, n - 16, n - 16);
  g.fillStyle = "#f4f4f0";
  const foot = (x, y, a) => { g.save(); g.translate(x, y); g.rotate(a); g.beginPath(); g.ellipse(0, 0, 22, 52, 0, 0, 7); g.fill(); g.beginPath(); g.ellipse(0, -66, 18, 18, 0, 0, 7); g.fill(); g.restore(); };
  foot(86, 130, -0.15); foot(170, 118, 0.15);
  return c;
}

export function makeMaterials(THREE) {
  const T = THREE;
  const tex = (cv, tile) => {
    const t = new T.CanvasTexture(cv);
    t.wrapS = t.wrapT = T.RepeatWrapping;
    t.anisotropy = 4;
    t.userData = { tile };
    return t;
  };
  const lam = (color, cv, tile, extra) => {
    const m = new T.MeshLambertMaterial(Object.assign({ color, map: cv ? tex(cv, tile) : null }, extra || {}));
    m.userData = { tile: tile || 1 };
    return m;
  };
  const phong = (color, cv, tile, shin, extra) => {
    const m = new T.MeshPhongMaterial(Object.assign({ color, map: cv ? tex(cv, tile) : null, shininess: shin, specular: 0x444444 }, extra || {}));
    m.userData = { tile: tile || 1 };
    return m;
  };
  return {
    plasticDk: lam(0xffffff, grain("#3b3e43", "#6a6e75", "#1c1d20"), 0.12),     // ダッシュ・ドアの黒っぽい樹脂
    plasticMid: lam(0xffffff, grain("#5a5e64", "#8a8e95", "#2c2e32"), 0.12),    // 少し明るい樹脂
    plasticBk: lam(0xffffff, grain("#232427", "#4a4c52", "#0b0b0c"), 0.1),
    headliner: lam(0xffffff, weave("#bdbcb4", "#d8d7cf", "#c4c3bb"), 0.1),     // 天井の布
    carpet: lam(0xffffff, grain("#34363b", "#585b62", "#17181a", 256, 9000, 1.5), 0.1),
    cargo: lam(0xffffff, grain("#45474c", "#6d7077", "#202125", 256, 9000, 1.5), 0.1),
    fabric: lam(0xffffff, weave("#2e3037", "#555a66", "#3a5aa6"), 0.09),        // シートの布(青い糸入り)
    fabricDk: lam(0xffffff, weave("#25272d", "#464a54", "#2c4580"), 0.09),
    stitch: lam(0xffffff, stitchCloth(), 0.12),                                  // ドアの肘かけ
    leatherBk: phong(0xffffff, leather("#1b1b1d", "#3a3a3e"), 0.07, 24),
    leatherBr: phong(0xffffff, leather("#5a3924", "#8a5c3a"), 0.08, 30),
    chrome: phong(0xdfe3e6, brushed("#d0d4d8"), 0.2, 90),
    silver: phong(0xb8bcc2, brushed("#a8acb2"), 0.2, 50),
    rubber: lam(0xffffff, ribs("#222326", "#35363a"), 0.06),
    red: new T.MeshLambertMaterial({ color: 0xc92b2b }),
    orange: new T.MeshBasicMaterial({ color: 0xff8a1f }),
    black: new T.MeshLambertMaterial({ color: 0x111112 }),
    white: new T.MeshLambertMaterial({ color: 0xf2f2ee }),
    mat: lam(0xffffff, footprints(), 0.5),
    paint: phong(0xffffff, paint("#9ed4de"), 0.4, 70),
    tire: lam(0xffffff, ribs("#161617", "#212123"), 0.05),
    glass: new T.MeshPhongMaterial({ color: 0xa8d8f0, transparent: true, opacity: 0.16, shininess: 100, specular: 0xffffff, depthWrite: false, side: T.DoubleSide }),
    floor: new T.MeshLambertMaterial({ color: 0xffffff }),
    green: new T.MeshLambertMaterial({ color: 0x4f9a4a }),
    cardboard: lam(0xc79a62, null, 1),
  };
}
