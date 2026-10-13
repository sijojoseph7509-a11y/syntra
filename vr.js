/* ==========================================================================
   SYNTRA — VR (WebXR, Meta Quest Browser)

   The kiosk sends the recommended perfume to /api/vr. This page turns it
   into a place you stand inside:
     · a real 360° photograph (8K) chosen from the notes and mood, laid on the
       real floor so you stand on the ground (vr-biomes.js, vr-panorama.js)
     · living detail: rippling water, leaves in the wind, petals, snow,
       fireflies, shooting stars (vr-effects.js)
     · the notes float in two calm arcs at your sides: top high, heart at eye
       level, base low
     · the bottle stands on an oak plinth in front of you: the photo, sharp, with a touch of depth
   Opened three ways:
     vr.html               on the Meta Quest (tap Enter VR once)
     vr.html?embed         inside the kiosk screen as a preview (drag to look)
     vr.html?demo[=kind]   stand-alone test: floral | woody | citrus | aquatic | warm | night | nightlake | snow | dark | lobby
   ========================================================================== */
import * as THREE from 'three';
import { chooseBiome, buildBiome, BIOME_PALETTE, wind, photoFor, PHOTOS, flowerSpec } from './vr-biomes.js';
import { depthGeometry, groundedGeometry, loadDepth, maskTexture, panoramaMaterial } from './vr-panorama.js';
import { tumbling, snowfall, fireflies, shootingStars, motes, sunRays } from './vr-effects.js';
import { Music } from './vr-music.js';

const $ = s => document.querySelector(s);
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const Q = new URLSearchParams(location.search);
const EMBED = Q.has('embed');
const DEMO = Q.has('demo') ? (Q.get('demo') || 'warm') : null;
// The headset (any address but this Mac's own) gets the light 3K photos in assets/vr/lite/: they load in
// seconds over the online link / a hotspot. The kiosk on this Mac keeps the full 8K photos. ?full / ?lite force one.
const LITE = Q.has('lite') || (!Q.has('full') && !['127.0.0.1', 'localhost'].includes(location.hostname));
const photoUrl = src => LITE ? src.replace('assets/vr/', 'assets/vr/lite/') : src;

if (EMBED || DEMO) document.body.classList.add('preview');

/* ───────────────────────── renderer / scene ───────────────────────── */

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');          // y = 0 is the real floor
renderer.xr.setFoveation(0);                               // full resolution to the edges (three.js defaults to maximum foveation)
renderer.xr.setFramebufferScaleFactor(1.2);                // a little supersampling: crisper photo and text
$('#view').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 300);
camera.position.set(0, 1.6, 0);
scene.add(camera);
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
const MAX_ANISO = renderer.capabilities.getMaxAnisotropy();

/* ───────────────────────── palette (procedural fallback only) ───────────────────────── */

const C = (r, g, b) => new THREE.Color().setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace);
const pal = { top: C(0, 0, 0), mid: C(0, 0, 0), bottom: C(0, 0, 0), fog: C(0, 0, 0), ground: C(0, 0, 0), sun: C(255, 226, 190), mist: C(255, 240, 220), fogD: .05, sunGlow: 0 };

function applyPalette(kind, mood) {
  const b = BIOME_PALETTE[kind] || BIOME_PALETTE.lobby;
  const tint = mood ? C(...mood.tint) : null, dark = mood ? (mood.shade ?? .1) : 0;
  const tinted = (arr, k) => { const c = C(...arr); if (tint) c.lerp(tint, k); return c.multiplyScalar(1 - dark * .45); };
  pal.top.copy(tinted(b.top, .15)); pal.mid.copy(tinted(b.mid, .25)); pal.bottom.copy(tinted(b.bottom, .1));
  pal.fog.copy(tinted(b.fog, .25)); pal.ground.copy(tinted(b.ground, .08));
  pal.sun.copy(C(...b.sun)); if (mood) pal.sun.lerp(C(...mood.light), .3);
  pal.mist.copy(mood ? C(...mood.mist) : C(255, 240, 220));
  pal.fogD = b.fogD + dark * .03; pal.sunGlow = b.sunGlow * (1 - dark * .6);
}

/* ───────────────────────── sky, sun, fog, floor, lights (fallback) ───────────────────────── */

const skyU = { top: { value: pal.top }, mid: { value: pal.mid }, bottom: { value: pal.bottom }, time: { value: 0 } };
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false, uniforms: skyU,
  vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
  fragmentShader: `
    uniform vec3 top; uniform vec3 mid; uniform vec3 bottom; uniform float time; varying vec3 vP;
    void main(){
      float h = vP.y;
      vec3 c = h > 0. ? mix(mid, top, smoothstep(0., .55, h)) : mix(mid, bottom, smoothstep(0., .2, -h));
      float veil = sin(atan(vP.z, vP.x) * 3. + time * .04) * .5 + .5;
      c += mid * veil * .05 * smoothstep(.4, 0., abs(h - .06));
      gl_FragColor = vec4(c, 1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
});
const sky = new THREE.Mesh(new THREE.SphereGeometry(140, 48, 24), skyMat);
scene.add(sky);
scene.fog = new THREE.FogExp2(pal.fog, pal.fogD);

function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.25, 'rgba(255,255,255,.55)');
  gr.addColorStop(.6, 'rgba(255,255,255,.12)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const GLOW = glowTexture();

const SUN_DIR = new THREE.Vector3(-.55, .32, -.77).normalize();
const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
sunSprite.position.copy(SUN_DIR).multiplyScalar(120); sunSprite.scale.setScalar(55);
scene.add(sunSprite);

const floorMat = new THREE.MeshStandardMaterial({ color: pal.ground, roughness: .97 });
const floor = new THREE.Mesh(new THREE.CircleGeometry(80, 72), floorMat);
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

const hemi = new THREE.HemisphereLight(0xffffff, 0x302418, .6);
const sun = new THREE.DirectionalLight(0xffffff, 1.4);
sun.position.copy(SUN_DIR).multiplyScalar(10);
scene.add(hemi, sun);

// image-based light: every world lights the plinth, leaves and petals with its own photo
const pmrem = new THREE.PMREMGenerator(renderer);
let envRT = null;
function setEnvironment(image, flipped) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 512;
  const g = c.getContext('2d');
  if (flipped) { g.translate(0, 512); g.scale(1, -1); }
  g.drawImage(image, 0, 0, 1024, 512);
  const t = new THREE.CanvasTexture(c); t.mapping = THREE.EquirectangularReflectionMapping; t.colorSpace = THREE.SRGBColorSpace;
  const rt = pmrem.fromEquirectangular(t); t.dispose();
  envRT?.dispose(); envRT = rt;
  scene.environment = rt.texture;
}
function skyEnvironment() {                                   // pond reflection for the fallback landscape
  const s = new THREE.Scene(); s.add(new THREE.Mesh(sky.geometry, skyMat));
  return pmrem.fromScene(s, .02).texture;
}

/* ───────────────────────── the oak plinth ───────────────────────── */

const STAGE_Z = -1.45;
const PLINTH_TOP = .955;
const texLoader = new THREE.TextureLoader();
function woodTex(src, srgb, rx = 1, ry = 1) {
  const t = texLoader.load(src);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.anisotropy = MAX_ANISO;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const oakSide = new THREE.MeshStandardMaterial({
  map: woodTex('assets/materials/oak_diff.jpg', true, .5, 1), normalMap: woodTex('assets/materials/oak_nor_gl.jpg', false, .5, 1),
  roughnessMap: woodTex('assets/materials/oak_rough.jpg', false, .5, 1), roughness: 1, normalScale: new THREE.Vector2(.6, .6), envMapIntensity: 1.1,
});
const oakTop = oakSide.clone();
oakTop.map = woodTex('assets/materials/oak_diff.jpg', true, .55, .55);
oakTop.normalMap = woodTex('assets/materials/oak_nor_gl.jpg', false, .55, .55);
oakTop.roughnessMap = woodTex('assets/materials/oak_rough.jpg', false, .55, .55);
const plinth = new THREE.Group();
{
  const kick = new THREE.Mesh(new THREE.BoxGeometry(.4, .04, .4), new THREE.MeshStandardMaterial({ color: 0x1c1712, roughness: .9 }));
  kick.position.y = .02;
  const body = new THREE.Mesh(new THREE.BoxGeometry(.44, .88, .44), oakSide);
  body.position.y = .04 + .44;
  const top = new THREE.Mesh(new THREE.BoxGeometry(.5, .035, .5), [oakSide, oakSide, oakTop, oakTop, oakSide, oakSide]);
  top.position.y = PLINTH_TOP - .0175;
  plinth.add(kick, body, top);
}
plinth.position.set(0, 0, STAGE_Z);
scene.add(plinth);

function shadowTexture(strength) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, `rgba(0,0,0,${strength})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
const groundShadow = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2), new THREE.MeshBasicMaterial({ map: shadowTexture(.6), transparent: true, depthWrite: false, fog: false }));
groundShadow.rotation.x = -Math.PI / 2; groundShadow.position.set(0, .004, STAGE_Z);
scene.add(groundShadow);

/* ───────────────────────── text panels (fixed in the world, never swim with the head) ───────────────────────── */

const SERIF = "'Instrument Serif', Georgia, 'Times New Roman', serif";
const SANS = "'Manrope', 'Helvetica Neue', Arial, sans-serif";
function textPanel(lines, { w = 1024, h = 256, worldW = 1.2, backdrop = true, res = 1.5 } = {}) {
  const c = document.createElement('canvas'); c.width = Math.round(w * res); c.height = Math.round(h * res);
  const g = c.getContext('2d'); g.scale(res, res);            // drawn at 1.5× for crisp text in the headset
  if (backdrop) {
    const r = Math.min(h * .22, 70), m = 8;
    g.fillStyle = 'rgba(18, 12, 8, .5)';
    g.beginPath(); g.roundRect(m, m, w - m * 2, h - m * 2, r); g.fill();
    g.strokeStyle = 'rgba(255, 255, 255, .18)'; g.lineWidth = 3; g.stroke();
  }
  g.textAlign = 'center'; g.textBaseline = 'middle';
  for (const l of lines) {
    g.font = l.font; g.fillStyle = l.color || '#f6eee3';
    g.shadowColor = 'rgba(0,0,0,.45)'; g.shadowBlur = 18;
    if (l.spacing) g.letterSpacing = l.spacing;
    let size = +(/(\d+)px/.exec(l.font) || [0, 40])[1];
    while (size > 12 && g.measureText(l.text).width > w * .9) { size -= 4; g.font = l.font.replace(/\d+px/, `${size}px`); }
    g.fillText(l.text, w / 2, l.y);
    g.letterSpacing = '0px';
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = MAX_ANISO;
  return new THREE.Mesh(new THREE.PlaneGeometry(worldW, worldW * h / w),
    new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, fog: false, toneMapped: false }));
}
// turn an object (yaw only) to face where the visitor stands
const faceVisitor = o => { o.rotation.set(0, Math.atan2(-o.position.x, -o.position.z), 0); return o; };

/* ───────────────────────── notes: two calm arcs at the sides ───────────────────────── */

const NOTE_COLOURS = [
  [/orange blossom|jasmine|tuberose|gardenia|lily|lotus|freesia|neroli/i, '#f7f0e2'],
  [/\brose\b|peony/i, '#f3a3b8'], [/orchid|violet|iris|heliotrope|lavender/i, '#c6a8ec'],
  [/green apple|apple|pear/i, '#bfe08e'], [/raspberry|blackcurrant/i, '#d5507a'],
  [/bergamot|lemon|mandarin|grapefruit|bitter orange|orange/i, '#f6d466'],
  [/saffron/i, '#f0a92e'], [/pepper|cardamom|cinnamon/i, '#e2873f'],
  [/vanilla|tonka|caramel|praline|honey|almond/i, '#f2dcae'], [/rum/i, '#c9793a'],
  [/tobacco/i, '#b98450'], [/leather|suede/i, '#a8735a'], [/oud|patchouli|incense|labdanum|ebony/i, '#a37a66'],
  [/cedar|sandalwood|vetiver|wood|fir/i, '#c4a27a'], [/amber|benzoin|ambergris|ambroxan/i, '#eeb45e'],
  [/musk|ambrette|aldehydes/i, '#efe9e3'], [/mint|green tea|tea|sea|marine|sage|geranium/i, '#96dcc8'],
];
const noteColour = n => new THREE.Color((NOTE_COLOURS.find(([re]) => re.test(n)) || [0, '#f0e6d8'])[1]);

// angles are measured from straight ahead; the front (title + bottle) stays clear
const TIERS = [
  { key: 'top',   label: 'top note',   y: 2.02, r: 1.95, d: .30, slots: [.98, 1.55, 2.1],  speed: 1 },
  { key: 'heart', label: 'heart note', y: 1.45, r: 1.85, d: .34, slots: [1.22, 1.8, 2.35], speed: .7 },
  { key: 'base',  label: 'base note',  y: .88,  r: 1.8,  d: .38, slots: [.98, 1.55, 2.1],  speed: .5 },
];

const noteSlug = n => n.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const NOTE_JPG = new Set(['leather', 'suede']);                   // material close-ups (Poly Haven, CC0)
const bubbleCache = new Map();
function noteBubble(name) {
  const slug = noteSlug(name), src = `assets/notes/${slug}.${NOTE_JPG.has(slug) ? 'jpg' : 'webp'}`;
  if (!bubbleCache.has(src)) bubbleCache.set(src, new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const S = 512, c = document.createElement('canvas'); c.width = c.height = S;
      const g = c.getContext('2d'), r = S / 2 - 10;
      g.save(); g.beginPath(); g.arc(S / 2, S / 2, r, 0, Math.PI * 2); g.clip();
      g.drawImage(img, 0, 0, S, S);
      const shine = g.createLinearGradient(0, 0, 0, S);               // glass highlight
      shine.addColorStop(0, 'rgba(255,255,255,.3)'); shine.addColorStop(.35, 'rgba(255,255,255,0)');
      shine.addColorStop(.8, 'rgba(0,0,0,0)'); shine.addColorStop(1, 'rgba(0,0,0,.22)');
      g.fillStyle = shine; g.fillRect(0, 0, S, S);
      g.restore();
      g.beginPath(); g.arc(S / 2, S / 2, r, 0, Math.PI * 2);
      g.lineWidth = 10; g.strokeStyle = 'rgba(255,248,236,.85)'; g.stroke();
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = MAX_ANISO;
      res(t);
    };
    img.onerror = rej;
    img.src = src;
  }));
  return bubbleCache.get(src);
}

function makeNote(name, tier, angle) {
  const col = noteColour(name);
  const g = new THREE.Group();
  g.position.set(Math.sin(angle) * tier.r, tier.y, -Math.cos(angle) * tier.r);
  faceVisitor(g);
  g.userData = { note: true, baseY: tier.y, phase: Math.random() * 10, speed: tier.speed };
  const D = tier.d;
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(D * 2.2, D * 2.2), new THREE.MeshBasicMaterial({ map: GLOW, color: col, transparent: true, opacity: .55, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  glow.position.z = -.02; glow.material.userData.keepMap = true;
  const orb = new THREE.Mesh(new THREE.SphereGeometry(D * .22, 32, 16), new THREE.MeshBasicMaterial({ color: col, fog: false }));
  const label = textPanel([
    { text: name.toUpperCase(), font: `500 64px ${SANS}`, y: 92, spacing: '10px' },
    { text: tier.label, font: `italic 48px ${SERIF}`, y: 170, color: 'rgba(246,238,227,.75)' },
  ], { w: 1024, h: 256, worldW: .56 });
  label.position.y = -D / 2 - .1;
  g.add(glow, orb, label);
  g.userData.glow = glow;
  noteBubble(name).then(tex => {
    const bubble = new THREE.Mesh(new THREE.PlaneGeometry(D, D), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, toneMapped: false }));
    bubble.material.userData.keepMap = true;
    g.add(bubble); orb.visible = false;
  }).catch(() => {});
  return g;
}

function addNotes(group, p) {
  TIERS.forEach((tier, ti) => {
    (p[tier.key] || []).slice(0, 6).forEach((name, i) => {
      const side = (i + ti) % 2 ? -1 : 1;                   // alternate sides, and start each tier on a different side
      const slot = tier.slots[Math.floor(i / 2)] ?? tier.slots.at(-1) + .5;
      group.add(makeNote(name, tier, side * slot));
    });
  });
}

/* ───────────────────────── the bottle: real depth + layers = parallax ───────────────────────── */

function buildBottle(tex, glowColour) {
  // the photo itself, flat and sharp (full resolution, true colour), with only a whisper of depth
  // behind it: a few darker layers 3 cm deep give the slightest parallax without touching the picture
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = MAX_ANISO;
  tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter;
  const img = tex.image, h = .42, w = h * img.width / img.height, depth = .03;
  const rig = new THREE.Group(); rig.position.set(0, PLINTH_TOP, STAGE_Z);
  const geo = new THREE.PlaneGeometry(w, h); geo.translate(0, h / 2, 0);
  const front = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: .01, toneMapped: false, fog: false }));
  front.renderOrder = 3;
  rig.add(front);
  for (let i = 1; i <= 4; i++) {
    const back = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, alphaTest: .5, toneMapped: false, fog: false, color: new THREE.Color().setScalar(.62 - i * .04) }));
    back.position.z = -depth * i / 4; back.renderOrder = 2;
    rig.add(back);
  }
  // a soft light behind it and a contact shadow on the oak
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(w * 3.2, h * 2.1), new THREE.MeshBasicMaterial({ map: GLOW, color: glowColour, transparent: true, opacity: .3, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  halo.position.set(0, h / 2, -.5); halo.material.userData.keepMap = true;
  const shade = new THREE.Mesh(new THREE.PlaneGeometry(w * 1.5, .12), new THREE.MeshBasicMaterial({ map: shadowTexture(.55), transparent: true, depthWrite: false, fog: false }));
  shade.rotation.x = -Math.PI / 2; shade.position.set(0, .002, -depth / 2);
  rig.add(halo, shade);
  return rig;
}

/* ───────────────────────── worlds ───────────────────────── */

let world = null, worldUpdate = null;

// 8K photos: decoded off the main thread, at most two kept in memory
const bitmapLoader = new THREE.ImageBitmapLoader();
bitmapLoader.setOptions({ imageOrientation: 'flipY' });
const photoCache = new Map();
function loadPhoto(src) {
  if (!photoCache.has(src)) {
    photoCache.set(src, new Promise((res, rej) => bitmapLoader.load(photoUrl(src), bmp => {
      const tex = new THREE.Texture(bmp);
      tex.flipY = false; tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = MAX_ANISO;
      tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.needsUpdate = true;
      // its depth map, if there is one (assets/vr/depth/<photo>.png): the world is then built in real 3D
      loadDepth(src.replace(/([^/]+)\.jpg$/, 'depth/$1.png'))
        .then(d => { tex.userData.depth = d; }, () => {})
        .finally(() => res(tex));
    }, undefined, rej)));
    while (photoCache.size > 2) {                             // free the oldest photo (not the one on show)
      const [old, p] = photoCache.entries().next().value;
      if (world?.userData.photoSrc === old) { photoCache.delete(old); photoCache.set(old, p); continue; }
      photoCache.delete(old);
      p.then(t => { t.dispose(); t.image?.close?.(); geoCache.get(old)?.dispose(); geoCache.delete(old); }).catch(() => {});
    }
  }
  return photoCache.get(src);
}
const geoCache = new Map();
const grounded = (h, wall = 4) => { const k = h + '/' + wall; if (!geoCache.has(k)) geoCache.set(k, groundedGeometry(40, h, 128, wall)); return geoCache.get(k); };
const maskCache = new Map();
const waterMask = info => { if (!info.water) return null; if (!maskCache.has(info.src)) maskCache.set(info.src, maskTexture(info.water)); return maskCache.get(info.src); };

function photoWorld(info, tex, palette, p) {
  const group = new THREE.Group();
  const tint = new THREE.Color(1, 1, 1);
  if (palette) tint.lerp(C(...palette.tint), .06).multiplyScalar(1 - (palette.shade ?? 0) * .25);
  const mat = panoramaMaterial(tex, { tint, water: waterMask(info), waterAmt: info.waterAmt || 0, foliage: info.foliage || 0, stars: info.stars || 0, height: info.height });
  const depth = tex.userData.depth;
  if (depth && !geoCache.has(info.src)) geoCache.set(info.src, depthGeometry(depth, info.height));
  const sphere = new THREE.Mesh(depth ? geoCache.get(info.src) : grounded(info.height, info.wall), mat);
  sphere.position.y = info.height;                          // the photo's ground lands on the real floor
  sphere.rotation.y = info.yaw || 0;
  sphere.renderOrder = -1;
  sphere.userData.keepGeo = true;
  group.add(sphere);
  group.userData.pano = mat.uniforms;
  group.userData.photoSrc = info.src;
  sky.visible = false; sunSprite.visible = false; floor.visible = false;
  pal.fogD = 0;
  setEnvironment(tex.image, true);
  const fx = worldFx(info.fx, p);                          // petals take the colour of the perfume's flowers
  group.add(fx);
  return { group, update: fx.userData.update };
}

function worldFx(kind, p = {}) {
  const g = new THREE.Group(), parts = [];
  const add = o => { g.add(o); parts.push(o); };
  const flower = [...(p.heart || []), ...(p.top || [])].map(flowerSpec).find(Boolean);
  switch (kind) {
    case 'petals':
      add(tumbling({ count: 110, kind: 'petal', colors: [flower?.color || '#f3b3c6', '#fff4f2', flower?.color || '#f7c9d4'], size: [.03, .05], fall: [.15, .32], wind: [.18, .06] }));
      add(motes({ count: 90 })); break;
    case 'forest':
      add(tumbling({ count: 45, kind: 'leaf', colors: ['#9bbf4a', '#c9c65a', '#7da341', '#b8a24a'], size: [.05, .08] }));
      add(sunRays({ count: 7 })); add(motes({ count: 140, color: 0xfff2cf })); break;
    case 'autumn':
      add(tumbling({ count: 150, kind: 'leaf', colors: ['#d9822b', '#c4521f', '#e8b04a', '#a8642a', '#e39a3b'], size: [.06, .1], fall: [.3, .6], wind: [.3, .08] }));
      add(motes({ count: 90, color: 0xffd9a0 })); break;
    case 'blossom':
      add(tumbling({ count: 80, kind: 'petal', colors: ['#ffffff', '#fde8ee', '#fff4f7'], size: [.025, .04], fall: [.12, .3] }));
      add(motes({ count: 160, color: 0xfff3c4, rise: .05 })); break;
    case 'dust':
      add(motes({ count: 260, color: 0xffc27a, size: .02, rise: .02, area: 8 }));
      add(tumbling({ count: 25, kind: 'leaf', colors: ['#a8743e', '#8a5a2e'], size: [.05, .08], wind: [.6, .1], fall: [.2, .4] })); break;
    case 'lake': add(motes({ count: 70, color: 0xffffff, size: .018 })); break;
    case 'nightLake': add(fireflies({ count: 55 })); add(shootingStars()); break;
    case 'night': add(fireflies({ count: 30, color: '#ffdca0' })); add(shootingStars()); break;
    case 'snow': add(snowfall({ count: 1000 })); break;
    case 'lobby': add(motes({ count: 60, color: 0xffe8c8, size: .018, rise: .02 })); break;
  }
  g.userData.update = (t, dt) => parts.forEach(o => o.userData.update?.(t, dt));
  return g;
}

function buildPerfumeWorld(p, info, tex) {
  const kind = chooseBiome(p);
  applyPalette(kind, p.palette);
  let group, update;
  if (tex) {
    ({ group, update } = photoWorld(info, tex, p.palette, p));
  } else {                                                  // photo missing → procedural landscape instead
    const biome = buildBiome(kind, p, kind === 'aquatic' ? skyEnvironment() : null);
    group = new THREE.Group(); group.add(biome.group);
    floor.visible = biome.floor; sky.visible = true; sunSprite.visible = true; scene.environment = null;
    update = biome.group.userData.update || null;
  }
  worldUpdate = update;
  plinth.visible = groundShadow.visible = true;
  addNotes(group, p);

  if (p.image) texLoader.load(p.image, t => { if (current === p.id) group.add(buildBottle(t, pal.sun)); });

  const title = textPanel([
    { text: 'ZARA', font: `600 40px ${SANS}`, y: 60, spacing: '14px', color: 'rgba(246,238,227,.8)' },
    { text: p.name.toUpperCase(), font: `400 150px ${SERIF}`, y: 175 },
    { text: p.line || 'Eau de Parfum', font: `400 38px ${SANS}`, y: 272, color: 'rgba(246,238,227,.8)' },
    { text: (p.character || []).join('  ·  '), font: `italic 54px ${SERIF}`, y: 350, color: 'rgba(246,238,227,.92)' },
  ], { w: 1600, h: 400, worldW: 1.9 });
  title.position.set(0, 2.3, STAGE_Z - 1.1);
  const facts = textPanel([
    { text: [p.mood, p.occasion, p.longevity ? `${p.longevity} hours` : ''].filter(Boolean).join('   ·   ').toUpperCase(), font: `500 40px ${SANS}`, y: 64, spacing: '8px', color: 'rgba(246,238,227,.85)' },
  ], { w: 1600, h: 128, worldW: 1.5 });
  facts.position.set(0, 1.9, STAGE_Z - 1.1);
  group.add(title, facts);
  return group;
}

function buildLobby(tex) {
  const group = new THREE.Group();
  applyPalette('lobby', null);
  if (tex) {
    const w = photoWorld(PHOTOS.lobby, tex, null);
    group.add(w.group); worldUpdate = w.update;
    group.userData.pano = w.group.userData.pano; group.userData.photoSrc = PHOTOS.lobby.src;
  } else {
    floor.visible = true; sky.visible = true; sunSprite.visible = true; scene.environment = null; worldUpdate = null;
  }
  plinth.visible = groundShadow.visible = false;
  const t = textPanel([
    { text: 'SYNTRA', font: `600 46px ${SANS}`, y: 80, spacing: '22px', color: 'rgba(246,238,227,.9)' },
    { text: 'Your scent is on its way', font: `italic 120px ${SERIF}`, y: 210 },
    { text: 'Find it at the kiosk, then double-press the button', font: `400 40px ${SANS}`, y: 320, color: 'rgba(246,238,227,.75)' },
  ], { w: 1800, h: 400, worldW: 2.1 });
  t.position.set(0, 1.72, -2.4);
  group.add(t);
  return group;
}

// Worlds change behind a soft fade to dark (clean for heavy landscapes, comfortable in VR)
const veil = new THREE.Mesh(new THREE.SphereGeometry(.35, 16, 12),
  new THREE.MeshBasicMaterial({ color: 0x0e0a07, side: THREE.BackSide, transparent: true, opacity: 1, depthTest: false, depthWrite: false, fog: false }));
veil.renderOrder = 9999;
camera.add(veil);
let pendingBuild = null;
function transitionTo(build) { pendingBuild = build; }
function dispose(o) {
  o.traverse(n => {
    if (!n.userData.keepGeo) n.geometry?.dispose();
    const m = n.material;
    if (m) (Array.isArray(m) ? m : [m]).forEach(x => { if (!x.userData.keepMap) x.map?.dispose(); x.dispose(); });
  });
}

/* ───────────────────────── state from the kiosk ───────────────────────── */

let lastSeq = -1, current = null;
function apply(s) {
  if (s.mode === 'vr' && s.perfume) {
    if (current === s.perfume.id) return;
    current = s.perfume.id;
    const p = s.perfume, info = photoFor(chooseBiome(p), p);
    pendingBuild = null;
    loadPhoto(info.src)
      .then(tex => { if (current === p.id) transitionTo(() => buildPerfumeWorld(p, info, tex)); })
      .catch(() => { if (current === p.id) transitionTo(() => buildPerfumeWorld(p, info, null)); });
    Sound.set(info.music || 'warm');
  } else {
    if (current === 'lobby') return;
    current = 'lobby';
    loadPhoto(PHOTOS.lobby.src)
      .then(tex => { if (current === 'lobby') transitionTo(() => buildLobby(tex)); })
      .catch(() => { if (current === 'lobby') transitionTo(() => buildLobby(null)); });
    Sound.set('lobby');
  }
}

function setLink(ok, text) {
  const el = $('#link'); if (!el) return;
  el.classList.toggle('ok', ok);
  el.querySelector('span').textContent = text;
}
async function poll() {
  if (DEMO) return;
  try {
    const r = await fetch('/api/vr', { cache: 'no-store' });
    const s = await r.json();
    setLink(true, 'Connected to kiosk');
    if (s.seq !== lastSeq) { lastSeq = s.seq; apply(s); }
  } catch { setLink(false, 'Kiosk not reachable — same Wi-Fi? server running?'); }
}
setInterval(poll, 500);

/* ───────────────────────── sound ───────────────────────── */

const Sound = new Music();                                   // see vr-music.js

/* ───────────────────────── first scene ───────────────────────── */

const DEMOS = {
  floral:  { id: 'demo-floral', name: 'Gardenia', line: 'Bloom Collection — Eau de Parfum', image: 'assets/perfumes/gardenia.webp', moodKey: 'romantic', mood: 'Romantic', occasion: 'Everyday · Special', longevity: 6,
             top: ['Pear', 'Mandarin', 'Neroli'], heart: ['Gardenia', 'Jasmine', 'Tuberose'], base: ['White Musk', 'Sandalwood', 'Vanilla'], character: ['Floral', 'Creamy', 'Luminous'],
             palette: { tint: [242, 190, 196], light: [255, 226, 224], mist: [255, 238, 240], shade: .03, energy: .45 } },
  woody:   { id: 'demo-woody', name: 'Man Gold', line: 'Eau de Toilette', image: 'assets/perfumes/man-gold.webp', moodKey: 'warm', mood: 'Warm · Bold', occasion: 'Everyday · Evening', longevity: 9,
             top: ['Cardamom', 'Bergamot', 'Black Pepper'], heart: ['Cedarwood', 'Vetiver', 'Iris'], base: ['Amber', 'Tonka', 'Sandalwood'], character: ['Woody', 'Spicy', 'Warm'],
             palette: { tint: [236, 172, 96], light: [255, 206, 140], mist: [255, 232, 200], shade: .04, energy: .5 } },
  forest:  { id: 'demo-forest', name: 'Red Temptation', line: 'Eau de Parfum', image: 'assets/perfumes/red-temptation.webp', moodKey: 'warm', mood: 'Warm · Mysterious', occasion: 'Special · Evening', longevity: 10,
             top: ['Saffron', 'Bitter Orange', 'Jasmine'], heart: ['Amberwood', 'Ambergris'], base: ['Cedarwood', 'Fir Resin', 'Musk'], character: ['Ambery', 'Woody', 'Radiant'],
             palette: { tint: [236, 172, 96], light: [255, 206, 140], mist: [255, 232, 200], shade: .04, energy: .5 } },
  citrus:  { id: 'demo-citrus', name: 'Applejuice', line: 'Day Collection — Eau de Toilette', image: 'assets/perfumes/apple-juice.webp', moodKey: 'playful', mood: 'Playful', occasion: 'Everyday', longevity: 4,
             top: ['Green Apple', 'Pear', 'Bergamot'], heart: ['Freesia', 'Jasmine', 'Peony'], base: ['White Musk', 'Cedarwood', 'Amber'], character: ['Crisp', 'Fruity', 'Radiant'],
             palette: { tint: [255, 206, 178], light: [255, 238, 214], mist: [255, 244, 236], shade: 0, energy: .95 } },
  aquatic: { id: 'demo-aquatic', name: 'Waterlily Tea Dress', line: 'Zara Emotions — Eau de Parfum', image: 'assets/perfumes/waterlily-tea-dress.webp', moodKey: 'fresh', mood: 'Fresh', occasion: 'Everyday', longevity: 5,
             top: ['Green Tea', 'Bergamot', 'Pear'], heart: ['Water Lily', 'Jasmine', 'Lotus'], base: ['White Musk', 'Cedarwood', 'Ambrette'], character: ['Aquatic', 'Floral', 'Serene'],
             palette: { tint: [206, 228, 222], light: [255, 253, 244], mist: [255, 255, 255], shade: 0, energy: .6 } },
  warm:    { id: 'demo-warm', name: 'Tobacco Collection', line: 'Rich · Warm · Addictive — Eau de Parfum', image: 'assets/perfumes/tobacco-rich-addictive.webp', moodKey: 'warm', mood: 'Warm', occasion: 'Evening · Everyday', longevity: 10,
             top: ['Bergamot', 'Cardamom', 'Pepper'], heart: ['Tobacco', 'Honey', 'Cinnamon'], base: ['Amber', 'Sandalwood', 'Tonka'], character: ['Warm', 'Woody', 'Refined'],
             palette: { tint: [236, 172, 96], light: [255, 206, 140], mist: [255, 232, 200], shade: .04, energy: .5 } },
  dark:    { id: 'demo-dark', name: 'Vibrant Leather', line: 'Eau de Parfum', image: 'assets/perfumes/vibrant-leather.webp', moodKey: 'bold', mood: 'Bold · Fresh', occasion: 'Everyday · Evening', longevity: 8,
             top: ['Bergamot', 'Cardamom', 'Pink Pepper'], heart: ['Leather', 'Iris', 'Lavender'], base: ['Suede', 'Cedarwood', 'Amber'], character: ['Leathery', 'Bold', 'Smooth'],
             palette: { tint: [196, 120, 90], light: [255, 214, 180], mist: [255, 232, 214], shade: .08, energy: .7 } },
  night:   { id: 'demo-night', name: 'Ebony Wood', line: 'Zara Emotions — Eau de Parfum', image: 'assets/perfumes/ebony-wood.webp', moodKey: 'mysterious', mood: 'Mysterious', occasion: 'Evening · Special', longevity: 11,
             top: ['Black Pepper', 'Bergamot', 'Cardamom'], heart: ['Ebony Wood', 'Incense', 'Patchouli'], base: ['Oud', 'Leather', 'Vetiver'], character: ['Smoky', 'Woody', 'Intense'],
             palette: { tint: [70, 62, 84], light: [196, 186, 214], mist: [224, 218, 232], shade: .34, energy: .3 } },
  nightlake: { id: 'demo-nightlake', name: 'Nuit', line: 'Eau de Parfum', image: 'assets/perfumes/nuit.webp', moodKey: 'mysterious', mood: 'Mysterious · Romantic', occasion: 'Evening · Special', longevity: 9,
             top: ['Blackcurrant', 'Pink Pepper', 'Bergamot'], heart: ['Orange Blossom', 'Jasmine', 'Tuberose'], base: ['Vanilla', 'Tonka', 'Patchouli'], character: ['Floral', 'Nocturnal', 'Sensual'],
             palette: { tint: [70, 62, 84], light: [196, 186, 214], mist: [224, 218, 232], shade: .34, energy: .3 } },
  snow:    { id: 'demo-snow', name: 'Man Silver', line: 'Eau de Toilette', image: 'assets/perfumes/man-silver.webp', moodKey: 'fresh', mood: 'Fresh', occasion: 'Everyday', longevity: 6,
             top: ['Lemon', 'Bergamot', 'Aldehydes'], heart: ['Lavender', 'Violet Leaf', 'Sage'], base: ['Cedarwood', 'Ambroxan', 'Musk'], character: ['Crisp', 'Clean', 'Cool'],
             palette: { tint: [206, 228, 222], light: [255, 253, 244], mist: [255, 255, 255], shade: 0, energy: .6 } },
};
if (DEMO === 'lobby') { setLink(true, 'Demo preview'); apply({ mode: 'idle' }); }
else if (DEMO) {
  setLink(true, 'Demo preview');
  apply({ mode: 'vr', perfume: DEMOS[DEMO] || DEMOS.warm });
} else { apply({ mode: 'idle' }); poll(); }

// warm the browser cache with the photos (downloaded once, decoded only when needed)
setTimeout(async () => {
  const seen = new Set();
  for (const k in PHOTOS) {
    const src = PHOTOS[k].src; if (seen.has(src)) continue; seen.add(src);
    try { await (await fetch(photoUrl(src))).arrayBuffer(); } catch {}   // read to the end, or the connection stays busy and blocks the kiosk link
    try { const d = await fetch(src.replace(/([^/]+)\.jpg$/, 'depth/$1.png')); if (d.ok) await d.arrayBuffer(); } catch {}   // and its depth map
  }
}, 4000);

/* ───────────────────────── enter VR (Quest) ───────────────────────── */

const enterBtn = $('#enterVR');
if (enterBtn) {
  if (!('xr' in navigator)) {
    $('#help').textContent = 'VR is not available here. Open this page in the Meta Quest Browser, over https.';
  } else {
    navigator.xr.isSessionSupported('immersive-vr').then(ok => {
      enterBtn.disabled = !ok;
      if (!ok) $('#help').textContent = 'This browser can show a preview, but VR needs the Meta Quest Browser (https).';
    });
    let entering = false;
    const enterVR = async () => {
      if (entering || renderer.xr.isPresenting || enterBtn.disabled) return;
      entering = true;
      Sound.start();
      try {
        const session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor'] });
        await renderer.xr.setSession(session);
        document.body.classList.add('in-vr');
        // Leaving VR (Exit VR button or the Quest menu) reloads the page, so the next visitor
        // always starts from a clean state and one tap brings them straight back in.
        session.addEventListener('end', () => { document.body.classList.remove('in-vr'); setTimeout(() => location.reload(), 300); });
      } catch (e) {
        $('#help').textContent = `Could not enter VR (${e.message}). Tap again, or reload the page.`;
      } finally { entering = false; }
    };
    enterBtn.addEventListener('click', e => { e.stopPropagation(); enterVR(); });
    // the whole page works as the button: point the controller anywhere and pull the trigger
    if (!EMBED && !DEMO) document.addEventListener('click', () => enterVR());
  }
}

/* ───────────────────────── Exit VR: a small button, reached with a controller ─────────────────────────
   Point a controller's laser at it and hold the trigger or the joystick (or keep a pinch, with
   hand tracking) for 1.5 seconds: it fills up, then the Quest goes back to the browser page, where
   staff tap Enter VR again. Letting go or pointing away cancels. Only shown inside the headset. */

const EXIT_HOLD = 1.5;
const exitBtn = (() => {
  const c = document.createElement('canvas'); c.width = 480; c.height = 150;
  const g = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = MAX_ANISO;
  const draw = (hover, fill) => {
    g.clearRect(0, 0, 480, 150);
    const pill = () => { g.beginPath(); g.roundRect(6, 6, 468, 138, 69); };
    g.fillStyle = hover ? 'rgba(40,28,20,.88)' : 'rgba(18,12,8,.6)'; pill(); g.fill();
    if (fill > 0) { g.save(); pill(); g.clip(); g.fillStyle = 'rgba(206,70,58,.95)'; g.fillRect(6, 6, 468 * fill, 138); g.restore(); }
    g.strokeStyle = hover ? 'rgba(255,255,255,.7)' : 'rgba(255,255,255,.3)'; g.lineWidth = 3; pill(); g.stroke();
    g.strokeStyle = '#f6eee3'; g.lineWidth = 7; g.lineCap = 'round';                   // ✕
    g.beginPath(); g.moveTo(58, 54); g.lineTo(96, 92); g.moveTo(96, 54); g.lineTo(58, 92); g.stroke();
    g.fillStyle = '#f6eee3'; g.textBaseline = 'middle';
    g.font = `600 46px ${SANS}`; g.fillText('Exit VR', 124, 64);
    g.font = `500 22px ${SANS}`; g.globalAlpha = .72; g.fillText(hover ? 'Keep holding…' : 'Point & hold 1.5 s', 126, 108); g.globalAlpha = 1;
    tex.needsUpdate = true;
  };
  draw(false, 0);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(.19, .059), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, toneMapped: false }));
  m.position.set(-.46, .88, -.95);                                       // small, low and to the left of the plinth
  m.lookAt(0, 1.5, 0);
  m.renderOrder = 50; m.visible = false;
  m.userData = { draw, hover: false, fill: 0 };
  scene.add(m);
  return m;
})();

function exitVR() { renderer.xr.getSession()?.end(); }

const controllers = [0, 1].map(i => {
  const ctrl = renderer.xr.getController(i);
  const ray = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]),
    new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: .3 }));
  ray.scale.z = 1.2; ctrl.add(ray);
  const dot = new THREE.Mesh(new THREE.SphereGeometry(.005, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  dot.visible = false; scene.add(dot);
  ctrl.userData = { ray, dot, hit: false, src: null, pinching: false };
  ctrl.addEventListener('connected', e => { ctrl.userData.src = e.data; });
  ctrl.addEventListener('disconnected', () => { ctrl.userData.src = null; });
  ctrl.addEventListener('selectstart', () => { ctrl.userData.pinching = true; });    // trigger, or a pinch with hand tracking
  ctrl.addEventListener('selectend', () => { ctrl.userData.pinching = false; });
  scene.add(ctrl);
  return ctrl;
});

const xrRay = new THREE.Raycaster(), rotM = new THREE.Matrix4();
let holdExit = 0;
function updateXRInput(dt) {
  const on = !!(renderer.xr.isPresenting || (DEMO && Q.has('exitbtn')));   // (&exitbtn shows it on demo pages, for checking)
  exitBtn.visible = on;
  if (!on) { holdExit = 0; return; }
  let hover = false, holding = false;
  for (const c of controllers) {
    rotM.identity().extractRotation(c.matrixWorld);
    xrRay.ray.origin.setFromMatrixPosition(c.matrixWorld);
    xrRay.ray.direction.set(0, 0, -1).applyMatrix4(rotM);
    const hit = xrRay.intersectObject(exitBtn, false)[0];
    c.userData.hit = !!hit; c.userData.ray.scale.z = hit ? hit.distance : 1.2;
    c.userData.dot.visible = !!hit; if (hit) c.userData.dot.position.copy(hit.point);
    if (!hit) continue;
    hover = true;
    const b = c.userData.src?.gamepad?.buttons;                              // xr-standard: 0 = trigger, 3 = joystick press
    if (c.userData.pinching || b?.[0]?.pressed || b?.[3]?.pressed) holding = true;
  }
  holdExit = holding ? holdExit + dt : 0;                                    // only while pointing AND holding
  const fill = Math.min(1, holdExit / EXIT_HOLD);
  const u = exitBtn.userData;
  if (hover !== u.hover || Math.abs(fill - u.fill) > .02) { u.hover = hover; u.fill = fill; u.draw(hover, fill); }
  exitBtn.scale.setScalar(hover ? 1.06 : 1);
  if (fill >= 1) { holdExit = 0; exitVR(); }
}

/* ───────────────────────── look around with the mouse / finger (preview) ───────────────────────── */

let yaw = 0, pitch = -.06, dragging = false, lx = 0, ly = 0, lastDrag = -1e9;
renderer.domElement.addEventListener('pointerdown', e => { dragging = true; lx = e.clientX; ly = e.clientY; Sound.start(); });
addEventListener('pointerup', () => { dragging = false; lastDrag = performance.now(); });
addEventListener('pointermove', e => {
  if (!dragging) return;
  yaw -= (e.clientX - lx) * .0045; pitch = clamp(pitch - (e.clientY - ly) * .0045, -1.25, 1.25);
  lx = e.clientX; ly = e.clientY; lastDrag = performance.now();
});
// demo pages: window.look(yawRadians, pitchRadians) aims the preview camera (for lining up photos)
if (DEMO) {
  window.look = (y, p = -.06) => { yaw = y; pitch = p; lastDrag = performance.now() + 1e9; };
  if (Q.has('yaw')) look(+Q.get('yaw'), +(Q.get('pitch') ?? -.06));
}
// inside the kiosk: pass key presses back so Enter / Esc keep working after clicking the preview
if (EMBED) Sound.start();
if (EMBED && parent !== window) {
  for (const type of ['keydown', 'keyup']) addEventListener(type, e => {
    try { parent.dispatchEvent(new parent.KeyboardEvent(type, { key: e.key, repeat: e.repeat })); } catch {}
  });
}

/* ───────────────────────── animation ───────────────────────── */

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), .05), T = clock.elapsedTime;
  wind.value = T;

  // fade to dark → swap world → fade in
  if (pendingBuild) {
    veil.material.opacity = Math.min(1, veil.material.opacity + dt / .6);
    if (veil.material.opacity >= 1) {
      if (world) { scene.remove(world); dispose(world); }
      worldUpdate = null;
      world = pendingBuild(); pendingBuild = null;
      scene.add(world);
    }
  } else if (veil.material.opacity > 0) {
    veil.material.opacity = Math.max(0, veil.material.opacity - dt / 1.4);
  }
  veil.visible = veil.material.opacity > .001;

  // palette → fallback scene
  skyU.time.value = T;
  scene.fog.color.copy(pal.fog); scene.fog.density = pal.fogD;
  floorMat.color.copy(pal.ground);
  sun.color.copy(pal.sun); hemi.color.copy(pal.mid); hemi.groundColor.copy(pal.ground);
  sunSprite.material.color.copy(pal.sun); sunSprite.material.opacity = pal.sunGlow;

  worldUpdate?.(T, dt);

  if (world) world.traverse(o => {
    const u = o.userData;
    if (u.pano) u.pano.time.value = T;
    if (u.note) {                                           // a slow, small float — calm, never swimming
      o.position.y = u.baseY + Math.sin(T * .55 * u.speed + u.phase) * .012;
      u.glow.material.opacity = .45 + Math.sin(T * 1.2 + u.phase) * .12;
    }
  });

  // preview: drag to look; after 6 s idle it slowly looks around by itself; a slight sway shows the depth
  if (!renderer.xr.isPresenting) {
    if (!dragging && performance.now() - lastDrag > 6000) yaw += dt * .05;
    camera.rotation.set(pitch, yaw, 0, 'YXZ');
    camera.position.set(Math.sin(T * .23) * .06, 1.6 + Math.sin(T * .31) * .015, Math.cos(T * .19) * .03);
  }

  updateXRInput(dt);
  renderer.render(scene, camera);
});
