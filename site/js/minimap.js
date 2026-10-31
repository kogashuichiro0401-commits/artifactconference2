// 左上の「いまどこ?」表示。64×64×64の世界を小さな立方体で描いて、自分の位置と向きを示す。
import { N, YMIN, YN } from "./shared.js";

export function createMinimap(canvas) {
  const W = 150, H = 138, dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = W * dpr; canvas.height = H * dpr;
  canvas.style.width = W + "px"; canvas.style.height = H + "px";
  const g = canvas.getContext("2d");
  const AZ = 0.62, EL = 0.5, S = 62, CX = W / 2, CY = H / 2 + 6;
  const ca = Math.cos(AZ), sa = Math.sin(AZ), ce = Math.cos(EL), se = Math.sin(EL);
  // u,v,w は -0.5〜0.5(x, y, z)
  const pr = (u, v, w) => {
    const x1 = u * ca + w * sa, z1 = -u * sa + w * ca;
    return [CX + x1 * S, CY - (v * ce - z1 * se) * S];
  };
  const line = (a, b) => { g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); };
  return function draw(p) {
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    const u = (p.x + 0.5) / N - 0.5, v = (p.y + 0.5 - YMIN) / YN - 0.5, w = (p.z + 0.5) / N - 0.5;
    // 床(底の面)と、16ブロックごとの区切り
    g.beginPath();
    g.moveTo(...pr(-0.5, -0.5, -0.5)); g.lineTo(...pr(0.5, -0.5, -0.5)); g.lineTo(...pr(0.5, -0.5, 0.5)); g.lineTo(...pr(-0.5, -0.5, 0.5)); g.closePath();
    g.fillStyle = "rgba(255,255,255,.28)"; g.fill();
    g.beginPath();
    for (let i = 1; i < 4; i++) { const t = -0.5 + i / 4; line(pr(t, -0.5, -0.5), pr(t, -0.5, 0.5)); line(pr(-0.5, -0.5, t), pr(0.5, -0.5, t)); }
    g.strokeStyle = "rgba(255,255,255,.35)"; g.lineWidth = 1; g.stroke();
    // 立方体のふち
    g.beginPath();
    for (const a of [-0.5, 0.5]) for (const b of [-0.5, 0.5]) {
      line(pr(-0.5, a, b), pr(0.5, a, b));
      line(pr(a, -0.5, b), pr(a, 0.5, b));
      line(pr(a, b, -0.5), pr(a, b, 0.5));
    }
    g.strokeStyle = "#5a96ff"; g.lineWidth = 1.2; g.stroke();
    // 北(-z)
    const n = pr(0, -0.5, -0.5);
    g.fillStyle = "#fff"; g.font = "bold 11px sans-serif"; g.textAlign = "center";
    g.fillText("北", n[0], n[1] - 4);
    // 自分: 床への影と、そこまでの縦の線
    const me = pr(u, v, w), sh = pr(u, -0.5, w);
    g.beginPath(); line(me, sh); g.strokeStyle = "rgba(255,255,255,.7)"; g.setLineDash([2, 2]); g.lineWidth = 1; g.stroke(); g.setLineDash([]);
    g.beginPath(); g.ellipse(sh[0], sh[1], 4, 2, 0, 0, 6.3); g.fillStyle = "rgba(0,0,0,.45)"; g.fill();
    // 向き(足もとから、見ている水平方向へ)
    const dx = -Math.sin(p.yaw) * 0.14, dz = -Math.cos(p.yaw) * 0.14, tip = pr(u + dx, v, w + dz);
    g.beginPath(); line(me, tip); g.strokeStyle = "#ffe14d"; g.lineWidth = 2; g.stroke();
    g.beginPath(); g.arc(me[0], me[1], 3.6, 0, 6.3); g.fillStyle = "#ff3b30"; g.fill(); g.strokeStyle = "#fff"; g.lineWidth = 1; g.stroke();
  };
}
