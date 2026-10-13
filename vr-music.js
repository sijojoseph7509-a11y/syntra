/* ==========================================================================
   SYNTRA — generative music for the VR worlds
   Composed live with the Web Audio API (no audio files, works offline).
   Each world has its own key, harmony, tempo, instruments and nature sounds;
   switching worlds cross-fades to the next piece.
   ========================================================================== */

const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
const rand = (a, b) => a + Math.random() * (b - a);
const pick = a => a[(Math.random() * a.length) | 0];

/* chords are semitone offsets from `root` (MIDI note) */
const PRESETS = {
  lobby:    { root: 50, bpm: 56, chords: [[0, 7, 12, 15], [-2, 5, 10, 14], [-4, 3, 8, 12], [-5, 2, 7, 10]], pad: 'soft',  lead: 'bell',   arp: 0,   leadRate: .15, bass: false, nature: [] },
  floral:   { root: 53, bpm: 70, chords: [[0, 4, 7, 11, 14], [-3, 0, 4, 7, 11], [5, 9, 12, 16], [7, 12, 14, 19]], pad: 'warm', lead: 'harp', arp: .7, leadRate: .25, bass: true, nature: ['birds', 'breeze'] },
  citrus:   { root: 50, bpm: 96, chords: [[0, 4, 7, 12], [7, 11, 14, 19], [9, 12, 16, 21], [5, 9, 12, 17]], pad: 'light', lead: 'marimba', arp: 1, leadRate: .2, bass: true, nature: ['birds', 'breeze'] },
  woody:    { root: 50, bpm: 54, chords: [[0, 3, 7, 10], [-4, 0, 3, 8], [3, 7, 10, 15], [-2, 2, 5, 10]], pad: 'dark', lead: 'lowbell', arp: 0, leadRate: .12, bass: false, drone: true, nature: ['wind'] },
  warm:     { root: 57, bpm: 72, chords: [[0, 3, 7, 10, 14], [5, 8, 12, 15, 19], [-2, 2, 5, 9], [3, 7, 10, 14]], pad: 'warm', lead: 'rhodes', arp: .45, leadRate: .3, bass: true, nature: ['wind', 'leaves'] },
  warmDark: { root: 52, bpm: 62, chords: [[0, 3, 7, 12], [1, 5, 8, 13], [0, 3, 7, 12], [-2, 1, 5, 10]], pad: 'breath', lead: 'ney', arp: 0, leadRate: .35, bass: false, drone: true, scale: [0, 1, 3, 5, 7, 8, 10], nature: ['desert'] },
  night:    { root: 49, bpm: 52, chords: [[0, 7, 11, 14, 18], [-3, 4, 7, 11, 14], [2, 9, 12, 16], [-5, 2, 7, 11]], pad: 'soft', lead: 'glass', arp: .35, leadRate: .12, bass: false, drone: true, nature: ['crickets', 'water'] },
  snow:     { root: 60, bpm: 58, chords: [[0, 4, 7, 11, 14], [5, 9, 12, 16, 19], [-3, 4, 7, 12], [2, 6, 9, 14]], pad: 'soft', lead: 'glass', arp: .5, leadRate: .18, bass: false, nature: ['breeze'] },
  aquatic:  { root: 52, bpm: 66, chords: [[0, 4, 7, 11, 14], [-3, 1, 4, 8, 11], [5, 9, 12, 16], [7, 11, 14, 16]], pad: 'soft', lead: 'glass', arp: .8, leadRate: .2, bass: false, nature: ['water', 'breeze'] },
};

export class Music {
  constructor() { this.ctx = null; this.current = null; this.want = 'lobby'; this.volume = .55; }

  start() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain(); this.master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 3;
    this.master.connect(comp); comp.connect(ctx.destination);
    this.master.gain.setTargetAtTime(this.volume, ctx.currentTime, 1.5);
    // lush reverb from a generated impulse response
    this.reverb = ctx.createConvolver(); this.reverb.buffer = this.impulse(4.5, 2.6);
    this.wet = ctx.createGain(); this.wet.gain.value = .55;
    this.reverb.connect(this.wet); this.wet.connect(this.master);
    this.white = this.noise('white'); this.brown = this.noise('brown');
    this.timer = setInterval(() => this.tick(), 100);
    this.set(this.want);
  }

  set(name) {
    this.want = PRESETS[name] ? name : 'lobby';
    if (!this.ctx) return;
    if (this.current?.name === this.want) return;
    const t = this.ctx.currentTime;
    if (this.current) {                                  // fade the old piece out
      const old = this.current;
      old.bus.gain.cancelScheduledValues(t); old.bus.gain.setTargetAtTime(0, t, .9);
      setTimeout(() => { old.stops.forEach(s => { try { s.stop(); } catch {} }); old.timers.forEach(clearTimeout); old.bus.disconnect(); }, 5000);
    }
    const bus = this.ctx.createGain(); bus.gain.value = 0; bus.connect(this.master);
    const send = this.ctx.createGain(); send.gain.value = 1; bus.connect(send); send.connect(this.reverb);
    bus.gain.setTargetAtTime(1, t + .4, 1.4);
    this.current = { name: this.want, p: PRESETS[this.want], bus, stops: [], timers: [], bar: 0, next: t + .3 };
    for (const n of this.current.p.nature) this.nature(n, this.current);
  }

  stop() { if (this.ctx) this.master.gain.setTargetAtTime(0, this.ctx.currentTime, .6); }

  /* ── scheduler: queues one bar at a time, slightly ahead ── */
  tick() {
    const c = this.current; if (!c) return;
    const t = this.ctx.currentTime;
    while (c.next < t + .5) { this.bar(c, c.next); c.next += (60 / c.p.bpm) * 8; c.bar++; }
  }

  bar(c, t0) {
    const p = c.p, beat = 60 / p.bpm, len = beat * 8;
    const chord = p.chords[c.bar % p.chords.length].map(o => p.root + o);
    this.pad(c, chord, t0, len + beat * 2, p.pad);
    if (p.drone) this.pad(c, [p.root - 12, p.root - 5], t0, len + beat * 2, 'drone');
    if (p.bass) { this.voice(c, 'bass', chord[0] - 12, t0, 1); this.voice(c, 'bass', chord[0] - 12, t0 + beat * 4, .7); }
    if (p.arp) {                                         // arpeggio through the chord
      const steps = p.bpm > 90 ? 16 : 8, dt = len / steps, notes = [...chord, chord[1] + 12, chord[2] + 12];
      for (let i = 0; i < steps; i++) if (Math.random() < p.arp) {
        const n = notes[(i * (steps > 8 ? 3 : 2)) % notes.length] + 12;
        this.voice(c, p.lead, n, t0 + i * dt + rand(0, .015), .6 + Math.random() * .4);
      }
    }
    const scale = p.scale || [0, 2, 4, 5, 7, 9, 11];     // sparse melody on top
    for (let i = 0; i < 8; i++) if (Math.random() < p.leadRate) {
      const n = p.root + 12 + pick(scale) + (Math.random() < .3 ? 12 : 0);
      this.voice(c, p.lead === 'rhodes' ? 'rhodes' : (p.lead === 'ney' ? 'ney' : 'bell'), n, t0 + i * beat + rand(0, beat * .5), .5);
    }
  }

  /* ── instruments ── */
  pad(c, notes, t, dur, kind) {
    const ctx = this.ctx;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass';
    f.frequency.value = { warm: 1100, light: 1800, dark: 520, breath: 900, soft: 800, drone: 380 }[kind] || 900;
    const g = ctx.createGain(); g.gain.value = 0;
    const level = { warm: .05, light: .035, dark: .06, breath: .04, soft: .045, drone: .05 }[kind] || .045;
    g.gain.linearRampToValueAtTime(level, t + Math.min(2.5, dur * .35));
    g.gain.setValueAtTime(level, t + dur - 2.5); g.gain.linearRampToValueAtTime(0, t + dur + .5);
    f.connect(g); g.connect(c.bus);
    for (const n of notes) for (const det of [-7, 7]) {
      const o = ctx.createOscillator();
      o.type = kind === 'soft' || kind === 'drone' ? 'triangle' : 'sawtooth';
      o.frequency.value = mtof(n); o.detune.value = det + rand(-2, 2);
      o.connect(f); o.start(t); o.stop(t + dur + .6);
    }
  }

  voice(c, kind, note, t, vel = 1) {
    const ctx = this.ctx, f0 = mtof(note), out = ctx.createGain(), pan = ctx.createStereoPanner();
    pan.pan.value = rand(-.5, .5); out.connect(pan); pan.connect(c.bus);
    const osc = (type, freq, gain, dec, atk = .005) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type; o.frequency.value = freq;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain * vel, t + atk); g.gain.exponentialRampToValueAtTime(.0001, t + dec);
      o.connect(g); g.connect(out); o.start(t); o.stop(t + dec + .05);
      return o;
    };
    switch (kind) {
      case 'harp':    osc('triangle', f0, .09, 1.8); osc('sine', f0 * 2, .02, .8); break;
      case 'marimba': osc('sine', f0, .1, .55); osc('sine', f0 * 4, .025, .15); break;
      case 'glass':   osc('sine', f0, .06, 3.2); osc('sine', f0 * 2.76, .02, 1.6); osc('sine', f0 * 5.4, .008, .7); break;
      case 'bell':    osc('sine', f0, .05, 3.5); osc('sine', f0 * 2.76, .018, 1.8); break;
      case 'lowbell': osc('sine', f0 / 2, .08, 5); osc('sine', f0 * 1.38, .02, 3); break;
      case 'bass':    osc('sine', f0, .12, 1.8, .02); osc('triangle', f0 * 2, .02, .6, .02); break;
      case 'rhodes': {
        const a = osc('sine', f0, .08, 2.6); osc('sine', f0 * 2, .025, 1.2);
        const trem = ctx.createOscillator(), tg = ctx.createGain(); trem.frequency.value = 4.5; tg.gain.value = .25;
        trem.connect(tg); tg.connect(out.gain); trem.start(t); trem.stop(t + 2.7);
        break;
      }
      case 'ney': {                                      // breathy reed flute with vibrato
        const o = ctx.createOscillator(), bp = ctx.createBiquadFilter(), g = ctx.createGain(), vib = ctx.createOscillator(), vg = ctx.createGain();
        o.type = 'sawtooth'; o.frequency.value = f0; bp.type = 'bandpass'; bp.frequency.value = f0 * 2; bp.Q.value = 3;
        vib.frequency.value = 5.2; vg.gain.value = f0 * .006; vib.connect(vg); vg.connect(o.frequency);
        const d = rand(1.2, 2.4);
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.07 * vel, t + .35); g.gain.linearRampToValueAtTime(0, t + d);
        o.connect(bp); bp.connect(g); g.connect(out); o.start(t); vib.start(t); o.stop(t + d + .1); vib.stop(t + d + .1);
        break;
      }
    }
  }

  /* ── nature layers ── */
  nature(kind, c) {
    const ctx = this.ctx, t = ctx.currentTime;
    const loop = (buf) => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.start(t); c.stops.push(s); return s; };
    const lfo = (freq, amount, target) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = freq; g.gain.value = amount; o.connect(g); g.connect(target); o.start(t); c.stops.push(o); };
    if (kind === 'wind' || kind === 'breeze' || kind === 'desert') {
      const src = loop(this.brown), bp = ctx.createBiquadFilter(), g = ctx.createGain();
      bp.type = 'bandpass'; bp.frequency.value = kind === 'desert' ? 380 : kind === 'wind' ? 520 : 900; bp.Q.value = .6;
      g.gain.value = kind === 'breeze' ? .06 : .12;
      lfo(.07, kind === 'breeze' ? 200 : 300, bp.frequency); lfo(.045, g.gain.value * .6, g.gain);
      src.connect(bp); bp.connect(g); g.connect(c.bus);
    }
    if (kind === 'water') {
      const src = loop(this.white), lp = ctx.createBiquadFilter(), g = ctx.createGain();
      lp.type = 'lowpass'; lp.frequency.value = 650; g.gain.value = .02;
      src.connect(lp); lp.connect(g); g.connect(c.bus);
      const lap = () => {                                // small waves against the pier
        const now = ctx.currentTime, d = rand(1.2, 2.6);
        g.gain.setTargetAtTime(rand(.06, .12), now, .25); g.gain.setTargetAtTime(.02, now + d * .5, .5);
        c.timers.push(setTimeout(lap, rand(1400, 3400)));
      };
      lap();
    }
    if (kind === 'birds') {
      const song = () => {
        const now = ctx.currentTime + .05, n = 2 + (Math.random() * 4 | 0), base = rand(2600, 4800), pan = ctx.createStereoPanner();
        pan.pan.value = rand(-.9, .9); pan.connect(c.bus);
        for (let i = 0; i < n; i++) {
          const o = ctx.createOscillator(), g = ctx.createGain(), s = now + i * rand(.09, .16), d = rand(.05, .11);
          o.type = 'sine'; o.frequency.setValueAtTime(base * rand(.9, 1.15), s); o.frequency.exponentialRampToValueAtTime(base * rand(.6, .8), s + d);
          g.gain.setValueAtTime(0, s); g.gain.linearRampToValueAtTime(.018, s + .01); g.gain.exponentialRampToValueAtTime(.0001, s + d);
          o.connect(g); g.connect(pan); o.start(s); o.stop(s + d + .02);
        }
        c.timers.push(setTimeout(song, rand(900, 4200)));
      };
      song();
    }
    if (kind === 'crickets') {                           // night chorus: short pulsed chirps, left and right
      const chirp = () => {
        const now = ctx.currentTime + .05, f = rand(4200, 5200), pan = ctx.createStereoPanner(), n = 2 + (Math.random() * 3 | 0);
        pan.pan.value = rand(-.9, .9); pan.connect(c.bus);
        for (let i = 0; i < n; i++) {
          const o = ctx.createOscillator(), g = ctx.createGain(), s = now + i * .07;
          o.type = 'sine'; o.frequency.value = f;
          g.gain.setValueAtTime(0, s); g.gain.linearRampToValueAtTime(.008, s + .008); g.gain.exponentialRampToValueAtTime(.0001, s + .045);
          o.connect(g); g.connect(pan); o.start(s); o.stop(s + .06);
        }
        c.timers.push(setTimeout(chirp, rand(300, 1400)));
      };
      chirp(); chirp();
    }
    if (kind === 'leaves') {
      const rustle = () => {
        const now = ctx.currentTime, s = ctx.createBufferSource(), hp = ctx.createBiquadFilter(), g = ctx.createGain(), d = rand(.3, .9);
        s.buffer = this.white; hp.type = 'highpass'; hp.frequency.value = 2800;
        g.gain.setValueAtTime(0, now); g.gain.linearRampToValueAtTime(.025, now + d * .3); g.gain.linearRampToValueAtTime(0, now + d);
        s.connect(hp); hp.connect(g); g.connect(c.bus); s.start(now, rand(0, 2)); s.stop(now + d + .05);
        c.timers.push(setTimeout(rustle, rand(1500, 5000)));
      };
      rustle();
    }
  }

  /* ── helpers ── */
  noise(kind) {
    const len = this.ctx.sampleRate * 3, buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate), d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'brown') { last = (last + .02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
    }
    return buf;
  }
  impulse(seconds, decay) {
    const rate = this.ctx.sampleRate, len = rate * seconds, buf = this.ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }
}
