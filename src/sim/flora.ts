import type { PlantForm, PlantSpecies, TankState } from '../core/types';
import type { World } from '../core/world';
import { tankBounds } from '../core/tankGeometry';
import { MS_PER_DAY } from '../core/clock';
import { clamp, clamp01, relax, smoothstep } from './simMath';

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

  /** Start a fish loop: zero the demand accumulators (shares from `step` stay valid). */
  resetDemand(): void {
    this.demandGlass = this.demandSurface = this.demandPlant = this.demandMicro = this.demandCoral = 0;
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
    // Floating plants shade everything beneath them (pass 1: their coverage).
    for (const p of tank.plants) {
      const ps = world.plants.get(p.speciesId);
      if (ps?.form === 'floating') floating += ((ps.spreadCm / 100) ** 2) * p.growth;
    }
    const shade = 1 - 0.45 * clamp01(floating / Math.max(0.01, floorArea));

    // Plant-eaters' & coral-nippers' bites this step (mg), spread over the palatable biomass.
    const plantBite = this.demandPlant * this.sharePlant * days;
    const coralBite = this.demandCoral * this.shareCoral * days;
    const palBefore = Math.max(1e-6, this.palatable);
    const coralBefore = Math.max(1e-6, this.corals);

    let maxVisual = this.pendingVisualChange;
    for (const p of tank.plants) {
      const ps = world.plants.get(p.speciesId);
      if (!ps) continue;
      count++;
      const isCoral = CORAL_FORMS.has(ps.form);
      const waterOk =
        ps.water === tank.water ||
        (tank.water === 'brackish' && ps.water === 'freshwater' && wp.salinitySG < 1.006) ||
        (tank.water === 'brackish' && ps.water === 'marine' && wp.salinitySG > 1.015);
      const doseHere = ps.form === 'floating' ? light : light * shade;
      const lightRatio = doseHere / LIGHT_NEED[ps.light];
      const lf = Math.min(1.25, lightRatio);
      let co2f = 1;
      if (!isCoral && ps.form !== 'floating' && !marine) {
        const k = CO2_K[ps.light];
        co2f = inp.co2 / (inp.co2 + k) / (25 / (25 + k));
        co2f = clamp(co2f, 0.15, 1.1);
      }
      const T = wp.temperatureC;
      let tf: number;
      let chemOk = 1;
      let nf: number;
      if (isCoral) {
        // Bleaching above ~29 °C, sluggish below 22 °C; calcifiers need alkalinity; low-nutrient
        // reef water is ideal but not zero (zooxanthellae need some N).
        tf = (1 - smoothstep(28.5, 31.5, T)) * smoothstep(19, 23, T);
        const kh = wp.kh;
        const calcifier = ps.form === 'sps-coral' || ps.form === 'lps-coral';
        chemOk = calcifier ? smoothstep(5, 7, kh) * (1 - 0.5 * smoothstep(12, 16, kh)) : 1;
        const sens = ps.form === 'sps-coral' ? 1.6 : 1;
        nf = (1 - 0.6 * smoothstep(10, 45, no3 * sens)) * (0.7 + 0.3 * smoothstep(0, 2, no3));
      } else {
        tf = smoothstep(12, 18, T) * (1 - smoothstep(29, 34, T));
        const rooted = ps.placement !== 'floating' && ps.placement !== 'epiphyte';
        const soil = rooted && tank.substrate === 'aqua-soil' ? 0.25 : 0;
        nf = Math.min(1, 0.3 + 0.7 * smoothstep(0, 10, no3 + 15 * tan) + soil);
      }
      // Health target: light starvation below ~55% of need melts plants; algae smothers leaves.
      const smother = 1 - 0.45 * smoothstep(0.5, 0.95, wp.surfaceAlgae);
      const target = waterOk ? clamp01(lightRatio / 0.55) * clamp01(tf * 1.4) * chemOk * smother : 0;
      const h0 = p.health;
      p.health = clamp01(h0 + (target - h0) * relax(days, target < h0 ? 10 : 7));

      const vigor = lf * co2f * tf * p.health;
      const cmPerWeek = Math.max(0, ps.growthCmPerWeek);
      const rate = (cmPerWeek / Math.max(0.5, ps.maxHeightCm)) * vigor * nf;
      const g0 = p.growth;
      let g = Math.min(1, g0 + rate * weeks);

      const sizeB = clamp((ps.maxHeightCm / 20) * (ps.spreadCm / 10), 0.02, 12);
      const B = g * sizeB;
      // Grazing damage spreads in proportion to biomass: growth falls by bite / standing mass.
      if (isCoral && coralBite > 0) {
        g -= g * (coralBite / (coralBefore * PLANT_MG_PER_B));
        p.health = clamp01(p.health - (coralBite / (coralBefore * PLANT_MG_PER_B)) * 0.5);
      } else if (!isCoral && ps.palatable && plantBite > 0) {
        g -= g * (plantBite / (palBefore * PLANT_MG_PER_B));
        p.health = clamp01(p.health - (plantBite / (palBefore * PLANT_MG_PER_B)) * 0.3);
      }
      p.growth = clamp(g, 0.03, 1);

      if (isCoral) {
        coral += B;
        uptake += 0.035 * B * vigor;
        photo += 12 * B * vigor;
      } else {
        bio += B;
        if (ps.palatable) pal += B;
        uptake += 0.35 * B * vigor * (ps.form === 'floating' ? 2.5 : 1);
        photo += 25 * B * vigor * (ps.form === 'floating' ? 0.3 : 1);
        leaf += 0.03 * B;
      }
      cover += (REFUGE[ps.form] ?? 0.6) * (ps.spreadCm / 100) ** 2 * (0.3 + 0.7 * p.growth);
      if (TRIMMABLE.has(ps.form) && p.growth > 0.92) over++;

      // Remember visible size changes so LifeSim can tell the renderer occasionally.
      const last = this.lastVisual.get(p.id);
      if (last === undefined) this.lastVisual.set(p.id, p.growth);
      else maxVisual = Math.max(maxVisual, Math.abs(p.growth - last));
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
    const stockG = wp.glassAlgae * glassArea * ALGAE_STOCK_MG_M2;
    const stockS = wp.surfaceAlgae * surfaceArea * ALGAE_STOCK_MG_M2;

    const consG = Math.min(this.demandGlass, bioG + stockG * 0.5);
    const consS = Math.min(this.demandSurface, bioS + stockS * 0.5);
    const eatenG = Math.max(0, consG - bioG) * days;
    const eatenS = Math.max(0, consS - bioS) * days;

    let G = wp.glassAlgae;
    G += r * (G + 0.02) * (1 - G) * days - eatenG / (glassArea * ALGAE_STOCK_MG_M2);
    wp.glassAlgae = clamp01(G);
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
    const micro = (floorArea * (10 + 60 * this.cover) + leaf * 20) * maturity + inp.detritusMgDay * 0.05;
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

