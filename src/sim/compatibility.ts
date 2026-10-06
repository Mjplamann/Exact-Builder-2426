import type { Species } from '../core/types';
import type { World } from '../core/world';
import { waterLiters } from '../core/tankGeometry';
import {
  bioloadUnits,
  conspecificKey,
  gapeRatio,
  isCichlid,
  isFighter,
  isInvertEater,
  isInvertebrate,
  isLongFinned,
  isPredator,
  sexLengthScale,
} from './biology';
import { stockingCapacity } from './census';
import { isCoral } from './flora';
import { capitalize, lowerName, pluralName } from './text';
import type { CompatibilityReport, StockingReport } from './LifeSim';

/**
 * "Will this animal be happy here, and will everyone else be safe?" — the checks an experienced
 * aquarist runs before buying: water type, room, temperature/pH overlap, predation (mouth size),
 * shrimp & snail eaters, fin-nippers vs flowing fins, fighting males, cichlid territories,
 * group size, reef safety and how full the tank already is.
 */

type Level = CompatibilityReport['level'];
const RANK: Record<Level, number> = { good: 0, caution: 1, bad: 2 };

/** Smallest adult total length across the sexes (cm). */
function smallestAdult(sp: Species): number {
  return sp.adultLengthCm * Math.min(sexLengthScale(sp, 'male'), sexLengthScale(sp, 'female'));
}
function largestAdult(sp: Species): number {
  return sp.adultLengthCm * Math.max(sexLengthScale(sp, 'male'), sexLengthScale(sp, 'female'));
}
/** Prey whose size, not armor, decides whether it gets eaten (fish and shrimp). */
function swallowable(sp: Species): boolean {
  return sp.group === 'fish' || sp.group === 'shrimp';
}
function plural(sp: Species): string {
  return pluralName(lowerName(sp.commonName));
}
function fmt(n: number): string {
  return Number.isInteger(n) ? `${n}` : n.toFixed(1);
}

export function compatibilityReport(world: World, sp: Species): CompatibilityReport {
  const tank = world.tank;
  const wp = tank.waterParams;
  const liters = waterLiters(tank);
  const found: { level: Level; text: string }[] = [];
  const add = (level: Level, text: string) => found.push({ level, text });
  const they = capitalize(plural(sp));

  // Residents by species (unique), with counts.
  const residents = new Map<string, { sp: Species; count: number; males: number }>();
  const groupCount = new Map<string, number>();
  for (const f of world.fish) {
    const r = residents.get(f.species.id) ?? { sp: f.species, count: 0, males: 0 };
    r.count++;
    if (f.state.sex === 'male') r.males++;
    residents.set(f.species.id, r);
    const k = conspecificKey(f.species);
    groupCount.set(k, (groupCount.get(k) ?? 0) + 1);
  }

  // --- water type ---------------------------------------------------------------------------
  if (sp.water !== tank.water) {
    if (sp.water === 'brackish' || tank.water === 'brackish')
      add('caution', `${they} prefer ${sp.water} water — this tank is ${tank.water}.`);
    else add('bad', `${they} are ${sp.water} animals and cannot live in a ${tank.water} tank.`);
  }

  // --- space ----------------------------------------------------------------------------------
  if (liters < sp.minTankLiters) {
    add(
      liters < sp.minTankLiters * 0.67 ? 'bad' : 'caution',
      `${they} need at least ${Math.round(sp.minTankLiters)} L; this tank holds about ${Math.round(liters)} L.`,
    );
  }

  // --- temperature & pH vs the water now -------------------------------------------------------
  const T = wp.temperatureC;
  const [tlo, thi] = sp.tempC;
  const dT = T < tlo ? tlo - T : T > thi ? T - thi : 0;
  if (thi < 21)
    // Heaters only heat: a room-temperature tank sits around 22 °C.
    add('bad', `${they} are cold-water animals (${fmt(tlo)}–${fmt(thi)} °C) — a tank at room temperature is too warm without a chiller.`);
  else if (dT > 0.5)
    add(dT > 3 ? 'bad' : 'caution', `${they} like ${fmt(tlo)}–${fmt(thi)} °C; the water is ${T.toFixed(1)} °C.`);
  const [plo, phi] = sp.ph;
  const dP = wp.ph < plo ? plo - wp.ph : wp.ph > phi ? wp.ph - phi : 0;
  if (dP > 0.2) add(dP > 1 ? 'bad' : 'caution', `${they} need pH ${fmt(plo)}–${fmt(phi)}; the water is pH ${wp.ph.toFixed(1)}.`);

  // --- overlap with residents' needs ----------------------------------------------------------
  for (const { sp: r } of residents.values()) {
    if (r.id === sp.id) continue;
    const tOverlap = Math.min(thi, r.tempC[1]) - Math.max(tlo, r.tempC[0]);
    if (tOverlap < 0)
      add(
        'bad',
        `${they} need ${fmt(tlo)}–${fmt(thi)} °C, but your ${plural(r)} need ${fmt(r.tempC[0])}–${fmt(r.tempC[1])} °C.`,
      );
    else if (tOverlap < 1)
      add('caution', `${they} and your ${plural(r)} share only a narrow temperature range.`);
    const pOverlap = Math.min(phi, r.ph[1]) - Math.max(plo, r.ph[0]);
    if (pOverlap < -0.3) add('caution', `${they} and your ${plural(r)} prefer quite different water chemistry (pH).`);
  }

  // --- predation, invert-eating, fin-nipping, aggression --------------------------------------
  const newGape = largestAdult(sp) * gapeRatio(sp);
  for (const { sp: r, count, males } of residents.values()) {
    const rp = plural(r);
    if (r.id !== sp.id) {
      // We eat them.
      if (isPredator(sp) && swallowable(r) && smallestAdult(r) <= newGape)
        add('bad', `Adult ${plural(sp)} (${fmt(sp.adultLengthCm)} cm) eat anything small enough to swallow — like your ${rp}.`);
      else if (!isPredator(sp) && sp.group === 'fish' && largestAdult(sp) >= 12 && !isInvertebrate(r) && largestAdult(r) <= largestAdult(sp) * 0.2)
        add('caution', `Large ${plural(sp)} may snack on tiny ${rp}.`);
      // They eat us.
      const theirGape = largestAdult(r) * gapeRatio(r);
      if (isPredator(r) && swallowable(sp) && smallestAdult(sp) <= theirGape)
        add('bad', `Your ${rp} (${fmt(r.adultLengthCm)} cm as adults) will eat ${plural(sp)}.`);
      else if (!isPredator(r) && r.group === 'fish' && largestAdult(r) >= 12 && !isInvertebrate(sp) && largestAdult(sp) <= largestAdult(r) * 0.2)
        add('caution', `Your large ${rp} may snack on ${plural(sp)}.`);
      // Shrimp and snails.
      if (isInvertEater(sp) && (r.group === 'shrimp' || r.group === 'snail' || r.group === 'crab'))
        add('bad', `${they} hunt shrimp and snails — your ${rp} would be eaten.`);
      if (isInvertEater(r) && (sp.group === 'shrimp' || sp.group === 'snail' || sp.group === 'crab'))
        add('bad', `Your ${rp} hunt shrimp and snails.`);
      if (sp.group === 'shrimp' && largestAdult(sp) <= 3.5 && r.group === 'fish' && !isInvertEater(r) && !isPredator(r) && largestAdult(r) >= 4 * largestAdult(sp) && r.diet !== 'herbivore' && r.diet !== 'algae-grazer')
        add('caution', `Your ${rp} will pick off baby ${plural(sp)} and may chase the adults.`);
      if (r.group === 'shrimp' && largestAdult(r) <= 3.5 && sp.group === 'fish' && !isInvertEater(sp) && !isPredator(sp) && largestAdult(sp) >= 4 * largestAdult(r) && sp.diet !== 'herbivore' && sp.diet !== 'algae-grazer')
        add('caution', `${they} will pick off baby ${rp}.`);
      // Fin-nipping.
      if (sp.traits.includes('fin-nipper') && isLongFinned(r)) add('bad', `${they} nip fins — your ${rp} have long, flowing fins.`);
      if (r.traits.includes('fin-nipper') && isLongFinned(sp)) add('bad', `Your ${rp} nip fins and would shred the flowing fins of ${plural(sp)}.`);
      // Temperament.
      if ((sp.temperament === 'aggressive' || sp.temperament === 'predatory') && r.temperament === 'peaceful' && !isInvertebrate(r))
        add('caution', `${they} are aggressive and will harass peaceful ${rp}.`);
      if ((r.temperament === 'aggressive' || r.temperament === 'predatory') && sp.temperament === 'peaceful' && !isInvertebrate(sp))
        add('caution', `Your ${rp} are aggressive and will harass peaceful ${plural(sp)}.`);
    }
    // Fighting males (bettas): a resident of the same fighting species.
    if (isFighter(sp) && isFighter(r) && conspecificKey(r) === conspecificKey(sp) && (males > 0 || count > 0))
      add('bad', `Male ${plural(sp)} fight to the death — keep only one male per tank.`);
  }

  // --- territorial cichlids in small tanks ----------------------------------------------------
  if (isCichlid(sp) && sp.traits.includes('territorial') && sp.temperament !== 'peaceful' && liters < 2 * sp.minTankLiters)
    add('caution', `${they} defend territories; in ${Math.round(liters)} L their tankmates will be chased.`);

  // --- reef safety ----------------------------------------------------------------------------
  if (tank.water === 'marine') {
    let corals = 0;
    for (const p of tank.plants) if (isCoral(world.plants.get(p.speciesId))) corals++;
    if (corals > 0) {
      if (sp.traits.includes('coral-nipper')) add('bad', `${they} nip coral polyps — not for a reef with corals.`);
      else if (sp.group === 'fish' && !sp.traits.includes('reef-safe'))
        add('caution', `${they} are not reliably reef-safe and may pick at corals.`);
      else if (sp.group === 'starfish' || sp.group === 'urchin' || sp.group === 'crab')
        add('caution', `${they} may topple or graze on corals.`);
    }
  }

  // --- stocking -------------------------------------------------------------------------------
  const social = sp.social === 'school' || sp.social === 'shoal' || sp.social === 'colony' || sp.social === 'harem';
  const have = groupCount.get(conspecificKey(sp)) ?? 0;
  const adding = social ? Math.max(1, sp.groupSize - have) : sp.social === 'pair' && have === 0 ? 2 : 1;
  const cap = stockingCapacity(world);
  let load = 0;
  for (const f of world.fish) load += bioloadUnits(f.species);
  const after = (load + bioloadUnits(sp) * adding) / Math.max(1, cap);
  if (after > 1.3)
    add('bad', `Adding ${adding} would bring the tank to ${Math.round(after * 100)}% of what it can support.`);
  else if (after > 1.0)
    add('caution', `Adding ${adding} would fill the tank to ${Math.round(after * 100)}% of its capacity.`);

  // --- level & advice -------------------------------------------------------------------------
  let level: Level = 'good';
  for (const i of found) if (RANK[i.level] > RANK[level]) level = i.level;
  // Remove duplicates, worst first.
  found.sort((a, b) => RANK[b.level] - RANK[a.level]);
  const issues: string[] = [];
  for (const i of found) if (!issues.includes(i.text)) issues.push(i.text);

  // Friendly advice that doesn't change the verdict.
  if (social && sp.groupSize > 1 && have < sp.groupSize)
    issues.push(`${they} feel secure in groups — keep at least ${sp.groupSize}${have ? ` (you have ${have})` : ''}.`);
  else if (sp.social === 'pair' && have === 0) issues.push(`${they} do best as a bonded pair.`);
  if (sp.traits.includes('jumper')) issues.push(`${they} can jump — keep the tank covered.`);
  return { level, issues };
}

/** Adult-size-weighted bioload vs what the volume and filtration can support. */
export function stockingReport(world: World): StockingReport {
  let bioload = 0;
  for (const f of world.fish) bioload += bioloadUnits(f.species);
  const capacity = stockingCapacity(world);
  return { bioload, capacity, ratio: bioload / Math.max(1e-6, capacity) };
}
