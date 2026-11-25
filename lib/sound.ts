// Physical Modal Acoustic Synthesis for realistic Chess.com-style wooden Staunton piece sounds.
// Pre-renders 44.1kHz+ PCM AudioBuffers using multi-mode wooden board/piece resonances,
// felt micro-contact rise, and bandpass-filtered wood-grain impact bursts (zero external audio files).

interface WoodSynthSpec {
  durationSec: number;
  preRiseMs: number;
  modes: Array<{
    freq: number;
    endFreq?: number;
    amp: number;
    decayMs: number;
    phase: number;
  }>;
  noiseCenterHz: number;
  noiseQ: number;
  noiseAmp: number;
  noiseDecayMs: number;
  drive: number;
  gain: number;
}

function renderBiquadBandpassNoise(
  length: number,
  sampleRate: number,
  centerHz: number,
  q: number,
  decayMs: number,
  preRiseSamples: number,
  seed: number
): Float32Array {
  const out = new Float32Array(length);
  const w0 = (2 * Math.PI * Math.min(centerHz, sampleRate * 0.42)) / sampleRate;
  const alpha = Math.sin(w0) / (2 * Math.max(0.4, q));
  const cosW0 = Math.cos(w0);

  const b0 = alpha;
  const b1 = 0;
  const b2 = -alpha;
  const a0 = 1 + alpha;
  const a1 = -2 * cosW0;
  const a2 = 1 - alpha;

  const nb0 = b0 / a0;
  const nb1 = b1 / a0;
  const nb2 = b2 / a0;
  const na1 = a1 / a0;
  const na2 = a2 / a0;

  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  let s = seed >>> 0;

  const decaySamples = Math.max(1, (decayMs / 1000) * sampleRate);

  for (let i = 0; i < length; i++) {
    // Deterministic LCG white noise for consistent crisp wood texture
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    const white = (s / 0xffffffff) * 2 - 1;

    const y = nb0 * white + nb1 * x1 + nb2 * x2 - na1 * y1 - na2 * y2;
    x2 = x1;
    x1 = white;
    y2 = y1;
    y1 = y;

    let env = 0;
    if (i < preRiseSamples) {
      const r = i / Math.max(1, preRiseSamples);
      env = 0.18 + 0.82 * r * r;
    } else {
      const dt = i - preRiseSamples;
      env = Math.exp(-dt / decaySamples);
    }

    out[i] = y * env;
  }

  return out;
}

function renderWoodTapToChannel(
  dest: Float32Array,
  offsetSamples: number,
  sampleRate: number,
  spec: WoodSynthSpec,
  seed: number
) {
  const len = Math.min(dest.length - offsetSamples, Math.floor(spec.durationSec * sampleRate));
  if (len <= 0) return;

  const preRiseSamples = Math.max(1, Math.floor((spec.preRiseMs / 1000) * sampleRate));
  const noiseBurst = renderBiquadBandpassNoise(
    len,
    sampleRate,
    spec.noiseCenterHz,
    spec.noiseQ,
    spec.noiseDecayMs,
    preRiseSamples,
    seed
  );

  // Track instantaneous phase for each wooden resonance mode
  const phases = new Float64Array(spec.modes.length);
  for (let m = 0; m < spec.modes.length; m++) {
    phases[m] = spec.modes[m].phase;
  }

  for (let i = 0; i < len; i++) {
    const tMs = ((i - preRiseSamples) / sampleRate) * 1000;
    const riseEnv =
      i < preRiseSamples
        ? Math.sin(((i + 1) / preRiseSamples) * (Math.PI * 0.5)) ** 2
        : 1;

    let modalSum = 0;
    for (let m = 0; m < spec.modes.length; m++) {
      const mode = spec.modes[m];
      const decay = tMs <= 0 ? riseEnv : Math.exp(-tMs / mode.decayMs);
      // Micro-collision compression in the very first 2.5ms gives real hardwood snap
      const endF = mode.endFreq ?? mode.freq;
      const pitchGlide = tMs <= 0 ? 1 : Math.exp(-tMs / 2.2);
      const instFreq = endF + (mode.freq - endF) * pitchGlide;

      phases[m] += (2 * Math.PI * instFreq) / sampleRate;
      modalSum += Math.sin(phases[m]) * mode.amp * decay;
    }

    // Subtle felt thud sub-impulse
    const raw = (modalSum + noiseBurst[i] * spec.noiseAmp) * spec.gain;
    const shaped = Math.tanh(raw * spec.drive) / Math.tanh(spec.drive);
    dest[offsetSamples + i] += shaped;
  }
}

function normalizeAndFadeBuffer(channel: Float32Array, sampleRate: number, peakTarget = 0.88) {
  let maxAbs = 0;
  for (let i = 0; i < channel.length; i++) {
    const a = Math.abs(channel[i]);
    if (a > maxAbs) maxAbs = a;
  }
  const scale = maxAbs > 0.0001 ? peakTarget / maxAbs : 1;
  const tailSamples = Math.min(channel.length, Math.floor(sampleRate * 0.008));
  const tailStart = channel.length - tailSamples;

  for (let i = 0; i < channel.length; i++) {
    let val = channel[i] * scale;
    if (i >= tailStart) {
      const fade = (channel.length - i) / Math.max(1, tailSamples);
      val *= fade;
    }
    channel[i] = val;
  }
}

interface SoundBank {
  moveSelf: AudioBuffer;
  moveOpponent: AudioBuffer;
  capture: AudioBuffer;
  checkTap: AudioBuffer;
}

class SoundManager {
  private ctx: AudioContext | null = null;
  private bank: SoundBank | null = null;
  private muted = false;
  private unlockBound = false;

  constructor() {
    if (typeof window !== 'undefined') {
      this.bindGestureUnlock();
    }
  }

  private bindGestureUnlock() {
    if (this.unlockBound || typeof window === 'undefined') return;
    this.unlockBound = true;
    const handleGesture = () => {
      if (this.muted) return;
      this.ensureCtx();
    };
    window.addEventListener('pointerdown', handleGesture, { capture: true, passive: true });
    window.addEventListener('keydown', handleGesture, { capture: true, passive: true });
  }

  private buildSoundBank(ctx: AudioContext): SoundBank {
    const sr = ctx.sampleRate;

    // 1. Self Move: crisp solid Staunton boxwood landing on tournament walnut board
    const moveSelfBuf = ctx.createBuffer(1, Math.floor(sr * 0.09), sr);
    renderWoodTapToChannel(
      moveSelfBuf.getChannelData(0),
      0,
      sr,
      {
        durationSec: 0.088,
        preRiseMs: 2.2,
        modes: [
          { freq: 210, endFreq: 148, amp: 0.56, decayMs: 12.5, phase: 0.1 },
          { freq: 365, endFreq: 288, amp: 0.44, decayMs: 8.5, phase: 1.1 },
          { freq: 640, endFreq: 560, amp: 0.28, decayMs: 5.5, phase: 2.4 },
          { freq: 1120, endFreq: 1020, amp: 0.16, decayMs: 3.2, phase: 0.7 },
          { freq: 1840, amp: 0.09, decayMs: 1.9, phase: 1.9 },
        ],
        noiseCenterHz: 1450,
        noiseQ: 1.35,
        noiseAmp: 0.72,
        noiseDecayMs: 5.8,
        drive: 1.6,
        gain: 0.9,
      },
      104729
    );
    normalizeAndFadeBuffer(moveSelfBuf.getChannelData(0), sr, 0.84);

    // 2. Opponent Move: slightly warmer, deeper wood placement so turns feel distinct
    const moveOppBuf = ctx.createBuffer(1, Math.floor(sr * 0.095), sr);
    renderWoodTapToChannel(
      moveOppBuf.getChannelData(0),
      0,
      sr,
      {
        durationSec: 0.092,
        preRiseMs: 2.6,
        modes: [
          { freq: 185, endFreq: 132, amp: 0.62, decayMs: 13.5, phase: 0.2 },
          { freq: 325, endFreq: 255, amp: 0.42, decayMs: 9.2, phase: 1.4 },
          { freq: 575, endFreq: 495, amp: 0.24, decayMs: 5.8, phase: 2.1 },
          { freq: 980, endFreq: 900, amp: 0.13, decayMs: 3.1, phase: 0.5 },
        ],
        noiseCenterHz: 1180,
        noiseQ: 1.25,
        noiseAmp: 0.62,
        noiseDecayMs: 6.2,
        drive: 1.55,
        gain: 0.85,
      },
      224737
    );
    normalizeAndFadeBuffer(moveOppBuf.getChannelData(0), sr, 0.78);

    // 3. Capture: sharp piece-knock click followed 18ms later by heavy weighted board slam
    const captureBuf = ctx.createBuffer(1, Math.floor(sr * 0.125), sr);
    const capChan = captureBuf.getChannelData(0);
    // Stage 1: dry piece-on-piece knock
    renderWoodTapToChannel(
      capChan,
      0,
      sr,
      {
        durationSec: 0.04,
        preRiseMs: 1.1,
        modes: [
          { freq: 440, endFreq: 350, amp: 0.26, decayMs: 5.0, phase: 0.4 },
          { freq: 960, endFreq: 860, amp: 0.34, decayMs: 3.4, phase: 1.7 },
          { freq: 1680, endFreq: 1520, amp: 0.28, decayMs: 2.4, phase: 0.9 },
          { freq: 2650, amp: 0.16, decayMs: 1.5, phase: 2.6 },
        ],
        noiseCenterHz: 2450,
        noiseQ: 1.5,
        noiseAmp: 0.95,
        noiseDecayMs: 4.0,
        drive: 1.75,
        gain: 0.68,
      },
      350377
    );
    // Stage 2: authoritative weighted wood landing
    renderWoodTapToChannel(
      capChan,
      Math.floor(sr * 0.017),
      sr,
      {
        durationSec: 0.105,
        preRiseMs: 1.8,
        modes: [
          { freq: 225, endFreq: 142, amp: 0.68, decayMs: 14.5, phase: 0.15 },
          { freq: 390, endFreq: 300, amp: 0.48, decayMs: 9.8, phase: 1.2 },
          { freq: 720, endFreq: 620, amp: 0.32, decayMs: 6.2, phase: 2.3 },
          { freq: 1320, endFreq: 1180, amp: 0.2, decayMs: 3.6, phase: 0.8 },
          { freq: 2180, amp: 0.12, decayMs: 2.1, phase: 1.5 },
        ],
        noiseCenterHz: 1680,
        noiseQ: 1.25,
        noiseAmp: 0.86,
        noiseDecayMs: 6.8,
        drive: 1.85,
        gain: 0.96,
      },
      479001
    );
    normalizeAndFadeBuffer(capChan, sr, 0.94);

    // 4. Check wood strike: brighter, tighter accented board snap
    const checkBuf = ctx.createBuffer(1, Math.floor(sr * 0.095), sr);
    renderWoodTapToChannel(
      checkBuf.getChannelData(0),
      0,
      sr,
      {
        durationSec: 0.092,
        preRiseMs: 1.6,
        modes: [
          { freq: 235, endFreq: 158, amp: 0.62, decayMs: 13.0, phase: 0.1 },
          { freq: 415, endFreq: 325, amp: 0.46, decayMs: 8.8, phase: 1.1 },
          { freq: 780, endFreq: 680, amp: 0.34, decayMs: 5.5, phase: 2.2 },
          { freq: 1460, endFreq: 1310, amp: 0.22, decayMs: 3.1, phase: 0.7 },
          { freq: 2320, amp: 0.11, decayMs: 1.8, phase: 1.8 },
        ],
        noiseCenterHz: 1920,
        noiseQ: 1.35,
        noiseAmp: 0.88,
        noiseDecayMs: 5.5,
        drive: 1.8,
        gain: 0.92,
      },
      611953
    );
    normalizeAndFadeBuffer(checkBuf.getChannelData(0), sr, 0.9);

    return {
      moveSelf: moveSelfBuf,
      moveOpponent: moveOppBuf,
      capture: captureBuf,
      checkTap: checkBuf,
    };
  }

  private ensureCtx(): AudioContext | null {
    if (typeof window === 'undefined' || this.muted) return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (!this.ctx) return null;

    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }

    if (!this.bank) {
      this.bank = this.buildSoundBank(this.ctx);
    }

    return this.ctx;
  }

  public unlock() {
    this.ensureCtx();
  }

  public setMuted(muted: boolean) {
    this.muted = muted;
  }

  public isMuted(): boolean {
    return this.muted;
  }

  private playBuffer(
    ctx: AudioContext,
    buffer: AudioBuffer,
    startTime: number,
    volume = 0.72,
    baseRate = 1,
    jitter = 0.03
  ) {
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const microShift = 1 + (Math.random() * 2 - 1) * jitter;
    src.playbackRate.setValueAtTime(baseRate * microShift, startTime);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, startTime);

    src.connect(gain);
    gain.connect(ctx.destination);
    src.start(startTime);
  }

  private playWarmChime(
    ctx: AudioContext,
    freq: number,
    startTime: number,
    volume: number,
    durationSec: number
  ) {
    // Soft bell-like harmonic pair (fundamental + gentle 2x octave overtone)
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(freq, startTime);

    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(freq * 2, startTime);

    const subGain = ctx.createGain();
    subGain.gain.setValueAtTime(0.18, startTime);

    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.linearRampToValueAtTime(volume, startTime + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0008, startTime + durationSec);

    osc1.connect(gain);
    osc2.connect(subGain);
    subGain.connect(gain);
    gain.connect(ctx.destination);

    osc1.start(startTime);
    osc2.start(startTime);
    osc1.stop(startTime + durationSec + 0.02);
    osc2.stop(startTime + durationSec + 0.02);
  }

  public playMove() {
    const ctx = this.ensureCtx();
    if (!ctx || !this.bank) return;
    this.playBuffer(ctx, this.bank.moveSelf, ctx.currentTime, 0.78, 1.0, 0.028);
  }

  public playOpponentMove() {
    const ctx = this.ensureCtx();
    if (!ctx || !this.bank) return;
    this.playBuffer(ctx, this.bank.moveOpponent, ctx.currentTime, 0.74, 0.99, 0.025);
  }

  public playCapture() {
    const ctx = this.ensureCtx();
    if (!ctx || !this.bank) return;
    this.playBuffer(ctx, this.bank.capture, ctx.currentTime, 0.86, 1.0, 0.025);
  }

  public playCastle() {
    const ctx = this.ensureCtx();
    if (!ctx || !this.bank) return;
    const now = ctx.currentTime;
    // Two weighted wooden placements: King then Rook
    this.playBuffer(ctx, this.bank.moveSelf, now, 0.74, 0.96, 0.015);
    this.playBuffer(ctx, this.bank.moveSelf, now + 0.076, 0.78, 1.05, 0.015);
  }

  public playPromote() {
    const ctx = this.ensureCtx();
    if (!ctx || !this.bank) return;
    const now = ctx.currentTime;
    this.playBuffer(ctx, this.bank.moveSelf, now, 0.8, 1.04, 0.02);
    this.playWarmChime(ctx, 587.33, now + 0.022, 0.085, 0.14);
    this.playWarmChime(ctx, 880, now + 0.078, 0.095, 0.2);
  }

  public playCheck(isCapture = false) {
    const ctx = this.ensureCtx();
    if (!ctx || !this.bank) return;
    const now = ctx.currentTime;

    if (isCapture) {
      this.playBuffer(ctx, this.bank.capture, now, 0.86, 1.04, 0.02);
    } else {
      this.playBuffer(ctx, this.bank.checkTap, now, 0.84, 1.02, 0.02);
    }

    // Subtle crisp Chess.com-style check resonance (warm harmonic ping, no harsh buzzer)
    this.playWarmChime(ctx, 698.46, now + 0.014, 0.09, 0.14);
  }

  public playChallenge() {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    this.playWarmChime(ctx, 523.25, now, 0.09, 0.18);
    this.playWarmChime(ctx, 659.25, now + 0.09, 0.1, 0.24);
  }

  public playChat() {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    this.playWarmChime(ctx, 784, ctx.currentTime, 0.055, 0.09);
  }

  public playGameOver(withMoveTap = false) {
    const ctx = this.ensureCtx();
    if (!ctx || !this.bank) return;
    const now = ctx.currentTime;
    if (withMoveTap) {
      this.playBuffer(ctx, this.bank.checkTap, now, 0.82, 0.98, 0.015);
    }
    const offset = withMoveTap ? 0.065 : 0;
    this.playWarmChime(ctx, 523.25, now + offset, 0.09, 0.26);
    this.playWarmChime(ctx, 659.25, now + offset + 0.085, 0.09, 0.26);
    this.playWarmChime(ctx, 783.99, now + offset + 0.17, 0.1, 0.34);
  }
}

export const soundFX = new SoundManager();
