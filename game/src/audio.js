// WebAudio synthesis: sound effects + a quiet music sequencer + mute.
// No audio files, no network, no AudioWorklet — everything is oscillators
// and filtered noise, created lazily on the first user gesture.
const MUTE_KEY = 'emberkeep.muted.v1';

function loadMuted() {
  try {
    return window.localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.sfxGain = null;
    this._muted = loadMuted();
    this.musicTimer = null;
    this.musicStep = 0;
    this.nextNoteTime = 0;
    this.musicMode = 'normal';
    this.melodyIndex = 3;
    this.gemCombo = 0;
    this.lastGemAt = 0;
    this.lastPlayAt = {};
  }

  get muted() {
    return this._muted;
  }

  unlock() {
    if (!this.ctx) {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this._muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.14;
      this.musicGain.connect(this.master);
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = 0.9;
      this.sfxGain.connect(this.master);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  toggleMute() {
    this._muted = !this._muted;
    try {
      window.localStorage.setItem(MUTE_KEY, this._muted ? '1' : '0');
    } catch {
      // Mute state is a nicety; the game plays on without storing it.
    }
    if (this.master) this.master.gain.value = this._muted ? 0 : 0.5;
  }

  // Throttle high-frequency effects so a crowd fight does not clip.
  throttled(name, minGapSeconds) {
    const now = this.ctx ? this.ctx.currentTime : 0;
    if (now - (this.lastPlayAt[name] || -99) < minGapSeconds) return true;
    this.lastPlayAt[name] = now;
    return false;
  }

  tone({ freq, freqEnd, duration, type = 'sine', gain = 0.2, when = 0, destination = null }) {
    if (!this.ctx) return;
    const startAt = this.ctx.currentTime + when;
    const osc = this.ctx.createOscillator();
    const amp = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, startAt);
    if (freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), startAt + duration);
    amp.gain.setValueAtTime(gain, startAt);
    amp.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
    osc.connect(amp);
    amp.connect(destination || this.sfxGain);
    osc.start(startAt);
    osc.stop(startAt + duration + 0.02);
  }

  noise({ duration, gain = 0.2, filterFreq = 1200, when = 0, destination = null }) {
    if (!this.ctx) return;
    const startAt = this.ctx.currentTime + when;
    const length = Math.max(1, Math.floor(this.ctx.sampleRate * duration));
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const amp = this.ctx.createGain();
    amp.gain.setValueAtTime(gain, startAt);
    amp.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
    source.connect(filter);
    filter.connect(amp);
    amp.connect(destination || this.sfxGain);
    source.start(startAt);
    source.stop(startAt + duration + 0.02);
  }

  sfx(name) {
    if (!this.ctx || this._muted) return;
    switch (name) {
      case 'shoot':
        if (this.throttled('shoot', 0.07)) return;
        this.tone({ freq: 880, freqEnd: 440, duration: 0.06, type: 'square', gain: 0.06 });
        break;
      case 'hit':
        if (this.throttled('hit', 0.05)) return;
        this.noise({ duration: 0.03, gain: 0.08, filterFreq: 3000 });
        break;
      case 'die':
        if (this.throttled('die', 0.05)) return;
        this.tone({ freq: 320, freqEnd: 80, duration: 0.12, type: 'square', gain: 0.12 });
        break;
      case 'gem': {
        if (this.throttled('gem', 0.03)) return;
        const now = performance.now();
        this.gemCombo = now - this.lastGemAt < 500 ? this.gemCombo + 1 : 0;
        this.lastGemAt = now;
        const freq = 660 * Math.pow(2, Math.min(this.gemCombo, 24) / 24);
        this.tone({ freq, duration: 0.08, type: 'sine', gain: 0.1 });
        break;
      }
      case 'hurt':
        this.tone({ freq: 110, duration: 0.15, type: 'sine', gain: 0.25 });
        this.noise({ duration: 0.1, gain: 0.12, filterFreq: 500 });
        break;
      case 'levelup':
        [72, 76, 79, 84].forEach((note, i) => {
          this.tone({ freq: midiToFreq(note), duration: 0.18, type: 'triangle', gain: 0.16, when: i * 0.09 });
        });
        break;
      case 'pick':
        this.tone({ freq: 660, duration: 0.05, type: 'sine', gain: 0.12 });
        break;
      case 'pickup':
        [72, 76, 79].forEach((note, i) => {
          this.tone({ freq: midiToFreq(note), duration: 0.12, type: 'sine', gain: 0.14, when: i * 0.06 });
        });
        break;
      case 'nova':
        this.noise({ duration: 0.4, gain: 0.25, filterFreq: 900 });
        this.tone({ freq: 160, freqEnd: 40, duration: 0.35, type: 'sine', gain: 0.3 });
        break;
      case 'boss':
        this.tone({ freq: 80, freqEnd: 400, duration: 0.8, type: 'sawtooth', gain: 0.2 });
        this.tone({ freq: 55, duration: 0.5, type: 'sine', gain: 0.3 });
        break;
      case 'bossBurst':
        this.noise({ duration: 0.2, gain: 0.15, filterFreq: 1800 });
        break;
      case 'summon':
        this.tone({ freq: 300, freqEnd: 600, duration: 0.2, type: 'sine', gain: 0.1 });
        break;
      case 'spit':
        if (this.throttled('spit', 0.2)) return;
        this.tone({ freq: 220, freqEnd: 140, duration: 0.08, type: 'sawtooth', gain: 0.05 });
        break;
      case 'banner':
        this.tone({ freq: 1046, duration: 0.3, type: 'sine', gain: 0.08 });
        break;
      case 'elite':
        this.tone({ freq: 520, freqEnd: 780, duration: 0.15, type: 'triangle', gain: 0.12 });
        break;
      case 'victory':
        [72, 76, 79, 84, 88].forEach((note, i) => {
          this.tone({ freq: midiToFreq(note), duration: 0.3, type: 'triangle', gain: 0.18, when: i * 0.12 });
        });
        break;
      case 'defeat':
        [57, 55, 53, 50].forEach((note, i) => {
          this.tone({ freq: midiToFreq(note), duration: 0.35, type: 'sine', gain: 0.16, when: i * 0.2 });
        });
        break;
      default:
        // Unknown event names are ignored: the world may emit events the
        // sound engine has no voice for.
        break;
    }
  }

  startMusic(mode = 'normal') {
    this.unlock();
    if (!this.ctx) return;
    this.musicMode = mode;
    if (this.musicTimer) return;
    this.musicStep = 0;
    this.nextNoteTime = this.ctx.currentTime + 0.1;
    this.musicTimer = window.setInterval(() => this.scheduleMusic(), 60);
  }

  stopMusic() {
    if (this.musicTimer) {
      window.clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }

  scheduleMusic() {
    if (!this.ctx) return;
    const eighth = 60 / 100 / 2; // 100 BPM eighth notes.
    while (this.nextNoteTime < this.ctx.currentTime + 0.18) {
      this.scheduleStep(this.musicStep, this.nextNoteTime);
      this.musicStep = (this.musicStep + 1) % 16;
      this.nextNoteTime += eighth;
    }
  }

  scheduleStep(step, when) {
    const bassNotes = [33, 0, 33, 0, 36, 0, 40, 0, 33, 0, 33, 0, 38, 0, 40, 0];
    const bossBass = this.musicMode === 'boss';
    const bass = bossBass ? [33, 33, 36, 33, 40, 33, 38, 36, 33, 33, 36, 33, 40, 38, 36, 40][step] : bassNotes[step];
    if (bass) {
      this.tone({ freq: midiToFreq(bass), duration: 0.28, type: 'triangle', gain: 0.22, when: when - this.ctx.currentTime, destination: this.musicGain });
    }
    if (step % 4 === 0) {
      this.tone({ freq: 120, freqEnd: 40, duration: 0.12, type: 'sine', gain: 0.2, when: when - this.ctx.currentTime, destination: this.musicGain });
    }
    // Sparse pluck melody: pentatonic random walk, every other bar's off-beat.
    if (step % 4 === 2 && Math.random() < 0.6) {
      const scale = [57, 60, 62, 64, 67, 69, 72];
      this.melodyIndex = Math.max(0, Math.min(scale.length - 1, this.melodyIndex + (Math.random() < 0.5 ? -1 : 1)));
      this.tone({ freq: midiToFreq(scale[this.melodyIndex]), duration: 0.3, type: 'sine', gain: 0.08, when: when - this.ctx.currentTime, destination: this.musicGain });
    }
    if (step % 2 === 1) {
      this.noise({ duration: 0.03, gain: 0.03, filterFreq: 6000, when: when - this.ctx.currentTime, destination: this.musicGain });
    }
  }
}

export const audio = new AudioEngine();
