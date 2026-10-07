# BioFire detection-rate imports

The `biofire` pipeline source (`pipeline/sources/biofire.ts`) reads every `*.csv` file in this folder,
including subfolders, on each run. It publishes them as the `biofire-trend` dataset.

Only add files you are allowed to republish. That means data bioMérieux or a partner lab gave you
with permission to show it publicly, with credit to **BIOFIRE® Syndromic Trends / bioMérieux
(syndromictrends.com)**. Do not add made-up, example or test data. Test fixtures belong in
`tests/sources/biofire.test.ts`.

MN Pulse does **not** scrape syndromictrends.com. BioFire has no documented public API, and
bioMérieux's legal notice restricts automated extraction from its website databases.

## What the numbers mean

A BioFire **detection rate** is the share of BIOFIRE® FILMARRAY® panel tests that detected an
organism. The panels are respiratory (RP2.1) and gastrointestinal (GI), and the tests come from
participating labs.

- **Who is tested.** The patients are mostly symptomatic people in hospitals and emergency
  departments. The rate shows which germs are causing illness among people sick enough to be
  tested. It is **not** prevalence, meaning it is not the share of people infected.
- **Smoothing.** Each value is a 3-week centered average of each site's rate, and every site
  counts equally. Because of that, the newest week is revised when the next week arrives. The
  pipeline marks the final week as provisional (`provisionalFrom`).
- **Geography.** Public BioFire data cover the U.S. and the four Census regions. Minnesota is in
  the Census Midwest region, which has 12 states: IL, IN, IA, KS, MI, MN, MO, NE, ND, OH, SD and
  WI. That is not the same as HHS Region 5. The pipeline keeps only the U.S. and Midwest values.

## Accepted formats

### (a) BioFire Trend export (wide, one organism per file)

- **File name:** `Trend <Organism> Detection Rates <YYYY-MM-DD>.csv`, for example
  `Trend Mycoplasma pneumoniae Detection Rates 2024-06-30.csv`. The organism comes from the file
  name. The date is the snapshot date and decides which file wins when files overlap. Leave the
  name exactly as exported. A browser suffix such as ` (1)` is tolerated.
- **Columns:** `Week,US,Northeast,Midwest,West,South`.
- **`Week`:** an ISO date (`YYYY-MM-DD`) inside the week. It is mapped to that week's MMWR
  week-ending Saturday, so a week-start Sunday and a week-end Saturday both work. Diagnostics list
  the weekday of every `Week` value so you can confirm the convention.
- **Values:** proportions from 0 to 1, for example `0.0123` means 1.23%. If any value in the
  file is greater than 1, the whole file is rejected rather than re-scaled.
- **Blank and missing cells:** a blank cell is skipped. A marker such as `NA` or `*` is stored as
  missing (null).

```csv
Week,US,Northeast,Midwest,West,South
2024-06-16,0.0092,0.0071,0.0105,0.0088,0.0097
2024-06-23,0.0101,0.0080,0.0112,0.0090,0.0110
```

(Illustrative layout only. These values are not real.)

### (b) MN Pulse long format (many organisms per file)

One row per organism × geography × week. The header is case-insensitive.

| column | required | meaning |
| --- | --- | --- |
| `source` | no | Free-text origin tag, e.g. `biofire_trend` or `partner_lab_x`. |
| `panel` | no | `RP2.1`, `RP` or `GI`. Needed only to tell GI `Adenovirus` (F40/41) apart from respiratory adenovirus. |
| `organism_code` | yes, or `organism_label` | Canonical code (see the table below). |
| `organism_label` | yes, or `organism_code` | BioFire target name, e.g. `Influenza A/H3`. |
| `geo_type` | recommended | `nation`, `census_region` or `site`. `site` rows are skipped: MN Pulse publishes no lab-level geography. |
| `geo_code` | yes | `US`, `Northeast`, `Midwest`, `South`, `West` or a site id. Only `US` and `Midwest` are kept. |
| `week_start` | yes, or `week_end` | ISO date of the Sunday that starts the MMWR week. |
| `week_end` | yes, or `week_start` | ISO date of the Saturday that ends the MMWR week. |
| `detection_rate` | yes | Proportion from 0 to 1. Rows outside 0–1 are skipped. A blank value is stored as missing. |
| `smoothing` | no | `3wk_centered` (default; the public Trend measure), `weekly_raw` or `2wk_window`. Each non-default value becomes its own series. |
| `n_tests`, `n_positive`, `n_sites` | no | Counts behind the rate, if shared. The latest values appear in the series tooltip. |
| `provisional` | no | `true` or `false`. The earliest provisional week starts the provisional tail. |
| `retrieved_at` | no | ISO date or datetime of the snapshot. When the same week appears in several files, the newest snapshot wins. If blank, a date in the file name is used, then the file's modification time. |
| `source_url` | no | Where the numbers came from. |
| `notes` | no | Free text. It is not published. |

If a week date is not a Sunday or Saturday as expected, the row is assigned to the MMWR week that
contains the middle of its 7-day window, and a warning is logged.

```csv
source,panel,organism_code,organism_label,geo_type,geo_code,week_start,detection_rate,smoothing,n_tests,n_positive,n_sites,provisional,retrieved_at,source_url,notes
biofire_trend,RP2.1,RSV,Respiratory Syncytial Virus,census_region,Midwest,2026-09-20,0.0123,3wk_centered,,,,false,2026-10-05,https://syndromictrends.com/,
```

(Illustrative layout only. These values are not real.)

## Organism codes

| Respiratory (RP2.1) | MN Pulse pathogen | GI panel | MN Pulse pathogen |
| --- | --- | --- | --- |
| `ADV` Adenovirus | adenovirus | `NORO` Norovirus GI/GII | norovirus |
| `COV` Seasonal coronaviruses (combined, if supplied) | seasonal-cov | `ROTA` Rotavirus A | rotavirus |
| `COV_229E`, `COV_HKU1`, `COV_NL63`, `COV_OC43` | seasonal-cov (one series per target) | `SAPO` Sapovirus | sapovirus |
| `SARS2` SARS-CoV-2 | covid | `ASTRO` Astrovirus | astrovirus |
| `HMPV` Human metapneumovirus | hmpv | `ADV_F4041` Adenovirus F40/41 | adenovirus-gi |
| `RVEV` Human rhinovirus/enterovirus | rhino-entero | `SALM` Salmonella | salmonella |
| `FLU` Influenza A+B (combined, if supplied) | influenza | `CAMPY` Campylobacter | campylobacter |
| `FLUA` Influenza A | influenza-a | `STEC` Shiga-like toxin-producing E. coli | stec |
| `FLUA_H1`, `FLUA_H3`, `FLUA_H1_2009`, `FLUA_NOSUB` | influenza-a (subtype series) | `ECOLI_O157` E. coli O157 | stec (O157 series) |
| `FLUB` Influenza B | influenza-b | `SHIG_EIEC` Shigella/EIEC | shigella |
| `PIV` Parainfluenza (combined, if supplied) | parainfluenza | `CDIFF` C. difficile toxin A/B | c-diff |
| `PIV1` … `PIV4` | parainfluenza (one series per type) | `CYCLO` Cyclospora cayetanensis | cyclospora |
| `RSV` Respiratory syncytial virus | rsv | `GIARDIA` Giardia lamblia | giardia |
| `BPERT` Bordetella pertussis | pertussis | `CRYPTO` Cryptosporidium | cryptosporidium |
| `CPNEU` Chlamydia pneumoniae | chlamydia-pneumoniae | | |
| `MPNEU` Mycoplasma pneumoniae | mycoplasma | | |

Some targets are recognized but not published, so they are not reported as unknown: `BPARA`,
`PLES`, `VIBRIO`, `VCHOL`, `YERS`, `EAEC`, `EPEC`, `ETEC` and `EHIST`. Per-target series (for
example `COV_OC43`) are never added together into a combined value. A combined series is
published only when the file supplies it.

## Checking an import

After a pipeline run, `public/data/diagnostics/biofire.json` lists each file with:

- the format that was detected
- the number of rows read and values kept
- the reasons rows were skipped
- the weekday histogram for week dates
- any schema-drift warnings
