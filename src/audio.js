/**
 * Small procedural audio engine — no sample files, just candlelit Web Audio.
 */
class CourtAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.sfx = null;
    this.musicBus = null;
    this.reverb = null;
    this.enabled = true;
    this.musicEnabled = true;
    this.musicTimer = null;
    this.musicStep = 0;
    this.initialized = false;
    this.lastHover = 0;
  }

  init() {
    if (this.initialized) {
      this.resume();
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    try {
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.7;

      const compressor = this.ctx.createDynamicsCompressor();
      compressor.threshold.value = -18;
      compressor.knee.value = 18;
      compressor.ratio.value = 3;
      compressor.attack.value = 0.004;
      compressor.release.value = 0.22;

      this.master.connect(compressor);
      compressor.connect(this.ctx.destination);

      this.sfx = this.ctx.createGain();
      this.sfx.gain.value = this.enabled ? 0.8 : 0;
      this.sfx.connect(this.master);

      this.musicBus = this.ctx.createGain();
      this.musicBus.gain.value = this.musicEnabled ? 0.5 : 0;
      this.musicBus.connect(this.master);

      this.reverb = this.ctx.createConvolver();
      this.reverb.buffer = this.makeImpulse(2.4, 3.2);
      this.reverb.connect(this.musicBus);

      this.initialized = true;
      this.resume();
    } catch (error) {
      this.ctx = null;
    }
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  makeImpulse(seconds = 2, decay = 3) {
    const rate = this.ctx.sampleRate;
    const length = Math.floor(rate * seconds);
    const buffer = this.ctx.createBuffer(2, length, rate);
    for (let channel = 0; channel < 2; channel += 1) {
      const data = buffer.getChannelData(channel);
      for (let i = 0; i < length; i += 1) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
      }
    }
    return buffer;
  }

  setEnabled(value) {
    this.enabled = Boolean(value);
    if (this.sfx && this.ctx) {
      this.sfx.gain.setTargetAtTime(this.enabled ? 0.8 : 0, this.ctx.currentTime, 0.05);
    }
  }

  setMusicEnabled(value) {
    this.musicEnabled = Boolean(value);
    if (this.musicBus && this.ctx) {
      this.musicBus.gain.setTargetAtTime(this.musicEnabled ? 0.5 : 0, this.ctx.currentTime, 0.3);
    }
    if (this.musicEnabled) this.startMusic();
    else this.stopMusic();
  }

  startMusic() {
    if (!this.musicEnabled) return;
    this.init();
    if (!this.ctx || this.musicTimer) return;
    this.musicStep = 0;
    this.musicTimer = window.setInterval(() => this.tickMusic(), 720);
    this.tickMusic();
  }

  stopMusic() {
    if (this.musicTimer) {
      window.clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }

  tickMusic() {
    if (!this.ctx || !this.musicEnabled || !this.musicBus) return;
    const now = this.ctx.currentTime + 0.06;
    const chords = [
      [146.83, 174.61, 220.0, 293.66], // D minor
      [116.54, 146.83, 174.61, 233.08], // B-flat
      [98.0, 116.54, 146.83, 196.0], // G minor
      [110.0, 138.59, 164.81, 220.0] // A
    ];
    const chord = chords[Math.floor(this.musicStep / 8) % chords.length];
    const step = this.musicStep % 8;

    if (step === 0) {
      this.bass(chord[0] / 2, now, 2.8);
    }
    const pattern = [0, 2, 1, 3, 2, 1, 3, 2];
    const note = chord[pattern[step] % chord.length] * (step % 3 === 0 ? 2 : 1);
    this.pluck(note, now, 0.12, 2.2, 'triangle');
    if (step === 4) this.pluck(chord[0], now + 0.18, 0.07, 1.4, 'sine');
    this.musicStep += 1;
  }

  bass(freq, time, duration) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    osc.type = 'sine';
    osc.frequency.value = freq;
    filter.type = 'lowpass';
    filter.frequency.value = 260;
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(0.05, time + 0.18);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.musicBus);
    gain.connect(this.reverb);
    osc.start(time);
    osc.stop(time + duration + 0.1);
  }

  pluck(freq, time, volume = 0.1, duration = 1.4, type = 'triangle') {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    osc.type = type;
    osc.frequency.value = freq;
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2600, time);
    filter.frequency.exponentialRampToValueAtTime(520, time + duration);
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(volume, time + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.musicBus);
    const wet = this.ctx.createGain();
    wet.gain.value = 0.4;
    gain.connect(wet);
    wet.connect(this.reverb);
    osc.start(time);
    osc.stop(time + duration + 0.1);
  }

  tone(freq, duration, volume, type = 'sine', when = 0, destination = null) {
    if (!this.ctx) return;
    const time = this.ctx.currentTime + when;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, time);
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(volume, time + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    osc.connect(gain);
    gain.connect(destination || this.sfx);
    if (destination) {
      const wet = this.ctx.createGain();
      wet.gain.value = 0.24;
      gain.connect(wet);
      wet.connect(this.reverb);
    }
    osc.start(time);
    osc.stop(time + duration + 0.05);
  }

  noise(duration, volume, filterType = 'highpass', frequency = 1200, when = 0) {
    if (!this.ctx) return;
    const time = this.ctx.currentTime + when;
    const length = Math.max(1, Math.floor(this.ctx.sampleRate * duration));
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    }
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = frequency;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfx);
    source.start(time);
  }

  play(name) {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    this.resume();
    const now = this.ctx.currentTime;

    switch (name) {
      case 'click':
        this.tone(760, 0.06, 0.055, 'sine');
        break;
      case 'select':
        this.tone(659.25, 0.18, 0.06, 'triangle');
        this.tone(987.77, 0.26, 0.045, 'sine', 0.045);
        break;
      case 'play':
        this.noise(0.18, 0.12, 'highpass', 900);
        this.tone(130.81, 0.28, 0.1, 'sine', 0.03);
        this.tone(196.0, 0.2, 0.035, 'triangle', 0.02);
        break;
      case 'draw':
        this.noise(0.09, 0.07, 'highpass', 1600);
        break;
      case 'seal':
        this.tone(98, 0.22, 0.16, 'sine');
        this.noise(0.06, 0.09, 'lowpass', 700);
        break;
      case 'reveal':
        [587.33, 739.99, 880, 1174.66].forEach((f, i) =>
          this.tone(f, 0.5, 0.045, 'triangle', i * 0.075)
        );
        break;
      case 'eliminate':
        this.tone(110, 0.9, 0.12, 'sawtooth');
        this.tone(116.54, 0.9, 0.08, 'sawtooth', 0.03);
        this.tone(55, 1.1, 0.1, 'sine');
        this.noise(0.4, 0.06, 'lowpass', 500);
        break;
      case 'token':
        [587.33, 880, 1174.66].forEach((f, i) =>
          this.tone(f, 0.55, 0.06, 'sine', i * 0.09, this.sfx)
        );
        break;
      case 'win':
        [293.66, 349.23, 440, 587.33, 698.46, 880].forEach((f, i) =>
          this.tone(f, 1.4, 0.07, 'triangle', i * 0.14, this.reverb)
        );
        this.tone(146.83, 2.4, 0.06, 'sine', 0.1, this.reverb);
        break;
      case 'error':
        this.tone(155.56, 0.22, 0.07, 'square');
        this.tone(146.83, 0.3, 0.06, 'square', 0.06);
        break;
      case 'turn':
        this.tone(523.25, 0.34, 0.04, 'sine', 0, this.sfx);
        this.tone(783.99, 0.45, 0.035, 'sine', 0.08, this.sfx);
        break;
      case 'hover': {
        const t = performance.now();
        if (t - this.lastHover < 90) return;
        this.lastHover = t;
        this.tone(1200, 0.035, 0.016, 'sine');
        break;
      }
      case 'chancellor':
        this.noise(0.16, 0.045, 'bandpass', 1800);
        this.tone(392, 0.5, 0.035, 'sine', 0.05);
        break;
      case 'page':
        this.noise(0.12, 0.05, 'highpass', 1400);
        break;
      default:
        this.tone(440, 0.08, 0.04, 'sine');
    }
  }
}

export const audio = new CourtAudio();
