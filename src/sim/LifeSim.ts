import type { CareMode, FishEntity, FishState, FoodKind, FoodParticle, JournalEntry, Sex, Species, TankState } from '../core/types';
import type { World } from '../core/world';
import { attachFish, detachFish, makeFishEntity } from '../core/world';
import { MS_PER_DAY, MS_PER_YEAR } from '../core/clock';
import { Rng, newId } from '../core/rng';
import { clampToWater, substrateHeight } from '../core/tankGeometry';
import {
  DIGESTION_TAU_REF_H,
  FOOD_N_FRACTION,
  MS_PER_MONTH,
  NEED_STOMACHS_PER_DAY_REF,
  REF_MASS_G,
  STOMACH_MG_PER_G,
  ageMonths,
  asymptoticLength,
  foodMgPerNutrition,
  growthK,
  isFighter,
  massG,
  oldAgeDeathProbability,
  sizeRateScale,
  vbLength,
} from './biology';
import { GUARDED_FRY_RISK, GUARD_DAYS, breedingTick, fryPredationHazard, guardsYoung, type BirthKind, type BreedHost } from './breeding';
import { Census, linfOf, type SpeciesStats } from './census';
import { Chemistry, newChemInputs, tapWater } from './chemistry';
import { compatibilityReport, stockingReport } from './compatibility';
import { dailyLightDose, lightScheduleLevel, localHour, localMs } from './environment';
import { feedDirect, pinchMg, recommendedPinches } from './feeding';
import { canonicalFishState, canonicalizeWorldFish } from './fishState';
import { repairFishStates, repairTankInputs } from './guards';
import { Flora, trimPlants as trimTankPlants, type FloraInputs } from './flora';
import { clamp, clamp01, relaxFast, smoothstep } from './simMath';
import {
  capitalize,
  countOf,
  deathPhrase,
  fishTitle,
  formatAge,
  formatDuration,
  joinList,
  lowerName,
  pluralName,
} from './text';

export interface CatchUpSummary {
  simSeconds: number;
  born: number;
  died: { name: string; cause: string }[];
  /** Short human-readable paragraph ("While you were away 3 days passed..."). */
  text: string;
}

export interface CompatibilityReport {
  level: 'good' | 'caution' | 'bad';
  issues: string[];
}

export interface StockingReport {
  /** Total adult bioload (cm of adult fish, weighted) vs. what the tank & filter can support. */
  bioload: number;
  capacity: number;
  /** 0..1+ */
  ratio: number;
}

// ---------------------------------------------------------------------------------------------
// Tunables (see biology.ts / chemistry.ts for the physiology constants)
// ---------------------------------------------------------------------------------------------

/** Live mode integrates in steps of at least this many sim seconds (2 s at 1×, every frame when fast). */
const LIVE_MIN_STEP_S = 2;
/** Longest single integration step (sim s); longer frames are split. */
const MAX_STEP_S = 900;
/**
 * Catch-up aims for about this many steps, each between 5 min and 4 h of sim time. Every per-fish
 * integrator is exact or implicit, so a year in 4-hour steps matches minute-by-minute biology.
 */
const CATCHUP_TARGET_STEPS = 2200;
const CATCHUP_MIN_STEP_S = 300;
const CATCHUP_MAX_STEP_S = 4 * 3600;
/** Absences longer than two months use 6-hour steps (still 4 per day: feeds, day & night). */
const CATCHUP_LONG_S = 60 * 86400;
const CATCHUP_LONG_STEP_S = 6 * 3600;
/** Plants and algae change over days: integrate them at most hourly. */
const FLORA_STEP_S = 3600;
/** Of a meal's satiety, this share is felt at once (gut distension); the rest as it digests. */
const IMMEDIATE_SATIETY = 0.6;
/**
 * Days from ravenous to dead for the reference 0.3 g fish with nothing at all to eat (scales with
 * size^0.2): with the day or so it takes to become ravenous, a neon in a bare tank survives ~12
 * days without food, a 50 g angelfish ~5 weeks — the real "holiday" tolerance of healthy adult
 * fish. Whatever an animal still finds (algae, biofilm, micro-fauna) slows this down, and one
 * that covers half its needs that way never starves (metabolism halves when food runs short).
 */
const STARVE_DAYS_REF = 10;
/**
 * Small omnivores, insectivores, carnivores and planktivores pick copepods, worms and insect
 * larvae from plants and substrate all day: in a mature planted tank that covers a real share of a
 * small fish's needs (up to this fraction; much less for big fish), shared among everyone hunting.
 */
const FORAGE_SHARE = 0.3;
/** Zen: nobody goes hungry for long — appetite stays keen ("Hungry"), never "Starving". */
const ZEN_MAX_HUNGER = 0.55;
/** Fish O₂ consumption at 25 °C: ≈0.3 mg O₂ per g^0.8 per hour. */
const O2_MG_PER_G08_DAY = 7.2;
const WREF_POW = Math.pow(REF_MASS_G, -0.2);
/** Nitrogen in fish tissue (mg N per g wet mass): ~2.8%. */
const BODY_N_MG_PER_G = 28;
/** Fry smaller than this graze micro-fauna/infusoria. */
const MICRO_FEEDER_CM = 1.5;
/** Fish emit 'fish-grew' every time they've grown this fraction since the last event (live). */
const GREW_EVENT_FRACTION = 0.02;
const JOURNAL_MAX = 500;
/**
 * Told once, when an empty tank that held ammonia (a fishless cycle's dose, see
 * `src/app/biotopes.ts`) has grown the bacteria to clear it: journal, toast or welcome-back card.
 */
export const FISHLESS_CYCLE_DONE = 'The fishless cycle is complete: ammonia and nitrite both read zero — the filter is ready for fish.';

type WarnKind = 'ammonia' | 'nitrite' | 'nitrate' | 'oxygen' | 'kh' | 'temperature' | 'hunger' | 'algae' | 'plants';

/** Census stress ids → the cause reported with 'fish-died' (shown to the keeper as-is). */
const CAUSE_TEXT: Record<string, string> = {
  ammonia: 'ammonia poisoning',
  nitrite: 'nitrite poisoning',
  nitrate: 'high nitrate',
  'low oxygen': 'low oxygen',
  'too warm': 'water too warm',
  'too cold': 'water too cold',
  ph: 'unsuitable pH',
  salinity: 'wrong salinity',
  cramped: 'a tank too small',
  lonely: 'loneliness',
  tankmates: 'stress from tankmates',
};

interface PendingBirth {
  mother: FishEntity;
  count: number;
  how: BirthKind;
  at: number;
}
interface Clutch {
  speciesId: string;
  motherId: string;
  generation: number;
  sizeFactor: number;
  count: number;
  dueAt: number;
  pos: [number, number, number];
}

/**
 * The biology of the tank, in sim time: von Bertalanffy growth, aging & natural lifespan,
 * hunger/stomach/metabolism scaled by size & temperature, health & stress, the nitrogen cycle,
 * oxygen, temperature drift, algae, tannins, plant growth, breeding (livebearer broods,
 * spawning pairs, shrimp colonies), deaths, the auto-feeder, and offline catch-up.
 *
 * OWNER: life-sim module.
 *
 * Integration: `update` accumulates sim seconds and runs `step` (≤ 15 min each); `catchUp`
 * runs the same `step` with coarse (5 min – 2 h) steps. Every per-fish update is analytic or
 * implicit (exact exponentials for digestion and von Bertalanffy growth, integrated Gompertz
 * hazards), so coarse steps give the same biology as fine ones.
 */
export class LifeSim implements BreedHost {
  /**
   * Live auto-feeder hook. When set, scheduled feedings at real-ish time scales (≤ 1440×) call
   * this to drop real particles (App wires it to `FoodSystem.drop`); otherwise, and always
   * during catch-up, the portion is shared out directly.
   */
  requestFeed?: (kind: FoodKind, pinches: number) => void;

  rng = new Rng(1);
  readonly census = new Census();
  private chem = new Chemistry();
  private flora = new Flora();
  private chemIn = newChemInputs();
  private floraIn: FloraInputs = { dose: 1, co2: 3, loadN: 1, decorArea: 0, detritusMgDay: 0, zen: false, trackVisual: false };
  private tankRef: TankState | null = null;
  private pending = 0;
  private floraPending = 0;
  /** Step the plants on the next step regardless of `floraPending` (a tank was just attached). */
  private floraDue = true;
  private catchingUp = false;

  // Per-step accumulators.
  private excretedN = 0;
  private animalO2 = 0;
  private detritusMgDay = 0;
  private capacityRatio = 0;
  private deadFish: FishEntity[] = [];
  private deadCause: string[] = [];
  private deadCount = 0;
  private eaten: FishEntity[] = [];
  private eatenCount = 0;
  private births: PendingBirth[] = [];
  private clutches: Clutch[] = [];

  // Events, journal, warnings.
  private grewAt = new Map<string, number>();
  private warnArmed: Record<WarnKind, boolean> = {
    ammonia: true, nitrite: true, nitrate: true, oxygen: true, kh: true, temperature: true, hunger: true, algae: true, plants: true,
  };
  private lastWarnReal = -Infinity;
  private lastPlantsEmitReal = -Infinity;
  private spawnNotedAt = new Map<string, number>();
  private bigWaterChangeAt = -Infinity;
  /** Until this sim time the seeded filter grows to match the first stock (see `ensure`). */
  private seedUntil = -Infinity;
  /** A fishless cycle is under way: watched until ammonia and nitrite read zero (`checkFishlessCycle`). */
  private cycleWatch = false;
  /** Its end has been told (this tank's journal says so): never twice. */
  private cycleTold = false;
  /** It ended during the current catch-up: the welcome-back card says so. */
  private cycleDoneAway = false;
  /** Catch-up tallies. */
  private tallyBorn = new Map<string, number>();
  private tallyDied: { name: string; cause: string }[] = [];

  constructor(world: World) {
    this.ensure(world);
  }

  // ===========================================================================================
  // BreedHost
  // ===========================================================================================

  get cover(): number {
    return this.flora.cover;
  }
  /**
   * Spawning sites: caves and shells, plus the sheltered hollows under driftwood and rock
   * overhangs the decor module marks as cover (where apistogrammas and plecos really spawn).
   */
  get caves(): number {
    const cover = this.worldRef?.cover;
    if (cover !== this.sitesFor) {
      this.sitesFor = cover;
      let n = 0;
      if (cover) for (const c of cover) if (c.kind === 'cave' || c.kind === 'overhang') n++;
      this.sites = n;
    }
    return Math.max(this.chem.decorInfo.caves, this.sites);
  }
  private sitesFor: unknown = null;
  private sites = 0;
  private careModeNow: CareMode = 'realistic';
  get careMode(): CareMode {
    return this.careModeNow;
  }
  get water() {
    return this.tankRef!.waterParams;
  }

  waterChangeBoost(now: number): number {
    const days = (now - this.bigWaterChangeAt) / MS_PER_DAY;
    return days >= 0 && days < 2.5 ? 3 : 1;
  }

  deliver(mother: FishEntity, count: number, how: BirthKind, now: number): void {
    this.births.push({ mother, count, how, at: now });
  }

  queueClutch(mother: FishEntity, count: number, days: number, now: number): void {
    const p = mother.kin.pos;
    this.clutches.push({
      speciesId: mother.state.speciesId,
      motherId: mother.state.id,
      generation: mother.state.generation + 1,
      sizeFactor: mother.state.sizeFactor,
      count,
      dueAt: now + days * MS_PER_DAY,
      pos: [p[0], p[1], p[2]],
    });
  }

  noteSpawn(mother: FishEntity, now: number): void {
    const sp = mother.species;
    const mode = sp.reproduction;
    if (mode === 'egg-scatterer' || mode === 'pelagic-spawner') return; // goes unnoticed, as in life
    const key = sp.variantOf ?? sp.id;
    const last = this.spawnNotedAt.get(key) ?? -Infinity;
    if (now - last < 60 * MS_PER_DAY) return;
    this.spawnNotedAt.set(key, now);
    const name = lowerName(sp.commonName);
    const text =
      mode === 'demersal-spawner'
        ? `The ${name} pair laid a clutch of eggs on the rock and fanned them tenderly.`
        : mode === 'egg-depositor'
          ? `The ${pluralName(name)} spawned, sticking eggs to the glass and leaves.`
          : `The ${name} pair spawned and guarded their eggs for a few days.`;
    this.journal(this.worldRef!, 'info', text, now, mother.state.id);
  }

  // ===========================================================================================
  // Lifecycle
  // ===========================================================================================

  private worldRef: World | null = null;

  /** (Re)attach to the world's current tank; rebuilds hidden state after load/reset. */
  private ensure(world: World): void {
    this.worldRef = world;
    this.careModeNow = world.settings.careMode;
    if (world.tank === this.tankRef) return;
    this.tankRef = world.tank;
    canonicalizeWorldFish(world);
    repairTankInputs(world.tank);
    repairFishStates(world, world.clock.simTime);
    this.rng = new Rng((world.tank.seed ^ 0x5bd1e995) >>> 0);
    this.census.reset();
    this.flora.reset();
    this.chem.attach(world.tank, this.expectedLoadN(world));
    this.pending = 0;
    // The plants' rates are this tank's from the first step (the chemistry settles its daily CO₂
    // cycle on them, see `Chemistry.attach`).
    this.floraPending = 0;
    this.floraDue = true;
    this.births.length = 0;
    this.clutches.length = 0;
    this.grewAt.clear();
    this.spawnNotedAt.clear();
    this.bigWaterChangeAt = world.tank.waterParams.lastWaterChange;
    for (const k of Object.keys(this.warnArmed) as WarnKind[]) this.warnArmed[k] = true;
    // A cycled tank that is still empty has a seeded filter waiting for its first stock: for the
    // next sim day the colony is sized to whatever the keeper puts in (presets, a new tank).
    this.seedUntil = world.fish.length === 0 && world.tank.waterParams.bacteria >= 0.9 ? world.clock.simTime + MS_PER_DAY : -Infinity;
    // A fishless cycle carries on across reloads and tank switches: an empty tank still holding
    // detectable ammonia or nitrite, whose journal doesn't yet tell of the cycle's end.
    const wp = world.tank.waterParams;
    this.cycleTold = world.tank.journal.some((e) => e.text.startsWith('The fishless cycle is complete'));
    this.cycleWatch = !this.cycleTold && world.fish.length === 0 && (wp.ammonia >= 0.05 || wp.nitrite >= 0.05);
    this.cycleDoneAway = false;
  }

  /**
   * Ammonia production (mg N/day) the filter's bacteria are sized for: the current stock fed
   * normally, but at least what a typically stocked tank of this size produces — a "seeded"
   * filter matured on a normal bioload, so stocking a cycled tank doesn't trigger a new cycle.
   */
  private expectedLoadN(world: World): number {
    let n = 0;
    let room = 0;
    for (const f of world.fish) {
      const w = massG(f.species, f.state.lengthCm);
      const needMg = NEED_STOMACHS_PER_DAY_REF * sizeRateScale(w) * STOMACH_MG_PER_G * w;
      n += needMg * FOOD_N_FRACTION * 0.8;
      room += STOMACH_MG_PER_G * w;
    }
    // Fish offered more than they need eat it (up to a stomachful a meal) and excrete the extra
    // nitrogen: a filter matured on the scheduled feedings is sized for what is actually eaten.
    const af = world.tank.equipment.autoFeeder;
    if (af.enabled && world.fish.length > 0 && af.pinches > 0 && af.hours && af.hours.length > 0) {
      const feeds = Math.min(8, af.hours.length);
      const eaten = Math.min(pinchMg(af.food) * af.pinches * feeds, room * feeds);
      n = Math.max(n, eaten * FOOD_N_FRACTION * 0.85);
    }
    // ≈0.075 mg N/day per bioload unit (a 5 cm fish fed normally); a seeded filter carries ~70%
    // of the tank's capacity.
    const typical = stockingReport(world).capacity * 0.7 * 0.075;
    return Math.max(n, typical);
  }

  update(world: World, simDt: number): void {
    this.ensure(world);
    if (!(simDt > 0) || !Number.isFinite(simDt)) return;
    this.pending += simDt;
    if (this.pending < LIVE_MIN_STEP_S) return;
    repairTankInputs(world.tank);
    let remaining = this.pending;
    this.pending = 0;
    let t = world.clock.simTime - remaining * 1000;
    while (remaining > 1e-9) {
      const dt = Math.min(remaining, MAX_STEP_S);
      t += dt * 1000;
      this.step(world, dt, t, true);
      remaining -= dt;
    }
  }

  catchUp(world: World, simSeconds: number): CatchUpSummary {
    this.ensure(world);
    const empty: CatchUpSummary = { simSeconds: Math.max(0, simSeconds || 0), born: 0, died: [], text: '' };
    if (!(simSeconds > 0) || !Number.isFinite(simSeconds)) return empty;
    repairTankInputs(world.tank);
    const tank = world.tank;
    const wp = tank.waterParams;
    const before = {
      glass: wp.glassAlgae,
      fish: world.fish.length,
      nitrate: wp.nitrate,
      ph: wp.ph,
      overgrown: this.flora.overgrown,
      plantGrowth: tank.plants.reduce((a, p) => a + p.growth, 0),
      length: world.fish.reduce((a, f) => a + f.state.lengthCm, 0) / Math.max(1, world.fish.length),
    };
    this.tallyBorn.clear();
    this.tallyDied = [];
    this.cycleDoneAway = false;
    this.pending = 0;

    const maxStep = simSeconds > CATCHUP_LONG_S ? CATCHUP_LONG_STEP_S : CATCHUP_MAX_STEP_S;
    const n = Math.max(1, Math.ceil(simSeconds / clamp(simSeconds / CATCHUP_TARGET_STEPS, CATCHUP_MIN_STEP_S, maxStep)));
    const dt = simSeconds / n;
    this.catchingUp = true;
    try {
      for (let i = 0; i < n; i++) {
        world.clock.simTime += dt * 1000;
        this.step(world, dt, world.clock.simTime, false);
      }
    } finally {
      this.catchingUp = false;
    }
    tank.simTime = world.clock.simTime;
    if (this.flora.pendingVisualChange > 0.01) {
      this.flora.markVisualSynced(tank);
      world.events.emit('plants-changed', {});
    }
    // Deaths during catch-up are summarized rather than announced one by one; but if the animal
    // the keeper had selected or was following is gone, say so (closes its card, frees the camera).
    const sel = world.selection.fishId;
    if (sel && !world.fishById.has(sel)) world.events.emit('fish-removed', { fishId: sel });
    const fol = world.follow;
    if (fol && fol !== sel && !world.fishById.has(fol)) world.events.emit('fish-removed', { fishId: fol });

    let born = 0;
    for (const v of this.tallyBorn.values()) born += v;
    const text = this.summaryText(world, simSeconds, before);
    return { simSeconds, born, died: this.tallyDied.slice(), text };
  }

  // ===========================================================================================
  // One simulation step
  // ===========================================================================================

  private step(world: World, dt: number, now: number, live: boolean): void {
    const tank = world.tank;
    const zen = this.careModeNow === 'zen';
    const lights = tank.equipment.lights;
    const hour = localHour(now - dt * 500);
    // Biology follows the light *schedule* even when the view pins daylight.
    const level = lightScheduleLevel(lights, hour) * clamp01(lights.intensity);

    if (now <= this.seedUntil && world.fish.length > 0) this.chem.seedFor(this.expectedLoadN(world));
    this.autoFeed(world, now - dt * 1000, now, live);
    this.census.build(world, now, this.chem.co2, zen);
    this.capacityRatio = this.census.ratio;
    this.floraPending += dt;
    if (this.floraPending >= FLORA_STEP_S || !live || this.floraDue) {
      this.floraDue = false;
      const fi = this.floraIn;
      fi.dose = dailyLightDose(lights);
      fi.co2 = this.chem.co2;
      fi.loadN = this.chem.loadN;
      fi.decorArea = this.chem.decorInfo.area;
      fi.detritusMgDay = this.detritusMgDay;
      fi.zen = zen;
      fi.trackVisual = live;
      this.flora.step(world, this.floraPending, fi);
      this.floraPending = 0;
    }
    this.flora.resetDemand();

    this.fishLoop(world, dt, now, live);

    const ci = this.chemIn;
    ci.excretedN = this.excretedN;
    ci.animalO2 = this.animalO2;
    ci.plantUptakeN = this.flora.plantUptakeN;
    ci.photoCO2 = this.flora.photoCO2;
    ci.light = level;
    ci.hour = hour;
    ci.co2Window = level > 0 || lightScheduleLevel(lights, (hour + 1) % 24) > 0;
    ci.zen = zen;
    this.chem.step(tank, dt, ci);

    this.processDeaths(world, now, live);
    this.processBirths(world, now, live);
    if (this.clutches.length) this.hatchClutches(world, now, live);
    this.checkWarnings(world, now, live);
    if (live) this.maybeEmitPlants(world);
  }

  private fishLoop(world: World, dt: number, now: number, live: boolean): void {
    const fish = world.fish;
    const census = this.census;
    const flora = this.flora;
    const days = dt / 86400;
    const years = (dt * 1000) / MS_PER_YEAR;
    const t0 = now - dt * 1000;
    const mode = this.careModeNow;
    const realistic = mode === 'realistic';
    const crowd = census.crowdStress;
    const cover = flora.cover;
    const maxGape = census.maxGape;
    let excretedN = 0, o2 = 0, digestedTotal = 0;
    this.deadCount = 0;
    this.eatenCount = 0;

    const fishStats = census.fishStats;
    for (let i = 0; i < fish.length; i++) {
      const f = fish[i];
      const s = f.state;
      const sp = f.species;
      const st = fishStats[i] ?? census.stats(sp);
      const L = s.lengthCm;
      const w = st.massCoef * L * L * L;
      const cap = STOMACH_MG_PER_G * w;
      const scale = sizeRateScale(w);
      const met = st.metabolic;

      // --- digestion: exponential gastric evacuation (τ ∝ W^0.2, Q10 2.3) ---------------------
      const tau = (DIGESTION_TAU_REF_H * 3600) / (scale * met);
      const s0 = s.stomach;
      const s1 = s0 * Math.exp(-dt / tau);
      const digested = s0 - s1;
      s.stomach = s1;
      const digestedMg = digested * cap;
      digestedTotal += digestedMg;

      // --- hunger: digested food satisfies, metabolism drains (down-regulated when starving) -
      const needPerDay = NEED_STOMACHS_PER_DAY_REF * scale * met; // own stomachfuls per day
      let h = s.hunger - (1 - IMMEDIATE_SATIETY) * digested;
      h += needPerDay * (1 - 0.5 * clamp01(h)) * days;

      // --- grazing: biofilm, algae, plants, micro-fauna ---------------------------------------
      const needMg = needPerDay * cap; // mg/day
      const appetite = h > 0.05 && s.stomach < 0.95 ? 1 : 0;
      let intake = 0;
      const gsum = st.grazeGlass + st.grazeSurface;
      if (gsum > 0) {
        const want = needMg * Math.max(st.grazeGlass, st.grazeSurface) * 1.2;
        const gf = st.grazeGlass / gsum;
        flora.demandGlass += want * gf;
        flora.demandGlassHard += want * gf * st.grazeHard;
        flora.demandSurface += want * (1 - gf);
        intake += appetite * want * (gf * flora.shareGlass + (1 - gf) * flora.shareSurface) * days;
      }
      if (st.plantEater) {
        const want = needMg * 0.6;
        flora.demandPlant += want;
        intake += appetite * want * flora.sharePlant * days;
      }
      if (st.coralNipper) {
        const want = needMg * 0.3;
        flora.demandCoral += want;
        intake += appetite * want * flora.shareCoral * days;
      }
      // Fry graze infusoria; filter-feeders (fan shrimp, feather dusters) strain suspended
      // particles — micro-fauna, detritus and the crumbs of every feeding. (Shrimplets graze the
      // same biofilm as their parents: when a colony outgrows its food, the young go first —
      // quietly, see `quietLoss` — which is how real colonies level off.)
      if ((L < MICRO_FEEDER_CM && !st.invert) || st.filterFeeder) {
        const want = needMg * (st.filterFeeder ? 0.7 : 0.9);
        flora.demandMicro += want;
        intake += appetite * want * flora.shareMicro * days;
      } else if (st.forager) {
        const want = needMg * FORAGE_SHARE * (1 - 0.75 * smoothstep(4, 16, L));
        flora.demandMicro += want;
        intake += appetite * want * flora.shareMicro * days;
      }
      // Share of today's needs met by what the tank itself provides (slows starvation).
      const selfFed = needMg > 0 && days > 0 ? intake / (needMg * days) : 0;
      if (intake > 0) {
        const fill = Math.min(Math.max(0, 1 - s.stomach), intake / cap);
        s.stomach += fill;
        h -= IMMEDIATE_SATIETY * fill;
      }
      if (mode === 'zen' && h > ZEN_MAX_HUNGER) h = ZEN_MAX_HUNGER;
      s.hunger = clamp01(h);

      // --- excretion & respiration -------------------------------------------------------------
      excretedN += (digestedMg * 0.75 + needMg * 0.12 * days) * FOOD_N_FRACTION;
      o2 += O2_MG_PER_G08_DAY * w * scale * WREF_POW * met * days;

      // --- stress (fast to rise, slow to fade) ------------------------------------------------
      const hungerStress = 0.35 * smoothstep(0.6, 1, s.hunger);
      const target =
        1 - (1 - st.envStress) * (1 - st.toxStress) * (1 - st.socialStress) * (1 - crowd) * (1 - hungerStress);
      s.stress = clamp01(s.stress + (target - s.stress) * relaxFast(days, target > s.stress ? 0.25 : 1.5));

      // --- health: chronic stress sets the condition, toxins & starvation do direct harm -----
      const healthTarget = 1 - smoothstep(0.3, 0.95, s.stress);
      const starve = smoothstep(0.85, 1, s.hunger) * (scale / STARVE_DAYS_REF) * clamp01(1 - 2 * selfFed);
      const harm = st.acute + starve;
      // A fish that is being poisoned or starved does not mend at the same time.
      let hp = s.health;
      if (healthTarget < hp) hp += (healthTarget - hp) * relaxFast(days, 12);
      else if (harm < 0.02) hp += (healthTarget - hp) * relaxFast(days, 10) * (1 - harm / 0.02);
      hp -= harm * days;
      if (mode === 'gentle') hp = Math.max(hp, 0.05);
      else if (mode === 'zen') hp = Math.max(hp, 0.6);
      s.health = clamp01(hp);

      // --- growth: von Bertalanffy, slowed by hunger, stress, cold, poor water, cramped tank --
      const linf = linfOf(st, s) * st.stunt;
      if (L < linf * 0.9995) {
        const f =
          (1 - smoothstep(0.35, 0.85, s.hunger)) *
          (1 - 0.6 * smoothstep(0.25, 0.9, s.stress)) *
          (1 - 0.5 * st.toxStress) *
          st.growthTemp *
          st.stuntRate *
          (0.5 + 0.5 * s.health);
        if (f > 0) {
          const nl = linf - (linf - L) * Math.exp(-st.k * f * years);
          s.lengthCm = nl;
          if (s.name || st.group.count <= 2) this.milestones(world, f0Months(s, t0), sp, s, L, nl, linf, now);
        }
      }
      if (live) {
        const last = this.grewAt.get(s.id);
        if (last === undefined) this.grewAt.set(s.id, s.lengthCm);
        else if (s.lengthCm >= last * (1 + GREW_EVENT_FRACTION)) {
          this.grewAt.set(s.id, s.lengthCm);
          world.events.emit('fish-grew', { fish: f });
        }
      }

      // --- death: neglect (realistic) and old age (realistic & gentle) ------------------------
      if (realistic && s.health <= 0) {
        this.markDead(f, this.causeOf(s, st));
        continue;
      }
      if (mode !== 'zen') {
        const ageY1 = (now - s.bornAt) / MS_PER_YEAR;
        if (ageY1 > 0.25 * st.lifespanYears) {
          const p = oldAgeDeathProbability(st.lifespanYears, Math.max(0, ageY1 - years), ageY1);
          if (this.rng.next() < p) {
            this.markDead(f, 'old age');
            continue;
          }
        }
      }

      // --- reproduction -------------------------------------------------------------------------
      breedingTick(this, f, st, now, days, this.capacityRatio);

      // --- tank-born fry get eaten (realistic; quietly) ----------------------------------------
      // Only young born here: store-bought juveniles are already past the most vulnerable size,
      // and adult predation risk is surfaced by `compatibility` rather than staged as carnage.
      // Prey approaching the biggest mouth in the tank is increasingly hard to catch.
      if (realistic && s.generation > 0 && L < maxGape && !st.isSnail && (now - s.bornAt) / MS_PER_MONTH < st.maturityMonths) {
        // Parents of guarding species (cichlids, mouthbrooders, cave-spawning plecos) shepherd their fry
        // through the first weeks.
        const guard = now - s.bornAt < GUARD_DAYS * MS_PER_DAY && guardsYoung(st) ? GUARDED_FRY_RISK : 1;
        const hz = fryPredationHazard(census, L, cover) * (1 - smoothstep(0.3, 1, L / maxGape)) * guard;
        if (hz > 0 && this.rng.next() < 1 - Math.exp(-hz * days)) {
          if (this.eatenCount < this.eaten.length) this.eaten[this.eatenCount] = f;
          else this.eaten.push(f);
          this.eatenCount++;
        }
      }
    }
    this.excretedN = excretedN;
    this.animalO2 = o2;
    this.detritusMgDay = (digestedTotal * 0.15) / Math.max(1e-6, days);
  }

  /** Journal "grew up" milestones for animals people care about individually. */
  private milestones(world: World, months0: number, sp: Species, s: FishState, l0: number, l1: number, linf: number, now: number): void {
    if (!s.name && sp.group !== 'fish') return;
    const months1 = ageMonths(s, now);
    if (months0 < sp.maturityMonths && months1 >= sp.maturityMonths && s.lengthCm >= 0.6 * linf) {
      this.journal(world, 'milestone', `${fishTitle(s, sp)} has grown up and is now mature, at ${formatAge(now - s.bornAt)}.`, now, s.id);
    }
    if (l0 < 0.95 * linf && l1 >= 0.95 * linf) {
      this.journal(world, 'milestone', `${fishTitle(s, sp)} has reached full adult size — ${l1.toFixed(1)} cm.`, now, s.id);
    }
  }

  /** The main reason a fish's health gave out, as a short readable phrase ("ammonia poisoning"). */
  private causeOf(s: FishState, st: SpeciesStats): string {
    const starve = smoothstep(0.85, 1, s.hunger);
    if (starve > 0.5 && starve * 0.3 >= st.acute) return 'starvation';
    if (st.acute > 0.05) return CAUSE_TEXT[st.acuteCause] ?? 'poor water quality';
    const env = st.envStress, tox = st.toxStress, soc = st.socialStress;
    if (tox >= env && tox >= soc && tox > 0.1) return CAUSE_TEXT[st.toxCause] ?? 'poor water quality';
    if (env >= soc && env > 0.1) return CAUSE_TEXT[st.envCause] ?? 'chronic stress';
    if (soc > 0.1) return CAUSE_TEXT[st.socialCause] ?? 'chronic stress';
    return starve > 0 ? 'starvation' : 'chronic stress';
  }

  private markDead(f: FishEntity, cause: string): void {
    if (this.deadCount < this.deadFish.length) {
      this.deadFish[this.deadCount] = f;
      this.deadCause[this.deadCount] = cause;
    } else {
      this.deadFish.push(f);
      this.deadCause.push(cause);
    }
    this.deadCount++;
  }

  // ===========================================================================================
  // Deaths & births
  // ===========================================================================================

  private processDeaths(world: World, now: number, live: boolean): void {
    for (let i = 0; i < this.deadCount; i++) {
      const f = this.deadFish[i];
      const cause = this.deadCause[i];
      this.deadFish[i] = undefined as unknown as FishEntity;
      if (!detachFish(world, f.state.id)) continue;
      this.grewAt.delete(f.state.id);
      if (quietLoss(f, cause, now)) {
        // Tank-born young that don't make it simply vanish — tankmates and shrimp clean up a tiny
        // body within the hour, and no keeper ever finds it (the same as fry that get eaten).
        this.chem.addOrganicN(massG(f.species, f.state.lengthCm) * BODY_N_MG_PER_G);
        if (live) world.events.emit('fish-removed', { fishId: f.state.id });
        continue;
      }
      world.tank.stats.deaths++;
      // The keeper finds and removes the body, but some of it has already decayed.
      this.chem.addOrganicN(massG(f.species, f.state.lengthCm) * BODY_N_MG_PER_G * 0.5);
      const age = formatAge(now - f.state.bornAt);
      const text = `${fishTitle(f.state, f.species)} passed away ${deathPhrase(cause)} at ${age}.`;
      this.journal(world, 'died', text, now, f.state.id);
      const name = f.state.name ?? lowerName(f.species.commonName);
      if (this.catchingUp) this.tallyDied.push({ name: f.state.name ? `${f.state.name} the ${lowerName(f.species.commonName)}` : name, cause });
      if (live) world.events.emit('fish-died', { fish: f, cause });
    }
    this.deadCount = 0;
    for (let i = 0; i < this.eatenCount; i++) {
      const f = this.eaten[i];
      this.eaten[i] = undefined as unknown as FishEntity;
      if (!detachFish(world, f.state.id)) continue;
      this.grewAt.delete(f.state.id);
      if (live) world.events.emit('fish-removed', { fishId: f.state.id });
    }
    this.eatenCount = 0;
  }

  private processBirths(world: World, now: number, live: boolean): void {
    if (!this.births.length) return;
    for (const b of this.births) {
      const m = b.mother;
      const father = this.findFather(world, m);
      const born = this.spawnYoung(world, m.species, m.state, father?.state, b.count, m.kin.pos, b.at, b.how === 'shrimplets' ? 0.01 : 0.04);
      if (!born.length) continue;
      if (live) for (const e of born) world.events.emit('fish-born', { fish: e });
      this.announceBirth(world, m.species, born.length, b.how, now, live, m.state.id);
    }
    this.births.length = 0;
  }

  private hatchClutches(world: World, now: number, live: boolean): void {
    let w = 0;
    for (let i = 0; i < this.clutches.length; i++) {
      const c = this.clutches[i];
      if (c.dueAt > now) {
        this.clutches[w++] = c;
        continue;
      }
      const sp = world.species.get(c.speciesId);
      if (!sp) continue;
      const mother = world.fishById.get(c.motherId);
      const motherState: Pick<FishState, 'id' | 'generation' | 'sizeFactor'> = mother?.state ?? {
        id: c.motherId,
        generation: c.generation - 1,
        sizeFactor: c.sizeFactor,
      };
      const father = mother ? this.findFather(world, mother) : undefined;
      const born = this.spawnYoung(world, sp, motherState, father?.state, c.count, c.pos, now, 0.05);
      if (!born.length) continue;
      if (live) for (const e of born) world.events.emit('fish-born', { fish: e });
      const mode = sp.reproduction;
      const how: BirthKind = mode === 'egg-scatterer' || mode === 'egg-depositor' ? 'hatched' : 'raised';
      this.announceBirth(world, sp, born.length, how, now, live, c.motherId);
    }
    this.clutches.length = w;
  }

  private findFather(world: World, mother: FishEntity): FishEntity | undefined {
    const key = mother.species.variantOf ?? mother.species.id;
    const want: Sex = mother.state.sex === 'male' ? 'female' : mother.state.sex === 'female' ? 'male' : 'unknown';
    let best: FishEntity | undefined;
    for (const f of world.fish) {
      if (f === mother || (f.species.variantOf ?? f.species.id) !== key || f.state.sex !== want) continue;
      if (!best || f.state.health > best.state.health) best = f;
    }
    return best;
  }

  /** Create, place and attach `count` newborns. */
  private spawnYoung(
    world: World,
    sp: Species,
    mother: Pick<FishState, 'id' | 'generation' | 'sizeFactor'>,
    father: FishState | undefined,
    count: number,
    at: readonly [number, number, number] | [number, number, number],
    now: number,
    spread: number,
  ): FishEntity[] {
    const out: FishEntity[] = [];
    const tank = world.tank;
    const parentSize = father ? (mother.sizeFactor + father.sizeFactor) / 2 : mother.sizeFactor;
    for (let i = 0; i < count; i++) {
      const r = spread * (0.3 + 0.7 * this.rng.next());
      const a = this.rng.next() * Math.PI * 2;
      const p = clampToWater(tank, [at[0] + Math.cos(a) * r, at[1] + (this.rng.next() - 0.5) * spread, at[2] + Math.sin(a) * r], 0.01);
      if (sp.zone === 'bottom' || sp.group !== 'fish') p[1] = Math.min(p[1], substrateHeight(tank, p[0], p[2]) + 0.015);
      const e = this.createFish(world, sp.id, {
        newborn: true,
        sex: sp.group === 'snail' ? 'unknown' : this.rng.chance(0.5) ? 'male' : 'female',
        generation: mother.generation + 1,
        parents: father ? [mother.id, father.id] : [mother.id],
        sizeFactor: clamp(this.rng.normal(1 + 0.5 * ((parentSize || 1) - 1), 0.05), 0.8, 1.2),
        pos: p,
        bornAt: now,
      });
      if (!e) break;
      attachFish(world, e);
      out.push(e);
    }
    world.tank.stats.births += out.length;
    if (out.length) this.census.invalidateSocial();
    if (this.catchingUp && out.length) this.tallyBorn.set(sp.id, (this.tallyBorn.get(sp.id) ?? 0) + out.length);
    return out;
  }

  private announceBirth(world: World, sp: Species, n: number, how: BirthKind, now: number, live: boolean, motherId: string): void {
    const name = lowerName(sp.commonName);
    let text: string;
    switch (how) {
      case 'shrimplets':
        text = `${countOf(n, name)} ${n === 1 ? 'was' : 'were'} born — ${n === 1 ? 'a tiny copy' : 'tiny copies'} of ${n === 1 ? 'its' : 'their'} parents.`;
        break;
      case 'released':
        text = `A ${name} released ${n} fry from her mouth${n > 1 ? '; they scattered into the rocks' : ''}.`;
        break;
      case 'pouch':
        text = `A male ${name} gave birth to ${n} fry.`;
        break;
      case 'hatched':
        text = `${n} ${name} fry hatched among the plants.`;
        break;
      case 'raised':
        text = `The ${name} pair raised ${n} fry.`;
        break;
      default:
        text = n === 1 ? `A ${name} fry was born.` : `${n} ${name} fry were born.`;
    }
    text = capitalize(text);
    // The UI turns the 'fish-born' events into one batched toast; the journal keeps the story.
    this.journal(world, 'born', text, now, motherId);
    void live;
  }

  // ===========================================================================================
  // Feeding
  // ===========================================================================================

  private autoFeed(world: World, t0: number, t1: number, live: boolean): void {
    const af = world.tank.equipment.autoFeeder;
    if (!af.enabled || !af.hours || af.hours.length === 0 || !(af.pinches > 0)) return;
    // Nobody to feed (a freshly set-up or emptied tank): the feeder stays idle rather than
    // dropping food that would only rot.
    if (world.fish.length === 0) return;
    const h0 = localMs(t0) / 3_600_000;
    const h1 = localMs(t1) / 3_600_000;
    for (let i = 0; i < af.hours.length; i++) {
      const hh = ((af.hours[i] % 24) + 24) % 24;
      let occ = (Math.floor((h0 - hh) / 24) + 1) * 24 + hh;
      while (occ <= h1) {
        this.dispense(world, af.food, af.pinches, live);
        occ += 24;
      }
    }
  }

  private dispense(world: World, kind: FoodKind, pinches: number, live: boolean): void {
    if (live && this.requestFeed && world.clock.timeScale <= 1440) {
      this.requestFeed(kind, pinches);
      return;
    }
    world.tank.stats.feedings++;
    const left = feedDirect(world, kind, pinches, this.ingestMg);
    if (left > 0) this.chem.addOrganicN(left * FOOD_N_FRACTION);
  }

  /** Put `mg` of food into a stomach (bounded by room); returns mg swallowed. */
  private ingestMg = (f: FishEntity, mg: number): number => {
    const s = f.state;
    const cap = STOMACH_MG_PER_G * massG(f.species, s.lengthCm);
    const fill = Math.min(Math.max(0, 1 - s.stomach), mg / cap);
    if (fill <= 0) return 0;
    s.stomach += fill;
    s.hunger = clamp01(s.hunger - IMMEDIATE_SATIETY * fill);
    return fill * cap;
  };

  // ===========================================================================================
  // Journal, warnings & render hints
  // ===========================================================================================

  private journal(world: World, kind: JournalEntry['kind'], text: string, at: number, fishId?: string): void {
    const entry: JournalEntry = fishId ? { at, kind, text, fishId } : { at, kind, text };
    const j = world.tank.journal;
    j.push(entry);
    if (j.length > JOURNAL_MAX) j.splice(0, j.length - JOURNAL_MAX);
    world.events.emit('journal', { entry });
  }

  /**
   * Gentle heads-ups when something needs the keeper. Each kind fires once when its condition
   * appears and re-arms only after it has clearly gone away (no nagging); live notifications are
   * also spaced out in real time. Texts are only built when a warning actually fires.
   */
  private checkWarnings(world: World, now: number, live: boolean): void {
    const wp = world.tank.waterParams;
    const marine = world.tank.water === 'marine';
    if (this.careModeNow !== 'zen') {
      // Ammonia and nitrite only matter to animals: an empty tank's are a fishless cycle feeding
      // its new bacteria (the keeper dosed that ammonia on purpose; see `checkFishlessCycle`).
      const animals = world.fish.length > 0;
      if (this.armed('ammonia', animals && wp.ammonia >= 0.25, wp.ammonia < 0.1, world, live))
        this.fire(world, now, live, 'warning', `Ammonia has appeared (${wp.ammonia.toFixed(2)} ppm). Feed lightly and change some water.`);
      if (this.armed('nitrite', animals && wp.nitrite >= 0.25, wp.nitrite < 0.1, world, live))
        this.fire(world, now, live, 'warning', `Nitrite is rising (${wp.nitrite.toFixed(2)} ppm) while the filter bacteria catch up. A water change will help.`);
      this.checkFishlessCycle(world, now, live);
      const no3Limit = marine ? 25 : 50;
      if (this.armed('nitrate', wp.nitrate >= no3Limit, wp.nitrate < no3Limit * 0.6, world, live))
        this.fire(world, now, live, 'warning', `Nitrate has built up to ${Math.round(wp.nitrate)} ppm — time for a water change.`);
      if (this.armed('oxygen', wp.oxygen < 0.55, wp.oxygen > 0.7, world, live))
        this.fire(world, now, live, 'warning', 'Oxygen is running low — more surface movement would help the fish breathe.');
      // Nitrification eats alkalinity: without water changes KH runs out and the pH slides (the
      // "old tank syndrome" that eventually stalls the filter). A heads-up while it is easy to fix.
      const khLow = marine ? 5.5 : 1;
      if (this.armed('kh', wp.kh < khLow && tapWater(world.tank.water).kh > khLow + 1, wp.kh > khLow + 1, world, live))
        this.fire(world, now, live, 'info', `The water's carbonate hardness is nearly used up, so the pH has begun to slide (pH ${wp.ph.toFixed(1)}). A partial water change will restore it.`);
    }
    // Temperature well outside what a good share of the residents tolerate.
    let outside = 0;
    for (let i = 0; i < this.census.activeCount; i++) {
      const sp = this.census.active[i].species;
      if (wp.temperatureC < sp.tempC[0] - 2 || wp.temperatureC > sp.tempC[1] + 2) outside++;
    }
    if (this.armed('temperature', outside > 0 && outside >= this.census.activeCount * 0.3, outside === 0, world, live))
      this.fire(world, now, live, 'warning', `The water is ${wp.temperatureC < 22 ? 'too cold' : 'too warm'} for some of your animals (${wp.temperatureC.toFixed(1)} °C).`);
    if (live) {
      let hungry = 0;
      const fish = world.fish;
      for (let i = 0; i < fish.length; i++) hungry += fish[i].state.hunger;
      const mean = fish.length ? hungry / fish.length : 0;
      if (this.armed('hunger', mean > 0.75, mean < 0.4, world, live))
        this.fire(world, now, live, 'info', 'The fish are hungry and searching for food.');
    }
    if (this.armed('algae', wp.glassAlgae >= 0.45, wp.glassAlgae < 0.2, world, live))
      this.fire(world, now, live, 'info', 'Algae is creeping over the glass — a scrub would clear the view.');
    if (this.armed('plants', this.flora.overgrown >= 3, this.flora.overgrown === 0, world, live))
      this.fire(world, now, live, 'info', 'Some plants have reached the surface and could use a trim.');
  }

  /** Arm/disarm bookkeeping; true when the warning should fire now. */
  private armed(kind: WarnKind, on: boolean, off: boolean, world: World, live: boolean): boolean {
    if (!this.warnArmed[kind]) {
      if (off) this.warnArmed[kind] = true;
      return false;
    }
    if (!on) return false;
    if (live && world.clock.realSeconds - this.lastWarnReal < 20) return false;
    this.warnArmed[kind] = false;
    return true;
  }

  /**
   * A fishless cycle: an empty tank holding ammonia (the keeper's dose) grows its bacteria on it —
   * the ammonia falls as nitrite rises, then the nitrite falls. Once both read zero with the
   * filter established, say so once (a toast live, the welcome-back card after an absence). If
   * animals moved in before then, the cycle simply ends unannounced.
   */
  private checkFishlessCycle(world: World, now: number, live: boolean): void {
    if (this.cycleTold) return;
    const wp = world.tank.waterParams;
    const empty = world.fish.length === 0;
    if (!this.cycleWatch) {
      this.cycleWatch = empty && wp.ammonia >= 0.25;
      return;
    }
    if (wp.ammonia >= 0.05 || wp.nitrite >= 0.05 || wp.bacteria < 0.95) return;
    this.cycleWatch = false;
    if (!empty) return;
    this.cycleTold = true;
    this.journal(world, 'milestone', FISHLESS_CYCLE_DONE, now);
    if (live) world.events.emit('notify', { message: FISHLESS_CYCLE_DONE, level: 'success' });
    else if (this.catchingUp) this.cycleDoneAway = true;
  }

  /**
   * Journal the heads-up; gentle 'info' hints are also toasted. Water-quality warnings are
   * journal-only because the UI already shows its own throttled water-quality reminders.
   */
  private fire(world: World, now: number, live: boolean, level: 'warning' | 'info', text: string): void {
    this.lastWarnReal = world.clock.realSeconds;
    this.journal(world, level === 'warning' ? 'warning' : 'info', text, now);
    if (live && level === 'info') world.events.emit('notify', { message: text, level });
  }

  /**
   * Plant growth is drawn per frame by the decor renderer; 'plants-changed' (which rebuilds
   * colliders & cover synchronously in the App) is only needed for noticeably larger plants, so
   * it is sent sparingly — at most every 30 real seconds — to keep fast-forward smooth.
   */
  private maybeEmitPlants(world: World): void {
    const real = world.clock.realSeconds;
    if (this.flora.pendingVisualChange < 0.05 || real - this.lastPlantsEmitReal < 30) return;
    this.lastPlantsEmitReal = real;
    this.flora.markVisualSynced(world.tank);
    world.events.emit('plants-changed', {});
  }

  private summaryText(
    world: World,
    simSeconds: number,
    before: { glass: number; fish: number; nitrate: number; ph: number; overgrown: number; plantGrowth: number; length: number },
  ): string {
    const wp = world.tank.waterParams;
    const parts: string[] = [];
    for (const [id, n] of this.tallyBorn) {
      const sp = world.species.get(id);
      if (!sp) continue;
      const name = lowerName(sp.commonName);
      parts.push(sp.group === 'fish' ? `${n} ${name} fry ${n === 1 ? 'was' : 'were'} born` : `${countOf(n, name)} ${n === 1 ? 'was' : 'were'} born`);
    }
    const days = simSeconds / 86400;
    const meanLen = world.fish.reduce((a, f) => a + f.state.lengthCm, 0) / Math.max(1, world.fish.length);
    if (days >= 10 && meanLen > before.length * 1.04 && world.fish.length >= before.fish * 0.8) parts.push('the young fish have grown');
    if (wp.glassAlgae >= 0.15 && wp.glassAlgae > before.glass + 0.08)
      parts.push(wp.glassAlgae >= 0.5 ? 'algae has spread over the glass' : 'the glass grew a light film of algae');
    const plantGrowth = world.tank.plants.reduce((a, p) => a + p.growth, 0);
    if (this.flora.overgrown > before.overgrown && this.flora.overgrown >= 2) parts.push('the plants have grown tall and could use a trim');
    else if (plantGrowth > before.plantGrowth + 0.05 * Math.max(1, world.tank.plants.length)) parts.push('the plants have filled out');
    if (wp.nitrate >= (world.tank.water === 'marine' ? 25 : 40) && wp.nitrate > before.nitrate + 5) parts.push('the water could use a change');
    // (In an empty tank ammonia and nitrite are a fishless cycle at work, not a slip.)
    else if (world.fish.length > 0 && (wp.ammonia >= 0.25 || wp.nitrite >= 0.25)) parts.push('the water quality has slipped');
    else if (wp.kh < (world.tank.water === 'marine' ? 5.5 : 1) && wp.ph < before.ph - 0.3) parts.push('the pH has drifted down and the water could use a change');
    let hunger = 0;
    for (const f of world.fish) hunger += f.state.hunger;
    if (world.fish.length && hunger / world.fish.length > 0.6) parts.push(world.fish.some((f) => f.species.group === 'fish') ? 'the fish are hungry' : 'everyone is hungry');

    let text = `While you were away, ${formatDuration(simSeconds)} passed.`;
    if (parts.length) text += ` ${capitalize(joinList(parts))}.`;
    const died = this.tallyDied;
    if (died.length === 1) {
      const d = died[0];
      text += ` Sadly, ${d.name.includes(' the ') ? d.name : `a ${d.name}`} passed away ${deathPhrase(d.cause)}.`;
    } else if (died.length > 1) {
      const old = died.filter((d) => d.cause === 'old age').length;
      text += old === died.length
        ? ` ${capitalize(countOf(died.length, 'animal'))} passed away peacefully of old age.`
        : ` Sadly, ${died.length} animals passed away${old ? `, ${old} of them of old age` : ''}.`;
    }
    if (this.cycleDoneAway) text += ` ${FISHLESS_CYCLE_DONE}`;
    else if (!parts.length && !died.length) text += ' All is calm in the tank.';
    return text;
  }

  // ===========================================================================================
  // Public API: animals
  // ===========================================================================================

  /** A store-bought animal: juvenile-to-young-adult age as sold in the trade. Not yet attached to the world. */
  createFish(
    world: World,
    speciesId: string,
    opts: {
      sex?: Sex;
      ageMonths?: number;
      name?: string;
      /** Hatched/born in the tank (deterministic id, birth length, full stomach). */
      newborn?: boolean;
      generation?: number;
      parents?: [string, string] | [string];
      sizeFactor?: number;
      pos?: [number, number, number];
      bornAt?: number;
      lengthCm?: number;
    } = {},
  ): FishEntity | null {
    const sp = world.species.get(speciesId);
    if (!sp) return null;
    this.ensure(world);
    const now = world.clock.simTime;
    const rng = this.rng;
    const sizeFactor = opts.sizeFactor ?? clamp(rng.normal(1, 0.06), 0.8, 1.2);
    const sex: Sex =
      opts.sex ??
      (sp.group === 'snail' ? 'unknown' : isFighter(sp) ? (rng.chance(0.85) ? 'male' : 'female') : rng.chance(0.5) ? 'male' : 'female');

    let bornAt: number;
    let lengthCm: number;
    if (opts.newborn) {
      bornAt = opts.bornAt ?? now;
      lengthCm = opts.lengthCm ?? sp.birthLengthCm * clamp(rng.normal(1, 0.06), 0.85, 1.15);
    } else {
      // Most fish are sold at 40–80% of maturity age; shrimp & snails as young adults.
      const invert = sp.group !== 'fish';
      const months =
        opts.ageMonths ??
        Math.min(
          sp.maturityMonths * (invert ? rng.range(0.8, 1.4) : rng.range(0.4, 0.8)),
          sp.lifespanYears * 12 * 0.35,
        );
      const ageM = Math.max(invert ? 1 : 1.5, months);
      bornAt = opts.bornAt ?? now - ageM * MS_PER_MONTH;
      const linf = asymptoticLength(sp, { sex, sizeFactor });
      lengthCm = opts.lengthCm ?? vbLength(linf, sp.birthLengthCm, growthK(sp), (now - bornAt) / MS_PER_YEAR);
    }
    const id = opts.newborn ? `fish_${Math.floor(now).toString(36)}_${Math.floor(rng.next() * 2 ** 31).toString(36)}` : newId('fish');
    const state: FishState = canonicalFishState({
      id,
      speciesId,
      name: opts.name,
      sex,
      bornAt,
      addedAt: now,
      lengthCm,
      sizeFactor,
      colorSeed: Math.floor(rng.next() * 2 ** 31),
      hunger: opts.newborn ? 0.2 : 0.4,
      health: 1,
      stress: opts.newborn ? 0.1 : 0.35,
      stomach: opts.newborn ? 0.6 : 0.15,
      generation: opts.generation ?? 0,
      parents: opts.parents,
      pos: opts.pos,
    });
    // Store-bought adult female livebearers are very often already pregnant.
    if (!opts.newborn && sp.reproduction === 'livebearer' && sex === 'female' && ageMonths(state, now) >= sp.maturityMonths && rng.chance(0.6)) {
      state.gravidSince = now - rng.range(0, 20) * MS_PER_DAY;
      state.lastSpawnAt = state.gravidSince - 30 * MS_PER_DAY;
    }
    return makeFishEntity(world, state);
  }

  /** Create, attach and announce `count` animals of a species. */
  addFish(world: World, speciesId: string, count: number): FishEntity[] {
    const out: FishEntity[] = [];
    const sp = world.species.get(speciesId);
    if (!sp) return out;
    const followFeeder = this.feederFollowsStock(world);
    // Pairs and harems are sold as such: balance the sexes.
    const bonded = sp.social === 'pair' || sp.social === 'harem' || sp.traits.includes('pair-bonding');
    const firstMale = this.rng.chance(0.5);
    for (let i = 0; i < count; i++) {
      let sex: Sex | undefined;
      if (bonded && count >= 2 && sp.group !== 'snail') {
        sex = sp.social === 'harem' ? (i === 0 ? 'male' : 'female') : (i % 2 === 0) === firstMale ? 'male' : 'female';
      }
      const e = this.createFish(world, speciesId, { sex });
      if (!e) break;
      attachFish(world, e);
      world.events.emit('fish-added', { fish: e });
      out.push(e);
    }
    this.census.invalidateSocial();
    if (followFeeder && out.length) this.portionFeeder(world);
    return out;
  }

  removeFish(world: World, fishId: string): void {
    const followFeeder = this.feederFollowsStock(world);
    if (detachFish(world, fishId)) {
      this.grewAt.delete(fishId);
      this.census.invalidateSocial();
      world.events.emit('fish-removed', { fishId });
      if (followFeeder && world.fish.length) this.portionFeeder(world);
    }
  }

  /**
   * The auto-feeder's portion follows the stock the keeper buys or rehomes for as long as it
   * sits on the recommended setting (a new tank starts on 1 pinch and an empty tank): like the
   * shop's advice when you bring fish home. Once the keeper dials in their own portion — or a
   * preset ships its own — it is left alone.
   */
  private feederFollowsStock(world: World): boolean {
    const af = world.tank.equipment.autoFeeder;
    const feeds = af.hours ? af.hours.length : 0;
    if (!af.enabled || feeds === 0) return false;
    if (world.fish.length === 0) return af.pinches === 1;
    return af.pinches === recommendedPinches(world, af.food, feeds);
  }

  private portionFeeder(world: World): void {
    const af = world.tank.equipment.autoFeeder;
    const p = recommendedPinches(world, af.food, af.hours.length);
    if (p !== af.pinches) {
      af.pinches = p;
      world.events.emit('tank-settings-changed', {});
    }
  }

  /** A fish ate `nutrition` units of `food` (FoodType units): fill its stomach by mass. */
  onEat(world: World, fish: FishEntity, food: FoodParticle, nutrition: number): void {
    this.ensure(world);
    if (!(nutrition > 0)) return;
    this.ingestMg(fish, nutrition * foodMgPerNutrition(food.kind));
  }

  /** Uneaten food rotted: its nitrogen mineralizes to ammonia over the next day or so. */
  onFoodDecay(world: World, food: FoodParticle): void {
    this.ensure(world);
    const mg = Math.max(0, food.nutrition) * foodMgPerNutrition(food.kind);
    this.chem.addOrganicN(mg * FOOD_N_FRACTION);
  }

  // ===========================================================================================
  // Public API: care
  // ===========================================================================================

  waterChange(world: World, fraction: number): void {
    this.ensure(world);
    const f = clamp01(fraction);
    const now = world.clock.simTime;
    this.chem.waterChange(world.tank, f, now);
    if (f >= 0.2) this.bigWaterChangeAt = now;
    // Big changes are a small shock (temperature & chemistry shift) — fish settle within hours.
    if (f >= 0.5) for (const e of world.fish) e.state.stress = clamp01(e.state.stress + 0.15 * f);
  }

  cleanGlass(world: World): void {
    const wp = world.tank.waterParams;
    // Scraped algae drifts for a while before the filter catches it.
    wp.cloudiness = clamp01(wp.cloudiness + 0.04 * wp.glassAlgae);
    wp.glassAlgae = 0;
  }

  trimPlants(world: World): void {
    this.ensure(world);
    trimTankPlants(world.tank, (id) => world.plants.get(id));
    this.flora.markVisualSynced(world.tank);
    this.warnArmed.plants = true;
  }

  /** Medication or a filter rinsed in tap water: knocks back the nitrifying bacteria. */
  medicate(world: World, strength = 0.6): void {
    this.ensure(world);
    this.chem.crashBacteria(strength);
  }

  compatibility(world: World, species: Species, count?: number): CompatibilityReport {
    return compatibilityReport(world, species, count);
  }

  stocking(world: World): StockingReport {
    return stockingReport(world);
  }

  /** Dissolved CO₂ (mg/L) — not part of WaterParams, exposed for UI/debug. */
  get co2(): number {
    return this.chem.co2;
  }
}

// ---------------------------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------------------------

/** Age in months at the start of the step. */
function f0Months(s: FishState, t0: number): number {
  return (t0 - s.bornAt) / MS_PER_MONTH;
}

/**
 * Deaths nobody would notice: unnamed tank-born young in their first weeks (fry, shrimplets,
 * hatchling snails). Density-dependent loss of young is how real colonies regulate themselves;
 * it happens out of sight, so it is not journaled, toasted or counted as a death.
 */
function quietLoss(f: FishEntity, cause: string, now: number): boolean {
  const s = f.state;
  return s.generation > 0 && !s.name && cause !== 'old age' && (now - s.bornAt) / MS_PER_MONTH < 0.5 * f.species.maturityMonths;
}

