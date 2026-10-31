// サーバーとブラウザの両方が使う、世界の決まり。
// 世界は 48×48(横) × 48(縦) のループ。ブロックの中心が整数の座標。足の位置がプレイヤーの座標。
export const N = 48;          // 横(x, z)のブロック数。はしは反対側につながる
export const YMIN = 1;        // いちばん下のブロックの高さ(床がここ。世界の底)
export const YN = 48;         // 縦のブロック数(YMIN 〜 YMIN+YN-1)。上下もつながる
export const BLOCK = 4096;    // セルの値: ブロックがある
// セルの値: BLOCK ならブロック。そうでなければ下位12ビットが「プレート」の有無(0〜5=面、6〜11=斜め)
export const NAME_MAX = 16;
export const REACH = 6;       // 手の届く距離

export const mod = (a, n) => ((a % n) + n) % n;
export const defaultCell = (x, y, z) => (y === 1 ? BLOCK : 0);   // はじめは、y=1 に白い床(ブロック)だけ。立つと足は 1.5(ブロック座標は2)
export const inRangeY = (y) => y >= YMIN && y < YMIN + YN;
export const keyOf = (x, y, z) => `${x},${y},${z}`;
// a から b への、ループを考えた最短の差(-n/2 〜 n/2)
export const wrapDelta = (a, b, n) => { let d = mod(b - a, n); if (d > n / 2) d -= n; return d; };
// 太陽の向き(世界の「西」=-x の、すこし上。夕日)。光の来る方向のベクトル
export const SUN = (() => { const l = [-0.84, 0.5, 0.1], m = Math.hypot(...l); return l.map((v) => v / m); })();
