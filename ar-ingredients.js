/* ==========================================================================
   SYNTRA — the ingredients as recognisable 3D objects (built in code, no
   model files): a lemon with a cut slice, a rose of real petals, vanilla
   pods, cinnamon sticks, a log of cedar, amber crystals …

   ingredient(name) → a THREE.Group about 1 unit across, centred on (0,0,0).
   Around 20 families (citrus, pome fruit, berries, 6 kinds of flower,
   leaves, woods, roots, pods, beans, spices, resins, musks, sweets,
   leather, water) are tuned per ingredient by colour and shape.
   Anything unknown becomes a glowing essence with its photo inside.
   ========================================================================== */
import * as THREE from 'three';

const rand = (a, b) => a + Math.random() * (b - a);
const TAU = Math.PI * 2;
const col = c => new THREE.Color(c);

/* ───────── small helpers ───────── */

function tex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color: col(color), roughness: .55, metalness: 0, envMapIntensity: 1, ...o });
const mesh = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); return m; };

// wobble a geometry's vertices (organic shapes: beans, resin, stones)
function wobble(geo, amp = .12, freq = 3, seed = Math.random() * 10) {
  const p = geo.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = Math.sin(v.x * freq + seed) * Math.sin(v.y * freq * 1.3 + seed * 2) * Math.sin(v.z * freq * .9 + seed * 3)
            + .5 * Math.sin(v.x * freq * 2.7 + v.z * freq * 1.9 + seed);
    v.multiplyScalar(1 + n * amp); p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals(); return geo;
}

// a petal / leaf: a curved, tapered sheet. len along +y, cup bends the sides up, curl bends the tip back
function sheet({ len = 1, wid = .5, cup = .2, curl = .2, tip = 1, seg = 12, serrate = 0 }) {
  const g = new THREE.PlaneGeometry(1, 1, seg, seg), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i), v = p.getY(i) + .5;                          // u ∈ [-.5,.5], v ∈ [0,1]
    let w = Math.pow(Math.sin(Math.PI * Math.min(1, v * (1 + (tip - 1) * .5))), .8) * wid;
    if (serrate) w *= 1 + serrate * Math.max(0, Math.sin(v * 40));
    const x = u * w * 2, y = v * len;
    const z = cup * (x * x) / Math.max(.05, wid) + curl * v * v * len;
    p.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals(); return g;
}

/* ───────── textures ───────── */

const TEX = {};
function peel(color, dots = '#000') {
  const k = 'peel' + color;
  return TEX[k] ??= tex(256, 256, (g, W) => {
    g.fillStyle = color; g.fillRect(0, 0, W, W);
    for (let i = 0; i < 2600; i++) { g.fillStyle = Math.random() < .5 ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.09)'; g.beginPath(); g.arc(rand(0, W), rand(0, W), rand(.6, 2), 0, TAU); g.fill(); }
  });
}
function bumpNoise() {
  return TEX.bump ??= tex(256, 256, (g, W) => {
    g.fillStyle = '#808080'; g.fillRect(0, 0, W, W);
    for (let i = 0; i < 3000; i++) { g.fillStyle = Math.random() < .5 ? '#6a6a6a' : '#9a9a9a'; g.beginPath(); g.arc(rand(0, W), rand(0, W), rand(.8, 2.4), 0, TAU); g.fill(); }
  }, false);
}
function citrusFace(flesh, rind) {
  const k = 'cf' + flesh + rind;
  return TEX[k] ??= tex(256, 256, (g, W) => {
    const c = W / 2;
    g.fillStyle = rind; g.beginPath(); g.arc(c, c, c, 0, TAU); g.fill();
    g.fillStyle = '#fbf6e6'; g.beginPath(); g.arc(c, c, c * .9, 0, TAU); g.fill();
    const n = 10;
    for (let i = 0; i < n; i++) {                                           // segments
      const a0 = i / n * TAU + .03, a1 = (i + 1) / n * TAU - .03;
      g.fillStyle = flesh; g.beginPath(); g.moveTo(c + Math.cos((a0 + a1) / 2) * 8, c + Math.sin((a0 + a1) / 2) * 8);
      g.arc(c, c, c * .82, a0, a1); g.closePath(); g.fill();
      for (let j = 0; j < 26; j++) {                                        // juicy vesicles
        const a = rand(a0, a1), r = rand(14, c * .78);
        g.fillStyle = 'rgba(255,255,255,.22)'; g.beginPath(); g.ellipse(c + Math.cos(a) * r, c + Math.sin(a) * r, 5, 2, a, 0, TAU); g.fill();
      }
    }
    g.fillStyle = '#fbf6e6'; g.beginPath(); g.arc(c, c, 7, 0, TAU); g.fill();
  });
}
function leafTex(color) {
  const k = 'leaf' + color;
  return TEX[k] ??= tex(128, 256, (g, W, H) => {
    const gr = g.createLinearGradient(0, 0, W, 0);
    gr.addColorStop(0, color); gr.addColorStop(.5, new THREE.Color(color).offsetHSL(0, 0, .08).getStyle()); gr.addColorStop(1, color);
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(255,255,230,.45)'; g.lineWidth = 3; g.beginPath(); g.moveTo(W / 2, 0); g.lineTo(W / 2, H); g.stroke();
    g.lineWidth = 1.5; g.strokeStyle = 'rgba(255,255,230,.3)';
    for (let y = 18; y < H; y += 20) { g.beginPath(); g.moveTo(W / 2, y); g.quadraticCurveTo(W * .3, y - 8, 4, y - 26); g.moveTo(W / 2, y); g.quadraticCurveTo(W * .7, y - 8, W - 4, y - 26); g.stroke(); }
  });
}
function woodEnd(color, rings = null) {
  const k = 'we' + color + rings;
  return TEX[k] ??= tex(256, 256, (g, W) => {
    const c = W / 2, base = new THREE.Color(color);
    g.fillStyle = color; g.fillRect(0, 0, W, W);
    for (let r = 4; r < c; r += rand(4, 9)) {
      g.strokeStyle = rings || base.clone().offsetHSL(0, 0, rand(-.12, -.04)).getStyle(); g.lineWidth = rand(1, 2.5);
      g.beginPath(); for (let a = 0; a <= TAU + .01; a += .15) { const rr = r * (1 + Math.sin(a * 3 + r) * .03); g.lineTo(c + Math.cos(a) * rr, c + Math.sin(a) * rr); } g.stroke();
    }
  });
}
function bark(color) {
  const k = 'bk' + color;
  return TEX[k] ??= tex(128, 128, (g, W) => {
    g.fillStyle = color; g.fillRect(0, 0, W, W);
    for (let i = 0; i < 60; i++) { g.strokeStyle = `rgba(0,0,0,${rand(.1, .35)})`; g.lineWidth = rand(1, 3); const x = rand(0, W); g.beginPath(); g.moveTo(x, 0); g.bezierCurveTo(x + rand(-6, 6), W * .3, x + rand(-6, 6), W * .7, x + rand(-4, 4), W); g.stroke(); }
  });
}
const photoTex = {};
function notePhoto(file) {
  if (photoTex[file]) return photoTex[file];
  const t = new THREE.TextureLoader().load(file); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return (photoTex[file] = t);
}

/* ───────── families ───────── */

function citrus({ rind, flesh, shape = [1, 1, 1] }) {
  const g = new THREE.Group();
  const whole = mesh(new THREE.SphereGeometry(.34, 40, 28), std(rind, { map: peel(rind), bumpMap: bumpNoise(), bumpScale: 1.2, roughness: .45 }), -.1, 0, 0);
  whole.scale.set(...shape); g.add(whole);
  const stem = mesh(new THREE.CylinderGeometry(.012, .018, .05, 8), std('#5d6b2e'), -.1, .34 * shape[1], 0); g.add(stem);
  const lf = mesh(sheet({ len: .26, wid: .1, cup: .15, curl: .1 }), std('#3f7a2e', { map: leafTex('#3f7a2e'), side: THREE.DoubleSide }), -.08, .35 * shape[1], 0);
  lf.rotation.set(-.4, 0, -1.1); g.add(lf);
  // a round slice leaning on the fruit
  const slice = new THREE.Group();
  const rindMat = std(rind, { map: peel(rind), roughness: .5 });
  const face = std('#ffffff', { map: citrusFace(flesh, rind), roughness: .25, envMapIntensity: 1.3 });
  slice.add(mesh(new THREE.CylinderGeometry(.24, .24, .05, 40), [rindMat, face, face]));
  slice.position.set(.25, -.12, .12); slice.rotation.set(1.2, 0, .5); g.add(slice);
  return g;
}
function pome({ color, pear = false }) {
  const pts = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24, y = t * .7 - .35;
    let r = pear ? (.2 + .12 * Math.sin(Math.PI * Math.min(1, t * 1.6)) ** .7) * Math.sin(Math.PI * t) ** .6 + (t < .5 ? .06 : 0) * Math.sin(Math.PI * t)
                 : .34 * Math.sin(Math.PI * t) ** .7 * (1 - .12 * Math.cos(t * TAU));
    if (pear) r = t < .55 ? .3 * Math.sin(Math.PI * t / 1.1) ** .6 : .3 * Math.sin(Math.PI * .5) * (1 - (t - .55) * 1.25) + .02;
    pts.push(new THREE.Vector2(Math.max(.001, r), y));
  }
  const g = new THREE.Group();
  g.add(mesh(new THREE.LatheGeometry(pts, 40), std(color, { map: peel(color), roughness: .35, envMapIntensity: 1.3 })));
  g.add(mesh(new THREE.CylinderGeometry(.012, .016, .14, 8), std('#5a3d22'), 0, .4, 0));
  const lf = mesh(sheet({ len: .25, wid: .1, cup: .12, curl: .1 }), std('#4b8a2c', { map: leafTex('#4b8a2c'), side: THREE.DoubleSide }), .02, .4, 0);
  lf.rotation.set(0, 0, -.9); g.add(lf);
  return g;
}
function berries({ color, raspberry = false }) {
  const g = new THREE.Group(), m = std(color, { roughness: .3, envMapIntensity: 1.2 });
  if (raspberry) {
    const drupe = new THREE.SphereGeometry(.05, 12, 10);
    for (let i = 0; i < 70; i++) {                                           // drupelets over a rounded cone
      const t = i / 70, a = i * 2.4, y = -.2 + t * .42, r = .2 * Math.sin(Math.PI * (.15 + t * .75));
      g.add(mesh(drupe, m, Math.cos(a) * r, y, Math.sin(a) * r));
    }
    const cal = mesh(sheet({ len: .12, wid: .05, cup: .1, curl: -.2 }), std('#3d6b28', { side: THREE.DoubleSide }), 0, .22, 0);
    g.add(cal);
  } else {
    [[0, 0, 0], [.17, .05, .05], [-.16, .02, .08], [.05, .14, -.12], [-.06, -.14, -.08]].forEach(([x, y, z]) => {
      g.add(mesh(new THREE.SphereGeometry(.12, 24, 18), m, x, y, z));
      g.add(mesh(new THREE.CylinderGeometry(.006, .006, .12, 6), std('#4d5b2a'), x * .6, y + .15, z * .6));
    });
  }
  return g;
}
function layeredFlower({ color, center = null, rings = 4, petals = 6, open = 1 }) {       // rose, peony
  const g = new THREE.Group(), m = std(color, { side: THREE.DoubleSide, roughness: .6 });
  for (let r = 0; r < rings; r++) {
    const n = petals + r * 2, len = .16 + r * .08, tilt = (.25 + r * .32) * open;
    for (let i = 0; i < n; i++) {
      const p = mesh(sheet({ len, wid: len * .55, cup: .9, curl: -.15 - r * .05, tip: .8 }), m);
      const holder = new THREE.Group(); holder.rotation.y = i / n * TAU + r * .5; p.rotation.x = -tilt; holder.add(p);
      g.add(holder);
    }
  }
  if (center) g.add(mesh(new THREE.SphereGeometry(.05, 12, 10), std(center), 0, .05, 0));
  const leaf = mesh(sheet({ len: .32, wid: .12, cup: .1, curl: .1 }), std('#3c6e2a', { map: leafTex('#3c6e2a'), side: THREE.DoubleSide }), 0, -.02, 0);
  leaf.rotation.set(-1.4, .6, 0); g.add(leaf);
  g.rotation.x = .5;
  return g;
}
function starFlower({ color, center = '#f2c94c', petals = 5, len = .34, wid = .16, cup = .25, count = 2 }) {   // jasmine, blossoms, tuberose
  const g = new THREE.Group(), m = std(color, { side: THREE.DoubleSide, roughness: .5 });
  for (let f = 0; f < count; f++) {
    const fl = new THREE.Group();
    for (let i = 0; i < petals; i++) {
      const h = new THREE.Group(); h.rotation.y = i / petals * TAU;
      const p = mesh(sheet({ len, wid, cup, curl: -.12, tip: 1 }), m); p.rotation.x = -1.2; h.add(p); fl.add(h);
    }
    fl.add(mesh(new THREE.SphereGeometry(.045, 12, 10), std(center, { roughness: .4 }), 0, .03, 0));
    fl.add(mesh(new THREE.CylinderGeometry(.012, .012, .35, 6), std('#4e7a31'), 0, -.18, 0));
    if (f) { fl.scale.setScalar(.7); fl.position.set(.3, -.1, .1); fl.rotation.set(.3, 0, -.4); } else fl.rotation.x = .6;
    g.add(fl);
  }
  return g;
}
function cupFlower({ color, pad = false, center = '#f3cf4f' }) {           // lotus, water lily
  const g = new THREE.Group(), m = std(color, { side: THREE.DoubleSide, roughness: .5 });
  [[8, .34, .55], [8, .28, .95], [6, .22, 1.3]].forEach(([n, len, tilt], r) => {
    for (let i = 0; i < n; i++) {
      const h = new THREE.Group(); h.rotation.y = i / n * TAU + r * .4;
      const p = mesh(sheet({ len, wid: .09, cup: .6, curl: -.05, tip: 1.6 }), m); p.rotation.x = -(Math.PI / 2 - tilt) * .9; h.add(p); g.add(h);
    }
  });
  g.add(mesh(new THREE.CylinderGeometry(.06, .05, .06, 16), std(center, { roughness: .4 }), 0, .04, 0));
  if (pad) {
    const shape = new THREE.Shape(); shape.absarc(0, 0, .42, .3, TAU - .3, false); shape.lineTo(0, 0);
    const padMesh = mesh(new THREE.ShapeGeometry(shape, 32), std('#3f7a3a', { side: THREE.DoubleSide, roughness: .35 }), 0, -.02, 0);
    padMesh.rotation.x = -Math.PI / 2; g.add(padMesh);
  }
  g.rotation.x = .45;
  return g;
}
function orchid({ color, lip }) {
  const g = new THREE.Group(), m = std(color, { side: THREE.DoubleSide, roughness: .45 });
  [[0, .34, .16], [2.1, .32, .12], [-2.1, .32, .12], [1.05, .3, .2], [-1.05, .3, .2]].forEach(([a, len, wid]) => {
    const h = new THREE.Group(); h.rotation.z = a;
    const p = mesh(sheet({ len, wid, cup: .2, curl: .12, tip: 1 }), m); h.add(p); g.add(h);
  });
  const l = mesh(sheet({ len: .22, wid: .12, cup: .9, curl: .35 }), std(lip, { side: THREE.DoubleSide }), 0, 0, .04); l.rotation.z = Math.PI; g.add(l);
  g.add(mesh(new THREE.SphereGeometry(.04, 12, 10), std('#fff3c4'), 0, .02, .05));
  g.rotation.x = -.3;
  return g;
}
function irisFlower({ color }) {
  const g = new THREE.Group(), m = std(color, { side: THREE.DoubleSide, roughness: .5 });
  for (let i = 0; i < 3; i++) {
    const h = new THREE.Group(); h.rotation.y = i / 3 * TAU;
    const up = mesh(sheet({ len: .3, wid: .12, cup: .5, curl: -.1 }), m); up.rotation.x = -.25; h.add(up);
    const down = mesh(sheet({ len: .34, wid: .15, cup: .3, curl: .3 }), m); down.rotation.x = -1.9; h.add(down);
    h.add(mesh(new THREE.BoxGeometry(.02, .12, .02), std('#f2c94c'), 0, .03, .1));
    g.add(h);
  }
  g.add(mesh(new THREE.CylinderGeometry(.015, .015, .4, 6), std('#4e7a31'), 0, -.2, 0));
  return g;
}
function spike({ color, stems = 3 }) {                                       // lavender, heliotrope clusters
  const g = new THREE.Group(), bud = new THREE.SphereGeometry(.03, 10, 8), m = std(color, { roughness: .6 });
  for (let s = 0; s < stems; s++) {
    const st = new THREE.Group(); st.rotation.z = (s - (stems - 1) / 2) * .22;
    st.add(mesh(new THREE.CylinderGeometry(.008, .01, .8, 6), std('#6f8a5a'), 0, -.1, 0));
    for (let i = 0; i < 26; i++) { const y = .05 + i * .012, a = i * 2.3; const b = mesh(bud, m, Math.cos(a) * .035, y + .1, Math.sin(a) * .035); b.scale.set(1, 1.5, 1); st.add(b); }
    g.add(st);
  }
  return g;
}
function leaves({ color, count = 3, len = .5, wid = .18, serrate = 0, heart = false }) {
  const g = new THREE.Group(), m = std(color, { map: leafTex(color), side: THREE.DoubleSide, roughness: .55 });
  for (let i = 0; i < count; i++) {
    const l = mesh(sheet({ len, wid: heart ? wid * 1.4 : wid, cup: .12, curl: .15, tip: heart ? .7 : 1, serrate }), m);
    const h = new THREE.Group(); h.rotation.set(0, i * 1.9, (i - (count - 1) / 2) * .55); l.rotation.x = -.35; h.add(l);
    h.position.y = -.25; g.add(h);
  }
  return g;
}
function logWood({ color, heart, rings = null, sticks = 3 }) {
  const g = new THREE.Group();
  const side = std(color, { map: bark(color), roughness: .8 }), end = std('#ffffff', { map: woodEnd(heart, rings), roughness: .55, envMapIntensity: 1.2 });
  const log = mesh(new THREE.CylinderGeometry(.26, .28, .42, 36), [side, end, end]); log.rotation.set(.45, 0, .08); g.add(log);   // standing, rings towards you
  for (let i = 0; i < sticks; i++) {                                         // split sticks leaning on it
    const s = mesh(new THREE.BoxGeometry(.07, .62, .07), [side, side, end, end, side, side], -.3 + i * .12, -.05, .3 - i * .05);
    s.rotation.set(.3, i * .5, .35 - i * .12); g.add(s);
  }
  return g;
}
function roots({ color }) {                                                  // vetiver
  const g = new THREE.Group(), m = std(color, { roughness: .8 });
  for (let i = 0; i < 16; i++) {
    const pts = []; let x = rand(-.08, .08), z = rand(-.08, .08);
    for (let j = 0; j < 8; j++) { pts.push(new THREE.Vector3(x, .35 - j * .1, z)); x += rand(-.05, .05); z += rand(-.05, .05); }
    g.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, .01, 5), m));
  }
  g.add(mesh(new THREE.TorusGeometry(.1, .02, 8, 24), std('#8a6a44'), 0, .25, 0)).children.at(-1).rotation.x = Math.PI / 2;
  return g;
}
function pods({ color, n = 3, len = .8, r = .035, curve = .1, tie = '#cda769' }) {   // vanilla
  const g = new THREE.Group(), m = std(color, { roughness: .45, map: bark(color), envMapIntensity: .8 });
  for (let i = 0; i < n; i++) {
    const pts = [0, .25, .5, .75, 1].map(t => new THREE.Vector3(Math.sin(t * Math.PI) * curve * (i - 1), t * len - len / 2, (i - 1) * .06));
    g.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 30, r, 10), m));
  }
  const band = mesh(new THREE.TorusGeometry(.1, .018, 8, 24), std(tie, { roughness: .8 })); band.rotation.x = Math.PI / 2; band.scale.set(1, .7, 1); g.add(band);
  g.rotation.z = .5;
  return g;
}
function beans({ color, n = 4, size = [.18, .08, .07], wrinkle = .14, spread = .2 }) {   // tonka, almond, ambrette seeds, cardamom
  const g = new THREE.Group();
  for (let i = 0; i < n; i++) {
    const geo = wobble(new THREE.SphereGeometry(1, 28, 20), wrinkle, 5);
    const b = mesh(geo, std(color, { roughness: .45, bumpMap: bumpNoise(), bumpScale: 1 }));
    b.scale.set(...size); b.position.set(Math.cos(i * 2.2) * spread, (i % 2 - .5) * .1, Math.sin(i * 2.2) * spread * .6); b.rotation.set(rand(0, 3), rand(0, 3), rand(0, 3));
    g.add(b);
  }
  return g;
}
function peppercorns({ color, n = 22, stem = false }) {
  const g = new THREE.Group(), m = std(color, { roughness: .6, bumpMap: bumpNoise(), bumpScale: 2 });
  for (let i = 0; i < n; i++) {
    const a = i * 2.4, r = .06 + Math.sqrt(i / n) * .24, geo = wobble(new THREE.SphereGeometry(.055, 14, 10), .12, 30);
    g.add(mesh(geo, m, Math.cos(a) * r, stem ? -.3 + i / n * .5 : rand(-.08, .08), Math.sin(a) * r * (stem ? .4 : 1)));
  }
  if (stem) g.add(mesh(new THREE.CylinderGeometry(.008, .008, .7, 6), std('#7a5a3a'), 0, -.05, 0));
  return g;
}
function cinnamon() {
  const g = new THREE.Group(), m = std('#8b4a24', { map: bark('#8b4a24'), roughness: .75, side: THREE.DoubleSide });
  for (let i = 0; i < 3; i++) {
    const s = mesh(new THREE.CylinderGeometry(.07, .07, .75, 24, 1, true, 0, TAU * 1.6), m);
    s.position.set((i - 1) * .13, 0, (i % 2) * .05); s.rotation.set(0, i, .15 * (i - 1)); g.add(s);
    const curl = mesh(new THREE.TorusGeometry(.04, .012, 6, 16, TAU * .8), m, s.position.x, .37, s.position.z); curl.rotation.x = Math.PI / 2; g.add(curl);
  }
  const tie = mesh(new THREE.TorusGeometry(.22, .015, 8, 30), std('#d8c29a')); tie.rotation.x = Math.PI / 2; tie.scale.set(1, .5, 1); g.add(tie);
  g.rotation.z = .6;
  return g;
}
function saffron() {
  const g = new THREE.Group(), m = std('#c8261a', { roughness: .4, emissive: col('#3a0602') });
  for (let i = 0; i < 18; i++) {
    const a = rand(0, TAU), pts = [0, .33, .66, 1].map(t => new THREE.Vector3(Math.cos(a) * t * .35, t * .45 - .2 + Math.sin(t * 3 + a) * .03, Math.sin(a) * t * .2));
    g.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, .012 + rand(0, .006), 5), m));
  }
  const bowl = mesh(new THREE.SphereGeometry(.26, 32, 16, 0, TAU, Math.PI / 2, Math.PI / 2), std('#efe6d6', { side: THREE.DoubleSide, roughness: .3 }), 0, -.1, 0);
  g.add(bowl);
  return g;
}
function crystals({ color, n = 5, clear = .75, emissive = null }) {          // amber, resins, ambroxan
  const g = new THREE.Group();
  const m = new THREE.MeshPhysicalMaterial({ color: col(color), roughness: .12, metalness: 0, transparent: true, opacity: clear, clearcoat: 1, clearcoatRoughness: .1, envMapIntensity: 1.8, emissive: col(emissive || color).multiplyScalar(emissive ? 1 : .18) });
  for (let i = 0; i < n; i++) {
    const c = mesh(wobble(new THREE.IcosahedronGeometry(.15 + rand(0, .08), 1), .18, 4), m, Math.cos(i * 2.4) * .18, (i % 3 - 1) * .1, Math.sin(i * 2.4) * .14);
    c.rotation.set(rand(0, 3), rand(0, 3), 0); g.add(c);
  }
  return g;
}
function stones({ color, n = 3 }) {                                          // ambergris, labdanum
  const g = new THREE.Group(), m = std(color, { roughness: .7, bumpMap: bumpNoise(), bumpScale: 3 });
  for (let i = 0; i < n; i++) { const s = mesh(wobble(new THREE.SphereGeometry(.2 - i * .04, 30, 20), .16, 3), m, i * .22 - .2, -i * .05, i % 2 * .1); s.scale.y = .7; g.add(s); }
  return g;
}
function orbs({ color, n = 7, glow = .4, iridescent = false }) {             // musks, aldehydes
  const g = new THREE.Group();
  const m = new THREE.MeshPhysicalMaterial({ color: col(color), roughness: .08, transparent: true, opacity: .7, clearcoat: 1, envMapIntensity: 2, emissive: col(color).multiplyScalar(glow), iridescence: iridescent ? 1 : 0, iridescenceIOR: 1.6 });
  for (let i = 0; i < n; i++) g.add(mesh(new THREE.SphereGeometry(.07 + (i % 3) * .05, 28, 20), m, Math.cos(i * 2.4) * .22, Math.sin(i * 1.7) * .2, Math.sin(i * 2.4) * .15));
  return g;
}
function honey() {
  const g = new THREE.Group();
  const wood = std('#c89a5e', { roughness: .6 });
  g.add(mesh(new THREE.CylinderGeometry(.02, .02, .7, 10), wood, 0, .2, 0));
  for (let i = 0; i < 5; i++) g.add(mesh(new THREE.CylinderGeometry(.09 - Math.abs(i - 2) * .015, .09 - Math.abs(i - 2) * .015, .035, 20), wood, 0, -.12 + i * .045, 0));
  const gold = new THREE.MeshPhysicalMaterial({ color: col('#e8a01c'), roughness: .05, transparent: true, opacity: .88, clearcoat: 1, envMapIntensity: 1.8, emissive: col('#4a2400') });
  g.add(mesh(new THREE.SphereGeometry(.1, 20, 16), gold, 0, -.2, 0));
  const drip = mesh(new THREE.SphereGeometry(.05, 16, 12), gold, 0, -.33, 0); drip.scale.y = 1.6; g.add(drip);
  g.rotation.z = .4;
  return g;
}
function sweets({ color, shape = 'cube', n = 5 }) {                          // caramel, praline
  const g = new THREE.Group();
  const m = new THREE.MeshPhysicalMaterial({ color: col(color), roughness: .2, clearcoat: 1, envMapIntensity: 1.5 });
  for (let i = 0; i < n; i++) {
    const geo = shape === 'cube' ? new THREE.BoxGeometry(.16, .16, .16) : wobble(new THREE.SphereGeometry(.11, 20, 16), .1, 6);
    const s = mesh(geo, m, Math.cos(i * 2.4) * .18, (i % 2) * .12 - .06, Math.sin(i * 2.4) * .15); s.rotation.set(rand(0, 1), rand(0, 1), rand(0, 1)); g.add(s);
  }
  return g;
}
function glassOf({ liquid }) {                                               // rum
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(.22, .18, .42, 40, 1, true), new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: .02, transparent: true, opacity: .25, side: THREE.DoubleSide, envMapIntensity: 2 })));
  g.add(mesh(new THREE.CylinderGeometry(.18, .18, .03, 32), new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: .05, transparent: true, opacity: .4 }), 0, -.2, 0));
  g.add(mesh(new THREE.CylinderGeometry(.2, .18, .2, 32), new THREE.MeshPhysicalMaterial({ color: col(liquid), roughness: .05, transparent: true, opacity: .85, emissive: col(liquid).multiplyScalar(.25) }), 0, -.1, 0));
  const ice = mesh(new THREE.BoxGeometry(.1, .1, .1), new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: .5, roughness: .1 }), .04, .02, 0); ice.rotation.set(.4, .5, 0); g.add(ice);
  return g;
}
function leatherSwatch({ file, color }) {
  const g = new THREE.Group(), t = notePhoto(file);
  const geo = new THREE.PlaneGeometry(.75, .5, 24, 12), p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 5) * .08 + Math.sin(p.getY(i) * 4) * .03);
  geo.computeVertexNormals();
  g.add(mesh(geo, std(color, { map: t, roughness: .55, side: THREE.DoubleSide })));
  const back = mesh(geo.clone().translate(0, 0, -.02), std(color, { roughness: .8, side: THREE.DoubleSide })); g.add(back);
  g.rotation.set(-.5, .3, .2);
  return g;
}
function wave() {                                                            // sea notes: a splash of sea water
  const g = new THREE.Group();
  const water = new THREE.MeshPhysicalMaterial({ color: col('#2f9fc4'), roughness: .03, transparent: true, opacity: .82, clearcoat: 1, envMapIntensity: 2.2, emissive: col('#06303d') });
  const drop = mesh(new THREE.SphereGeometry(.18, 32, 24), water, 0, .12, 0);                     // one big drop
  const pts = drop.geometry.attributes.position;
  for (let i = 0; i < pts.count; i++) { const y = pts.getY(i); if (y > 0) { const k = 1 - y / .18; pts.setX(i, pts.getX(i) * (.35 + .65 * k)); pts.setZ(i, pts.getZ(i) * (.35 + .65 * k)); pts.setY(i, y * 1.8); } }
  drop.geometry.computeVertexNormals(); g.add(drop);
  const crown = new THREE.Group();                                            // splash crown
  for (let i = 0; i < 14; i++) {
    const a = i / 14 * TAU, sp = mesh(new THREE.ConeGeometry(.03, .16, 8), water, Math.cos(a) * .3, -.14, Math.sin(a) * .3);
    sp.rotation.set(Math.sin(a) * .5, 0, -Math.cos(a) * .5); crown.add(sp);
    crown.add(mesh(new THREE.SphereGeometry(.025, 10, 8), water, Math.cos(a) * .36, -.02 + (i % 3) * .03, Math.sin(a) * .36));
  }
  const ring = mesh(new THREE.TorusGeometry(.3, .045, 12, 48), water, 0, -.2, 0); ring.rotation.x = Math.PI / 2; crown.add(ring);
  g.add(crown);
  return g;
}
function cloud({ color }) {                                                   // musk: a soft, powdery cloud
  const g = new THREE.Group(), m = std(color, { roughness: .95, emissive: col(color).multiplyScalar(.15) });
  for (let i = 0; i < 11; i++) g.add(mesh(new THREE.SphereGeometry(.12 + rand(0, .08), 20, 14), m, rand(-.28, .28), rand(-.1, .12), rand(-.14, .14)));
  return g;
}
function dome({ color }) {                                                    // heliotrope: a dome of tiny five-petal flowers
  const g = new THREE.Group(), m = std(color, { side: THREE.DoubleSide, roughness: .6 }), eye = std('#f7f0d8');
  const petal = sheet({ len: .05, wid: .03, cup: .2, curl: 0 });
  for (let i = 0; i < 38; i++) {
    const t = i / 38, a = i * 2.4, phi = Math.acos(1 - t * .9), dir = new THREE.Vector3(Math.sin(phi) * Math.cos(a), Math.cos(phi), Math.sin(phi) * Math.sin(a));
    const fl = new THREE.Group(); fl.position.copy(dir.clone().multiplyScalar(.3)); fl.lookAt(dir.clone().multiplyScalar(2)); fl.rotateX(Math.PI / 2);
    for (let k = 0; k < 5; k++) { const h = new THREE.Group(); h.rotation.y = k / 5 * TAU; const p = mesh(petal, m); p.rotation.x = -1.3; h.add(p); fl.add(h); }
    fl.add(mesh(new THREE.SphereGeometry(.012, 6, 5), eye)); g.add(fl);
  }
  g.add(mesh(new THREE.CylinderGeometry(.02, .02, .4, 6), std('#557a3a'), 0, -.2, 0));
  return g;
}
function rolledLeaf({ color }) {                                               // tobacco: rolled dried leaves
  const g = new THREE.Group(), m = std(color, { map: leafTex(color), roughness: .7, side: THREE.DoubleSide });
  for (let i = 0; i < 3; i++) {
    const r = mesh(new THREE.CylinderGeometry(.08, .08, .62, 20), m, (i - 1) * .17, 0, (i % 2) * .06);
    r.rotation.z = Math.PI / 2 + (i - 1) * .12; g.add(r);
    const ring = mesh(new THREE.TorusGeometry(.082, .012, 6, 20), std('#e8dcc0'), r.position.x, 0, r.position.z); ring.rotation.set(0, Math.PI / 2, 0); ring.rotation.z = r.rotation.z - Math.PI / 2; g.add(ring);
  }
  const leaf = mesh(sheet({ len: .6, wid: .2, cup: .1, curl: .2 }), m, 0, -.08, -.1); leaf.rotation.set(-1.2, 0, 1.3); g.add(leaf);
  return g;
}
function essence(file, color = '#f0e6d8') {                                   // anything else: its photo in a glowing glass sphere
  const g = new THREE.Group();
  const photo = mesh(new THREE.SphereGeometry(.26, 32, 24), new THREE.MeshStandardMaterial({ map: notePhoto(file), roughness: .5 }));
  g.add(photo, mesh(new THREE.SphereGeometry(.32, 32, 24), new THREE.MeshPhysicalMaterial({ color: col(color), transparent: true, opacity: .25, roughness: 0, clearcoat: 1, envMapIntensity: 2 })));
  return g;
}

/* ───────── which family for which note ───────── */

const RECIPES = {
  'bergamot':       () => citrus({ rind: '#a9c23f', flesh: '#e8e27a' }),
  'lemon':          () => citrus({ rind: '#f2d23c', flesh: '#f7e36a', shape: [.9, 1.15, .9] }),
  'mandarin':       () => citrus({ rind: '#f28a1c', flesh: '#f7a13b', shape: [1.1, .85, 1.1] }),
  'grapefruit':     () => citrus({ rind: '#f2a24a', flesh: '#ee5a5a', shape: [1.15, 1.05, 1.15] }),
  'bitter-orange':  () => citrus({ rind: '#e7761d', flesh: '#f08a2a' }),
  'green-apple':    () => pome({ color: '#8cc63f' }),
  'pear':           () => pome({ color: '#c9cf55', pear: true }),
  'raspberry':      () => berries({ color: '#c7234f', raspberry: true }),
  'blackcurrant':   () => berries({ color: '#2a1633' }),
  'rose':           () => layeredFlower({ color: '#c8324d' }),
  'peony':          () => layeredFlower({ color: '#f29bb7', rings: 5, petals: 7, open: 1.2 }),
  'jasmine':        () => starFlower({ color: '#fbf7ee', petals: 5, len: .3, wid: .11 }),
  'orange-blossom': () => starFlower({ color: '#fffaf0', petals: 5, len: .26, wid: .13, cup: .4, center: '#f0b429' }),
  'neroli':         () => starFlower({ color: '#fffaf2', petals: 5, len: .26, wid: .12, center: '#e8a21b' }),
  'tuberose':       () => starFlower({ color: '#f7f1e3', petals: 6, len: .3, wid: .13, center: '#efe0b0' }),
  'gardenia':       () => layeredFlower({ color: '#f7f2e4', rings: 3, petals: 6, open: 1.5, center: '#f2e3a6' }),
  'freesia':        () => starFlower({ color: '#f6d64a', petals: 6, len: .26, wid: .14, cup: .5, center: '#e39b1b' }),
  'lotus':          () => cupFlower({ color: '#f4b6c8' }),
  'water-lily':     () => cupFlower({ color: '#fbeaf0', pad: true }),
  'orchid':         () => orchid({ color: '#c46bd2', lip: '#8e2f9f' }),
  'vanilla-orchid': () => orchid({ color: '#f1ecc2', lip: '#e6c85a' }),
  'iris':           () => irisFlower({ color: '#6f5bc9' }),
  'violet-leaf':    () => leaves({ color: '#3f6b2d', count: 3, heart: true, len: .42 }),
  'heliotrope':     () => dome({ color: '#8f6fd6' }),
  'lavender':       () => spike({ color: '#8a6fd1', stems: 3 }),
  'green-tea':      () => leaves({ color: '#5c8f33', count: 3, len: .45, wid: .14 }),
  'mint':           () => leaves({ color: '#4fa24a', count: 4, len: .38, wid: .16, serrate: .06 }),
  'sage':           () => leaves({ color: '#8fa38a', count: 3, len: .42, wid: .15 }),
  'geranium':       () => leaves({ color: '#5a8c3a', count: 3, len: .36, wid: .2, serrate: .1 }),
  'patchouli':      () => leaves({ color: '#355a26', count: 4, len: .38, wid: .17, serrate: .08 }),
  'tobacco-leaf':   () => leaves({ color: '#a7732f', count: 2, len: .6, wid: .22 }),
  'tobacco':        () => rolledLeaf({ color: '#8f5c28' }),
  'cedarwood':      () => logWood({ color: '#7a4a2c', heart: '#d08c58' }),
  'sandalwood':     () => logWood({ color: '#a8865e', heart: '#e6c496' }),
  'ebony-wood':     () => logWood({ color: '#3a302a', heart: '#2c2420', rings: 'rgba(150,130,115,.55)' }),
  'oud':            () => logWood({ color: '#4d321c', heart: '#7a4d28', rings: 'rgba(40,20,8,.6)' }),
  'amberwood':      () => logWood({ color: '#94622e', heart: '#e2a04a' }),
  'vetiver':        () => roots({ color: '#b08a5a' }),
  'vanilla':        () => pods({ color: '#5a3a22' }),
  'tonka':          () => beans({ color: '#4a2e1c', n: 5, size: [.22, .09, .08], wrinkle: .16 }),
  'almond':         () => beans({ color: '#b98556', n: 4, size: [.2, .12, .08], wrinkle: .05 }),
  'ambrette':       () => beans({ color: '#6e4a2c', n: 9, size: [.07, .05, .04], wrinkle: .1, spread: .16 }),
  'cardamom':       () => beans({ color: '#8aa453', n: 4, size: [.19, .1, .1], wrinkle: .08 }),
  'black-pepper':   () => peppercorns({ color: '#4a4038' }),
  'pepper':         () => peppercorns({ color: '#5a4a3c' }),
  'pink-pepper':    () => peppercorns({ color: '#e0607a', n: 18, stem: true }),
  'cinnamon':       () => cinnamon(),
  'saffron':        () => saffron(),
  'amber':          () => crystals({ color: '#e59a2a' }),
  'benzoin':        () => crystals({ color: '#e8cf9a', clear: .9 }),
  'fir-resin':      () => crystals({ color: '#d6a53b', n: 4 }),
  'incense':        () => crystals({ color: '#f1e3b5', clear: .95, n: 6 }),
  'ambroxan':       () => crystals({ color: '#f4f0e6', clear: .6, n: 5 }),
  'labdanum':       () => stones({ color: '#3b2517' }),
  'ambergris':      () => stones({ color: '#a8a39a' }),
  'musk':           () => cloud({ color: '#f1e3cf' }),
  'white-musk':     () => cloud({ color: '#ffffff' }),
  'aldehydes':      () => orbs({ color: '#e9f3ff', glow: .15, iridescent: true, n: 9 }),
  'honey':          () => honey(),
  'caramel':        () => sweets({ color: '#b86b1f', shape: 'cube' }),
  'praline':        () => sweets({ color: '#9a5b2b', shape: 'nut' }),
  'rum':            () => glassOf({ liquid: '#a8551c' }),
  'leather':        () => leatherSwatch({ file: 'assets/notes/leather.jpg', color: '#ffffff' }),
  'suede':          () => leatherSwatch({ file: 'assets/notes/suede.jpg', color: '#ffffff' }),
  'sea-notes':      () => wave(),
};

export const slug = n => n.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// an ingredient as a 3D object, scaled to fit a sphere of the given diameter
export function ingredient(name, size = 1) {
  const s = slug(name), make = RECIPES[s];
  const obj = make ? make() : essence(`assets/notes/${s}.webp`);
  const holder = new THREE.Group(); holder.add(obj);
  const box = new THREE.Box3().setFromObject(obj), sphere = box.getBoundingSphere(new THREE.Sphere());
  obj.position.sub(sphere.center);
  holder.scale.setScalar(size / (sphere.radius * 2 || 1));
  holder.userData.known = !!make;
  return holder;
}
export const knownIngredients = () => Object.keys(RECIPES);
