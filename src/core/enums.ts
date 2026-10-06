import type {
  Activity,
  Archetype,
  CaudalShape,
  Diet,
  FinShape,
  Locomotion,
  MouthPosition,
  OrganismGroup,
  PlantForm,
  Reproduction,
  SnoutShape,
  SocialType,
  Temperament,
  Trait,
  WaterType,
  Zone,
} from './types';

/**
 * Runtime lists of every enum in types.ts (for validation and UI). The `exhaustive` helper makes
 * the compiler fail if a union member is missing here.
 */
type Exhaustive<T extends string, A extends readonly T[]> = [T] extends [A[number]] ? A : never;
function list<T extends string>() {
  return <A extends readonly T[]>(a: Exhaustive<T, A>) => a;
}

export const WATER_TYPES = list<WaterType>()(['freshwater', 'brackish', 'marine'] as const);
export const GROUPS = list<OrganismGroup>()(['fish', 'shrimp', 'snail', 'crab', 'crayfish', 'starfish', 'urchin'] as const);
export const ZONES = list<Zone>()(['top', 'middle', 'bottom', 'all'] as const);
export const TEMPERAMENTS = list<Temperament>()(['peaceful', 'semi-aggressive', 'aggressive', 'predatory'] as const);
export const SOCIAL = list<SocialType>()(['school', 'shoal', 'pair', 'harem', 'colony', 'solitary'] as const);
export const DIETS = list<Diet>()([
  'herbivore', 'omnivore', 'carnivore', 'insectivore', 'planktivore', 'piscivore', 'detritivore',
  'algae-grazer', 'filter-feeder', 'scavenger',
] as const);
export const ACTIVITIES = list<Activity>()(['diurnal', 'nocturnal', 'crepuscular'] as const);
export const REPRODUCTION = list<Reproduction>()([
  'livebearer', 'egg-scatterer', 'substrate-spawner', 'cave-spawner', 'mouthbrooder', 'bubble-nester',
  'egg-depositor', 'annual', 'pelagic-spawner', 'demersal-spawner', 'pouch-brooder', 'egg-carrier', 'none',
] as const);
export const LOCOMOTION = list<Locomotion>()([
  'anguilliform', 'subcarangiform', 'carangiform', 'thunniform', 'ostraciiform', 'tetraodontiform',
  'balistiform', 'labriform', 'amiiform', 'gymnotiform', 'rajiform', 'seahorse', 'walker', 'crawler', 'sessile',
] as const);
export const TRAITS = list<Trait>()([
  'tight-schooling', 'surface-skimmer', 'jumper', 'glass-grazer', 'surface-grazer', 'sand-sifter', 'digger',
  'burrower', 'cave-dweller', 'shy', 'bold', 'hoverer', 'bottom-rester', 'perches', 'hops', 'clings',
  'air-gulper', 'fin-nipper', 'plant-eater', 'algae-eater', 'scavenger', 'cleaner', 'territorial',
  'pair-bonding', 'anemone-host', 'sand-sleeper', 'mucus-cocoon', 'night-coloration', 'oblique-swimmer',
  'head-stander', 'upside-down', 'wood-eater', 'ambush', 'drifter', 'spitter', 'flarer', 'predator',
  'invert-eater', 'coral-nipper', 'reef-safe', 'nocturnal-hider', 'curious', 'sifter-of-detritus', 'molts',
  'climbs',
] as const);
export const ARCHETYPES = list<Archetype>()([
  'tetra', 'pencilfish', 'hatchetfish', 'headstander', 'piranha', 'pacu',
  'barb', 'danio', 'rasbora', 'minnow', 'shark-minnow', 'carp', 'goldfish', 'fancy-goldfish', 'koi',
  'loach', 'botia', 'hillstream-loach', 'kuhli', 'algae-eater',
  'cichlid', 'dwarf-cichlid', 'discus', 'angelfish', 'oscar', 'mbuna', 'frontosa', 'geophagus',
  'gourami', 'betta', 'paradise-fish', 'snakehead',
  'corydoras', 'pleco', 'otocinclus', 'catfish', 'synodontis', 'glass-catfish', 'banjo-catfish', 'shark-catfish',
  'livebearer', 'molly', 'swordtail', 'halfbeak',
  'killifish', 'rainbowfish', 'blue-eye', 'ricefish',
  'puffer', 'goby', 'sleeper', 'spiny-eel', 'eel', 'knifefish', 'elephantnose', 'bichir', 'arowana', 'gar',
  'archerfish', 'glassfish', 'leaffish', 'badis', 'butterflyfish-fw', 'stingray', 'needlefish', 'scat', 'mono',
  'sunfish', 'perch', 'stickleback', 'pike', 'lungfish',
  'clownfish', 'damselfish', 'chromis', 'anthias', 'basslet', 'dottyback', 'cardinalfish', 'hawkfish',
  'tang', 'rabbitfish', 'marine-angel', 'dwarf-angel', 'butterflyfish', 'moorish-idol',
  'wrasse', 'fairy-wrasse', 'hogfish', 'parrotfish',
  'blenny', 'marine-goby', 'dartfish', 'jawfish', 'dragonet',
  'seahorse', 'pipefish', 'lionfish', 'scorpionfish', 'frogfish', 'grouper', 'squirrelfish', 'sweetlips', 'snapper', 'batfish',
  'triggerfish', 'filefish', 'marine-puffer', 'boxfish', 'cowfish', 'moray', 'garden-eel', 'shark', 'ray',
  'shrimp', 'snail', 'crab', 'hermit-crab', 'crayfish', 'starfish', 'brittle-star', 'urchin',
] as const);
export const CAUDAL_SHAPES = list<CaudalShape>()([
  'forked', 'deeply-forked', 'emarginate', 'truncate', 'rounded', 'pointed', 'lunate', 'lyre', 'sword', 'veil',
  'delta', 'halfmoon', 'crowntail', 'double', 'fan', 'spade', 'round-flowing', 'continuous', 'none',
] as const);
export const FIN_SHAPES = list<FinShape>()(['rounded', 'pointed', 'falcate', 'sail', 'flowing', 'filament', 'spiny', 'low', 'fan'] as const);
export const SNOUTS = list<SnoutShape>()(['pointed', 'blunt', 'rounded', 'upturned', 'tubular', 'beak', 'duckbill', 'elongate'] as const);
export const MOUTHS = list<MouthPosition>()(['superior', 'terminal', 'subterminal', 'inferior', 'sucker'] as const);
export const PLANT_FORMS = list<PlantForm>()([
  'rosette', 'ribbon', 'stem', 'fine-stem', 'epiphyte-fern', 'epiphyte-broadleaf', 'carpet', 'grass', 'moss',
  'floating', 'lily', 'bulb', 'ball', 'macroalgae', 'seagrass', 'soft-coral', 'mushroom-coral', 'zoanthid',
  'lps-coral', 'sps-coral', 'gorgonian', 'anemone',
] as const);
export const PATTERN_TYPES = [
  'stripe', 'bars', 'spots', 'blotch', 'region', 'reticulate', 'marble', 'scales', 'chevrons', 'lines', 'mask', 'speckle',
] as const;
