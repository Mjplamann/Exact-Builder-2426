# Authoring species data

Each file in `src/data/species/` is a JSON array of `Species` objects (`src/core/types.ts`).
`src/data/species/reference.json` holds hand-checked examples — copy their style. Validate with:

```bash
SPECIES_FILE=<file-name-without-.json> npx vitest run tests/speciesData.test.ts
npx vitest run tests/speciesData.test.ts          # all files (also checks id uniqueness across files)
```

## Accuracy rules (most important)

1. **Only real species** (and real, named trade morphs/line-bred varieties). Never invent a
   species, a scientific name, or a common name. Use the currently accepted scientific name
   (e.g. `Hoplisoma`/`Corydoras` — prefer the name most hobbyists and FishBase use today; put the
   other in the description if it helps). If you are not confident a species exists and is kept
   in aquaria/public aquaria, leave it out.
2. Numbers are from natural history (FishBase, SeriouslyFish, aquarium literature). Use the
   **typical adult total length reached in aquaria** (often smaller than the wild record).
   `lifespanYears` = typical captive lifespan. `maturityMonths` = typical age at maturity.
   `birthLengthCm` = length at hatching (most egg-layers 0.2–0.5 cm; livebearer fry 0.5–1 cm;
   mouthbrooder fry released ~1 cm; big catfish/arowana larger). Growth K is derived
   automatically from maturity — only set `growthK` when you know a published value.
3. `tempC`, `ph`, `dGH`, `minTankLiters`: realistic husbandry ranges (marine pH 8.0–8.4).
4. `cruiseSpeed`/`burstSpeed` are **body lengths per second**. Relaxed aquarium cruising:
   small tetras/rasboras 1–2, danios 2–3, cichlids/gouramis 0.4–1, plecos/corydoras 0.3–0.8,
   tangs 0.8–1.2, seahorses 0.05–0.15, snails 0.03–0.08, shrimp walking 0.2–0.4.
   Bursts: small fish 8–15, medium 5–10, large/slow 3–6.
5. `description`: 1–2 sentences of true, specific natural history (habitat, a distinctive
   behavior, breeding). No marketing fluff, no care sheet.
6. `traits`: only from the `Trait` union. Pick the 2–6 that most define how it *behaves*.
7. Morphs/varieties (guppy strains, betta tail types/colors, goldfish breeds, discus strains,
   angelfish colors, platy/molly/swordtail colors, Neocaridina colors, koi varieties, GloFish are
   OK as they are real products) get their own entry with `variantOf` = the wild-type id (which
   must also exist), same biology, different `look`/`body`.
8. ids: kebab-case scientific name (`paracheirodon-innesi`); morphs append the variety
   (`betta-splendens-halfmoon-red`); undescribed trade species use the trade code
   (`corydoras-sp-cw010`, `hypancistrus-sp-l066`). ids must be globally unique.

## Body plan

`body.archetype` selects a renderer preset (proportions, fins, cross-section). Override only
what differs for this species. All proportions are relative to body length (snout → tail base).

| Archetype | Use for |
|---|---|
| tetra | typical small characins (Hyphessobrycon, Hemigrammus, Paracheirodon, Moenkhausia…) — adipose fin |
| pencilfish | Nannostomus — slender, small mouth, tiny fins |
| hatchetfish | Gasteropelecidae / Thoracocharax — deep keel chest, straight back, surface |
| headstander | Anostomidae, Chilodus, Abramites — elongate, small terminal/upturned mouth |
| piranha / pacu | Serrasalmidae — deep, compressed, blunt; silver dollars use `pacu` (or override) |
| barb | Puntius, Pethia, Barbodes, Puntigrus, Oreichthys… |
| danio | Danio, Devario, Brachydanio — slender, active, barbels |
| rasbora | Rasbora, Trigonostigma, Boraras, Microdevario, Sundadanio |
| minnow | White Clouds, Notropis, Pimephales, Phoxinus — generic small cyprinid |
| shark-minnow | Epalzeorhynchos, Balantiocheilos, Labeo — torpedo, high dorsal, forked tail |
| carp / koi / goldfish / fancy-goldfish | Cyprinus/Carassius; fancy goldfish: short round body, double tails |
| loach / botia / hillstream-loach / kuhli / algae-eater | Nemacheilidae & Cobitidae / Botiidae / Balitoridae, Gastromyzon / Pangio / Gyrinocheilus, Crossocheilus |
| cichlid | general medium cichlids (acaras, severums, firemouth, convicts, Central Americans) |
| dwarf-cichlid | Apistogramma, Mikrogeophagus, Nannacara, Pelvicachromis, shell-dwellers |
| discus / angelfish / oscar / mbuna / frontosa / geophagus | as named (mbuna = Malawi rock cichlids; also use for Tropheus; `frontosa` has nuchal hump; `geophagus` for eartheaters incl. Satanoperca) |
| gourami / betta / paradise-fish / snakehead | Osphronemidae (gouramis, Trichogaster, Sphaerichthys, Parosphromenus use gourami) / Betta spp. / Macropodus, Belontia / Channa |
| corydoras / pleco / otocinclus / catfish / synodontis / glass-catfish / banjo-catfish / shark-catfish | Callichthyidae / Loricariidae large / Hypoptopomatinae / generic naked catfish (Pimelodidae, Bagridae, Auchenipteridae…) / Mochokidae / Kryptopterus / Aspredinidae / Pangasiidae |
| livebearer / molly / swordtail / halfbeak | Poecilia reticulata, platies, Endlers, Heterandria, Goodeidae / Poecilia sphenops, latipinna / Xiphophorus hellerii / Hemiramphidae |
| killifish / rainbowfish / blue-eye / ricefish | Nothobranchius, Aphyosemion, Aplocheilus, Fundulus… / Melanotaenia, Glossolepis, Iriatherina / Pseudomugil / Oryzias |
| puffer / goby / sleeper / spiny-eel / eel / knifefish / elephantnose / bichir / arowana / gar | freshwater puffers / FW & brackish gobies (Stiphodon, Rhinogobius, bumblebee) / Eleotridae (peacock gudgeon) / Mastacembelidae / Anguillidae & fire eels use spiny-eel / Apteronotidae, Notopteridae / Mormyridae / Polypteridae / Osteoglossidae / Lepisosteidae |
| archerfish / glassfish / leaffish / badis / butterflyfish-fw / stingray / needlefish / scat / mono | Toxotes / Ambassidae (Parambassis) / Nandidae, Polycentridae, Monocirrhus / Badis, Dario / Pantodon / Potamotrygonidae / Xenentodon / Scatophagus / Monodactylus |
| sunfish / perch / stickleback / pike / lungfish | Centrarchidae / Percidae, darters, Datnioides / Gasterosteidae / Esocidae / Protopterus |
| clownfish / damselfish / chromis / anthias / basslet / dottyback / cardinalfish / hawkfish | as named (`basslet` = Gramma, Serranocirrhitus, Liopropoma; `cardinalfish` = Pterapogon, Sphaeramia) |
| tang / rabbitfish / marine-angel / dwarf-angel / butterflyfish / moorish-idol | Acanthuridae / Siganidae / large Pomacanthus, Holacanthus / Centropyge, Genicanthus / Chaetodontidae, Forcipiger, Heniochus / Zanclus |
| wrasse / fairy-wrasse / hogfish / parrotfish | Halichoeres, Pseudocheilinus, Macropharyngodon, Thalassoma, Coris, cleaner Labroides / Cirrhilabrus, Paracheilinus / Bodianus, Lachnolaimus / Scaridae |
| blenny / marine-goby / dartfish / jawfish / dragonet | Salarias, Ecsenius, Meiacanthus / Amblyeleotris, Valenciennea, Gobiodon, Elacatinus, Koumansetta / Nemateleotris, Ptereleotris / Opistognathus / Synchiropus |
| seahorse / pipefish / lionfish / scorpionfish / frogfish / grouper / squirrelfish / sweetlips / snapper / batfish | as named (`grouper` also for Cephalopholis, Plectropomus, Pseudanthias-like serranids that are big) |
| triggerfish / filefish / marine-puffer / boxfish / cowfish / moray / garden-eel / shark / ray | as named (`shark` = small aquarium sharks like bamboo/epaulette; `ray` = blue-spotted ribbontail, yellow stingray) |
| shrimp / snail / crab / hermit-crab / crayfish / starfish / brittle-star / urchin | invertebrates (set `group` accordingly; `look` describes shell/carapace colors) |

Useful overrides: `depth` (max depth/length: neon 0.24, barb 0.38, angelfish 0.6, discus 0.85),
`width`, `snout`, `mouth`, `eyeSize`, `belly`, `hump`, `barbels`, `caudal.shape/size`,
`dorsal/dorsal2/anal/pelvic/pectoral` (`{start,end,height,shape,trail}` in body-length fractions),
`adipose`, `scaleSize`, `armored`.

## Appearance (`look`)

Coordinates on the body: `x` 0 = snout tip → 1 = tail base; `y` −1 = belly midline → 0 = lateral
line → +1 = dorsal midline. Patterns are painted in array order (later on top).

- `base`, `dorsal`, `ventral`: countershading — most fish are darker above, paler below.
- `fin` + `finOpacity` (0.15 glass-clear … 1 opaque), `eye` (iris color), `metallic` (silvery
  guanine, 0..1), `iridescence` + `iridescenceColor` (view-angle color shift — neon stripes,
  gourami sheen), `translucency` (glass catfish 0.85, ghost shrimp 0.9).
- Pattern types:
  - `stripe` — horizontal band: `{y, width, x0, x1, glow?, iridescent?}`
  - `bars` — vertical bands: `{count, width, x0, x1, slant?, y0?, y1?}`
  - `spots` — scattered dots: `{density (per unit area ≈ count), size, x0..y1?, jitter?}`
  - `blotch` — a single spot/eyespot/shoulder spot: `{x, y, rx, ry, ring?}`
  - `region` — paint an area: `{x0, x1, y0, y1, softness}` (e.g. red rear half)
  - `reticulate` (net), `marble`, `scales` (scale outlines), `chevrons`, `lines` (many thin
    horizontal lines, `wavy` for vermiculation), `mask` (bar through the eye), `speckle` (pepper).
- `fins.{dorsal,caudal,anal,pelvic,pectoral}`: `{color, opacity, edge, edgeWidth, patterns}` — on
  fins `x` runs base → tip, `y` −1..1 across the fin.
- `male`/`female`: `{lengthScale, look, body}` partial overrides for sexual dimorphism.

Aim for the look of a healthy adult in good lighting — the colors a keeper would recognise
instantly. Use 1–6 patterns; prefer fewer, well-placed patterns over noisy ones.

## Invertebrate conventions (renderer + data agree on these)

- `adultLengthCm`: shrimp = body length without antennae; crabs = carapace width (arrow crab: body
  incl. rostrum); hermit crabs = crab + shell; crayfish = body length; snails = shell length;
  starfish & brittle stars = arm-tip-to-arm-tip span; urchins = test diameter (without spines).
- `look`: `base` = carapace / shell / body color (hermit crab: `base` = the borrowed shell, `eye` =
  eyestalk color); `fin` = legs, tube feet or spines; `fins.pectoral` = claws (chelae);
  `fins.caudal` = shrimp/crayfish tail fan; `fins.pelvic.patterns` = leg banding (hermits);
  `fins.dorsal` = urchin primary-spine banding. Starfish patterns: `x` runs from disc center (0)
  to arm tip (1).
- `body.barbels` / `barbelLength` = shrimp antennae (count, length relative to body).
- Reproduction: `egg-carrier` only where young are actually raised in home tanks (Neocaridina,
  Caridina bees, peppermint shrimp); berried species whose larvae need brackish/plankton rearing
  (Amano, most marine decapods, nerites) use `none`.
