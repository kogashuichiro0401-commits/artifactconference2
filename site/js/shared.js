// サーバーとブラウザの両方が使う、世界の決まり。
// 世界は横にどこまでも広がる(はしは無い。ループもしない)。ブロックの中心が整数の座標。足の位置がプレイヤーの座標。
// 地面は無い。はじまりの場所は、空中にうかぶ 5×5 の板。
export const YMIN = -256;     // ブロックを置ける、いちばん下の高さ
export const YN = 512;        // ブロックを置ける高さの数(YMIN 〜 YMIN+YN-1)
export const XZ_MAX = 100000; // ブロックを置ける横の広さ(-XZ_MAX 〜 XZ_MAX)
export const BLOCK = 4096;    // セルの値: ブロックがある
export const ROPE = 8192;     // セルの値: 縄ブロック(セルの中央に、下から上まで細い縄が通る。通りぬけられて、触れてSpaceでのぼれる)
// セルの値: BLOCK ならブロック。そうでなければ下位12ビットが「プレート」の有無(0〜5=面、6〜11=斜め)
export const NAME_MAX = 16;
export const REACH = 12;      // 手の届く距離
// はじまりの場所: 5×5 の板(y=0 のブロック、x・z は -2〜2)の真ん中。北(-z)が投稿ホール、南(+z)がつぶやきホール
export const SPAWN = { x: 0, y: 0.5, z: 0 };
export const DEFAULT_BLOCKS = [];
for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) DEFAULT_BLOCKS.push([x, 0, z]);
export const defaultCell = (x, y, z) => (y === 0 && x >= -2 && x <= 2 && z >= -2 && z <= 2 ? BLOCK : 0);

export const mod = (a, n) => ((a % n) + n) % n;
export const inRangeY = (y) => y >= YMIN && y < YMIN + YN;
export const inWorld = (x, y, z) => inRangeY(y) && Math.abs(x) <= XZ_MAX && Math.abs(z) <= XZ_MAX;
export const keyOf = (x, y, z) => `${x},${y},${z}`;
// 太陽の向き(世界の「西」=-x の、すこし上。夕日)。光の来る方向のベクトル
export const SUN = (() => { const l = [-0.9, 0.3, 0.1], m = Math.hypot(...l); return l.map((v) => v / m); })();
