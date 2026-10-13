/* ==========================================================================
   SYNTRA — the AR scene that pops out of the receipt (all real 3D)

   Coordinates are the drawing's own: its centre is (0,0,0), it is 1 unit wide
   (≈ 42 mm on the paper), x → right, y → up the receipt, z → out of the paper.

   Timeline once the phone finds the drawing (seconds):
     0.0  a glow traces the drawing's frame
     0.3  the drawing pops out: it rises as a thick tile and its lines emboss upward
     1.2  the perfume bottle rises out of the drawing and stands on it
     2.2  the ingredients pop out of the drawing, one by one, as 3D objects
          (a lemon with a slice, a rose, vanilla pods …) with their names,
          then revolve around the bottle in a slow circle
     …    mood particles drift up
   Tap an ingredient: it grows for a moment.
   ========================================================================== */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { perfumeArt } from './receipt.js';
import { ingredient, slug } from './ar-ingredients.js';

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const seg = (t, a, b) => clamp((t - a) / (b - a));
const outCubic = x => 1 - Math.pow(1 - x, 3);
const outBack = x => { const c1 = 1.5, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
const rand = (a, b) => a + Math.random() * (b - a);
const sRGB = arr => new THREE.Color().setRGB(arr[0] / 255, arr[1] / 255, arr[2] / 255, THREE.SRGBColorSpace);

export async function loadFont() {
  const json = await (await fetch('assets/ar/instrument-serif.typeface.json')).json();
  return new FontLoader().parse(json);
}

// a soft studio light for glass, fruit and metal (no image files needed)
export function studioEnvironment(renderer) {
  const s = new THREE.Scene();
  s.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide,
    vertexShader: 'varying vec3 p; void main(){ p = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
    fragmentShader: 'varying vec3 p; void main(){ float h = max(p.z, p.y) * .5 + .5; gl_FragColor = vec4(mix(vec3(.1,.08,.07), vec3(1.05,.98,.9), smoothstep(.1,.95,h)), 1.); }',
  })));
  for (const [x, y, z, s2] of [[3, -4, 6, 3], [-5, 2, 4, 2], [0, 6, 2, 2.5], [2, 3, 5, 2]]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(s2, s2), new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 4.8, 4.5), side: THREE.DoubleSide }));
    m.position.set(x, y, z); m.lookAt(0, 0, 0); s.add(m);
  }
  const pm = new THREE.PMREMGenerator(renderer);
  const env = pm.fromScene(s, .02).texture; pm.dispose();
  return env;
}

function canvasTexture(w, h, draw, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
const radial = (inner, outer) => canvasTexture(128, 128, g => { const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, inner); gr.addColorStop(1, outer); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); });

/* ───────── the drawing as an embossed 3D tile ───────── */

function drawingMaps(perfume, N = 512) {
  const art = perfumeArt(perfume, N), src = art.getContext('2d').getImageData(0, 0, N, N).data;
  const ink = new Float32Array(N * N);
  for (let i = 0; i < N * N; i++) ink[i] = 1 - src[i * 4] / 255;
  // height: the ink, softened so the lines rise with rounded shoulders
  const hc = document.createElement('canvas'); hc.width = hc.height = N;
  const hg = hc.getContext('2d'), hImg = hg.createImageData(N, N);
  for (let i = 0; i < N * N; i++) { const v = ink[i] * 255; hImg.data[i * 4] = hImg.data[i * 4 + 1] = hImg.data[i * 4 + 2] = v; hImg.data[i * 4 + 3] = 255; }
  hg.putImageData(hImg, 0, 0);
  const soft = document.createElement('canvas'); soft.width = soft.height = N;
  const sg = soft.getContext('2d'); sg.filter = 'blur(1.6px)'; sg.drawImage(hc, 0, 0);
  const h = sg.getImageData(0, 0, N, N).data;
  // normal map from the height (so the embossed lines catch the light)
  const nc = document.createElement('canvas'); nc.width = nc.height = N;
  const ng = nc.getContext('2d'), nImg = ng.createImageData(N, N), H = (x, y) => h[(((y + N) % N) * N + ((x + N) % N)) * 4] / 255;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dx = (H(x + 1, y) - H(x - 1, y)) * 3.2, dy = (H(x, y + 1) - H(x, y - 1)) * 3.2, l = Math.hypot(dx, dy, 1), o = (y * N + x) * 4;
    nImg.data[o] = (-dx / l * .5 + .5) * 255; nImg.data[o + 1] = (dy / l * .5 + .5) * 255; nImg.data[o + 2] = (1 / l * .5 + .5) * 255; nImg.data[o + 3] = 255;
  }
  ng.putImageData(nImg, 0, 0);
  // colour: ivory paper, deep ink · roughness: ink glossy, paper matte
  const cc = document.createElement('canvas'); cc.width = cc.height = N;
  const cg = cc.getContext('2d'), cImg = cg.createImageData(N, N), rc = document.createElement('canvas'); rc.width = rc.height = N;
  const rg = rc.getContext('2d'), rImg = rg.createImageData(N, N);
  for (let i = 0; i < N * N; i++) {
    const k = ink[i];
    cImg.data[i * 4] = 246 - k * 226; cImg.data[i * 4 + 1] = 240 - k * 222; cImg.data[i * 4 + 2] = 228 - k * 212; cImg.data[i * 4 + 3] = 255;
    const r = 205 - k * 150; rImg.data[i * 4] = rImg.data[i * 4 + 1] = rImg.data[i * 4 + 2] = r; rImg.data[i * 4 + 3] = 255;
  }
  cg.putImageData(cImg, 0, 0); rg.putImageData(rImg, 0, 0);
  const T = (c, srgb) => { const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; };
  return { map: T(cc, true), height: T(soft, false), normal: T(nc, false), rough: T(rc, false) };
}

/* ───────── a solid 3D bottle cut from the perfume photo's outline ─────────
   The outline (row by row, where the photo is not transparent) is extruded to
   real thickness with rounded edges; the photo wraps the front and back.
   It looks solid from every angle, even straight from above. */
function solidBottle(tex, h) {
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const img = tex.image, H = 220, W = Math.max(8, Math.round(H * img.width / img.height));
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'); g.drawImage(img, 0, 0, W, H);
  const a = g.getImageData(0, 0, W, H).data, rows = [];
  for (let y = 0; y < H; y += 2) {
    let l = -1, r = -1;
    for (let x = 0; x < W; x++) if (a[(y * W + x) * 4 + 3] > 110) { if (l < 0) l = x; r = x; }
    if (l >= 0 && r - l > 1) rows.push([y, l, r + 1]);
  }
  const w = h * W / H, X = x => (x / W - .5) * w, Y = y => (1 - y / H) * h;
  const shape = new THREE.Shape();
  rows.forEach(([y, , r], i) => (i ? shape.lineTo(X(r), Y(y)) : shape.moveTo(X(r), Y(y))));      // right edge, top → bottom
  for (let i = rows.length - 1; i >= 0; i--) shape.lineTo(X(rows[i][1]), Y(rows[i][0]));      // left edge, bottom → top
  const depth = Math.min(.24, w * .42), bevel = Math.min(.018, w * .05);
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * .8, bevelSegments: 3, curveSegments: 4 });
  geo.translate(0, 0, -depth / 2);
  const pos = geo.attributes.position, uv = geo.attributes.uv;                 // the photo, projected straight through the bottle
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / w + .5, pos.getY(i) / h);
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({ map: tex, roughness: .18, metalness: 0, clearcoat: 1, clearcoatRoughness: .06, envMapIntensity: 1.1, alphaTest: .3 }));
}

/* ───────── mood particles (3D, instanced) ───────── */

const MOOD_PARTICLES = {
  fresh:      { count: 30, geo: () => { const g = new THREE.SphereGeometry(.014, 12, 10); g.scale(1, 1, 1.5); return g; }, mat: () => new THREE.MeshStandardMaterial({ color: 0xdff4f2, roughness: 0, metalness: .1, transparent: true, opacity: .75, envMapIntensity: 2 }), colors: null, rise: .16, spin: 0 },
  playful:    { count: 44, geo: () => new THREE.BoxGeometry(.026, .016, .003), mat: () => new THREE.MeshStandardMaterial({ roughness: .5, side: THREE.DoubleSide }), colors: ['#ffb49a', '#ffd166', '#9be3c9', '#f78fb3', '#fff4e0'], rise: .2, spin: 5 },
  romantic:   { count: 36, geo: () => { const g = new THREE.SphereGeometry(.024, 12, 8); g.scale(1, .22, .72); return g; }, mat: () => new THREE.MeshStandardMaterial({ roughness: .55, side: THREE.DoubleSide }), colors: ['#f3a3b8', '#f7c6d2', '#e27d98', '#fde4ea'], rise: .1, spin: 2 },
  warm:       { count: 50, geo: () => new THREE.IcosahedronGeometry(.008, 0), mat: () => new THREE.MeshBasicMaterial({ blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }), colors: ['#ffb347', '#ff8c2a', '#ffd27a'], rise: .22, spin: 1, flicker: true },
  bold:       { count: 26, geo: () => { const g = new THREE.OctahedronGeometry(.02, 0); g.scale(.55, 1.5, .55); return g; }, mat: () => new THREE.MeshStandardMaterial({ color: 0xc9774a, metalness: .95, roughness: .18, envMapIntensity: 1.6 }), colors: null, rise: .14, spin: 3 },
  mysterious: { count: 44, geo: () => new THREE.OctahedronGeometry(.01, 0), mat: () => new THREE.MeshBasicMaterial({ blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }), colors: ['#d9ccff', '#ffffff', '#b9a6f0'], rise: .08, spin: 1.5, flicker: true },
};
function moodParticles(moodKey) {
  const spec = MOOD_PARTICLES[moodKey] || MOOD_PARTICLES.fresh;
  const mesh = new THREE.InstancedMesh(spec.geo(), spec.mat(), spec.count);
  mesh.frustumCulled = false;
  const P = [], M = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), S = new THREE.Vector3(), V = new THREE.Vector3();
  const base = spec.colors?.map(c => new THREE.Color(c)) || null;
  const spawn = (p, anywhere) => {
    const a = rand(0, 6.28), r = rand(.15, .75);
    p.x = Math.cos(a) * r; p.y = Math.sin(a) * r; p.z = anywhere ? rand(0, 1.5) : rand(0, .06);
    p.v = spec.rise * rand(.6, 1.4); p.ph = rand(0, 100); p.s = rand(.7, 1.3); p.rx = rand(0, 6); p.ry = rand(0, 6); p.sp = spec.spin * rand(.5, 1.5);
  };
  for (let i = 0; i < spec.count; i++) { const p = {}; spawn(p, true); P.push(p); if (base) mesh.setColorAt(i, base[i % base.length]); }
  mesh.userData.update = (t, dt, strength) => {
    for (let i = 0; i < spec.count; i++) {
      const p = P[i];
      p.z += p.v * dt; p.x += Math.sin(t * .8 + p.ph) * .02 * dt; p.y += Math.cos(t * .7 + p.ph) * .02 * dt;
      if (p.z > 1.5) spawn(p, false);
      let s = p.s * clamp(p.z / .12) * clamp((1.5 - p.z) / .3) * strength;
      if (spec.flicker) s *= .6 + .4 * Math.sin(t * 7 + p.ph);
      e.set(p.rx + t * p.sp, p.ry + t * p.sp * .7, 0); q.setFromEuler(e);
      S.setScalar(Math.max(1e-4, s)); V.set(p.x, p.y, p.z); M.compose(V, q, S); mesh.setMatrixAt(i, M);
    }
    mesh.instanceMatrix.needsUpdate = true;
  };
  return mesh;
}

/* ───────── the whole experience ───────── */

const TILE_TOP = .06;          // top of the popped-out drawing
const RING = .8;               // how far the ingredients circle from the bottle
const ORBIT_Z = .55, ORBIT_TILT = .14;   // one gently tilted ring, like a planet's orbit

export class Experience {
  constructor({ perfume, moodKey, mood, font, occlude = true }) {
    this.font = font; this.t = -1; this.perfume = perfume; this.focused = null; this.focusUntil = 0;
    const root = this.root = new THREE.Group();
    const light = sRGB(mood.light);
    this.faceQ = new THREE.Quaternion();

    // the paper hides whatever is still "inside" it, so everything rises out of the receipt
    if (occlude) {
      const paper = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 3.4), new THREE.MeshBasicMaterial({ colorWrite: false }));
      paper.position.y = .17; paper.renderOrder = -10;
      root.add(paper);
    }

    // 1 · a glow traces the frame
    const r = .5, rr = .04, path = new THREE.CurvePath(), P = (x, y) => new THREE.Vector3(x, y, .004);
    path.add(new THREE.LineCurve3(P(-r + rr, -r), P(r - rr, -r))); path.add(new THREE.QuadraticBezierCurve3(P(r - rr, -r), P(r, -r), P(r, -r + rr)));
    path.add(new THREE.LineCurve3(P(r, -r + rr), P(r, r - rr))); path.add(new THREE.QuadraticBezierCurve3(P(r, r - rr), P(r, r), P(r - rr, r)));
    path.add(new THREE.LineCurve3(P(r - rr, r), P(-r + rr, r))); path.add(new THREE.QuadraticBezierCurve3(P(-r + rr, r), P(-r, r), P(-r, r - rr)));
    path.add(new THREE.LineCurve3(P(-r, r - rr), P(-r, -r + rr))); path.add(new THREE.QuadraticBezierCurve3(P(-r, -r + rr), P(-r, -r), P(-r + rr, -r)));
    this.trace = new THREE.Mesh(new THREE.TubeGeometry(path, 240, .008, 8, false),
      new THREE.MeshBasicMaterial({ color: light.clone().multiplyScalar(1.6), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    root.add(this.trace);

    // 2 · the drawing pops out: a thick tile rises, its lines emboss upward
    this.tile = new THREE.Group(); root.add(this.tile);
    const slab = new THREE.Mesh(new RoundedBoxGeometry(1.02, 1.02, TILE_TOP, 4, .02), new THREE.MeshStandardMaterial({ color: 0xefe8dc, roughness: .5, envMapIntensity: .9 }));
    slab.position.z = TILE_TOP / 2;
    const maps = drawingMaps(perfume);
    this.relief = new THREE.Mesh(new THREE.PlaneGeometry(.98, .98, 256, 256), new THREE.MeshStandardMaterial({
      map: maps.map, normalMap: maps.normal, roughnessMap: maps.rough, roughness: 1, displacementMap: maps.height, displacementScale: 0, envMapIntensity: 1.1,
    }));
    this.relief.position.z = TILE_TOP + .0008;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(.71, .006, 6, 4, Math.PI * 2), new THREE.MeshStandardMaterial({ color: light.clone().lerp(new THREE.Color(1, .85, .6), .6), metalness: .9, roughness: .25 }));
    rim.rotation.z = Math.PI / 4; rim.scale.set(1, 1, .4); rim.position.z = TILE_TOP;            // a thin gold edge
    this.tile.add(slab, this.relief, rim);

    // 3 · the bottle, standing on the drawing
    this.bottle = new THREE.Group(); root.add(this.bottle);
    this.bottleSpin = new THREE.Group(); this.bottle.add(this.bottleSpin);              // turns to face the phone
    this.bottleLean = new THREE.Group(); this.bottleSpin.add(this.bottleLean);          // leans back when the phone looks down
    this.bottleBody = new THREE.Group(); this.bottleBody.rotation.x = Math.PI / 2; this.bottleLean.add(this.bottleBody);
    this.yaw = 0; this.lean = 0;
    this.bottleH = 1.05;
    new THREE.TextureLoader().load(perfume.image, tex => this.bottleBody.add(solidBottle(tex, this.bottleH)));
    this.halo = new THREE.Mesh(new THREE.CircleGeometry(.7, 48), new THREE.MeshBasicMaterial({ map: radial('rgba(255,255,255,.85)', 'rgba(255,255,255,0)'), color: light, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.halo.rotation.x = Math.PI / 2; this.halo.position.set(0, .25, .55); this.bottle.add(this.halo);
    this.shadow = new THREE.Mesh(new THREE.CircleGeometry(.3, 32), new THREE.MeshBasicMaterial({ map: radial('rgba(0,0,0,.55)', 'rgba(0,0,0,0)'), transparent: true, opacity: 0, depthWrite: false }));
    this.shadow.position.z = TILE_TOP + .004; root.add(this.shadow);

    // 4 · the ingredients: pop out of the drawing, then revolve around the bottle
    this.items = [];
    const list = [...(perfume.top || []).map(n => [n, 'top']), ...(perfume.heart || []).map(n => [n, 'heart']), ...(perfume.base || []).map(n => [n, 'base'])];
    const plate = new THREE.MeshStandardMaterial({ color: 0x17110d, roughness: .5, metalness: .1, transparent: true, opacity: .82 });
    const ink = new THREE.MeshStandardMaterial({ color: 0xfbf4e8, roughness: .4, metalness: .1, emissive: 0x3a3026 });
    const HEIGHT = { top: .98, heart: .7, base: .44 };
    list.forEach(([name, tier], i) => {
      const g = new THREE.Group();
      const spinner = new THREE.Group(); g.add(spinner);
      const obj = ingredient(name, .36); obj.rotation.x = Math.PI / 2;          // built y-up → stand it up in z-up
      spinner.add(obj);
      const label = new THREE.Group(); g.add(label);                            // name plate, always facing the phone
      const text = this.text(name, .052, .008, ink);
      const tw = text.geometry.boundingBox.max.x - text.geometry.boundingBox.min.x;
      const back = new THREE.Mesh(new RoundedBoxGeometry(tw + .08, .1, .014, 2, .03), plate);
      text.position.z = .011; label.add(back, text); label.position.z = -.3;
      obj.traverse(o => { if (o.isMesh) o.userData.pick = g; });
      const hit = new THREE.Mesh(new THREE.SphereGeometry(.22, 12, 8), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
      hit.userData.pick = g; g.add(hit);                                         // an easier target for fingers
      g.userData.photo = null; g.userData.name = name;
      Object.assign(g.userData, { spinner, label, angle: i / list.length * Math.PI * 2, height: HEIGHT[tier], start: 2.2 + i * .2, focus: 0,
        from: new THREE.Vector3(rand(-.3, .3), rand(-.3, .3), TILE_TOP - .2), pop: 0, spinSpeed: rand(.35, .6) * (i % 2 ? 1 : -1) });
      g.scale.setScalar(.001);
      root.add(g); this.items.push(g);
    });

    // 5 · the perfume's name is shown on screen, under SYNTRA (ar.js), so it never covers the scene
    this.moodKey = moodKey;

    // 6 · mood particles
    this.particles = moodParticles(moodKey); root.add(this.particles);
  }

  text(str, size, depth, mat, bevel = 0) {
    const geo = new TextGeometry(str, { font: this.font, size, depth, curveSegments: 5, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel * .6, bevelSegments: 2 });
    geo.computeBoundingBox(); geo.center(); geo.computeBoundingBox();
    return new THREE.Mesh(geo, mat);
  }

  start() { if (this.t < 0) this.t = 0; }

  // tap an ingredient: it comes forward, bigger, with its real photo; tap again (or wait) to send it back
  tap(raycaster) {
    const hit = raycaster.intersectObjects(this.items, true).find(h => h.object.userData.pick);
    const g = hit?.object.userData.pick || null;
    this.focused = g && g !== this.focused ? g : null;
    this.focusUntil = this.t + 7;
    if (g && !g.userData.photo) g.add(g.userData.photo = this.photoCard(g.userData.name));
    return !!g;
  }
  photoCard(name) {
    const s = slug(name), file = `assets/notes/${s}.${s === 'leather' || s === 'suede' ? 'jpg' : 'webp'}`;
    const c = document.createElement('canvas'); c.width = c.height = 512;
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const img = new Image();
    img.onload = () => {
      const g2 = c.getContext('2d');
      g2.fillStyle = '#fbf6ee'; g2.beginPath(); g2.roundRect(0, 0, 512, 512, 60); g2.fill();
      g2.save(); g2.beginPath(); g2.roundRect(22, 22, 468, 468, 44); g2.clip(); g2.drawImage(img, 22, 22, 468, 468); g2.restore();
      tex.needsUpdate = true;
    };
    img.src = file;
    const card = new THREE.Group();
    const face = new THREE.Mesh(new THREE.PlaneGeometry(.62, .62), new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false }));
    const back = new THREE.Mesh(new RoundedBoxGeometry(.64, .64, .02, 2, .06), new THREE.MeshBasicMaterial({ color: 0xfbf6ee }));
    face.position.z = .012; card.add(back, face);
    card.scale.setScalar(.001);
    return card;
  }

  update(dt, camera) {
    if (this.t < 0) { this.root.visible = false; return; }
    this.root.visible = true;
    const t = (this.t += dt);

    // everything that shows text turns to face the phone
    const camQ = camera.getWorldQuaternion(new THREE.Quaternion());
    this.faceQ.copy(this.root.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(camQ));

    // frame glow
    const tr = seg(t, 0, .8), idx = this.trace.geometry.index.count;
    this.trace.geometry.setDrawRange(0, Math.floor(idx * outCubic(tr) / 6) * 6);
    this.trace.material.opacity = 1 - seg(t, 1.6, 3);
    this.trace.visible = t < 3.1;

    // the drawing pops out
    const pop = outBack(seg(t, .3, 1.3));
    this.tile.position.z = -TILE_TOP * (1 - clamp(pop));
    this.relief.material.displacementScale = .05 * outCubic(seg(t, .8, 1.8));
    this.tile.scale.setScalar(1 + .03 * Math.sin(Math.PI * seg(t, .3, 1.3)));

    // the bottle rises out of the drawing and turns slowly
    const b = outCubic(seg(t, 1.2, 2.5));
    this.bottle.position.z = TILE_TOP - (this.bottleH + .08) * (1 - b);
    // like a shop standee: turn towards the phone, lean back when the phone looks down from above
    // (from where the phone points and which way is up on its screen, so it works even straight from above)
    const inv = this.root.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(camQ);
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(inv), up = new THREE.Vector3(0, 1, 0).applyQuaternion(inv);
    const dx = -(fwd.x + up.x), dy = -(fwd.y + up.y);                 // the bottle's front turns this way
    const yaw = Math.atan2(dx, -dy), elev = Math.asin(clamp(-fwd.z, -1, 1));
    let dYaw = yaw - this.yaw; dYaw -= Math.round(dYaw / (Math.PI * 2)) * Math.PI * 2;
    this.yaw += dYaw * Math.min(1, dt * 3);
    this.lean += (clamp((elev - .75) * .95, 0, .72) - this.lean) * Math.min(1, dt * 3);
    this.bottleSpin.rotation.z = this.yaw + Math.sin(t * .5) * .22;
    this.bottleLean.rotation.x = -this.lean;
    this.halo.material.opacity = .45 * b; this.shadow.material.opacity = b;

    // ingredients: pop out of the drawing, then revolve around the bottle
    if (this.focused && t > this.focusUntil) this.focused = null;
    const camLocal = this.root.worldToLocal(camera.getWorldPosition(new THREE.Vector3()));
    const centre = new THREE.Vector3(0, 0, TILE_TOP + this.bottleH * .45);
    const focusSpot = centre.clone().addScaledVector(camLocal.clone().sub(centre).normalize(), 1.05);   // in front of everything
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.faceQ);
    const anyFocus = this.items.some(i => i.userData.focus > .3);
    for (const g of this.items) {
      const u = g.userData, e = seg(t, u.start, u.start + 1.4);
      u.focus += ((g === this.focused ? 1 : 0) - u.focus) * Math.min(1, dt * 4);
      if (u.focus < .5) u.angle += dt * .32;
      const slot = new THREE.Vector3(Math.cos(u.angle) * RING, Math.sin(u.angle) * RING, ORBIT_Z + Math.sin(u.angle) * ORBIT_TILT + Math.sin(t * 1.3 + u.angle * 3) * .02);
      if (e < 1) {
        const k = outCubic(e), mid = u.from.clone().lerp(slot, .5); mid.z = slot.z + .4;
        const a = u.from.clone().lerp(mid, k), c = mid.clone().lerp(slot, k);
        g.position.copy(a.lerp(c, k));
      } else g.position.copy(slot);
      const f = outCubic(u.focus);
      g.position.lerp(focusSpot.clone().addScaledVector(right, -.15), f);
      g.scale.setScalar(Math.max(.001, (e <= 0 ? 0 : outBack(e)) * (1 + 1.4 * f)));
      u.spinner.rotation.z += dt * u.spinSpeed * (1 + f);
      u.label.quaternion.copy(this.faceQ);
      u.label.visible = !anyFocus || u.focus > .3;                                     // only the chosen one keeps its name while enlarged
      if (u.photo) {                                                                    // its real photo, beside it
        u.photo.visible = f > .02;
        u.photo.scale.setScalar(Math.max(.001, f * .45));
        u.photo.position.copy(right.clone().multiplyScalar(.36)).add(new THREE.Vector3(0, 0, .04));
        u.photo.quaternion.copy(this.faceQ);
      }
    }


    this.particles.userData.update(t, dt, outCubic(seg(t, 1, 3)));
  }
}
