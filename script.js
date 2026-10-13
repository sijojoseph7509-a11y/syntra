'use strict';
/* ==========================================================================
   SCENT FINDER × ZARA — script.js

   The physical installation is the interface. This file is the world
   that responds to it.

    1. Config & timing          7. Atmosphere (controls → light & colour)
    2. Perfume catalogue        8. Physical-controls panel (HUD)
    3. Controls model           9. Particles (motes, spray, possibilities, convergence)
    4. Input: keyboard + button 10. State machine
    5. Input: Arduino (Serial)  11. Sound
    6. Stage & camera           12. Boot
   ========================================================================== */


/* ───────────────────────── 1. CONFIG & TIMING ───────────────────────── */

const CONFIG = {
  BAUD: 115200,

  // Which number in the Arduino line drives which control (0 = first number).
  // New sketch sends:  V,<knob>,<slider1>,<slider2>,<slider3>
  // Knob = Mood · Slider 1 = Longevity · Slider 2 = Expression · Slider 3 = Occasion
  SERIAL_MAP: { mood: 0, longevity: 1, expression: 2, occasion: 3 },
  // Older 6-control sketch (Season,Mood,Gender,Longevity,Intensity,Occasion):
  SERIAL_MAP_6: { mood: 1, expression: 2, longevity: 3, occasion: 5 },
  // Flip a control if it runs the "wrong way" on your hardware
  // (the 3 sliders are mounted upside down: flipped so the TOP of each slider is its first step —
  //  slider 1: 4 → 8 → 12 h · slider 2: Feminine → Unisex → Masculine · slider 3: Everyday → Evening → Special)
  INVERT: { mood: false, expression: true, longevity: true, occasion: true },
  // Knob readings (0..1) at the 11 calibration points, Fresh → Mysterious (see KnobCal; K re-measures)
  KNOB_MARKS: null,
  // Ignore the last few % at each end of a pot (they rarely reach 0 / max)
  EDGE: 0.03,

  LONG_PRESS_MS: 2000,                  // hold the button this long → reset (on the result screen: print the receipt)
  RESULT_IDLE_RESET_MS: 60000,          // result screen returns to start after this
  INTERACTION_IDLE_RESET_MS: 180000,    // nobody touching anything → back to start
  SOUND: true,
  SHOW_HUD: false,                      // on-screen controls panel (press H to show while testing)
  MOOD_GRADING: true,                   // false = background stays exactly as the photo
  VR_ENABLED: true,                     // double-press on the result → Meta Quest VR (needs server.py)
  DOUBLE_PRESS_MS: 450,                 // max gap between two presses to count as a double-press
  VR_MAX_MS: 300000,                    // VR returns to the start after 5 minutes
  VR_PREVIEW_ON_SCREEN: true,           // also show the VR world full-screen on this screen (drag to look)
  PRINT_ENABLED: true,                  // hold the button on the result → 58 mm receipt with the AR drawing (needs server.py)
  AR_BASE_URL: '',                      // '' = https://<this Mac's IP>:5643/ar.html · or an online copy, e.g. https://you.github.io/syntra/ar.html
};

const TIMING = {        // milliseconds
  zoom: 3600,           // intro → close-up on the cap
  spray: 1300,          // spray burst before the possibilities
  possibilities: 2000,  // particle field
  convergence: 2900,    // particles collapse into the bottle
  reveal: 1400,         // bottle appears, copy follows
};


/* ───────────────────────── 2. PERFUME CATALOGUE ─────────────────────────
   Add perfumes by copying a block. Images live in assets/perfumes/.
   mood        : weights for Fresh, Playful, Romantic, Warm, Bold, Mysterious
   expression  : 0 = feminine · 0.5 = unisex · 1 = masculine
   longevity   : hours on skin
   occasion    : any of everyday, evening, special
   mrp         : placeholder prices, update to your store's current prices
   ───────────────────────────────────────────────────────────────────── */

const PERFUMES = [
  { id: 'tobacco-rich-addictive', name: 'Tobacco Collection', line: 'Rich · Warm · Addictive — Eau de Parfum',
    mood: { warm: 1, bold: .55, mysterious: .35 }, expression: .72, longevity: 10, occasion: ['evening', 'everyday'],
    top: ['Bergamot', 'Cardamom', 'Pepper'], heart: ['Tobacco', 'Honey', 'Cinnamon'], base: ['Amber', 'Sandalwood', 'Tonka'],
    character: ['Warm', 'Woody', 'Refined'], mrp: '₹ 2,550' },

  { id: 'tobacco-intense-dark', name: 'Tobacco Collection', line: 'Intense · Dark · Exclusive — Eau de Parfum',
    mood: { mysterious: 1, bold: .85 }, expression: .86, longevity: 12, occasion: ['evening', 'special'],
    top: ['Rum', 'Saffron', 'Pink Pepper'], heart: ['Tobacco Leaf', 'Leather', 'Labdanum'], base: ['Oud', 'Patchouli', 'Vanilla'],
    character: ['Dark', 'Smoky', 'Opulent'], mrp: '₹ 2,550' },

  { id: 'amber-fusion', name: 'Amber Fusion', line: 'Eau de Parfum',
    mood: { warm: 1, romantic: .55 }, expression: .36, longevity: 8, occasion: ['evening', 'special'],
    top: ['Bergamot', 'Pink Pepper', 'Mandarin'], heart: ['Amber', 'Jasmine', 'Orange Blossom'], base: ['Vanilla', 'Benzoin', 'Musk'],
    character: ['Warm', 'Ambery', 'Sensual'], mrp: '₹ 1,590' },

  { id: 'apple-juice', name: 'Applejuice', line: 'Day Collection — Eau de Toilette',
    mood: { fresh: .9, playful: 1 }, expression: .28, longevity: 4, occasion: ['everyday'],
    top: ['Green Apple', 'Pear', 'Bergamot'], heart: ['Freesia', 'Jasmine', 'Peony'], base: ['White Musk', 'Cedarwood', 'Amber'],
    character: ['Crisp', 'Fruity', 'Radiant'], mrp: '₹ 1,290' },

  { id: 'ebony-wood', name: 'Ebony Wood', line: 'Zara Emotions — Eau de Parfum',
    mood: { mysterious: .95, bold: .7, warm: .3 }, expression: .78, longevity: 11, occasion: ['evening', 'special'],
    top: ['Black Pepper', 'Bergamot', 'Cardamom'], heart: ['Ebony Wood', 'Incense', 'Patchouli'], base: ['Oud', 'Leather', 'Vetiver'],
    character: ['Smoky', 'Woody', 'Intense'], mrp: '₹ 3,990' },

  { id: 'femme', name: 'Femme', line: 'Night Collection — Eau de Parfum',
    mood: { romantic: 1, playful: .5, fresh: .3 }, expression: .08, longevity: 6, occasion: ['everyday', 'special'],
    top: ['Pink Pepper', 'Mandarin', 'Pear'], heart: ['Tuberose', 'Jasmine', 'Peony'], base: ['White Musk', 'Vanilla', 'Cedarwood'],
    character: ['Floral', 'Soft', 'Radiant'], mrp: '₹ 1,990' },

  { id: 'nuit', name: 'Nuit', line: 'Night Collection — Eau de Parfum',
    mood: { mysterious: 1, romantic: .6, warm: .5 }, expression: .2, longevity: 8, occasion: ['evening', 'special'],
    top: ['Blackcurrant', 'Pink Pepper', 'Bergamot'], heart: ['Orange Blossom', 'Jasmine', 'Tuberose'], base: ['Vanilla', 'Tonka', 'Patchouli'],
    character: ['Sensual', 'Nocturnal', 'Velvety'], mrp: '₹ 1,990' },

  { id: 'gardenia', name: 'Gardenia', line: 'Bloom Collection — Eau de Parfum',
    mood: { romantic: 1, fresh: .5 }, expression: .05, longevity: 6, occasion: ['everyday', 'special'],
    top: ['Pear', 'Mandarin', 'Neroli'], heart: ['Gardenia', 'Jasmine', 'Tuberose'], base: ['White Musk', 'Sandalwood', 'Vanilla'],
    character: ['Floral', 'Creamy', 'Luminous'], mrp: '₹ 1,990' },

  { id: 'hypnotic-vanilla', name: 'Hypnotic Vanilla', line: 'Eau de Parfum',
    mood: { warm: .95, mysterious: .6, romantic: .4 }, expression: .24, longevity: 9, occasion: ['evening', 'special'],
    top: ['Almond', 'Bergamot', 'Pink Pepper'], heart: ['Vanilla Orchid', 'Heliotrope', 'Tonka'], base: ['Vanilla', 'Benzoin', 'Sandalwood'],
    character: ['Gourmand', 'Velvety', 'Hypnotic'], mrp: '₹ 1,590' },

  { id: 'man-blue-spirit', name: 'Man Blue Spirit', line: 'Eau de Toilette',
    mood: { fresh: 1, bold: .6, playful: .3 }, expression: .92, longevity: 6, occasion: ['everyday'],
    top: ['Grapefruit', 'Mint', 'Bergamot'], heart: ['Lavender', 'Geranium', 'Sea Notes'], base: ['Vetiver', 'Cedarwood', 'Musk'],
    character: ['Aquatic', 'Fresh', 'Energetic'], mrp: '₹ 1,990' },

  { id: 'man-gold', name: 'Man Gold', line: 'Eau de Toilette',
    mood: { warm: .85, bold: .85 }, expression: .95, longevity: 8, occasion: ['everyday', 'evening'],
    top: ['Cardamom', 'Bergamot', 'Black Pepper'], heart: ['Lavender', 'Cinnamon', 'Iris'], base: ['Amber', 'Tonka', 'Vetiver'],
    character: ['Spiced', 'Ambery', 'Assured'], mrp: '₹ 1,490' },

  { id: 'man-silver', name: 'Man Silver', line: 'Eau de Toilette',
    mood: { fresh: 1, bold: .3 }, expression: .9, longevity: 5, occasion: ['everyday'],
    top: ['Lemon', 'Bergamot', 'Aldehydes'], heart: ['Lavender', 'Violet Leaf', 'Sage'], base: ['Cedarwood', 'Ambroxan', 'Musk'],
    character: ['Clean', 'Aromatic', 'Polished'], mrp: '₹ 1,490' },

  { id: 'orchid', name: 'Orchid', line: 'Bloom Collection — Eau de Parfum',
    mood: { romantic: .9, playful: .8 }, expression: .12, longevity: 7, occasion: ['special', 'evening'],
    top: ['Pear', 'Pink Pepper', 'Blackcurrant'], heart: ['Orchid', 'Peony', 'Rose'], base: ['Patchouli', 'Vanilla', 'Musk'],
    character: ['Floral', 'Velvety', 'Chic'], mrp: '₹ 1,990' },

  { id: 'red-temptation-tobacco', name: 'Red Temptation & Tobacco', line: 'Eau de Parfum',
    mood: { bold: 1, warm: .7 }, expression: .6, longevity: 10, occasion: ['evening', 'special'],
    top: ['Saffron', 'Bitter Orange', 'Pink Pepper'], heart: ['Tobacco Leaf', 'Jasmine', 'Amberwood'], base: ['Vanilla', 'Tonka', 'Cedarwood'],
    character: ['Rich', 'Spiced', 'Magnetic'], mrp: '₹ 1,590' },

  { id: 'red-temptation', name: 'Red Temptation', line: 'Eau de Parfum',
    mood: { warm: .8, mysterious: .75, romantic: .45 }, expression: .46, longevity: 10, occasion: ['special', 'evening'],
    top: ['Saffron', 'Bitter Orange', 'Jasmine'], heart: ['Amberwood', 'Ambergris'], base: ['Cedarwood', 'Fir Resin', 'Musk'],
    character: ['Ambery', 'Luminous', 'Addictive'], mrp: '₹ 1,590' },

  { id: 'rose-gourmand', name: 'Rose Gourmand', line: 'Eau de Parfum',
    mood: { playful: 1, romantic: .6 }, expression: .15, longevity: 7, occasion: ['everyday', 'special'],
    top: ['Raspberry', 'Pink Pepper', 'Bergamot'], heart: ['Rose', 'Praline', 'Peony'], base: ['Vanilla', 'Caramel', 'Musk'],
    character: ['Sweet', 'Rosy', 'Playful'], mrp: '₹ 1,590' },

  { id: 'vibrant-leather', name: 'Vibrant Leather', line: 'Eau de Parfum',
    mood: { bold: 1, fresh: .35 }, expression: .8, longevity: 9, occasion: ['everyday', 'evening'],
    top: ['Bergamot', 'Cardamom', 'Pink Pepper'], heart: ['Leather', 'Iris', 'Lavender'], base: ['Suede', 'Cedarwood', 'Amber'],
    character: ['Leathery', 'Confident', 'Modern'], mrp: '₹ 2,290' },

  { id: 'waterlily-tea-dress', name: 'Waterlily Tea Dress', line: 'Zara Emotions — Eau de Parfum',
    mood: { fresh: 1, romantic: .45 }, expression: .32, longevity: 5, occasion: ['everyday'],
    top: ['Green Tea', 'Bergamot', 'Pear'], heart: ['Water Lily', 'Jasmine', 'Lotus'], base: ['White Musk', 'Cedarwood', 'Ambrette'],
    character: ['Aquatic', 'Floral', 'Serene'], mrp: '₹ 3,990' },

  { id: 'wonder-rose', name: 'Wonder Rose', line: 'Day Collection — Eau de Toilette',
    mood: { fresh: .95, romantic: .8, playful: .3 }, expression: .04, longevity: 4, occasion: ['everyday'],
    top: ['Blackcurrant', 'Bergamot', 'Mandarin'], heart: ['Rose', 'Jasmine', 'Peony'], base: ['Musk', 'Sandalwood', 'Amber'],
    character: ['Rosy', 'Fresh', 'Graceful'], mrp: '₹ 1,290' },
];
PERFUMES.forEach(p => { p.image = `assets/perfumes/${p.id}.webp`; });


/* ───────────────────────── 3. CONTROLS MODEL ───────────────────────── */

const MOODS = ['Fresh', 'Playful', 'Romantic', 'Warm', 'Bold', 'Mysterious'];
const MOOD_KEYS = MOODS.map(m => m.toLowerCase());
const EXPRESSIONS = ['Feminine', 'Unisex', 'Masculine'];
const OCCASIONS = ['Everyday', 'Evening', 'Special'];
const HOURS = [4, 8, 12];                      // longevity slider steps
const OCC_KEYS = OCCASIONS.map(o => o.toLowerCase());

const CONTROL_DEFS = [
  { key: 'mood',       label: 'Mood',       device: 'Knob',     type: 'knob' },
  { key: 'longevity',  label: 'Longevity',  device: 'Slider 1', type: 'slider' },   // same order as the physical controls
  { key: 'expression', label: 'Expression', device: 'Slider 2', type: 'slider' },
  { key: 'occasion',   label: 'Occasion',   device: 'Slider 3', type: 'slider' },
];

// 0..1 values: target = what the hardware says, ctl = smoothed (UI), look = slower (atmosphere)
const target = { mood: .56, expression: .5, longevity: .6, occasion: .12 };
const ctl  = { ...target };
const look = { ...target };
const zones = { mood: -1, expression: -1, occasion: -1, longevity: -1, hours: -1 };



// Discrete zone with hysteresis so values never flicker on a boundary
function zoneOf(v, n, prev) {
  let z = Math.min(n - 1, Math.max(0, Math.floor(v * n)));
  if (prev >= 0 && z !== prev) {
    const lo = prev / n - .025, hi = (prev + 1) / n + .025;
    if (v >= lo && v <= hi) z = prev;
  }
  return z;
}
function describeControls() {
  return {
    mood: MOODS[zones.mood],
    expression: EXPRESSIONS[zones.expression],
    longevity: `${zones.hours} hours`,
    occasion: OCCASIONS[zones.occasion],
  };
}


/* ───────────────────────── helpers ───────────────────────── */

const $ = s => document.querySelector(s);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const clamp01 = v => clamp(v, 0, 1);
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const easeInOutCubic = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const easeInOutSine = t => -(Math.cos(Math.PI * t) - 1) / 2;
const easeOutCubic = t => 1 - Math.pow(1 - t, 3);
const rand = (a, b) => a + Math.random() * (b - a);
const gauss = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const approach = (cur, tgt, rate, dt) => cur + (tgt - cur) * (1 - Math.exp(-rate * dt));
const mixRGB = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const rgbStr = c => `${c[0] | 0}, ${c[1] | 0}, ${c[2] | 0}`;
function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

let VW = innerWidth, VH = innerHeight, S = VH / 1000;   // S = scale unit for particles
let now = performance.now(), T = 0;                      // T = seconds since boot


/* ───────────────────────── 4. INPUT: KEYBOARD + BUTTON ───────────────────────── */

const Input = {
  mode: 'simulation',          // 'simulation' | 'arduino'
  lastTouch: performance.now(),
  set(key, v) {
    v = clamp01(v);
    if (Math.abs(v - target[key]) < .004) return;
    target[key] = v;
    this.lastTouch = performance.now();
  },
};

/* ── Knob calibration (K): matched to the printed mood dial. Its 6 marks, measured from
   a photo of the dial (0° = straight up, clockwise): Fresh −145° · Playful −90° ·
   Romantic −35° · Warm +35° · Bold +90° · Mysterious +145° — the Romantic–Warm gap is
   wider (70°) than the others (55°). The halfway points fall on 8, 10, 12, 2 and 4
   o'clock. Staff point the knob at each mark AND each halfway point (11 points),
   pressing the button at each; the readings
   are saved in this browser. The knob's reading doesn't change evenly as it turns, so
   the halfway points are measured, not guessed: each mood changes exactly halfway
   between two labels, exactly as printed on the dial. CONFIG.KNOB_MARKS holds readings
   for the exhibition knob, used when this browser has none saved. ── */
const KnobCal = {
  KEY: 'syntra.knobMarks11', STEPS: 11,
  ANGLES: [-145, -117.5, -90, -62.5, -35, 0, 35, 62.5, 90, 117.5, 145],   // the printed dial (marks and halfway points)
  CLOCK: ['8', '10', '12', '2', '4'],                                        // where the halfway points are, roughly
  points: null, active: false, step: 0, taken: [], raw: null, el: null,
  load() {
    try { const p = JSON.parse(localStorage.getItem(this.KEY)); if (Array.isArray(p) && p.length === this.STEPS) { this.points = p; return; } } catch {}
    if (Array.isArray(CONFIG.KNOB_MARKS) && CONFIG.KNOB_MARKS.length === this.STEPS) this.points = CONFIG.KNOB_MARKS;
  },
  // reading (0..1) → position along the turn (0..1): point j (0…10) sits at (j + 1) / 12,
  // so each label is the middle of its mood and each halfway point is a mood boundary
  map(v) {
    const p = this.points; if (!p) return v;
    const asc = p[p.length - 1] > p[0], q = asc ? p : [...p].reverse(), n = q.length;
    const at = i => ((asc ? i : n - 1 - i) + 1) / (n + 1);
    let i = 0; while (i < n - 2 && v > q[i + 1]) i++;                 // segment i … i+1 (the end segments extend past the ends)
    const f = (v - q[i]) / Math.max(1e-6, q[i + 1] - q[i]);
    return clamp01(at(i) + (at(i + 1) - at(i)) * f);
  },
  start() {
    this.active = true; this.step = 0; this.taken = [];
    if (!this.el) {
      this.el = document.createElement('div');
      this.el.style.cssText = 'position:fixed;inset:0;z-index:9999;display:grid;place-items:center;background:rgba(14,10,7,.84);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);color:#f6eee3;font-family:var(--sans, Manrope, sans-serif);text-align:center';
      document.body.appendChild(this.el);
    }
    this.el.style.display = 'grid';
    this.render();
  },
  stop(msg) {
    if (msg) { this.render(msg); setTimeout(() => this.stop(), 2200); this.active = false; return; }
    this.active = false; if (this.el) this.el.style.display = 'none';
  },
  capture() {
    if (!this.active) return;
    if (this.raw === null) { this.render('Connect the Arduino first (plug icon or J), then press K again.'); return; }
    this.taken.push(this.raw); this.step++;
    if (this.step < this.STEPS) { this.render(); return; }
    const t = this.taken, up = t[t.length - 1] > t[0];
    const ok = Math.abs(t[t.length - 1] - t[0]) > .3 && t.every((v, i) => i === 0 || (up ? v - t[i - 1] > .003 : t[i - 1] - v > .003));
    if (!ok) { this.step = 0; this.taken = []; this.render('Two points gave the same reading, or the knob went backwards. Let’s start again from Fresh.'); return; }
    this.points = t;
    try { localStorage.setItem(this.KEY, JSON.stringify(t)); } catch {}
    this.stop('Saved. Each mood now lights up when the pointer is on its label.');
  },
  clear() {
    try { localStorage.removeItem(this.KEY); } catch {}
    this.points = null; this.load();
    this.stop(this.points ? 'Cleared. The knob uses the exhibition calibration again.' : 'Cleared. The knob uses its default curve again.');
  },
  render(note = '') {
    const cx = 150, cy = 140, r = 92, ang = i => this.ANGLES[i] * Math.PI / 180;     // the printed dial
    const pt = (a, rr) => [cx + Math.sin(a) * rr, cy - Math.cos(a) * rr];
    let ticks = '';
    for (let i = 0; i < this.STEPS; i++) {
      const [x, y] = pt(ang(i), r), [lx, ly] = pt(ang(i), r + 30), done = i < this.step, cur = i === this.step && this.active, mark = i % 2 === 0;
      ticks += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${cur ? 9 : mark ? 6 : 4}" fill="${done ? '#f6eee3' : cur ? '#e9c98f' : 'none'}" stroke="rgba(246,238,227,.6)" stroke-width="2"/>`
             + (mark ? `<text x="${lx.toFixed(1)}" y="${(ly + 4).toFixed(1)}" text-anchor="middle" font-size="12" fill="${cur ? '#e9c98f' : 'rgba(246,238,227,.7)'}">${MOODS[i / 2]}</text>` : '');
    }
    const s = Math.min(this.step, this.STEPS - 1), [px, py] = pt(ang(s), r - 26);
    this.el.innerHTML = `<div style="max-width:560px;padding:24px">
      <div style="font:600 12px/1 var(--sans, Manrope, sans-serif);letter-spacing:.3em;opacity:.7">SYNTRA · KNOB CALIBRATION</div>
      <svg viewBox="0 0 300 280" width="300" height="280" style="margin:18px auto;display:block">
        <circle cx="${cx}" cy="${cy}" r="58" fill="rgba(246,238,227,.08)" stroke="rgba(246,238,227,.35)" stroke-width="2"/>
        <line x1="${cx}" y1="${cy}" x2="${px.toFixed(1)}" y2="${py.toFixed(1)}" stroke="#e9c98f" stroke-width="5" stroke-linecap="round"/>
        ${ticks}
      </svg>
      <div style="font:italic 34px/1.2 var(--serif, 'Instrument Serif', Georgia, serif)">${this.active ? (s % 2 === 0 ? `Point the knob at ${MOODS[s / 2]}` : `Point the knob halfway between ${MOODS[(s - 1) / 2]} and ${MOODS[(s + 1) / 2]} (${this.CLOCK[(s - 1) / 2]} o’clock)`) : ''}</div>
      <p style="margin:12px 0 0;opacity:.8;font-size:15px;line-height:1.5">${note || (this.active ? `Then press the button (or Enter). Step ${this.step + 1} of ${this.STEPS}.` : '')}</p>
      <p style="margin:18px 0 0;opacity:.5;font-size:12px;letter-spacing:.08em">${this.active ? `reading ${this.raw === null ? '—' : this.raw.toFixed(3)} · Esc cancel · Delete clear saved calibration` : ''}</p>
    </div>`;
  },
};
KnobCal.load();
setInterval(() => { if (KnobCal.active) { const r = KnobCal.el?.querySelector('p:last-child'); if (r) r.textContent = `reading ${KnobCal.raw === null ? '—' : KnobCal.raw.toFixed(3)} · Esc cancel · Delete clear saved calibration`; } }, 150);

const KEYMAP = {
  q: ['mood', +1], a: ['mood', -1],
  w: ['longevity', +1], s: ['longevity', -1],      // slider 1
  e: ['expression', +1], d: ['expression', -1],    // slider 2
  r: ['occasion', +1], f: ['occasion', -1],
};
const held = new Set();

addEventListener('keydown', ev => {
  const k = ev.key.toLowerCase();
  Sound.unlock();
  if (KnobCal.active) {                                               // calibration owns the keys while it is open
    if ((k === 'enter' || k === ' ') && !ev.repeat) { ev.preventDefault(); KnobCal.capture(); }
    else if (k === 'escape') KnobCal.stop();
    else if (k === 'delete' || k === 'backspace') KnobCal.clear();
    return;
  }
  if (k === 'k') { if (!ev.repeat) KnobCal.start(); return; }       // knob calibration
  if (k === '`') { toggleDevbar(); return; }
  if (k === 'enter' || k === ' ') { ev.preventDefault(); if (!ev.repeat) Button.down(); return; }
  if (k === 'escape') { resetToIntro(); return; }
  if (k === 'm') { Sound.toggle(); updateDevbar(); return; }
  if (k === 'h') { CONFIG.SHOW_HUD = !CONFIG.SHOW_HUD; syncHud(); return; }
  if (k === 'j') { if (!ev.repeat) Serial.toggle(); return; }       // connect / disconnect Arduino
  if (k === 'x' && state === 'result') { toggleExplore(); return; }
  if (KEYMAP[k] && Input.mode === 'simulation') {
    held.add(k);
    if (!ev.repeat) { const [key, dir] = KEYMAP[k]; Input.set(key, target[key] + dir * .03); }
  }
});
addEventListener('keyup', ev => {
  const k = ev.key.toLowerCase();
  held.delete(k);
  if (k === 'enter' || k === ' ') Button.up();
});
addEventListener('blur', () => held.clear());
addEventListener('pointerdown', () => Sound.unlock());
// Kiosk: hide the mouse cursor after 3 s without movement
let cursorTimer = 0;
addEventListener('pointermove', () => {
  document.body.classList.remove('cursor-idle');
  clearTimeout(cursorTimer);
  cursorTimer = setTimeout(() => document.body.classList.add('cursor-idle'), 3000);
});
addEventListener('dblclick', () => {
  if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.().catch(() => {});
});

function applyHeldKeys(dt) {
  for (const k of held) {
    const m = KEYMAP[k]; if (!m) continue;
    Input.set(m[0], target[m[0]] + m[1] * .42 * dt);
  }
}

const Button = {
  isDown: false, downAt: 0, longFired: false,
  down() {
    if (this.isDown) return;
    this.isDown = true; this.downAt = performance.now(); this.longFired = false;
    Input.lastTouch = this.downAt;
    if (KnobCal.active) { this.longFired = true; KnobCal.capture(); return; }   // the button records a calibration step
    if (state === 'result' && CONFIG.PRINT_ENABLED) return;       // result: a short press acts on release, a 2 s hold prints
    onButtonPress();
  },
  up() {
    const was = this.isDown;
    this.isDown = false;
    Receipt.hold(0);
    if (was && !this.longFired && state === 'result' && CONFIG.PRINT_ENABLED) onButtonPress();
  },
  tick(t) {
    const printing = state === 'result' && CONFIG.PRINT_ENABLED;
    if (this.isDown && !this.longFired && printing) Receipt.hold((t - this.downAt) / CONFIG.LONG_PRESS_MS);
    if (this.isDown && !this.longFired && t - this.downAt > CONFIG.LONG_PRESS_MS) {
      this.longFired = true;
      if (printing) { Receipt.hold(0); Receipt.print(); } else resetToIntro();
    }
  },
  tap() { this.down(); this.up(); },
};


/* ───────────────────────── 5. INPUT: ARDUINO (WEB SERIAL) ─────────────────────────
   Accepted line formats (one per line, 115200 baud):
     V,512,300,1023,700          knob, slider 1, slider 2, slider 3
     V,512,300,1023,700,1        …optional 5th number = button (1 pressed)
     BTN,1  /  BTN,0             button pressed / released
     BTN                         single press
     mood:512,expression:300,…   named values also work
   10-bit (Uno, 0–1023) and 12-bit (ESP32, 0–4095) are detected automatically.
   ─────────────────────────────────────────────────────────────────────────── */

// USB-serial chips used by ESP32 / Arduino boards. Keeps Bluetooth and debug ports out of the list.
const USB_BOARDS = [
  { usbVendorId: 0x10c4 },   // Silicon Labs CP210x (ESP32 DevKit)
  { usbVendorId: 0x1a86 },   // WCH CH340 / CH9102
  { usbVendorId: 0x0403 },   // FTDI
  { usbVendorId: 0x303a },   // Espressif native USB (S2 / S3 / C3)
  { usbVendorId: 0x2341 },   // Arduino
  { usbVendorId: 0x2a03 },   // Arduino.org
];
const isBoard = p => USB_BOARDS.some(f => f.usbVendorId === p.getInfo().usbVendorId);

const Serial = {
  port: null, reader: null, connected: false,
  lastLine: '', adcMax: 1023, sawBtnLine: false, prevBtn: 0, lines: 0,
  supported: 'serial' in navigator,

  async connect() {
    if (!this.supported) { setDevStatus('Web Serial needs Chrome or Edge'); plugNote('Use Chrome or Edge to connect', 6000); return; }
    plugNote('Connecting…', 4000);
    try {
      // a board this site was allowed before reconnects instantly, no picker needed
      for (const p of await this.knownBoards()) { try { await this.open(p); return; } catch {} }
      const port = await navigator.serial.requestPort({ filters: USB_BOARDS });
      await this.open(port);
    } catch (e) {
      const msg = e.name === 'NotFoundError' ? 'No ESP32 found — check the USB cable'
                : e.name === 'InvalidStateError' || e.name === 'NetworkError' ? 'Port busy — close Arduino IDE / other tabs'
                : `Could not connect: ${e.message}`;
      setDevStatus(msg); plugNote(msg, 7000);
    }
  },
  async knownBoards() {
    const all = await navigator.serial.getPorts();
    for (const p of all) if (!isBoard(p)) p.forget?.().catch?.(() => {});   // drop Bluetooth / debug ports picked by mistake
    return all.filter(isBoard);
  },
  async autoConnect() {
    if (!this.supported || this.connected || this.opening || this.manualOff) return;
    this.opening = true;
    try {
      const [port] = await this.knownBoards();
      if (port) await this.open(port);
    } catch (e) { setDevStatus(`Port busy: ${e.message}`); }
    finally { this.opening = false; }
  },
  // Kiosk safety net: keep trying to (re)connect, and restart a connection that has gone silent
  watchdog() {
    if (!this.supported) return;
    const t = performance.now();
    if (!this.connected) { this.autoConnect(); return; }
    const silentFor = t - (this.lastDataAt || this.openedAt);
    if (silentFor > 5000 && !this.restarting) {
      this.restarting = true;
      setDevStatus('No data for 5 s — restarting the connection');
      this.close(true).finally(() => { this.restarting = false; });
    }
  },
  async open(port) {
    if (this.connected) await this.close();
    await port.open({ baudRate: CONFIG.BAUD });
    this.port = port; this.connected = true;
    this.openedAt = performance.now(); this.lastDataAt = 0; this.warned = false;
    Input.mode = 'arduino';
    setDevStatus('Connected · waiting for data…');
    updateDevbar(); syncHud();
    this.readLoop();
  },
  async close(auto = false) {
    const port = this.port;
    try { await this.reader?.cancel(); } catch {}
    try { await this.pipe; } catch {}               // let the stream release the port
    try { await port?.close(); } catch {}
    this.connected = false; this.reader = null; this.port = null;
    Input.mode = 'simulation';
    setDevStatus(auto ? 'Reconnecting…' : 'Disconnected'); updateDevbar(); syncHud();
  },
  toggle() {
    Sound.unlock();
    if (this.connected) { this.manualOff = true; return this.close(); }   // stays off until J / plug again
    this.manualOff = false; return this.connect();
  },
  async readLoop() {
    const decoder = new TextDecoderStream();
    this.pipe = this.port.readable.pipeTo(decoder.writable).catch(() => {});
    const reader = decoder.readable.getReader();
    this.reader = reader;
    let buf = '';
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += value;
        let i;
        while ((i = buf.search(/\r?\n/)) >= 0) {
          const line = buf.slice(0, i).trim();
          buf = buf.slice(i + 1).replace(/^\n/, '');
          if (line) this.handle(line);
        }
        if (buf.length > 512) buf = '';
      }
    } catch (e) { /* device unplugged */ }
    finally {
      try { reader.releaseLock(); } catch {}
      this.connected = false;
      Input.mode = 'simulation';
      setDevStatus('Disconnected'); updateDevbar(); syncHud();
    }
  },
  handle(line) {
    this.lastLine = line; this.lines++;
    if (/\d/.test(line)) this.lastDataAt = performance.now();
    const up = line.toUpperCase();

    // Button lines
    const bm = up.match(/^(BTN|BUTTON|ENTER|PRESS|B)\b\s*[,:= ]?\s*(\d)?/);
    if (bm && !/^B\s*[,:=]?\s*\d+\s*,/.test(up)) {
      this.sawBtnLine = true;
      if (bm[2] === undefined) Button.tap();
      else if (bm[2] === '1') Button.down(); else Button.up();
      return;
    }

    // Named values:  mood:512, expression=300 …
    if (/[a-z]\s*[:=]\s*\d/i.test(line) && !/^V\b/i.test(up)) {
      const aliases = { mood: 'mood', knob: 'mood', k: 'mood', expression: 'expression', expr: 'expression', gender: 'expression', s1: 'longevity',
        longevity: 'longevity', long: 'longevity', s2: 'expression', occasion: 'occasion', occ: 'occasion', s3: 'occasion' };
      for (const m of line.matchAll(/([a-z0-9]+)\s*[:=]\s*(-?\d+(?:\.\d+)?)/gi)) {
        const key = aliases[m[1].toLowerCase()];
        if (key) this.apply(key, parseFloat(m[2]));
        else if (/^(btn|button)$/i.test(m[1])) this.btnState(parseFloat(m[2]));
      }
      return;
    }

    // Plain numbers
    const nums = (line.match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
    if (nums.length < 4) return;
    const map = nums.length >= 6 ? CONFIG.SERIAL_MAP_6 : CONFIG.SERIAL_MAP;
    for (const key in map) if (nums[map[key]] !== undefined) this.apply(key, nums[map[key]]);
    if (nums.length === 5 && !this.sawBtnLine) this.btnState(nums[4]);
  },
  apply(key, raw) {
    if (raw > 1023 && this.adcMax < 4095) this.adcMax = 4095;
    let v = raw <= 1 && raw % 1 !== 0 ? raw : raw / this.adcMax;       // accepts 0..1 floats too
    if (key === 'mood') {                                              // straighten the knob (see KnobCal)
      v = clamp01(v); if (CONFIG.INVERT.mood) v = 1 - v;
      KnobCal.raw = v;
      if (KnobCal.points) { Input.set(key, KnobCal.map(v)); return; }  // calibrated: the saved points already cover both ends
    }
    v = clamp01((v - CONFIG.EDGE) / (1 - 2 * CONFIG.EDGE));
    if (CONFIG.INVERT[key] && key !== 'mood') v = 1 - v;
    Input.set(key, v);
  },
  btnState(b) {
    b = b > 0 ? 1 : 0;
    if (b && !this.prevBtn) Button.down();
    if (!b && this.prevBtn) Button.up();
    this.prevBtn = b;
  },
};
if (Serial.supported) {
  navigator.serial.addEventListener('connect', () => setTimeout(() => Serial.autoConnect(), 800));   // board plugged back in
  setInterval(() => Serial.watchdog(), 2500);
  navigator.serial.addEventListener('disconnect', () => { Serial.connected = false; Input.mode = 'simulation'; setDevStatus('Disconnected'); updateDevbar(); syncHud(); });
}


/* ───────────────────────── RECOMMENDATION ENGINE ─────────────────────────
   Only what the visitor sees on screen decides the perfume: the 6 moods ×
   3 expressions × 3 longevities × 3 occasions = 162 possible choices.
   The same choices always give the same perfume, and the 162 choices are
   shared out evenly: every perfume is the answer for 8 or 9 of them, so each
   one is equally likely. Within that rule each choice gets the perfume that
   suits it best (an optimal assignment, worked out once when the page loads).
   ───────────────────────────────────────────────────────────────────────── */

const WEIGHTS = { mood: .36, expression: .26, occasion: .22, longevity: .16 };

// how well perfume p suits one on-screen choice (0..1)
function affinity(p, mood, expr, lon, occ) {
  let m = 0;
  for (const k in p.mood) {
    const d = mood - MOOD_KEYS.indexOf(k);
    m = Math.max(m, p.mood[k] * Math.exp(-(d * d) / (2 * .72 * .72)));
  }
  const e = 1 - Math.abs(expr / (EXPRESSIONS.length - 1) - p.expression);
  const l = Math.max(0, 1 - Math.abs(HOURS[lon] - p.longevity) / 8);
  const o = p.occasion.includes(OCC_KEYS[occ]) ? 1
          : p.occasion.some(x => Math.abs(OCC_KEYS.indexOf(x) - occ) === 1) ? .45 : 0;
  return WEIGHTS.mood * m + WEIGHTS.expression * e + WEIGHTS.occasion * o + WEIGHTS.longevity * l;
}

// Hungarian algorithm: the cheapest one-to-one assignment of rows to columns (square cost matrix)
function hungarian(cost) {
  const n = cost.length, INF = 1e18;
  const u = new Float64Array(n + 1), v = new Float64Array(n + 1), p = new Int32Array(n + 1), way = new Int32Array(n + 1);
  for (let i = 1; i <= n; i++) {
    p[0] = i; let j0 = 0;
    const minv = new Float64Array(n + 1).fill(INF), used = new Uint8Array(n + 1);
    do {
      used[j0] = 1; const i0 = p[j0]; let delta = INF, j1 = 0;
      for (let j = 1; j <= n; j++) if (!used[j]) {
        const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
        if (cur < minv[j]) { minv[j] = cur; way[j] = j0; }
        if (minv[j] < delta) { delta = minv[j]; j1 = j; }
      }
      for (let j = 0; j <= n; j++) if (used[j]) { u[p[j]] += delta; v[j] -= delta; } else minv[j] -= delta;
      j0 = j1;
    } while (p[j0] !== 0);
    do { const j1 = way[j0]; p[j0] = p[j1]; j0 = j1; } while (j0);
  }
  const rowToCol = new Int32Array(n);
  for (let j = 1; j <= n; j++) rowToCol[p[j] - 1] = j - 1;
  return rowToCol;
}

// the answer for every one of the 162 choices, shared out evenly between the perfumes
const CHOICES = [];
for (let mo = 0; mo < MOODS.length; mo++) for (let ex = 0; ex < EXPRESSIONS.length; ex++)
  for (let lo = 0; lo < HOURS.length; lo++) for (let oc = 0; oc < OCCASIONS.length; oc++) CHOICES.push([mo, ex, lo, oc]);
const choiceIndex = (mo, ex, lo, oc) => ((mo * EXPRESSIONS.length + ex) * HOURS.length + lo) * OCCASIONS.length + oc;
const ANSWER = (() => {
  const N = CHOICES.length, P = PERFUMES.length;
  const base = Math.floor(N / P), extra = N - base * P;        // 162 / 19 → 8 each, and 10 of them get a 9th
  // columns: `base` must-fill seats per perfume, then one optional seat each;
  // `P - extra` placeholder rows take the optional seats that stay empty
  const seats = [];
  for (let k = 0; k < P; k++) for (let s = 0; s < base; s++) seats.push({ k, must: true });
  if (extra) for (let k = 0; k < P; k++) seats.push({ k, must: false });
  const fill = seats.length - N, BIG = 1e6;
  const cost = [];
  for (const [mo, ex, lo, oc] of CHOICES) {
    const a = PERFUMES.map(p => affinity(p, mo, ex, lo, oc));
    cost.push(seats.map(s => -a[s.k]));
  }
  for (let r = 0; r < fill; r++) cost.push(seats.map(s => s.must ? BIG : 0));
  const pick = hungarian(cost);
  return CHOICES.map((_, i) => seats[pick[i]].k);
})();

function recommend(u = target) {
  // the steps the visitor sees on screen
  const live = u === target && zones.mood >= 0;
  const step = (v, n) => Math.min(n - 1, Math.max(0, Math.floor(v * n)));
  const mo = live ? zones.mood : step(u.mood, MOODS.length);
  const ex = live ? zones.expression : step(u.expression, EXPRESSIONS.length);
  const lo = live ? zones.longevity : step(u.longevity, HOURS.length);
  const oc = live ? zones.occasion : step(u.occasion, OCCASIONS.length);
  const winner = ANSWER[choiceIndex(mo, ex, lo, oc)];
  const list = PERFUMES.map((p, k) => ({ p, k, score: affinity(p, mo, ex, lo, oc) }));
  const best = Math.max(...list.map(r => r.score));
  // the match shown is how close this perfume is to the ideal for these choices
  list.forEach(r => { r.score = Math.min(.99, .72 + .27 * r.score / best); });
  const top = list[winner];
  return [top, ...list.filter(r => r !== top).sort((a, b) => b.score - a.score)];
}


/* ───────────────────────── 6. STAGE & CAMERA ───────────────────────── */

const el = {
  body: document.body, stage: $('#stage'), world: $('#world'),
  bg: $('#bg'),
  title: $('#introTitle'), rig: $('#rig'), cap: $('#cap'),
  fx: $('#fx'), hud: $('#hud'), grain: $('#grain'),
  copyIntro: $('#copyIntro'), copyDiscover: $('#copyDiscover'),
  caption: $('#caption'), status: $('#statusPill'), statusText: $('#statusText'),
  result: $('#result'), resBottle: $('#resBottle'),
  devbar: $('#devbar'),
};

// Measured from assets/bottle.webp (fractions of the image)
const BOTTLE = {
  w: 1144, h: 1604,
  nozzle: [.6206, .0515],   // spray hole
  neckX: .5131,             // centre of the collar
  shoulderY: .247,          // where the cap sits
  baseY: .9906, bodyX: .5007,
  capW: .3984,              // cap width relative to bottle width
  capAspect: 500 / 456,
};
const ASPECT = BOTTLE.w / BOTTLE.h;

function poses() {
  const introH = Math.min(VH * .55, VW * .42 / ASPECT);
  const intro = { h: introH, x: VW * .5 - introH * ASPECT * BOTTLE.bodyX, y: VH * .832 - introH * BOTTLE.baseY };
  const dH = VH * 1.42;
  const narrow = VW / VH < 1.25;
  const nx = VW * (narrow ? .22 : .30), ny = VH * .315;
  const discover = { h: dH, x: nx - dH * ASPECT * BOTTLE.nozzle[0], y: ny - dH * BOTTLE.nozzle[1] };
  return { intro, discover, dH };
}
const nozzleOf = pose => ({ x: pose.x + pose.h * ASPECT * BOTTLE.nozzle[0], y: pose.y + pose.h * BOTTLE.nozzle[1] });

// Everything the camera controls, smoothed toward per-state targets
const cam = { h: 0, nx: 0, ny: 0, capT: 0, bgS: 1, bgSoft: 0, px: 0, py: 0, rigA: 0, titleA: 0, titleS: 1, titleBlur: 0, influence: .15 };
let P0 = { x: 0, y: 0 };  // bg pivot at rest
const stageNozzle = { x: 0, y: 0 };  // where the spray hole is on screen right now

function resetCam() {
  const P = poses(), n = nozzleOf(P.intro);
  Object.assign(cam, { h: P.intro.h, nx: n.x, ny: n.y, capT: 0, bgS: 1, bgSoft: 0, px: n.x, py: n.y });
  P0 = n;
}

function capPose(capT, bottle, P) {
  const bw = bottle.h * ASPECT;
  const cw = bw * BOTTLE.capW, ch = cw * BOTTLE.capAspect;
  const ax = bottle.x + bw * BOTTLE.neckX;
  const ay = bottle.y + bottle.h * (BOTTLE.shoulderY + .006) - ch / 2;
  const lift = easeOutCubic(clamp01(capT / .35));
  const fly = easeInOutCubic(clamp01((capT - .25) / .75));
  const fcw = P.dH * ASPECT * BOTTLE.capW;
  const narrow = VW / VH < 1.25;
  const fx = VW * (narrow ? .1 : .118), fy = VH * .075;
  return {
    x: lerp(ax, fx, fly),
    y: lerp(ay - ch * .7 * lift, fy, fly) - Math.sin(Math.PI * fly) * VH * .07,
    w: lerp(cw, fcw, fly),
    rot: -31 * fly - 4 * lift * (1 - fly),
    fcw,
  };
}

let lastRigLayout = 0, lastCapLayout = 0;
const styleCache = new WeakMap();
function setStyle(node, prop, value) {
  let c = styleCache.get(node); if (!c) styleCache.set(node, c = {});
  if (c[prop] !== value) { c[prop] = value; node.style[prop] = value; }
}
const cssVarCache = {};
function setVar(name, value) {
  if (cssVarCache[name] !== value) { cssVarCache[name] = value; el.stage.style.setProperty(name, value); }
}

function stageTargets() {
  const P = poses(), nI = nozzleOf(P.intro), nD = nozzleOf(P.discover);
  switch (state) {
    case 'boot':
    case 'intro':       return { h: P.intro.h, n: nI, capT: 0, bgS: 1, bgSoft: 0, rigA: 1, titleA: 1, influence: .15, piv: nI };
    case 'interaction': return { h: P.dH, n: nD, capT: 1, bgS: 1.16, bgSoft: .85, rigA: 1, titleA: 0, influence: 1, piv: null };
    case 'spray':       return { h: P.dH, n: nD, capT: 1, bgS: 1.17, bgSoft: .9, rigA: 1, titleA: 0, influence: 1, piv: null };
    case 'loading':     return { h: P.dH, n: nD, capT: 1, bgS: 1.2, bgSoft: .95, rigA: 0, titleA: 0, influence: .55, piv: null };
    case 'converge':
    case 'vr':
    case 'result':      return { h: P.intro.h, n: nI, capT: 0, bgS: 1, bgSoft: 0, rigA: 0, titleA: 0, influence: 0, piv: nI };
  }
  return null;
}

function updateStage(dt) {
  const P = poses();
  const tg = stageTargets();

  if (state === 'zoom') {
    const p = clamp01((now - t0) / TIMING.zoom);
    const eZ = easeInOutCubic(p);
    const eT = easeInOutSine(clamp01(p * 1.06));
    const n0 = nozzleOf(P.intro), n1 = nozzleOf(P.discover);
    cam.h = P.intro.h * Math.pow(P.dH / P.intro.h, eZ);
    cam.nx = lerp(n0.x, n1.x, eT); cam.ny = lerp(n0.y, n1.y, eT);
    cam.capT = smoothstep(.06, .84, p);
    cam.bgS = 1 + (cam.h / P.intro.h - 1) * .1;
    cam.bgSoft = smoothstep(.12, .9, p) * .85;
    cam.rigA = 1;
    cam.titleA = 1 - smoothstep(0, .42, p);
    cam.titleS = 1 + eZ * .55;
    cam.titleBlur = smoothstep(0, .5, p) * 14;
    cam.influence = lerp(.15, 1, smoothstep(.3, 1, p));
    cam.px = lerp(n0.x, cam.nx, .3); cam.py = lerp(n0.y, cam.ny, .3);
  } else if (tg) {
    const r = state === 'loading' ? 1.4 : state === 'converge' ? 1.1 : 2.2;
    cam.h = Math.exp(approach(Math.log(cam.h || tg.h), Math.log(tg.h), r, dt));
    cam.nx = approach(cam.nx, tg.n.x, r, dt);
    cam.ny = approach(cam.ny, tg.n.y, r, dt);
    cam.capT = approach(cam.capT, tg.capT, 1.6, dt);
    cam.bgS = approach(cam.bgS, tg.bgS, state === 'converge' ? 1.6 : 1.2, dt);
    cam.bgSoft = approach(cam.bgSoft, tg.bgSoft, state === 'converge' ? 1.5 : 1.4, dt);
    cam.rigA = approach(cam.rigA, tg.rigA, tg.rigA > cam.rigA ? 1.3 : 1.9, dt);
    cam.titleA = approach(cam.titleA, tg.titleA, 2.5, dt);
    cam.titleS = approach(cam.titleS, 1, 2.5, dt);
    cam.titleBlur = approach(cam.titleBlur, 0, 3, dt);
    cam.influence = approach(cam.influence, tg.influence, 1.2, dt);
    const piv = tg.piv || { x: lerp(P0.x, cam.nx, .3), y: lerp(P0.y, cam.ny, .3) };
    cam.px = approach(cam.px, piv.x, 2, dt); cam.py = approach(cam.py, piv.y, 2, dt);
  }
  P0 = nozzleOf(P.intro);

  // gentle idle life
  const breathe = state === 'intro' ? Math.sin(T * .6) * VH * .0015 : 0;
  const drift = state === 'interaction' || state === 'spray' ? 1 : 0;
  const fx = drift * Math.sin(T * .23) * VW * .002, fy = drift * Math.cos(T * .19) * VH * .003;

  // bottle rig (laid out at close-up size, scaled down → stays sharp)
  const bw = P.dH * ASPECT;
  if (lastRigLayout !== P.dH) {
    lastRigLayout = P.dH;
    el.rig.style.width = `${bw}px`; el.rig.style.height = `${P.dH}px`;
  }
  stageNozzle.x = cam.nx + fx; stageNozzle.y = cam.ny + fy + breathe;
  const x = cam.nx - cam.h * ASPECT * BOTTLE.nozzle[0] + fx;
  const y = cam.ny - cam.h * BOTTLE.nozzle[1] + fy + breathe;
  const s = cam.h / P.dH;
  setStyle(el.rig, 'transform', `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) scale(${s.toFixed(5)})`);
  setStyle(el.rig, 'opacity', cam.rigA.toFixed(3));
  setStyle(el.rig, 'filter', cam.rigA < .985 ? `blur(${((1 - cam.rigA) * 14).toFixed(1)}px)` : 'none');

  // cap
  const cp = capPose(cam.capT, { x, y, h: cam.h }, P);
  if (lastCapLayout !== cp.fcw) {
    lastCapLayout = cp.fcw;
    el.cap.style.width = `${cp.fcw}px`; el.cap.style.height = `${cp.fcw * BOTTLE.capAspect}px`;
  }
  const floatA = cam.capT > .98 ? 1 : 0;
  const cx = cp.x + floatA * Math.sin(T * .5) * 5, cy = cp.y + floatA * Math.cos(T * .41) * 6;
  const cs = cp.w / cp.fcw, cr = cp.rot + floatA * Math.sin(T * .33) * .9;
  setStyle(el.cap, 'transform', `translate3d(${(cx - cp.fcw / 2).toFixed(2)}px, ${(cy - cp.fcw * BOTTLE.capAspect / 2).toFixed(2)}px, 0) scale(${cs.toFixed(5)}) rotate(${cr.toFixed(2)}deg)`);
  setStyle(el.cap, 'opacity', cam.rigA.toFixed(3));

  // background: dolly about a pivot that follows the nozzle
  const bgT = `translate3d(${cam.px.toFixed(2)}px, ${cam.py.toFixed(2)}px, 0) scale(${(cam.bgS * 1.035).toFixed(5)}) translate3d(${(-P0.x).toFixed(2)}px, ${(-P0.y).toFixed(2)}px, 0)`;
  setStyle(el.bg, 'transform', bgT);
  setVar('--bg-soft', cam.bgSoft.toFixed(3));

  // intro headline
  setStyle(el.title, 'opacity', cam.titleA.toFixed(3));
  setStyle(el.title, 'transform', `translate3d(${((cam.nx - P0.x) * .45).toFixed(1)}px, ${((cam.ny - P0.y) * .45).toFixed(1)}px, 0) scale(${cam.titleS.toFixed(4)})`);
  setStyle(el.title, 'filter', cam.titleBlur > .2 ? `blur(${cam.titleBlur.toFixed(1)}px)` : 'none');
}


/* ───────────────────────── 7. ATMOSPHERE ─────────────────────────
   The controls never appear as UI in the world; they change the light.
   ───────────────────────────────────────────────────────────────── */

const MOOD_LOOK = [
  // Fresh: clean, airy, bright
  { tint: [206, 228, 222], tintA: .22, light: [255, 253, 244], glowA: .75, liquid: [214, 232, 214], liquidA: .30, mist: [255, 255, 255], shade: 0,   vig: .05, energy: .6, rise: -4 },
  // Playful: peachy light, quick bright motes
  { tint: [255, 206, 178], tintA: .22, light: [255, 238, 214], glowA: .8,  liquid: [255, 180, 150], liquidA: .38, mist: [255, 244, 236], shade: 0,   vig: .07, energy: .95, rise: -6 },
  // Romantic: blush, soft, hazy
  { tint: [242, 190, 196], tintA: .24, light: [255, 226, 224], glowA: .6,  liquid: [232, 160, 170], liquidA: .40, mist: [255, 238, 240], shade: .03, vig: .14, energy: .45, rise: -5 },
  // Warm: amber
  { tint: [236, 172, 96],  tintA: .28, light: [255, 206, 140], glowA: .7,  liquid: [210, 132, 60],  liquidA: .45, mist: [255, 232, 200], shade: .04, vig: .2, energy: .5, rise: -9 },
  // Bold: copper, contrast, energy
  { tint: [186, 100, 60],  tintA: .3,  light: [255, 186, 120], glowA: .55, liquid: [150, 60, 34],   liquidA: .55, mist: [255, 222, 196], shade: .16, vig: .38, energy: 1,  rise: -7 },
  // Mysterious: smoke, dark, slow
  { tint: [70, 62, 84],    tintA: .34, light: [196, 186, 214], glowA: .3,  liquid: [64, 48, 62],    liquidA: .55, mist: [224, 218, 232], shade: .34, vig: .58, energy: .3, rise: -3 },
];
const OCC_LOOK = [
  // Everyday: clean, relaxed daylight
  { shade: 0,   vig: 0,   glow: 1.05, sparkle: 0,  leaves: 1,   tint: 1 },
  // Evening: darker, warmer, dramatic
  { shade: .12, vig: .3,  glow: .65,  sparkle: .25, leaves: .35, tint: 1.15 },
  // Special: richer, cinematic, golden glints
  { shade: .06, vig: .22, glow: 1.15, sparkle: 1,  leaves: .6,  tint: 1.2 },
];
const NEUTRAL = { tint: [236, 200, 160], tintA: .12, light: [255, 238, 214], glowA: .55, liquid: [214, 150, 90], liquidA: 0, mist: [255, 250, 244], shade: 0, vig: .12, energy: .5, rise: -5, sparkle: 0, leaves: .95, sharp: .5 };

function blendPresets(list, v) {
  const pos = clamp01(v) * (list.length - 1);
  const i = Math.min(list.length - 2, Math.floor(pos));
  const f = smoothstep(0, 1, pos - i);
  const a = list[i], b = list[i + 1], out = {};
  for (const k in a) out[k] = Array.isArray(a[k]) ? mixRGB(a[k], b[k], f) : lerp(a[k], b[k], f);
  return out;
}

const L = { ...NEUTRAL };       // live look, used by particles too
let sheenSweep = -1;            // time a reflection sweep started
let resultAccent = null;

function updateAtmosphere(dt) {
  const m = blendPresets(MOOD_LOOK, look.mood);
  const o = blendPresets(OCC_LOOK, look.occasion);
  const e = look.expression;                              // 0 feminine … 1 masculine
  const k = CONFIG.MOOD_GRADING ? cam.influence : 0;

  const want = {
    tint: m.tint, tintA: m.tintA * o.tint,
    light: m.light, glowA: m.glowA * o.glow,
    liquid: m.liquid, liquidA: m.liquidA,
    mist: m.mist,
    shade: m.shade + o.shade + e * .04,
    vig: m.vig + o.vig + e * .08,
    energy: m.energy, rise: m.rise,
    sparkle: o.sparkle, leaves: o.leaves * (1 - m.shade * .8),
    sharp: e,                                              // harder light & shadows
  };
  if (state === 'result' || state === 'converge' || state === 'vr') {
    if (resultAccent) { want.tint = resultAccent; want.tintA = .14; }
  }
  for (const key in NEUTRAL) {
    const tv = Array.isArray(NEUTRAL[key]) ? mixRGB(NEUTRAL[key], want[key], k) : lerp(NEUTRAL[key], want[key], k);
    if (Array.isArray(tv)) L[key] = mixRGB(L[key], tv, 1 - Math.exp(-3 * dt));
    else L[key] = approach(L[key], tv, 3, dt);
  }

  setVar('--tint', rgbStr(L.tint));
  setVar('--tint-a', L.tintA.toFixed(3));
  setVar('--shade', clamp(L.shade, 0, .7).toFixed(3));
  setVar('--vig', clamp(L.vig, 0, .85).toFixed(3));
  setVar('--liquid', rgbStr(L.liquid));
  setVar('--liquid-a', (L.liquidA * .85).toFixed(3));

  // reflection: slow resting position set by the light direction + a sweep when something changes
  let sx = lerp(78, 58, L.sharp);
  if (sheenSweep >= 0) {
    const p = (now - sheenSweep) / 1600;
    if (p >= 1) sheenSweep = -1; else sx = lerp(118, -18, easeInOutSine(p));
  }
  setVar('--sheen-x', `${sx.toFixed(1)}%`);
  setVar('--sheen-a', (.35 + .35 * L.sharp).toFixed(3));

  // Text is either dark or light — never a mid grey. Switch with hysteresis, the CSS fades it.
  const darkness = L.shade + L.vig * .35;
  const mysterious = MOODS[zones.mood] === 'Mysterious' && (state === 'interaction' || state === 'zoom');
  if (mysterious) lightInk = true;                               // Mysterious → always white text
  else if (!lightInk && darkness > .42) lightInk = true;
  else if (lightInk && darkness < .34) lightInk = false;
  const ink = lightInk ? '255, 255, 255' : '18, 13, 9';
  setVar('--ink', `rgb(${ink})`);
  setVar('--ink-soft', `rgba(${ink}, ${lightInk ? .8 : .66})`);
  setVar('--ink-faint', `rgba(${ink}, ${lightInk ? .6 : .4})`);
  setVar('--paper', lightInk ? '#2a1d14' : '#eadccb');
  setVar('--scrim', lightInk && (state === 'interaction' || state === 'zoom') ? '1' : '0');
  el.body.classList.toggle('ink-light', lightInk);
}
let lightInk = false;

/* ───────────────────────── 8. PHYSICAL-CONTROLS PANEL ───────────────────────── */

const hudRows = {};
function buildHud() {
  el.hud.innerHTML = `
    <div class="hud-head"><span>Physical controls</span><span class="hud-src"><i></i><em>Simulation</em></span></div>
    ${CONTROL_DEFS.map(c => `
      <div class="hud-row" data-k="${c.key}">
        <div class="hud-gfx">${c.type === 'knob' ? '<div class="knob"><i></i></div>' : '<div class="trk"><span class="fill"></span><i></i></div>'}</div>
        <div class="hud-lbl"><b>${c.label}</b><small>${c.device}</small></div>
        <div class="hud-val">—</div>
      </div>`).join('')}`;
  for (const c of CONTROL_DEFS) {
    const row = el.hud.querySelector(`[data-k="${c.key}"]`);
    hudRows[c.key] = { row, val: row.querySelector('.hud-val'), dot: row.querySelector('.trk i, .knob i'), fill: row.querySelector('.fill'), type: c.type };
  }
}
function syncHud() {
  const on = CONFIG.SHOW_HUD && state === 'interaction';
  el.body.classList.toggle('hud-on', on);
  const eye = document.getElementById('eyeBtn');
  if (eye) {
    eye.setAttribute('aria-pressed', String(CONFIG.SHOW_HUD));
    eye.setAttribute('aria-label', CONFIG.SHOW_HUD ? 'Hide physical controls' : 'Show physical controls');
  }
  const src = el.hud.querySelector('.hud-src');
  if (src) {
    src.classList.toggle('live', Serial.connected);
    src.querySelector('em').textContent = Serial.connected ? 'Arduino live' : 'Simulation';
  }
}
function updateHud() {
  for (const key in hudRows) {
    const h = hudRows[key], v = ctl[key];
    if (h.type === 'knob') setStyle(h.dot, 'transform', `rotate(${(-135 + v * 270).toFixed(1)}deg)`);
    else { setStyle(h.dot, 'left', `${(v * 100).toFixed(1)}%`); setStyle(h.fill, 'width', `${(v * 100).toFixed(1)}%`); }
  }
}

function updateZones() {
  const prev = { ...zones };
  zones.mood = zoneOf(ctl.mood, MOODS.length, zones.mood);
  zones.expression = zoneOf(ctl.expression, EXPRESSIONS.length, zones.expression);
  zones.occasion = zoneOf(ctl.occasion, OCCASIONS.length, zones.occasion);
  zones.longevity = zoneOf(ctl.longevity, HOURS.length, zones.longevity);
  zones.hours = HOURS[zones.longevity];
  const d = describeControls();
  let changed = null;
  for (const key of ['mood', 'expression', 'longevity', 'occasion']) {
    const zk = key === 'longevity' ? 'hours' : key;
    if (prev[zk] !== zones[zk]) {
      const h = hudRows[key];
      if (h) {
        h.val.textContent = d[key];
        h.row.classList.remove('ping'); void h.row.offsetWidth; h.row.classList.add('ping');
      }
      if (prev[zk] !== -1) changed = key;
    }
  }
  if (changed && state === 'interaction') {
    setCaption(CONTROL_DEFS.find(c => c.key === changed).label, d[changed]);
    if (changed !== 'longevity') { sheenSweep = now; Sound.tick(); }
  }
}
function setCaption(k, v) {
  const c = el.caption;
  c.querySelector('.k').textContent = k;
  c.querySelector('.v').textContent = v;
  c.classList.remove('flip'); void c.offsetWidth; c.classList.add('flip');
}


/* ───────────────────────── 9. PARTICLES ───────────────────────── */

const fx = el.fx.getContext('2d');
let DPR = 1;

class Pool {
  constructor(max) {
    this.max = max; this.n = 0;
    this.keys = ['x', 'y', 'vx', 'vy', 'age', 'life', 'size', 'alpha', 'seed', 'sx', 'sy', 'tx', 'ty', 'delay', 'dur', 'phi', 'drag', 'fade'];
    for (const k of this.keys) this[k] = new Float32Array(max);
    this.kind = new Uint8Array(max); this.col = new Int16Array(max);
  }
  add(kind) {
    if (this.n >= this.max) return -1;
    const i = this.n++;
    for (const k of this.keys) this[k][i] = 0;
    this.kind[i] = kind; this.col[i] = -1; this.life[i] = 1e9; this.fade[i] = 0; this.seed[i] = Math.random() * 1000;
    return i;
  }
  kill(i) {
    const j = --this.n;
    if (i !== j) { for (const k of this.keys) this[k][i] = this[k][j]; this.kind[i] = this.kind[j]; this.col[i] = this.col[j]; }
  }
  clear() { this.n = 0; }
}
const K_DOT = 0, K_HAZE = 1, K_GLINT = 2, K_BOKEH = 3;

const amb = new Pool(700);       // ambient motes + scent aura
const main = new Pool(9500);     // spray → possibilities → convergence

// Sprites (white, tinted copies regenerated when the mist colour changes)
const Sprites = {
  key: '', dot: null, haze: null, glint: null,
  make(size, stops) {
    const c = document.createElement('canvas'); c.width = c.height = size;
    const g = c.getContext('2d'), r = size / 2;
    const gr = g.createRadialGradient(r, r, 0, r, r, r);
    for (const [o, col] of stops) gr.addColorStop(o, col);
    g.fillStyle = gr; g.fillRect(0, 0, size, size);
    return c;
  },
  update(rgb) {
    const key = rgb.map(v => Math.round(v / 6)).join();
    if (key === this.key) return;
    this.key = key;
    const c = rgbStr(rgb);
    this.dot = this.make(32, [[0, `rgba(${c},1)`], [.35, `rgba(${c},.75)`], [.7, `rgba(${c},.18)`], [1, `rgba(${c},0)`]]);
    this.haze = this.make(128, [[0, `rgba(${c},1)`], [.25, `rgba(${c},.7)`], [.55, `rgba(${c},.25)`], [.8, `rgba(${c},.06)`], [1, `rgba(${c},0)`]]);
    this.glint = this.make(48, [[0, 'rgba(255,255,255,1)'], [.12, `rgba(${c},.9)`], [.35, `rgba(${c},.18)`], [1, `rgba(${c},0)`]]);
  },
};

// Divergence-free air flow (curl of a smooth stream function) — swirls without clumping
const F = [0, 0];
function flow(x, y, t) {
  const s = 1 / (VH * .38), X = x * s, Y = y * s;
  const a1 = X * 1.0 + t * .13, b1 = Y * 1.3 - t * .11;
  const a2 = X * 2.3 - t * .21 + 1.7, b2 = Y * 2.1 + t * .17;
  const a3 = X * 4.1 + t * .3, b3 = Y * 3.7 - t * .23 + .4;
  F[0] = -1.3 * Math.sin(a1) * Math.sin(b1) + 1.05 * Math.sin(a2) * Math.cos(b2) + .925 * Math.cos(a3) * Math.cos(b3);
  F[1] = -(Math.cos(a1) * Math.cos(b1) + 1.15 * Math.cos(a2) * Math.sin(b2) - 1.025 * Math.sin(a3) * Math.sin(b3));
  return F;
}
const fadeInOut = (age, life, fin, fout) => Math.min(1, age / fin) * Math.min(1, Math.max(0, (life - age) / fout));

function resizeFx() {
  DPR = Math.min(devicePixelRatio || 1, 1.5);
  el.fx.width = Math.round(VW * DPR); el.fx.height = Math.round(VH * DPR);
}

/* ── ambient: motes in the light + scent aura rising from the nozzle ── */
let auraAcc = 0;
function updateAmbient(dt) {
  const inWorld = state === 'intro' || state === 'zoom' || state === 'interaction' || state === 'result' || state === 'vr';
  const lifeK = lerp(1.6, 9, look.longevity);
  const wantMotes = !inWorld ? 0 : state === 'result' ? 50 : Math.round(lerp(70, 300, L.energy) * (state === 'intro' ? .55 : 1));
  let motes = 0;
  for (let i = 0; i < amb.n; i++) if (amb.kind[i] !== K_HAZE) motes++;
  for (let k = 0; k < Math.min(8, wantMotes - motes); k++) {
    const i = amb.add(Math.random() < .09 ? K_BOKEH : Math.random() < L.sparkle * .12 ? K_GLINT : K_DOT); if (i < 0) break;
    amb.x[i] = Math.random() * VW; amb.y[i] = Math.random() * VH;
    amb.life[i] = lifeK * rand(.6, 1.4);
    amb.size[i] = amb.kind[i] === K_BOKEH ? rand(4, 10) * S : rand(.5, 1.7);
    amb.alpha[i] = amb.kind[i] === K_BOKEH ? rand(.05, .12) : rand(.25, .75);
  }
  // aura from the nozzle (only while the bottle is open)
  if (state === 'interaction' && cam.capT > .9) {
    auraAcc += dt * lerp(1.2, 5, L.energy);
    while (auraAcc > 1) {
      auraAcc--;
      const i = amb.add(K_HAZE); if (i < 0) break;
      amb.x[i] = cam.nx + rand(4, 14) * S; amb.y[i] = cam.ny + rand(-3, 3) * S;
      amb.vx[i] = rand(12, 34) * S; amb.vy[i] = rand(-26, -10) * S;
      amb.life[i] = lerp(1.6, 6.5, look.longevity) * rand(.8, 1.2);
      amb.size[i] = rand(10, 18) * S; amb.alpha[i] = rand(.05, .1);
    }
  }
  const air = lerp(6, 34, L.energy) * S;
  for (let i = amb.n - 1; i >= 0; i--) {
    amb.age[i] += dt;
    if (!inWorld && amb.fade[i] === 0) { amb.fade[i] = 1; amb.life[i] = Math.min(amb.life[i], amb.age[i] + .8); }
    if (amb.age[i] > amb.life[i]) { amb.kill(i); continue; }
    flow(amb.x[i], amb.y[i], T);
    if (amb.kind[i] === K_HAZE) {
      amb.vx[i] = approach(amb.vx[i], F[0] * 10 * S + 10 * S, .6, dt);
      amb.vy[i] = approach(amb.vy[i], F[1] * 8 * S - 14 * S, .6, dt);
    } else {
      amb.vx[i] = approach(amb.vx[i], F[0] * air, 1.2, dt);
      amb.vy[i] = approach(amb.vy[i], F[1] * air + L.rise * S, 1.2, dt);
    }
    amb.x[i] += amb.vx[i] * dt; amb.y[i] += amb.vy[i] * dt;
    if (amb.x[i] < -40 || amb.x[i] > VW + 40 || amb.y[i] < -60 || amb.y[i] > VH + 40) amb.kill(i);
  }
}
function drawAmbient() {
  const sp = Sprites;
  for (let i = 0; i < amb.n; i++) {
    const k = amb.kind[i], age = amb.age[i], life = amb.life[i];
    if (k === K_HAZE) {
      const r = amb.size[i] * (1 + age * 1.6);
      fx.globalAlpha = amb.alpha[i] * fadeInOut(age, life, .5, life * .6);
      fx.drawImage(sp.haze, amb.x[i] - r, amb.y[i] - r, r * 2, r * 2);
    } else if (k === K_BOKEH) {
      const r = amb.size[i];
      fx.globalAlpha = amb.alpha[i] * fadeInOut(age, life, 1.2, 1.5);
      fx.drawImage(sp.dot, amb.x[i] - r, amb.y[i] - r, r * 2, r * 2);
    } else if (k === K_GLINT) {
      const tw = .5 + .5 * Math.sin(T * 3 + amb.seed[i]);
      const r = 5 + tw * 5;
      fx.globalCompositeOperation = 'lighter';
      fx.globalAlpha = .55 * tw * fadeInOut(age, life, .6, 1);
      fx.drawImage(sp.glint, amb.x[i] - r, amb.y[i] - r, r * 2, r * 2);
      fx.globalCompositeOperation = 'source-over';
    } else {
      const r = amb.size[i] * 1.6;
      fx.globalAlpha = amb.alpha[i] * fadeInOut(age, life, .9, 1.4);
      fx.drawImage(sp.dot, amb.x[i] - r, amb.y[i] - r, r * 2, r * 2);
    }
  }
  fx.globalAlpha = 1;
}

/* ── main system: spray / possibilities / convergence ── */
const Main = {
  mode: 'off', t0: 0, schedule: null, emitted: 0, dir: -.1,
  buckets: null, bucketCols: null, revealAt: 0,
  levels: Array.from({ length: 6 }, () => new Int32Array(9500)), levelN: new Int32Array(6),
};

function startSpray() {
  main.clear();
  Main.mode = 'spray'; Main.t0 = now; Main.emitted = 0;
  // Emission times follow a real atomiser pulse: sharp onset, fast decay (~0.5 s)
  const N = 7400, sched = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    let t;
    do { t = Math.random() * .6; } while (Math.random() > (t < .035 ? t / .035 : Math.exp(-(t - .035) * 4.2)));
    sched[i] = t;
  }
  sched.sort();
  Main.schedule = sched;
}

function emitDroplet(nx, ny, tEmit) {
  const hazeRoll = Math.random();
  const kind = hazeRoll < .026 ? K_HAZE : hazeRoll < .05 ? K_GLINT : K_DOT;
  const i = main.add(kind); if (i < 0) return;
  const core = Math.random() < .7;
  const ang = Main.dir + gauss() * (core ? .085 : .21);
  const pulse = Math.exp(-tEmit * 2.2);                     // later droplets are slower
  let sp = (core ? rand(1300, 2700) : rand(700, 1700)) * S * lerp(.7, 1, pulse);
  if (kind === K_HAZE) sp = rand(700, 1900) * S;
  main.x[i] = nx + Math.cos(Main.dir) * rand(0, 5) * S;
  main.y[i] = ny + rand(-1.5, 1.5) * S;
  main.vx[i] = Math.cos(ang) * sp; main.vy[i] = Math.sin(ang) * sp;
  main.drag[i] = kind === K_HAZE ? rand(1.8, 2.6) : rand(1.35, 3.2);
  main.size[i] = kind === K_HAZE ? rand(6, 14) * S : Math.random() < .86 ? rand(.45, 1.15) : rand(1.15, 2.1);
  main.alpha[i] = kind === K_HAZE ? rand(.018, .04) : rand(.4, .95);
  main.life[i] = kind === K_HAZE ? rand(3, 4.5) : rand(2.8, 4.6);
}

function startField() {
  Main.mode = 'field'; Main.t0 = now;
  for (let i = 0; i < main.n; i++) main.life[i] = 1e9;
  // grow the cloud: new droplets near existing ones, plus a veil across the screen
  const want = 7600;
  const base = main.n || 1;
  for (let k = main.n; k < want; k++) {
    const i = main.add(Math.random() < .04 ? K_GLINT : K_DOT); if (i < 0) break;
    if (Math.random() < .68 && base > 1) {
      const j = (Math.random() * base) | 0;
      main.x[i] = main.x[j] + gauss() * 90 * S; main.y[i] = main.y[j] + gauss() * 70 * S;
    } else { main.x[i] = Math.random() * VW; main.y[i] = Math.random() * VH; }
    main.size[i] = Math.random() < .88 ? rand(.45, 1.2) : rand(1.2, 2.2);
    main.alpha[i] = rand(.3, .9);
    main.fade[i] = -rand(.2, 1.2);          // negative fade = fade-in time
    main.drag[i] = 1.3;
  }
  for (let k = 0; k < 46; k++) {             // soft volume so it reads as a cloud, not dust
    const i = main.add(K_HAZE); if (i < 0) break;
    main.x[i] = rand(.05, .95) * VW; main.y[i] = rand(.08, .92) * VH;
    main.size[i] = rand(40, 110) * S; main.alpha[i] = rand(.03, .06);
    main.fade[i] = -rand(.6, 1.4);
  }
}

function startConverge() {
  Main.mode = 'converge'; Main.t0 = now; Main.revealAt = 0;
  const img = el.resBottle, rect = img.getBoundingClientRect();
  const sw = Math.max(40, Math.round(rect.width / 2)), sh = Math.max(60, Math.round(rect.height / 2));
  const c = document.createElement('canvas'); c.width = sw; c.height = sh;
  const g = c.getContext('2d', { willReadFrequently: true });
  let data = null;
  try { g.drawImage(img, 0, 0, sw, sh); data = g.getImageData(0, 0, sw, sh).data; } catch (e) { data = null; }

  // collect interior + edge pixels
  const inside = [], edge = [];
  if (data) {
    for (let y = 1; y < sh - 1; y++) for (let x = 1; x < sw - 1; x++) {
      const o = (y * sw + x) * 4;
      if (data[o + 3] < 140) continue;
      inside.push(x, y);
      if (data[o + 3 - 4] < 140 || data[o + 3 + 4] < 140 || data[o + 3 - sw * 4] < 140 || data[o + 3 + sw * 4] < 140) edge.push(x, y);
    }
  }
  if (!inside.length) {   // fallback: a simple bottle outline
    for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
      const neck = y < sh * .25 ? Math.abs(x - sw / 2) < sw * .15 : true;
      if (neck) inside.push(x, y);
    }
  }

  // targets for every dot, colour buckets from the real bottle
  const NP = Math.min(main.n, 7800);
  const sums = new Map();
  const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
  for (let i = 0; i < main.n; i++) {
    if (i >= NP || main.kind[i] === K_HAZE) { main.fade[i] = now; main.col[i] = -1; continue; }
    const useEdge = edge.length && Math.random() < .3;
    const arr = useEdge ? edge : inside;
    const q = ((Math.random() * arr.length / 2) | 0) * 2;
    const px = arr[q], py = arr[q + 1];
    main.tx[i] = rect.left + (px + Math.random()) * rect.width / sw;
    main.ty[i] = rect.top + (py + Math.random()) * rect.height / sh;
    let r = 240, gg = 232, b = 222;
    if (data) { const o = (py * sw + px) * 4; r = data[o]; gg = data[o + 1]; b = data[o + 2]; }
    const key = (r >> 5) << 6 | (gg >> 5) << 3 | (b >> 5);
    let s = sums.get(key); if (!s) sums.set(key, s = [0, 0, 0, 0, []]);
    s[0] += r; s[1] += gg; s[2] += b; s[3]++; s[4].push(i);
    main.col[i] = 1;
    main.sx[i] = main.x[i]; main.sy[i] = main.y[i];
    const dist = Math.hypot(main.x[i] - cx, main.y[i] - cy) / Math.hypot(VW, VH);
    main.delay[i] = rand(0, .5) + dist * .55;
    main.dur[i] = rand(1.45, 2.05);
    main.phi[i] = (Math.random() < .86 ? 1 : -1) * rand(.7, 1.5);
    main.kind[i] = K_DOT;
    main.size[i] = rand(.95, 1.45);
    main.fade[i] = 0;
  }
  Main.buckets = []; Main.bucketCols = [];
  for (const s of sums.values()) { Main.buckets.push(Int32Array.from(s[4])); Main.bucketCols.push([s[0] / s[3], s[1] / s[3], s[2] / s[3]]); }
  // index → bucket slot
  Main.slot = new Int32Array(main.n).fill(-1);
  Main.buckets.forEach((arr, b) => arr.forEach(i => { Main.slot[i] = b; }));
}

function beginReveal() {
  Main.revealAt = now;
  for (let i = 0; i < main.n; i++) {
    if (Math.random() < .14) { main.vx[i] = gauss() * 14 * S; main.vy[i] = -rand(12, 48) * S; main.fade[i] = -2; }  // sparkles
  }
}

function updateMain(dt) {
  if (Main.mode === 'off') return;
  const t = (now - Main.t0) / 1000;

  if (Main.mode === 'spray') {
    const n = stageNozzle;
    Main.nx = n.x; Main.ny = n.y;
    const sched = Main.schedule;
    while (Main.emitted < sched.length && sched[Main.emitted] <= t) { emitDroplet(n.x, n.y, sched[Main.emitted]); Main.emitted++; }
  }

  const spray = Main.mode === 'spray', field = Main.mode === 'field', conv = Main.mode === 'converge';
  const dirX = Math.cos(Main.dir), dirY = Math.sin(Main.dir);
  const cx = VW * .5, cy = VH * .5;
  const fieldAir = field ? lerp(40, 150, smoothstep(0, 1.2, t)) * S : 0;

  for (let i = main.n - 1; i >= 0; i--) {
    main.age[i] += dt;
    if (main.age[i] > main.life[i]) { main.kill(i); continue; }
    let x = main.x[i], y = main.y[i];

    if (conv && main.col[i] < 0 && main.fade[i] > 0 && now - main.fade[i] > 950) continue;   // faded out
    if (conv && main.col[i] >= 0 && main.fade[i] !== -2) {
      const q = (t - main.delay[i]) / main.dur[i];
      if (q <= 0) {                           // still drifting in the cloud, waiting its turn
        flow(x, y, T);
        main.vx[i] = approach(main.vx[i], F[0] * 110 * S, 1.3, dt);
        main.vy[i] = approach(main.vy[i], F[1] * 110 * S, 1.3, dt);
        main.x[i] = main.sx[i] = x + main.vx[i] * dt;
        main.y[i] = main.sy[i] = y + main.vy[i] * dt;
      } else {
        const e = easeInOutCubic(Math.min(1, q));
        const rx = main.sx[i] - main.tx[i], ry = main.sy[i] - main.ty[i];
        const a = main.phi[i] * e, ca = Math.cos(a), sa = Math.sin(a), k = 1 - e;
        const jitter = q >= 1 ? .35 : 0;
        main.x[i] = main.tx[i] + (rx * ca - ry * sa) * k + Math.sin(T * 2.1 + main.seed[i]) * jitter;
        main.y[i] = main.ty[i] + (rx * sa + ry * ca) * k + Math.cos(T * 1.7 + main.seed[i]) * jitter;
      }
      continue;
    }

    // free particles: droplets relax toward the moving air
    flow(x, y, T);
    let ax, ay;
    if (spray || (conv && main.fade[i] !== -2)) {
      // air entrained by the jet keeps rolling forward, then turbulence takes over
      const dx = x - Main.nx, dy = y - Main.ny;
      const along = dx * dirX + dy * dirY, perp = -dx * dirY + dy * dirX;
      const ent = along > 0 ? 170 * S * Math.exp(-t * 1.1) * Math.exp(-(perp * perp) / (2 * Math.pow(60 * S + along * .22, 2))) : 0;
      ax = F[0] * 36 * S + dirX * ent; ay = F[1] * 36 * S + dirY * ent - 6 * S;
    } else if (field) {
      const dx = x - cx, dy = y - cy, r = Math.hypot(dx, dy) + 1;
      const sw = 70 * S * Math.min(1, r / (VH * .5));
      const push = 90 * S * Math.exp(-t * 1.4);
      ax = F[0] * fieldAir - dy / r * sw + dx / r * push;
      ay = F[1] * fieldAir + dx / r * sw + dy / r * push;
    } else {                                   // reveal sparkles
      ax = F[0] * 16 * S + main.vx[i] * .2; ay = F[1] * 16 * S - 26 * S;
    }
    const kd = spray ? main.drag[i] : field ? 1.3 : .8;
    const ed = Math.exp(-kd * dt);
    main.vx[i] = ax + (main.vx[i] - ax) * ed;
    main.vy[i] = ay + (main.vy[i] - ay) * ed + (spray && main.kind[i] === K_DOT ? 5 * S * dt : 0);
    main.x[i] = x + main.vx[i] * dt;
    main.y[i] = y + main.vy[i] * dt;
  }
}

function drawMain() {
  if (Main.mode === 'off' || !main.n) return;
  const t = (now - Main.t0) / 1000, sp = Sprites;
  const conv = Main.mode === 'converge';
  const reveal = conv && Main.revealAt ? (now - Main.revealAt) / 1000 : -1;
  const revealA = reveal >= 0 ? 1 - smoothstep(0, .85, reveal) : 1;

  // nozzle jet: bright narrow cone for the first ~0.45 s
  if (Main.mode === 'spray' && t < .7) {
    const env = t < .04 ? t / .04 : Math.exp(-(t - .04) * 5.5);
    const len = VW * .17 * (.5 + .5 * Math.min(1, t / .1));
    for (let k = 0; k < 12; k++) {
      const f = k / 12, d = len * f;
      const r = 3 * S + d * .075;
      fx.globalAlpha = env * .3 * Math.pow(1 - f, 2);
      fx.drawImage(sp.haze, Main.nx + Math.cos(Main.dir) * d - r, Main.ny + Math.sin(Main.dir) * d - r, r * 2, r * 2);
    }
    fx.globalCompositeOperation = 'lighter';
    fx.globalAlpha = env * .8;
    const g = 16 * S; fx.drawImage(sp.glint, Main.nx - g, Main.ny - g, g * 2, g * 2);
    fx.globalCompositeOperation = 'source-over';
  }

  // haze & glints first (volume), then the fine droplets batched by alpha
  const lv = Main.levels, lvN = Main.levelN; lvN.fill(0);
  const fieldIn = Main.mode === 'field';
  for (let i = 0; i < main.n; i++) {
    const k = main.kind[i], age = main.age[i];
    let a = main.alpha[i];
    if (Main.mode === 'spray' || (fieldIn && main.life[i] < 1e8)) a *= fadeInOut(age, main.life[i], .03, 1.2);
    if (main.fade[i] < 0 && main.fade[i] !== -2) a *= clamp01(age / -main.fade[i]);
    if (conv) {
      if (main.col[i] < 0 && main.fade[i] > 0) a *= 1 - clamp01((now - main.fade[i]) / 900);
      if (main.fade[i] === -2) a *= reveal >= 0 ? 1 - smoothstep(.8, 2.4, reveal) : 1;
      else a *= revealA;
    }
    if (a <= .01) continue;
    if (k === K_HAZE) {
      const vx = main.vx[i], vy = main.vy[i], spd = Math.hypot(vx, vy);
      const r = main.size[i] + (fieldIn ? 170 : 150) * S * (1 - Math.exp(-age * 1.1));
      const st = 1 + Math.min(2.2, spd / (420 * S));
      fx.globalAlpha = a * (fieldIn ? .8 : 1);
      fx.setTransform(DPR, 0, 0, DPR, 0, 0);
      fx.translate(main.x[i], main.y[i]); fx.rotate(Math.atan2(vy, vx)); fx.scale(st, 1 / Math.sqrt(st));
      fx.drawImage(sp.haze, -r, -r, r * 2, r * 2);
      fx.setTransform(DPR, 0, 0, DPR, 0, 0);
    } else if (k === K_GLINT && !(conv && main.col[i] >= 0)) {
      const tw = .55 + .45 * Math.sin(T * 5 + main.seed[i]);
      const r = (2.2 + main.size[i] * 1.6) * (.8 + tw * .4);
      fx.globalCompositeOperation = 'lighter';
      fx.globalAlpha = a * .7 * tw;
      fx.drawImage(sp.glint, main.x[i] - r, main.y[i] - r, r * 2, r * 2);
      fx.globalCompositeOperation = 'source-over';
    } else if (conv && main.col[i] >= 0 && main.fade[i] !== -2) {
      // drawn per colour bucket below
    } else if (main.size[i] > 1.3) {
      const r = main.size[i] * 1.7;
      fx.globalAlpha = a * .8;
      fx.drawImage(sp.dot, main.x[i] - r, main.y[i] - r, r * 2, r * 2);
    } else {
      const l = Math.min(5, (a * 6) | 0);
      lv[l][lvN[l]++] = i;
    }
  }
  fx.fillStyle = `rgb(${rgbStr(mixRGB(L.mist, [255, 255, 255], .55))})`;
  for (let l = 0; l < 6; l++) {
    if (!lvN[l]) continue;
    fx.globalAlpha = (l + .5) / 6;
    fx.beginPath();
    const arr = lv[l];
    for (let n = 0; n < lvN[l]; n++) {
      const i = arr[n], r = main.size[i] * .75;
      fx.moveTo(main.x[i] + r, main.y[i]); fx.arc(main.x[i], main.y[i], r, 0, 6.2832);
    }
    fx.fill();
  }

  // convergence dots, coloured by the real bottle
  if (conv && Main.buckets) {
    const pc = smoothstep(.4, TIMING.convergence / 1000, t);
    for (let b = 0; b < Main.buckets.length; b++) {
      const col = mixRGB([255, 252, 246], mixRGB(Main.bucketCols[b], [255, 246, 232], .45), pc * .5);
      fx.fillStyle = `rgb(${rgbStr(col)})`;
      fx.globalAlpha = .92 * revealA;
      fx.beginPath();
      const arr = Main.buckets[b];
      for (let n = 0; n < arr.length; n++) {
        const i = arr[n];
        if (i >= main.n || Main.slot[i] !== b || main.fade[i] === -2) continue;
        const q = clamp01((t - main.delay[i]) / main.dur[i]);
        const r = main.size[i] * lerp(1.15, .8, q);
        fx.moveTo(main.x[i] + r, main.y[i]); fx.arc(main.x[i], main.y[i], r, 0, 6.2832);
      }
      fx.fill();
    }
  }
  fx.globalAlpha = 1;
}

function drawFx() {
  fx.setTransform(1, 0, 0, 1, 0, 0);
  fx.clearRect(0, 0, el.fx.width, el.fx.height);
  fx.setTransform(DPR, 0, 0, DPR, 0, 0);
  drawAmbient();
  drawMain();
}


/* ───────────────────────── 10. STATE MACHINE ─────────────────────────
   INTRO → ZOOM → INTERACTION → SPRAY → LOADING → CONVERGE → RESULT
   ───────────────────────────────────────────────────────────────────── */

let state = 'boot', t0 = performance.now();
let ranked = null, resultShownAt = 0;

function go(next) {
  const prev = state;
  state = next; t0 = performance.now();
  el.body.dataset.state = next;
  onEnter[next]?.(prev);
  syncHud();
}

const onEnter = {
  intro(prev) {
    VR.send('idle');
    Receipt.close();
    closeVrPreview();
    el.copyDiscover.classList.remove('is-in');
    el.status.classList.remove('is-in');
    hideResult();
    Main.mode = 'off'; main.clear();
    // replay the headline reveal
    el.title.classList.remove('is-in'); void el.title.offsetWidth;
    setTimeout(() => { el.title.classList.add('is-in'); el.copyIntro.classList.add('is-in'); }, prev === 'boot' ? 250 : 500);
    Sound.mood(.45);
  },
  zoom() {
    el.copyIntro.classList.remove('is-in');
    Sound.whoosh(TIMING.zoom / 1000);
  },
  interaction() {
    el.copyDiscover.classList.add('is-in');
    const d = describeControls();
    setCaption('Mood', d.mood);
    Input.lastTouch = performance.now();
    Sound.mood(1);
  },
  spray() {
    el.copyDiscover.classList.remove('is-in');
    setStatus('Finding your scent…');
    ranked = recommend(target);
    prepareResult(ranked);
    startSpray();
    Sound.spray();
  },
  loading() {
    setStatus(`Exploring <span class="count">${PERFUMES.length}</span> possibilities`);
    startField();
    Sound.mood(.7);
  },
  converge() {
    startConverge();
  },
  vr() {
    VR.send('vr', ranked[0].p);
    Sound.chime();
    if (CONFIG.VR_PREVIEW_ON_SCREEN) openVrPreview();
  },
  result() {
    el.result.classList.add('is-in');
    el.status.classList.remove('is-in');
    resultShownAt = performance.now();
  },
};

function tickState() {
  const dt = now - t0;
  switch (state) {
    case 'zoom': if (dt >= TIMING.zoom) go('interaction'); break;
    case 'interaction':
      if (now - Input.lastTouch > CONFIG.INTERACTION_IDLE_RESET_MS) resetToIntro();
      break;
    case 'spray': if (dt >= TIMING.spray) go('loading'); break;
    case 'loading': if (dt >= TIMING.possibilities) go('converge'); break;
    case 'converge': {
      // possibilities collapse: 18 → 1
      const p = clamp01(dt / TIMING.convergence);
      const count = Math.max(1, Math.round(Math.pow(PERFUMES.length, 1 - easeInOutSine(p))));
      const c = el.statusText.querySelector('.count');
      if (count === 1 && c) setStatus('Your scent');
      else if (c && c.textContent !== String(count)) c.textContent = count;
      if (!Main.revealAt && dt >= TIMING.convergence) {
        beginReveal();
        el.result.classList.add('revealed');
        Sound.chime();
      }
      if (dt >= TIMING.convergence + TIMING.reveal * .45) go('result');
      break;
    }
    case 'vr':
      if (Main.mode === 'converge' && Main.revealAt && now - Main.revealAt > 2600) { Main.mode = 'off'; main.clear(); }
      if (now - t0 > CONFIG.VR_MAX_MS) resetToIntro();
      break;
    case 'result':
      if (Main.mode === 'converge' && Main.revealAt && now - Main.revealAt > 2600) { Main.mode = 'off'; main.clear(); }
      if (now - resultShownAt > CONFIG.RESULT_IDLE_RESET_MS && now - Input.lastTouch > CONFIG.RESULT_IDLE_RESET_MS) resetToIntro();
      break;
  }
}

let pressTimer = 0;
function onButtonPress() {
  Sound.unlock();
  if (state === 'intro') go('zoom');
  else if (state === 'interaction') go('spray');
  else if (state === 'result') {
    if (!CONFIG.VR_ENABLED) { resetToIntro(); return; }
    if (pressTimer) { clearTimeout(pressTimer); pressTimer = 0; go('vr'); }          // double-press → VR
    else pressTimer = setTimeout(() => { pressTimer = 0; if (state === 'result') resetToIntro(); }, CONFIG.DOUBLE_PRESS_MS);
  }
  else if (state === 'vr') resetToIntro();                                           // single press → next visitor
}

/* ── Receipt (58 mm printer): the visitor's mood, their perfume and the AR drawing ──
   Drawn by receipt.js, printed by server.py (/api/print). The QR code opens ar.html on
   the visitor's phone; the drawing above it is what the phone tracks. */
const Receipt = {
  busy: false, hideTimer: 0,
  hold(f) {                                               // the ring that fills while the button is held
    const box = $('#printHold'); if (!box) return;
    box.classList.toggle('is-on', f > .12 && !this.busy);
    $('#printHoldRing').style.strokeDashoffset = String(176 * (1 - clamp01(f)));
  },
  async print() {
    const R = window.SyntraReceipt;
    if (this.busy || !ranked || !R) return;
    this.busy = true; Input.lastTouch = performance.now();
    const p = ranked[0].p, d = describeControls();
    const moodKey = MOOD_KEYS[zones.mood] || Object.entries(p.mood).sort((a, b) => b[1] - a[1])[0][0];
    let base = CONFIG.AR_BASE_URL;
    if (!base) try { const i = await (await fetch('/api/info', { cache: 'no-store' })).json(); base = i.publicUrl ? `${i.publicUrl}/ar.html` : `https://${i.ip}:${i.httpsPort}/ar.html`; } catch {}   // the online link works on any network
    const url = base ? `${base}?p=${encodeURIComponent(p.id)}&m=${moodKey}` : '';
    const canvas = await R.receiptCanvas({ perfume: p, moodKey, choices: { expression: d.expression, occasion: d.occasion, hours: zones.hours }, url });

    // on screen: the receipt slides out of the printer's mouth
    const look = R.thermalLook(canvas), paper = $('#printPaper'), sheet = $('#printSheet');
    paper.style.backgroundImage = `url(${look.toDataURL()})`;
    paper.style.aspectRatio = `${look.width} / ${look.height}`;
    $('#printMsg').textContent = 'Printing your scent';
    $('#printSub').textContent = 'Scan the code on your receipt, then point your phone at the drawing';
    sheet.classList.remove('is-on'); void sheet.offsetWidth; sheet.classList.add('is-on');
    Sound.chime();

    const bits = R.toBits(canvas);
    let b64 = ''; for (let i = 0; i < bits.bytes.length; i += 0x8000) b64 += String.fromCharCode(...bits.bytes.subarray(i, i + 0x8000));
    let res = { printed: false, message: 'The receipt server is not running.' };
    try {
      res = await (await fetch('/api/print', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ width: bits.width, height: bits.height, bytesPerRow: bits.bytesPerRow, bits: btoa(b64) }) })).json();
    } catch {}
    setTimeout(() => {
      $('#printMsg').textContent = res.printed ? 'Take your receipt' : 'Receipt ready';
      if (!res.printed) $('#printSub').textContent = `${res.message || 'No printer found.'}${res.saved ? ` Saved as ${res.saved}` : ''}`;
    }, 2600);
    clearTimeout(this.hideTimer);
    this.hideTimer = setTimeout(() => this.close(), 9000);
  },
  close() {
    clearTimeout(this.hideTimer);
    $('#printSheet')?.classList.remove('is-on');
    this.hold(0);
    setTimeout(() => { this.busy = false; }, 700);
    Input.lastTouch = performance.now();
  },
};

/* ── VR link: tells the Meta Quest page (vr.html) what to show ── */
function vrPayload(p) {
  const key = Object.entries(p.mood).sort((a, b) => b[1] - a[1])[0][0];
  const look = MOOD_LOOK[MOOD_KEYS.indexOf(key)];
  return {
    id: p.id, name: p.name, line: p.line, image: p.image, moodKey: key,
    top: p.top, heart: p.heart, base: p.base, character: p.character,
    mood: moodLabel(p), occasion: occLabel(p), longevity: p.longevity,
    palette: { tint: look.tint, light: look.light, mist: look.mist, shade: look.shade, energy: look.energy },
  };
}
// the same VR world, shown on this screen (for testing without a headset / for onlookers)
function openVrPreview() {
  const f = document.getElementById('vrFrame'); if (!f) return;
  f.classList.remove('loaded');
  f.onload = () => { if (f.src.includes('vr.html')) f.classList.add('loaded'); };
  f.src = 'vr.html?embed';
}
function closeVrPreview() {
  const f = document.getElementById('vrFrame'); if (!f) return;
  f.classList.remove('loaded');
  setTimeout(() => { if (state !== 'vr') f.src = 'about:blank'; }, 1300);
}
const VR = {
  send(mode, p) {
    if (!CONFIG.VR_ENABLED) return;
    fetch('/api/vr', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode, perfume: p ? vrPayload(p) : null }) }).catch(() => {});
  },
};

function resetToIntro() {
  if (state === 'boot') return;
  if (state === 'intro') return;
  go('intro');
}

function setStatus(html) {
  const s = el.statusText;
  if (!el.status.classList.contains('is-in')) { s.innerHTML = html; el.status.classList.add('is-in'); return; }
  s.style.opacity = 0;
  setTimeout(() => { s.innerHTML = html; s.style.opacity = 1; }, 330);
}

/* ── result screen ── */
const moodLabel = p => { let best = null, w = -1; for (const k in p.mood) if (p.mood[k] > w) { w = p.mood[k]; best = k; } return best[0].toUpperCase() + best.slice(1); };
const occLabel = p => p.occasion.map(o => o[0].toUpperCase() + o.slice(1)).join(' · ');

function prepareResult(list) {
  const { p, score } = list[0];
  $('#resName').textContent = p.name;
  $('#resSub').textContent = p.line;
  $('#resTop').textContent = p.top.join(' · ');
  $('#resHeart').textContent = p.heart.join(' · ');
  $('#resBase').textContent = p.base.join(' · ');
  $('#resLong').textContent = `${p.longevity} Hours`;
  $('#resMood').textContent = moodLabel(p);
  $('#resOcc').textContent = occLabel(p);
  $('#resMrp').textContent = p.mrp;
  $('#resChar').textContent = p.character.join(' · ');
  const pct = Math.round(score * 100);
  $('#resMatch').innerHTML = `<small>Your match</small><span>${pct}%</span><i><b></b></i>`;
  $('#resMatch').style.setProperty('--match', `${pct}%`);
  $('#resAlts').innerHTML = `<span class="alt-k">Also close to you</span>` + list.slice(1, 3).map(({ p: a, score: s }) =>
    `<figure><img src="${a.image}" alt=""><figcaption><b>${a.name}</b>${Math.round(s * 100)}% match</figcaption></figure>`).join('');
  el.result.classList.remove('exploring', 'revealed', 'is-in');

  // bottle size: fit inside the campaign frame
  const img = el.resBottle;
  const fit = () => {
    const maxH = VH * .48, maxW = VW * .19;          // never wider than the gap in the glass band
    const r = img.naturalWidth / img.naturalHeight || .5;
    let h = maxH, w = h * r;
    if (w > maxW) { w = maxW; h = w / r; }
    img.style.width = `${w}px`; img.style.height = `${h}px`;
  };
  img.onload = fit;
  img.src = p.image; img.alt = p.name;
  if (img.complete) fit();

  // headline fits on one line
  fitName();
  el.result.classList.add('is-staged');
  resultAccent = averageAccent(p);
}
function fitName() {
  const n = $('#resName');
  el.result.style.setProperty('--res-name-size', `${Math.min(VH * .15, VW * .086)}px`);
  const max = VW * .56;
  const w = n.scrollWidth;
  if (w > max) el.result.style.setProperty('--res-name-size', `${Math.min(VH * .15, VW * .086) * max / w}px`);
}
const accentCache = {};
function averageAccent(p) {
  if (accentCache[p.id]) return accentCache[p.id];
  const img = preload[p.image];
  if (!img || !img.naturalWidth) return null;
  const c = document.createElement('canvas'); c.width = 24; c.height = 36;
  const g = c.getContext('2d', { willReadFrequently: true });
  try {
    g.drawImage(img, 0, 0, 24, 36);
    const d = g.getImageData(0, 0, 24, 36).data;
    let r = 0, gg = 0, b = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; n++; }
    return (accentCache[p.id] = n ? [r / n, gg / n, b / n] : null);
  } catch { return null; }
}
function hideResult() {
  el.result.classList.remove('is-in', 'revealed', 'exploring');
  setTimeout(() => { if (state !== 'result' && state !== 'converge') el.result.classList.remove('is-staged'); }, 1400);
  resultAccent = null;
}
function toggleExplore() { el.result.classList.toggle('exploring'); }
$('#btnAgain').addEventListener('click', () => resetToIntro());
$('#eyeBtn').addEventListener('click', ev => { ev.currentTarget.blur(); CONFIG.SHOW_HUD = !CONFIG.SHOW_HUD; syncHud(); });
$('#btnExplore').addEventListener('click', toggleExplore);


/* ───────────────────────── 11. SOUND ─────────────────────────
   Tiny synthesised sound design (no files). Browsers only allow audio
   after a click or key press on the page.
   ───────────────────────────────────────────────────────────── */

const Sound = {
  ctx: null, master: null, pad: null, padGain: null, filter: null, enabled: CONFIG.SOUND, noise: null,
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain(); this.master.gain.value = this.enabled ? .55 : 0; this.master.connect(ctx.destination);
    const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;
    // ambient pad
    this.filter = ctx.createBiquadFilter(); this.filter.type = 'lowpass'; this.filter.frequency.value = 520; this.filter.Q.value = .4;
    this.padGain = ctx.createGain(); this.padGain.gain.value = 0;
    this.filter.connect(this.padGain); this.padGain.connect(this.master);
    [[98, 'sine', .5], [146.83, 'sine', .32], [196, 'triangle', .1], [293.66, 'sine', .05]].forEach(([f, type, g]) => {
      const o = ctx.createOscillator(), og = ctx.createGain();
      o.type = type; o.frequency.value = f; o.detune.value = (Math.random() - .5) * 8; og.gain.value = g;
      o.connect(og); og.connect(this.filter); o.start();
    });
    const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = .06; lg.gain.value = 160;
    lfo.connect(lg); lg.connect(this.filter.frequency); lfo.start();
    this.mood(state === 'interaction' ? 1 : .45);
  },
  toggle() { this.enabled = !this.enabled; if (this.master) this.master.gain.setTargetAtTime(this.enabled ? .55 : 0, this.ctx.currentTime, .1); },
  mood(level) { if (!this.ctx) return; this.padGain.gain.setTargetAtTime(.05 * level, this.ctx.currentTime, 1.2); },
  setTone() { if (!this.ctx) return; this.filter.frequency.setTargetAtTime(lerp(900, 280, look.mood * .6 + look.occasion * .4), this.ctx.currentTime, .8); },
  noiseBurst({ dur, type, freq, q = .7, gain, attack = .01, sweepTo }) {
    if (!this.ctx || !this.enabled) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = this.noise;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master); src.start(t); src.stop(t + dur + .05);
  },
  whoosh(dur) { this.noiseBurst({ dur, type: 'bandpass', freq: 180, q: .9, gain: .18, attack: dur * .55, sweepTo: 900 }); },
  spray() {
    this.noiseBurst({ dur: .75, type: 'highpass', freq: 2800, q: .5, gain: .32, attack: .012 });
    this.noiseBurst({ dur: 1.6, type: 'bandpass', freq: 5200, q: .6, gain: .07, attack: .06, sweepTo: 1800 });
  },
  chime() {
    if (!this.ctx || !this.enabled) return;
    const ctx = this.ctx, t = ctx.currentTime;
    [659.25, 987.77, 1318.5, 1975.5].forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0, t + i * .06); g.gain.linearRampToValueAtTime(.05 / (i + 1), t + i * .06 + .02);
      g.gain.exponentialRampToValueAtTime(.0001, t + i * .06 + 3.2);
      o.connect(g); g.connect(this.master); o.start(t + i * .06); o.stop(t + 3.5);
    });
  },
  tick() {
    if (!this.ctx || !this.enabled) return;
    const ctx = this.ctx, t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = 1900;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.018, t + .004); g.gain.exponentialRampToValueAtTime(.0001, t + .08);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + .1);
  },
};


/* ───────────────────────── developer bar ───────────────────────── */

/* ── Arduino plug icon: green = data arriving, amber = port open but silent ── */
let plugWasLive = false, plugNoteTimer = 0;
function plugNote(text, ms = 3000) {
  const n = document.getElementById('plugNote'); if (!n) return;
  n.textContent = text; n.classList.add('is-on');
  clearTimeout(plugNoteTimer);
  plugNoteTimer = setTimeout(() => n.classList.remove('is-on'), ms);
}
function updatePlug(t) {
  const plug = document.getElementById('plugBtn'); if (!plug) return;
  const live = Serial.connected && t - Serial.lastDataAt < 1500;
  plug.classList.toggle('live', live);
  plug.classList.toggle('waiting', Serial.connected && !live);
  if (live && !plugWasLive) plugNote('ESP32 connected', 2500);
  if (Serial.connected && !live && !Serial.warned && t - Serial.openedAt > 3000) {
    Serial.warned = true;
    plugNote(plugWasLive ? 'ESP32 stopped sending — check the USB cable' : 'Port open but no data — is the ESP32 plugged in?', 8000);
  }
  if (live) Serial.warned = false;
  plugWasLive = live;
}

function toggleDevbar() { el.devbar.hidden = !el.devbar.hidden; updateDevbar(); }
function setDevStatus(s) { $('#devStatus').textContent = s; }
function updateDevbar() {
  const m = $('#devMode');
  m.textContent = Input.mode === 'arduino' ? 'Arduino mode' : 'Simulation mode';
  m.classList.toggle('on', Input.mode === 'arduino');
  $('#devConnect').textContent = Serial.connected ? 'Disconnect' : 'Connect Arduino';
  const plug = document.getElementById('plugBtn');
  if (plug) {
    plug.setAttribute('aria-pressed', String(Serial.connected));
    plug.setAttribute('aria-label', Serial.connected ? 'Disconnect Arduino (J)' : 'Connect Arduino (J)');
    plug.title = Serial.connected ? 'Arduino connected: click or press J to disconnect' : 'Connect Arduino: click or press J';
  }
}
$('#devMode').addEventListener('click', () => { Input.mode = Input.mode === 'arduino' ? 'simulation' : 'arduino'; updateDevbar(); });
$('#devConnect').addEventListener('click', () => Serial.toggle());
$('#plugBtn').addEventListener('click', ev => { ev.currentTarget.blur(); Serial.toggle(); });
let devLineShown = '';
function updateDevLine() {
  if (el.devbar.hidden) return;
  const d = describeControls();
  const txt = `${Serial.connected ? `Arduino · ${Serial.lastLine || 'waiting…'} (${Serial.adcMax === 4095 ? '12-bit' : '10-bit'})` : 'Simulation'}   →   mood ${ctl.mood.toFixed(2)} ${d.mood} · expression ${ctl.expression.toFixed(2)} ${d.expression} · longevity ${d.longevity} · occasion ${d.occasion} · state ${state}`;
  if (txt !== devLineShown) { devLineShown = txt; $('#devLine').textContent = txt; }
  if (Serial.connected && Serial.lines) setDevStatus(`Connected · ${Serial.lines} lines received`);
}


/* ───────────────────────── 12. BOOT & LOOP ───────────────────────── */

const preload = {};
function loadImage(src) {
  return new Promise(res => {
    const img = new Image();
    // decode() can stall in background tabs, so never wait on it for long
    img.onload = () => Promise.race([img.decode ? img.decode().catch(() => {}) : null, new Promise(r => setTimeout(r, 250))]).then(() => res(img));
    img.onerror = () => res(img);
    img.src = src; preload[src] = img;
  });
}

function makeGrain() {
  const c = document.createElement('canvas'); c.width = c.height = 160;
  const g = c.getContext('2d'), d = g.createImageData(160, 160);
  for (let i = 0; i < d.data.length; i += 4) { const v = Math.random() * 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; }
  g.putImageData(d, 0, 0);
  el.grain.style.backgroundImage = `url(${c.toDataURL()})`;
}

function onResize() {
  VW = innerWidth; VH = innerHeight; S = VH / 1000;
  resizeFx();
  if (state === 'result' || state === 'converge') fitName();
}
addEventListener('resize', onResize);

let last = performance.now();
function frame(t) {
  now = t;
  const dt = Math.min(.05, (t - last) / 1000); last = t; T += dt;

  applyHeldKeys(dt);
  for (const k in target) {
    ctl[k] = approach(ctl[k], target[k], 9, dt);       // responsive but jitter-free
    look[k] = approach(look[k], ctl[k], 1.6, dt);      // the world follows slowly
  }
  Button.tick(t);
  updateZones();
  tickState();
  updateStage(dt);
  updateAtmosphere(dt);
  Sprites.update(mixRGB(L.mist, [255, 255, 255], .5));
  updateAmbient(dt);
  updateMain(dt);
  drawFx();
  updateHud();
  updateDevLine();
  updatePlug(t);
  if ((T * 4 | 0) !== ((T - dt) * 4 | 0)) Sound.setTone();

  requestAnimationFrame(frame);
}

async function boot() {
  if (location.protocol === 'file:') {
    console.warn('Open this through VS Code Live Server (http://127.0.0.1:5500). Some effects and Web Serial need it.');
    $('#liquid').style.display = 'none'; $('#sheen').style.display = 'none';
  }
  buildHud(); makeGrain(); onResize();
  const srcs = ['assets/bg.jpg', 'assets/bg-blur.jpg', 'assets/bottle.webp', 'assets/cap.webp', 'assets/logo.png', ...PERFUMES.map(p => p.image)];
  await Promise.race([Promise.all(srcs.map(loadImage)), new Promise(r => setTimeout(r, 4000))]);
  try { await Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 2500))]); } catch {}
  resetCam();
  cam.rigA = 1;
  updateZones(); syncHud(); updateDevbar();
  Serial.autoConnect().catch(() => {});
  requestAnimationFrame(t => { last = t; frame(t); });
  go('intro');
}
boot();

// handy from the browser console
window.ScentFinder = { CONFIG, TIMING, PERFUMES, recommend, target, go, Serial, Button };
