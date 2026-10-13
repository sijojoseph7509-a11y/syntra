/* ==========================================================================
   SYNTRA — the printed receipt (58 mm thermal, 384 dots wide) and its
   mood artwork.

   The artwork is the AR "marker": every perfume has its own black-and-white
   drawing (in its mood's style), so the phone knows which perfume a receipt
   belongs to, and grows that perfume's 3D scene out of the paper.
   The same drawing is used three ways, so it must stay identical:
     · printed on the receipt (kiosk, script.js → /api/print)
     · compiled into assets/ar/targets.mind (tools/build-ar-targets.mjs)
     · shown on the virtual receipt in the AR preview (ar.js)
   Change a drawing → rebuild targets.mind, or the phone will not recognise it.
   ========================================================================== */
import qrcode from './vendor/qrcode.mjs';

export const MOOD_KEYS = ['fresh', 'playful', 'romantic', 'warm', 'bold', 'mysterious'];
export const RECEIPT_W = 384;              // printable dots on 58 mm paper (203 dpi)
export const MARKER = 336;                 // artwork size in dots (≈ 42 mm)

// the system font keeps the artwork identical on every run (web fonts may load late)
const ART_FONT = "'Helvetica Neue', Helvetica, Arial, sans-serif";

function prng(seed) {                       // mulberry32: same mood → same drawing
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/* ───────── the six mood drawings (black on white, bold enough for thermal paper) ───────── */

function star(g, x, y, r, points = 5, inner = .45, rot = 0) {
  g.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const a = rot + i * Math.PI / points, rr = i % 2 ? r * inner : r;
    g[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
}
function leaf(g, x, y, len, ang, fill) {
  g.save(); g.translate(x, y); g.rotate(ang);
  g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(len * .5, -len * .38, len, 0); g.quadraticCurveTo(len * .5, len * .38, 0, 0);
  fill ? g.fill() : g.stroke();
  g.beginPath(); g.moveTo(0, 0); g.lineTo(len * .9, 0); g.stroke();
  g.restore();
}
function drop(g, x, y, s, fill) {
  g.beginPath(); g.moveTo(x, y - s * 1.4); g.bezierCurveTo(x + s, y - s * .3, x + s, y + s, x, y + s); g.bezierCurveTo(x - s, y + s, x - s, y - s * .3, x, y - s * 1.4);
  fill ? g.fill() : g.stroke();
}

const DRAW = {
  fresh(g, S, R) {
    for (let k = 0; k < 9; k++) {                                     // flowing water lines
      const y0 = S * (.18 + k * .085), amp = 6 + R() * 12, f = .02 + R() * .025, ph = R() * 6;
      g.lineWidth = k % 3 === 0 ? 5 : 2.5;
      g.beginPath();
      for (let x = S * .1; x <= S * .9; x += 3) g.lineTo(x, y0 + Math.sin(x * f + ph) * amp + Math.sin(x * f * 2.7) * amp * .3);
      g.stroke();
    }
    g.lineWidth = 2.5;
    for (let i = 0; i < 22; i++) drop(g, S * (.12 + R() * .76), S * (.14 + R() * .72), 5 + R() * 9, R() < .5);
    for (let i = 0; i < 6; i++) leaf(g, S * (.15 + R() * .7), S * (.15 + R() * .7), 26 + R() * 22, R() * 6.3, R() < .4);
  },
  playful(g, S, R) {
    const cell = S * .8 / 6;
    for (let r = 0; r < 6; r++) for (let c = 0; c < 6; c++) {
      const x = S * .1 + (c + .5) * cell + (R() - .5) * cell * .4, y = S * .1 + (r + .5) * cell + (R() - .5) * cell * .4, s = cell * (.22 + R() * .2);
      g.lineWidth = 3;
      switch ((R() * 6) | 0) {
        case 0: g.beginPath(); g.arc(x, y, s, 0, 6.3); R() < .5 ? g.fill() : g.stroke(); break;
        case 1: star(g, x, y, s * 1.2, 5, .45, R() * 6); R() < .5 ? g.fill() : g.stroke(); break;
        case 2: g.beginPath(); for (let a = 0; a < 14; a += .3) g.lineTo(x + Math.cos(a) * a * s * .08, y + Math.sin(a) * a * s * .08); g.stroke(); break;
        case 3: g.beginPath(); for (let i = 0; i < 6; i++) g.lineTo(x - s + i * s * .4, y + (i % 2 ? -s * .5 : s * .5)); g.stroke(); break;
        case 4: g.save(); g.translate(x, y); g.rotate(R() * 6); g.fillRect(-s * .8, -s * .35, s * 1.6, s * .7); g.restore(); break;
        default: g.beginPath(); g.moveTo(x, y - s); g.lineTo(x + s, y + s * .8); g.lineTo(x - s, y + s * .8); g.closePath(); R() < .5 ? g.fill() : g.stroke();
      }
    }
  },
  romantic(g, S, R) {
    const cx = S * .5, cy = S * .5;
    g.lineWidth = 3.5;                                               // rose: a spiral of petals
    for (let i = 0; i < 26; i++) {
      const a = i * 2.4, r = 8 + i * 4.2, pr = 10 + i * 1.6;
      g.beginPath(); g.arc(cx + Math.cos(a) * r * .35, cy + Math.sin(a) * r * .35, pr, a, a + 2.6); g.stroke();
    }
    g.lineWidth = 2.5;
    for (let i = 0; i < 16; i++) {                                    // drifting petals
      const a = R() * 6.3, d = S * (.3 + R() * .14);
      leaf(g, cx + Math.cos(a) * d, cy + Math.sin(a) * d, 18 + R() * 16, R() * 6.3, R() < .5);
    }
    for (let i = 0; i < 40; i++) { g.beginPath(); g.arc(S * (.1 + R() * .8), S * (.1 + R() * .8), 1.5 + R() * 3, 0, 6.3); g.fill(); }
  },
  warm(g, S, R) {
    const cx = S * .46, cy = S * .54;
    g.lineWidth = 4;
    g.beginPath(); g.arc(cx, cy, S * .12, 0, 6.3); g.fill();
    for (const r of [.17, .21, .26]) { g.beginPath(); g.arc(cx, cy, S * r, 0, 6.3); g.stroke(); }
    for (let i = 0; i < 44; i++) {                                    // sun rays of uneven length
      const a = i / 44 * 6.283, r0 = S * .29, r1 = r0 + S * (.04 + R() * .12);
      g.lineWidth = i % 4 === 0 ? 5 : 2.5;
      g.beginPath(); g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); g.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); g.stroke();
    }
    g.lineWidth = 2.5;
    for (let i = 0, n = 0; i < 400 && n < 12; i++) {                  // star-anise pods and cinnamon curls in the corners
      const x = S * (.12 + R() * .76), y = S * (.12 + R() * .76);
      if (Math.hypot(x - cx, y - cy) < S * .43) continue;
      n++;
      if (n % 3) { star(g, x, y, 9 + R() * 7, 8, .35, R() * 6); R() < .5 ? g.fill() : g.stroke(); }
      else { g.beginPath(); for (let a = 0; a < 12; a += .3) g.lineTo(x + Math.cos(a) * a * 1.1, y + Math.sin(a) * a * 1.1); g.stroke(); }
    }
    for (let i = 0; i < 30; i++) { const a = R() * 6.3, d = S * (.2 + R() * .06); g.beginPath(); g.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 2, 0, 6.3); g.fill(); }
  },
  bold(g, S, R) {
    for (let i = 0; i < 34; i++) {                                    // angular shards
      const x = S * (.12 + R() * .76), y = S * (.12 + R() * .76), s = 10 + R() * 26, a = R() * 6.3;
      g.beginPath(); g.moveTo(x + Math.cos(a) * s, y + Math.sin(a) * s);
      g.lineTo(x + Math.cos(a + 2.3) * s * .6, y + Math.sin(a + 2.3) * s * .6); g.lineTo(x + Math.cos(a + 3.9) * s * .8, y + Math.sin(a + 3.9) * s * .8); g.closePath();
      g.lineWidth = 3; R() < .55 ? g.fill() : g.stroke();
    }
    g.lineWidth = 6;
    for (let i = 0; i < 4; i++) { const y = S * (.2 + i * .2 + R() * .05); g.beginPath(); g.moveTo(S * .1, y); g.lineTo(S * .9, y - S * .12); g.stroke(); }
  },
  mysterious(g, S, R) {
    g.beginPath(); g.arc(S * .68, S * .32, S * .13, 0, 6.3); g.fill();          // crescent moon
    g.save(); g.fillStyle = '#fff'; g.beginPath(); g.arc(S * .73, S * .28, S * .115, 0, 6.3); g.fill(); g.restore();
    const stars = [];
    for (let i = 0; i < 34; i++) {
      const x = S * (.1 + R() * .8), y = S * (.1 + R() * .8);
      if (Math.hypot(x - S * .68, y - S * .32) < S * .16) continue;
      const r = 3 + R() * 9; stars.push([x, y]);
      star(g, x, y, r, R() < .5 ? 4 : 5, .38, R() * 6); g.fill();
    }
    g.lineWidth = 1.8;                                                // constellation lines
    for (let i = 0; i < stars.length - 1; i += 2) { g.beginPath(); g.moveTo(...stars[i]); g.lineTo(...stars[i + 1]); g.stroke(); }
    g.lineWidth = 3;                                                  // smoke curls
    for (let k = 0; k < 4; k++) {
      g.beginPath(); const y0 = S * (.62 + k * .07);
      for (let x = S * .1; x <= S * .9; x += 3) g.lineTo(x, y0 + Math.sin(x * .03 + k) * 10 * Math.sin(x * .007 + k));
      g.stroke();
    }
  },
};
const CORNERS = [                                                     // four different corner marks: the tracker always knows which way is up
  (g, x, y) => { g.beginPath(); g.arc(x, y, 9, 0, 6.3); g.fill(); },
  (g, x, y) => g.fillRect(x - 8, y - 8, 16, 16),
  (g, x, y) => { g.beginPath(); g.moveTo(x, y - 10); g.lineTo(x + 10, y + 8); g.lineTo(x - 10, y + 8); g.closePath(); g.fill(); },
  (g, x, y) => { g.beginPath(); g.moveTo(x, y - 10); g.lineTo(x + 10, y); g.lineTo(x, y + 10); g.lineTo(x - 10, y); g.closePath(); g.fill(); },
];

const hash = str => { let h = 2166136261; for (const ch of String(str)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
export const dominantMood = p => Object.entries(p.mood || {}).sort((a, b) => b[1] - a[1])[0]?.[0] || 'fresh';

// every perfume has its own drawing: its mood's style, its own layout and its name in the frame
export const perfumeArt = (perfume, S = MARKER) => markerCanvas(dominantMood(perfume), S, perfume.id, perfume.name);

// the artwork on its own (black on white), S × S dots
export function markerCanvas(moodKey, S = MARKER, seedKey = null, label = null) {
  const i = Math.max(0, MOOD_KEYS.indexOf(moodKey));
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  const k = S / MARKER; g.scale(k, k);
  g.fillStyle = '#fff'; g.fillRect(0, 0, MARKER, MARKER);
  g.fillStyle = g.strokeStyle = '#000'; g.lineCap = 'round'; g.lineJoin = 'round';
  g.lineWidth = 7; g.strokeRect(5, 5, MARKER - 10, MARKER - 10);                     // frame
  g.lineWidth = 2; g.strokeRect(16, 16, MARKER - 32, MARKER - 32);
  [[28, 28], [MARKER - 28, 28], [MARKER - 28, MARKER - 28], [28, MARKER - 28]].forEach(([x, y], j) => CORNERS[j](g, x, y));
  g.save(); g.beginPath(); g.rect(20, 20, MARKER - 40, MARKER - 58); g.clip();
  DRAW[MOOD_KEYS[i]](g, MARKER, prng(seedKey ? hash(seedKey) : 7919 * (i + 1)));
  g.restore();
  g.font = `700 13px ${ART_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.letterSpacing = '4px';
  g.fillText(`SYNTRA · ${(label || MOOD_KEYS[i]).toUpperCase()}`, MARKER / 2 + 2, MARKER - 29, MARKER - 110);
  return c;
}

/* ───────── the whole receipt ───────── */

function qrCanvas(text, px = 4) {
  const q = qrcode(0, 'M'); q.addData(text); q.make();
  const n = q.getModuleCount(), quiet = 3, c = document.createElement('canvas');
  c.width = c.height = (n + quiet * 2) * px;
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.fillStyle = '#000';
  for (let r = 0; r < n; r++) for (let col = 0; col < n; col++) if (q.isDark(r, col)) g.fillRect((col + quiet) * px, (r + quiet) * px, px, px);
  return c;
}

// perfume: catalogue entry · moodKey: the mood the visitor chose · choices: { expression, occasion, hours } · url: AR link
export async function receiptCanvas({ perfume, moodKey, choices = {}, url, date = new Date() }) {
  try { await document.fonts.ready; } catch {}
  const W = RECEIPT_W, SERIF = "'Instrument Serif', Georgia, serif", SANS = "'Manrope', 'Helvetica Neue', Arial, sans-serif";
  const c = document.createElement('canvas'); c.width = W; c.height = 1500;
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, W, c.height); g.fillStyle = '#000'; g.strokeStyle = '#000';
  g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  let y = 34;
  const text = (t, font, dy, spacing = '0px') => { g.font = font; g.letterSpacing = spacing; y += dy; g.fillText(t, W / 2 + (spacing === '0px' ? 0 : parseFloat(spacing) / 2), y); g.letterSpacing = '0px'; };
  const rule = (dy = 14) => { y += dy; g.fillRect(24, y, W - 48, 2); y += 2; };
  const fit = (t, font, max) => { g.font = font; let s = +(/(\d+)px/.exec(font)[1]); while (g.measureText(t).width > max && s > 14) { s -= 2; g.font = font.replace(/\d+px/, `${s}px`); } return g.font; };

  text('SYNTRA', `800 26px ${SANS}`, 0, '12px');
  text('a scent, found by you', `italic 20px ${SERIF}`, 28);
  rule(16);
  text('YOUR SCENT', `700 14px ${SANS}`, 34, '5px');
  text(perfume.name, fit(perfume.name, `400 52px ${SERIF}`, W - 40), 52);
  text('ZARA', `700 14px ${SANS}`, 26, '6px');
  const mood = MOOD_KEYS.includes(moodKey) ? moodKey : 'fresh';
  text(`Mood · ${mood[0].toUpperCase() + mood.slice(1)}`, `italic 28px ${SERIF}`, 42);
  const facts = [choices.expression, choices.occasion, choices.hours ? `${choices.hours} hours` : ''].filter(Boolean).join('  ·  ');
  if (facts) text(facts, `600 15px ${SANS}`, 26);
  rule(18);
  const tiers = [['TOP', perfume.top], ['HEART', perfume.heart], ['BASE', perfume.base]];
  const noteFont = tiers.map(([, l]) => fit(l.join(' · '), `500 17px ${SANS}`, W - 130)).sort((a, b) => parseFloat(/(\d+)px/.exec(a)[1]) - parseFloat(/(\d+)px/.exec(b)[1]))[0];
  for (const [k, list] of tiers) {                                         // one size for all three lines
    y += 30; g.textAlign = 'left'; g.font = `800 13px ${SANS}`; g.letterSpacing = '3px'; g.fillText(k, 26, y); g.letterSpacing = '0px';
    g.font = noteFont; g.textAlign = 'right'; g.fillText(list.join(' · '), W - 26, y); g.textAlign = 'center';
  }
  rule(22);
  // the artwork (AR marker)
  y += 16;
  const art = perfumeArt(perfume), markerY = y;                              // this perfume's own drawing (the phone recognises it)
  g.drawImage(art, (W - MARKER) / 2, y); y += MARKER;
  text('Your scent lives in this drawing', `italic 22px ${SERIF}`, 30);
  // QR → AR page
  if (url) {
    const q = qrCanvas(url, 4);
    y += 14; g.drawImage(q, (W - q.width) / 2, y); y += q.height;
    text('1  Scan the code with your phone camera', `600 15px ${SANS}`, 24);
    text('2  Point it at the drawing above', `600 15px ${SANS}`, 22);
  }
  rule(20);
  const d = date;
  text(`${d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}  ·  ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`, `600 14px ${SANS}`, 26);
  text('Thank you for discovering with us', `italic 20px ${SERIF}`, 28);
  y += 40;                                                                  // paper to tear off

  const out = document.createElement('canvas'); out.width = W; out.height = Math.ceil(y);
  out.getContext('2d').drawImage(c, 0, 0);
  out.markerY = markerY;                                                   // where the drawing sits (for the AR preview)
  return out;
}

// canvas → 1-bit rows for the printer (1 = black), ESC/POS order: 8 dots per byte, left bit first
export function toBits(canvas) {
  const { width: w, height: h } = canvas, bpr = Math.ceil(w / 8);
  const px = canvas.getContext('2d').getImageData(0, 0, w, h).data, bytes = new Uint8Array(bpr * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = (y * w + x) * 4, lum = px[o] * .299 + px[o + 1] * .587 + px[o + 2] * .114;
    if (lum < 128) bytes[y * bpr + (x >> 3)] |= 0x80 >> (x & 7);
  }
  return { width: w, height: h, bytesPerRow: bpr, bytes };
}

// what the thermal printer will actually produce (pure black and white), for previews
export function thermalLook(canvas) {
  const out = document.createElement('canvas'); out.width = canvas.width; out.height = canvas.height;
  const g = out.getContext('2d'); g.drawImage(canvas, 0, 0);
  const img = g.getImageData(0, 0, out.width, out.height), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const v = d[i] * .299 + d[i + 1] * .587 + d[i + 2] * .114 < 128 ? 0 : 255; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; }
  g.putImageData(img, 0, 0);
  return out;
}

if (typeof window !== 'undefined') window.SyntraReceipt = { markerCanvas, perfumeArt, receiptCanvas, toBits, thermalLook, MOOD_KEYS, RECEIPT_W, MARKER };
