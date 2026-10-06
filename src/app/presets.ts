import type { TankState, WaterType } from '../core/types';
import type { PlantIndex } from '../data/plantIndex';
import type { SpeciesIndex } from '../data/speciesIndex';
import { AQUASCAPES } from '../decor/aquascapes';
import { newTank } from '../sim/tankFactory';
import type { TankPresetInfo } from './AppApi';
import type { TankSize, SubstrateKind, BackgroundKind } from '../core/types';

export interface TankPreset extends TankPresetInfo {
  size: TankSize;
  substrate: SubstrateKind;
  background: BackgroundKind;
  aquascape: string;
  /** Stocking list; ids missing from the species index are skipped. */
  fish: { speciesId: string; count: number }[];
  name: string;
  tankName: string;
  water: WaterType;
}

export const PRESETS: TankPreset[] = [
  {
    id: 'amazon-community',
    name: 'Amazon community',
    tankName: 'Rio Negro',
    description: 'A planted South American tank: cardinals and neons over sand, corydoras foraging, a pair of angelfish among the wood.',
    water: 'freshwater',
    size: { widthCm: 120, heightCm: 50, depthCm: 50 },
    substrate: 'river-sand',
    background: 'black',
    aquascape: 'amazon',
    fish: [
      { speciesId: 'paracheirodon-axelrodi', count: 18 },
      { speciesId: 'paracheirodon-innesi', count: 12 },
      { speciesId: 'corydoras-panda', count: 7 },
      { speciesId: 'pterophyllum-scalare', count: 2 },
      { speciesId: 'otocinclus-vittatus', count: 5 },
      { speciesId: 'ancistrus-cirrhosus', count: 1 },
      { speciesId: 'mikrogeophagus-ramirezi', count: 2 },
      { speciesId: 'caridina-multidentata', count: 6 },
      { speciesId: 'neritina-natalensis', count: 3 },
    ],
  },
  {
    id: 'reef',
    name: 'Coral reef',
    tankName: 'Coral Garden',
    description: 'Live rock, soft and stony corals, a pair of clownfish in their anemone, a yellow tang and a royal gramma.',
    water: 'marine',
    size: { widthCm: 180, heightCm: 60, depthCm: 60 },
    substrate: 'aragonite',
    background: 'deep-blue',
    aquascape: 'reef',
    fish: [
      { speciesId: 'amphiprion-ocellaris', count: 2 },
      { speciesId: 'zebrasoma-flavescens', count: 1 },
      { speciesId: 'paracanthurus-hepatus', count: 1 },
      { speciesId: 'gramma-loreto', count: 1 },
      { speciesId: 'nemateleotris-magnifica', count: 2 },
      { speciesId: 'synchiropus-splendidus', count: 1 },
    ],
  },
];

/** Build a full TankState for a preset (decor & plants via the aquascape, fish added later by LifeSim). */
export function buildPresetTank(preset: TankPreset, plants: PlantIndex, seed?: number): TankState {
  const tank = newTank({
    name: preset.tankName,
    size: preset.size,
    water: preset.water,
    substrate: preset.substrate,
    background: preset.background,
    seed,
  });
  const scape = AQUASCAPES.find((a) => a.id === preset.aquascape) ?? AQUASCAPES.find((a) => a.water === preset.water) ?? AQUASCAPES[0];
  const built = scape.build(tank, plants, tank.seed);
  tank.decor = built.decor;
  tank.plants = built.plants;
  return tank;
}

export function presetStock(preset: TankPreset, species: SpeciesIndex): { speciesId: string; count: number }[] {
  return preset.fish.filter((f) => species.get(f.speciesId));
}
