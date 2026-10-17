/**
 * Sound effects and music are free CC0 recordings (Kenney and OpenGameArt; public/assets/sfx/ and
 * public/assets/music/, built by tools/build-sfx.mjs). Sounds without a recording (shots, lightning,
 * explosions, …) are synthesized with WebAudio from short envelopes over oscillators and filtered
 * noise. Until a recording has loaded, its synthesized version plays instead (for the music: a slow,
 * quiet minor-key loop).
 */

export type SfxName =
  | 'click' | 'card' | 'draw' | 'summon' | 'swing' | 'hit' | 'heroHit' | 'shoot' | 'magic' | 'curse'
  | 'fire' | 'frost' | 'zap' | 'whoosh' | 'explosion' | 'heal' | 'buff' | 'wardBreak' | 'death'
  | 'myTurn' | 'enemyTurn' | 'coin' | 'stageClear' | 'victory' | 'defeat' | 'error' | 'revive' | 'shuffle';

/** Background music moods (one recording each). */
export type TrackName = 'title' | 'forest' | 'dungeon' | 'cave' | 'boss';
const TRACK_VOL = 0.6;

interface ToneOpts {
  type?: OscillatorType;
  vol?: number;
  /** Frequency at the end of the sound (exponential slide). */
  to?: number;
  attack?: number;
  delay?: number;
  /** Low-pass cutoff in Hz. */
  cutoff?: number;
}

interface NoiseOpts {
  vol?: number;
  filter?: BiquadFilterType;
  freq?: number;
  /** Filter frequency at the end of the sound. */
  to?: number;
  q?: number;
  delay?: number;
  attack?: number;
}

const PREFS_KEY = 'card-survival-audio-v1';

/** Sampled sounds: how many variants (<name>_<n>.mp3) and how loud. Keep in step with tools/build-sfx.mjs. */
const SAMPLES: Partial<Record<SfxName, { count: number; vol: number; vary?: boolean }>> = {
  click: { count: 3, vol: 0.35 },
  card: { count: 3, vol: 0.6, vary: true },
  draw: { count: 3, vol: 0.4, vary: true },
  shuffle: { count: 1, vol: 0.45 },
  summon: { count: 3, vol: 0.6, vary: true },
  swing: { count: 3, vol: 0.5, vary: true },
  hit: { count: 3, vol: 0.55, vary: true },
  heroHit: { count: 3, vol: 0.75, vary: true },
  wardBreak: { count: 3, vol: 0.45, vary: true },
  death: { count: 3, vol: 0.6, vary: true },
  coin: { count: 2, vol: 0.55 },
  error: { count: 2, vol: 0.4 },
  myTurn: { count: 1, vol: 0.45 },
  fire: { count: 4, vol: 0.5, vary: true },
  frost: { count: 3, vol: 0.5, vary: true },
  heal: { count: 3, vol: 0.45, vary: true },
  magic: { count: 3, vol: 0.45, vary: true },
  curse: { count: 2, vol: 0.5, vary: true },
  buff: { count: 2, vol: 0.45, vary: true },
  stageClear: { count: 1, vol: 0.6 },
  victory: { count: 1, vol: 0.65 },
  defeat: { count: 1, vol: 0.6 },
};

/** A minor progression (Am – F – Dm – E), as root frequencies and chord tones. */
const CHORDS: { bass: number; tones: number[] }[] = [
  { bass: 55.0, tones: [220.0, 261.63, 329.63] },
  { bass: 43.65, tones: [174.61, 220.0, 261.63] },
  { bass: 73.42, tones: [146.83, 174.61, 220.0] },
  { bass: 41.2, tones: [164.81, 207.65, 246.94] },
];
const BEAT = 0.75; // seconds per beat (80 bpm)
const BEATS_PER_CHORD = 8;

export class Sound {
  sfxOn = true;
  musicOn = true;
  private ctx: AudioContext | null = null;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;
  private noiseBuffer!: AudioBuffer;
  private lastPlayed = new Map<SfxName, number>();
  private samples = new Map<SfxName, AudioBuffer[]>();
  private wantedTrack: TrackName | null = null;
  private tracks = new Map<TrackName, AudioBuffer>();
  private trackLoading = new Set<TrackName>();
  private current: { name: TrackName; src: AudioBufferSourceNode; gain: GainNode } | null = null;
  private musicTimer = 0;
  private nextBeatTime = 0;
  private beat = 0;

  constructor() {
    try {
      const saved = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') as { sfx?: boolean; music?: boolean };
      this.sfxOn = saved.sfx ?? true;
      this.musicOn = saved.music ?? true;
    } catch {
      // Defaults.
    }
  }

  /** Browsers only allow audio after a user gesture; call this from one. */
  unlock() {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      const master = this.ctx.createGain();
      master.gain.value = 0.8;
      // Gentle limiting so stacked hits do not clip.
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -12;
      comp.ratio.value = 6;
      master.connect(comp).connect(this.ctx.destination);
      this.sfxBus = this.ctx.createGain();
      this.sfxBus.gain.value = this.sfxOn ? 1 : 0;
      this.sfxBus.connect(master);
      this.musicBus = this.ctx.createGain();
      this.musicBus.gain.value = this.musicOn ? 0.55 : 0;
      this.musicBus.connect(master);
      this.noiseBuffer = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      void this.loadSamples(this.ctx);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    if (this.musicOn) this.startMusic();
    this.updateTrack();
  }

  /** Switches the background music (cross-fading once the recording has loaded). */
  setTrack(name: TrackName) {
    this.wantedTrack = name;
    this.updateTrack();
  }

  private updateTrack() {
    const ctx = this.ctx;
    const name = this.wantedTrack;
    if (!ctx || !name || this.current?.name === name) return;
    const buffer = this.tracks.get(name);
    if (!buffer) {
      void this.loadTrack(ctx, name);
      return;
    }
    const old = this.current;
    if (old) {
      old.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.6);
      old.src.stop(ctx.currentTime + 4);
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.gain.setTargetAtTime(TRACK_VOL, ctx.currentTime, 0.8);
    src.connect(gain).connect(this.musicBus);
    src.start();
    this.current = { name, src, gain };
  }

  private async loadTrack(ctx: AudioContext, name: TrackName) {
    if (this.trackLoading.has(name)) return;
    this.trackLoading.add(name);
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}assets/music/${name}.mp3`);
      if (res.ok) this.tracks.set(name, await ctx.decodeAudioData(await res.arrayBuffer()));
    } catch {
      // Keep the synthesized loop.
    }
    this.updateTrack();
  }

  setSfx(on: boolean) {
    this.sfxOn = on;
    if (this.ctx) this.sfxBus.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.05);
    this.savePrefs();
  }

  setMusic(on: boolean) {
    this.musicOn = on;
    if (this.ctx) {
      this.musicBus.gain.setTargetAtTime(on ? 0.55 : 0, this.ctx.currentTime, 0.3);
      if (on) this.startMusic();
    }
    this.savePrefs();
  }

  private savePrefs() {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({ sfx: this.sfxOn, music: this.musicOn }));
    } catch {
      // Not persisted.
    }
  }

  play(name: SfxName) {
    const ctx = this.ctx;
    if (!ctx || !this.sfxOn || ctx.state !== 'running') return;
    // Many identical events can land at once (area spells); one sound per burst is enough.
    const now = performance.now();
    if (now - (this.lastPlayed.get(name) ?? 0) < 45) return;
    this.lastPlayed.set(name, now);
    const sampled = this.samples.get(name);
    if (sampled?.length) {
      this.playSample(ctx, name, sampled[Math.floor(Math.random() * sampled.length)]);
      return;
    }
    const t = (f: number, d: number, o?: ToneOpts) => this.tone(f, d, o);
    const n = (d: number, o?: NoiseOpts) => this.noise(d, o);
    switch (name) {
      case 'click': t(660, 0.05, { type: 'square', vol: 0.06, cutoff: 2500 }); break;
      case 'card': n(0.18, { vol: 0.25, filter: 'bandpass', freq: 2400, to: 700, q: 1.2 }); break;
      case 'draw': n(0.08, { vol: 0.12, filter: 'highpass', freq: 3000 }); break;
      case 'summon':
        n(0.25, { vol: 0.35, filter: 'lowpass', freq: 400, to: 120 });
        t(196, 0.22, { type: 'triangle', vol: 0.18, to: 392 });
        break;
      case 'swing': n(0.14, { vol: 0.22, filter: 'bandpass', freq: 900, to: 3200, q: 2 }); break;
      case 'hit':
        n(0.12, { vol: 0.35, filter: 'lowpass', freq: 1400, to: 300 });
        t(150, 0.12, { type: 'sine', vol: 0.3, to: 55 });
        break;
      case 'heroHit':
        n(0.3, { vol: 0.45, filter: 'lowpass', freq: 900, to: 120 });
        t(110, 0.35, { type: 'sine', vol: 0.45, to: 38 });
        t(220, 0.18, { type: 'sawtooth', vol: 0.08, to: 90, cutoff: 900 });
        break;
      case 'shoot':
        n(0.06, { vol: 0.18, filter: 'highpass', freq: 4000 });
        t(1100, 0.12, { type: 'triangle', vol: 0.1, to: 500 });
        break;
      case 'magic':
        t(520, 0.3, { type: 'sine', vol: 0.12, to: 1040 });
        t(780, 0.3, { type: 'sine', vol: 0.07, to: 1560, delay: 0.04 });
        break;
      case 'curse':
        t(240, 0.4, { type: 'sawtooth', vol: 0.08, to: 120, cutoff: 900 });
        t(253, 0.4, { type: 'sawtooth', vol: 0.06, to: 113, cutoff: 900 });
        break;
      case 'fire':
        n(0.45, { vol: 0.4, filter: 'lowpass', freq: 300, to: 2400, attack: 0.05 });
        n(0.3, { vol: 0.15, filter: 'highpass', freq: 3000, delay: 0.1 });
        break;
      case 'frost':
        for (let i = 0; i < 4; i++) t(1500 + i * 420, 0.35, { type: 'sine', vol: 0.06, delay: i * 0.05 });
        n(0.3, { vol: 0.1, filter: 'highpass', freq: 5000 });
        break;
      case 'zap':
        n(0.18, { vol: 0.3, filter: 'highpass', freq: 2000 });
        t(90, 0.22, { type: 'square', vol: 0.15, to: 45, cutoff: 1500 });
        break;
      case 'whoosh': n(0.4, { vol: 0.3, filter: 'bandpass', freq: 300, to: 1800, q: 0.8, attack: 0.1 }); break;
      case 'explosion':
        n(0.7, { vol: 0.6, filter: 'lowpass', freq: 1200, to: 80 });
        t(90, 0.6, { type: 'sine', vol: 0.5, to: 28 });
        break;
      case 'heal':
        [523.25, 659.25, 783.99].forEach((f, i) => t(f, 0.35, { type: 'sine', vol: 0.12, delay: i * 0.07, attack: 0.02 }));
        break;
      case 'buff':
        t(440, 0.25, { type: 'triangle', vol: 0.14, to: 880 });
        t(660, 0.2, { type: 'sine', vol: 0.08, delay: 0.08 });
        break;
      case 'wardBreak':
        t(1800, 0.25, { type: 'triangle', vol: 0.12, to: 400 });
        n(0.2, { vol: 0.2, filter: 'highpass', freq: 3500 });
        break;
      case 'death':
        t(330, 0.4, { type: 'sawtooth', vol: 0.1, to: 70, cutoff: 1200 });
        n(0.3, { vol: 0.15, filter: 'lowpass', freq: 600, to: 100, delay: 0.1 });
        break;
      case 'revive':
        t(220, 0.4, { type: 'sine', vol: 0.12, to: 660 });
        t(330, 0.4, { type: 'sine', vol: 0.08, to: 990, delay: 0.05 });
        break;
      case 'myTurn':
        t(659.25, 0.25, { type: 'triangle', vol: 0.14 });
        t(987.77, 0.4, { type: 'triangle', vol: 0.14, delay: 0.12 });
        break;
      case 'enemyTurn':
        t(196, 0.35, { type: 'sawtooth', vol: 0.07, cutoff: 700 });
        t(185, 0.5, { type: 'sawtooth', vol: 0.07, cutoff: 700, delay: 0.18 });
        break;
      case 'coin':
        t(1318.5, 0.08, { type: 'square', vol: 0.06, cutoff: 5000 });
        t(1975.5, 0.25, { type: 'square', vol: 0.06, cutoff: 5000, delay: 0.07 });
        break;
      case 'stageClear':
        [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => t(f, i === 3 ? 0.6 : 0.18, { type: 'triangle', vol: 0.14, delay: i * 0.12 }));
        break;
      case 'victory':
        [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => t(f, i === 4 ? 0.9 : 0.2, { type: 'triangle', vol: 0.15, delay: i * 0.14 }));
        [261.63, 329.63, 392].forEach((f) => t(f, 1.2, { type: 'sine', vol: 0.08, delay: 0.56, attack: 0.05 }));
        break;
      case 'defeat':
        [392, 349.23, 311.13, 261.63].forEach((f, i) => t(f, i === 3 ? 1 : 0.32, { type: 'sawtooth', vol: 0.08, cutoff: 1100, delay: i * 0.3 }));
        break;
      case 'error': t(110, 0.14, { type: 'square', vol: 0.08, cutoff: 800 }); break;
      case 'shuffle': for (let i = 0; i < 5; i++) n(0.06, { vol: 0.1, filter: 'highpass', freq: 2500, delay: i * 0.07 }); break;
    }
  }

  /** Fetches and decodes the sampled sounds in the background (a failed one stays synthesized). */
  private async loadSamples(ctx: AudioContext) {
    const base = `${import.meta.env.BASE_URL}assets/sfx/`;
    await Promise.all(Object.entries(SAMPLES).map(async ([name, spec]) => {
      const buffers = await Promise.all(Array.from({ length: spec.count }, async (_, i) => {
        try {
          const res = await fetch(`${base}${name}_${i}.mp3`);
          return res.ok ? await ctx.decodeAudioData(await res.arrayBuffer()) : null;
        } catch {
          return null;
        }
      }));
      const ok = buffers.filter((b): b is AudioBuffer => !!b);
      if (ok.length) this.samples.set(name as SfxName, ok);
    }));
  }

  private playSample(ctx: AudioContext, name: SfxName, buffer: AudioBuffer) {
    const spec = SAMPLES[name]!;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    // A little pitch spread so repeated hits do not sound identical.
    if (spec.vary) src.playbackRate.value = 0.92 + Math.random() * 0.16;
    const gain = ctx.createGain();
    gain.gain.value = spec.vol;
    src.connect(gain).connect(this.sfxBus);
    src.start();
  }

  private tone(freq: number, dur: number, o: ToneOpts = {}) {
    const ctx = this.ctx!;
    const start = ctx.currentTime + (o.delay ?? 0);
    const osc = ctx.createOscillator();
    osc.type = o.type ?? 'sine';
    osc.frequency.setValueAtTime(freq, start);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, start + dur);
    const gain = this.envelope(start, dur, o.vol ?? 0.2, o.attack ?? 0.005);
    let node: AudioNode = osc;
    if (o.cutoff) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = o.cutoff;
      node = node.connect(f);
    }
    node.connect(gain).connect(this.sfxBus);
    osc.start(start);
    osc.stop(start + dur + 0.05);
  }

  private noise(dur: number, o: NoiseOpts = {}) {
    const ctx = this.ctx!;
    const start = ctx.currentTime + (o.delay ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = o.filter ?? 'lowpass';
    f.frequency.setValueAtTime(o.freq ?? 1000, start);
    if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, start + dur);
    f.Q.value = o.q ?? 0.7;
    const gain = this.envelope(start, dur, o.vol ?? 0.2, o.attack ?? 0.005);
    src.connect(f).connect(gain).connect(this.sfxBus);
    src.start(start, Math.random() * 0.5);
    src.stop(start + dur + 0.05);
  }

  private envelope(start: number, dur: number, vol: number, attack: number): GainNode {
    const g = this.ctx!.createGain();
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(vol, start + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    return g;
  }

  // ── Music ────────────────────────────────────────────────────

  private startMusic() {
    if (!this.ctx || this.musicTimer) return;
    this.nextBeatTime = this.ctx.currentTime + 0.2;
    // Schedule a little ahead on a timer; WebAudio keeps the timing exact.
    this.musicTimer = window.setInterval(() => this.scheduleMusic(), 200);
  }

  private scheduleMusic() {
    const ctx = this.ctx!;
    if (!this.musicOn) {
      window.clearInterval(this.musicTimer);
      this.musicTimer = 0;
      return;
    }
    while (this.nextBeatTime < ctx.currentTime + 0.6) {
      // The synthesized loop only fills in until a recorded track plays.
      if (!this.current) this.musicBeat(this.beat, this.nextBeatTime);
      this.nextBeatTime += BEAT;
      this.beat++;
    }
  }

  private musicBeat(beat: number, at: number) {
    const ctx = this.ctx!;
    const chord = CHORDS[Math.floor(beat / BEATS_PER_CHORD) % CHORDS.length];
    const inChord = beat % BEATS_PER_CHORD;
    const voice = (freq: number, dur: number, type: OscillatorType, vol: number, attack: number, cutoff: number, detune = 0) => {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = freq;
      osc.detune.value = detune;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = cutoff;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(vol, at + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      osc.connect(f).connect(g).connect(this.musicBus);
      osc.start(at);
      osc.stop(at + dur + 0.1);
    };
    if (inChord === 0) {
      // Pad: the chord, slightly detuned, swelling over the whole bar.
      const len = BEAT * BEATS_PER_CHORD;
      for (const f of chord.tones) {
        voice(f, len, 'sawtooth', 0.025, 1.5, 700, -6);
        voice(f, len, 'sawtooth', 0.025, 1.5, 700, 6);
      }
      voice(chord.bass, len, 'sine', 0.16, 0.4, 300);
    }
    // Sparse plucked arpeggio on top.
    const pattern = [0, -1, 1, -1, 2, 1, -1, 0];
    const step = pattern[inChord];
    if (step >= 0) voice(chord.tones[step] * 2, BEAT * 1.6, 'triangle', 0.05, 0.01, 2200);
    // Soft low drum on the bar's first and fifth beats.
    if (inChord === 0 || inChord === 4) {
      const osc = ctx.createOscillator();
      osc.frequency.setValueAtTime(90, at);
      osc.frequency.exponentialRampToValueAtTime(40, at + 0.3);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.18, at);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.35);
      osc.connect(g).connect(this.musicBus);
      osc.start(at);
      osc.stop(at + 0.4);
    }
  }
}

export const sound = new Sound();
