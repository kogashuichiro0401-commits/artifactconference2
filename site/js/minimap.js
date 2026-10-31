// 左上の「いまどこ?」表示。世界の立方体を小さく描いて、自分の位置と向きを示す。
// 画面の「右上」が北。コンパスも、いつも右下に出す。
import { N, YMIN, YN } from "./shared.js";

export function createMinimap(canvas) {
  const W = 176, H = 150, dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = W * dpr; canvas.height = H * dpr;
  canvas.style.width = W + "px"; canvas.style.height = H + "px";
  const g = canvas.getContext("2d");
  const AZ = -0.7854, EL = 0.52, S = 58, CX = 76, CY = H / 2 + 8;
  const ca = Math.cos(AZ), sa = Math.sin(AZ), ce = Math.cos(EL), se = Math.sin(EL);
  // u,v,w は -0.5〜0.5(x, y, z)。北=-z が右上にくる
  const pr = (u, v, w) => {
    const x1 = u * ca + w * sa, z1 = -u * sa + w * ca;
    return [CX + x1 * S, CY - (v * ce - z1 * se) * S];
  };
  const line = (a, b) => { g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); };
  const arrow = (from, to, w, color) => {
    const dx = to[0] - from[0], dy = to[1] - from[1], L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
    const hx = to[0] - ux * w * 2.2, hy = to[1] - uy * w * 2.2;
    g.beginPath(); g.moveTo(from[0], from[1]); g.lineTo(hx, hy);
    g.lineWidth = w + 2.5; g.strokeStyle = "#000"; g.lineCap = "round"; g.stroke();
    g.beginPath(); g.moveTo(to[0], to[1]); g.lineTo(hx - uy * w * 1.6, hy + ux * w * 1.6); g.lineTo(hx + uy * w * 1.6, hy - ux * w * 1.6); g.closePath();
    g.fillStyle = "#000"; g.fill(); g.lineWidth = 2; g.strokeStyle = "#000"; g.stroke();
    g.beginPath(); g.moveTo(from[0], from[1]); g.lineTo(hx, hy); g.lineWidth = w; g.strokeStyle = color; g.stroke();
    g.beginPath(); g.moveTo(to[0], to[1]); g.lineTo(hx - uy * w * 1.4, hy + ux * w * 1.4); g.lineTo(hx + uy * w * 1.4, hy - ux * w * 1.4); g.closePath(); g.fillStyle = color; g.fill();
  };
  return function draw(p) {
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    const u = (p.x + 0.5) / N - 0.5, v = (p.y + 0.5 - YMIN) / YN - 0.5, w = (p.z + 0.5) / N - 0.5;
    // 床(底の面)と、16ブロックごとの区切り
    g.beginPath();
    g.moveTo(...pr(-0.5, -0.5, -0.5)); g.lineTo(...pr(0.5, -0.5, -0.5)); g.lineTo(...pr(0.5, -0.5, 0.5)); g.lineTo(...pr(-0.5, -0.5, 0.5)); g.closePath();
    g.fillStyle = "rgba(255,255,255,.28)"; g.fill();
    g.beginPath();
    const K = N / 16;
    for (let i = 1; i < K; i++) { const t = -0.5 + i / K; line(pr(t, -0.5, -0.5), pr(t, -0.5, 0.5)); line(pr(-0.5, -0.5, t), pr(0.5, -0.5, t)); }
    g.strokeStyle = "rgba(255,255,255,.35)"; g.lineWidth = 1; g.stroke();
    // 立方体のふち
    g.beginPath();
    for (const a of [-0.5, 0.5]) for (const b of [-0.5, 0.5]) {
      line(pr(-0.5, a, b), pr(0.5, a, b));
      line(pr(a, -0.5, b), pr(a, 0.5, b));
      line(pr(a, b, -0.5), pr(a, b, 0.5));
    }
    g.strokeStyle = "#5a96ff"; g.lineWidth = 1.2; g.stroke();
    // 西にある太陽
    const sunP = pr(-0.5, 0.05, 0), sx = sunP[0] - 16, sy = sunP[1] - 6;
    const gr = g.createRadialGradient(sx, sy, 1, sx, sy, 11);
    gr.addColorStop(0, "#fff7c0"); gr.addColorStop(0.5, "#ffb84a"); gr.addColorStop(1, "rgba(255,140,60,0)");
    g.fillStyle = gr; g.beginPath(); g.arc(sx, sy, 11, 0, 6.3); g.fill();
    // 自分: 床への影、高さの点線
    const me = pr(u, v, w), sh = pr(u, -0.5, w);
    g.beginPath(); line(me, sh); g.strokeStyle = "rgba(255,255,255,.75)"; g.setLineDash([2, 2]); g.lineWidth = 1; g.stroke(); g.setLineDash([]);
    // 視野(床にうつした扇)
    const fx = (a) => -Math.sin(p.yaw + a) * 0.3, fz = (a) => -Math.cos(p.yaw + a) * 0.3;
    g.beginPath(); g.moveTo(sh[0], sh[1]); g.lineTo(...pr(u + fx(0.6), -0.5, w + fz(0.6))); g.lineTo(...pr(u + fx(-0.6), -0.5, w + fz(-0.6))); g.closePath();
    g.fillStyle = "rgba(255,225,77,.35)"; g.fill();
    g.beginPath(); g.ellipse(sh[0], sh[1], 4, 2, 0, 0, 6.3); g.fillStyle = "rgba(0,0,0,.5)"; g.fill();
    // 向きの矢印(太く、目立つ色で)
    arrow(me, pr(u + -Math.sin(p.yaw) * 0.22, v, w + -Math.cos(p.yaw) * 0.22), 3, "#ffe14d");
    g.beginPath(); g.arc(me[0], me[1], 4.2, 0, 6.3); g.fillStyle = "#ff3b30"; g.fill(); g.strokeStyle = "#fff"; g.lineWidth = 1.4; g.stroke();
    // コンパス(右下)。右上が北
    const cx = W - 30, cy = H - 30, R = 22;
    g.beginPath(); g.arc(cx, cy, R + 4, 0, 6.3); g.fillStyle = "rgba(0,0,0,.45)"; g.fill();
    g.strokeStyle = "rgba(255,255,255,.7)"; g.lineWidth = 1; g.stroke();
    g.font = "bold 11px sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
    const q = Math.SQRT1_2;
    for (const [t, ex, ey, col] of [["北", q, -q, "#ff6a5a"], ["東", q, q, "#fff"], ["南", -q, q, "#fff"], ["西", -q, -q, "#fff"]]) { g.fillStyle = col; g.fillText(t, cx + ex * (R - 6), cy + ey * (R - 6)); }
    // 針(向き): 北=右上、東=右下
    const sxv = -Math.sin(p.yaw), szv = -Math.cos(p.yaw);   // ワールドでの向き(x, z)
    // 画面上: 北(-z)→(q,-q)、東(+x)→(q,q)  よって (x,z) → (q*x - q*(-z)...) を直接計算
    const ax = (sxv * q) + (-szv * q), ay = (sxv * q) + (szv * q);
    g.beginPath(); g.moveTo(cx - ax * 5, cy - ay * 5); g.lineTo(cx + ax * 11, cy + ay * 11); g.lineWidth = 3; g.strokeStyle = "#ffe14d"; g.lineCap = "round"; g.stroke();
    g.beginPath(); g.arc(cx, cy, 2.4, 0, 6.3); g.fillStyle = "#ff3b30"; g.fill();
  };
}
