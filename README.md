# Living Aquarium

A full-screen, ultra-realistic aquarium for the browser. Look through the front glass of a real
tank: light shafts and caustics on the sand, plants swaying in the filter current, and animals
that swim, school, forage, hide, sleep, breed and grow at their natural rates.

- **2,719 real species** (freshwater, brackish and marine fish, shrimp, snails, crabs, crayfish,
  starfish and urchins), each written up from natural history and independently fact-checked —
  sizes, lifespans, growth, water needs, temperament, diet, behavior traits and appearance.
- **Procedural animals** built from each species' body plan and markings, with swimming that
  follows its real locomotion mode (tail-beat frequency from speed, glides, banking, hovering).
- **Behavior**: shoals and schools, territories, hovering, glass grazing, sand sifting,
  perching, burrowing, night rest, nocturnal forays, feeding by zone and mouth size, startle
  escapes.
- **Biology on a sim clock**: von Bertalanffy growth, digestion, health and stress, aging,
  livebearer broods and shrimp colonies, the nitrogen cycle, pH/KH, oxygen, algae, plant and
  coral growth, offline catch-up. Time can run at 1×, 1 min = 1 hour, day or week.
- **Keeping**: 16 foods, 33 hardscape pieces, 142 plants and corals, nine ready-made aquascapes,
  an aquascape editor, water tests and care, compatibility advice, a journal.
- Calm, auto-hiding interface that works on desktop and phones (iPhone safe areas, touch).

## Run

```bash
npm install
npm run dev            # http://localhost:5173
npm test               # data validation, simulation, behavior, rendering and UI tests
npm run build          # typecheck + production build (dist/)
npm run build:artifact # single-file page for sharing (dist-artifact/living-aquarium.html)
node scripts/screenshot.mjs --prefix look --hour 13   # headless visual check → .shots/
node scripts/smoke.mjs                                 # end-to-end feature smoke test
```

The tank saves itself in the browser (and, when opened as a claude.ai page, privately to your
account). Settings → Export / Import moves a tank between devices.

See `docs/ARCHITECTURE.md` for the module map and `docs/SPECIES_AUTHORING.md` for the species
data format.
