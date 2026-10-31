// アイテムの一覧。増やすときは、ここに足す。icon は、小さなSVG(画面ではそのまま表示される)。
const svg = (body) => `<svg viewBox="0 0 48 48" width="34" height="34" fill="none" stroke-linejoin="round" stroke-linecap="round">${body}</svg>`;

// 白いブロック: 立方体(上・左・右の3面で、立体に見える)
const BLOCK_ICON = svg(`
  <polygon points="24,6 41,15 24,24 7,15" fill="#ffffff" stroke="#6b6f76" stroke-width="1.6"/>
  <polygon points="7,15 24,24 24,43 7,34" fill="#e1e3e7" stroke="#6b6f76" stroke-width="1.6"/>
  <polygon points="41,15 24,24 24,43 41,34" fill="#c4c7cd" stroke="#6b6f76" stroke-width="1.6"/>`);

// 白いプレート: ブロックの形(うすい点線)の中に、厚みのない板を斜めに置いたところ
const PLATE_ICON = svg(`
  <g stroke="#9aa0a8" stroke-width="1.1" stroke-dasharray="2.5 2.5">
    <polygon points="24,6 41,15 24,24 7,15"/><polygon points="7,15 24,24 24,43 7,34"/><polygon points="41,15 24,24 24,43 41,34"/>
  </g>
  <polygon points="7,15 24,6 41,34 24,43" fill="#ffffff" fill-opacity="0.96" stroke="#3d4148" stroke-width="1.8"/>
  <line x1="7" y1="15" x2="41" y2="34" stroke="#c9ccd2" stroke-width="1"/>`);

// 弓: しなった弓と弦、矢
const BOW_ICON = svg(`
  <path d="M14 6 C34 10 40 28 34 42" stroke="#7b4a21" stroke-width="3.4"/>
  <line x1="14" y1="6" x2="34" y2="42" stroke="#e9e9e9" stroke-width="1.2"/>
  <line x1="12" y1="36" x2="38" y2="10" stroke="#a0733c" stroke-width="2.2"/>
  <polygon points="40,8 33,10 38,15" fill="#8d9096" stroke="#55585d" stroke-width="1"/>
  <path d="M12 36 L8 33 M12 36 L9 40 M15 33 L11 30" stroke="#f2f2f2" stroke-width="1.6"/>`);

const BOOK_ICON = svg(`
  <path d="M8 10 H22 C23 10 24 11 24 12 V40 C24 39 23 38 22 38 H8 Z" fill="#7a4a8c" stroke="#43264f" stroke-width="1.6"/>
  <path d="M40 10 H26 C25 10 24 11 24 12 V40 C24 39 25 38 26 38 H40 Z" fill="#8f5aa3" stroke="#43264f" stroke-width="1.6"/>
  <path d="M12 16 H20 M12 21 H20 M28 16 H36 M28 21 H36" stroke="#e8d9ef" stroke-width="1.4"/>`);

export const ITEMS = {
  bow: { name: "弓(右クリックを長押しでためて、はなす)", icon: BOW_ICON },
  book: { name: "使い方の本", icon: BOOK_ICON },
  block: { name: "白いブロック", icon: BLOCK_ICON },
  plate: { name: "白いプレート", icon: PLATE_ICON },
};
