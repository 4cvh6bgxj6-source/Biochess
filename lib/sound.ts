import type { SoundProfileId } from './board-themes';

// Physical Modal Acoustic Synthesis for material-specific chess piece & board sounds.
// Pre-renders 44.1kHz+ PCM AudioBuffers for Wood, Classic, Neo, Alpha, Ice, Metal, Marble, Glass, and Sand.

interface ModalMode {
  freq: number;
  endFreq?: number;
  amp: number;
  decayMs: number;
  phase: number;
}

interface TapSynthSpec {
  durationSec: number;
  preRiseMs: number;
  modes: ModalMode[];
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
  const w0 = (2 * Math.PI * Math.min(centerHz, sampleRate * 0.44)) / sampleRate;
  const alpha = Math.sin(w0) / (2 * Math.max(0.35, q));
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

function renderTapToChannel(
  dest: Float32Array,
  offsetSamples: number,
  sampleRate: number,
  spec: TapSynthSpec,
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
      const endF = mode.endFreq ?? mode.freq;
      const pitchGlide = tMs <= 0 ? 1 : Math.exp(-tMs / 2.2);
      const instFreq = endF + (mode.freq - endF) * pitchGlide;

      phases[m] += (2 * Math.PI * instFreq) / sampleRate;
      modalSum += Math.sin(phases[m]) * mode.amp * decay;
    }

    const raw = (modalSum + noiseBurst[i] * spec.noiseAmp) * spec.gain;
    const shaped = Math.tanh(raw * spec.drive) / Math.tanh(spec.drive);
    dest[offsetSamples + i] += shaped;
  }
}

function normalizeAndFadeBuffer(channel: Float32Array, sampleRate: number, peakTarget = 0.85) {
  let maxAbs = 0;
  for (let i = 0; i < channel.length; i++) {
    const a = Math.abs(channel[i]);
    if (a > maxAbs) maxAbs = a;
  }
  const scale = maxAbs > 0.0001 ? peakTarget / maxAbs : 1;
  const tailSamples = Math.min(channel.length, Math.floor(sampleRate * 0.014));
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
  chimeFreq: number;
  chimeHarmonicRatio: number;
  chimeDecayScale: number;
}

function createSingleTapBuffer(
  ctx: AudioContext,
  durationSec: number,
  layers: Array<{ offsetSec: number; spec: TapSynthSpec; seed: number }>,
  peakTarget: number
): AudioBuffer {
  const sr = ctx.sampleRate;
  const buf = ctx.createBuffer(1, Math.floor(sr * durationSec), sr);
  const chan = buf.getChannelData(0);
  for (const layer of layers) {
    renderTapToChannel(chan, Math.floor(sr * layer.offsetSec), sr, layer.spec, layer.seed);
  }
  normalizeAndFadeBuffer(chan, sr, peakTarget);
  return buf;
}

function buildProfileBank(ctx: AudioContext, profile: SoundProfileId): SoundBank {
  // 1. ICY / CRYSTAL: frosty multi-crackle noise + sparkling inharmonic ice-crystal partials
  if (profile === 'icy') {
    const moveSelf = createSingleTapBuffer(
      ctx,
      0.16,
      [
        {
          offsetSec: 0,
          seed: 71121,
          spec: {
            durationSec: 0.14,
            preRiseMs: 0.9,
            modes: [
              { freq: 1860, endFreq: 1790, amp: 0.36, decayMs: 22, phase: 0.2 },
              { freq: 2940, amp: 0.42, decayMs: 28, phase: 1.1 },
              { freq: 4320, amp: 0.31, decayMs: 24, phase: 2.3 },
              { freq: 6180, amp: 0.18, decayMs: 16, phase: 0.7 },
            ],
            noiseCenterHz: 4600,
            noiseQ: 1.15,
            noiseAmp: 1.1,
            noiseDecayMs: 11,
            drive: 1.35,
            gain: 0.85,
          },
        },
        {
          offsetSec: 0.008,
          seed: 71129,
          spec: {
            durationSec: 0.09,
            preRiseMs: 0.8,
            modes: [
              { freq: 3520, amp: 0.24, decayMs: 18, phase: 0.5 },
              { freq: 5410, amp: 0.16, decayMs: 14, phase: 1.9 },
            ],
            noiseCenterHz: 6400,
            noiseQ: 0.95,
            noiseAmp: 0.95,
            noiseDecayMs: 8.5,
            drive: 1.25,
            gain: 0.65,
          },
        },
      ],
      0.72
    );

    const moveOpponent = createSingleTapBuffer(
      ctx,
      0.16,
      [
        {
          offsetSec: 0,
          seed: 71203,
          spec: {
            durationSec: 0.14,
            preRiseMs: 1.0,
            modes: [
              { freq: 1640, endFreq: 1580, amp: 0.38, decayMs: 24, phase: 0.4 },
              { freq: 2680, amp: 0.4, decayMs: 26, phase: 1.5 },
              { freq: 3980, amp: 0.28, decayMs: 21, phase: 2.0 },
              { freq: 5620, amp: 0.15, decayMs: 15, phase: 0.9 },
            ],
            noiseCenterHz: 4100,
            noiseQ: 1.1,
            noiseAmp: 1.0,
            noiseDecayMs: 12,
            drive: 1.3,
            gain: 0.82,
          },
        },
      ],
      0.68
    );

    const capture = createSingleTapBuffer(
      ctx,
      0.21,
      [
        {
          offsetSec: 0,
          seed: 71311,
          spec: {
            durationSec: 0.07,
            preRiseMs: 0.7,
            modes: [
              { freq: 2450, amp: 0.35, decayMs: 16, phase: 0.2 },
              { freq: 4150, amp: 0.34, decayMs: 18, phase: 1.4 },
              { freq: 6400, amp: 0.22, decayMs: 12, phase: 0.8 },
            ],
            noiseCenterHz: 5600,
            noiseQ: 0.9,
            noiseAmp: 1.25,
            noiseDecayMs: 9,
            drive: 1.5,
            gain: 0.82,
          },
        },
        {
          offsetSec: 0.015,
          seed: 71333,
          spec: {
            durationSec: 0.18,
            preRiseMs: 1.0,
            modes: [
              { freq: 1520, amp: 0.34, decayMs: 28, phase: 0.3 },
              { freq: 2790, amp: 0.46, decayMs: 36, phase: 1.2 },
              { freq: 4460, amp: 0.34, decayMs: 30, phase: 2.1 },
              { freq: 6820, amp: 0.19, decayMs: 20, phase: 0.5 },
            ],
            noiseCenterHz: 4800,
            noiseQ: 0.85,
            noiseAmp: 1.35,
            noiseDecayMs: 18,
            drive: 1.5,
            gain: 0.92,
          },
        },
      ],
      0.8
    );

    const checkTap = createSingleTapBuffer(
      ctx,
      0.18,
      [
        {
          offsetSec: 0,
          seed: 71443,
          spec: {
            durationSec: 0.16,
            preRiseMs: 0.8,
            modes: [
              { freq: 2120, amp: 0.38, decayMs: 28, phase: 0.1 },
              { freq: 3340, amp: 0.44, decayMs: 34, phase: 1.3 },
              { freq: 5040, amp: 0.3, decayMs: 26, phase: 2.2 },
            ],
            noiseCenterHz: 5200,
            noiseQ: 1.1,
            noiseAmp: 1.1,
            noiseDecayMs: 11,
            drive: 1.4,
            gain: 0.88,
          },
        },
      ],
      0.76
    );

    return {
      moveSelf,
      moveOpponent,
      capture,
      checkTap,
      chimeFreq: 1174.66, // crystal D6
      chimeHarmonicRatio: 2.5,
      chimeDecayScale: 1.15,
    };
  }

  // 2. METAL / STEEL: inharmonic metallic clang partials + ringing steel sustain
  if (profile === 'metal') {
    const moveSelf = createSingleTapBuffer(
      ctx,
      0.19,
      [
        {
          offsetSec: 0,
          seed: 82101,
          spec: {
            durationSec: 0.185,
            preRiseMs: 0.7,
            modes: [
              { freq: 520, endFreq: 495, amp: 0.42, decayMs: 42, phase: 0.1 },
              { freq: 1004, amp: 0.48, decayMs: 56, phase: 1.1 },
              { freq: 1510, amp: 0.44, decayMs: 64, phase: 2.2 },
              { freq: 2295, amp: 0.32, decayMs: 48, phase: 0.6 },
              { freq: 3340, amp: 0.2, decayMs: 32, phase: 1.8 },
            ],
            noiseCenterHz: 3200,
            noiseQ: 1.6,
            noiseAmp: 0.7,
            noiseDecayMs: 3.8,
            drive: 1.7,
            gain: 0.88,
          },
        },
      ],
      0.74
    );

    const moveOpponent = createSingleTapBuffer(
      ctx,
      0.19,
      [
        {
          offsetSec: 0,
          seed: 82207,
          spec: {
            durationSec: 0.185,
            preRiseMs: 0.8,
            modes: [
              { freq: 455, endFreq: 432, amp: 0.46, decayMs: 45, phase: 0.3 },
              { freq: 888, amp: 0.46, decayMs: 58, phase: 1.4 },
              { freq: 1345, amp: 0.4, decayMs: 60, phase: 2.0 },
              { freq: 2040, amp: 0.28, decayMs: 44, phase: 0.8 },
              { freq: 2980, amp: 0.16, decayMs: 28, phase: 1.5 },
            ],
            noiseCenterHz: 2750,
            noiseQ: 1.5,
            noiseAmp: 0.62,
            noiseDecayMs: 4.0,
            drive: 1.65,
            gain: 0.85,
          },
        },
      ],
      0.7
    );

    const capture = createSingleTapBuffer(
      ctx,
      0.24,
      [
        {
          offsetSec: 0,
          seed: 82301,
          spec: {
            durationSec: 0.08,
            preRiseMs: 0.6,
            modes: [
              { freq: 1240, amp: 0.38, decayMs: 26, phase: 0.2 },
              { freq: 2410, amp: 0.34, decayMs: 22, phase: 1.7 },
              { freq: 3820, amp: 0.22, decayMs: 14, phase: 0.9 },
            ],
            noiseCenterHz: 3800,
            noiseQ: 1.4,
            noiseAmp: 0.95,
            noiseDecayMs: 4.2,
            drive: 1.9,
            gain: 0.78,
          },
        },
        {
          offsetSec: 0.015,
          seed: 82339,
          spec: {
            durationSec: 0.22,
            preRiseMs: 0.8,
            modes: [
              { freq: 440, endFreq: 410, amp: 0.5, decayMs: 52, phase: 0.15 },
              { freq: 862, amp: 0.52, decayMs: 68, phase: 1.2 },
              { freq: 1390, amp: 0.46, decayMs: 76, phase: 2.4 },
              { freq: 2180, amp: 0.34, decayMs: 54, phase: 0.5 },
              { freq: 3190, amp: 0.22, decayMs: 36, phase: 1.6 },
            ],
            noiseCenterHz: 3100,
            noiseQ: 1.45,
            noiseAmp: 0.85,
            noiseDecayMs: 5.0,
            drive: 1.85,
            gain: 0.94,
          },
        },
      ],
      0.82
    );

    const checkTap = createSingleTapBuffer(
      ctx,
      0.21,
      [
        {
          offsetSec: 0,
          seed: 82421,
          spec: {
            durationSec: 0.2,
            preRiseMs: 0.6,
            modes: [
              { freq: 590, amp: 0.44, decayMs: 48, phase: 0.1 },
              { freq: 1145, amp: 0.5, decayMs: 66, phase: 1.1 },
              { freq: 1730, amp: 0.44, decayMs: 72, phase: 2.1 },
              { freq: 2610, amp: 0.3, decayMs: 50, phase: 0.8 },
            ],
            noiseCenterHz: 3500,
            noiseQ: 1.5,
            noiseAmp: 0.8,
            noiseDecayMs: 4.2,
            drive: 1.8,
            gain: 0.9,
          },
        },
      ],
      0.78
    );

    return {
      moveSelf,
      moveOpponent,
      capture,
      checkTap,
      chimeFreq: 880,
      chimeHarmonicRatio: 2.756,
      chimeDecayScale: 1.25,
    };
  }

  // 3. MARBLE / STONE: dense, cold mineral clack with tight transient and bright stone partials
  if (profile === 'marble') {
    const moveSelf = createSingleTapBuffer(
      ctx,
      0.09,
      [
        {
          offsetSec: 0,
          seed: 53101,
          spec: {
            durationSec: 0.085,
            preRiseMs: 0.9,
            modes: [
              { freq: 680, endFreq: 560, amp: 0.46, decayMs: 8.5, phase: 0.2 },
              { freq: 1390, endFreq: 1260, amp: 0.5, decayMs: 6.8, phase: 1.2 },
              { freq: 2480, amp: 0.34, decayMs: 4.6, phase: 2.1 },
              { freq: 3890, amp: 0.2, decayMs: 2.8, phase: 0.7 },
            ],
            noiseCenterHz: 2650,
            noiseQ: 1.5,
            noiseAmp: 0.88,
            noiseDecayMs: 4.0,
            drive: 1.7,
            gain: 0.9,
          },
        },
      ],
      0.8
    );

    const moveOpponent = createSingleTapBuffer(
      ctx,
      0.09,
      [
        {
          offsetSec: 0,
          seed: 53209,
          spec: {
            durationSec: 0.085,
            preRiseMs: 1.0,
            modes: [
              { freq: 610, endFreq: 505, amp: 0.48, decayMs: 9.0, phase: 0.4 },
              { freq: 1240, endFreq: 1130, amp: 0.46, decayMs: 7.2, phase: 1.5 },
              { freq: 2220, amp: 0.3, decayMs: 4.8, phase: 2.0 },
              { freq: 3450, amp: 0.16, decayMs: 2.9, phase: 0.9 },
            ],
            noiseCenterHz: 2350,
            noiseQ: 1.45,
            noiseAmp: 0.82,
            noiseDecayMs: 4.2,
            drive: 1.65,
            gain: 0.86,
          },
        },
      ],
      0.76
    );

    const capture = createSingleTapBuffer(
      ctx,
      0.125,
      [
        {
          offsetSec: 0,
          seed: 53303,
          spec: {
            durationSec: 0.04,
            preRiseMs: 0.7,
            modes: [
              { freq: 1620, amp: 0.38, decayMs: 4.2, phase: 0.3 },
              { freq: 2950, amp: 0.3, decayMs: 3.0, phase: 1.4 },
            ],
            noiseCenterHz: 3300,
            noiseQ: 1.6,
            noiseAmp: 0.96,
            noiseDecayMs: 3.2,
            drive: 1.85,
            gain: 0.74,
          },
        },
        {
          offsetSec: 0.015,
          seed: 53359,
          spec: {
            durationSec: 0.1,
            preRiseMs: 0.9,
            modes: [
              { freq: 640, endFreq: 520, amp: 0.52, decayMs: 9.8, phase: 0.1 },
              { freq: 1340, endFreq: 1210, amp: 0.5, decayMs: 7.5, phase: 1.1 },
              { freq: 2420, amp: 0.36, decayMs: 5.0, phase: 2.3 },
              { freq: 3820, amp: 0.22, decayMs: 3.1, phase: 0.6 },
            ],
            noiseCenterHz: 2750,
            noiseQ: 1.4,
            noiseAmp: 0.92,
            noiseDecayMs: 4.6,
            drive: 1.9,
            gain: 0.94,
          },
        },
      ],
      0.86
    );

    const checkTap = createSingleTapBuffer(
      ctx,
      0.095,
      [
        {
          offsetSec: 0,
          seed: 53407,
          spec: {
            durationSec: 0.09,
            preRiseMs: 0.8,
            modes: [
              { freq: 720, endFreq: 590, amp: 0.48, decayMs: 9.0, phase: 0.2 },
              { freq: 1490, endFreq: 1350, amp: 0.5, decayMs: 7.0, phase: 1.3 },
              { freq: 2680, amp: 0.36, decayMs: 4.8, phase: 2.2 },
            ],
            noiseCenterHz: 2950,
            noiseQ: 1.5,
            noiseAmp: 0.9,
            noiseDecayMs: 4.0,
            drive: 1.8,
            gain: 0.92,
          },
        },
      ],
      0.84
    );

    return {
      moveSelf,
      moveOpponent,
      capture,
      checkTap,
      chimeFreq: 783.99,
      chimeHarmonicRatio: 2.0,
      chimeDecayScale: 0.95,
    };
  }

  // 4. GLASS (Polished acrylic / glossy glass tap for Bubblegum & Purple)
  if (profile === 'glass') {
    const moveSelf = createSingleTapBuffer(
      ctx,
      0.13,
      [
        {
          offsetSec: 0,
          seed: 64101,
          spec: {
            durationSec: 0.12,
            preRiseMs: 1.1,
            modes: [
              { freq: 1240, amp: 0.44, decayMs: 18, phase: 0.1 },
              { freq: 2480, amp: 0.38, decayMs: 22, phase: 1.2 },
              { freq: 3920, amp: 0.22, decayMs: 16, phase: 2.1 },
            ],
            noiseCenterHz: 3200,
            noiseQ: 1.8,
            noiseAmp: 0.42,
            noiseDecayMs: 3.5,
            drive: 1.35,
            gain: 0.85,
          },
        },
      ],
      0.72
    );

    const moveOpponent = createSingleTapBuffer(
      ctx,
      0.13,
      [
        {
          offsetSec: 0,
          seed: 64211,
          spec: {
            durationSec: 0.12,
            preRiseMs: 1.2,
            modes: [
              { freq: 1110, amp: 0.46, decayMs: 19, phase: 0.3 },
              { freq: 2220, amp: 0.36, decayMs: 21, phase: 1.4 },
              { freq: 3510, amp: 0.2, decayMs: 15, phase: 2.3 },
            ],
            noiseCenterHz: 2900,
            noiseQ: 1.7,
            noiseAmp: 0.38,
            noiseDecayMs: 3.8,
            drive: 1.3,
            gain: 0.82,
          },
        },
      ],
      0.68
    );

    const capture = createSingleTapBuffer(
      ctx,
      0.17,
      [
        {
          offsetSec: 0,
          seed: 64301,
          spec: {
            durationSec: 0.05,
            preRiseMs: 0.9,
            modes: [
              { freq: 1960, amp: 0.35, decayMs: 12, phase: 0.2 },
              { freq: 3420, amp: 0.24, decayMs: 9, phase: 1.5 },
            ],
            noiseCenterHz: 3800,
            noiseQ: 1.6,
            noiseAmp: 0.55,
            noiseDecayMs: 3.2,
            drive: 1.5,
            gain: 0.72,
          },
        },
        {
          offsetSec: 0.016,
          seed: 64377,
          spec: {
            durationSec: 0.15,
            preRiseMs: 1.0,
            modes: [
              { freq: 1180, amp: 0.48, decayMs: 24, phase: 0.1 },
              { freq: 2390, amp: 0.42, decayMs: 26, phase: 1.1 },
              { freq: 3780, amp: 0.26, decayMs: 18, phase: 2.0 },
            ],
            noiseCenterHz: 3400,
            noiseQ: 1.5,
            noiseAmp: 0.5,
            noiseDecayMs: 4.5,
            drive: 1.5,
            gain: 0.9,
          },
        },
      ],
      0.78
    );

    const checkTap = createSingleTapBuffer(
      ctx,
      0.14,
      [
        {
          offsetSec: 0,
          seed: 64403,
          spec: {
            durationSec: 0.135,
            preRiseMs: 1.0,
            modes: [
              { freq: 1380, amp: 0.46, decayMs: 22, phase: 0.2 },
              { freq: 2760, amp: 0.4, decayMs: 24, phase: 1.2 },
              { freq: 4220, amp: 0.24, decayMs: 17, phase: 2.2 },
            ],
            noiseCenterHz: 3500,
            noiseQ: 1.7,
            noiseAmp: 0.48,
            noiseDecayMs: 3.8,
            drive: 1.45,
            gain: 0.88,
          },
        },
      ],
      0.76
    );

    return {
      moveSelf,
      moveOpponent,
      capture,
      checkTap,
      chimeFreq: 987.77,
      chimeHarmonicRatio: 2.0,
      chimeDecayScale: 1.05,
    };
  }

  // 5. SAND (Dry sandstone tap with granular sandy brush tail)
  if (profile === 'sand') {
    const moveSelf = createSingleTapBuffer(
      ctx,
      0.105,
      [
        {
          offsetSec: 0,
          seed: 44101,
          spec: {
            durationSec: 0.1,
            preRiseMs: 2.0,
            modes: [
              { freq: 240, endFreq: 175, amp: 0.42, decayMs: 9.5, phase: 0.1 },
              { freq: 495, endFreq: 410, amp: 0.34, decayMs: 6.5, phase: 1.2 },
              { freq: 920, amp: 0.2, decayMs: 4.0, phase: 2.0 },
            ],
            noiseCenterHz: 2450,
            noiseQ: 0.78,
            noiseAmp: 1.15,
            noiseDecayMs: 12.5,
            drive: 1.45,
            gain: 0.88,
          },
        },
      ],
      0.8
    );

    const moveOpponent = createSingleTapBuffer(
      ctx,
      0.105,
      [
        {
          offsetSec: 0,
          seed: 44203,
          spec: {
            durationSec: 0.1,
            preRiseMs: 2.2,
            modes: [
              { freq: 215, endFreq: 158, amp: 0.44, decayMs: 10.0, phase: 0.3 },
              { freq: 445, endFreq: 375, amp: 0.32, decayMs: 6.8, phase: 1.5 },
              { freq: 840, amp: 0.18, decayMs: 4.2, phase: 2.2 },
            ],
            noiseCenterHz: 2150,
            noiseQ: 0.75,
            noiseAmp: 1.08,
            noiseDecayMs: 13.0,
            drive: 1.4,
            gain: 0.85,
          },
        },
      ],
      0.76
    );

    const capture = createSingleTapBuffer(
      ctx,
      0.14,
      [
        {
          offsetSec: 0,
          seed: 44301,
          spec: {
            durationSec: 0.045,
            preRiseMs: 1.1,
            modes: [
              { freq: 520, endFreq: 430, amp: 0.3, decayMs: 5.2, phase: 0.2 },
              { freq: 1180, amp: 0.25, decayMs: 3.4, phase: 1.3 },
            ],
            noiseCenterHz: 2950,
            noiseQ: 0.85,
            noiseAmp: 1.2,
            noiseDecayMs: 7.5,
            drive: 1.6,
            gain: 0.74,
          },
        },
        {
          offsetSec: 0.017,
          seed: 44389,
          spec: {
            durationSec: 0.12,
            preRiseMs: 1.8,
            modes: [
              { freq: 255, endFreq: 170, amp: 0.48, decayMs: 11.5, phase: 0.1 },
              { freq: 520, endFreq: 425, amp: 0.36, decayMs: 7.5, phase: 1.1 },
            ],
            noiseCenterHz: 2600,
            noiseQ: 0.72,
            noiseAmp: 1.32,
            noiseDecayMs: 16.0,
            drive: 1.65,
            gain: 0.94,
          },
        },
      ],
      0.86
    );

    const checkTap = createSingleTapBuffer(
      ctx,
      0.11,
      [
        {
          offsetSec: 0,
          seed: 44417,
          spec: {
            durationSec: 0.105,
            preRiseMs: 1.7,
            modes: [
              { freq: 265, endFreq: 190, amp: 0.46, decayMs: 10.0, phase: 0.1 },
              { freq: 545, endFreq: 460, amp: 0.38, decayMs: 6.8, phase: 1.2 },
              { freq: 1050, amp: 0.24, decayMs: 4.2, phase: 2.1 },
            ],
            noiseCenterHz: 2700,
            noiseQ: 0.8,
            noiseAmp: 1.2,
            noiseDecayMs: 13.0,
            drive: 1.6,
            gain: 0.9,
          },
        },
      ],
      0.84
    );

    return {
      moveSelf,
      moveOpponent,
      capture,
      checkTap,
      chimeFreq: 659.25,
      chimeHarmonicRatio: 2.0,
      chimeDecayScale: 0.95,
    };
  }

  // 6. ALPHA (Snappy weighted club plastic blitz clack)
  if (profile === 'alpha') {
    const moveSelf = createSingleTapBuffer(
      ctx,
      0.075,
      [
        {
          offsetSec: 0,
          seed: 33101,
          spec: {
            durationSec: 0.072,
            preRiseMs: 1.2,
            modes: [
              { freq: 285, endFreq: 210, amp: 0.48, decayMs: 7.5, phase: 0.1 },
              { freq: 620, endFreq: 520, amp: 0.46, decayMs: 5.5, phase: 1.2 },
              { freq: 1340, endFreq: 1210, amp: 0.32, decayMs: 3.6, phase: 2.1 },
              { freq: 2420, amp: 0.16, decayMs: 2.1, phase: 0.8 },
            ],
            noiseCenterHz: 2100,
            noiseQ: 1.45,
            noiseAmp: 0.82,
            noiseDecayMs: 3.8,
            drive: 1.75,
            gain: 0.92,
          },
        },
      ],
      0.84
    );

    const moveOpponent = createSingleTapBuffer(
      ctx,
      0.078,
      [
        {
          offsetSec: 0,
          seed: 33211,
          spec: {
            durationSec: 0.075,
            preRiseMs: 1.3,
            modes: [
              { freq: 255, endFreq: 190, amp: 0.5, decayMs: 8.0, phase: 0.2 },
              { freq: 550, endFreq: 470, amp: 0.44, decayMs: 5.8, phase: 1.4 },
              { freq: 1180, endFreq: 1070, amp: 0.28, decayMs: 3.8, phase: 2.2 },
            ],
            noiseCenterHz: 1850,
            noiseQ: 1.4,
            noiseAmp: 0.76,
            noiseDecayMs: 4.1,
            drive: 1.7,
            gain: 0.88,
          },
        },
      ],
      0.79
    );

    const capture = createSingleTapBuffer(
      ctx,
      0.11,
      [
        {
          offsetSec: 0,
          seed: 33301,
          spec: {
            durationSec: 0.036,
            preRiseMs: 0.9,
            modes: [
              { freq: 720, amp: 0.34, decayMs: 3.8, phase: 0.3 },
              { freq: 1750, amp: 0.32, decayMs: 2.6, phase: 1.6 },
            ],
            noiseCenterHz: 2800,
            noiseQ: 1.5,
            noiseAmp: 0.96,
            noiseDecayMs: 3.2,
            drive: 1.85,
            gain: 0.72,
          },
        },
        {
          offsetSec: 0.015,
          seed: 33353,
          spec: {
            durationSec: 0.09,
            preRiseMs: 1.2,
            modes: [
              { freq: 270, endFreq: 195, amp: 0.54, decayMs: 8.5, phase: 0.1 },
              { freq: 610, endFreq: 510, amp: 0.48, decayMs: 6.0, phase: 1.1 },
              { freq: 1380, endFreq: 1240, amp: 0.34, decayMs: 3.8, phase: 2.3 },
            ],
            noiseCenterHz: 2250,
            noiseQ: 1.35,
            noiseAmp: 0.9,
            noiseDecayMs: 4.5,
            drive: 1.9,
            gain: 0.96,
          },
        },
      ],
      0.9
    );

    const checkTap = createSingleTapBuffer(
      ctx,
      0.085,
      [
        {
          offsetSec: 0,
          seed: 33409,
          spec: {
            durationSec: 0.08,
            preRiseMs: 1.1,
            modes: [
              { freq: 310, endFreq: 225, amp: 0.5, decayMs: 8.0, phase: 0.1 },
              { freq: 680, endFreq: 575, amp: 0.46, decayMs: 5.8, phase: 1.2 },
              { freq: 1480, endFreq: 1340, amp: 0.34, decayMs: 3.8, phase: 2.2 },
            ],
            noiseCenterHz: 2350,
            noiseQ: 1.4,
            noiseAmp: 0.88,
            noiseDecayMs: 4.0,
            drive: 1.85,
            gain: 0.92,
          },
        },
      ],
      0.86
    );

    return {
      moveSelf,
      moveOpponent,
      capture,
      checkTap,
      chimeFreq: 740,
      chimeHarmonicRatio: 2.0,
      chimeDecayScale: 0.9,
    };
  }

  // 7. WOOD & CLASSIC (Deep resonant walnut / carved Staunton hardwood knock)
  if (profile === 'wood' || profile === 'classic') {
    const isCarved = profile === 'wood';
    const baseShift = isCarved ? 0.92 : 1.0;

    const moveSelf = createSingleTapBuffer(
      ctx,
      0.105,
      [
        {
          offsetSec: 0,
          seed: isCarved ? 22101 : 21101,
          spec: {
            durationSec: 0.1,
            preRiseMs: 2.4,
            modes: [
              { freq: 172 * baseShift, endFreq: 122 * baseShift, amp: 0.64, decayMs: 17, phase: 0.1 },
              { freq: 312 * baseShift, endFreq: 245 * baseShift, amp: 0.48, decayMs: 12, phase: 1.1 },
              { freq: 540 * baseShift, endFreq: 470 * baseShift, amp: 0.3, decayMs: 7.5, phase: 2.3 },
              { freq: 940 * baseShift, amp: 0.15, decayMs: 4.2, phase: 0.7 },
            ],
            noiseCenterHz: isCarved ? 1050 : 1280,
            noiseQ: 1.25,
            noiseAmp: 0.65,
            noiseDecayMs: 6.5,
            drive: 1.6,
            gain: 0.9,
          },
        },
      ],
      0.84
    );

    const moveOpponent = createSingleTapBuffer(
      ctx,
      0.108,
      [
        {
          offsetSec: 0,
          seed: isCarved ? 22201 : 21201,
          spec: {
            durationSec: 0.102,
            preRiseMs: 2.7,
            modes: [
              { freq: 155 * baseShift, endFreq: 112 * baseShift, amp: 0.66, decayMs: 18, phase: 0.2 },
              { freq: 285 * baseShift, endFreq: 224 * baseShift, amp: 0.45, decayMs: 12.5, phase: 1.3 },
              { freq: 495 * baseShift, endFreq: 430 * baseShift, amp: 0.26, decayMs: 7.8, phase: 2.1 },
            ],
            noiseCenterHz: isCarved ? 920 : 1120,
            noiseQ: 1.2,
            noiseAmp: 0.58,
            noiseDecayMs: 6.8,
            drive: 1.55,
            gain: 0.86,
          },
        },
      ],
      0.79
    );

    const capture = createSingleTapBuffer(
      ctx,
      0.14,
      [
        {
          offsetSec: 0,
          seed: 22301,
          spec: {
            durationSec: 0.042,
            preRiseMs: 1.2,
            modes: [
              { freq: 380 * baseShift, endFreq: 310 * baseShift, amp: 0.3, decayMs: 5.5, phase: 0.3 },
              { freq: 860 * baseShift, amp: 0.32, decayMs: 3.8, phase: 1.6 },
              { freq: 1520 * baseShift, amp: 0.22, decayMs: 2.5, phase: 0.8 },
            ],
            noiseCenterHz: 2100,
            noiseQ: 1.4,
            noiseAmp: 0.88,
            noiseDecayMs: 4.5,
            drive: 1.75,
            gain: 0.68,
          },
        },
        {
          offsetSec: 0.018,
          seed: 22389,
          spec: {
            durationSec: 0.118,
            preRiseMs: 2.1,
            modes: [
              { freq: 182 * baseShift, endFreq: 120 * baseShift, amp: 0.7, decayMs: 19, phase: 0.1 },
              { freq: 330 * baseShift, endFreq: 255 * baseShift, amp: 0.5, decayMs: 13, phase: 1.2 },
              { freq: 590 * baseShift, endFreq: 510 * baseShift, amp: 0.32, decayMs: 8.0, phase: 2.2 },
              { freq: 1080 * baseShift, amp: 0.18, decayMs: 4.5, phase: 0.7 },
            ],
            noiseCenterHz: 1320,
            noiseQ: 1.2,
            noiseAmp: 0.8,
            noiseDecayMs: 7.4,
            drive: 1.85,
            gain: 0.96,
          },
        },
      ],
      0.92
    );

    const checkTap = createSingleTapBuffer(
      ctx,
      0.11,
      [
        {
          offsetSec: 0,
          seed: 22417,
          spec: {
            durationSec: 0.105,
            preRiseMs: 1.8,
            modes: [
              { freq: 195 * baseShift, endFreq: 135 * baseShift, amp: 0.65, decayMs: 17, phase: 0.1 },
              { freq: 355 * baseShift, endFreq: 280 * baseShift, amp: 0.48, decayMs: 11.5, phase: 1.1 },
              { freq: 650 * baseShift, endFreq: 565 * baseShift, amp: 0.32, decayMs: 7.0, phase: 2.1 },
              { freq: 1210 * baseShift, amp: 0.18, decayMs: 4.0, phase: 0.8 },
            ],
            noiseCenterHz: 1580,
            noiseQ: 1.3,
            noiseAmp: 0.82,
            noiseDecayMs: 6.0,
            drive: 1.8,
            gain: 0.92,
          },
        },
      ],
      0.88
    );

    return {
      moveSelf,
      moveOpponent,
      capture,
      checkTap,
      chimeFreq: 587.33,
      chimeHarmonicRatio: 2.0,
      chimeDecayScale: 1.0,
    };
  }

  // 8. NEO (Default Chess.com-style crisp tournament boxwood/walnut snap)
  const moveSelf = createSingleTapBuffer(
    ctx,
    0.09,
    [
      {
        offsetSec: 0,
        seed: 104729,
        spec: {
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
      },
    ],
    0.84
  );

  const moveOpponent = createSingleTapBuffer(
    ctx,
    0.095,
    [
      {
        offsetSec: 0,
        seed: 224737,
        spec: {
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
      },
    ],
    0.78
  );

  const capture = createSingleTapBuffer(
    ctx,
    0.125,
    [
      {
        offsetSec: 0,
        seed: 350377,
        spec: {
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
      },
      {
        offsetSec: 0.017,
        seed: 479001,
        spec: {
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
      },
    ],
    0.94
  );

  const checkTap = createSingleTapBuffer(
    ctx,
    0.095,
    [
      {
        offsetSec: 0,
        seed: 611953,
        spec: {
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
      },
    ],
    0.9
  );

  return {
    moveSelf,
    moveOpponent,
    capture,
    checkTap,
    chimeFreq: 698.46,
    chimeHarmonicRatio: 2.0,
    chimeDecayScale: 1.0,
  };
}

class SoundManager {
  private ctx: AudioContext | null = null;
  private banks = new Map<SoundProfileId, SoundBank>();
  private profile: SoundProfileId = 'neo';
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

    return this.ctx;
  }

  private getActiveBank(ctx: AudioContext): SoundBank {
    let bank = this.banks.get(this.profile);
    if (!bank) {
      bank = buildProfileBank(ctx, this.profile);
      this.banks.set(this.profile, bank);
    }
    return bank;
  }

  public setProfile(profile: SoundProfileId) {
    this.profile = profile;
  }

  public getProfile(): SoundProfileId {
    return this.profile;
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
    try {
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const microShift = 1 + (Math.random() * 2 - 1) * jitter;
      src.playbackRate.setValueAtTime(baseRate * microShift, startTime);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(volume, startTime);

      src.connect(gain);
      gain.connect(ctx.destination);
      src.start(startTime);
    } catch {
      // ignore browser WebAudio state errors
    }
  }

  private playWarmChime(
    ctx: AudioContext,
    freq: number,
    startTime: number,
    volume: number,
    durationSec: number,
    harmonicRatio = 2
  ) {
    try {
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(freq, startTime);

      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(freq * harmonicRatio, startTime);

      const subGain = ctx.createGain();
      subGain.gain.setValueAtTime(0.2, startTime);

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
    } catch {
      // ignore browser WebAudio state errors
    }
  }

  public playMove() {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const bank = this.getActiveBank(ctx);
    this.playBuffer(ctx, bank.moveSelf, ctx.currentTime, 0.78, 1.0, 0.028);
  }

  public playOpponentMove() {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const bank = this.getActiveBank(ctx);
    this.playBuffer(ctx, bank.moveOpponent, ctx.currentTime, 0.74, 0.99, 0.025);
  }

  public playPremove() {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const bank = this.getActiveBank(ctx);
    this.playBuffer(ctx, bank.moveSelf, ctx.currentTime, 0.36, 1.14, 0.018);
  }

  public playCapture() {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const bank = this.getActiveBank(ctx);
    this.playBuffer(ctx, bank.capture, ctx.currentTime, 0.86, 1.0, 0.025);
  }

  public playCastle() {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const bank = this.getActiveBank(ctx);
    const now = ctx.currentTime;
    this.playBuffer(ctx, bank.moveSelf, now, 0.74, 0.96, 0.015);
    this.playBuffer(ctx, bank.moveSelf, now + 0.078, 0.78, 1.05, 0.015);
  }

  public playPromote() {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const bank = this.getActiveBank(ctx);
    const now = ctx.currentTime;
    this.playBuffer(ctx, bank.moveSelf, now, 0.8, 1.04, 0.02);
    this.playWarmChime(
      ctx,
      bank.chimeFreq * 0.85,
      now + 0.022,
      0.08,
      0.14 * bank.chimeDecayScale,
      bank.chimeHarmonicRatio
    );
    this.playWarmChime(
      ctx,
      bank.chimeFreq * 1.25,
      now + 0.078,
      0.09,
      0.2 * bank.chimeDecayScale,
      bank.chimeHarmonicRatio
    );
  }

  public playCheck(isCapture = false) {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const bank = this.getActiveBank(ctx);
    const now = ctx.currentTime;

    if (isCapture) {
      this.playBuffer(ctx, bank.capture, now, 0.86, 1.04, 0.02);
    } else {
      this.playBuffer(ctx, bank.checkTap, now, 0.84, 1.02, 0.02);
    }

    this.playWarmChime(
      ctx,
      bank.chimeFreq,
      now + 0.014,
      0.085,
      0.14 * bank.chimeDecayScale,
      bank.chimeHarmonicRatio
    );
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
    if (!ctx) return;
    const bank = this.getActiveBank(ctx);
    const now = ctx.currentTime;
    if (withMoveTap) {
      this.playBuffer(ctx, bank.checkTap, now, 0.82, 0.98, 0.015);
    }
    const offset = withMoveTap ? 0.065 : 0;
    this.playWarmChime(ctx, 523.25, now + offset, 0.09, 0.26);
    this.playWarmChime(ctx, 659.25, now + offset + 0.085, 0.09, 0.26);
    this.playWarmChime(ctx, 783.99, now + offset + 0.17, 0.1, 0.34);
  }
}

export const soundFX = new SoundManager();
