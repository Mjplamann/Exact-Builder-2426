# Living Aquarium — architecture & module contracts

A full-screen, ultra-realistic aquarium that runs in the browser (Vite + TypeScript + Three.js,
no UI framework). You look through the front glass of a real tank: light shafts and caustics
dance on sand, plants sway in the filter current, fish behave exactly like their wild
counterparts, and everything grows at its real biological rate. The keeper can stock it from a
catalog of thousands of real species, feed many kinds of food, arrange hardscape and plants, care
for the water, and watch the community evolve over weeks and months (or accelerate time).

**North star: realism and calm.** It should feel like sitting in front of a beautiful, healthy
tank at dusk — never like a game. Every number (sizes, speeds, growth, lifespans, chemistry)
comes from real natural history. When in doubt, choose subtle over flashy.

## Run & verify

```bash
npm run dev            # http://localhost:5173
npm run typecheck      # tsc (TypeScript 7 / tsgo, fast)
npm test               # vitest: data validation + sim unit tests
node scripts/screenshot.mjs --fresh --wait 6 --prefix mytest   # headless Chromium (SwiftShader WebGL) → .shots/mytest-0.png
node scripts/screenshot.mjs --hour 22 ...   # pin the tank clock (night); default 13:00
node scripts/screenshot.mjs --eval "window.__app.feed('flakes')" --wait 4
```

The screenshot script prints renderer stats and every console error; look at the PNG with your
image-reading tool. Software WebGL is slow (a few fps) — that is expected; judge visuals, not fps.
`window.__app` is the running `App` (see `src/app/App.ts`) for scripted checks; `__app.advance(seconds)`
steps the simulation without rendering so scenes can be staged quickly under slow software WebGL.

## Coordinates & units

- World units are **meters**. Tank interior: `x ∈ [-W/2, W/2]` (left→right), `y ∈ [0, H]`
  (glass floor → rim), `z ∈ [-D/2, D/2]` (back glass → front glass). Camera sits at `+z` looking
  toward `-z`. Water surface `y = H − 0.025` (`tankBounds().surfaceY`).
- Substrate surface height: `substrateHeight(tank, x, z)` in `src/core/tankGeometry.ts` —
  the single source of truth for the bottom (renderer, behavior, food, decor placement).
- Animal sizes in data are **cm total length**; `FishState.lengthCm` is the live length.
- Real time `dt` (s) drives animation/behavior/physics. Sim time (epoch ms, `world.clock.simTime`)
  advances `timeScale`× faster and drives biology & day/night. `LifeSim.update(world, simDt)`
  receives sim seconds.

## Module map & ownership

Every module has a fixed public API (the existing stub file). Implement behind it; you may add
files inside your folder and add *optional* parameters/fields, but do not change existing
signatures or another module's files. If you truly need a contract change, make the smallest
additive change in `src/core/types.ts` and say so in your report.

| Module | Files (owned) | Public API used by others |
|---|---|---|
| **core** (lead) | `src/core/*`, `src/app/*`, `src/main.ts`, `src/data/speciesIndex.ts`, `src/data/plantIndex.ts`, `src/data/validate.ts`, `src/data/foods.ts` | types, `World`, `EventBus`, `SimClock`, `Rng`, `tankGeometry`, `AppApi` |
| **environment** | `src/render/Engine.ts`, `src/render/underwater.ts`, `src/render/globals.ts`, `src/render/env/**` | `Engine` (scene, camera, `contents` group, `rayFromScreen`, `setFocus`, `nudgeView`, `rebuildTank`, `setQuality`), `applyUnderwater(material)`, `GLOBALS` uniforms |
| **fish rendering** | `src/render/fish/**` | `FishRenderer` (`sync`, `update`, `pick`, `setSelected`, `thumbnail`) |
| **behavior** | `src/behavior/**`, `src/render/food/**` | `BehaviorSystem` (`update`, `placeNewFish`, `startle`, `onEat`), `FoodSystem` (`drop`, `update`, `consume`, `onDecay`), `FoodRenderer` |
| **life sim** | `src/sim/**` (except `tankFactory.ts` is shared — extend carefully) | `LifeSim`, `computeEnv`, persistence |
| **decor** | `src/decor/**`, `src/render/decor/**`, `src/data/plants/*.json` | `DecorRenderer` (`sync`, `update`, `pick`, `setSelected`), `buildColliders`, `DECOR_CATALOG`, `AQUASCAPES` |
| **ui** | `src/ui/**`, `src/audio/**` | `UI`, `Ambience` |
| **species data** | `src/data/species/*.json` | validated by `tests/speciesData.test.ts` |

### Frame order (`App.frame`)
`clock.tick` → `computeEnv` → `LifeSim.update(simDt)` → `FoodSystem.update` → `BehaviorSystem.update`
→ `Engine.update` → `FishRenderer.update` → `DecorRenderer.update` → `FoodRenderer.update`
→ `Ambience.update` → `UI.update` → `Engine.render`.

### Events (`src/core/events.ts`)
`fish-added | fish-removed | fish-died | fish-born` → App calls `FishRenderer.sync`.
`decor-changed | plants-changed` → App rebuilds `world.colliders/cover` via `buildColliders`, then
`DecorRenderer.sync` and `BehaviorSystem.onEnvironmentChanged`.
`tank-reset` → everything rebuilds (App handles the renderer calls).
Modules may subscribe to events for their own needs (e.g. UI listens to `journal`, `notify`).

### Shaders & materials
- All lit scene materials (fish, plants, rocks, wood, substrate, food) are `MeshStandardMaterial`
  or `MeshPhysicalMaterial` and must call `applyUnderwater(material)` so caustics, depth light
  falloff and water absorption are consistent.
- Never assign `material.onBeforeCompile` directly — use `addShaderPatch(material, key, fn, order)`
  from `src/render/materialPatch.ts` (vertex deformation patches use negative `order`,
  `applyUnderwater` uses 100).
- Shared uniforms live in `GLOBALS` (`src/render/globals.ts`): `uTime`, `uDaylight`,
  `uMoonlight`, `uLightColor`, `uWaterTint`, `uTurbidity`, `uSurfaceY`, `uTankHalf`,
  `uCausticStrength`, `uCurrent`, `uCameraPos`. Reference the objects themselves in your
  material `uniforms` so one update reaches every material.
- Performance budget (real GPU, 1080p, "high"): 60 fps with ~300 animals, ~150 plants, ~40 decor
  items. Use instancing (per species / per plant type), share geometries/materials, avoid
  per-frame allocations, keep draw calls < ~400.

## The realism bar (applies to everyone)

- **Water**: you are looking *into* water. Light falls off with depth; distant objects pick up a
  blue-green (or tannin-amber) veil; caustics ripple across upward-facing surfaces; soft god rays
  slant from the surface; tiny suspended motes drift; the underside of the surface shimmers with
  total internal reflection; the substrate meets the glass cleanly.
- **Fish**: correct proportions per species, translucent fins with rays, wet specular sheen,
  guanine silver/iridescence where real, bright eyes with a catch-light. Swimming is a traveling
  body wave whose envelope matches the locomotion mode; tail-beat frequency follows speed
  (Bainbridge: `U/L ≈ 0.75·f − 1`, capped ≤ ~14 Hz), fish glide between beats, bank in turns, keep nearly level
  (pitch rarely > 25°), hover with pectoral sculling, breathe (gill/mouth motion).
- **Behavior**: shoals that are loose when calm and tighten when frightened; schooling species
  polarize; bottom dwellers forage in bursts and rest; plecos cling to glass and wood; gobies
  perch and hop; territorial fish patrol and chase briefly (no carnage); diurnal fish rest near
  the bottom/plants at night with colors faded; nocturnal fish emerge at night; everybody reacts to
  food with species-appropriate enthusiasm and feeding zone; startle → C-start escape, then calm.
- **Biology**: growth on von Bertalanffy curves at real rates; hunger, satiation and digestion in
  hours; fish age and eventually die at natural lifespans (care mode permitting); livebearers drop
  fry ~every 4 weeks; shrimp colonies grow; plants grow cm/week and need trimming; algae creeps
  onto glass over days; the nitrogen cycle responds to bioload, feeding and water changes.
- **Calm UI**: the tank fills the screen; controls fade away when the mouse is still; nothing
  flashes; notifications are gentle.

## Data formats
- Species: `Species` in `src/core/types.ts`; authored JSON arrays in `src/data/species/*.json`;
  see `docs/SPECIES_AUTHORING.md`.
- Plants & corals: `PlantSpecies`; JSON arrays in `src/data/plants/*.json`.
- Foods: `src/data/foods.ts`. Decor: `src/decor/catalog.ts`.
