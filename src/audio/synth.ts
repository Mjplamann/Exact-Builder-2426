/**
 * Offline sample synthesis for the ambience (pure functions on Float32Arrays — no WebAudio here,
 * so they are unit-testable and run once at start-up).
 *
 * Bubbles follow van den Doel's physically based liquid-sound model (ACM TAP 2005): an air
 * bubble rings at its Minnaert resonance f₀ ≈ 3.26 / r (Hz, r in m) with damping
 * δ = 0.043·f₀ + 0.0014·f₀^1.5 (s⁻¹) and a slight upward chirp f(t) = f₀·(1 + ξ·δ·t) as it rises
 * toward the surface. Airstone "blubs" are 2–7 mm bubbles (≈ 0.5–1.6 kHz), the trickle of the
 * filter return is a spray of smaller ones (≈ 1.3–4 kHz).
 */

export type Random = () => number;

/** Deterministic PRNG so the soundscape is identical between sessions (mulberry32). */
export function makeRandom(seed = 0x2f6b): Random {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Minnaert resonance (Hz) of a bubble of radius r (m). */
export function minnaert(radiusM: number): number {
  return 3.26 / radiusM;
}

/** Bubble damping δ (1/s) for resonance f₀ (van den Doel 2005). */
export function bubbleDamping(f0: number): number {
  return 0.043 * f0 + 0.0014 * Math.pow(f0, 1.5);
}

/** One bubble: a damped, slightly rising sine with a soft onset. Length ends at −60 dB. */
export function bubbleSamples(sampleRate: number, radiusM: number, amp: number, chirp = 0.1): Float32Array {
  const f0 = minnaert(radiusM);
  const d = bubbleDamping(f0);
  const n = Math.max(16, Math.ceil(Math.min(0.45, 6.9 / d) * sampleRate));
  const out = new Float32Array(n);
  const sigma = chirp * d;
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    phase += (2 * Math.PI * f0 * (1 + sigma * t)) / sampleRate;
    const env = Math.exp(-d * t) * (1 - Math.exp(-t / 0.0007));
    out[i] = amp * env * Math.sin(phase);
  }
  return out;
}

/** In-place one-pole low-pass. */
function lowpass(buf: Float32Array, sampleRate: number, cutoffHz: number): void {
  const a = Math.exp((-2 * Math.PI * cutoffHz) / sampleRate);
  let y = 0;
  for (let i = 0; i < buf.length; i++) {
    y = (1 - a) * buf[i] + a * y;
    buf[i] = y;
  }
}

/** In-place one-pole high-pass. */
function highpass(buf: Float32Array, sampleRate: number, cutoffHz: number): void {
  const a = Math.exp((-2 * Math.PI * cutoffHz) / sampleRate);
  let lp = 0;
  for (let i = 0; i < buf.length; i++) {
    lp = (1 - a) * buf[i] + a * lp;
    buf[i] = buf[i] - lp;
  }
}

function normalize(buf: Float32Array, peak: number): void {
  let m = 0;
  for (let i = 0; i < buf.length; i++) m = Math.max(m, Math.abs(buf[i]));
  if (m > 0) {
    const k = peak / m;
    for (let i = 0; i < buf.length; i++) buf[i] *= k;
  }
}

/**
 * Seamlessly loopable noise (equal-power crossfade of the tail into the head).
 * 'pink' uses Paul Kellet's refined filter (−3 dB/oct); 'brown' integrates white noise (−6 dB/oct).
 */
export function loopNoise(sampleRate: number, seconds: number, color: 'pink' | 'brown', rnd: Random): Float32Array {
  const n = Math.floor(seconds * sampleRate);
  const fade = Math.floor(0.4 * sampleRate);
  const raw = new Float32Array(n + fade);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
  for (let i = 0; i < raw.length; i++) {
    const w = rnd() * 2 - 1;
    if (color === 'pink') {
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      raw[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    } else {
      last = (last + 0.02 * w) / 1.02;
      raw[i] = last * 3.5;
    }
  }
  const out = raw.subarray(0, n).slice();
  for (let i = 0; i < fade; i++) {
    const t = i / fade;
    out[i] = out[i] * Math.sin(t * Math.PI * 0.5) + raw[n + i] * Math.cos(t * Math.PI * 0.5);
  }
  // Remove any DC drift (brown noise wanders).
  let mean = 0;
  for (let i = 0; i < n; i++) mean += out[i];
  mean /= n;
  for (let i = 0; i < n; i++) out[i] -= mean;
  normalize(out, 0.9);
  return out;
}

/**
 * A knuckle on aquarium glass, heard from the room: the pane is loaded by water, so it does not
 * ring — a short low "tock" (~200 Hz body falling slightly), a damped mid partial, and a soft
 * contact click, all darkened by a low-pass.
 */
export function glassTapSamples(sampleRate: number, rnd: Random): Float32Array {
  const n = Math.floor(0.38 * sampleRate);
  const out = new Float32Array(n);
  const fBody = 190 + rnd() * 40;
  const fMid = 560 + rnd() * 120;
  let pb = 0;
  let pm = 0;
  let pw = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    const f = fBody * (0.84 + 0.16 * Math.exp(-t / 0.04));
    pb += (2 * Math.PI * f) / sampleRate;
    pm += (2 * Math.PI * fMid) / sampleRate;
    pw += (2 * Math.PI * 92) / sampleRate;
    const attack = 1 - Math.exp(-t / 0.0009);
    const body = Math.sin(pb) * Math.exp(-t / 0.05);
    const mid = 0.32 * Math.sin(pm) * Math.exp(-t / 0.018);
    const water = 0.22 * Math.sin(pw) * Math.exp(-t / 0.09);
    const click = 0.35 * (rnd() * 2 - 1) * Math.exp(-t / 0.0025);
    out[i] = attack * (body + mid + water) + click;
  }
  lowpass(out, sampleRate, 1900);
  normalize(out, 0.8);
  return out;
}

/** A small "plip": a bubble with a quick upward chirp plus a tiny splash of high noise. */
export function plipSamples(sampleRate: number, rnd: Random): Float32Array {
  const r = 0.0018 + rnd() * 0.0012;
  const bub = bubbleSamples(sampleRate, r, 1, 0.3 + rnd() * 0.15);
  const n = bub.length;
  const splash = new Float32Array(n);
  for (let i = 0; i < Math.min(n, Math.floor(0.008 * sampleRate)); i++) splash[i] = (rnd() * 2 - 1) * Math.exp(-i / (0.0018 * sampleRate));
  highpass(splash, sampleRate, 3500);
  for (let i = 0; i < n; i++) bub[i] += 0.18 * splash[i];
  normalize(bub, 0.7);
  return bub;
}

/** A bank of varied bubbles with radii spread log-uniformly over [rMin, rMax] (m). */
export function bubbleBank(sampleRate: number, count: number, rMin: number, rMax: number, rnd: Random, chirp = 0.1): Float32Array[] {
  const bank: Float32Array[] = [];
  for (let i = 0; i < count; i++) {
    const r = rMin * Math.pow(rMax / rMin, rnd());
    // Larger bubbles are louder (amplitude ∝ r^0.8 within the bank), with natural spread.
    const amp = Math.pow(r / rMax, 0.8) * (0.55 + 0.45 * rnd());
    bank.push(bubbleSamples(sampleRate, r, amp, chirp * (0.6 + 0.8 * rnd())));
  }
  return bank;
}
