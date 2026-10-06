import type { BackgroundKind, Equipment, FoodKind, SubstrateKind, TankSize, TankState, WaterParams, WaterType } from '../core/types';
import type { PlantIndex } from '../data/plantIndex';
import type { SpeciesIndex } from '../data/speciesIndex';
import { AQUASCAPES } from '../decor/aquascapes';
import { newTank } from '../sim/tankFactory';
import type { TankPresetInfo } from './AppApi';

/**
 * Ready-made tanks: an aquascape (hardscape + plants) plus a stocking list of animals that
 * genuinely belong together — same water chemistry, compatible temperaments and sizes, no
 * predator/prey pairs. tests/presets.test.ts checks every preset with the life sim's own
 * compatibility rules, so the care panel never flags a preset the day it is set up.
 */
export interface TankPreset extends TankPresetInfo {
  tankName: string;
  size: TankSize;
  substrate: SubstrateKind;
  background: BackgroundKind;
  aquascape: string;
  /** Biotope-appropriate water (e.g. soft & acidic blackwater, hard & alkaline Malawi). */
  water: WaterType;
  waterParams?: Partial<WaterParams>;
  equipment?: { heaterC?: number; heaterOn?: boolean; colorTempK?: number };
  /**
   * The auto-feeder ships switched on with a staple the whole community eats, portioned for the
   * stock once grown (tests/presets.test.ts checks it against the life sim's own ration), so the
   * tank stays fed through ordinary absences and time-lapse. Hand-feeding adds treats on top.
   */
  feeder: { food: FoodKind; pinches: number; hours?: number[] };
  /** Stocking list; ids missing from the species index are skipped. */
  fish: { speciesId: string; count: number }[];
}

export const PRESETS: TankPreset[] = [
  {
    id: 'amazon-community',
    name: 'Amazon community',
    tankName: 'Rio Negro',
    description: 'A planted South American stream: cardinal and rummy-nose tetras over river sand, pencilfish and hatchetfish, a pair of cockatoo cichlids guarding the roots, and sterbai corydoras foraging below.',
    water: 'freshwater',
    size: { widthCm: 120, heightCm: 50, depthCm: 50 },
    substrate: 'river-sand',
    background: 'black',
    aquascape: 'amazon',
    waterParams: { ph: 6.7, kh: 3, gh: 5 },
    equipment: { heaterC: 26 },
    feeder: { food: 'flakes', pinches: 8 },
    fish: [
      { speciesId: 'paracheirodon-axelrodi', count: 16 },
      { speciesId: 'petitella-rhodostoma', count: 12 },
      { speciesId: 'nannostomus-beckfordi', count: 8 },
      { speciesId: 'carnegiella-strigata', count: 6 },
      { speciesId: 'apistogramma-cacatuoides', count: 2 },
      { speciesId: 'corydoras-sterbai', count: 8 },
      { speciesId: 'otocinclus-vittatus', count: 5 },
      { speciesId: 'ancistrus-cirrhosus', count: 1 },
      { speciesId: 'caridina-multidentata', count: 6 },
    ],
  },
  {
    id: 'reef',
    name: 'Coral reef',
    tankName: 'Coral Garden',
    description: 'Live-rock bommies with soft and stony corals, a pair of clownfish in their anemone, a yellow tang, a shoal of green chromis, a royal gramma, firefish, a mandarin and a cleaner crew.',
    water: 'marine',
    size: { widthCm: 180, heightCm: 60, depthCm: 60 },
    substrate: 'aragonite',
    background: 'deep-blue',
    aquascape: 'reef',
    feeder: { food: 'mysis', pinches: 10 },
    fish: [
      { speciesId: 'amphiprion-ocellaris', count: 2 },
      { speciesId: 'zebrasoma-flavescens', count: 1 },
      { speciesId: 'chromis-viridis', count: 7 },
      { speciesId: 'gramma-loreto', count: 1 },
      { speciesId: 'nemateleotris-magnifica', count: 2 },
      { speciesId: 'synchiropus-splendidus', count: 1 },
      { speciesId: 'elacatinus-oceanops', count: 2 },
      { speciesId: 'lysmata-amboinensis', count: 2 },
      { speciesId: 'turbo-fluctuosus', count: 4 },
      { speciesId: 'trochus-maculatus', count: 3 },
    ],
  },
  {
    id: 'iwagumi',
    name: 'Iwagumi',
    tankName: 'Stone Garden',
    description: 'Three seiryu stones in a lawn of carpeting plants, with a drifting school of lambchop rasboras, otocinclus on the glass and shrimp grazing the stones.',
    water: 'freshwater',
    size: { widthCm: 90, heightCm: 45, depthCm: 45 },
    substrate: 'aqua-soil',
    background: 'frosted',
    aquascape: 'iwagumi',
    waterParams: { ph: 6.8 },
    equipment: { heaterC: 25 },
    feeder: { food: 'flakes', pinches: 2 },
    fish: [
      { speciesId: 'trigonostigma-espei', count: 24 },
      { speciesId: 'otocinclus-vittatus', count: 4 },
      { speciesId: 'caridina-multidentata', count: 6 },
      { speciesId: 'neocaridina-davidi-red-cherry', count: 12 },
    ],
  },
  {
    id: 'dutch',
    name: 'Dutch garden',
    tankName: 'Dutch Street',
    description: 'Terraces of colorful stem plants with a school of rummy-nose tetras, dwarf neon rainbowfish flashing in midwater and a pair of pearl gouramis.',
    water: 'freshwater',
    size: { widthCm: 120, heightCm: 50, depthCm: 50 },
    substrate: 'aqua-soil',
    background: 'black',
    aquascape: 'dutch',
    waterParams: { ph: 6.9 },
    equipment: { heaterC: 25.5 },
    feeder: { food: 'flakes', pinches: 6 },
    fish: [
      { speciesId: 'petitella-bleheri', count: 14 },
      { speciesId: 'melanotaenia-praecox', count: 10 },
      { speciesId: 'trichopodus-leerii', count: 2 },
      { speciesId: 'otocinclus-vittatus', count: 6 },
      { speciesId: 'caridina-multidentata', count: 5 },
    ],
  },
  {
    id: 'malawi',
    name: 'Lake Malawi',
    tankName: 'Malawi Shore',
    description: 'Hard, alkaline water and stacked holey rock: yellow labs and acei patrol their caves while petricola catfish slip between the stones.',
    water: 'freshwater',
    size: { widthCm: 180, heightCm: 60, depthCm: 60 },
    substrate: 'white-sand',
    background: 'gradient-blue',
    aquascape: 'malawi',
    waterParams: { ph: 8.0, kh: 10, gh: 12 },
    equipment: { heaterC: 26 },
    feeder: { food: 'flakes', pinches: 12, hours: [9.5, 14, 18.5] },
    fish: [
      { speciesId: 'labidochromis-caeruleus', count: 8 },
      { speciesId: 'pseudotropheus-sp-acei', count: 7 },
      { speciesId: 'aulonocara-jacobfreibergi', count: 3 },
      { speciesId: 'synodontis-petricola', count: 4 },
    ],
  },
  {
    id: 'blackwater',
    name: 'Blackwater igarapé',
    tankName: 'Igarapé',
    description: 'Tea-colored, soft and acidic water under floating plants: checkerboard cichlids over the leaf litter, ember tetras, cardinal tetras, pencilfish and marbled hatchetfish.',
    water: 'freshwater',
    size: { widthCm: 90, heightCm: 45, depthCm: 45 },
    substrate: 'river-sand',
    background: 'black',
    aquascape: 'blackwater',
    waterParams: { ph: 6.0, kh: 1, gh: 2, tannins: 0.45 },
    equipment: { heaterC: 27, colorTempK: 5600 },
    feeder: { food: 'flakes', pinches: 7 },
    fish: [
      { speciesId: 'dicrossus-filamentosus', count: 3 },
      { speciesId: 'hyphessobrycon-amandae', count: 12 },
      { speciesId: 'paracheirodon-axelrodi', count: 10 },
      { speciesId: 'nannostomus-eques', count: 8 },
      { speciesId: 'carnegiella-marthae', count: 6 },
      { speciesId: 'corydoras-sterbai', count: 6 },
    ],
  },
  {
    id: 'nano-shrimp',
    name: 'Shrimp nano',
    tankName: 'Moss Grove',
    description: 'A small mossy scape for a growing colony of cherry shrimp, with a shoal of tiny chili rasboras and a few otocinclus.',
    water: 'freshwater',
    size: { widthCm: 60, heightCm: 36, depthCm: 30 },
    substrate: 'aqua-soil',
    background: 'black',
    aquascape: 'nano-shrimp',
    waterParams: { ph: 7.0, kh: 3, gh: 7 },
    equipment: { heaterC: 24 },
    feeder: { food: 'micro-pellets', pinches: 2 },
    fish: [
      { speciesId: 'neocaridina-davidi-red-cherry', count: 20 },
      { speciesId: 'boraras-brigittae', count: 15 },
      { speciesId: 'otocinclus-vittatus', count: 3 },
      { speciesId: 'neritina-natalensis', count: 2 },
    ],
  },
  {
    id: 'goldfish',
    name: 'Fancy goldfish',
    tankName: 'Goldfish Pond',
    description: 'Cool, clear water over smooth stones and hardy plants, with three graceful fancy goldfish — two orandas and a ryukin — given the room they need.',
    water: 'freshwater',
    size: { widthCm: 120, heightCm: 50, depthCm: 50 },
    substrate: 'pea-gravel',
    background: 'gradient-blue',
    aquascape: 'goldfish',
    waterParams: { ph: 7.4, kh: 6, gh: 10, temperatureC: 21 },
    equipment: { heaterOn: false, heaterC: 20 },
    feeder: { food: 'sinking-pellets', pinches: 5 },
    fish: [
      { speciesId: 'carassius-auratus-oranda-red-cap', count: 1 },
      { speciesId: 'carassius-auratus-oranda-red', count: 1 },
      { speciesId: 'carassius-auratus-ryukin', count: 1 },
    ],
  },
  {
    id: 'nature',
    name: 'Nature aquarium',
    tankName: 'Forest Stream',
    description: 'A moss-crowned wood tree among dragon stones: a school of harlequin rasboras, kuhli loaches in the sand, a pair of pearl gouramis and amano shrimp.',
    water: 'freshwater',
    size: { widthCm: 120, heightCm: 50, depthCm: 50 },
    substrate: 'aqua-soil',
    background: 'frosted',
    aquascape: 'nature',
    waterParams: { ph: 6.6, kh: 3, gh: 5 },
    equipment: { heaterC: 25.5 },
    feeder: { food: 'flakes', pinches: 5 },
    fish: [
      { speciesId: 'trigonostigma-heteromorpha', count: 16 },
      { speciesId: 'pangio-kuhlii', count: 6 },
      { speciesId: 'trichopodus-leerii', count: 2 },
      { speciesId: 'otocinclus-vittatus', count: 5 },
      { speciesId: 'caridina-multidentata', count: 6 },
    ],
  },
];

/** Build a full TankState for a preset (decor & plants via the aquascape; animals are added by the app). */
export function buildPresetTank(preset: TankPreset, plants: PlantIndex, seed?: number): TankState {
  const tank = newTank({
    name: preset.tankName,
    size: preset.size,
    water: preset.water,
    substrate: preset.substrate,
    background: preset.background,
    seed,
  });
  if (preset.waterParams) Object.assign(tank.waterParams, preset.waterParams);
  const eq: Equipment = tank.equipment;
  if (preset.equipment?.heaterC !== undefined) {
    eq.heater.targetC = preset.equipment.heaterC;
    if (preset.waterParams?.temperatureC === undefined) tank.waterParams.temperatureC = preset.equipment.heaterC;
  }
  if (preset.equipment?.heaterOn !== undefined) eq.heater.on = preset.equipment.heaterOn;
  if (preset.equipment?.colorTempK !== undefined) eq.lights.colorTempK = preset.equipment.colorTempK;
  eq.autoFeeder = {
    enabled: true,
    food: preset.feeder.food,
    hours: [...(preset.feeder.hours ?? [9.5, 18])],
    pinches: preset.feeder.pinches,
  };
  const scape = AQUASCAPES.find((a) => a.id === preset.aquascape) ?? AQUASCAPES.find((a) => a.water === preset.water) ?? AQUASCAPES[0];
  const built = scape.build(tank, plants, tank.seed);
  tank.decor = built.decor;
  tank.plants = built.plants;
  return tank;
}

export function presetStock(preset: TankPreset, species: SpeciesIndex): { speciesId: string; count: number }[] {
  return preset.fish.filter((f) => species.get(f.speciesId));
}
