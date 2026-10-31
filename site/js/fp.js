// 一人称で見える手・ロケット・花火の火花。
export function createFirstPerson(T, camera, scene, controls) {
  const p = controls.p;
  const skin = new T.MeshBasicMaterial({ color: 0xc69c6d });
  const hand = new T.Mesh(new T.BoxGeometry(0.16, 0.55, 0.16), skin);
  hand.position.set(0.42, -0.42, -0.55); hand.rotation.x = 1.15;
  camera.add(hand);
  const handL = new T.Group();
  const arm = new T.Mesh(new T.BoxGeometry(0.16, 0.5, 0.16), skin); arm.position.y = -0.1; handL.add(arm);
  const rocket = new T.Mesh(new T.CylinderGeometry(0.05, 0.05, 0.5, 10), new T.MeshBasicMaterial({ color: 0xd8503a }));
  rocket.position.set(0, 0.35, 0); handL.add(rocket);
  const flame = new T.Mesh(new T.ConeGeometry(0.08, 0.3, 8), new T.MeshBasicMaterial({ color: 0xffa030 }));
  flame.position.set(0, 0.0, 0); flame.rotation.x = Math.PI; handL.add(flame);
  handL.visible = false; camera.add(handL);
  scene.add(camera);

  // 弓: しなった弓と、弦、つがえた矢。ためるほど弦が手前に引かれる
  const bow = new T.Group();
  const woodM = new T.MeshBasicMaterial({ color: 0x8a5a2b }), strM = new T.MeshBasicMaterial({ color: 0xf0f0f0 }), arrM = new T.MeshBasicMaterial({ color: 0xc9a468 }), tipM = new T.MeshBasicMaterial({ color: 0x8d9096 });
  bow.add(new T.Mesh(new T.TubeGeometry(new T.QuadraticBezierCurve3(new T.Vector3(0, 0.46, 0.0), new T.Vector3(0, 0, -0.34), new T.Vector3(0, -0.46, 0.0)), 14, 0.022, 6), woodM));
  const seg = (m) => { const g = new T.Mesh(new T.CylinderGeometry(1, 1, 1, 4), m); bow.add(g); return g; };
  const strA = seg(strM), strB = seg(strM);
  const place = (g, a, b, r) => { const d = b.clone().sub(a), L = d.length(); g.position.copy(a).addScaledVector(d, 0.5); g.scale.set(r, L, r); g.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), d.normalize()); };
  const arrow = new T.Mesh(new T.BoxGeometry(0.018, 0.018, 0.72), arrM); bow.add(arrow);
  const arrowHead = new T.Mesh(new T.ConeGeometry(0.035, 0.1, 6), tipM); arrowHead.rotation.x = -Math.PI / 2; bow.add(arrowHead);
  bow.position.set(0.32, -0.2, -0.6); bow.rotation.set(0.05, 0.12, 0.0);
  bow.scale.setScalar(0.72);
  bow.visible = false; camera.add(bow);
  const tipTop = new T.Vector3(0, 0.46, 0), tipBot = new T.Vector3(0, -0.46, 0), nock = new T.Vector3();

  const sparks = [], mats = [0xffb02e, 0xff6a1a, 0xcfcfcf].map((c) => new T.MeshBasicMaterial({ color: c, transparent: true }));
  const geo = new T.BoxGeometry(1, 1, 1);
  for (let i = 0; i < 70; i++) {
    const m = new T.Mesh(geo, mats[i % 3].clone()); m.visible = false; m.userData = { life: 0, max: 1, v: new T.Vector3() };
    scene.add(m); sparks.push(m);
  }
  let si = 0, acc = 0;

  return function update(dt, bs) {
    const first = p.view === 0;
    hand.visible = first;
    const showBow = first && bs && bs.held && !p.glide;
    bow.visible = !!showBow;
    if (showBow) {
      const c = bs.charge || 0;
      nock.set(0, 0, 0.02 + c * 0.34);
      place(strA, tipTop, nock, 0.006); place(strB, tipBot, nock, 0.006);
      arrow.visible = arrowHead.visible = c > 0;
      arrow.position.set(0, 0, nock.z - 0.36); arrowHead.position.set(0, 0, nock.z - 0.76);
      bow.position.set(0.32 - c * 0.1, -0.2 + c * 0.04, -0.6 + c * 0.05);
      hand.visible = false;
    }
    hand.rotation.x = 1.15 - Math.sin(p.t * 8) * Math.min(1, (controls.hs || 0) / 4.3) * 0.25;
    handL.visible = first && p.glide && controls.cfg.rks;
    if (handL.visible) {
      const lf = Math.sin(controls.rocketT * Math.PI), sh = p.boost > 0 ? (Math.random() - 0.5) * 0.012 : 0;
      handL.rotation.set(1.2 + lf * 0.5, -0.2, 0.12);
      handL.position.set(-0.42 + sh, -0.4 + lf * 0.06 + sh, -0.55 - lf * 0.12);
      flame.visible = p.boost > 0;
      if (flame.visible) flame.scale.set(0.8 + Math.random() * 0.5, 0.8 + Math.random() * 0.9, 0.8 + Math.random() * 0.5);
    }
    if (p.boost > 0 && p.glide) {
      acc += dt * 55;
      while (acc >= 1) {
        acc -= 1;
        const m = sparks[si++ % sparks.length], d = m.userData, L = controls.lookDir();
        const rx = Math.cos(p.yaw), rz = -Math.sin(p.yaw);
        m.position.set(p.x + L[0] * 0.6 - rx * 0.45, p.y + controls.eyeH() + L[1] * 0.6 - 0.35, p.z + L[2] * 0.6 - rz * 0.45);
        d.life = d.max = 0.5 + Math.random() * 0.5;
        d.v.set(-p.vx * 0.15 + (Math.random() - 0.5) * 2.5, -p.vy * 0.15 + (Math.random() - 0.5) * 2.5, -p.vz * 0.15 + (Math.random() - 0.5) * 2.5);
        m.visible = true;
      }
    }
    for (const m of sparks) {
      const d = m.userData;
      if (d.life <= 0) { m.visible = false; continue; }
      d.life -= dt; m.position.addScaledVector(d.v, dt);
      const f = Math.max(0, d.life / d.max);
      m.scale.setScalar(0.16 + 0.4 * (1 - f)); m.material.opacity = f * 0.9;
    }
  };
}
