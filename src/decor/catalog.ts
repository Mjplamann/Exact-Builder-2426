import type { DecorKind, WaterType } from '../core/types';

export interface DecorVariant {
  kind: DecorKind;
  variant: string;
  name: string;
  description: string;
  /** Which tanks it suits. */
  water: WaterType[];
  /** Natural footprint (m) at scale 1 — used for placement spacing and UI. */
  size: number;
  /** Adds tannins over time (driftwood, leaf litter). */
  tannins?: number;
  /** Raises pH/KH over time (limestone, coral, holey rock). */
  buffersPh?: boolean;
  /** Typical height (m) at scale 1 (UI hints, placement). Defaults to ~0.6 × size. */
  height?: number;
  /** Offers shelter (caves, shells) — UI hint for shy / cave-spawning fish. */
  shelter?: boolean;
}

const FW: WaterType[] = ['freshwater'];
const FW_BR: WaterType[] = ['freshwater', 'brackish'];
const ALL: WaterType[] = ['freshwater', 'brackish', 'marine'];
const MARINE: WaterType[] = ['marine'];
const BR_MAR: WaterType[] = ['brackish', 'marine'];

/**
 * Everything a keeper can place. Every entry here has a procedural generator in
 * `src/decor/shapes.ts` (shape + colliders) and `src/render/decor/*` (mesh + material).
 *
 * Sizes are real hobby-trade sizes; "tannins" is a relative leaching rate (0..1) and
 * "buffersPh" marks calcareous materials that dissolve slowly and raise KH/pH.
 */
export const DECOR_CATALOG: DecorVariant[] = [
  // --- Rocks ------------------------------------------------------------------------------
  {
    kind: 'rock', variant: 'seiryu', name: 'Seiryu stone', water: ALL, size: 0.16, height: 0.13, buffersPh: true,
    description: 'Blue-grey limestone from China with sharp, weathered ridges and white calcite veins — the classic Iwagumi stone. Slowly raises hardness.',
  },
  {
    kind: 'rock', variant: 'dragon-stone', name: 'Dragon stone (Ohko)', water: FW_BR, size: 0.18, height: 0.13,
    description: 'Clay-brown, crusty hardened clay riddled with deep holes and pockets. Chemically inert and light for its size; mosses love it.',
  },
  {
    kind: 'rock', variant: 'lava', name: 'Lava rock', water: ALL, size: 0.12, height: 0.08,
    description: 'Porous red-black volcanic scoria. Its pitted surface is a huge home for nitrifying bacteria and an easy anchor for plant roots.',
  },
  {
    kind: 'rock', variant: 'slate', name: 'Slate', water: ALL, size: 0.2, height: 0.08,
    description: 'Dark, layered metamorphic rock that splits into flat plates — perfect for terraces, ledges and spawning sites. Inert.',
  },
  {
    kind: 'rock', variant: 'river-stone', name: 'River stone', water: ALL, size: 0.1, height: 0.05,
    description: 'Smooth, water-worn cobble in natural grey, tan and brown tones. Safe and inert; ideal for goldfish and hillstream setups.',
  },
  {
    kind: 'rock', variant: 'texas-holey', name: 'Texas holey rock', water: ['freshwater', 'brackish', 'marine'], size: 0.2, height: 0.12, buffersPh: true,
    description: 'Cream-coloured, eroded limestone shot through with tunnels and holes. Buffers pH and hardness — the classic African rift-lake rock.',
  },
  {
    kind: 'rock', variant: 'petrified-wood', name: 'Petrified wood', water: FW_BR, size: 0.18, height: 0.1,
    description: 'Fossil wood turned to stone: the grain, growth rings and bark texture survive in ochre, brown and grey silica. Inert.',
  },
  {
    kind: 'rock', variant: 'elephant-skin', name: 'Elephant skin stone', water: FW, size: 0.16, height: 0.11,
    description: 'Grey-brown stone with a deeply wrinkled, cracked surface like an elephant’s hide. Inert and dramatic in nature scapes.',
  },
  {
    kind: 'rock', variant: 'frodo', name: 'Frodo stone', water: FW, size: 0.15, height: 0.11,
    description: 'Rugged, layered brown-grey stone with rusty ochre seams and sharp ledges. Inert — a warm alternative to seiryu.',
  },
  {
    kind: 'rock', variant: 'live-rock', name: 'Live rock', water: MARINE, size: 0.26, height: 0.16, buffersPh: true,
    description: 'Porous reef rock encrusted with purple and pink coralline algae, sponges and tiny life — the biological filter and foundation of a reef.',
  },

  // --- Driftwood --------------------------------------------------------------------------
  {
    kind: 'driftwood', variant: 'spiderwood', name: 'Spider wood', water: FW_BR, size: 0.4, height: 0.28, tannins: 0.35,
    description: 'Fine, twisting root wood (Rhododendron) that branches into a delicate canopy. Grows a harmless white biofilm at first.',
  },
  {
    kind: 'driftwood', variant: 'mopani', name: 'Mopani wood', water: FW_BR, size: 0.3, height: 0.16, tannins: 0.25,
    description: 'Dense, sandblasted two-tone hardwood from southern Africa — dark heartwood and pale sapwood with smooth hollows. Sinks immediately.',
  },
  {
    kind: 'driftwood', variant: 'manzanita', name: 'Manzanita', water: FW_BR, size: 0.45, height: 0.34, tannins: 0.12,
    description: 'Smooth, reddish-brown tree branches with elegant forking — a miniature underwater forest. Very few tannins.',
  },
  {
    kind: 'driftwood', variant: 'malaysian', name: 'Malaysian driftwood', water: FW_BR, size: 0.32, height: 0.16, tannins: 0.6,
    description: 'Heavy, dark, deeply grooved hardwood that releases plenty of tannins — perfect for blackwater biotopes.',
  },
  {
    kind: 'driftwood', variant: 'redmoor-root', name: 'Redmoor root', water: FW_BR, size: 0.42, height: 0.3, tannins: 0.4,
    description: 'Reddish, finely branching heather root that reaches upward like a tree crown. Light and airy.',
  },
  {
    kind: 'driftwood', variant: 'cholla', name: 'Cholla wood', water: FW_BR, size: 0.24, height: 0.06, tannins: 0.1,
    description: 'Hollow skeleton of the cholla cactus with a lattice of holes — loved by shrimp, plecos and biofilm grazers.',
  },
  {
    kind: 'driftwood', variant: 'branchwood', name: 'Branch wood', water: FW_BR, size: 0.5, height: 0.3, tannins: 0.35,
    description: 'Long, slender weathered branches like the fallen wood of Amazonian igarapés. Arch them for a flooded-forest look.',
  },

  // --- Caves -------------------------------------------------------------------------------
  {
    kind: 'cave', variant: 'slate-cave', name: 'Slate cave', water: ALL, size: 0.2, height: 0.09, shelter: true,
    description: 'Flat slate plates stacked into a low tunnel — a natural spawning cave for cichlids and a hideout for loaches.',
  },
  {
    kind: 'cave', variant: 'coconut', name: 'Coconut hut', water: FW_BR, size: 0.12, height: 0.06, shelter: true, tannins: 0.05,
    description: 'Half a coconut shell with a doorway — a cosy cave for dwarf cichlids, shrimp and small catfish.',
  },
  {
    kind: 'cave', variant: 'clay-tube', name: 'Pleco cave', water: FW_BR, size: 0.17, height: 0.05, shelter: true,
    description: 'Fired terracotta tube closed at the back — the preferred breeding cave of bristlenose and other plecos.',
  },
  {
    kind: 'cave', variant: 'rock-cave', name: 'Rock cave', water: ALL, size: 0.22, height: 0.12, shelter: true,
    description: 'A natural stone arch with a tunnel at its base for shy fish to slip into.',
  },

  // --- Small decor -------------------------------------------------------------------------
  {
    kind: 'pebbles', variant: 'river', name: 'River pebbles', water: ALL, size: 0.16, height: 0.025,
    description: 'A scatter of rounded natural pebbles in mixed earth tones.',
  },
  {
    kind: 'pebbles', variant: 'black', name: 'Black pebbles', water: ALL, size: 0.14, height: 0.02,
    description: 'Smooth, dark basalt pebbles that make bright fish and green carpets glow.',
  },
  {
    kind: 'leaf-litter', variant: 'catappa', name: 'Catappa leaves', water: FW_BR, size: 0.26, height: 0.02, tannins: 0.8,
    description: 'Dried Indian almond leaves. They curl, soften and slowly stain the water amber with antifungal tannins.',
  },
  {
    kind: 'leaf-litter', variant: 'oak', name: 'Oak leaves', water: FW, size: 0.2, height: 0.015, tannins: 0.45,
    description: 'Dry lobed oak leaves — a natural carpet of leaf litter for shrimp to graze and fry to hide in.',
  },
  {
    kind: 'leaf-litter', variant: 'guava', name: 'Guava leaves', water: FW, size: 0.2, height: 0.015, tannins: 0.4,
    description: 'Leathery guava leaves that break down slowly, feeding biofilm and tinting the water.',
  },
  {
    kind: 'shell', variant: 'escargot', name: 'Escargot shells', water: ['freshwater', 'brackish'], size: 0.12, height: 0.035, shelter: true, buffersPh: true,
    description: 'Empty snail shells — homes and spawning sites for shell-dwelling Tanganyikan cichlids such as Neolamprologus multifasciatus.',
  },
  {
    kind: 'shell', variant: 'conch', name: 'Conch shell', water: BR_MAR, size: 0.18, height: 0.08, shelter: true, buffersPh: true,
    description: 'A large queen conch shell with a flared, pink-lipped aperture.',
  },
  {
    kind: 'airstone', variant: 'cylinder', name: 'Air stone', water: ALL, size: 0.035, height: 0.03,
    description: 'A small cylinder of fused silica that releases a curtain of fine bubbles which ripple the surface.',
  },
  {
    kind: 'airstone', variant: 'disc', name: 'Air disc', water: ALL, size: 0.08, height: 0.015,
    description: 'A flat diffuser disc that sends up a wide column of fine bubbles.',
  },
  {
    kind: 'airstone', variant: 'bar', name: 'Air bar', water: ALL, size: 0.2, height: 0.015,
    description: 'A long bar diffuser that lays a wall of bubbles along the back glass.',
  },
  {
    kind: 'coral-skeleton', variant: 'rubble', name: 'Coral rubble', water: MARINE, size: 0.22, height: 0.05, buffersPh: true,
    description: 'Bleached fragments of branching coral skeleton — natural reef-flat rubble where jawfish build burrows.',
  },
];

/** Lookup a catalog entry (falls back to the first entry of the kind, then a generic stub). */
export function catalogEntry(kind: DecorKind, variant: string): DecorVariant {
  return (
    DECOR_CATALOG.find((d) => d.kind === kind && d.variant === variant) ??
    DECOR_CATALOG.find((d) => d.kind === kind && variant === 'ohko' && d.variant === 'dragon-stone') ??
    DECOR_CATALOG.find((d) => d.kind === kind) ??
    DECOR_CATALOG[0]
  );
}

/** Variants suited to a water type. */
export function catalogFor(water: WaterType): DecorVariant[] {
  return DECOR_CATALOG.filter((d) => d.water.includes(water));
}
