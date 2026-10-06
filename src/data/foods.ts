import type { FoodKind, FoodType } from '../core/types';

/**
 * Foods a keeper can offer. Physical values are tuned to real products:
 * flakes float ~10–40 s then flutter down at ~1–2 cm/s; sinking pellets fall ~5 cm/s;
 * frozen bloodworms sink ~3 cm/s; live brine shrimp & daphnia swim jerkily.
 */
export const FOODS: Record<FoodKind, FoodType> = {
  flakes: {
    kind: 'flakes', name: 'Tropical flakes', description: 'Classic staple flakes. Float, then flutter slowly down through the water column.',
    buoyancy: 'floating', floatSeconds: 25, sinkSpeed: 0.012, sizeM: 0.004, particlesPerPinch: 26, nutrition: 0.05,
    affinity: { omnivore: 1, carnivore: 0.6, insectivore: 0.8, planktivore: 0.8, herbivore: 0.5, scavenger: 0.7, detritivore: 0.5, 'algae-grazer': 0.3 },
    shape: 'flake', color: '#c9772f', color2: '#7aa04a', decayHours: 10,
  },
  'spirulina-flakes': {
    kind: 'spirulina-flakes', name: 'Spirulina flakes', description: 'Algae-rich flakes for herbivores and omnivores.',
    buoyancy: 'floating', floatSeconds: 20, sinkSpeed: 0.012, sizeM: 0.004, particlesPerPinch: 24, nutrition: 0.045,
    affinity: { herbivore: 1, omnivore: 0.9, 'algae-grazer': 0.8, detritivore: 0.6, scavenger: 0.6 },
    shape: 'flake', color: '#3f6b2a', color2: '#5d8c3a', decayHours: 10,
  },
  'micro-pellets': {
    kind: 'micro-pellets', name: 'Micro pellets', description: 'Tiny slow-sinking granules — ideal for nano fish that feed mid-water.',
    buoyancy: 'slow-sinking', floatSeconds: 4, sinkSpeed: 0.02, sizeM: 0.0009, particlesPerPinch: 60, nutrition: 0.02,
    affinity: { omnivore: 1, carnivore: 0.8, insectivore: 0.8, planktivore: 0.9, scavenger: 0.7, detritivore: 0.6 },
    shape: 'pellet', color: '#9c4a2a', decayHours: 12,
  },
  'floating-pellets': {
    kind: 'floating-pellets', name: 'Floating sticks', description: 'Buoyant pellets for cichlids, goldfish and surface feeders.',
    buoyancy: 'floating', floatSeconds: 240, sinkSpeed: 0.02, sizeM: 0.006, particlesPerPinch: 8, nutrition: 0.35,
    affinity: { omnivore: 1, carnivore: 0.9, piscivore: 0.5, herbivore: 0.5, insectivore: 0.6 },
    shape: 'stick', color: '#b5562c', decayHours: 16,
  },
  'sinking-pellets': {
    kind: 'sinking-pellets', name: 'Sinking pellets', description: 'Dense pellets that drop straight to the bottom for catfish and loaches.',
    buoyancy: 'sinking', floatSeconds: 0, sinkSpeed: 0.05, sizeM: 0.003, particlesPerPinch: 14, nutrition: 0.12,
    affinity: { omnivore: 0.9, carnivore: 0.9, scavenger: 1, detritivore: 0.9, insectivore: 0.6 },
    shape: 'pellet', color: '#6b3a1f', decayHours: 20,
  },
  'algae-wafers': {
    kind: 'algae-wafers', name: 'Algae wafers', description: 'Heavy discs that sink and soften — plecos and otos rasp at them for hours.',
    buoyancy: 'sinking', floatSeconds: 0, sinkSpeed: 0.07, sizeM: 0.014, particlesPerPinch: 2, nutrition: 1.6,
    affinity: { herbivore: 1, 'algae-grazer': 1, detritivore: 0.9, scavenger: 0.8, omnivore: 0.6 },
    shape: 'wafer', color: '#4a5a24', color2: '#6f7a33', decayHours: 30,
  },
  bloodworms: {
    kind: 'bloodworms', name: 'Frozen bloodworms', description: 'Chironomid larvae — a favorite treat that sinks and wriggles in the current.',
    buoyancy: 'sinking', floatSeconds: 0, sinkSpeed: 0.03, sizeM: 0.012, particlesPerPinch: 18, nutrition: 0.12,
    affinity: { carnivore: 1, insectivore: 1, omnivore: 0.9, scavenger: 0.8, piscivore: 0.5, planktivore: 0.5 },
    shape: 'worm', color: '#8e1414', color2: '#b02020', decayHours: 8,
  },
  'brine-shrimp': {
    kind: 'brine-shrimp', name: 'Live brine shrimp', description: 'Artemia that dart about — triggers natural hunting in almost every fish.',
    buoyancy: 'live-swimming', floatSeconds: 0, sinkSpeed: 0.004, sizeM: 0.006, particlesPerPinch: 30, nutrition: 0.06,
    affinity: { carnivore: 1, planktivore: 1, insectivore: 0.9, omnivore: 0.9, piscivore: 0.4 },
    shape: 'shrimp', color: '#d98d5b', color2: '#f2c09a', decayHours: 48, liveSpeed: 0.02,
  },
  daphnia: {
    kind: 'daphnia', name: 'Live daphnia', description: 'Water fleas that hop through the water column — excellent for small fish.',
    buoyancy: 'live-swimming', floatSeconds: 0, sinkSpeed: 0.003, sizeM: 0.002, particlesPerPinch: 50, nutrition: 0.02,
    affinity: { planktivore: 1, insectivore: 1, carnivore: 0.9, omnivore: 0.9 },
    shape: 'flea', color: '#b7804d', decayHours: 72, liveSpeed: 0.012,
  },
  mysis: {
    kind: 'mysis', name: 'Frozen mysis shrimp', description: 'Nutritious marine shrimp — sinks slowly; a reef-tank staple.',
    buoyancy: 'slow-sinking', floatSeconds: 1, sinkSpeed: 0.018, sizeM: 0.009, particlesPerPinch: 22, nutrition: 0.12,
    affinity: { carnivore: 1, planktivore: 1, omnivore: 0.9, insectivore: 0.7, piscivore: 0.5, scavenger: 0.7 },
    shape: 'shrimp', color: '#e9ddc8', color2: '#ccb79a', decayHours: 10,
  },
  krill: {
    kind: 'krill', name: 'Frozen krill', description: 'Large crustaceans for big carnivores and marine predators.',
    buoyancy: 'sinking', floatSeconds: 0, sinkSpeed: 0.035, sizeM: 0.025, particlesPerPinch: 5, nutrition: 0.6,
    affinity: { carnivore: 1, piscivore: 0.9, omnivore: 0.6, scavenger: 0.8 },
    shape: 'shrimp', color: '#d9644a', color2: '#f09a7a', decayHours: 12,
  },
  nori: {
    kind: 'nori', name: 'Nori sheet (clip)', description: 'Seaweed clipped to the glass — tangs and rabbitfish graze it.',
    buoyancy: 'clip', floatSeconds: 0, sinkSpeed: 0, sizeM: 0.05, particlesPerPinch: 1, nutrition: 4,
    affinity: { herbivore: 1, 'algae-grazer': 1, omnivore: 0.5 },
    shape: 'sheet', color: '#1f3a1c', color2: '#2f4f28', decayHours: 24,
  },
  zucchini: {
    kind: 'zucchini', name: 'Blanched zucchini', description: 'A weighted slice of vegetable for plecos, snails and herbivores.',
    buoyancy: 'sinking', floatSeconds: 0, sinkSpeed: 0.06, sizeM: 0.03, particlesPerPinch: 1, nutrition: 3,
    affinity: { herbivore: 1, 'algae-grazer': 0.9, detritivore: 0.9, scavenger: 0.7, omnivore: 0.5 },
    shape: 'slice', color: '#d9e6a3', color2: '#3d6b2a', decayHours: 36,
  },
  'fruit-flies': {
    kind: 'fruit-flies', name: 'Flightless fruit flies', description: 'Insects on the surface film — hatchetfish and archerfish strike from below.',
    buoyancy: 'floating', floatSeconds: 1e9, sinkSpeed: 0, sizeM: 0.0025, particlesPerPinch: 16, nutrition: 0.05,
    affinity: { insectivore: 1, carnivore: 0.8, omnivore: 0.6 },
    shape: 'insect', color: '#3b2a1a', color2: '#9a3a1a', decayHours: 24,
  },
  'shrimp-pellets': {
    kind: 'shrimp-pellets', name: 'Shrimp & snail pellets', description: 'Mineral-rich sinking pellets for invertebrates.',
    buoyancy: 'sinking', floatSeconds: 0, sinkSpeed: 0.04, sizeM: 0.002, particlesPerPinch: 12, nutrition: 0.1,
    affinity: { detritivore: 1, scavenger: 1, 'algae-grazer': 0.8, omnivore: 0.6, herbivore: 0.6 },
    shape: 'pellet', color: '#8a6a3a', decayHours: 30,
  },
  phytoplankton: {
    kind: 'phytoplankton', name: 'Phytoplankton', description: 'Live microalgae dosed into the water for filter feeders and corals.',
    buoyancy: 'suspended', floatSeconds: 0, sinkSpeed: 0.0005, sizeM: 0.0003, particlesPerPinch: 140, nutrition: 0.004,
    affinity: { 'filter-feeder': 1, planktivore: 0.4 },
    shape: 'cloud', color: '#5f7a2a', decayHours: 48,
  },
};

export const FOOD_LIST: FoodType[] = Object.values(FOODS);
