import type { DecorItem, TankState, WaterParams, WaterType } from '../core/types';
import { waterLiters } from '../core/tankGeometry';
import { DECOR_CATALOG } from '../decor/catalog';
import { clamp, clamp01, relax, smoothstep } from './simMath';
import { filterTurnover, lightScheduleLevel } from './environment';

/**
 * Water chemistry on the sim clock.
 *
 *  - Nitrogen cycle: fish excrete ammonia (TAN) in proportion to the food they digest; uneaten
 *    food and bodies mineralize to TAN. Ammonia- and nitrite-oxidizing bacteria (two Monod
 *    populations with real growth rates: doubling ≈ 2–3 days when fed, death ≈ 5%/day) convert
 *    NH₃ → NO₂⁻ → NO₃⁻, consuming alkalinity (7.14 mg CaCO₃ per mg N). Plants take up ammonium
 *    first, then nitrate. Nitrate accumulates until water changes remove it.
 *  - Carbonate system: pH = 7 + log10(3·KH / CO₂) + tank offset − humic acids. CO₂ comes from
 *    respiration and injection, leaves by surface degassing and photosynthesis — giving the real
 *    gentle day/night pH swing of a planted tank and the slow pH slide as KH is consumed.
 *  - Oxygen relative to saturation (Benson–Krause solubility), reaeration from surface
 *    agitation, consumption by fish, bacteria and decay, production by photosynthesis.
 *  - Temperature relaxes toward the heater set-point (or the room) with a volume-dependent time
 *    constant; tannins leach from wood/leaves; bacterial blooms cloud the water for days.
 *
 * Concentrations in `WaterParams` are as aquarium test kits report them: ammonia as NH₃
 * (total ammonia), nitrite as NO₂⁻, nitrate as NO₃⁻ (mg/L).
 */

/** Ion mass per mg nitrogen. */
export const NH3_PER_N = 17 / 14;
export const NO2_PER_N = 46 / 14;
export const NO3_PER_N = 62 / 14;

// Nitrifier kinetics (per day at 25 °C). `aob`/`nob` are stored as the oxidation rate the colony
// sustains at its steady-state substrate level; its maximum rate is MU/DEATH times that.
const MU_AOB = 0.35; // max specific growth (doubling ≈ 2 d)
const DEATH_AOB = 0.05;
const MU_NOB = 0.28; // nitrite oxidizers are slower (doubling ≈ 2.5 d) — the classic nitrite lag
const DEATH_NOB = 0.04;
/**
 * Half-saturation (mg N/L). Aquarium biofilters are dominated by high-affinity oxidizers
 * (ammonia-oxidizing archaea, Nitrospira; Sauder 2011, Hovanec 1998), so a mature filter keeps
 * ammonia and nitrite below test-kit detection (≈0.01–0.03 ppm) rather than at the ≈0.1 ppm
 * residual of a low-affinity Nitrosomonas/Nitrobacter culture.
 */
const K_AOB = 0.05;
const K_NOB = 0.05;
/** Oxidation capacity of a colony relative to the rate it sustains at steady state (MU/DEATH). */
const CAP_AOB = MU_AOB / DEATH_AOB;
const CAP_NOB = MU_NOB / DEATH_NOB;
/**
 * `WaterParams.bacteria` reads 1 when the filter can oxidize this many times the tank's ammonia
 * production at once — comfortably "cycled": the residual stays below detection even right after
 * a meal. A colony at steady state on its load reads ≈ 7/3 ≈ 2.3 in good conditions, so ordinary
 * swings in feeding never flip a mature tank back to "cycling".
 */
const CYCLED_HEADROOM = 3;
/** A pinch of spores/biofilm is always present, so an empty filter can always re-cycle. */
const SEED_MG_N_PER_DAY = 0.02;
/** Warming rate of a typical ~1 W/L aquarium heater (°C per hour): 3.6 kJ/h per L ÷ 4.19 kJ/(L·°C). */
const HEATER_C_PER_HOUR = 0.9;
/** Alkalinity consumed per mg/L of ammonia-N oxidized (dKH). */
const KH_PER_MG_N = 7.14 / 17.86;

/** Typical tap / freshly mixed salt water. */
export function tapWater(water: WaterType): { nitrate: number; kh: number; gh: number; salinitySG: number; co2: number } {
  if (water === 'marine') return { nitrate: 0, kh: 8, gh: 0, salinitySG: 1.025, co2: 1.5 };
  if (water === 'brackish') return { nitrate: 2, kh: 8, gh: 12, salinitySG: 1.008, co2: 4 };
  return { nitrate: 5, kh: 4, gh: 6, salinitySG: 1.0, co2: 8 };
}

/**
 * Dissolved-oxygen saturation (mg/L) at 1 atm — Benson & Krause (1984), as used by APHA
 * Standard Methods: 8.26 mg/L at 25 °C fresh, ≈6.7 mg/L in 35‰ seawater.
 */
export function oxygenSaturation(tempC: number, water: WaterType): number {
  const T = clamp(tempC, 0, 40) + 273.15;
  const salinity = water === 'marine' ? 35 : water === 'brackish' ? 12 : 0;
  const lnC =
    -139.34411 +
    1.575701e5 / T -
    6.642308e7 / (T * T) +
    1.2438e10 / (T * T * T) -
    8.621949e11 / (T * T * T * T) -
    salinity * (0.017674 - 10.754 / T + 2140.7 / (T * T));
  return Math.exp(lnC);
}

/**
 * Environmental activity of the nitrifiers 0..1.6: Q10 ≈ 2 in temperature; an acclimated filter
 * community keeps most of its activity down to pH ≈ 6 (acid-tolerant archaea and Nitrospira take
 * over in soft, acidic tanks — blackwater and discus tanks stay cycled) and slows steeply only
 * below pH ≈ 5.5; it needs oxygen.
 */
export function nitrifierActivity(tempC: number, ph: number, oxygen: number): number {
  const tempF = clamp(Math.pow(2, (tempC - 25) / 10), 0.15, 1.6);
  const phF = 0.2 + 0.8 * smoothstep(4.5, 6.8, ph);
  return tempF * phF * smoothstep(0.08, 0.4, oxygen);
}

/** Fraction of total ammonia present as toxic free NH₃ (Emerson et al. 1975). */
export function freeAmmoniaFraction(ph: number, tempC: number): number {
  const pKa = 0.09018 + 2729.92 / (tempC + 273.15);
  return 1 / (1 + Math.pow(10, pKa - ph));
}

/** Inputs gathered by LifeSim for one chemistry step (reused object). */
export interface ChemInputs {
  /** mg N excreted as ammonia by animals during the step. */
  excretedN: number;
  /** mg O₂ consumed by animals during the step. */
  animalO2: number;
  /** Plants' nitrogen uptake capacity (mg N/day) at current vigor. */
  plantUptakeN: number;
  /** Photosynthetic CO₂ uptake capacity (mg CO₂/day at full light). */
  photoCO2: number;
  /** Current main-light level 0..1 (intensity included). */
  light: number;
  /** Local hour (for room temperature & CO₂ injection schedule). */
  hour: number;
  /** Whether lights are on/within 1 h of switching on (CO₂ injection window). */
  co2Window: boolean;
  /** Zen mode: keep the water pristine. */
  zen: boolean;
}

export function newChemInputs(): ChemInputs {
  return { excretedN: 0, animalO2: 0, plantUptakeN: 0, photoCO2: 0, light: 0, hour: 12, co2Window: false, zen: false };
}

/** Decor-derived chemistry (recomputed when decor changes). */
interface DecorChem {
  /** Tannin leaching rate (tint units/day · L). */
  tanninRate: number;
  /** KH added per day · L by calcareous decor at low pH. */
  bufferRate: number;
  airstones: number;
  /** Decor surface area (m²) for biofilm. */
  area: number;
  /** Shelter (caves/shells) count. */
  caves: number;
}

const variantMap = new Map<string, { tannins: number; buffers: boolean; size: number; shelter: boolean }>();
let variantMapFor = -1;
function catalogInfo(d: DecorItem): { tannins: number; buffers: boolean; size: number; shelter: boolean } {
  if (variantMapFor !== DECOR_CATALOG.length) {
    variantMapFor = DECOR_CATALOG.length;
    variantMap.clear();
    for (const v of DECOR_CATALOG)
      variantMap.set(`${v.kind}:${v.variant}`, { tannins: v.tannins ?? 0, buffers: !!v.buffersPh, size: v.size, shelter: !!(v as { shelter?: boolean }).shelter });
  }
  const hit = variantMap.get(`${d.kind}:${d.variant}`);
  if (hit) return hit;
  // Unknown variant: sensible defaults by kind.
  switch (d.kind) {
    case 'driftwood':
      return { tannins: 0.3, buffers: false, size: 0.3, shelter: false };
    case 'leaf-litter':
      return { tannins: 0.6, buffers: false, size: 0.2, shelter: false };
    case 'coral-skeleton':
      return { tannins: 0, buffers: true, size: 0.2, shelter: false };
    case 'shell':
      return { tannins: 0, buffers: true, size: 0.12, shelter: true };
    case 'cave':
      return { tannins: 0, buffers: false, size: 0.18, shelter: true };
    case 'rock':
      return { tannins: 0, buffers: /holey|lime|live|seiryu|coral|ocean/.test(d.variant), size: 0.15, shelter: false };
    default:
      return { tannins: 0, buffers: false, size: 0.1, shelter: false };
  }
}

/**
 * Stateful chemistry engine. Its hidden state (nitrifier colonies, dissolved CO₂, the tank's pH
 * offset, organic matter awaiting decay) is rebuilt from `WaterParams` whenever a tank is loaded.
 */
export class Chemistry {
  /** AOB / NOB colony size: sustainable oxidation rate (mg N/day). */
  aob = 1;
  nob = 1;
  /** Dissolved CO₂ (mg/L). */
  co2 = 3;
  /** Tank-specific pH offset (substrate acids, humics) so the model starts at the saved pH. */
  private phOffset = 0;
  /** Organic nitrogen (mg N) from uneaten food & bodies waiting to mineralize. */
  pendingN = 0;
  /** Smoothed ammonia production (mg N/day) — the "load" the bacteria field is relative to. */
  loadN = 1;
  /** Last step's oxidation rates (mg N/day) for reporting. */
  lastNitrification = 0;
  /**
   * Smoothed ammonium the plants actually take up (mg N/day). In a densely planted tank the plants
   * remove most of the ammonia before the nitrifiers see it, and the filter colony settles at the
   * smaller share left for it — the tank is still fully "cycled" (ammonia stays at zero).
   */
  plantTanN = 0;
  private decor: DecorChem = { tanninRate: 0, bufferRate: 0, airstones: 0, area: 0, caves: 0 };
  private decorSig = -1;
  /** Move the CO₂ onto the tank's daily cycle at the next step (`settleOnCycle`). */
  private settleDue = false;
  /** …then re-pin the pH offset so the model reads this saved pH there (null: keep the offset). */
  private settlePh: number | null = null;

  /** Rebuild hidden state from the persisted water parameters. `expectedLoadN` mg N/day. */
  attach(tank: TankState, expectedLoadN: number): void {
    const wp = tank.waterParams;
    this.loadN = Math.max(0.3, expectedLoadN);
    // Invert the `bacteria` reading (capacity / (headroom × load)) back to a colony size. A mature
    // reading (≥ 1) restores at least the steady-state colony; a partial one a proportionally
    // smaller colony that still has to grow.
    const envF = Math.max(0.15, nitrifierActivity(wp.temperatureC, wp.ph, wp.oxygen));
    const b = clamp(wp.bacteria, 0, 3);
    const fromReading = (b * CYCLED_HEADROOM * this.loadN) / (Math.min(CAP_AOB, CAP_NOB) * envF);
    const colony = Math.max(SEED_MG_N_PER_DAY, b >= 0.95 ? Math.max(this.loadN, fromReading) : fromReading);
    this.aob = colony;
    this.nob = colony;
    this.pendingN = 0;
    this.plantTanN = 0;
    this.decorSig = -1;
    this.refreshDecor(tank);
    // Start CO₂ at its equilibrium for the expected respiration, then pin the pH offset so the
    // model reproduces the saved pH exactly.
    const v = waterLiters(tank);
    const k = this.reaeration(tank) * 0.85;
    const respCO2 = expectedLoadN * 60; // ≈ 60 mg CO₂ respired per mg N excreted (RQ 0.8, O:N ≈ 20)
    this.co2 = clamp(0.6 + respCO2 / Math.max(1, k * v), 0.5, 40);
    this.pinPh(wp, wp.ph);
    // That is only a first guess: the CO₂ follows a daily cycle (injection by day, degassing by
    // night, photosynthesis) and the first step, which knows the real respiration and plants,
    // settles onto it (`settleOnCycle`). A tank that has lived before carries on exactly where it
    // was: its saved pH was read at this hour of that cycle, so the offset is re-pinned there (a
    // guess would shift the pH at every reload or tank switch). A brand-new tank keeps the offset
    // pinned above, so its given pH reads as it always has; an injected one also starts on its
    // cycle, so its first night is like every later one (not spent degassing far below them).
    const fresh = !(tank.simTime > tank.createdAt);
    this.settleDue = !fresh || tank.equipment.co2;
    this.settlePh = fresh ? null : wp.ph;
  }

  /** Pin the tank's pH offset so the model reads `ph` at the current CO₂. */
  private pinPh(wp: WaterParams, ph: number): void {
    this.phOffset = 0;
    this.phOffset = clamp(ph - this.modelPh(wp), -2.5, 2.5);
  }

  /**
   * Put the dissolved CO₂ where this tank's steady daily cycle has it at the start of this step:
   * the step's own CO₂ balance integrated over three days of the light and injection schedule,
   * with this step's respiration and plants (`inp`) held steady.
   */
  private settleOnCycle(tank: TankState, dt: number, inp: ChemInputs): void {
    const v = waterLiters(tank);
    const kCO2 = this.reaeration(tank) * 0.85;
    const lights = tank.equipment.lights;
    const inject = tank.equipment.co2;
    const days = dt / 86400;
    // mg CO₂/day around the clock: animals, decay (organic matter mineralizes over ≈0.7 d), plants.
    const resp = (inp.animalO2 * 1.1) / Math.max(days, 1e-6) + (this.pendingN / 0.7) * 20 + inp.photoCO2 * 0.15;
    const sd = 1 / 96; // 15-minute steps, as live
    const start = inp.hour - dt / 7200; // `inp.hour` is the middle of this step
    let co2 = this.co2;
    for (let i = 0; i < 3 * 96; i++) {
      const h = (((start - 72 + (i + 0.5) * 24 * sd) % 24) + 24) % 24;
      const light = lightScheduleLevel(lights, h) * clamp01(lights.intensity);
      const window = light > 0 || lightScheduleLevel(lights, (h + 1) % 24) > 0;
      const photo = Math.min(inp.photoCO2 * light * (co2 / (co2 + 2.5)) * sd, co2 * v * 0.8 + resp * sd);
      const kInj = inject && window ? 22 : 0;
      co2 = clamp((co2 + (resp * sd - photo) / v + (kCO2 * 0.6 + kInj * 30) * sd) / (1 + (kCO2 + kInj) * sd), 0.3, 60);
    }
    this.co2 = co2;
    if (this.settlePh !== null) this.pinPh(tank.waterParams, this.settlePh);
  }

  /** Decor-derived rates; cheap signature check so it only rebuilds on change. */
  refreshDecor(tank: TankState): DecorChem {
    const ds = tank.decor;
    // Cheap numeric signature (count, kinds, scales, catalog size) — no string building per step.
    let sig = ds.length * 7919 + DECOR_CATALOG.length;
    for (let i = 0; i < ds.length; i++) sig = (sig * 31 + ds[i].kind.length * 17 + ds[i].variant.length + ds[i].scale * 1000) % 1e12;
    if (sig === this.decorSig) return this.decor;
    this.decorSig = sig;
    const d = this.decor;
    d.tanninRate = 0;
    d.bufferRate = 0;
    d.airstones = 0;
    d.area = 0;
    d.caves = 0;
    for (const item of ds) {
      const info = catalogInfo(item);
      const s2 = item.scale * item.scale;
      // A typical piece of driftwood (tannins 0.3) tints a 60 L tank to ≈0.25 at equilibrium.
      d.tanninRate += info.tannins * s2 * 1.2;
      // A fist-sized limestone adds ≈0.05 dKH/day to 60 L while pH is low.
      if (info.buffers) d.bufferRate += 3 * s2 * (item.kind === 'coral-skeleton' || item.variant === 'live-rock' ? 2 : 1);
      if (item.kind === 'airstone') d.airstones++;
      if (info.shelter) d.caves++;
      d.area += info.size * info.size * s2 * 2.2;
    }
    return d;
  }

  get decorInfo(): Readonly<DecorChem> {
    return this.decor;
  }

  /** Gas-exchange coefficient (per day) from surface agitation: still water ≈ 1.5, a lively return ≈ 7–10. */
  reaeration(tank: TankState): number {
    const f = tank.equipment.filter;
    let agitation = 0;
    if (f.on && f.flowLph > 0) {
      const typeF = f.type === 'hang-on-back' ? 1.15 : f.type === 'sump' ? 1.25 : f.type === 'sponge' ? 1.0 : f.type === 'internal' ? 0.9 : 0.8;
      agitation = Math.min(1.5, Math.sqrt(filterTurnover(tank) / 5)) * typeF;
    }
    agitation += Math.min(1.5, this.decor.airstones * 0.5);
    return 1.5 + 5.5 * agitation;
  }

  /** pH from the carbonate equilibrium (KH, CO₂), humic acids and the tank's offset. */
  modelPh(wp: WaterParams): number {
    return 7 + Math.log10((3 * Math.max(0.05, wp.kh)) / Math.max(0.2, this.co2)) - 0.5 * clamp01(wp.tannins) + this.phOffset;
  }

  /** Add organic nitrogen (mg N) that will mineralize to ammonia over the next day or so. */
  addOrganicN(mgN: number): void {
    if (mgN > 0 && Number.isFinite(mgN)) this.pendingN += mgN;
  }

  /** Immediately add free ammonia-N (mg) to the water. */
  addAmmoniaN(tank: TankState, mgN: number): void {
    const v = waterLiters(tank);
    tank.waterParams.ammonia += (mgN / v) * NH3_PER_N;
  }

  /**
   * A mature, seeded filter sized for `loadN` (mg N/day): used while a freshly set-up cycled tank
   * is first stocked, so the keeper's planned stock doesn't trigger a new-tank cycle.
   */
  seedFor(loadN: number): void {
    if (!(loadN > 0)) return;
    this.aob = Math.max(this.aob, loadN);
    this.nob = Math.max(this.nob, loadN);
    this.loadN = Math.max(this.loadN, loadN);
  }

  /** Kill a fraction of the nitrifying bacteria (medication, filter cleaned in tap water). */
  crashBacteria(fraction: number): void {
    const k = 1 - clamp01(fraction);
    this.aob = Math.max(SEED_MG_N_PER_DAY, this.aob * k);
    this.nob = Math.max(SEED_MG_N_PER_DAY, this.nob * k);
  }

  /**
   * Advance chemistry by `dt` sim seconds. All stiff terms are integrated implicitly or with exact
   * exponentials so 2-hour catch-up steps stay stable.
   */
  step(tank: TankState, dt: number, inp: ChemInputs): void {
    const wp = tank.waterParams;
    const v = waterLiters(tank);
    const days = dt / 86400;
    const T = wp.temperatureC;
    const marine = tank.water === 'marine';
    const decor = this.refreshDecor(tank);
    if (this.settleDue) {
      this.settleDue = false;
      this.settleOnCycle(tank, dt, inp);
    }

    // --- organic matter → ammonia -------------------------------------------------------------
    const mineralized = this.pendingN * relax(days, 0.7);
    this.pendingN -= mineralized;
    const tanInMg = inp.excretedN + mineralized;
    this.loadN += (tanInMg / Math.max(days, 1e-6) - this.loadN) * relax(days, 3);

    // --- nitrification ------------------------------------------------------------------------
    const envF = nitrifierActivity(T, wp.ph, wp.oxygen);

    // Ammonia (mg N/L): S' = (S + in/V) / (1 + Vmax·dt/(V(K+S))).
    let sA = Math.max(0, wp.ammonia / NH3_PER_N);
    const vmaxA = this.aob * CAP_AOB * envF; // mg N/day
    const sA0 = sA + tanInMg / v;
    sA = sA0 / (1 + (vmaxA * days) / (v * (K_AOB + sA0)));
    const oxA = (sA0 - sA) * v; // mg N oxidized

    let sN = Math.max(0, wp.nitrite / NO2_PER_N);
    const vmaxN = this.nob * CAP_NOB * envF;
    const sN0 = sN + oxA / v;
    sN = sN0 / (1 + (vmaxN * days) / (v * (K_NOB + sN0)));
    const oxN = (sN0 - sN) * v;
    this.lastNitrification = oxA / Math.max(days, 1e-6);

    // Colony growth on the substrate they actually see; slow death without it.
    this.aob *= Math.exp((MU_AOB * envF * (sA / (K_AOB + sA)) - DEATH_AOB) * days);
    this.nob *= Math.exp((MU_NOB * envF * (sN / (K_NOB + sN)) - DEATH_NOB) * days);
    this.aob = Math.max(SEED_MG_N_PER_DAY, this.aob);
    this.nob = Math.max(SEED_MG_N_PER_DAY, this.nob);

    let sNO3 = Math.max(0, wp.nitrate / NO3_PER_N) + oxN / v;

    // --- plant uptake: ammonium preferred, then nitrate ---------------------------------------
    // Assimilating ammonium releases one H⁺ per N; assimilating nitrate takes one up — so plants
    // return half the alkalinity nitrification consumed (planted tanks lose KH more slowly).
    let plantTan = 0;
    let plantAlk = 0; // mg N/L: nitrate taken up minus ammonium taken up
    if (inp.plantUptakeN > 0) {
      const cap = (inp.plantUptakeN * days) / v; // mg N/L this step
      const fromA = Math.min(sA * 0.9, cap * (sA / (0.05 + sA)));
      sA -= fromA;
      plantTan = fromA * v;
      const rest = cap - fromA;
      const fromN = Math.min(sNO3 * 0.9, rest * (sNO3 / (0.4 + sNO3)));
      sNO3 -= fromN;
      plantAlk = fromN - fromA;
    }
    this.plantTanN += (plantTan / Math.max(days, 1e-6) - this.plantTanN) * relax(days, 3);
    // Slow denitrification in anoxic pockets (deep sand, live rock interiors).
    const denit = marine ? 0.03 : 0.004;
    sNO3 *= Math.exp(-denit * days);

    wp.ammonia = sA * NH3_PER_N;
    wp.nitrite = sN * NO2_PER_N;
    wp.nitrate = sNO3 * NO3_PER_N;

    // --- alkalinity & hardness ----------------------------------------------------------------
    let kh = wp.kh - (oxA / v) * KH_PER_MG_N + plantAlk * 0.5 * KH_PER_MG_N;
    const dissolve = smoothstep(8.3, 7.2, wp.ph);
    let buffer = (decor.bufferRate / v) * dissolve * days;
    if (tank.substrate === 'crushed-coral' || tank.substrate === 'aragonite') {
      const floor = (tank.size.widthCm * tank.size.depthCm) / 1e4;
      buffer += ((floor * 120) / v) * smoothstep(8.25, 7.6, wp.ph) * days;
    }
    kh += buffer;
    wp.kh = clamp(kh, 0, 30);
    wp.gh = clamp(wp.gh + buffer * 0.7, 0, 40);

    // --- CO₂ ----------------------------------------------------------------------------------
    const kO2 = this.reaeration(tank);
    const kCO2 = kO2 * 0.85;
    // Respiration RQ ≈ 0.8 → 1.1 mg CO₂ per mg O₂; decaying food ≈ 20 mg CO₂ per mg N mineralized.
    const respCO2 = inp.animalO2 * 1.1 + mineralized * 20;
    const plantResp = inp.photoCO2 * 0.15 * days; // plants respire around the clock
    // Photosynthesis slows as free CO₂ runs out (half-saturation ≈ 2.5 mg/L) and can't take more
    // than is there.
    const photo = Math.min(
      inp.photoCO2 * inp.light * (this.co2 / (this.co2 + 2.5)) * days,
      this.co2 * v * 0.8 + respCO2 + plantResp,
    );
    const co2In = (respCO2 + plantResp - photo) / v;
    // Degassing toward air equilibrium (≈0.6 mg/L) and, when injecting, a regulated diffuser
    // pulling toward ≈30 mg/L — both integrated implicitly.
    const kInj = tank.equipment.co2 && inp.co2Window ? 22 : 0;
    this.co2 = clamp(
      (this.co2 + co2In + (kCO2 * 0.6 + kInj * 30) * days) / (1 + (kCO2 + kInj) * days),
      0.3,
      60,
    );

    // --- oxygen (relative to saturation) ------------------------------------------------------
    const cs = oxygenSaturation(T, tank.water);
    const o2Prod = photo * (32 / 44); // mg O₂
    const o2Use =
      inp.animalO2 +
      oxA * 4.3 + // nitrification
      mineralized * 18 + // BOD of decaying food
      plantResp * (32 / 44) +
      0.12 * v * days; // substrate & filter biofilm respiration
    const o2 = (wp.oxygen + kO2 * days + (o2Prod - o2Use) / (v * cs)) / (1 + kO2 * days);
    wp.oxygen = clamp(o2, 0.02, 1.15);

    // --- temperature --------------------------------------------------------------------------
    const room = 22 + 1.2 * Math.cos((2 * Math.PI * (inp.hour - 16)) / 24);
    const lampHeat = 0.4 * inp.light;
    const heater = tank.equipment.heater;
    const target = heater.on ? Math.max(heater.targetC, room + lampHeat) + lampHeat * 0.4 : room + lampHeat;
    const hours = days * 24;
    if (target > T && heater.on) {
      // A heater sized at the usual ~1 W/L warms the water by at most ≈0.9 °C an hour, easing in
      // as the thermostat nears its set-point.
      wp.temperatureC = T + Math.min((target - T) * relax(hours, 1.5), HEATER_C_PER_HOUR * hours);
    } else {
      // A glass tank sheds heat to the room with a time constant of ~10 h for 50 L, growing with
      // volume/surface (∛V): ≈17 h for 250 L — an unheated tank follows the room's daily swing.
      wp.temperatureC = T + (target - T) * relax(hours, 10 * Math.cbrt(v / 50));
    }

    // --- tannins, cloudiness ------------------------------------------------------------------
    const tanLeach = (decor.tanninRate / v) * (1 - wp.tannins);
    wp.tannins = clamp01(wp.tannins + (tanLeach - 0.025 * wp.tannins) * days);
    const filterClear = tank.equipment.filter.on ? 0.6 + 0.4 * Math.min(1.5, filterTurnover(tank) / 5) : 0.35;
    const bloom = (mineralized / v) * 1.0 + 0.4 * Math.max(0, sA - 0.25) * (1 - Math.min(1, wp.bacteria)) * days;
    wp.cloudiness = clamp01(wp.cloudiness * Math.exp(-days * filterClear / 1.4) + bloom);

    // --- pH -----------------------------------------------------------------------------------
    const lo = marine ? 7.3 : tank.water === 'brackish' ? 6.8 : 4.0;
    wp.ph = clamp(this.modelPh(wp), lo, 9.2);

    // --- biofiltration (relative to load) -----------------------------------------------------
    // What the keeper's "is my tank cycled?" means: can the tank process the ammonia it makes, with
    // room to spare? The nitrifiers' oxidation capacity in today's conditions plus the plants'
    // ammonium uptake, relative to `CYCLED_HEADROOM` × production (see `attach` for the inverse).
    const load = Math.max(0.3, this.loadN);
    const cap = Math.min(this.aob * CAP_AOB, this.nob * CAP_NOB) * envF + Math.max(0, inp.plantUptakeN);
    wp.bacteria = clamp(cap / (CYCLED_HEADROOM * load), 0, 3);

    if (inp.zen) this.keepPristine(tank);
  }

  /** Zen mode: the water simply stays healthy. */
  private keepPristine(tank: TankState): void {
    const wp = tank.waterParams;
    wp.ammonia = Math.min(wp.ammonia, 0.02);
    wp.nitrite = Math.min(wp.nitrite, 0.02);
    wp.nitrate = Math.min(wp.nitrate, 15);
    wp.oxygen = Math.max(wp.oxygen, 0.9);
    wp.bacteria = Math.max(wp.bacteria, 1);
    wp.cloudiness = Math.min(wp.cloudiness, 0.05);
    const tap = tapWater(tank.water);
    if (wp.kh < tap.kh * 0.75) wp.kh = tap.kh * 0.75;
    this.aob = Math.max(this.aob, this.loadN);
    this.nob = Math.max(this.nob, this.loadN);
  }

  /**
   * Replace `fraction` of the water with tap water (freshly mixed salt water for reefs): every
   * dissolved quantity mixes linearly toward the new water; the new water is a little cooler and
   * richer in CO₂, and the gravel vacuum takes some detritus with it.
   */
  waterChange(tank: TankState, fraction: number, now: number): void {
    const f = clamp01(fraction);
    if (f <= 0) return;
    const wp = tank.waterParams;
    const tap = tapWater(tank.water);
    const keep = 1 - f;
    wp.ammonia *= keep;
    wp.nitrite *= keep;
    wp.nitrate = wp.nitrate * keep + tap.nitrate * f;
    wp.kh = wp.kh * keep + tap.kh * f;
    wp.gh = wp.gh * keep + tap.gh * f;
    if (tank.water !== 'freshwater') wp.salinitySG = wp.salinitySG * keep + tap.salinitySG * f;
    else wp.salinitySG = 1.0;
    wp.tannins *= keep;
    wp.cloudiness *= keep;
    wp.temperatureC = wp.temperatureC * keep + (wp.temperatureC - 1.5) * f;
    wp.oxygen = wp.oxygen * keep + 1.0 * f;
    this.co2 = this.co2 * keep + tap.co2 * f;
    this.pendingN *= 1 - 0.6 * f;
    wp.lastWaterChange = now;
    const lo = tank.water === 'marine' ? 7.3 : tank.water === 'brackish' ? 6.8 : 4.0;
    wp.ph = clamp(this.modelPh(wp), lo, 9.2);
  }
}
