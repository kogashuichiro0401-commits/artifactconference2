// 左上の現在地。Googleマップの「青い点」のように、真上から見た地図に、自分の位置と向き(扇)を出す。
// 地図はいつも北が上。右上のコンパスは、ただの目印(固定)。
import { N, YMIN } from "./shared.js";

export function createMinimap(canvas) {
  const W = 136, H = 136, dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = W * dpr; canvas.height = H * dpr;
  canvas.style.width = W + "px"; canvas.style.height = H + "px";
  const g = canvas.getContext("2d");
  const M = 10, S = W - M * 2;   // 世界の四角の位置と大きさ
  const rr = (x, y, w, h, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };
  return function draw(p, t) {
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    rr(0, 0, W, H, 12); g.fillStyle = "rgba(232,236,240,.88)"; g.fill();
    // 世界(ふちは反対がわにつながっている)
    g.fillStyle = "#fff"; g.fillRect(M, M, S, S);
    g.strokeStyle = "rgba(0,0,0,.09)"; g.lineWidth = 1;
    g.beginPath();
    for (let i = 1; i < N / 16; i++) { const k = M + (S * i * 16) / N; g.moveTo(k, M); g.lineTo(k, M + S); g.moveTo(M, k); g.lineTo(M + S, k); }
    g.stroke();
    g.strokeStyle = "rgba(60,100,200,.55)"; g.strokeRect(M + 0.5, M + 0.5, S - 1, S - 1);
    // 現在地(青い点と、向きの扇)
    const px = M + ((p.x + 0.5) / N) * S, pz = M + ((p.z + 0.5) / N) * S;
    const a = Math.atan2(-Math.cos(p.yaw), -Math.sin(p.yaw));   // 画面での向き(x右、z下)
    g.save(); g.beginPath(); g.rect(2, 2, W - 4, H - 4); g.clip();
    const R = 30, gr = g.createRadialGradient(px, pz, 2, px, pz, R);
    gr.addColorStop(0, "rgba(66,133,244,.65)"); gr.addColorStop(1, "rgba(66,133,244,0)");
    g.beginPath(); g.moveTo(px, pz); g.arc(px, pz, R, a - 0.62, a + 0.62); g.closePath(); g.fillStyle = gr; g.fill();
    g.beginPath(); g.arc(px, pz, 9 + 1.5 * Math.sin((t || 0) * 3), 0, 6.3); g.fillStyle = "rgba(66,133,244,.22)"; g.fill();
    g.beginPath(); g.arc(px, pz, 5.6, 0, 6.3); g.fillStyle = "#fff"; g.shadowColor = "rgba(0,0,0,.35)"; g.shadowBlur = 3; g.fill(); g.shadowBlur = 0;
    g.beginPath(); g.arc(px, pz, 4, 0, 6.3); g.fillStyle = "#4285f4"; g.fill();
    g.restore();
    // コンパス(固定のアイコン)
    const cx = W - 17, cy = 17;
    g.beginPath(); g.arc(cx, cy, 11, 0, 6.3); g.fillStyle = "#fff"; g.shadowColor = "rgba(0,0,0,.3)"; g.shadowBlur = 3; g.fill(); g.shadowBlur = 0;
    g.beginPath(); g.moveTo(cx, cy - 8); g.lineTo(cx + 3.4, cy + 1); g.lineTo(cx - 3.4, cy + 1); g.closePath(); g.fillStyle = "#e5392b"; g.fill();
    g.beginPath(); g.moveTo(cx, cy + 8); g.lineTo(cx + 3.4, cy + 1); g.lineTo(cx - 3.4, cy + 1); g.closePath(); g.fillStyle = "#9aa0a6"; g.fill();
    g.fillStyle = "#555"; g.font = "bold 9px sans-serif"; g.textAlign = "center"; g.fillText("北", cx, cy + 20);
    // 高さ
    g.fillStyle = "#666"; g.font = "11px sans-serif"; g.textAlign = "left"; g.fillText("高さ " + Math.floor(p.y + 0.5 + 1e-6), 8, H - 3);
  };
}
