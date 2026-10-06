import type { Equipment } from '../core/types';
import type { World } from '../core/world';
import { bubbleBank, glassTapSamples, loopNoise, makeRandom, plipSamples, type Random } from './synth';

/**
 * Procedural, calming soundscape with WebAudio (no audio files): filter hum and water trickle,
 * airstone bubbling, soft surface sounds, a muted glass tap. Starts only after a user gesture.
 *
 * Graph (all levels change with smooth setTargetAtTime ramps — never clicks):
 *
 *   hum (100/200/300 Hz mains-driven impeller) ─┐
 *   brown-noise rumble ─ lowpass ─ LFO gain ────┼─ filterBus ─┐
 *   pink-noise hiss ─ bandpass (wandering) ─────┘             │
 *   trickle bubble grains ─ pan buses ─ trickleBus ───────────┤
 *   airstone bubble grains ─ pan buses ─ airBus ──────────────┼─ master ─ destination
 *   surface ripple (pink, high band, slow swell) ─ rippleBus ─┤
 *   one-shots (tap, plip) ─ fxBus ────────────────────────────┘
 *
 * OWNER: UI module.
 */

/** How audible the filter return is, by filter type (HOB waterfall loudest, canister spray bar quietest). */
const FILTER_TRICKLE: Record<Equipment['filter']['type'], number> = {
  'hang-on-back': 1,
  sump: 0.85,
  internal: 0.55,
  canister: 0.4,
  sponge: 0.12,
};
const FILTER_HUM: Record<Equipment['filter']['type'], number> = {
  'hang-on-back': 0.9,
  sump: 1,
  internal: 0.7,
  canister: 0.55,
  sponge: 0.25, // the air pump sits outside the tank
};

const LOOKAHEAD = 0.15;
/**
 * Events that count as a user activation for starting audio. iOS Safari only unlocks WebAudio
 * from the end of a touch (touchend / pointerup / click) — not from touchstart/pointerdown — so
 * we listen to all of them and stay armed until the context is actually running.
 */
const GESTURES = ['pointerup', 'touchend', 'click', 'keydown'] as const;
const PAN_POSITIONS = [-0.65, -0.3, 0, 0.3, 0.65];

interface GrainStream {
  bank: AudioBuffer[];
  buses: GainNode[];
  /** Grains per second. */
  rate: number;
  next: number;
}

export class Ambience {
  private ctx: AudioContext | null = null;
  private enabled = false;
  private volume = 0.5;
  private started = false;
  private everStarted = false;
  private waitingForGesture = false;
  private suspendTimer: ReturnType<typeof setTimeout> | null = null;
  private rnd: Random = makeRandom(0x51a7);

  // Nodes
  private master!: GainNode;
  private filterBus!: GainNode;
  private trickleBus!: GainNode;
  private airBus!: GainNode;
  private rippleBus!: GainNode;
  private fxBus!: GainNode;
  private hissFilter!: BiquadFilterNode;
  private air: GrainStream | null = null;
  private fizz: GrainStream | null = null;
  private trickle: GrainStream | null = null;
  private taps: AudioBuffer[] = [];
  private plips: AudioBuffer[] = [];

  // Environment snapshot (sampled at ~2 Hz, not per frame)
  private envTimer = 0;
  private airstones = 0;
  private filterOn = true;
  private filterType: Equipment['filter']['type'] = 'canister';
  private flowFactor = 1;
  private night = false;
  private lastPlip = 0;
  private levelsDirty = true;

  private onGesture = () => this.gesture();
  private onVisibility = () => this.visibility();

  constructor() {
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', this.onVisibility);
  }

  setEnabled(enabled: boolean, volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    const was = this.enabled;
    this.enabled = enabled;
    if (enabled) {
      if (!this.ctx) {
        // Autoplay policy: only create the context inside (or after) a user gesture.
        const ua = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean; isActive: boolean } }).userActivation;
        if (ua && !ua.isActive && !ua.hasBeenActive) return this.armGesture();
        if (!this.create()) return;
      }
      if (this.suspendTimer) {
        clearTimeout(this.suspendTimer);
        this.suspendTimer = null;
      }
      if (this.ctx!.state !== 'running') {
        // 'suspended' (autoplay policy) or iOS 'interrupted' (phone call, backgrounded app).
        this.ctx!.resume().catch(() => this.armGesture());
        if (!(navigator as Navigator & { userActivation?: { isActive: boolean } }).userActivation?.isActive) this.armGesture();
      }
      this.applyMaster(was ? 0.08 : this.everStarted ? 0.35 : 1.4);
      this.everStarted = true;
    } else if (this.ctx) {
      this.applyMaster(0.2);
      // Suspend once the fade is inaudible, to free the audio thread.
      if (this.suspendTimer) clearTimeout(this.suspendTimer);
      this.suspendTimer = setTimeout(() => {
        this.suspendTimer = null;
        if (!this.enabled && this.ctx?.state === 'running') this.ctx.suspend().catch(() => {});
      }, 1500);
    }
  }

  update(world: World, dt: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.started || !this.enabled || ctx.state !== 'running') return;
    this.envTimer -= dt;
    if (this.envTimer <= 0) {
      this.envTimer = 0.5;
      this.sampleEnvironment(world);
    }
    const horizon = ctx.currentTime + LOOKAHEAD;
    if (this.air) this.schedule(this.air, horizon);
    if (this.fizz) this.schedule(this.fizz, horizon);
    if (this.trickle) this.schedule(this.trickle, horizon);
  }

  /** A muted "tock" on the glass. */
  playTap(): void {
    this.oneShot(this.taps, 0.9, 0);
  }

  /** A tiny plip of food landing on the surface (a couple, staggered, for a pinch). */
  playDrop(): void {
    const ctx = this.ctx;
    if (!ctx || !this.started || !this.enabled || ctx.state !== 'running') return;
    if (ctx.currentTime - this.lastPlip < 0.12) return;
    this.lastPlip = ctx.currentTime;
    const n = 1 + Math.floor(this.rnd() * 3);
    for (let i = 0; i < n; i++) this.oneShot(this.plips, 0.22 + this.rnd() * 0.12, i * (0.03 + this.rnd() * 0.07));
  }

  dispose(): void {
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this.onVisibility);
    this.disarmGesture();
    if (this.suspendTimer) clearTimeout(this.suspendTimer);
    this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.started = false;
  }

  // ------------------------------------------------------------------------------------------
  // Setup
  // ------------------------------------------------------------------------------------------

  private armGesture(): void {
    if (this.waitingForGesture || typeof window === 'undefined') return;
    this.waitingForGesture = true;
    for (const t of GESTURES) window.addEventListener(t, this.onGesture, { capture: true, passive: true });
  }

  private disarmGesture(): void {
    if (!this.waitingForGesture) return;
    this.waitingForGesture = false;
    for (const t of GESTURES) window.removeEventListener(t, this.onGesture, { capture: true });
  }

  private gesture(): void {
    if (!this.enabled) return this.disarmGesture();
    if (!this.ctx && !this.create()) return this.disarmGesture();
    const ctx = this.ctx!;
    // resume() must be called synchronously inside the gesture handler (iOS).
    ctx
      .resume()
      .then(() => {
        // Only stop listening once audio really runs: an event that didn't count as an
        // activation leaves us armed for the next one.
        if (ctx.state === 'running') {
          this.disarmGesture();
          this.applyMaster(this.everStarted ? 0.35 : 1.4);
          this.everStarted = true;
        }
      })
      .catch(() => {});
  }

  private visibility(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    if (document.hidden) {
      if (ctx.state === 'running') ctx.suspend().catch(() => {});
    } else if (this.enabled && ctx.state !== 'running' && ctx.state !== 'closed') {
      // iOS reports 'interrupted' after a call or app switch; resuming may need a fresh tap.
      ctx.resume().then(() => ctx.state !== 'running' && this.armGesture()).catch(() => this.armGesture());
    }
  }

  /** Build the whole graph. Returns false when WebAudio is unavailable. */
  private create(): boolean {
    const AC = (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) as typeof AudioContext | undefined;
    if (!AC) return false;
    let ctx: AudioContext;
    try {
      ctx = new AC({ latencyHint: 'playback' });
    } catch {
      return false;
    }
    this.ctx = ctx;
    const sr = ctx.sampleRate;
    const now = ctx.currentTime;

    this.master = ctx.createGain();
    this.master.gain.setValueAtTime(0, now);
    // Gentle high-shelf cut: we hear the tank from the room, through glass.
    const shelf = ctx.createBiquadFilter();
    shelf.type = 'highshelf';
    shelf.frequency.value = 5500;
    shelf.gain.value = -6;
    this.master.connect(shelf).connect(ctx.destination);

    const bus = (level: number) => {
      const g = ctx.createGain();
      g.gain.setValueAtTime(level, now);
      g.connect(this.master);
      return g;
    };
    this.filterBus = bus(0);
    this.trickleBus = bus(0);
    this.airBus = bus(0);
    this.rippleBus = bus(0);
    this.fxBus = bus(0.9);

    const toBuffer = (data: Float32Array, channels = 1, data2?: Float32Array) => {
      const b = ctx.createBuffer(channels, data.length, sr);
      b.copyToChannel(data as Float32Array<ArrayBuffer>, 0);
      if (channels > 1) b.copyToChannel((data2 ?? data) as Float32Array<ArrayBuffer>, 1);
      return b;
    };

    // --- Filter: motor hum. Mains-driven magnetic impellers vibrate at twice line frequency.
    const hum = ctx.createGain();
    hum.gain.value = 0.014;
    const humLp = ctx.createBiquadFilter();
    humLp.type = 'lowpass';
    humLp.frequency.value = 420;
    hum.connect(humLp).connect(this.filterBus);
    for (const [f, g] of [[100, 1], [200, 0.32], [300, 0.1]] as const) {
      const o = ctx.createOscillator();
      o.frequency.value = f;
      const og = ctx.createGain();
      og.gain.value = g;
      o.connect(og).connect(hum);
      o.start(now);
    }
    this.lfo(0.11, 0.003, hum.gain);

    // --- Filter return: low "rush" of moving water and a wandering mid hiss.
    const pink = loopNoise(sr, 5.3, 'pink', this.rnd);
    const pinkR = loopNoise(sr, 5.3, 'pink', this.rnd);
    const brown = loopNoise(sr, 6.1, 'brown', this.rnd);
    const brownR = loopNoise(sr, 6.1, 'brown', this.rnd);
    const rumbleSrc = ctx.createBufferSource();
    rumbleSrc.buffer = toBuffer(brown, 2, brownR);
    rumbleSrc.loop = true;
    const rumbleLp = ctx.createBiquadFilter();
    rumbleLp.type = 'lowpass';
    rumbleLp.frequency.value = 650;
    const rumble = ctx.createGain();
    rumble.gain.value = 0.11;
    rumbleSrc.connect(rumbleLp).connect(rumble).connect(this.filterBus);
    this.lfo(0.07, 0.03, rumble.gain);
    this.lfo(0.19, 0.018, rumble.gain);
    rumbleSrc.start(now);

    const hissSrc = ctx.createBufferSource();
    hissSrc.buffer = toBuffer(pink, 2, pinkR);
    hissSrc.loop = true;
    this.hissFilter = ctx.createBiquadFilter();
    this.hissFilter.type = 'bandpass';
    this.hissFilter.frequency.value = 1700;
    this.hissFilter.Q.value = 0.7;
    const hiss = ctx.createGain();
    hiss.gain.value = 0.035;
    hissSrc.connect(this.hissFilter).connect(hiss).connect(this.filterBus);
    this.lfo(0.13, 260, this.hissFilter.frequency);
    this.lfo(0.29, 0.01, hiss.gain);
    hissSrc.start(now, 1.7);

    // --- Surface ripple: faint high band with a slow swell.
    const rippleSrc = ctx.createBufferSource();
    rippleSrc.buffer = toBuffer(pinkR, 2, pink);
    rippleSrc.loop = true;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2600;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 7500;
    const ripple = ctx.createGain();
    ripple.gain.value = 0.02;
    rippleSrc.connect(hp).connect(lp).connect(ripple).connect(this.rippleBus);
    this.lfo(0.045, 0.008, ripple.gain);
    rippleSrc.start(now, 3.1);

    // --- Bubble banks (granular).
    const panBuses = (target: GainNode) =>
      PAN_POSITIONS.map((p) => {
        const g = ctx.createGain();
        const pan = ctx.createStereoPanner();
        pan.pan.value = p;
        g.connect(pan).connect(target);
        return g;
      });
    const airBank = bubbleBank(sr, 28, 0.002, 0.0068, this.rnd, 0.1).map((d) => toBuffer(d));
    const fizzBank = bubbleBank(sr, 24, 0.0007, 0.0018, this.rnd, 0.12).map((d) => toBuffer(d));
    const trickleBank = bubbleBank(sr, 28, 0.0009, 0.0026, this.rnd, 0.15).map((d) => toBuffer(d));
    this.air = { bank: airBank, buses: panBuses(this.airBus), rate: 0, next: now };
    const fizzBus = ctx.createGain();
    fizzBus.gain.value = 0.35;
    fizzBus.connect(this.airBus);
    this.fizz = { bank: fizzBank, buses: panBuses(fizzBus), rate: 0, next: now };
    this.trickle = { bank: trickleBank, buses: panBuses(this.trickleBus), rate: 0, next: now };

    this.taps = [0, 1, 2].map(() => toBuffer(glassTapSamples(sr, this.rnd)));
    this.plips = [0, 1, 2, 3, 4].map(() => toBuffer(plipSamples(sr, this.rnd)));

    this.started = true;
    this.envTimer = 0;
    this.levelsDirty = true;
    ctx.addEventListener('statechange', () => {
      if (ctx.state === 'running') this.applyMaster(0.35);
      // Interrupted by the system while visible (iOS: a call, Siri): wait for the next tap.
      else if (this.enabled && ctx.state !== 'closed' && typeof document !== 'undefined' && !document.hidden) this.armGesture();
    });
    return true;
  }

  /** A slow sine LFO added onto an AudioParam (its base value stays as set). */
  private lfo(freq: number, depth: number, target: AudioParam): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.frequency.value = freq * (0.92 + 0.16 * this.rnd());
    const g = ctx.createGain();
    g.gain.value = depth;
    o.connect(g).connect(target);
    o.start(ctx.currentTime + this.rnd() * 3);
  }

  // ------------------------------------------------------------------------------------------
  // Levels
  // ------------------------------------------------------------------------------------------

  private applyMaster(tau: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    // Perceptual volume curve; a little quieter at night, like a room after dark.
    const target = this.enabled ? this.volume * this.volume * 0.85 * (this.night ? 0.62 : 1) : 0;
    const p = this.master.gain;
    // Hold the current (possibly mid-fade) value, then glide — never a jump, never a click.
    if (typeof p.cancelAndHoldAtTime === 'function') p.cancelAndHoldAtTime(ctx.currentTime);
    p.setTargetAtTime(target, ctx.currentTime, tau);
  }

  private sampleEnvironment(world: World): void {
    const ctx = this.ctx!;
    const eq = world.tank.equipment;
    let stones = 0;
    for (const d of world.tank.decor) if (d.kind === 'airstone') stones++;
    const night = world.env.isNight;
    const liters = (world.tank.size.widthCm * world.tank.size.heightCm * world.tank.size.depthCm) / 1000;
    const flow = Math.max(0.5, Math.min(1.5, Math.sqrt(eq.filter.flowLph / Math.max(1, liters * 5))));
    if (night !== this.night) {
      this.night = night;
      this.applyMaster(3);
    }
    const changed =
      this.levelsDirty ||
      stones !== this.airstones ||
      eq.filter.on !== this.filterOn ||
      eq.filter.type !== this.filterType ||
      Math.abs(flow - this.flowFactor) > 0.02;
    if (!changed) return;
    this.levelsDirty = false;
    this.airstones = stones;
    this.filterOn = eq.filter.on;
    this.filterType = eq.filter.type;
    this.flowFactor = flow;

    // A sponge filter is an air-driven lift: it bubbles like one more air stone.
    const air = Math.min(8, stones + (eq.filter.on && eq.filter.type === 'sponge' ? 1 : 0));
    const on = eq.filter.on ? 1 : 0;
    const t = ctx.currentTime;
    this.filterBus.gain.setTargetAtTime(on * FILTER_HUM[eq.filter.type] * 0.9, t, 0.6);
    this.trickleBus.gain.setTargetAtTime(on * FILTER_TRICKLE[eq.filter.type] * 0.5 * this.flowFactor, t, 0.6);
    // Rate grows with the stone count; per-grain level eases off so loudness grows sub-linearly.
    this.airBus.gain.setTargetAtTime(air ? 0.3 / Math.pow(air, 0.35) : 0, t, 0.8);
    this.rippleBus.gain.setTargetAtTime(0.5 + 0.25 * Math.min(4, air) + 0.4 * on * FILTER_TRICKLE[eq.filter.type], t, 1.5);
    // Rates ∝ number of air stones (surface "blubs" + fine fizz), and filter return turbulence.
    this.air!.rate = air * 7.5;
    this.fizz!.rate = air * 22;
    this.trickle!.rate = on * FILTER_TRICKLE[eq.filter.type] * 16 * this.flowFactor;
  }

  // ------------------------------------------------------------------------------------------
  // Grains & one-shots
  // ------------------------------------------------------------------------------------------

  /** Poisson-scheduled grains up to `horizon` (audio-clock seconds). */
  private schedule(s: GrainStream, horizon: number): void {
    const ctx = this.ctx!;
    if (s.rate <= 0) {
      s.next = horizon;
      return;
    }
    // After a stall (tab in background), don't burst — restart from now.
    if (s.next < ctx.currentTime - 0.25) s.next = ctx.currentTime;
    let guard = 0;
    while (s.next < horizon && guard++ < 64) {
      const src = ctx.createBufferSource();
      src.buffer = s.bank[Math.floor(this.rnd() * s.bank.length)];
      src.playbackRate.value = 0.9 + this.rnd() * 0.22;
      src.connect(s.buses[Math.floor(this.rnd() * s.buses.length)]);
      src.start(Math.max(ctx.currentTime, s.next));
      // Exponential inter-arrival times, slightly clumped like real bubble trains.
      const clump = this.rnd() < 0.25 ? 0.25 : 1;
      s.next += (-Math.log(1 - this.rnd() * 0.999) / s.rate) * clump;
    }
  }

  private oneShot(bank: AudioBuffer[], gain: number, delay: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.started || !this.enabled || ctx.state !== 'running' || !bank.length) return;
    const src = ctx.createBufferSource();
    src.buffer = bank[Math.floor(this.rnd() * bank.length)];
    src.playbackRate.value = 0.94 + this.rnd() * 0.12;
    const g = ctx.createGain();
    g.gain.value = gain;
    const pan = ctx.createStereoPanner();
    pan.pan.value = (this.rnd() - 0.5) * 0.6;
    src.connect(g).connect(pan).connect(this.fxBus);
    src.start(ctx.currentTime + delay);
  }
}
