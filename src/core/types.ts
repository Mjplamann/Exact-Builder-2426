/**
 * Shared contracts for the whole aquarium.
 *
 * Every module codes against these types. Changing a type here is a cross-team change:
 * add optional fields rather than renaming or removing existing ones.
 *
 * Units (everywhere unless a field name says otherwise):
 *   - world space: meters. Tank interior x ∈ [-W/2, W/2] (left→right), y ∈ [0, H] (glass floor → rim),
 *     z ∈ [-D/2, D/2] (back glass → front glass; the viewer looks toward −z from +z).
 *   - real time `dt`: seconds of wall-clock time (drives animation and behavior).
 *   - sim time: milliseconds since the Unix epoch, advanced by `dt * timeScale` (drives biology).
 *   - lengths of animals in data: centimeters (total length, snout to tail tip).
 */

// ---------------------------------------------------------------------------------------------
// Enumerations
// ---------------------------------------------------------------------------------------------

export type WaterType = 'freshwater' | 'brackish' | 'marine';

/** Kind of organism. Drives which renderer/behavior family handles it. */
export type OrganismGroup = 'fish' | 'shrimp' | 'snail' | 'crab' | 'crayfish' | 'starfish' | 'urchin';

/** Preferred vertical zone of the water column. */
export type Zone = 'top' | 'middle' | 'bottom' | 'all';

export type Temperament = 'peaceful' | 'semi-aggressive' | 'aggressive' | 'predatory';

export type SocialType =
  | 'school' // tight, polarized group swimming (rummynose, harlequin rasbora)
  | 'shoal' // loose aggregation (most tetras, barbs when calm)
  | 'pair' // bonded pairs (rams, clownfish, many cichlids)
  | 'harem' // one male, several females (many dwarf cichlids, fairy wrasses, anthias)
  | 'colony' // group living with individual territories (mbuna, shrimp colonies)
  | 'solitary';

export type Diet =
  | 'herbivore'
  | 'omnivore'
  | 'carnivore'
  | 'insectivore'
  | 'planktivore'
  | 'piscivore'
  | 'detritivore'
  | 'algae-grazer'
  | 'filter-feeder'
  | 'scavenger';

export type Activity = 'diurnal' | 'nocturnal' | 'crepuscular';

export type Reproduction =
  | 'livebearer' // guppy, molly, platy, swordtail, halfbeaks, goodeids
  | 'egg-scatterer' // most tetras, barbs, danios, rasboras
  | 'substrate-spawner' // open-substrate cichlids, rainbowfish on plants
  | 'cave-spawner' // apistogramma, plecos, kribensis
  | 'mouthbrooder' // mbuna, some bettas, cardinalfish (male)
  | 'bubble-nester' // bettas, gouramis
  | 'egg-depositor' // corydoras (eggs on glass), killifish on mops
  | 'annual' // annual killifish (eggs in substrate)
  | 'pelagic-spawner' // most marine reef fish (eggs drift away)
  | 'demersal-spawner' // clownfish, gobies, blennies, damsels (eggs guarded on rock)
  | 'pouch-brooder' // seahorses, pipefish
  | 'egg-carrier' // shrimp, crayfish (berried females)
  | 'none'; // not realistically bred in a home tank

/** Swimming mode — selects the undulation envelope used by the swim shader and steering limits. */
export type Locomotion =
  | 'anguilliform' // whole body waves (eels, kuhli loach, moray)
  | 'subcarangiform' // rear half waves (most tetras, barbs, cichlids, goldfish)
  | 'carangiform' // rear third waves, stiff front (danios, tangs at speed, jacks)
  | 'thunniform' // only peduncle + lunate tail (fast pelagics)
  | 'ostraciiform' // rigid body, tail sculls (boxfish, cowfish)
  | 'tetraodontiform' // dorsal + anal fin sculling (puffers, triggers, filefish)
  | 'balistiform' // dorsal + anal undulation (triggerfish)
  | 'labriform' // pectoral rowing (wrasses, damsels hovering, angelfish slow swim)
  | 'amiiform' // long dorsal fin wave, body straight (bichirs, bowfin, arowana slow)
  | 'gymnotiform' // long anal fin wave, can swim backwards (knifefish)
  | 'rajiform' // pectoral disc undulation (rays)
  | 'seahorse' // upright, dorsal fin flutter, tail grasps holdfasts
  | 'walker' // legs on substrate, occasional swimming (shrimp, crab, crayfish)
  | 'crawler' // muscular foot glide on surfaces (snails, starfish, urchins)
  | 'sessile';

/**
 * Behavioral traits. The behavior system maps each to concrete steering behaviors.
 * Data authors: only use values from this list.
 */
export type Trait =
  | 'tight-schooling' // keeps very close polarized formation
  | 'surface-skimmer' // lives right under the surface (hatchetfish, halfbeaks)
  | 'jumper' // known to jump (needs a lid)
  | 'glass-grazer' // rasps algae from glass (otocinclus, nerites, plecos)
  | 'surface-grazer' // picks/rasps algae off rock & wood (mbuna, tangs, siamese algae eater)
  | 'sand-sifter' // takes mouthfuls of sand and sifts (geophagus, sleeper gobies, corydoras)
  | 'digger' // excavates pits/caves (cichlids, jawfish)
  | 'burrower' // buries in substrate (kuhli loach, some wrasses at night, garden eels)
  | 'cave-dweller' // claims and returns to a cave (plecos, apistogramma)
  | 'shy' // stays near cover, hides when startled
  | 'bold' // explores open water, approaches viewer
  | 'hoverer' // hovers in place with pectoral sculling (gouramis, angelfish, discus, rams)
  | 'bottom-rester' // rests motionless on substrate (corydoras between forays, gobies, loaches)
  | 'perches' // sits propped on fins on rock (hawkfish, blennies, gobies)
  | 'hops' // moves in short hops along bottom (gobies, blennies)
  | 'clings' // suction-holds onto surfaces (plecos, hillstream loaches, otos)
  | 'air-gulper' // darts to surface to gulp air (labyrinth fish, corydoras)
  | 'fin-nipper'
  | 'plant-eater' // eats aquarium plants
  | 'algae-eater'
  | 'scavenger' // cleans up settled food
  | 'cleaner' // services other fish (cleaner wrasse, cleaner shrimp)
  | 'territorial' // defends a territory around a home point
  | 'pair-bonding'
  | 'anemone-host' // lives in an anemone (clownfish)
  | 'sand-sleeper' // sleeps buried in sand (many wrasses)
  | 'mucus-cocoon' // sleeps in a mucus bubble (parrotfish)
  | 'night-coloration' // shows different colors at night (pencilfish)
  | 'oblique-swimmer' // swims tilted head-up (Nannostomus eques)
  | 'head-stander' // rests head-down (headstanders, Anostomus)
  | 'upside-down' // swims inverted (Synodontis nigriventris)
  | 'wood-eater' // rasps wood (Panaque)
  | 'ambush' // lies in wait and strikes (lionfish, leaffish)
  | 'drifter' // mimics a drifting leaf (leaffish)
  | 'spitter' // shoots water at insects (archerfish)
  | 'flarer' // displays/flares at rivals and reflections (betta)
  | 'predator' // eats fish small enough to fit in its mouth
  | 'invert-eater' // eats shrimp/snails
  | 'coral-nipper' // nips coral polyps
  | 'reef-safe'
  | 'nocturnal-hider' // hides all day, active at night
  | 'curious' // investigates new objects / follows viewer
  | 'sifter-of-detritus'
  | 'molts' // invertebrates that shed exoskeleton
  | 'climbs'; // climbs plants and decor (snails, shrimp)

export type Archetype =
  // Freshwater fish body plans
  | 'tetra' | 'pencilfish' | 'hatchetfish' | 'headstander' | 'piranha' | 'pacu'
  | 'barb' | 'danio' | 'rasbora' | 'minnow' | 'shark-minnow' | 'carp' | 'goldfish' | 'fancy-goldfish' | 'koi'
  | 'loach' | 'botia' | 'hillstream-loach' | 'kuhli' | 'algae-eater'
  | 'cichlid' | 'dwarf-cichlid' | 'discus' | 'angelfish' | 'oscar' | 'mbuna' | 'frontosa' | 'geophagus'
  | 'gourami' | 'betta' | 'paradise-fish' | 'snakehead'
  | 'corydoras' | 'pleco' | 'otocinclus' | 'catfish' | 'synodontis' | 'glass-catfish' | 'banjo-catfish' | 'shark-catfish'
  | 'livebearer' | 'molly' | 'swordtail' | 'halfbeak'
  | 'killifish' | 'rainbowfish' | 'blue-eye' | 'ricefish'
  | 'puffer' | 'goby' | 'sleeper' | 'spiny-eel' | 'eel' | 'knifefish' | 'elephantnose' | 'bichir' | 'arowana' | 'gar'
  | 'archerfish' | 'glassfish' | 'leaffish' | 'badis' | 'butterflyfish-fw' | 'stingray' | 'needlefish' | 'scat' | 'mono'
  | 'sunfish' | 'perch' | 'stickleback' | 'pike' | 'lungfish'
  // Marine fish body plans
  | 'clownfish' | 'damselfish' | 'chromis' | 'anthias' | 'basslet' | 'dottyback' | 'cardinalfish' | 'hawkfish'
  | 'tang' | 'rabbitfish' | 'marine-angel' | 'dwarf-angel' | 'butterflyfish' | 'moorish-idol'
  | 'wrasse' | 'fairy-wrasse' | 'hogfish' | 'parrotfish'
  | 'blenny' | 'marine-goby' | 'dartfish' | 'jawfish' | 'dragonet'
  | 'seahorse' | 'pipefish' | 'lionfish' | 'scorpionfish' | 'frogfish' | 'grouper' | 'squirrelfish' | 'sweetlips' | 'snapper' | 'batfish'
  | 'triggerfish' | 'filefish' | 'marine-puffer' | 'boxfish' | 'cowfish' | 'moray' | 'garden-eel' | 'shark' | 'ray'
  // Invertebrates
  | 'shrimp' | 'snail' | 'crab' | 'hermit-crab' | 'crayfish' | 'starfish' | 'brittle-star' | 'urchin';

export type CaudalShape =
  | 'forked' | 'deeply-forked' | 'emarginate' | 'truncate' | 'rounded' | 'pointed' | 'lunate' | 'lyre'
  | 'sword' // swordtail extension on lower lobe
  | 'veil' | 'delta' | 'halfmoon' | 'crowntail' | 'double' | 'fan' | 'spade' | 'round-flowing'
  | 'continuous' // fused with dorsal/anal (eels)
  | 'none';

export type FinShape = 'rounded' | 'pointed' | 'falcate' | 'sail' | 'flowing' | 'filament' | 'spiny' | 'low' | 'fan';

export type SnoutShape = 'pointed' | 'blunt' | 'rounded' | 'upturned' | 'tubular' | 'beak' | 'duckbill' | 'elongate';
export type MouthPosition = 'superior' | 'terminal' | 'subterminal' | 'inferior' | 'sucker';

// ---------------------------------------------------------------------------------------------
// Species data (authored as JSON under src/data/species/*.json)
// ---------------------------------------------------------------------------------------------

/** A fin as fractions of body length (0 = snout tip, 1 = base of tail fin). */
export interface FinSpec {
  /** Where the fin base starts along the body (0..1). */
  start: number;
  /** Where the fin base ends along the body (0..1). */
  end: number;
  /** Fin height (dorsal/anal) or length (pectoral/pelvic) relative to body length. */
  height: number;
  shape?: FinShape;
  /** For 'filament'/'flowing' fins: extra trailing length relative to body length. */
  trail?: number;
}

/**
 * Body plan: archetype supplies sensible defaults, every other field optionally overrides them.
 * All proportions are relative to body length (snout → caudal fin base).
 */
export interface BodyPlan {
  archetype: Archetype;
  /** Max body depth / length. neon ≈ 0.22, angelfish ≈ 0.55, discus ≈ 0.85, kuhli ≈ 0.08. */
  depth?: number;
  /** Max body width / length. compressed ≈ 0.08, rounded ≈ 0.16, depressed (pleco) ≈ 0.25. */
  width?: number;
  /** Position of maximum depth along the body (0..1). */
  depthPos?: number;
  /** Head length / body length. */
  headLength?: number;
  snout?: SnoutShape;
  mouth?: MouthPosition;
  /** Eye diameter relative to head length (0.2 small .. 0.45 huge). */
  eyeSize?: number;
  /** Caudal peduncle depth relative to max depth (0.2 slender .. 0.6 thick). */
  peduncle?: number;
  /** Belly fullness: 0 flat .. 1 very round (mollies, goldfish, pregnant livebearers). */
  belly?: number;
  /** Arch of the back: −1 straight/flat .. 1 strongly humped (oranda/frontosa hump uses `hump`). */
  backArch?: number;
  /** Nuchal hump / wen size 0..1 (frontosa, flowerhorn, oranda). */
  hump?: number;
  barbels?: number;
  barbelLength?: number;
  caudal?: { shape: CaudalShape; size?: number };
  dorsal?: FinSpec | null;
  /** Second (soft) dorsal fin, e.g. gobies, rainbowfish, perches. */
  dorsal2?: FinSpec | null;
  anal?: FinSpec | null;
  pelvic?: FinSpec | null;
  pectoral?: FinSpec | null;
  adipose?: boolean;
  /** Scale visibility 0 (scaleless/catfish) .. 1 (large obvious scales like barbs). */
  scaleSize?: number;
  /** Armor plating look (corydoras, plecos, boxfish). */
  armored?: boolean;
}

/** Hex color "#rrggbb". */
export type Color = string;

/**
 * Body surface coordinates used by patterns:
 *   x: 0 at snout tip → 1 at caudal fin base (the tail fin itself is styled via `fins.caudal`).
 *   y: −1 belly midline → 0 lateral line → +1 dorsal midline.
 */
export type Pattern =
  | { type: 'stripe'; color: Color; y: number; width: number; x0?: number; x1?: number; glow?: number; iridescent?: boolean }
  /**
   * `curve` (−1..1, optional): bows the bars sideways along their height so they follow the body's
   * curvature (+ = the middle bulges toward the tail, like a clownfish head bar following the gill
   * cover). Bars/regions spanning the full height just behind the head curve automatically.
   */
  | { type: 'bars'; color: Color; count: number; width: number; x0?: number; x1?: number; slant?: number; y0?: number; y1?: number; curve?: number }
  | { type: 'spots'; color: Color; density: number; size: number; x0?: number; x1?: number; y0?: number; y1?: number; jitter?: number }
  /** `softness` (optional, 0..1, default 0.22): edge blur as a fraction of the radius (0.05 = crisp). */
  | { type: 'blotch'; color: Color; x: number; y: number; rx: number; ry: number; ring?: Color; softness?: number }
  | { type: 'region'; color: Color; x0?: number; x1?: number; y0?: number; y1?: number; softness?: number; curve?: number }
  | { type: 'reticulate'; color: Color; scale: number; thickness?: number }
  | { type: 'marble'; color: Color; scale: number; amount: number }
  | { type: 'scales'; color: Color; contrast: number }
  | { type: 'chevrons'; color: Color; count: number; width: number; x0?: number; x1?: number }
  | { type: 'lines'; color: Color; count: number; width: number; wavy?: number; y0?: number; y1?: number } // many thin horizontal lines
  | { type: 'mask'; color: Color; width: number } // eye bar / face mask through the eye
  | { type: 'speckle'; color: Color; density: number }; // fine pepper speckling

export interface FinLook {
  color?: Color;
  opacity?: number;
  edge?: Color;
  /** Width of the edge band as fraction of fin size. */
  edgeWidth?: number;
  /** Fin patterns use the same coordinates relative to the fin: x 0 base → 1 tip, y −1..1 across. */
  patterns?: Pattern[];
}

export interface Appearance {
  /** Main flank color. */
  base: Color;
  /** Color toward the back (blended over the top third). */
  dorsal?: Color;
  /** Color toward the belly (blended over the bottom third). */
  ventral?: Color;
  /** Default fin color & opacity (0.15 glass-clear .. 1 opaque). */
  fin: Color;
  finOpacity: number;
  eye?: Color;
  /** Mirror-like guanine sheen 0..1 (silver fish ≈ 0.7). */
  metallic?: number;
  /** Angle-dependent color shift 0..1 (neon stripe ≈ 1). */
  iridescence?: number;
  iridescenceColor?: Color;
  /** Body translucency 0 opaque .. 1 glass (glass catfish ≈ 0.85, ghost shrimp ≈ 0.9). */
  translucency?: number;
  patterns?: Pattern[];
  fins?: {
    dorsal?: FinLook;
    caudal?: FinLook;
    anal?: FinLook;
    pelvic?: FinLook;
    pectoral?: FinLook;
  };
}

export interface SexOverride {
  /** Multiplies adult length for this sex. */
  lengthScale?: number;
  look?: Partial<Appearance>;
  body?: Partial<BodyPlan>;
}

export interface Species {
  /** kebab-case unique id, e.g. "paracheirodon-innesi" (scientific) or "betta-splendens-halfmoon-red" for morphs. */
  id: string;
  commonName: string;
  scientificName: string;
  family: string;
  group: OrganismGroup;
  water: WaterType;
  /** Native range, short ("Upper Amazon, Peru & Colombia"). "Captive-bred" for man-made morphs. */
  region: string;
  /** 1–2 sentences of accurate natural-history color shown in the info card. */
  description: string;

  /** Typical adult total length reached in home aquaria (cm). */
  adultLengthCm: number;
  /** Total length at hatching or birth (cm). */
  birthLengthCm: number;
  /** Age of sexual maturity (months). */
  maturityMonths: number;
  /** Optional von Bertalanffy K (per year). When absent, derived from maturityMonths. */
  growthK?: number;
  /** Typical lifespan in captivity (years). */
  lifespanYears: number;

  tempC: [number, number];
  ph: [number, number];
  /** General hardness range in dGH (freshwater) — optional. */
  dGH?: [number, number];
  minTankLiters: number;

  temperament: Temperament;
  zone: Zone;
  social: SocialType;
  /** Recommended minimum group size (1 for solitary). */
  groupSize: number;
  diet: Diet;
  activity: Activity;
  reproduction: Reproduction;
  locomotion: Locomotion;
  /** Typical relaxed cruising speed in body lengths per second. */
  cruiseSpeed: number;
  /** Escape / chase burst speed in body lengths per second. */
  burstSpeed: number;
  traits: Trait[];

  body: BodyPlan;
  look: Appearance;
  male?: SexOverride;
  female?: SexOverride;
  /** For color morphs / line-bred varieties: id of the wild-type species entry. */
  variantOf?: string;
  /** Availability in the hobby. */
  availability?: 'common' | 'uncommon' | 'rare';
}

// ---------------------------------------------------------------------------------------------
// Plants & corals (authored as JSON under src/data/plants/*.json)
// ---------------------------------------------------------------------------------------------

export type PlantForm =
  | 'rosette' // sword plants, crypts: leaves from a central crown
  | 'ribbon' // vallisneria, sagittaria: long strap leaves that reach and trail on the surface
  | 'stem' // rotala, ludwigia, bacopa: upright stems with paired/whorled leaves
  | 'fine-stem' // cabomba, hornwort, limnophila: feathery whorls
  | 'epiphyte-fern' // java fern, bolbitis: rhizome on wood/rock
  | 'epiphyte-broadleaf' // anubias, bucephalandra
  | 'carpet' // monte carlo, HC, glossostigma
  | 'grass' // dwarf hairgrass, eleocharis
  | 'moss' // java / christmas moss
  | 'floating' // frogbit, salvinia, red root floater, duckweed
  | 'lily' // tiger lotus, nymphaea: pads at surface
  | 'bulb' // aponogeton
  | 'ball' // marimo
  | 'macroalgae' // chaetomorpha, caulerpa, red ogo
  | 'seagrass'
  | 'soft-coral' // leathers, kenya tree, xenia
  | 'mushroom-coral'
  | 'zoanthid'
  | 'lps-coral' // hammer, torch, frogspawn, brain
  | 'sps-coral' // acropora, montipora
  | 'gorgonian'
  | 'anemone';

export interface PlantSpecies {
  id: string;
  commonName: string;
  scientificName: string;
  water: WaterType;
  form: PlantForm;
  placement: 'foreground' | 'midground' | 'background' | 'epiphyte' | 'floating';
  /** Main leaf/tissue color and secondary (tips, undersides, polyp color). */
  color: Color;
  color2?: Color;
  /** Mature height (or spread for carpets/floaters) in cm. */
  maxHeightCm: number;
  spreadCm: number;
  /** Typical growth in good conditions (cm/week of height, or of spread for carpets). */
  growthCmPerWeek: number;
  light: 'low' | 'medium' | 'high';
  /** Leaf geometry hints for the procedural generator. */
  leafLength?: number; // cm
  leafWidth?: number; // cm
  leafShape?: 'lanceolate' | 'ovate' | 'round' | 'needle' | 'strap' | 'feathery' | 'heart' | 'lobed';
  /** Whether fish that eat plants will eat this one (anubias/java fern: false). */
  palatable: boolean;
  description: string;
}

// ---------------------------------------------------------------------------------------------
// Decor
// ---------------------------------------------------------------------------------------------

export type DecorKind =
  | 'rock' // variants: seiryu, dragon-stone, lava, slate, river-stone, ohko, petrified-wood, texas-holey, live-rock
  | 'driftwood' // variants: spiderwood, mopani, manzanita, malaysian, cholla, branch
  | 'cave' // variants: slate-cave, coconut, clay-tube, rock-cave
  | 'pebbles' // a cluster of small stones
  | 'leaf-litter' // catappa / oak leaves on substrate
  | 'shell' // snail shells (shell-dwelling cichlids), conch
  | 'airstone' // produces a bubble stream
  | 'coral-skeleton'; // bleached dead coral rubble (marine)

export interface DecorItem {
  id: string;
  kind: DecorKind;
  variant: string;
  /** Seed for the procedural shape. Same seed → same shape. */
  seed: number;
  /** Position of the item's base (meters). y is usually the substrate height at x,z (minus burial). */
  position: [number, number, number];
  /** Euler XYZ in radians. */
  rotation: [number, number, number];
  /** Uniform scale relative to the variant's natural size. */
  scale: number;
}

export interface PlantInstance {
  id: string;
  speciesId: string;
  seed: number;
  position: [number, number, number];
  rotationY: number;
  /** Current size as a fraction of mature size (0.05 .. 1.0). Growth increases it; trimming reduces it. */
  growth: number;
  plantedAt: number; // sim ms
  /** If attached to a decor item (epiphytes), its id; position is then on that item's surface. */
  attachedTo?: string;
  /** Health 0..1 (light/nutrients/being eaten). */
  health: number;
}

// ---------------------------------------------------------------------------------------------
// Colliders (decor → behavior)
// ---------------------------------------------------------------------------------------------

export type Collider =
  | { type: 'sphere'; center: [number, number, number]; radius: number; ownerId: string; cover?: boolean }
  | { type: 'capsule'; a: [number, number, number]; b: [number, number, number]; radius: number; ownerId: string; cover?: boolean }
  | {
      type: 'box';
      center: [number, number, number];
      halfExtents: [number, number, number];
      /** Rotation around Y (radians). */
      rotationY: number;
      ownerId: string;
      cover?: boolean;
    };

/** A spot where shy/cave-dwelling animals can shelter (cave mouths, under wood, inside plant thickets). */
export interface CoverPoint {
  position: [number, number, number];
  radius: number;
  ownerId: string;
  kind: 'cave' | 'overhang' | 'plants' | 'crevice' | 'anemone' | 'burrow';
}

// ---------------------------------------------------------------------------------------------
// Food
// ---------------------------------------------------------------------------------------------

export type FoodKind =
  | 'flakes'
  | 'spirulina-flakes'
  | 'micro-pellets'
  | 'floating-pellets'
  | 'sinking-pellets'
  | 'algae-wafers'
  | 'bloodworms'
  | 'brine-shrimp'
  | 'daphnia'
  | 'mysis'
  | 'krill'
  | 'nori'
  | 'zucchini'
  | 'fruit-flies'
  | 'shrimp-pellets'
  | 'phytoplankton';

export interface FoodType {
  kind: FoodKind;
  name: string;
  description: string;
  /** How the food behaves in water. */
  buoyancy: 'floating' | 'slow-sinking' | 'sinking' | 'live-swimming' | 'suspended' | 'clip';
  /** Seconds it floats before starting to sink (floating foods). */
  floatSeconds: number;
  /** Terminal sinking speed m/s. */
  sinkSpeed: number;
  /** Particle size (m) — fish can only eat items smaller than ~mouth size (≈ 0.12 × length). */
  sizeM: number;
  /** Particles per "pinch". */
  particlesPerPinch: number;
  /** Satiation provided per particle for a 3 cm fish (scaled down for larger fish). */
  nutrition: number;
  /** Diet affinities 0..1 (how eagerly each diet eats it). Missing diet = 0. */
  affinity: Partial<Record<Diet, number>>;
  /** Visual style for the renderer. */
  shape: 'flake' | 'pellet' | 'stick' | 'wafer' | 'worm' | 'shrimp' | 'flea' | 'sheet' | 'slice' | 'insect' | 'cloud';
  color: Color;
  color2?: Color;
  /** Uneaten food decays after this many sim hours, adding ammonia. */
  decayHours: number;
  /** For live foods: swim speed m/s. */
  liveSpeed?: number;
}

export interface FoodParticle {
  id: number;
  kind: FoodKind;
  pos: [number, number, number];
  vel: [number, number, number];
  /** Orientation as euler (renderer only). */
  rot: [number, number, number];
  sizeM: number;
  /** Remaining nutrition (a big wafer can be nibbled by several fish). */
  nutrition: number;
  state: 'floating' | 'sinking' | 'settled' | 'swimming' | 'eaten';
  /** Real seconds since dropped. */
  age: number;
  /** Sim ms when it settled (for decay). */
  settledAtSim?: number;
  seed: number;
}

// ---------------------------------------------------------------------------------------------
// Animals (persisted state + runtime kinematics)
// ---------------------------------------------------------------------------------------------

export type Sex = 'male' | 'female' | 'unknown';

export interface FishState {
  id: string;
  speciesId: string;
  name?: string;
  sex: Sex;
  /** Sim ms of hatching/birth (may be in the past relative to addedAt for store-bought fish). */
  bornAt: number;
  addedAt: number;
  /** Current total length (cm). */
  lengthCm: number;
  /** Individual multiplier on asymptotic size (≈ N(1, 0.06)). */
  sizeFactor: number;
  /** Seed for individual pattern variation. */
  colorSeed: number;
  /** 0 = satiated .. 1 = starving. */
  hunger: number;
  /** 0 = dying .. 1 = perfect. */
  health: number;
  /** 0 calm .. 1 panicked (recent startle, aggression, poor water). */
  stress: number;
  /** Gut content 0..1 – fills when eating, empties over hours (drives satiation). */
  stomach: number;
  generation: number;
  parents?: [string, string] | [string];
  /** Breeding bookkeeping (sim ms). */
  lastSpawnAt?: number;
  gravidSince?: number;
  /** Last known position for continuity across reloads. */
  pos?: [number, number, number];
  heading?: number;
  /** Territory / home point (cave dwellers, territorial cichlids, anemone hosts). */
  home?: [number, number, number];
}

/** Per-frame motion + animation state written by behavior, read by the fish renderer. */
export interface FishKinematics {
  pos: [number, number, number];
  vel: [number, number, number];
  /** Unit forward direction of the body (snout direction). */
  forward: [number, number, number];
  /** Pitch & roll (radians) of the body; yaw is implied by `forward`. */
  pitch: number;
  roll: number;
  /** Current speed (m/s). */
  speed: number;
  /** Body-wave phase (radians, wraps) — advanced by behavior at tail-beat frequency. */
  tailPhase: number;
  /** Tail-beat amplitude 0..1 (0 = gliding/still, 1 = max effort). */
  tailAmp: number;
  /** Lateral body curvature from turning (−1 .. 1, positive = bending to the fish's left). */
  bend: number;
  /** Pectoral fin flutter phase & amplitude (hovering, braking). */
  finPhase: number;
  finAmp: number;
  /** Mouth open 0..1 (breathing / eating). */
  mouth: number;
  /** Gill (operculum) phase, radians. */
  gillPhase: number;
  /** 0..1 how much the fish is in its night/rest state (renderer may darken/fade pattern). */
  rest: number;
  /** Behavior label for debugging & the info card. */
  activity: string;
  /**
   * Optional body "up" vector (unit). Set for animals oriented to a surface (snails and plecos on
   * glass, shrimp on wood, upside-down catfish). When absent the renderer uses world up with
   * pitch/roll applied.
   */
  up?: [number, number, number];
  /** Optional: animal is attached to / walking on a surface (renderer may flatten fins, splay legs). */
  onSurface?: boolean;
}

/** A living animal at runtime: persisted state + derived species + transient kinematics. */
export interface FishEntity {
  state: FishState;
  species: Species;
  kin: FishKinematics;
  /** Behavior-system private memory. Other systems must not depend on its shape. */
  brain: Record<string, unknown>;
}

// ---------------------------------------------------------------------------------------------
// Tank
// ---------------------------------------------------------------------------------------------

export type SubstrateKind =
  | 'white-sand' | 'beige-sand' | 'black-sand' | 'river-sand' | 'fine-gravel' | 'pea-gravel'
  | 'aqua-soil' | 'black-gravel' | 'crushed-coral' | 'aragonite' | 'bare';

export type BackgroundKind = 'black' | 'deep-blue' | 'frosted' | 'gradient-blue' | 'dark-green' | 'clear';

export interface WaterParams {
  temperatureC: number;
  ph: number;
  /** mg/L (ppm) */
  ammonia: number;
  nitrite: number;
  nitrate: number;
  /** Specific gravity for marine/brackish (1.000 freshwater, ~1.025 reef). */
  salinitySG: number;
  gh: number;
  kh: number;
  /** Nitrifying bacteria population relative to what the current bioload needs (0 uncycled .. ≥1 fully cycled). */
  bacteria: number;
  /** Algae film on the glass 0..1. */
  glassAlgae: number;
  /** Algae on hardscape/plants 0..1. */
  surfaceAlgae: number;
  /** Tannin tint 0..1 (from driftwood, leaf litter). */
  tannins: number;
  /** Suspended particulates 0 crystal-clear .. 1 cloudy. */
  cloudiness: number;
  /** Dissolved oxygen relative to saturation 0..1. */
  oxygen: number;
  lastWaterChange: number; // sim ms
}

export interface Equipment {
  filter: { type: 'canister' | 'hang-on-back' | 'sponge' | 'internal' | 'sump'; flowLph: number; on: boolean };
  heater: { on: boolean; targetC: number };
  lights: {
    /** Hours (0–24, local sim time). */
    onHour: number;
    offHour: number;
    /** 0..1 */
    intensity: number;
    /** Kelvin of the main light (6500 typical planted, 12000+ reef blue). */
    colorTempK: number;
    moonlight: boolean;
    /** Minutes of sunrise/sunset ramp. */
    rampMinutes: number;
  };
  co2: boolean;
  autoFeeder: { enabled: boolean; food: FoodKind; hours: number[]; pinches: number };
}

export interface JournalEntry {
  at: number; // sim ms
  kind: 'added' | 'removed' | 'born' | 'died' | 'milestone' | 'care' | 'info' | 'warning';
  text: string;
  fishId?: string;
}

export interface TankSize {
  widthCm: number;
  heightCm: number;
  depthCm: number;
}

export interface TankState {
  version: 1;
  id: string;
  name: string;
  /** Real ms when created and last saved. */
  createdAt: number;
  lastSavedReal: number;
  /** Current sim clock (ms since epoch) and its speed multiplier. */
  simTime: number;
  timeScale: number;
  size: TankSize;
  water: WaterType;
  substrate: SubstrateKind;
  /** Substrate depth at the front and back glass (cm); a slope back-to-front is classic aquascaping. */
  substrateDepthFrontCm: number;
  substrateDepthBackCm: number;
  background: BackgroundKind;
  waterParams: WaterParams;
  equipment: Equipment;
  decor: DecorItem[];
  plants: PlantInstance[];
  fish: FishState[];
  journal: JournalEntry[];
  stats: { births: number; deaths: number; feedings: number; waterChanges: number };
  seed: number;
}

// ---------------------------------------------------------------------------------------------
// Settings, environment
// ---------------------------------------------------------------------------------------------

export type Quality = 'low' | 'medium' | 'high' | 'ultra';

/**
 * 'realistic' — natural lifespans, neglect has consequences (hunger, water quality, disease).
 * 'gentle'    — natural lifespans, but neglect only makes fish hungry/stressed, never kills.
 * 'zen'       — nobody dies, water stays healthy; pure aquarium watching.
 */
export type CareMode = 'realistic' | 'gentle' | 'zen';

export interface Settings {
  quality: Quality;
  sound: boolean;
  volume: number;
  uiAutoHide: boolean;
  showStats: boolean;
  cameraDrift: boolean;
  careMode: CareMode;
  units: 'metric' | 'imperial';
  /** Day/night follows the tank's sim clock (true) or is pinned to full daylight (false). */
  dayNight: boolean;
}

/** Derived every frame from the clock + equipment (see sim/environment.ts). */
export interface EnvState {
  /** Sim local hour 0..24 (fractional). */
  hour: number;
  /** Main light output 0..1 after ramps. */
  daylight: number;
  /** Moonlight output 0..1. */
  moonlight: number;
  /** Ambient room light leaking in 0..1 (time-of-day based). */
  roomLight: number;
  isNight: boolean;
  /** Linear RGB of the main light (from color temperature). */
  lightColor: [number, number, number];
  /** Water surface height (m). */
  surfaceY: number;
  /** Filter current: direction (unit, xz) and speed (m/s) at the outflow. */
  current: { dir: [number, number, number]; speed: number; origin: [number, number, number] };
  /** Water tint (linear RGB) — includes tannins & cloudiness. */
  waterTint: [number, number, number];
  /** Exponential fog density per meter (cloudiness/tannins increase it). */
  turbidity: number;
}
