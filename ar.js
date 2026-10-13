/* ==========================================================================
   SYNTRA — AR on the visitor's phone (opened from the QR code on the receipt)

     ar.html?p=<perfume id>&m=<mood>     what the receipt printed
     ar.html?...&view                    3D view without the camera (also the fallback)
   The camera opens as soon as the page loads (no start screen).

   The camera part uses MindAR (image tracking, MIT licence, vendor/mindar/):
   it recognises one of the six mood drawings (assets/ar/targets.mind, built by
   tools/build-ar-targets.mjs) and places the scene from ar-scene.js on it.
   ========================================================================== */
import * as THREE from 'three';
import { Experience, loadFont, studioEnvironment } from './ar-scene.js';
import { receiptCanvas, thermalLook, MOOD_KEYS, MARKER } from './receipt.js';   // (drawings: one per perfume, see receipt.js)

const $ = s => document.querySelector(s);
const Q = new URLSearchParams(location.search);
const data = await (await fetch('assets/ar/perfumes.json')).json();
const dominant = p => Object.entries(p.mood).sort((a, b) => b[1] - a[1])[0][0];

let perfume = data.perfumes.find(p => p.id === Q.get('p')) || null;
let moodKey = MOOD_KEYS.includes(Q.get('m')) ? Q.get('m') : (perfume ? dominant(perfume) : null);
const forMood = k => data.perfumes.find(p => dominant(p) === k) || data.perfumes[0];

const fontReady = loadFont();

// the perfume's name, on screen just below SYNTRA
function showName(e) {
  $('#pname .n').textContent = e.perfume.name;
  $('#pname .m').textContent = `Zara  ·  ${data.moods[e.moodKey]?.name || ''}`;
  $('#pname').classList.add('on');
}
function hint(text, ms = 0) {
  const h = $('#hint'); h.textContent = text; h.classList.toggle('on', !!text);
  clearTimeout(hint.timer); if (ms) hint.timer = setTimeout(() => h.classList.remove('on'), ms);
}
function chime() {                                       // a soft bell when the scene appears
  try {
    const ctx = chime.ctx || (chime.ctx = new (window.AudioContext || window.webkitAudioContext)());
    const t = ctx.currentTime;
    [0, 4, 7, 11].forEach((st, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine';
      o.frequency.value = 523.25 * Math.pow(2, st / 12);
      g.gain.setValueAtTime(0, t + i * .12); g.gain.linearRampToValueAtTime(.06, t + i * .12 + .02); g.gain.exponentialRampToValueAtTime(.0001, t + i * .12 + 2.4);
      o.connect(g); g.connect(ctx.destination); o.start(t + i * .12); o.stop(t + i * .12 + 2.5);
    });
  } catch {}
}
function lights(scene, renderer) {
  scene.environment = studioEnvironment(renderer);
  const hemi = new THREE.HemisphereLight(0xfff6ea, 0x3a2c22, 1.1); hemi.position.set(0, 0, 1);
  const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(-.6, -1.2, 2);
  scene.add(hemi, key);
}
function makeExperience(k, occlude = true) {
  const m = k || moodKey || 'fresh';
  const p = perfume || forMood(m);
  return fontReady.then(font => new Experience({ perfume: p, moodKey: m, mood: data.moods[m], font, occlude }));
}
// the scene for the perfume whose drawing the camera sees (its receipt's mood if it is the one from the link)
function experienceFor(p) {
  const m = perfume && p.id === perfume.id && moodKey ? moodKey : dominant(p);
  return fontReady.then(font => new Experience({ perfume: p, moodKey: m, mood: data.moods[m], font }));
}
function disposeTree(o) {
  o.traverse(n => { n.geometry?.dispose(); const mt = n.material; (Array.isArray(mt) ? mt : mt ? [mt] : []).forEach(x => x.dispose()); });
}
function tapper(renderer, camera, getExp) {
  const ray = new THREE.Raycaster(), v = new THREE.Vector2();
  renderer.domElement.addEventListener('pointerup', e => {
    const exp = getExp(); if (!exp || exp.t < 3 || e.pointerType === 'mouse' && e.button !== 0) return;
    if (Math.hypot(e.clientX - (tapper.x ?? e.clientX), e.clientY - (tapper.y ?? e.clientY)) > 8) return;   // it was a drag
    const r = renderer.domElement.getBoundingClientRect();
    v.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
    ray.setFromCamera(v, camera);
    exp.tap(ray);
  });
  renderer.domElement.addEventListener('pointerdown', e => { tapper.x = e.clientX; tapper.y = e.clientY; });
}

/* ───────── camera mode: the receipt comes alive ───────── */

async function startAR() {
  $('#loading').classList.add('on');
  if (!navigator.mediaDevices?.getUserMedia) return fail('no camera');
  // on a slow network (the online link over a hotspot) the camera files take minutes: show the 3D view instead
  const slow = setTimeout(() => fail('slow network'), 20000);
  let mindar;
  try {
    const { MindARThree } = await import('./vendor/mindar/mindar-image-three.prod.js');
    if (fail.done) return;
    mindar = new MindARThree({
      container: $('#ar'), imageTargetSrc: 'assets/ar/targets.mind', maxTrack: 1,
      uiLoading: 'no', uiScanning: 'no', uiError: 'no',
      filterMinCF: .0001, filterBeta: .01,                // steady, not jittery
    });
  } catch (e) { return fail(e); }
  const { renderer, scene, camera } = mindar;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  lights(scene, renderer);

  // one drawing per perfume (target i = perfume i): point at another receipt and its perfume appears
  let exp = null, seen = false, token = 0;
  data.perfumes.forEach((p, i) => {
    const anchor = mindar.addAnchor(i);
    anchor.onTargetFound = async () => {
      if (!exp || exp.perfume.id !== p.id) {
        const mine = ++token, next = await experienceFor(p);
        if (mine !== token) { disposeTree(next.root); return; }
        if (exp) { exp.root.removeFromParent(); disposeTree(exp.root); }
        exp = next; chime();
      }
      if (exp.root.parent !== anchor.group) anchor.group.add(exp.root);
      document.body.dataset.perfume = p.id;
      setTimeout(() => showName(exp), 1800);
      exp.start();
      $('#scan').classList.remove('on'); $('#brand').classList.add('on');
      hint('');
      if (!seen) { seen = true; setTimeout(() => hint('Tap an ingredient to see it closer', 4000), 6000); }
    };
    anchor.onTargetLost = () => hint('Bring the drawing back into view');
  });
  tapper(renderer, camera, () => exp);

  try { await mindar.start(); } catch (e) { return fail(e); }
  clearTimeout(slow);
  if (fail.done) { mindar.stop(); $('#ar').replaceChildren(); return; }   // too late: the 3D view is already showing
  $('#loading').classList.remove('on');
  $('#scan').classList.add('on');
  hint('Point your camera at the drawing');
  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    exp?.update(Math.min(clock.getDelta(), .05), camera);
    renderer.render(scene, camera);
  });
}

function fail(e) {                                       // no camera (or not allowed): show the scene in 3D instead
  if (fail.done) return;
  fail.done = true;
  console.warn(e);
  $('#loading').classList.remove('on');
  startView();
  setTimeout(() => hint('Camera unavailable · showing your scent in 3D', 5000), 600);
}

/* ───────── 3D view: a virtual receipt on a table (no camera needed) ───────── */

async function startView() {
  $('#loading').classList.remove('on');
  const m = moodKey || 'fresh', p = perfume || forMood(m);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  $('#view').appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a130e);
  scene.fog = new THREE.Fog(0x1a130e, 5, 11);
  const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, .01, 50);
  camera.up.set(0, 0, 1);
  addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
  lights(scene, renderer);

  // the table and the receipt, exactly as printed (drawing centred on the origin, 1 unit wide)
  const table = new THREE.Mesh(new THREE.CircleGeometry(30, 64), new THREE.MeshStandardMaterial({ color: 0x2a2019, roughness: .9 }));
  table.position.z = -.004; scene.add(table);
  const rc = await receiptCanvas({ perfume: p, moodKey: m, choices: {}, url: location.href });
  const tex = new THREE.CanvasTexture(thermalLook(rc)); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const W = rc.width / MARKER, H = rc.height / MARKER;
  const paper = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshStandardMaterial({ map: tex, roughness: .85, color: 0xf6f1e8 }));
  paper.position.y = ((rc.markerY + MARKER / 2) - rc.height / 2) / MARKER;
  scene.add(paper);

  const exp = await makeExperience(m, false);           // the paper in this view already hides what is below it
  window.syntraView = { exp, camera, renderer };          // (for testing taps)
  scene.add(exp.root);
  setTimeout(() => { exp.start(); setTimeout(() => showName(exp), 1800); }, 500);
  $('#brand').classList.add('on');
  setTimeout(() => hint('Drag to look around · Tap an ingredient', 5000), 5500);

  // orbit with a finger / mouse, pinch or scroll to zoom
  const target = new THREE.Vector3(0, 0, .55);
  let az = Q.has('az') ? +Q.get('az') : 0, el = Q.has('el') ? +Q.get('el') : .5, dist = 3.6, drag = null, idle = 0;
  const pts = new Map();
  renderer.domElement.addEventListener('pointerdown', e => { pts.set(e.pointerId, [e.clientX, e.clientY]); drag = [e.clientX, e.clientY]; idle = 0; });
  addEventListener('pointerup', e => { pts.delete(e.pointerId); drag = null; });
  addEventListener('pointermove', e => {
    if (pts.size === 2 && pts.has(e.pointerId)) {
      const [a, b] = [...pts.values()], d0 = Math.hypot(a[0] - b[0], a[1] - b[1]);
      pts.set(e.pointerId, [e.clientX, e.clientY]);
      const [c, d] = [...pts.values()]; dist = THREE.MathUtils.clamp(dist * d0 / Math.hypot(c[0] - d[0], c[1] - d[1]), 2, 8);
      return;
    }
    if (!drag) return;
    az -= (e.clientX - drag[0]) * .006; el = THREE.MathUtils.clamp(el + (e.clientY - drag[1]) * .005, .12, 1.45);
    drag = [e.clientX, e.clientY]; pts.set(e.pointerId, drag);
  });
  renderer.domElement.addEventListener('wheel', e => { dist = THREE.MathUtils.clamp(dist * (1 + e.deltaY * .001), 2, 8); }, { passive: true });
  tapper(renderer, camera, () => exp);

  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), .05);
    if (!drag && (idle += dt) > 6 && !Q.has('az')) az += dt * .08;       // turns slowly by itself when left alone
    camera.position.set(target.x + Math.sin(az) * Math.cos(el) * dist, target.y - Math.cos(az) * Math.cos(el) * dist, target.z + Math.sin(el) * dist);
    camera.lookAt(target);
    exp.update(dt, camera);
    renderer.render(scene, camera);
  });
}

// scanning the QR code opens the camera straight away (the browser asks for permission once)
if (Q.has('view')) startView(); else startAR();
addEventListener('pointerdown', () => chime.ctx?.resume(), { once: true });
