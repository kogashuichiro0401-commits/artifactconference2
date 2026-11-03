// サーバーとブラウザの両方が使う、世界の決まり。
// 世界は 49×49(横) × 49(縦) のループ。座標は 0〜48。ブロックの中心が整数の座標。足の位置がプレイヤーの座標。
export const N = 49;          // 横(x, z)のブロック数。はしは反対側につながる
export const YMIN = 0;        // いちばん下のブロックの高さ(床がここ。世界の底)
export const YN = 49;         // 縦のブロック数(YMIN 〜 YMIN+YN-1)。上下もつながる
export const BLOCK = 4096;    // セルの値: ブロックがある
export const ROPE = 8192;     // セルの値: 縄ブロック(セルの中央に、下から上まで細い縄が通る。通りぬけられて、触れてSpaceでのぼれる)
// セルの値: BLOCK ならブロック。そうでなければ下位12ビットが「プレート」の有無(0〜5=面、6〜11=斜め)
export const NAME_MAX = 16;
export const REACH = 12;      // 手の届く距離

export const mod = (a, n) => ((a % n) + n) % n;
// はじめは、x・y・z のどれかが 0 のセルにブロック(壁1枚の箱)。世界はループするので、これで箱の6面がふさがる。中の広さは 48×48×48。床の上に立つと足は 0.5(ブロック座標は1)
export const defaultCell = (x, y, z) => (x === 0 || y === 0 || z === 0 ? BLOCK : 0);
export const inRangeY = (y) => y >= YMIN && y < YMIN + YN;
export const keyOf = (x, y, z) => `${x},${y},${z}`;
// a から b への、ループを考えた最短の差(-n/2 〜 n/2)
export const wrapDelta = (a, b, n) => { let d = mod(b - a, n); if (d > n / 2) d -= n; return d; };
// 太陽の向き(世界の「西」=-x の、すこし上。夕日)。光の来る方向のベクトル
export const SUN = (() => { const l = [-0.9, 0.3, 0.1], m = Math.hypot(...l); return l.map((v) => v / m); })();
