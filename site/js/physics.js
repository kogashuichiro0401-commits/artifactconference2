// 体の当たり判定と移動(画面には依存しない)。座標は「足元の中心」。
const HALF_W = 0.3;   // 横はば 0.6
const HEIGHT = 1.8;

export function collides(world, x, y, z) {
  const x0 = Math.floor(x - HALF_W), x1 = Math.floor(x + HALF_W);
  const z0 = Math.floor(z - HALF_W), z1 = Math.floor(z + HALF_W);
  const y0 = Math.floor(y), y1 = Math.floor(y + HEIGHT - 1e-6);
  for (let iy = y0; iy <= y1; iy++)
    for (let iz = z0; iz <= z1; iz++)
      for (let ix = x0; ix <= x1; ix++)
        if (world.solid(ix, iy, iz)) return true;
  return false;
}

// p の速度(vx,vy,vz)で dt 秒ぶん動かす。ブロックにぶつかったら止まる。
export function move(world, p, dt) {
  const maxV = Math.max(Math.abs(p.vx), Math.abs(p.vy), Math.abs(p.vz));
  const n = Math.max(1, Math.ceil((maxV * dt) / 0.2));   // 速くても、すり抜けないよう細かく刻む
  const s = dt / n;
  for (let i = 0; i < n; i++) {
    const nx = p.x + p.vx * s;
    if (!collides(world, nx, p.y, p.z)) p.x = nx; else p.vx = 0;

    const nz = p.z + p.vz * s;
    if (!collides(world, p.x, p.y, nz)) p.z = nz; else p.vz = 0;

    const ny = p.y + p.vy * s;
    if (!collides(world, p.x, ny, p.z)) {
      p.y = ny;
    } else {
      if (p.vy < 0) p.y = Math.floor(ny) + 1;                    // 地面に着く
      else p.y = Math.floor(ny + HEIGHT) - HEIGHT - 1e-4;        // 頭をぶつける
      p.vy = 0;
    }
  }
  p.onGround = p.vy <= 0 && collides(world, p.x, p.y - 0.02, p.z);
}
