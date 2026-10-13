/* ==========================================================================
   SYNTRA — VR landscapes
   Each perfume becomes a place, chosen from its notes and mood:
     floral  → a flower garden made of the perfume's own flowers
     woody   → a forest with shafts of light
     citrus  → a sunlit orchard with the fruits in the notes
     aquatic → a misty lily pond seen from a wooden deck
     warm    → golden dunes at dusk (amber, spice, tobacco, vanilla)
   Everything is procedural (no photos) so it runs offline on a Quest.
   ========================================================================== */
import * as THREE from 'three';

const rand = (a, b) => a + Math.random() * (b - a);
const pick = arr => arr[(Math.random() * arr.length) | 0];
const smooth = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

/* ───────── which landscape? ───────── */

const FAMILY = {
  floral:  /orange blossom|jasmine|tuberose|gardenia|lily|lotus|freesia|neroli|rose|peony|orchid|violet|iris|heliotrope/i,
  woody:   /cedar|sandalwood|vetiver|wood|fir|oud|patchouli|ebony|incense|labdanum|moss/i,
  citrus:  /bergamot|lemon|mandarin|grapefruit|orange|apple|pear|raspberry|blackcurrant/i,
  aquatic: /sea|marine|water|tea|mint|aldehydes|lavender|sage|geranium|lotus/i,
  warm:    /amber|benzoin|vanilla|tonka|caramel|praline|honey|almond|rum|tobacco|leather|suede|saffron|pepper|cardamom|cinnamon/i,
};
const MOOD_BIAS = { fresh: 'aquatic', playful: 'citrus', romantic: 'floral', warm: 'warm', bold: 'warm', mysterious: 'woody' };

export function chooseBiome(p) {
  const score = { floral: 0, woody: 0, citrus: 0, aquatic: 0, warm: 0 };
  const tiers = [[p.top || [], 1.3], [p.heart || [], 1.3], [p.base || [], 1]];
  for (const [notes, w] of tiers) for (const n of notes) for (const k in FAMILY) if (FAMILY[k].test(n)) score[k] += w;
  for (const k in FAMILY) if (FAMILY[k].test(p.name || '')) score[k] += 2;       // 'Rose Gourmand' belongs among roses
  const bias = MOOD_BIAS[(p.moodKey || p.mood || '').toLowerCase()];
  if (bias) score[bias] += 1.2;
  return Object.entries(score).sort((a, b) => b[1] - a[1])[0][0];
}

/* ───────── palettes (sRGB 0–255) ───────── */

export const BIOME_PALETTE = {
  floral:  { top: [110, 156, 212], mid: [252, 224, 214], bottom: [60, 80, 42], fog: [240, 220, 212], fogD: .022, sun: [255, 242, 222], ground: [84, 124, 58], sunGlow: .9 },
  woody:   { top: [34, 48, 40], mid: [150, 142, 104], bottom: [24, 28, 20], fog: [112, 114, 86], fogD: .05, sun: [255, 214, 160], ground: [58, 52, 36], sunGlow: .5 },
  citrus:  { top: [104, 168, 232], mid: [255, 238, 196], bottom: [80, 100, 50], fog: [246, 234, 204], fogD: .02, sun: [255, 246, 214], ground: [104, 146, 64], sunGlow: 1 },
  aquatic: { top: [66, 116, 156], mid: [204, 228, 232], bottom: [20, 50, 60], fog: [184, 212, 218], fogD: .028, sun: [240, 250, 255], ground: [30, 70, 80], sunGlow: .7 },
  warm:    { top: [64, 36, 38], mid: [250, 176, 108], bottom: [80, 50, 30], fog: [222, 152, 102], fogD: .028, sun: [255, 196, 128], ground: [196, 150, 100], sunGlow: 1 },
  lobby:   { top: [20, 14, 10], mid: [120, 92, 70], bottom: [14, 10, 8], fog: [70, 54, 42], fogD: .05, sun: [255, 226, 190], ground: [58, 44, 34], sunGlow: 0 },
};

/* ───────── shared helpers ───────── */

export const wind = { value: 0 };
function windy(mat, strength) {
  mat.onBeforeCompile = sh => {
    sh.uniforms.uTime = wind;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
        vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
      #else
        vec3 ip = vec3(0.);
      #endif
      float sway = sin(uTime * 1.3 + ip.x * .6 + ip.z * .45) + .4 * sin(uTime * 2.6 + ip.z * .9);
      transformed.x += sway * ${strength.toFixed(3)} * max(position.y, 0.);
      transformed.z += sway * ${(strength * .6).toFixed(3)} * max(position.y, 0.);`);
  };
  return mat;
}

// merge simple geometries into one, with a per-part vertex colour
function merge(parts) {
  let n = 0;
  const geos = parts.map(({ geo, color }) => {
    const g = (geo.index ? geo.toNonIndexed() : geo);
    g.computeVertexNormals();
    n += g.attributes.position.count;
    return { g, c: new THREE.Color(color) };
  });
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
  let o = 0;
  for (const { g, c } of geos) {
    const p = g.attributes.position.array, q = g.attributes.normal.array;
    for (let i = 0; i < g.attributes.position.count; i++, o++) {
      pos[o * 3] = p[i * 3]; pos[o * 3 + 1] = p[i * 3 + 1]; pos[o * 3 + 2] = p[i * 3 + 2];
      nor[o * 3] = q[i * 3]; nor[o * 3 + 1] = q[i * 3 + 1]; nor[o * 3 + 2] = q[i * 3 + 2];
      col[o * 3] = c.r; col[o * 3 + 1] = c.g; col[o * 3 + 2] = c.b;
    }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return out;
}

const PLINTH_Z = -1.55;
const clear = (x, z) => Math.hypot(x, z) < 1.25 || (Math.abs(x) < 1 && z < -.7 && z > -2.5);

function ring(rMin, rMax, bias = 1.6) {                    // random point, denser near the visitor
  for (;;) {
    const r = rMin + (rMax - rMin) * Math.pow(Math.random(), bias), a = Math.random() * Math.PI * 2;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (!clear(x, z)) return [x, z];
  }
}

const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3(), E = new THREE.Euler();
function place(mesh, i, x, y, z, s, ry = Math.random() * Math.PI * 2, tilt = 0) {
  E.set(rand(-tilt, tilt), ry, rand(-tilt, tilt)); Q.setFromEuler(E);
  S.setScalar(s); P.set(x, y, z); M.compose(P, Q, S); mesh.setMatrixAt(i, M);
}

function glowTex(inner = 'rgba(255,255,255,1)') {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, inner); gr.addColorStop(.3, 'rgba(255,255,255,.4)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const GLOW = glowTex();

/* ───────── building blocks ───────── */

function grass({ count, rMin = 1.25, rMax = 26, a = '#2f5a24', b = '#9bc463', hMin = .18, hMax = .5, width = 1, strength = .12 }) {
  const g = new THREE.BufferGeometry();
  const w = .014 * width;
  const v = [[-w, 0], [w, 0], [-w * .8, .35], [w * .8, .35], [-w * .45, .7], [w * .45, .7], [0, 1]];
  const pos = new Float32Array(v.length * 3), col = new Float32Array(v.length * 3);
  const ca = new THREE.Color(a), cb = new THREE.Color(b), tmp = new THREE.Color();
  v.forEach(([x, y], i) => { pos[i * 3] = x; pos[i * 3 + 1] = y; tmp.copy(ca).lerp(cb, y); col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b; });
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex([0, 1, 2, 1, 3, 2, 2, 3, 4, 3, 5, 4, 4, 5, 6]);
  g.computeVertexNormals();
  const mat = windy(new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: .9 }), strength);
  const mesh = new THREE.InstancedMesh(g, mat, count);
  for (let i = 0; i < count; i++) {
    const [x, z] = ring(rMin, rMax);
    const h = rand(hMin, hMax);
    E.set(rand(-.25, .25), Math.random() * Math.PI * 2, rand(-.25, .25)); Q.setFromEuler(E);
    S.set(1, h, 1); P.set(x, 0, z); M.compose(P, Q, S); mesh.setMatrixAt(i, M);
  }
  return mesh;
}

const FLOWERS = [
  [/\brose\b/i,                 { petals: 9,  len: .075, wid: .062, cup: .95, color: '#e5829a', centre: '#b84c68' }],
  [/peony/i,                    { petals: 12, len: .085, wid: .07,  cup: .85, color: '#f3b3c6', centre: '#e58aa4' }],
  [/jasmine/i,                  { petals: 5,  len: .05,  wid: .022, cup: .12, color: '#fbf8f0', centre: '#efd98a' }],
  [/tuberose|gardenia/i,        { petals: 6,  len: .075, wid: .042, cup: .35, color: '#f7f2e6', centre: '#eedfa6' }],
  [/orange blossom|neroli/i,    { petals: 5,  len: .048, wid: .03,  cup: .3,  color: '#fffaf2', centre: '#f1c04a' }],
  [/orchid/i,                   { petals: 5,  len: .075, wid: .052, cup: .18, color: '#c98ee0', centre: '#8b4cae' }],
  [/violet|iris|heliotrope|lavender/i, { petals: 5, len: .045, wid: .03, cup: .45, color: '#9c82d8', centre: '#f1d36a' }],
  [/lily|lotus/i,               { petals: 8,  len: .085, wid: .036, cup: .75, color: '#fbe8ef', centre: '#f1c84c' }],
  [/freesia/i,                  { petals: 6,  len: .05,  wid: .03,  cup: .5,  color: '#f5e07a', centre: '#e8a13b' }],
];
export const flowerSpec = name => (FLOWERS.find(([re]) => re.test(name)) || [0, null])[1];

function flowerGeometry(spec, stemH = .34) {
  const parts = [];
  const stem = new THREE.CylinderGeometry(.0035, .005, stemH, 5); stem.translate(0, stemH / 2, 0);
  parts.push({ geo: stem, color: '#4d7a36' });
  for (const [y, side] of [[.35, 1], [.55, -1]]) {
    const leaf = new THREE.SphereGeometry(1, 6, 4); leaf.scale(.045, .004, .014); leaf.translate(.04 * side, 0, 0);
    leaf.rotateZ(.5 * side); leaf.translate(0, stemH * y, 0);
    parts.push({ geo: leaf, color: '#5b8a40' });
  }
  for (let i = 0; i < spec.petals; i++) {
    const a = i / spec.petals * Math.PI * 2 + (i % 2) * .2;
    const p = new THREE.SphereGeometry(1, 8, 5); p.scale(spec.len / 2, .007, spec.wid / 2); p.translate(spec.len / 2, 0, 0);
    p.rotateZ(spec.cup * (i % 2 ? .75 : 1)); p.rotateY(a); p.translate(0, stemH + (i % 2) * .006, 0);
    parts.push({ geo: p, color: spec.color });
  }
  const c = new THREE.SphereGeometry(spec.len * .26, 8, 6); c.scale(1, .7, 1); c.translate(0, stemH + .008, 0);
  parts.push({ geo: c, color: spec.centre });
  return merge(parts);
}

function flowerField(spec, count, { rMin = 1.3, rMax = 22, patches = 14, stemH = .34, spread = 1.4, scale = [.8, 1.5] } = {}) {
  const geo = flowerGeometry(spec, stemH);
  const mat = windy(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .65, side: THREE.DoubleSide }), .07);
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  const centres = Array.from({ length: patches }, () => ring(rMin + 1, rMax));
  let i = 0;
  while (i < count) {
    const [cx, cz] = pick(centres);
    const x = cx + (Math.random() - .5) * spread * 2, z = cz + (Math.random() - .5) * spread * 2;
    if (clear(x, z) || Math.hypot(x, z) > rMax + 2) continue;
    place(mesh, i++, x, 0, z, rand(...scale), undefined, .15);
  }
  return mesh;
}

export function drifting(count, color, { size = .05, area = 12, height = 4, map = GLOW, additive = true }) {
  const g = new THREE.BufferGeometry(), pos = new Float32Array(count * 3), seed = new Float32Array(count);
  for (let i = 0; i < count; i++) { pos[i * 3] = rand(-area, area); pos[i * 3 + 1] = rand(.2, height); pos[i * 3 + 2] = rand(-area, area); seed[i] = Math.random() * 100; }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(g, new THREE.PointsMaterial({ size, map, color, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, opacity: .9 }));
  pts.userData.update = (t, dt, fall = -.15) => {
    for (let i = 0; i < count; i++) {
      const s = seed[i];
      pos[i * 3] += Math.sin(t * .4 + s) * .006;
      pos[i * 3 + 1] += fall * dt * (.5 + (s % 1));
      pos[i * 3 + 2] += Math.cos(t * .33 + s * 1.7) * .006;
      if (pos[i * 3 + 1] < .05) pos[i * 3 + 1] = height;
      if (pos[i * 3 + 1] > height) pos[i * 3 + 1] = .1;
    }
    g.attributes.position.needsUpdate = true;
  };
  return pts;
}

export function petalTexture(color) {
  const c = document.createElement('canvas'); c.width = 64; c.height = 64;
  const g = c.getContext('2d'); g.fillStyle = color;
  g.beginPath(); g.ellipse(32, 32, 26, 14, .6, 0, Math.PI * 2); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function treeGeometry(kind) {
  const parts = [];
  if (kind === 'conifer') {
    const h = 7;
    const trunk = new THREE.CylinderGeometry(.12, .2, h, 7); trunk.translate(0, h / 2, 0); parts.push({ geo: trunk, color: '#4a3526' });
    [[2.2, 2.6, 1.6], [1.7, 2.2, 3.1], [1.2, 1.9, 4.5], [.7, 1.6, 5.8]].forEach(([r, hh, y]) => {
      const c = new THREE.ConeGeometry(r, hh, 8); c.translate(0, y + hh / 2, 0); parts.push({ geo: c, color: pick(['#2d4a2b', '#34512f', '#263f25']) });
    });
  } else if (kind === 'broadleaf') {
    const h = 4.2;
    const trunk = new THREE.CylinderGeometry(.14, .26, h, 7); trunk.translate(0, h / 2, 0); parts.push({ geo: trunk, color: '#553d2b' });
    for (let i = 0; i < 4; i++) {
      const c = new THREE.IcosahedronGeometry(rand(1.1, 1.6), 1); c.translate(rand(-.8, .8), h + rand(-.2, .9), rand(-.8, .8));
      parts.push({ geo: c, color: pick(['#4d6b34', '#5d7a3c', '#43602f', '#7a7a38']) });
    }
  } else {                             // orchard
    const h = 1.1;
    const trunk = new THREE.CylinderGeometry(.08, .13, h, 7); trunk.translate(0, h / 2, 0); parts.push({ geo: trunk, color: '#5e4430' });
    const c = new THREE.IcosahedronGeometry(1.05, 2);
    const p = c.attributes.position;
    for (let i = 0; i < p.count; i++) {                       // same point → same bulge, so faces stay joined
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const k = 1 + .09 * Math.sin(x * 7.1 + y * 3.3) * Math.cos(z * 5.7 - y * 2.1);
      p.setXYZ(i, x * k, y * k * .85, z * k);
    }
    c.translate(0, h + .75, 0); parts.push({ geo: c, color: '#4f7d33' });
  }
  return merge(parts);
}

function forestOf(kind, count, rMin, rMax, sMin = .8, sMax = 1.3) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: .9 });
  const mesh = new THREE.InstancedMesh(treeGeometry(kind), mat, count);
  const spots = [];
  for (let i = 0; i < count; i++) {
    let x, z;
    do { [x, z] = ring(rMin, rMax, 1); }                        // keep a clear view toward the bottle
    while (z < 0 && Math.abs(x) < -z * .65 && Math.hypot(x, z) < 16);
    const s = rand(sMin, sMax);
    place(mesh, i, x, 0, z, s, undefined, .03);
    spots.push([x, z, s]);
  }
  mesh.userData.spots = spots;
  return mesh;
}

function lightShafts(n, color) {
  const c = document.createElement('canvas'); c.width = 16; c.height = 128;
  const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 128);
  gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(.35, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 16, 128);
  const tex = new THREE.CanvasTexture(c);
  const group = new THREE.Group();
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(.5, 1.6, 16, 12, 1, true),
      new THREE.MeshBasicMaterial({ map: tex, color, transparent: true, opacity: .16, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
    const [x, z] = ring(4, 16, 1);
    m.position.set(x, 7, z); m.rotation.z = .35; m.rotation.x = rand(-.1, .1);
    m.userData.phase = Math.random() * 10;
    group.add(m);
  }
  group.userData.update = t => group.children.forEach(m => { m.material.opacity = .1 + .08 * Math.sin(t * .3 + m.userData.phase); });
  return group;
}

/* ───────── landscapes ───────── */

function gardenBiome(p) {
  const g = new THREE.Group();
  const specs = [...new Set([...(p.heart || []), ...(p.top || []), ...(p.base || [])].map(flowerSpec).filter(Boolean))].slice(0, 3);
  if (!specs.length) specs.push(FLOWERS[0][1], FLOWERS[2][1]);
  g.add(grass({ count: 6500, a: '#3c7a2a', b: '#bde07c' }));
  specs.forEach((s, i) => g.add(flowerField(s, i === 0 ? 1400 : 950, { patches: 18 + i * 4, scale: [1.3, 2.3] })));
  g.add(flowerField(FLOWERS[2][1], 250, { patches: 10, stemH: .2 }));                 // small white wildflowers
  g.add(forestOf('broadleaf', 38, 26, 48, 1, 1.8));                                   // hedge of trees far away
  const petals = drifting(260, 0xffffff, { size: .06, area: 10, height: 3.5, map: petalTexture(specs[0].color), additive: false });
  g.add(petals);
  g.userData.update = (t, dt) => petals.userData.update(t, dt, -.08);
  return { group: g, floor: true };
}

function forestBiome(p) {
  const g = new THREE.Group();
  g.add(forestOf('conifer', 70, 6, 45, .9, 1.45));
  g.add(forestOf('broadleaf', 30, 7, 40, .9, 1.35));
  g.add(grass({ count: 4200, a: '#1f3318', b: '#5c7a36', hMin: .12, hMax: .35 }));     // moss & ferns
  const shafts = lightShafts(7, 0xffe2a8);
  const leaves = drifting(160, 0xc88a4a, { size: .07, area: 9, height: 5, map: petalTexture('#c9853f'), additive: false });
  g.add(shafts, leaves);
  g.userData.update = (t, dt) => { shafts.userData.update(t); leaves.userData.update(t, dt, -.12); };
  return { group: g, floor: true };
}

const FRUIT = [[/lemon|bergamot/i, '#f2d94a'], [/mandarin|orange|grapefruit/i, '#f39a2e'], [/apple/i, '#9cc94a'], [/pear/i, '#d5d86a'], [/raspberry/i, '#d4386a'], [/blackcurrant/i, '#4a2448']];
function orchardBiome(p) {
  const g = new THREE.Group();
  const colours = [...(p.top || []), ...(p.heart || [])].map(n => (FRUIT.find(([re]) => re.test(n)) || [0, null])[1]).filter(Boolean);
  if (!colours.length) colours.push('#f2d94a', '#f39a2e');
  const trees = forestOf('orchard', 46, 3.5, 30, .9, 1.25);
  g.add(trees);
  const fruitMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(.075, 10, 8), new THREE.MeshStandardMaterial({ roughness: .45 }), trees.userData.spots.length * 16);
  let i = 0;
  for (const [x, z, s] of trees.userData.spots) {
    for (let k = 0; k < 16; k++) {
      const a = Math.random() * Math.PI * 2, u = rand(-.2, .8), r = 1.02 * s;
      const fx = x + Math.cos(a) * r * Math.sqrt(1 - u * u), fz = z + Math.sin(a) * r * Math.sqrt(1 - u * u), fy = (1.1 + .75) * s + u * r * .85 - .15;
      place(fruitMesh, i, fx, fy, fz, rand(.85, 1.2));
      fruitMesh.setColorAt(i, new THREE.Color(pick(colours)));
      i++;
    }
  }
  g.add(fruitMesh);
  g.add(grass({ count: 5200, a: '#3a6a26', b: '#b4d772' }));
  g.add(flowerField(FLOWERS[2][1], 420, { patches: 18, stemH: .18 }));                // daisies in the grass
  const motes = drifting(200, 0xfff3c4, { size: .035, area: 9, height: 3.5 });
  g.add(motes);
  g.userData.update = (t, dt) => motes.userData.update(t, dt, .05);
  return { group: g, floor: true };
}

function rippleTexture() {
  const N = 256, c = document.createElement('canvas'); c.width = c.height = N;
  const g = c.getContext('2d'), img = g.createImageData(N, N);
  const h = (x, y) => Math.sin(x * .09) * Math.cos(y * .07) + .5 * Math.sin((x + y) * .17) + .3 * Math.cos(x * .23 - y * .19);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dx = h(x + 1, y) - h(x - 1, y), dy = h(x, y + 1) - h(x, y - 1);
    const o = (y * N + x) * 4;
    img.data[o] = 128 + dx * 60; img.data[o + 1] = 128 + dy * 60; img.data[o + 2] = 255; img.data[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(24, 24); return t;
}

function pondBiome(p, env) {
  const g = new THREE.Group();
  const normalMap = rippleTexture();
  const water = new THREE.Mesh(new THREE.CircleGeometry(70, 96),
    new THREE.MeshStandardMaterial({ color: '#2d5c66', metalness: .2, roughness: .06, envMap: env, envMapIntensity: 1.3, normalMap, normalScale: new THREE.Vector2(.25, .25) }));
  water.rotation.x = -Math.PI / 2; water.position.y = -.05;
  g.add(water);
  // wooden deck under the visitor
  const plank = document.createElement('canvas'); plank.width = 256; plank.height = 256;
  const pg = plank.getContext('2d'); pg.fillStyle = '#8a6848'; pg.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 8; i++) { pg.fillStyle = i % 2 ? '#7d5d3f' : '#94714f'; pg.fillRect(0, i * 32, 256, 30); pg.fillStyle = 'rgba(40,25,15,.5)'; pg.fillRect(0, i * 32 + 30, 256, 2); }
  const deckTex = new THREE.CanvasTexture(plank); deckTex.colorSpace = THREE.SRGBColorSpace;
  const deck = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, .12, 48), new THREE.MeshStandardMaterial({ map: deckTex, roughness: .8 }));
  deck.position.y = -.06; g.add(deck);
  // lily pads + water lilies
  const padGeo = new THREE.CircleGeometry(.28, 20, .3, Math.PI * 2 - .6); padGeo.rotateX(-Math.PI / 2);
  const pads = new THREE.InstancedMesh(padGeo, new THREE.MeshStandardMaterial({ color: '#46763a', roughness: .9, side: THREE.DoubleSide }), 220);
  const lilyGeo = flowerGeometry(FLOWERS.find(([re]) => re.test('lily'))[1], .015);
  const lilies = new THREE.InstancedMesh(lilyGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .6, side: THREE.DoubleSide }), 90);
  let li = 0;
  for (let i = 0; i < 220; i++) {
    let x, z; do { [x, z] = ring(2.7, 26, 1.4); } while (Math.hypot(x, z) < 2.7);
    place(pads, i, x, -.03, z, rand(.7, 1.6));
    if (li < 90 && Math.random() < .45) place(lilies, li++, x + .05, -.03, z, rand(1.4, 2.2));
  }
  lilies.count = li;
  g.add(pads, lilies);
  // reeds around the far edge
  g.add(grass({ count: 1800, rMin: 12, rMax: 34, a: '#2c4a2a', b: '#8aa35a', hMin: .8, hMax: 1.8, width: 1.6, strength: .05 }));
  const mist = drifting(240, 0xffffff, { size: .5, area: 16, height: 1.2, additive: false });
  mist.material.opacity = .08;
  g.add(mist);
  g.userData.update = (t, dt) => { normalMap.offset.set(t * .01, t * .006); mist.userData.update(t, dt, .02); };
  return { group: g, floor: false };
}

function dunesBiome(p) {
  const g = new THREE.Group();
  const geo = new THREE.PlaneGeometry(170, 170, 170, 170); geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), d = Math.hypot(x, z);
    const h = (Math.sin(x * .07) + .8 * Math.sin(z * .055 + 1.3) + .45 * Math.sin((x + z) * .12) + .18 * Math.sin(x * .31 - z * .21)) * 2.2;
    pos.setY(i, h * smooth(4, 22, d) - .02);
  }
  geo.computeVertexNormals();
  g.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: '#d7a46e', roughness: 1 })));
  const hasLeaf = [...(p.heart || []), ...(p.top || []), ...(p.base || [])].some(n => /tobacco|leaf/i.test(n));
  // drifting tobacco leaves (or dry spice petals)
  const leafShape = new THREE.Shape();
  leafShape.moveTo(0, 0); leafShape.quadraticCurveTo(.09, .12, 0, .32); leafShape.quadraticCurveTo(-.09, .12, 0, 0);
  const leaves = new THREE.InstancedMesh(new THREE.ShapeGeometry(leafShape, 6),
    new THREE.MeshStandardMaterial({ color: hasLeaf ? '#9a6a38' : '#c78a4c', roughness: .8, side: THREE.DoubleSide }), 70);
  const L = Array.from({ length: 70 }, () => ({ x: rand(-9, 9), y: rand(.5, 4), z: rand(-9, 9), r: Math.random() * 6, s: rand(.7, 1.5), v: rand(.1, .3) }));
  g.add(leaves);
  const motes = drifting(320, 0xffc27a, { size: .04, area: 12, height: 4 });
  g.add(motes);
  g.userData.update = (t, dt) => {
    L.forEach((l, i) => {
      l.x += l.v * dt; l.y += Math.sin(t + l.r) * .003; l.r += dt * .8;
      if (l.x > 10) l.x = -10;
      E.set(l.r, l.r * .7, l.r * .4); Q.setFromEuler(E); S.setScalar(l.s); P.set(l.x, l.y, l.z); M.compose(P, Q, S); leaves.setMatrixAt(i, M);
    });
    leaves.instanceMatrix.needsUpdate = true;
    motes.userData.update(t, dt, .08);
  };
  return { group: g, floor: false };
}

export function buildBiome(kind, p, env) {
  switch (kind) {
    case 'floral': return gardenBiome(p);
    case 'woody': return forestBiome(p);
    case 'citrus': return orchardBiome(p);
    case 'aquatic': return pondBiome(p, env);
    case 'warm': return dunesBiome(p);
  }
  return { group: new THREE.Group(), floor: true };
}

/* ───────── real 360° photos (Poly Haven, CC0, 8192 × 4096) ─────────
   height: how high the camera stood when the photo was taken (m); the
           lower half of the photo is laid on the floor at that depth
   yaw:    turns the photo so its best view is behind the bottle
   water:  where the water is in the photo (image coords 0–1, from top-left)
   fx:     motion layered on top (see vr-effects.js)                         */
const px = (pts, w = 1200, h = 600) => pts.map(([x, y]) => [x / w, y / h]);

export const PHOTOS = {
  floral:    { src: 'assets/vr/symmetrical_garden_02.jpg', yaw: 0, height: 1.65, music: 'floral', fx: 'petals', foliage: 1 },
  woody:     { src: 'assets/vr/forest_slope.jpg',          yaw: 0, height: 1.65, music: 'woody',  fx: 'forest', foliage: 1 },
  woodyWarm: { src: 'assets/vr/autumn_forest_04.jpg',      yaw: 0, height: 1.65, music: 'warm',   fx: 'autumn', foliage: 1 },
  warm:      { src: 'assets/vr/autumn_forest_04.jpg',      yaw: 0, height: 1.65, music: 'warm',   fx: 'autumn', foliage: 1 },
  citrus:    { src: 'assets/vr/dry_orchard_meadow.jpg',    yaw: 0, height: 1.65, music: 'citrus', fx: 'blossom', foliage: 1 },
  warmDark:  { src: 'assets/vr/kiara_1_dawn.jpg',          yaw: -.69, height: 1.65, music: 'warmDark', fx: 'dust' },
  aquatic:   { src: 'assets/vr/bell_park_pier.jpg',        yaw: 0, height: 1.6,  music: 'aquatic', fx: 'lake', waterAmt: 1,
               water: [px([[0, 296], [1200, 296], [1200, 452], [1000, 398], [760, 410], [612, 456], [430, 392], [335, 332], [300, 316], [268, 320], [205, 395], [120, 448], [0, 452]])] },
  nightLake: { src: 'assets/vr/lakeside_night.jpg',        yaw: -1.57, height: 1.65, music: 'night',  fx: 'nightLake', stars: 1, waterAmt: .8,
               water: [px([[98, 297], [1004, 297], [1000, 338], [962, 378], [905, 438], [830, 488], [700, 500], [500, 508], [300, 498], [165, 468], [122, 418], [106, 340]])] },
  nightSky:  { src: 'assets/vr/rogland_clear_night.jpg',   yaw: -.5, height: 1.65, music: 'night',  fx: 'night', stars: 1 },
  snow:      { src: 'assets/vr/lago_disola.jpg',           yaw: 0, height: 1.65, music: 'snow',   fx: 'snow', foliage: .6 },
  lobby:     { src: 'assets/vr/small_harbor_01.jpg',       yaw: -.9, height: 1.65, music: 'lobby',  fx: 'lobby', waterAmt: .8,
               water: [px([[0, 312], [200, 316], [428, 326], [468, 342], [450, 372], [398, 410], [300, 430], [150, 425], [0, 398]]),
                       px([[532, 300], [1200, 298], [1200, 392], [1000, 424], [880, 440], [700, 432], [600, 382], [546, 336]])] },
};

// which photo: the landscape from the notes, then the perfume's own mood
// a few perfumes are placed by hand, so every world is used and none is crowded
const BY_NAME = { 'red temptation': 'woody', 'hypnotic vanilla': 'nightSky', 'rose gourmand': 'citrus' };

export function photoFor(kind, p = {}) {
  const named = BY_NAME[(p.name || '').toLowerCase()];
  if (named) return PHOTOS[named];
  const m = (p.moodKey || '').toLowerCase();
  const notes = [...(p.top || []), ...(p.heart || []), ...(p.base || [])].join(' ');
  if (m === 'fresh' && /aldehydes|ambroxan|violet leaf|sage/i.test(notes)) return PHOTOS.snow;   // crisp, cool, clean → snowy Alps
  if (m === 'mysterious') return (kind === 'floral' || kind === 'aquatic') ? PHOTOS.nightLake : PHOTOS.nightSky;
  if (kind === 'woody' && (m === 'warm' || m === 'bold')) return PHOTOS.woodyWarm;
  if (kind === 'warm' && m === 'bold') return PHOTOS.warmDark;
  return PHOTOS[kind] || PHOTOS.warm;
}
