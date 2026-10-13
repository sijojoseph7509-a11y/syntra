/* ==========================================================================
   SYNTRA — things that move around you (real 3D, so they sit at the right
   depth in the headset and never swim with your head)
     petals / leaves  tumble down on the wind and catch the light
     snow             soft flakes drifting down
     fireflies        slow glowing points that blink (night)
     shooting stars   now and then, across a night sky
     motes            fine dust / pollen in the sunlight
   ========================================================================== */
import * as THREE from 'three';

const rand = (a, b) => a + Math.random() * (b - a);
const pick = a => a[(Math.random() * a.length) | 0];

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

/* ───────── textures (drawn light, then tinted per leaf) ───────── */

const leafTex = canvasTex(256, 256, (g, W) => {
  const c = W / 2;
  g.translate(c, c); g.rotate(-Math.PI / 4);
  const L = 112, Wd = 50;
  const shape = () => { g.beginPath(); g.moveTo(0, -L); g.bezierCurveTo(Wd, -L * .55, Wd * 1.05, L * .35, 0, L); g.bezierCurveTo(-Wd * 1.05, L * .35, -Wd, -L * .55, 0, -L); };
  const fill = g.createLinearGradient(-Wd, 0, Wd, 0);
  fill.addColorStop(0, '#d9d9d9'); fill.addColorStop(.5, '#ffffff'); fill.addColorStop(1, '#c8c8c8');
  shape(); g.fillStyle = fill; g.fill();
  g.save(); shape(); g.clip();
  for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * .05})`; g.fillRect(rand(-Wd, Wd), rand(-L, L), 2, 2); }
  g.strokeStyle = 'rgba(70,60,40,.45)'; g.lineWidth = 3;                   // midrib
  g.beginPath(); g.moveTo(0, -L + 6); g.lineTo(0, L + 18); g.stroke();
  g.lineWidth = 1.4; g.strokeStyle = 'rgba(70,60,40,.28)';                  // side veins
  for (let y = -L + 26; y < L - 12; y += 17) for (const s of [-1, 1]) { g.beginPath(); g.moveTo(0, y); g.quadraticCurveTo(s * Wd * .45, y - 6, s * Wd * .9, y - 26); g.stroke(); }
  const edge = g.createRadialGradient(0, 0, Wd * .5, 0, 0, L); edge.addColorStop(0, 'rgba(0,0,0,0)'); edge.addColorStop(1, 'rgba(40,30,10,.3)');
  g.fillStyle = edge; g.fillRect(-W, -W, W * 2, W * 2);
  g.restore();
});

const petalTex = canvasTex(256, 256, (g, W) => {
  const c = W / 2;
  g.translate(c, c + 10);
  const shape = () => { g.beginPath(); g.moveTo(0, 100); g.bezierCurveTo(-110, 20, -90, -110, -18, -100); g.quadraticCurveTo(0, -84, 18, -100); g.bezierCurveTo(90, -110, 110, 20, 0, 100); };
  const fill = g.createRadialGradient(0, 70, 5, 0, -20, 140);
  fill.addColorStop(0, '#fff6e8'); fill.addColorStop(.35, '#ffffff'); fill.addColorStop(1, '#e4e4e4');
  shape(); g.fillStyle = fill; g.fill();
  g.save(); shape(); g.clip(); g.strokeStyle = 'rgba(0,0,0,.05)'; g.lineWidth = 1.5;
  for (let a = -1; a <= 1; a += .14) { g.beginPath(); g.moveTo(0, 96); g.quadraticCurveTo(a * 60, 0, a * 90, -100); g.stroke(); }
  g.restore();
});

const softDot = canvasTex(64, 64, (g) => {
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(.35, 'rgba(255,255,255,.8)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
});

/* ───────── tumbling petals / leaves ───────── */

export function tumbling({ count = 120, kind = 'leaf', colors = ['#7fa04a'], size = [.05, .09], area = 7, height = 4.5, fall = [.25, .55], wind = [.25, .05] }) {
  const geo = new THREE.PlaneGeometry(1, 1);
  const mat = new THREE.MeshStandardMaterial({ map: kind === 'petal' ? petalTex : leafTex, alphaTest: .5, side: THREE.DoubleSide, roughness: .75, metalness: 0 });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.frustumCulled = false;
  const P = [], M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), V = new THREE.Vector3(), axis = new THREE.Vector3();
  const spawn = (p, anywhere) => {
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * area;
    p.x = Math.cos(a) * r - wind[0] * 3; p.z = Math.sin(a) * r - wind[1] * 3;
    p.y = anywhere ? rand(.1, height) : height + rand(0, 1);
    p.fall = rand(...fall); p.phase = Math.random() * 100; p.spin = rand(1.2, 3.2) * (Math.random() < .5 ? -1 : 1);
    p.axis = new THREE.Vector3(rand(-1, 1), rand(-.3, .3), rand(-1, 1)).normalize(); p.angle = Math.random() * 6.28;
    p.s = rand(...size);
  };
  for (let i = 0; i < count; i++) {
    const p = {}; spawn(p, true); P.push(p);
    mesh.setColorAt(i, new THREE.Color(pick(colors)).multiplyScalar(rand(.85, 1.1)));
  }
  mesh.userData.update = (t, dt) => {
    for (let i = 0; i < count; i++) {
      const p = P[i];
      p.y -= p.fall * dt * (.75 + .25 * Math.sin(t * 1.3 + p.phase));
      p.x += (wind[0] + Math.sin(t * .6 + p.phase) * .18) * dt;
      p.z += (wind[1] + Math.cos(t * .5 + p.phase * 1.3) * .18) * dt;
      p.angle += p.spin * dt;
      if (p.y < .02 || Math.hypot(p.x, p.z) > area + 4) spawn(p, false);
      axis.copy(p.axis); Q.setFromAxisAngle(axis, p.angle);
      S.setScalar(p.s); V.set(p.x, p.y, p.z); M.compose(V, Q, S); mesh.setMatrixAt(i, M);
    }
    mesh.instanceMatrix.needsUpdate = true;
  };
  return mesh;
}

/* ───────── snow ───────── */

export function snowfall({ count = 900, area = 9, height = 5 } = {}) {
  const g = new THREE.BufferGeometry(), pos = new Float32Array(count * 3), seed = new Float32Array(count);
  for (let i = 0; i < count; i++) { pos[i * 3] = rand(-area, area); pos[i * 3 + 1] = rand(0, height); pos[i * 3 + 2] = rand(-area, area); seed[i] = Math.random() * 100; }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(g, new THREE.PointsMaterial({ size: .03, map: softDot, color: 0xffffff, transparent: true, opacity: .95, depthWrite: false }));
  pts.frustumCulled = false;
  pts.userData.update = (t, dt) => {
    for (let i = 0; i < count; i++) {
      const s = seed[i];
      pos[i * 3] += (Math.sin(t * .7 + s) * .12 + .05) * dt;
      pos[i * 3 + 1] -= (.35 + (s % 1) * .35) * dt;
      pos[i * 3 + 2] += Math.cos(t * .55 + s * 1.7) * .12 * dt;
      if (pos[i * 3 + 1] < 0) { pos[i * 3 + 1] = height; pos[i * 3] = rand(-area, area); pos[i * 3 + 2] = rand(-area, area); }
    }
    g.attributes.position.needsUpdate = true;
  };
  return pts;
}

/* ───────── fireflies (night) ───────── */

export function fireflies({ count = 50, area = 7, color = '#ffe9a0' } = {}) {
  const g = new THREE.BufferGeometry(), pos = new Float32Array(count * 3), col = new Float32Array(count * 3);
  const F = Array.from({ length: count }, () => {
    const a = Math.random() * 6.28, r = rand(1.6, area);
    return { x: Math.cos(a) * r, y: rand(.3, 2.4), z: Math.sin(a) * r, ph: Math.random() * 100, sp: rand(.1, .25), blink: rand(.3, .9) };
  });
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const base = new THREE.Color(color);
  const pts = new THREE.Points(g, new THREE.PointsMaterial({ size: .07, map: softDot, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  pts.frustumCulled = false;
  pts.userData.update = (t) => {
    F.forEach((f, i) => {
      pos[i * 3] = f.x + Math.sin(t * f.sp + f.ph) * .6;
      pos[i * 3 + 1] = f.y + Math.sin(t * f.sp * 1.7 + f.ph * 2) * .25;
      pos[i * 3 + 2] = f.z + Math.cos(t * f.sp * .8 + f.ph) * .6;
      const k = Math.max(0, Math.sin(t * f.blink + f.ph)) ** 3;
      col[i * 3] = base.r * k; col[i * 3 + 1] = base.g * k; col[i * 3 + 2] = base.b * k;
    });
    g.attributes.position.needsUpdate = true; g.attributes.color.needsUpdate = true;
  };
  return pts;
}

/* ───────── shooting stars ───────── */

const streakTex = canvasTex(256, 16, (g, W, H) => {
  const gr = g.createLinearGradient(0, 0, W, 0);
  gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(.85, 'rgba(220,235,255,.7)'); gr.addColorStop(1, 'rgba(255,255,255,1)');
  g.fillStyle = gr; g.fillRect(0, H * .3, W, H * .4);
});

export function shootingStars() {
  const group = new THREE.Group();
  const holder = new THREE.Group(); group.add(holder);
  const streak = new THREE.Mesh(new THREE.PlaneGeometry(5, .06), new THREE.MeshBasicMaterial({ map: streakTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  holder.add(streak); streak.visible = false;
  let next = rand(3, 7), life = 0, dir = 0;
  group.userData.update = (t, dt) => {
    if (!streak.visible) {
      next -= dt; if (next > 0) return;
      const az = rand(-2.4, 2.4), el = rand(.55, 1.05), R = 45;
      holder.position.set(Math.sin(az) * Math.cos(el) * R, 1.6 + Math.sin(el) * R, -Math.cos(az) * Math.cos(el) * R);
      holder.lookAt(0, 1.6, 0);
      dir = rand(-.5, -.2) + (Math.random() < .5 ? 0 : Math.PI);
      streak.rotation.z = dir; life = 0; streak.visible = true;
    }
    life += dt;
    const k = life / .9;
    streak.position.set(Math.cos(dir) * k * 9, Math.sin(dir) * k * 9, 0);
    streak.material.opacity = Math.sin(Math.min(1, k) * Math.PI);
    if (k >= 1) { streak.visible = false; next = rand(6, 14); }
  };
  return group;
}

/* ───────── motes / pollen in the light ───────── */

export function motes({ count = 160, color = 0xfff0c8, area = 6, height = 3.2, size = .022, rise = .03 } = {}) {
  const g = new THREE.BufferGeometry(), pos = new Float32Array(count * 3), seed = new Float32Array(count);
  for (let i = 0; i < count; i++) { pos[i * 3] = rand(-area, area); pos[i * 3 + 1] = rand(.2, height); pos[i * 3 + 2] = rand(-area, area); seed[i] = Math.random() * 100; }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(g, new THREE.PointsMaterial({ size, map: softDot, color, transparent: true, opacity: .7, depthWrite: false, blending: THREE.AdditiveBlending }));
  pts.frustumCulled = false;
  pts.userData.update = (t, dt) => {
    for (let i = 0; i < count; i++) {
      const s = seed[i];
      pos[i * 3] += Math.sin(t * .3 + s) * .05 * dt;
      pos[i * 3 + 1] += rise * dt * (.5 + (s % 1));
      pos[i * 3 + 2] += Math.cos(t * .25 + s * 1.7) * .05 * dt;
      if (pos[i * 3 + 1] > height) pos[i * 3 + 1] = .2;
      if (pos[i * 3 + 1] < .1) pos[i * 3 + 1] = height;
    }
    g.attributes.position.needsUpdate = true;
  };
  return pts;
}

/* ───────── soft god-rays through the trees ───────── */

export function sunRays({ count = 6, color = 0xffe7b8, from = [-.55, .32, -.77] } = {}) {
  const tex = canvasTex(32, 256, (g, W, H) => {
    const gr = g.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(.3, 'rgba(255,255,255,.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    const side = g.createLinearGradient(0, 0, W, 0);
    side.addColorStop(0, 'rgba(0,0,0,1)'); side.addColorStop(.5, 'rgba(0,0,0,0)'); side.addColorStop(1, 'rgba(0,0,0,1)');
    g.globalCompositeOperation = 'destination-out'; g.fillStyle = side; g.fillRect(0, 0, W, H);
  });
  tex.colorSpace = THREE.NoColorSpace;
  const group = new THREE.Group(), d = new THREE.Vector3(...from).normalize();
  for (let i = 0; i < count; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(rand(.6, 1.4), 14),
      new THREE.MeshBasicMaterial({ map: tex, color, transparent: true, opacity: .1, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
    const a = rand(-1.2, 1.2) + Math.PI, r = rand(3, 9);
    m.position.set(Math.sin(a) * r, 5, Math.cos(a) * r);
    m.lookAt(m.position.clone().add(d));                        // lean the ray along the sunlight
    m.rotateX(Math.PI / 2);
    m.userData.phase = Math.random() * 10;
    group.add(m);
  }
  group.userData.update = t => group.children.forEach(m => { m.material.opacity = .06 + .05 * Math.sin(t * .25 + m.userData.phase); });
  return group;
}
