/**
 * Plain-language descriptions of species data for the catalog. Written the way an experienced
 * keeper would describe an animal to a friend — accurate, specific, no jargon where avoidable.
 */
import type {
  Activity,
  CareMode,
  Diet,
  OrganismGroup,
  Reproduction,
  SocialType,
  Species,
  Temperament,
  Trait,
  Zone,
} from '../core/types';

export const TRAIT_PHRASES: Record<Trait, string> = {
  'tight-schooling': 'Swims in a tight, synchronized school',
  'surface-skimmer': 'Lives just beneath the surface',
  jumper: 'A known jumper — keep the tank covered',
  'glass-grazer': 'Rasps algae from the glass',
  'surface-grazer': 'Grazes algae from rock and wood',
  'sand-sifter': 'Sifts mouthfuls of sand for food',
  digger: 'Digs pits and rearranges the substrate',
  burrower: 'Burrows into soft substrate',
  'cave-dweller': 'Claims a cave and returns to it',
  shy: 'Shy — stays close to cover',
  bold: 'Bold — explores open water',
  hoverer: 'Hovers in place on gently sculling fins',
  'bottom-rester': 'Rests on the bottom between forays',
  perches: 'Perches on rocks, propped on its fins',
  hops: 'Moves in short hops along the bottom',
  clings: 'Clings to surfaces with a sucker mouth or fins',
  'air-gulper': 'Rises to gulp air at the surface',
  'fin-nipper': 'May nip long-finned tankmates',
  'plant-eater': 'Eats soft aquarium plants',
  'algae-eater': 'Eats algae',
  scavenger: 'Cleans up food that reaches the bottom',
  cleaner: 'Picks parasites from other fish',
  territorial: 'Defends a territory',
  'pair-bonding': 'Forms lasting pairs',
  'anemone-host': 'Shelters in a host anemone',
  'sand-sleeper': 'Sleeps buried in the sand',
  'mucus-cocoon': 'Sleeps inside a mucus cocoon',
  'night-coloration': 'Changes to a muted pattern at night',
  'oblique-swimmer': 'Swims at a head-up angle',
  'head-stander': 'Rests in a head-down posture',
  'upside-down': 'Often swims upside down',
  'wood-eater': 'Rasps and digests driftwood',
  ambush: 'An ambush hunter that waits motionless',
  drifter: 'Drifts like a fallen leaf',
  spitter: 'Shoots down insects with jets of water',
  flarer: 'Flares its gill covers at rivals',
  predator: 'Eats fish small enough to swallow',
  'invert-eater': 'Eats shrimp and snails',
  'coral-nipper': 'May nip coral polyps',
  'reef-safe': 'Safe with corals and most invertebrates',
  'nocturnal-hider': 'Hides by day and emerges at night',
  curious: 'Curious — investigates anything new',
  'sifter-of-detritus': 'Picks through detritus for food',
  molts: 'Sheds its exoskeleton as it grows',
  climbs: 'Climbs plants and decor',
};

export const DIET_PHRASES: Record<Diet, string> = {
  herbivore: 'Herbivore — mostly plant matter and algae',
  omnivore: 'Omnivore — a varied diet of small foods',
  carnivore: 'Carnivore — meaty foods',
  insectivore: 'Insectivore — insects and larvae',
  planktivore: 'Planktivore — tiny drifting animals',
  piscivore: 'Piscivore — eats other fish',
  detritivore: 'Detritivore — organic debris and biofilm',
  'algae-grazer': 'Grazer — algae and biofilm',
  'filter-feeder': 'Filter feeder — plankton strained from the water',
  scavenger: 'Scavenger — whatever settles on the bottom',
};

export const REPRO_PHRASES: Record<Reproduction, string> = {
  livebearer: 'Livebearer — gives birth to free-swimming fry about every four weeks',
  'egg-scatterer': 'Egg scatterer — eggs fall among plants, unguarded',
  'substrate-spawner': 'Substrate spawner — pairs clean a stone or leaf and guard the eggs',
  'cave-spawner': 'Cave spawner — eggs laid and guarded inside a cave',
  mouthbrooder: 'Mouthbrooder — eggs and fry are carried in a parent’s mouth',
  'bubble-nester': 'Bubble-nester — the male builds a floating nest of bubbles',
  'egg-depositor': 'Egg depositor — sticky eggs placed on glass or leaves',
  annual: 'Annual — eggs rest in the mud through the dry season',
  'pelagic-spawner': 'Open-water spawner — eggs drift away with the current',
  'demersal-spawner': 'Lays guarded eggs on rock or in a burrow',
  'pouch-brooder': 'The male carries the eggs in a brood pouch',
  'egg-carrier': 'Females carry the eggs under the tail until they hatch',
  none: 'Rarely bred in home aquaria',
};

export const ACTIVITY_LABELS: Record<Activity, string> = {
  diurnal: 'Active by day',
  nocturnal: 'Active at night',
  crepuscular: 'Most active at dawn and dusk',
};

export const ZONE_LABELS: Record<Zone, string> = {
  top: 'Near the surface',
  middle: 'Mid-water',
  bottom: 'Near the bottom',
  all: 'All levels',
};

export const ZONE_SHORT: Record<Zone, string> = { top: 'Top', middle: 'Middle', bottom: 'Bottom', all: 'All levels' };

export const TEMPERAMENT_LABELS: Record<Temperament, string> = {
  peaceful: 'Peaceful',
  'semi-aggressive': 'Semi-aggressive',
  aggressive: 'Aggressive',
  predatory: 'Predatory',
};

export const TEMPERAMENT_SHORT: Record<Temperament, string> = {
  peaceful: 'Peaceful',
  'semi-aggressive': 'Spirited',
  aggressive: 'Aggressive',
  predatory: 'Predator',
};

export const GROUP_LABELS: Record<OrganismGroup, { one: string; many: string }> = {
  fish: { one: 'Fish', many: 'Fish' },
  shrimp: { one: 'Shrimp', many: 'Shrimp' },
  snail: { one: 'Snail', many: 'Snails' },
  crab: { one: 'Crab', many: 'Crabs' },
  crayfish: { one: 'Crayfish', many: 'Crayfish' },
  starfish: { one: 'Starfish', many: 'Sea stars' },
  urchin: { one: 'Urchin', many: 'Urchins' },
};

export function socialPhrase(s: Pick<Species, 'social' | 'groupSize'>): string {
  const n = Math.max(1, s.groupSize);
  const map: Record<SocialType, string> = {
    school: `Schools — keep ${n} or more`,
    shoal: `Shoals — keep ${n} or more`,
    pair: 'Lives in pairs',
    harem: `One male with several females (groups of ${n})`,
    colony: `Lives in colonies of ${n} or more`,
    solitary: 'Solitary — best kept alone',
  };
  return map[s.social];
}

export const CARE_MODES: { value: CareMode; label: string; text: string }[] = [
  {
    value: 'realistic',
    label: 'Realistic',
    text: 'Natural lifespans. Neglect has real consequences — hunger, poor water and stress can take lives, and fry may be eaten.',
  },
  {
    value: 'gentle',
    label: 'Gentle',
    text: 'Natural lifespans, but neglect only makes animals hungry or stressed. Nobody dies from a missed week.',
  },
  {
    value: 'zen',
    label: 'Zen',
    text: 'The water stays healthy and nobody dies. Pure aquarium watching.',
  },
];

/** Phrase for a fish born in the tank: "fry" for fish, "young" for invertebrates. */
export function youngWord(group: OrganismGroup): string {
  if (group === 'fish') return 'fry';
  if (group === 'shrimp') return 'shrimplets';
  if (group === 'snail') return 'baby snails';
  return 'young';
}
