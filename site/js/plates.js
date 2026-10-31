// プレート(うすい板)の形。1つのセルの中に、最大12種類を置ける。
//  0〜5 : ブロックの面にぴったりの板(+x -x +y -y +z -z)
//  6〜11: セルの中を斜めに横切る板。縁から反対の縁までの長方形(縦×対角線)。
//         ある方向から見ると、正方形の対角線に見える
export const T = 0.06;                 // 板の厚み
const S2 = Math.SQRT1_2;
const E = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];

export const PLATES = [];
export const PLATE_NAMES = ["+x面", "-x面", "+y面(上)", "-y面(下)", "+z面", "-z面", "斜め(x-y 縦)", "斜め(x-y 逆)", "斜め(y-z)", "斜め(y-z 逆)", "斜め(z-x)", "斜め(z-x 逆)"];

for (let i = 0; i < 6; i++) {
  const a = i >> 1, s = i & 1 ? -1 : 1;
  const half = [0.5, 0.5, 0.5]; half[a] = T / 2;
  const c = [0, 0, 0]; c[a] = s * (0.5 - T / 2);
  const n = [0, 0, 0]; n[a] = s;
  PLATES.push({ i, diag: false, c, axes: E, half, n, boxes: [[c[0] - half[0], c[1] - half[1], c[2] - half[2], c[0] + half[0], c[1] + half[1], c[2] + half[2]]] });
}
for (let a = 0; a < 3; a++) {
  for (let k = 0; k < 2; k++) {
    const b = (a + 1) % 3, c2 = (a + 2) % 3;
    const u = [0, 0, 0], v = [0, 0, 0];
    u[b] = S2; u[c2] = k === 0 ? S2 : -S2;          // 対角線の向き
    v[b] = S2; v[c2] = k === 0 ? -S2 : S2;          // 板の法線
    const w = E[a];
    const half = [Math.SQRT2 / 2, T / 2, 0.5];
    // 当たり判定は、対角線にそって4つの小さな箱で近似する
    const q = Math.SQRT2 / 8, boxes = [];
    for (const off of [-0.75, -0.25, 0.25, 0.75]) {
      const ctr = [u[0] * off * Math.SQRT2 / 2, u[1] * off * Math.SQRT2 / 2, u[2] * off * Math.SQRT2 / 2];
      const h = [0, 1, 2].map((m) => Math.abs(u[m]) * q + Math.abs(v[m]) * T / 2 + Math.abs(w[m]) * 0.5);
      boxes.push([ctr[0] - h[0], ctr[1] - h[1], ctr[2] - h[2], ctr[0] + h[0], ctr[1] + h[1], ctr[2] + h[2]]);
    }
    PLATES.push({ i: 6 + a * 2 + k, diag: true, c: [0, 0, 0], axes: [u, v, w], half, n: v, boxes });
  }
}
