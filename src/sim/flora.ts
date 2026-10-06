import type { PlantForm, PlantSpecies, TankState } from '../core/types';
import type { World } from '../core/world';
import { tankBounds } from '../core/tankGeometry';
import { MS_PER_DAY } from '../core/clock';
import { clamp, clamp01, relaxFast, smoothstep } from './simMath';

/**
 * Plants, corals and algae on the sim clock, plus the "aufwuchs" food pools that grazers live on.
 *
 *  - Plants grow `growthCmPerWeek` (as a fraction of mature height) scaled by light dose vs the
 *    species' light need, CO₂, nitrogen and temperature; health falls in poor light, wrong water
 *    or under an algae blanket and recovers in good conditions. Palatable plants are nibbled by
 *    plant-eating fish, corals by coral-nippers.
 *  - Algae on the glass and on surfaces grows logistically with light dose (photoperiod ×
 *    intensity, superlinear), nutrients (nitrate, and especially ammonia) and less when plants
 *    win the competition for nitrogen; grazers eat it.
 *  - Food pools (mg dry/day): glass (biofilm + algae), surfaces (biofilm on rock, wood, leaves,
 *    detritus from fish waste, surface algae), palatable plants, and micro-fauna for fry. Grazers
 *    register their demand during the fish loop; each pool's supply/demand ratio is the share of
 *    their need they get next step.
 */

export const CORAL_FORMS: ReadonlySet<PlantForm> = new Set<PlantForm>([
  'soft-coral', 'mushroom-coral', 'zoanthid', 'lps-coral', 'sps-coral', 'gorgonian', 'anemone',
]);

/** Forms that get cut back by `trim` (stems, ribbons, carpets, mosses, floaters). */
const TRIMMABLE: ReadonlySet<PlantForm> = new Set<PlantForm>([
  'stem', 'fine-stem', 'ribbon', 'grass', 'carpet', 'moss', 'floating', 'macroalgae', 'seagrass',
]);

/** Refuge value for fry & shrimplets per m² of footprint. */
const REFUGE: Partial<Record<PlantForm, number>> = {
  moss: 3, 'fine-stem': 2.2, floating: 1.6, stem: 1.3, carpet: 1, grass: 1.1, ribbon: 0.9, rosette: 0.6,
  'epiphyte-fern': 0.8, 'epiphyte-broadleaf': 0.6, bulb: 0.6, lily: 0.5, ball: 0.4, macroalgae: 1.8,
  seagrass: 1, 'soft-coral': 0.5, 'lps-coral': 0.5, 'sps-coral': 0.7, gorgonian: 0.5, zoanthid: 0.2,
  'mushroom-coral': 0.3, anemone: 0.3,
};

/** Daily light dose (intensity × hours / 10) each light class needs for full growth. */
const LIGHT_NEED = { low: 0.25, medium: 0.5, high: 0.8 } as const;
/** CO₂ half-saturation (mg/L) by light class: demanding plants starve for carbon without injection. */
const CO2_K = { low: 1, medium: 3, high: 8 } as const;

/** Dry mass (mg) of plant tissue per unit of the biomass proxy B (a 20 cm × 10 cm plant ≈ 1). */
const PLANT_MG_PER_B = 250;
/** Standing algae at full coverage (mg dry per m²). */
const ALGAE_STOCK_MG_M2 = 300;
/** Background biofilm productivity at full light & maturity (mg dry / m² / day). */
const BIOFILM_GLASS = 8;
const BIOFILM_SURFACE = 25;
/**
 * Hard "green spot" algae on the glass (Coleochaete): tiny, firmly attached discs that appear in
 * any brightly lit tank — nutrient-poor planted tanks included — and that otocinclus, plecos and
 * shrimp can't rasp off (nerite snails can). Growth per day at a full 10-hour light dose: a faint
 * film after a couple of weeks, which is why every aquarist still wipes the front glass now and
 * then even with a good clean-up crew.
 */
const SPOT_ALGAE_PER_DAY = 0.01;

/** Per-species plant constants used every step. */
interface PlantStatic {
  water: PlantSpecies['water'];
  isCoral: boolean;
  floating: boolean;
  calcifier: boolean;
  sps: boolean;
  rooted: boolean;
  palatable: boolean;
  trimmable: boolean;
  lightNeed: number;
  co2K: number;
  /** Normalizes CO₂ limitation so 25 mg/L (injected) = 1. */
  co2Norm: number;
  refuge: number;
  /** Fraction of mature size gained per week in ideal conditions. */
  ratePerWeek: number;
  /** Biomass proxy at full size (a 20 cm × 10 cm plant = 1). */
  sizeB: number;
  /** Footprint (m²). */
  area: number;
}

function plantStatic(ps: PlantSpecies): PlantStatic {
  const k = CO2_K[ps.light] ?? 3;
  return {
    water: ps.water,
    isCoral: CORAL_FORMS.has(ps.form),
    floating: ps.form === 'floating',
    calcifier: ps.form === 'sps-coral' || ps.form === 'lps-coral',
    sps: ps.form === 'sps-coral',
    rooted: ps.placement !== 'floating' && ps.placement !== 'epiphyte',
    palatable: !!ps.palatable,
    trimmable: TRIMMABLE.has(ps.form),
    lightNeed: LIGHT_NEED[ps.light] ?? 0.5,
    co2K: k,
    co2Norm: (25 + k) / 25,
    refuge: REFUGE[ps.form] ?? 0.6,
    ratePerWeek: Math.max(0, ps.growthCmPerWeek) / Math.max(0.5, ps.maxHeightCm),
    sizeB: clamp((ps.maxHeightCm / 20) * (ps.spreadCm / 10), 0.02, 12),
    area: (ps.spreadCm / 100) * (ps.spreadCm / 100),
  };
}

export interface FloraInputs {
  /** Daily light dose (see environment.dailyLightDose). */
  dose: number;
  /** Dissolved CO₂ (mg/L). */
  co2: number;
  /** Smoothed tank ammonia production (mg N/day). */
  loadN: number;
  /** Decor surface area (m²). */
  decorArea: number;
  /** Fish digestion this step (mg/day) → detritus for detritivores. */
  detritusMgDay: number;
  zen: boolean;
  /** Track per-plant visual size changes (live mode) for throttled `plants-changed` events. */
  trackVisual: boolean;
}

/** Results & food-pool state, reused every step. */
export class Flora {
  /** Plant N uptake capacity (mg N/day) and photosynthetic CO₂ capacity (mg/day at full light). */
  plantUptakeN = 0;
  photoCO2 = 0;
  /** Refuge quality for small animals 0..1 (plant thickets, moss, floating cover). */
  cover = 0;
  /** Total plant biomass proxy, and palatable / coral parts. */
  biomass = 0;
  palatable = 0;
  corals = 0;
  /** Plants that have reached the surface / mature size and would benefit from a trim. */
  overgrown = 0;
  plantCount = 0;

  // Grazing pools: demand registered during the fish loop (mg/day), shares handed out next step.
  demandGlass = 0;
  /** Part of `demandGlass` from grazers that can scrape hard spot algae (snails; plecos a little). */
  demandGlassHard = 0;
  /** Hard spot-algae share of `glassAlgae` (hidden state; NaN = take the saved film as hard). */
  spot = Number.NaN;
  demandSurface = 0;
  demandPlant = 0;
  demandMicro = 0;
  demandCoral = 0;
  shareGlass = 1;
  shareSurface = 1;
  sharePlant = 0;
  shareMicro = 1;
  shareCoral = 0;

  /** Largest plant growth change since the renderer was last told (for throttled plants-changed). */
  pendingVisualChange = 0;
  private lastVisual = new Map<string, number>();
  private statics = new Map<string, PlantStatic | null>();
  private staticsFor: unknown = null;

  /** Cached per-species constants (plant JSON shapes vary; keep the per-plant loop monomorphic). */
  private staticFor(world: World, speciesId: string): PlantStatic | null {
    if (this.staticsFor !== world.plants) {
      this.statics.clear();
      this.staticsFor = world.plants;
    }
    let st = this.statics.get(speciesId);
    if (st === undefined) {
      const ps = world.plants.get(speciesId);
      st = ps ? plantStatic(ps) : null;
      this.statics.set(speciesId, st);
    }
    return st;
  }

  /** Start a fish loop: zero the demand accumulators (shares from `step` stay valid). */
  resetDemand(): void {
    this.demandGlass = this.demandGlassHard = this.demandSurface = this.demandPlant = this.demandMicro = this.demandCoral = 0;
  }

  /**
   * Advance plants & algae by `dt` sim seconds, using the grazing demand registered during the
   * previous fish loop, and publish the shares for the next one.
   */
  step(world: World, dt: number, inp: FloraInputs): void {
    const tank = world.tank;
    const wp = tank.waterParams;
    const days = dt / 86400;
    const weeks = days / 7;
    const b = tankBounds(tank);
    const floorArea = 4 * b.halfW * b.halfD;
    const waterH = Math.max(0.05, b.surfaceY - (tank.substrateDepthFrontCm + tank.substrateDepthBackCm) / 200);
    const glassArea = 2 * (2 * b.halfW + 2 * b.halfD) * waterH;
    const maturity = 0.25 + 0.75 * smoothstep(0, 35, (world.clock.simTime - tank.createdAt) / MS_PER_DAY);
    const light = clamp(inp.dose, 0, 1.4);
    const marine = tank.water === 'marine';
    const no3 = wp.nitrate;
    const tan = wp.ammonia;

    // ---------------------------------------------------------------- plants & corals ----------
    let uptake = 0, photo = 0, leaf = 0, cover = 0, bio = 0, pal = 0, coral = 0, over = 0, count = 0;
    let floating = 0;
    const plants = tank.plants;
    // Floating plants shade everything beneath them (pass 1: their coverage).
    for (let i = 0; i < plants.length; i++) {
      const ps = this.staticFor(world, plants[i].speciesId);
      if (ps && ps.floating) floating += ps.area * plants[i].growth;
    }
    const shade = 1 - 0.45 * clamp01(floating / Math.max(0.01, floorArea));

    // Plant-eaters' & coral-nippers' bites this step (mg), spread over the palatable biomass.
    const plantBite = this.demandPlant * this.sharePlant * days;
    const coralBite = this.demandCoral * this.shareCoral * days;
    const palBefore = Math.max(1e-6, this.palatable);
    const coralBefore = Math.max(1e-6, this.corals);

    // Conditions shared by every plant this step.
    const T = wp.temperatureC;
    const brackishFw = tank.water === 'brackish' && wp.salinitySG < 1.006;
    const brackishMarine = tank.water === 'brackish' && wp.salinitySG > 1.015;
    const tfPlant = smoothstep(12, 18, T) * (1 - smoothstep(29, 34, T));
    const tfCoral = (1 - smoothstep(28.5, 31.5, T)) * smoothstep(19, 23, T);
    const calcOk = smoothstep(5, 7, wp.kh) * (1 - 0.5 * smoothstep(12, 16, wp.kh));
    const nfPlant = 0.3 + 0.7 * smoothstep(0, 10, no3 + 15 * tan);
    const reefN = 0.7 + 0.3 * smoothstep(0, 2, no3);
    const nfCoral = (1 - 0.6 * smoothstep(10, 45, no3)) * reefN;
    const nfSps = (1 - 0.6 * smoothstep(10, 45, no3 * 1.6)) * reefN;
    const soilBonus = tank.substrate === 'aqua-soil' ? 0.25 : 0;
    const smother = 1 - 0.45 * smoothstep(0.5, 0.95, wp.surfaceAlgae);
    const co2 = inp.co2;
    const relaxDown = relaxFast(days, 10);
    const relaxUp = relaxFast(days, 7);
    const plantBiteFrac = plantBite > 0 ? plantBite / (palBefore * PLANT_MG_PER_B) : 0;
    const coralBiteFrac = coralBite > 0 ? coralBite / (coralBefore * PLANT_MG_PER_B) : 0;

    let maxVisual = this.pendingVisualChange;
    for (let i = 0; i < plants.length; i++) {
      const p = plants[i];
      const ps = this.staticFor(world, p.speciesId);
      if (!ps) continue;
      count++;
      const waterOk =
        ps.water === tank.water || (brackishFw && ps.water === 'freshwater') || (brackishMarine && ps.water === 'marine');
      const lightRatio = (ps.floating ? light : light * shade) / ps.lightNeed;
      const lf = Math.min(1.25, lightRatio);
      let co2f = 1;
      if (!ps.isCoral && !ps.floating && !marine) co2f = clamp((co2 / (co2 + ps.co2K)) * ps.co2Norm, 0.15, 1.1);
      let tf: number, chemOk: number, nf: number;
      if (ps.isCoral) {
        // Bleaching above ~29 °C, sluggish below 22 °C; calcifiers need alkalinity; low-nutrient
        // reef water is ideal but not zero (zooxanthellae need some N).
        tf = tfCoral;
        chemOk = ps.calcifier ? calcOk : 1;
        nf = ps.sps ? nfSps : nfCoral;
      } else {
        tf = tfPlant;
        chemOk = 1;
        nf = Math.min(1, nfPlant + (ps.rooted ? soilBonus : 0));
      }
      // Health target: light starvation below ~55% of need melts plants; algae smothers leaves.
      const target = waterOk ? clamp01(lightRatio / 0.55) * clamp01(tf * 1.4) * chemOk * smother : 0;
      const h0 = p.health;
      p.health = clamp01(h0 + (target - h0) * (target < h0 ? relaxDown : relaxUp));

      const vigor = lf * co2f * tf * p.health;
      let g = Math.min(1, p.growth + ps.ratePerWeek * vigor * nf * weeks);
      // Grazing damage spreads in proportion to biomass: growth falls by bite / standing mass.
      if (ps.isCoral && coralBiteFrac > 0) {
        g -= g * coralBiteFrac;
        p.health = clamp01(p.health - coralBiteFrac * 0.5);
      } else if (!ps.isCoral && ps.palatable && plantBiteFrac > 0) {
        g -= g * plantBiteFrac;
        p.health = clamp01(p.health - plantBiteFrac * 0.3);
      }
      g = clamp(g, 0.03, 1);
      p.growth = g;

      const B = g * ps.sizeB;
      if (ps.isCoral) {
        coral += B;
        uptake += 0.035 * B * vigor;
        photo += 12 * B * vigor;
      } else {
        bio += B;
        if (ps.palatable) pal += B;
        uptake += 0.35 * B * vigor * (ps.floating ? 2.5 : 1);
        photo += 25 * B * vigor * (ps.floating ? 0.3 : 1);
        leaf += 0.03 * B;
      }
      cover += ps.refuge * ps.area * (0.3 + 0.7 * g);
      if (ps.trimmable && g > 0.92) over++;

      // Remember visible size changes so LifeSim can tell the renderer occasionally (live only).
      if (inp.trackVisual) {
        const last = this.lastVisual.get(p.id);
        if (last === undefined) this.lastVisual.set(p.id, g);
        else if (Math.abs(g - last) > maxVisual) maxVisual = Math.abs(g - last);
      }
    }
    this.pendingVisualChange = maxVisual;
    this.plantUptakeN = uptake;
    this.photoCO2 = photo;
    this.biomass = bio;
    this.palatable = pal;
    this.corals = coral;
    this.overgrown = over;
    this.plantCount = count;
    this.cover = clamp01(cover / Math.max(0.01, floorArea));

    // ---------------------------------------------------------------- algae --------------------
    const compete = clamp(uptake / (uptake + inp.loadN + 1), 0, 0.85);
    const nutr = Math.min(1.25, 0.25 + 0.6 * smoothstep(0, 30, no3) + 0.5 * smoothstep(0, 0.4, tan));
    // ≈0.17/day in a bright (12 h) tank with moderate nitrate: a light film ~2 weeks after a scrub.
    const r = 0.38 * Math.pow(light, 1.5) * nutr * (1 - 0.7 * compete) * (inp.zen ? 0.4 : 1);

    const surfaceArea = floorArea + inp.decorArea + leaf;
    const bioG = glassArea * BIOFILM_GLASS * maturity * (0.4 + 0.6 * Math.min(1, light));
    const bioS = surfaceArea * BIOFILM_SURFACE * maturity * (0.4 + 0.6 * Math.min(1, light)) + inp.detritusMgDay;
    const G0 = wp.glassAlgae;
    // A scrub (or a load) resets the hidden hard share; it can never exceed the film itself.
    const spot0 = Number.isNaN(this.spot) ? G0 : Math.min(this.spot, G0);
    const glassStock = glassArea * ALGAE_STOCK_MG_M2;
    const stockSoft = (G0 - spot0) * glassStock;
    const stockHard = spot0 * glassStock;
    const stockS = wp.surfaceAlgae * surfaceArea * ALGAE_STOCK_MG_M2;

    // Grazers eat a mix of what is there: biofilm/detritus and standing algae in proportion to
    // their availability (half the algae stock is within reach per day). Only snails (and plecos,
    // a little) can scrape the hard spot algae.
    const hardFrac = this.demandGlass > 0 ? clamp01(this.demandGlassHard / this.demandGlass) : 0;
    const reachG = stockSoft + stockHard * hardFrac;
    const availG = bioG + reachG * 0.5;
    const availS = bioS + stockS * 0.5;
    const consG = Math.min(this.demandGlass, availG);
    const consS = Math.min(this.demandSurface, availS);
    const eatenG = availG > 0 ? ((consG * reachG * 0.5) / availG) * days : 0;
    const eatenHard = reachG > 0 ? (eatenG * stockHard * hardFrac) / reachG : 0;
    const eatenS = availS > 0 ? ((consS * stockS * 0.5) / availS) * days : 0;

    const spotGrowth = SPOT_ALGAE_PER_DAY * Math.pow(light, 1.5) * (inp.zen ? 0.4 : 1) * (1 - G0) * days;
    let G = G0;
    G += r * (G + 0.02) * (1 - G) * days + spotGrowth - eatenG / glassStock;
    wp.glassAlgae = clamp01(G);
    this.spot = clamp(spot0 + spotGrowth - eatenHard / glassStock, 0, wp.glassAlgae);
    let S = wp.surfaceAlgae;
    S += 0.8 * r * (S + 0.02) * (1 - S) * days - eatenS / (surfaceArea * ALGAE_STOCK_MG_M2);
    wp.surfaceAlgae = clamp01(S);

    // Shares for the next fish loop.
    this.shareGlass = this.demandGlass > 0 ? consG / this.demandGlass : 1;
    this.shareSurface = this.demandSurface > 0 ? consS / this.demandSurface : 1;
    const plantSupply = pal * PLANT_MG_PER_B * 0.05; // a plant-eater can strip ~5%/day
    this.sharePlant = this.demandPlant > 0 ? Math.min(1, plantSupply / this.demandPlant) : 0;
    const coralSupply = coral * PLANT_MG_PER_B * 0.03;
    this.shareCoral = this.demandCoral > 0 ? Math.min(1, coralSupply / this.demandCoral) : 0;
    // Infusoria & suspended fines: produced on surfaces and plants, plus fine detritus and the
    // crumbs of every feeding.
    const micro = (floorArea * (10 + 60 * this.cover) + leaf * 20) * maturity + inp.detritusMgDay * 0.15;
    this.shareMicro = this.demandMicro > 0 ? Math.min(1, micro / this.demandMicro) : 1;
  }

  /** Mark the current plant sizes as shown (after LifeSim emitted plants-changed). */
  markVisualSynced(tank: TankState): void {
    this.lastVisual.clear();
    for (const p of tank.plants) this.lastVisual.set(p.id, p.growth);
    this.pendingVisualChange = 0;
  }

  /** Forget everything tank-specific (tank replaced). */
  reset(): void {
    this.lastVisual.clear();
    this.pendingVisualChange = 0;
    this.spot = Number.NaN;
    this.shareGlass = this.shareSurface = this.shareMicro = 1;
    this.sharePlant = this.shareCoral = 0;
    this.resetDemand();
  }
}

/** Cut stems, ribbons, carpets, mosses and floaters back to ~60% (with natural variation). */
export function trimPlants(tank: TankState, lookup: (id: string) => PlantSpecies | undefined): number {
  let n = 0;
  for (const p of tank.plants) {
    const ps = lookup(p.speciesId);
    if (!ps || !TRIMMABLE.has(ps.form)) continue;
    const target = 0.55 + 0.1 * (((p.seed >>> 0) % 1000) / 1000);
    if (p.growth > target) {
      p.growth = target;
      n++;
    }
  }
  return n;
}

export function isCoral(ps: PlantSpecies | undefined): boolean {
  return !!ps && CORAL_FORMS.has(ps.form);
}

