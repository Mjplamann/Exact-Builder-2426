import type { FishEntity, FoodParticle } from '../core/types';
import { FastRng } from './math';
import { paramsFor, type SpeciesParams } from './params';

/**
 * Behavior modes. Each maps to a steering routine in behaviors.ts and to a human-readable
 * activity label (kin.activity) for the info card.
 */
export type Mode =
  | 'cruise' // free swimming within the zone
  | 'shoal' // shoaling / schooling with conspecifics
  | 'hover' // station holding near cover (gouramis, angels, rams)
  | 'forage' // bottom foraging bursts, sand sifting, picking at plants
  | 'rest' // night rest / resting between forays
  | 'hide' // sheltering in cover (shy, nocturnal by day, after a fright)
  | 'flee' // C-start escape
  | 'feed' // approaching & biting food
  | 'gulp' // dart to the surface for air
  | 'patrol' // territorial patrol around home
  | 'chase' // short chase / nip / display at an intruder
  | 'investigate' // curious fish at the front glass
  | 'flare' // betta flaring
  | 'clean' // cleaner servicing a client
  | 'stalk' // predator fixating on a tankmate (never eats it here)
  | 'graze' // clinging to glass/wood/rock and rasping algae
  | 'perch' // sitting on a rock (gobies, blennies, hawkfish)
  | 'hop' // short hop between perches
  | 'bury' // buried in the sand (sand-sleepers at night, burrowers by day)
  | 'ambush' // motionless lurking predator / leaf mimic
  | 'explore' // new arrival exploring cautiously
  // invertebrates
  | 'walk'
  | 'pick'
  | 'swim'
  | 'tailflip'
  | 'retract'
  | 'fall';

/** What the animal is attached to. */
export const SURF_NONE = 0;
export const SURF_SUBSTRATE = 1;
export const SURF_GLASS = 2;
export const SURF_DECOR = 3;
export const SURF_PLANT = 4;

/**
 * Per-animal behavior memory. One instance per FishEntity, stored at `fish.brain.behavior`.
 * Monomorphic (all fields initialized in the constructor) so V8 keeps property access fast.
 */
export class Brain {
  p: SpeciesParams;
  rng: FastRng;
  /** Live length (m) and a few size-derived limits refreshed every frame. */
  L = 0.04;
  turnMax = 4;
  accel = 0.1;
  accelBurst = 2;
  tailHzMax = 12;
  /** Individual temperament jitter (0.85..1.15). */
  pace = 1;
  boldness = 0.5;

  // --- decision ---------------------------------------------------------------------------
  mode: Mode = 'cruise';
  modeT = 0;
  modeDur = 10;
  thinkT = 0;
  /** Sub-state within a mode (approach / act / leave…) and its timer & planned duration. */
  sub = 0;
  subT = 0;
  subDur = 0;
  /** Rest flavour (RK_* in behaviors.ts). */
  restKind = 0;
  /** Human-readable activity for kin.activity. */
  label = 'cruising';
  /** Index into world.fish this frame. */
  idx = 0;

  // --- desired motion (written by steering, read by locomotion) ------------------------------
  dx = 1;
  dy = 0;
  dz = 0;
  /** Desired speed (m/s, ≥ 0). */
  ds = 0;
  /** Body-pitch offset target (posture) and travel-pitch limit for the current mode. */
  posture = 0;
  pitchLimit = 0.44;
  /** Turn-rate / acceleration boosts (C-start, strikes). */
  turnBoost = 1;
  accelBoost = 1;
  /** Hold station: hover with fins instead of beat-and-glide. */
  hold = false;
  /** Allowed to back up (gymnotiform / labriform close to target). */
  reverse = false;
  /** Allow the body close to the surface (surface feeding / air gulp) or the floor (resting). */
  surfaceOk = false;
  floorOk = false;
  /** Owner id of the shelter we may slip inside (ignore its colliders). */
  shelterOwner: string | undefined = undefined;
  /** Allowed close to the glass (investigating the viewer, grazing). */
  glassOk = false;
  /** 0..1 how deep the animal has dug into the substrate (sand-sleepers, burrowers). */
  buried = 0;
  /** Client posing for a cleaner (s). */
  pose = 0;

  // --- locomotion state ----------------------------------------------------------------------
  yaw = 0;
  pitch = 0;
  bodyPitch = 0;
  yawRate = 0;
  speed = 0;
  roll = 0;
  bend = 0;
  beating = true;
  beatT = 0;
  vx = 0;
  vy = 0;
  vz = 0;
  tailAmp = 0;
  finAmp = 0;
  /** Smoothed effort 0..1 (thrust demand). */
  effort = 0;

  // --- goal / wander ----------------------------------------------------------------------------
  gx = 0;
  gy = 0;
  gz = 0;
  hasGoal = false;
  prefH = 0.5;
  prefHTarget = 0.5;
  noiseSeed = 0;
  wanderT = 0;

  // --- social ----------------------------------------------------------------------------------
  anchor = 0;
  offX = 0;
  offY = 0;
  offZ = 0;
  partner: FishEntity | null = null;
  partnerCheckT = 0;
  /** Distance to nearest conspecific last frame (m). */
  nnDist = 1;
  /** Count of conspecific neighbors last frame. */
  nnCount = 0;
  /** Independent excursion timer (shoal members wander off briefly). */
  soloT = 0;

  // --- fear / stress --------------------------------------------------------------------------
  fear = 0;
  fleeT = 0;
  fleeDelay = 0;
  fleeX = 0;
  fleeY = 0;
  fleeZ = 0;
  /** Amount this system added to state.stress (removed again as it decays). */
  stressAdded = 0;
  /** Seconds since arrival (new fish explore cautiously). */
  age = 0;

  // --- feeding ---------------------------------------------------------------------------------
  food: FoodParticle | null = null;
  biteT = 0;
  scanT = 0;
  excite = 0;
  chewT = 0;
  snap = 0;
  /** Nibbling a big item: hold here. */
  nibbling = false;

  // --- rest ------------------------------------------------------------------------------------
  rest = 0;
  restInit = false;
  /** Length (cm) the size-derived limits were computed for. */
  sizeFor = -1;

  // --- home / cover ------------------------------------------------------------------------------
  coverIdx = -1;
  coverVersion = -1;
  /** Perch index (Habitat.perches) in use, or −1. */
  perchIdx = -1;

  // --- surface attachment -------------------------------------------------------------------------
  surf = SURF_NONE;
  /** Wall index (glass) or collider index (decor). */
  surfIdx = -1;
  nx = 0;
  ny = 1;
  nz = 0;
  up: [number, number, number] = [0, 1, 0];
  /** Shuffle (move) / pause timers for slow surface movers. */
  moveT = 0;
  pauseT = 0;
  /** Target on surfaces (walkers/crawlers/clingers). */
  sx = 0;
  sy = 0;
  sz = 0;
  hasSurfTarget = false;
  /** Fall velocity for dropped snails. */
  fallV = 0;
  /** Surface the animal is heading for (SURF_*) and its wall/collider index. */
  goalSurf = 0;
  goalSurfIdx = -1;

  // --- trait timers --------------------------------------------------------------------------------
  airT = 0;
  nipT = 0;
  flareT = 0;
  curiousT = 0;
  cleanT = 0;
  forageT = 0;
  perchT = 0;
  target: FishEntity | null = null;
  displayT = 0;
  /** Territorial chase cooldown (s). */
  chaseCool = 0;
  /** Extra fin flare (flaring betta, territorial display) 0..1. */
  flare = 0;

  // --- animation phases -------------------------------------------------------------------------
  gaitPhase = 0;
  /** Smoothed mouth breathing amplitude. */
  breath = 0.15;

  constructor(fish: FishEntity) {
    this.p = paramsFor(fish.species);
    this.rng = new FastRng((fish.state.colorSeed ^ 0x2545f491) >>> 0);
    this.noiseSeed = (fish.state.colorSeed * 2654435761) | 0;
    this.pace = 0.85 + this.rng.next() * 0.3;
    this.boldness = Math.min(0.98, Math.max(0.02, this.p.boldness + this.rng.signed() * 0.12));
    const f = fish.kin.forward;
    this.yaw = Math.atan2(f[2], f[0]);
    this.prefH = this.p.zoneLo + (this.p.zoneHi - this.p.zoneLo) * this.rng.next();
    this.prefHTarget = this.prefH;
    this.thinkT = this.rng.next() * 0.4;
    this.airT = this.rng.range(20, 200);
    this.nipT = this.rng.range(30, 120);
    this.flareT = this.rng.range(15, 60);
    this.curiousT = this.rng.range(10, 60);
    this.cleanT = this.rng.range(10, 40);
    this.soloT = this.rng.range(10, 40);
    this.wanderT = 0;
    this.offX = this.rng.signed();
    this.offY = this.rng.signed() * 0.5;
    this.offZ = this.rng.signed();
    this.age = 1000; // existing residents are settled; placeNewFish resets this for arrivals
  }
}

/** The behavior brain of an entity (created on first use). */
export function brainOf(fish: FishEntity): Brain {
  let b = fish.brain.behavior as Brain | undefined;
  if (!b || b.p.species !== fish.species) {
    b = new Brain(fish);
    fish.brain.behavior = b;
  }
  return b;
}

/** Human-readable label for a mode, refined by context in behaviors.ts. */
export const MODE_LABEL: Record<Mode, string> = {
  cruise: 'cruising',
  shoal: 'shoaling',
  hover: 'hovering',
  forage: 'foraging',
  rest: 'resting',
  hide: 'hiding',
  flee: 'fleeing',
  feed: 'feeding',
  gulp: 'gulping air',
  patrol: 'patrolling',
  chase: 'chasing',
  investigate: 'investigating',
  flare: 'flaring',
  clean: 'cleaning',
  stalk: 'stalking',
  graze: 'grazing',
  perch: 'perched',
  hop: 'hopping',
  bury: 'buried',
  ambush: 'lurking',
  explore: 'exploring',
  walk: 'walking',
  pick: 'picking',
  swim: 'swimming',
  tailflip: 'tail-flip escape',
  retract: 'retracted',
  fall: 'falling',
};
