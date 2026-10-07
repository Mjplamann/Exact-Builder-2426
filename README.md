# MN Pulse

**A live dashboard of infectious diseases circulating in Minnesota.** It shows what's going around, where, whether it's rising, and what that means for you and your family.

MN Pulse combines official public-health surveillance feeds into one plain-language dashboard:

- **Pulse:** a watch list of illnesses ranked by activity level and trend. It includes a "what to do this week" panel tailored to your age group, or to pregnancy or a weakened immune system.
- **Map:** an interactive county map with drill-down. It covers emergency-department visits by health service area and wastewater sites, and shows county demographics and trends.
- **Trends & projections:** line charts with season-over-season comparison. Each chart shows CDC ensemble forecasts and MN Pulse's own backtested 1–4 week projections, with 50% and 95% ranges.
- **Illness library:** about 30 illnesses. Each page covers symptoms, emergency warning signs, risk and actions for each age group, treatments, prevention and vaccines, and how to read the numbers. Every page cites CDC, MDH and professional-society sources.
- **Understand the numbers:** what "% positive" really means (it is *not* the share of people infected), BioFire detection rates, ED visit percentages, wastewater, Rt, and how activity levels and projections are computed.
- **Sources:** live status of every data feed, including freshness, last successful refresh and errors.

> MN Pulse is for awareness. It is not medical advice. If you are sick or worried, contact a health care provider. For emergencies, call 911.

## Data sources

The pipeline never synthesizes data. Every number traces to a named public source. When a source can't be fetched, its last good data is kept and clearly labeled as stale.

| Source | What it measures | Geography | Cadence |
|---|---|---|---|
| CDC NSSP (data.cdc.gov `rdmq-nq56`, `vjzj-u7u8`, `f3zz-zga5`) | % of emergency-department visits for flu, COVID-19, RSV and all acute respiratory illness, plus CDC trend calls | MN, county (health-service-area estimates) | Weekly |
| CDC NHSN via the CDC FluSight / COVID-19 / RSV Forecast Hubs | New lab-confirmed hospital admissions, and per 100k | MN, U.S. | Weekly |
| CDC ensemble forecasts (FluSight, CovidHub, RSVHub) | Official 0–3 week forecasts | MN, U.S. | Weekly in season |
| CDC PRISM thresholds (CDCgov/forecasttools) | CDC's official Minnesota activity-level cut-points | MN | Per season |
| CDC NWSS wastewater (`atcp-73re`, `akvg-8vrb`, `mtpu-urpp`, `xpxn-rzgz`) | Wastewater viral activity level by site; measles, H5 and mpox detections | Sewershed, MN | Weekly |
| WastewaterSCAN (Stanford/Emory/Verily) | Multi-pathogen wastewater concentrations (COVID, flu A/B, RSV, hMPV, norovirus, EV-D68, measles, H5, …) | 4 MN plants | ~Daily |
| CDC NREVSS (`rgnm-fkqb`, `3cxc-4k8q`, `gvsb-yw6g`) | Lab test positivity for RSV, COVID, hMPV, adenovirus, parainfluenza, rhino/enterovirus, seasonal coronaviruses | HHS Region 5, U.S. | Weekly |
| CDC RESP-NET (`kvib-3txy`, `6jg4-xsqq`, `29hc-w46k`) | Hospitalization rates, including by age (MN is an Emerging Infections Program site) | MN | Weekly |
| CDC NNDSS (`x9gk-5huc`) | Weekly notifiable disease counts (pertussis, measles, foodborne, tick-borne, …) | MN | Weekly |
| CDC FluView / ILINet (via Delphi Epidata) | Influenza-like illness % and clinical lab flu positivity | MN | Weekly |
| CDC CFA epidemic trends (`5dqz-y4ea`) | Rt and growing/declining calls | MN | Weekly |
| Minnesota Department of Health | Weekly flu and respiratory reports (lab positivity incl. other respiratory viruses, hospitalizations, ILI, school and long-term-care outbreaks, wastewater, RESP-NET by county) | MN, MDH regions, county | Weekly (Thu) |
| BIOFIRE® Syndromic Trends (bioMérieux) | Share of BioFire panel tests detecting each organism | Midwest Census region, U.S. | See below |

When data.cdc.gov is unavailable, CDC datasets fall back to the public [PopHIVE](https://github.com/PopHIVE/Ingest) GitHub mirror.

### About BioFire Syndromic Trends

BioFire publishes data only for the U.S. and the four Census regions. Minnesota is in the 12-state **Midwest** region. No state- or county-level BioFire data is public. The public site has no documented API, and bioMérieux's terms restrict automated extraction, so MN Pulse does **not** scrape syndromictrends.com. Instead it ingests BioFire data in two ways:

1. **Partner or manual exports** dropped in [`data/manual/biofire/`](data/manual/biofire/). These can be BioFire's native `Trend <Organism> Detection Rates <date>.csv` (columns `Week,US,Northeast,Midwest,West,South`) or a documented long format. A participating Minnesota lab with Syndromic Trends access can add Minnesota-relevant exports here.
2. **bioMérieux "TRENDS Insights" reports**, published on its resource hub. Midwest values are parsed only when the report text is unambiguous.

For a Minnesota-specific, BioFire-like multi-pathogen picture, MN Pulse also uses MDH's weekly lab data ("other molecular testing" from Minnesota labs, many of which run BioFire panels), NREVSS Region 5 positivity and WastewaterSCAN.

## How it works

```
GitHub Actions (every 3 h) ──▶ pipeline/ (Node + TypeScript)
   sources/*  fetch + normalize ──▶ public/data/series/*.json
   analysis/  levels · trends · projections ──▶ pulse.json · forecasts.json · manifest.json
                                           └──▶ static site (Vite + React) ──▶ GitHub Pages
```

- **Activity levels** come from publisher thresholds when they exist: CDC PRISM cut-points for Minnesota ED visits and admissions per 100k, and CDC wastewater categories. Otherwise a value is ranked against the past ~3 years of the same measure, with cut-points at the 50th, 75th, 90th and 97.5th percentiles.
- **Trends** compare 3-week averages two weeks apart. Above +10% is *rising* and above 1.4× is *rising fast*, with a floor that ignores tiny changes at low levels. Official CDC trend calls are used when published.
- **Projections:** CDC ensemble forecasts are shown when available. MN Pulse also computes its own 1–4 week projection for every state or regional series. It is an analog–trend ensemble (persistence, damped trend and prior-season analogs) weighted by backtest error. Its intervals come from the method's own past errors on that series, and skill is reported on the page.

## Develop

```bash
npm install
npm run pipeline          # fetch all sources → public/data (needs internet access to the sources)
npm run pipeline:analysis # recompute pulse/forecasts from existing data
npm run dev               # http://localhost:5173
npm test                  # unit tests (MMWR weeks, risk levels, projections, source parsers)
npm run build
```

Refresh only some sources with `npm run pipeline -- --only=cdc-nssp,cdc-hubs`.

## Deploy

1. In **Settings → Pages**, set **Build and deployment → Source** to **GitHub Actions**.
2. Merge to `main`. `deploy.yml` publishes the site, and `refresh-data.yml` refreshes data every 3 hours, commits new observations and redeploys.
3. Optional: add a `SOCRATA_APP_TOKEN` repository secret for higher data.cdc.gov rate limits, and `DELPHI_API_KEY` for Delphi Epidata.

## Limitations

- Test positivity and detection rates describe **people who were tested**: mostly people sick enough to seek care. They do not tell you the share of Minnesotans who are infected.
- County ED values are estimates for each county's health service area. Wastewater covers only the communities served by participating plants.
- Recent weeks are preliminary and are often revised. Projections assume recent patterns continue and can miss sudden changes.
- Clinical content was reviewed against CDC, MDH, AAP, ACOG and IDSA sources as of October 2026. Recommendations change, so check with your clinician.
