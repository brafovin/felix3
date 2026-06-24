// ── Web Audio Engine ──────────────────────────────────────────────────────────
class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.enabled = false;
    this._engineOsc = null;
    this._engineGain = null;
    this._engineFilter = null;
    this._sirenOsc = null;
    this._sirenTimer = null;
    this._lastScreech = 0;
    this._lastStep = 0;
  }

  init() {
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.55;
      this.master.connect(this.ctx.destination);
      this.enabled = true;
    } catch (e) { console.warn('Web Audio API not available'); }
  }

  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }

  _noise(dur = 0.1) {
    const frames = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, frames, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < frames; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  shoot(type) {
    if (!this.enabled || this.muted) return;
    const now = this.ctx.currentTime;
    const cfgs = {
      pistol:  { f: 220, dur: 0.10, nv: 0.7, ov: 0.5, dc: 0.08 },
      smg:     { f: 180, dur: 0.07, nv: 0.5, ov: 0.4, dc: 0.05 },
      ak47:    { f: 130, dur: 0.14, nv: 0.9, ov: 0.6, dc: 0.10 },
      sniper:  { f:  70, dur: 0.32, nv: 1.2, ov: 0.9, dc: 0.28 },
      shotgun: { f:  55, dur: 0.22, nv: 1.5, ov: 1.0, dc: 0.18 },
      rpg:     { f:  45, dur: 0.18, nv: 0.6, ov: 0.4, dc: 0.14 },
    };
    const c = cfgs[type] || cfgs.pistol;

    const ns = this.ctx.createBufferSource();
    ns.buffer = this._noise(c.dur);
    const nf = this.ctx.createBiquadFilter();
    nf.type = 'bandpass'; nf.frequency.value = c.f * 3.5; nf.Q.value = 1.2;
    const ng = this.ctx.createGain();
    ng.gain.setValueAtTime(c.nv, now);
    ng.gain.exponentialRampToValueAtTime(0.001, now + c.dur);
    ns.connect(nf); nf.connect(ng); ng.connect(this.master);
    ns.start(now); ns.stop(now + c.dur);

    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(c.f * 4, now);
    osc.frequency.exponentialRampToValueAtTime(c.f * 0.4, now + c.dc);
    const og = this.ctx.createGain();
    og.gain.setValueAtTime(c.ov, now);
    og.gain.exponentialRampToValueAtTime(0.001, now + c.dc);
    osc.connect(og); og.connect(this.master);
    osc.start(now); osc.stop(now + c.dc + 0.05);
  }

  explosion(vol = 1) {
    if (!this.enabled || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(85, now);
    osc.frequency.exponentialRampToValueAtTime(22, now + 0.7);
    const og = this.ctx.createGain();
    og.gain.setValueAtTime(vol * 1.6, now);
    og.gain.exponentialRampToValueAtTime(0.001, now + 0.9);
    osc.connect(og); og.connect(this.master);
    osc.start(now); osc.stop(now + 0.9);

    const ns = this.ctx.createBufferSource();
    ns.buffer = this._noise(0.55);
    const nf = this.ctx.createBiquadFilter();
    nf.type = 'lowpass'; nf.frequency.value = 900;
    const ng = this.ctx.createGain();
    ng.gain.setValueAtTime(vol * 2.2, now);
    ng.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
    ns.connect(nf); nf.connect(ng); ng.connect(this.master);
    ns.start(now); ns.stop(now + 0.55);
  }

  pickup() {
    if (!this.enabled || this.muted) return;
    const now = this.ctx.currentTime;
    [523, 659, 784, 1047].forEach((f, i) => {
      const o = this.ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const g = this.ctx.createGain();
      const t = now + i * 0.07;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.28, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.18);
    });
  }

  hit() {
    if (!this.enabled || this.muted) return;
    const now = this.ctx.currentTime;
    const o = this.ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(320, now);
    o.frequency.exponentialRampToValueAtTime(80, now + 0.08);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.45, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    o.connect(g); g.connect(this.master); o.start(now); o.stop(now + 0.1);
  }

  startEngine() {
    if (!this.enabled || this._engineOsc) return;
    const now = this.ctx.currentTime;
    this._engineOsc = this.ctx.createOscillator();
    this._engineOsc.type = 'sawtooth';
    this._engineOsc.frequency.value = 75;

    const wave = this.ctx.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      const x = (i * 2) / 255 - 1;
      curve[i] = (Math.PI + 80) * x / (Math.PI + 80 * Math.abs(x));
    }
    wave.curve = curve;

    this._engineFilter = this.ctx.createBiquadFilter();
    this._engineFilter.type = 'lowpass';
    this._engineFilter.frequency.value = 350;

    this._engineGain = this.ctx.createGain();
    this._engineGain.gain.value = 0.12;

    this._engineOsc.connect(wave);
    wave.connect(this._engineFilter);
    this._engineFilter.connect(this._engineGain);
    this._engineGain.connect(this.master);
    this._engineOsc.start(now);
  }

  updateEngine(speed, maxSpeed) {
    if (!this._engineOsc) return;
    const r = Math.min(1, Math.abs(speed) / maxSpeed);
    const now = this.ctx.currentTime;
    this._engineOsc.frequency.setTargetAtTime(55 + r * 160, now, 0.08);
    this._engineGain.gain.setTargetAtTime(0.08 + r * 0.18, now, 0.08);
    if (this._engineFilter) this._engineFilter.frequency.setTargetAtTime(200 + r * 700, now, 0.08);
  }

  stopEngine() {
    if (!this._engineOsc) return;
    const now = this.ctx.currentTime;
    this._engineGain.gain.setTargetAtTime(0, now, 0.15);
    try { this._engineOsc.stop(now + 0.4); } catch (e) {}
    this._engineOsc = null; this._engineGain = null; this._engineFilter = null;
  }

  screech(intensity) {
    if (!this.enabled || this.muted || intensity < 0.15) return;
    const now = this.ctx.currentTime;
    if (now - this._lastScreech < 0.12) return;
    this._lastScreech = now;
    const ns = this.ctx.createBufferSource();
    ns.buffer = this._noise(0.14);
    const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1400; f.Q.value = 2.5;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(intensity * 0.55, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
    ns.connect(f); f.connect(g); g.connect(this.master);
    ns.start(now); ns.stop(now + 0.14);
  }

  footstep() {
    if (!this.enabled || this.muted) return;
    const now = this.ctx.currentTime;
    if (now - this._lastStep < 0.28) return;
    this._lastStep = now;
    const ns = this.ctx.createBufferSource();
    ns.buffer = this._noise(0.06);
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 280;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.18, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
    ns.connect(f); f.connect(g); g.connect(this.master);
    ns.start(now); ns.stop(now + 0.06);
  }

  siren(on) {
    if (!this.enabled) return;
    if (on && !this._sirenOsc) {
      const now = this.ctx.currentTime;
      this._sirenOsc = this.ctx.createOscillator();
      this._sirenOsc.type = 'square';
      this._sirenGain = this.ctx.createGain();
      this._sirenGain.gain.value = 0.08;
      const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1500;
      this._sirenOsc.connect(f); f.connect(this._sirenGain); this._sirenGain.connect(this.master);
      this._sirenOsc.start(now);
      const sweep = () => {
        if (!this._sirenOsc) return;
        const t = this.ctx.currentTime;
        this._sirenOsc.frequency.setValueAtTime(550, t);
        this._sirenOsc.frequency.linearRampToValueAtTime(800, t + 0.4);
        this._sirenOsc.frequency.linearRampToValueAtTime(550, t + 0.8);
        this._sirenTimer = setTimeout(sweep, 800);
      };
      sweep();
    } else if (!on && this._sirenOsc) {
      clearTimeout(this._sirenTimer);
      try { this._sirenOsc.stop(); } catch (e) {}
      this._sirenOsc = null;
    }
  }

  toggle() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.55;
    return !this.muted;
  }
}

window.Audio3D = new AudioEngine();
