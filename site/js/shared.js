// サーバーとブラウザの両方が使う、世界の決まり。
// 世界は 64×64(横) × 64(縦) のループ。ブロックの中心が整数の座標。足の位置がプレイヤーの座標。
export const N = 64;          // 横(x, z)のブロック数。はしは反対側につながる
export const YMIN = -16;      // いちばん下のブロックの高さ
export const YN = 64;         // 縦のブロック数(YMIN 〜 YMIN+YN-1)。上下もつながる
export const BLOCK = 4096;    // セルの値: ブロックがある
// セルの値: BLOCK ならブロック。そうでなければ下位12ビットが「プレート」の有無(0〜5=面、6〜11=斜め)
export const NAME_MAX = 16;
export const REACH = 6;       // 手の届く距離

export const mod = (a, n) => ((a % n) + n) % n;
export const defaultCell = (x, y, z) => (y === 0 ? BLOCK : 0);   // はじめは、y=0 に白い床(ブロック)だけ
export const inRangeY = (y) => y >= YMIN && y < YMIN + YN;
export const keyOf = (x, y, z) => `${x},${y},${z}`;
// a から b への、ループを考えた最短の差(-n/2 〜 n/2)
export const wrapDelta = (a, b, n) => { let d = mod(b - a, n); if (d > n / 2) d -= n; return d; };
