// "Understand the numbers" and "Sources & methods" content.
//
// Plain language (about 8th-grade reading level), calm and specific. Every section cites the
// publisher's own documentation. Numbers that change (thresholds, latest values, projection skill)
// are NOT written here: the views read them live from public/data so the text never goes stale.
import type { SourceLink } from './types'

export interface LearnDetail {
  title: string
  items: string[]
}

export interface LearnExample {
  /** What a reader might see on a chart or card. */
  see: string
  /** What it means for an average person. */
  means: string
}

export interface LearnSection {
  id: string
  /** Full section heading. */
  title: string
  /** Short label for the table of contents. */
  short: string
  /** One or two sentences: the takeaway. */
  summary: string
  /** Paragraphs. A paragraph may start with "**Lead-in.**", which is shown in bold. */
  body: string[]
  /** "What it means for you" — practical meaning for an average person. */
  forYou?: string
  examples?: LearnExample[]
  details?: LearnDetail[]
  /** Show details as always-visible cards instead of collapsed disclosures. */
  detailsAsCards?: boolean
  sources: SourceLink[]
}

export const LEARN_INTRO = {
  eyebrow: 'Understand the numbers',
  title: 'How to read MN Pulse',
  lede:
    'MN Pulse brings together many kinds of public health data. Each one measures something different, has blind spots, and arrives on its own schedule. This guide explains what each number means for you, and how MN Pulse turns them into simple activity levels, trends and projections.',
  keyIdeas: [
    {
      title: 'Most numbers describe people who got tested',
      text: 'Positivity, BioFire rates and ED shares count tests and visits, not everyone in Minnesota.',
    },
    {
      title: 'Direction matters more than size',
      text: 'A steady rise over 2–3 weeks is the most useful early sign. Compare each measure only with its own past.',
    },
    {
      title: 'Check the date and the source',
      text: 'Every number shows the week it covers and who published it. The newest weeks are often revised.',
    },
  ],
}

const S = {
  cdcResp: { label: 'CDC — Respiratory illnesses data channel', url: 'https://www.cdc.gov/respiratory-viruses/data/index.html' },
  mdhLab: { label: 'MDH — Weekly respiratory lab results', url: 'https://www.health.state.mn.us/diseases/respiratory/stats/lab.html' },
  mdhResp: { label: 'MDH — Respiratory illness statistics', url: 'https://www.health.state.mn.us/diseases/respiratory/stats/index.html' },
  nrevss: { label: 'CDC — NREVSS dashboard', url: 'https://www.cdc.gov/nrevss/php/dashboard/index.html' },
  syndromic: { label: 'bioMérieux — BIOFIRE® Syndromic Trends', url: 'https://syndromictrends.com/' },
  biofireReports: { label: 'bioMérieux — TRENDS reports', url: 'https://www.biomerieux.com/us/en/education/resource-hub/trends-reports.html' },
  meyers: {
    label: 'Meyers L, et al. Automated real-time collection of pathogen-specific diagnostic data (JMIR Public Health Surveill, 2018)',
    url: 'https://publichealth.jmir.org/2018/3/e59/',
  },
  nssp: { label: 'CDC — National Syndromic Surveillance Program (NSSP)', url: 'https://www.cdc.gov/nssp/index.html' },
  nhsn: { label: 'CDC — National Healthcare Safety Network (NHSN)', url: 'https://www.cdc.gov/nhsn/index.html' },
  respnet: { label: 'CDC — RESP-NET hospitalization dashboard', url: 'https://www.cdc.gov/resp-net/dashboard/index.html' },
  nwss: { label: 'CDC — Wastewater data for respiratory illnesses (NWSS)', url: 'https://www.cdc.gov/nwss/rv/index.html' },
  wwscan: { label: 'WastewaterSCAN dashboard', url: 'https://data.wastewaterscan.org/' },
  cfa: { label: 'CDC CFA — Rt estimates and epidemic trends', url: 'https://www.cdc.gov/cfa-modeling-and-forecasting/rt-estimates/index.html' },
  prism: { label: 'CDCgov/forecasttools — Minnesota activity-level cut-points (PRISM)', url: 'https://github.com/CDCgov/forecasttools' },
  flusight: { label: 'CDC FluSight Forecast Hub', url: 'https://github.com/cdcepi/FluSight-forecast-hub' },
  covidhub: { label: 'CDC COVID-19 Forecast Hub', url: 'https://github.com/CDCgov/covid19-forecast-hub' },
  rsvhub: { label: 'CDC RSV Forecast Hub', url: 'https://github.com/CDCgov/rsv-forecast-hub' },
  nndss: { label: 'CDC — NNDSS weekly tables (data.cdc.gov)', url: 'https://data.cdc.gov/d/x9gk-5huc' },
  repo: { label: 'MN Pulse source code and methods', url: 'https://github.com/Mjplamann/Exact-Builder-2426' },
} satisfies Record<string, SourceLink>

export const LEARN_SECTIONS: LearnSection[] = [
  {
    id: 'positivity',
    title: 'Percent positive is not the share of people infected',
    short: 'Percent positive',
    summary:
      'Test positivity and BioFire detection rates tell you what share of tests found a germ, among people sick enough to get tested. They do not tell you what share of Minnesotans are infected.',
    body: [
      'When a lab reports that 12% of flu tests were positive, it means 12% of tests, not 12% of people. Tests are mostly done on people with symptoms who saw a clinician, went to urgent care or an emergency department, or were admitted to a hospital. Healthy people, and most people with a mild cold who stay home, are never tested.',
      'So positivity answers one question: “Of the sick people who got tested, how many had this germ?” That makes it a good guide to what is causing illness right now, and its direction over several weeks is a dependable sign of spread. The share of everyone who is infected is usually much lower, and positivity cannot tell you exactly how much lower.',
      'Positivity can also move for reasons that have nothing to do with how much virus is around. If fewer mild cases are tested (for example, because people use home tests), positivity goes up. If another illness sends many more people to be tested, the share positive for everything else goes down.',
    ],
    forYou:
      'Treat positivity like a weather vane, not a head count. A steady climb over 2–3 weeks means a germ is spreading: a good time to get vaccinated if you have not, stay home when sick, and take extra care around people at higher risk.',
    examples: [
      {
        see: 'Flu test positivity is 25%.',
        means:
          'About 1 in 4 flu tests on people with symptoms found flu. It does not mean 1 in 4 Minnesotans have flu: most people were never tested.',
      },
      {
        see: 'Positivity went from 5% to 10% in two weeks.',
        means: 'The share of positive tests doubled. That is a strong sign the germ is spreading, even though both numbers sound small.',
      },
      {
        see: 'Rhinovirus is found in a large share of BioFire panels in September.',
        means: 'That is normal for early fall. Rhinovirus (a common cold virus) is found all year and peaks when school starts.',
      },
      {
        see: 'Positivity falls while emergency visits rise.',
        means:
          'Possible when many more people with other illnesses are being tested. Look at several signals together before drawing conclusions.',
      },
    ],
    details: [
      {
        title: 'Why the people tested are a special group',
        items: [
          'They are sicker than average: they felt bad enough to seek care.',
          'They are more likely to be very young, older, pregnant, or have a chronic condition, because clinicians test those patients more often.',
          'Who gets tested depends on insurance, clinic access, cost and local testing habits, which differ across places and change over time.',
        ],
      },
      {
        title: 'How positivity differs from other measures',
        items: [
          'Emergency department percentages count visits, not tests (see “Emergency department visit percentages”).',
          'Hospital rates count people admitted per 100,000 residents, so they do relate to the whole population.',
          'Wastewater includes people who never get tested, so it is the closest thing to a whole-community view.',
        ],
      },
    ],
    sources: [S.mdhLab, S.nrevss, S.cdcResp],
  },
  {
    id: 'biofire',
    title: 'BioFire detection rates (Syndromic Trends)',
    short: 'BioFire detection rates',
    summary:
      'A BioFire “detection rate” is the share of multi-germ panel tests at participating labs that found a given germ. Public data cover only the Midwest region and the U.S., not Minnesota by itself.',
    body: [
      'BIOFIRE® FILMARRAY® panels, made by bioMérieux, test one sample for many germs at once. The Respiratory Panel 2.1 checks for 22 viruses and bacteria; the Gastrointestinal Panel checks for 22 causes of diarrhea. BioFire Syndromic Trends pools the de-identified results from participating U.S. labs, mostly in hospitals.',
      'Public figures exist only for the whole U.S. and four Census regions. Minnesota is in the 12-state Midwest region (Illinois, Indiana, Iowa, Kansas, Michigan, Minnesota, Missouri, Nebraska, North Dakota, Ohio, South Dakota and Wisconsin), so a Midwest rate can reflect what is happening in Chicago or Detroit as much as in Minnesota.',
      'Each value is a 3-week centered average of participating sites’ rates, with every site counting equally. “Centered” means a week’s value also uses the week after it, so the newest week is provisional and is revised once the next week arrives.',
      'These panels cost more than single tests, so they are mostly ordered for people sick enough for an emergency department or hospital stay, for young children, and for people with weakened immune systems. The rates show which germs are driving serious illness, not how many people are infected.',
    ],
    forYou:
      'Compare each germ with its own recent weeks, not with other germs. Rhinovirus/enterovirus near the top of the list is normal. A germ that has climbed for 2–3 weeks in a row is the signal to watch.',
    details: [
      {
        title: 'Why rhinovirus is always high',
        items: [
          'Rhinovirus/enterovirus, the common-cold virus family, is the germ these panels find most often.',
          'It spreads all year, peaking in early fall and again in spring, and can be detected for weeks after a cold.',
          'It is often found alongside another germ, and sometimes in people whose illness is caused by something else. A high rate is normal and is not a warning by itself.',
        ],
      },
      {
        title: 'Co-detections: one test, more than one germ',
        items: [
          'One panel can find two or more germs, for example RSV and rhinovirus in a toddler.',
          'Each germ’s rate is calculated separately, so the rates for all germs can add up to more than the share of panels that found anything.',
          'Finding a germ’s genetic material does not prove it caused the illness.',
        ],
      },
      {
        title: 'One germ’s rise can lower another’s rate',
        items: [
          'Every germ shares the same denominator: all panels run that week.',
          'When flu surges, many more people are tested, so the share positive for other germs can dip even if they are just as common as before.',
        ],
      },
      {
        title: 'Where MN Pulse gets BioFire data',
        items: [
          'bioMérieux does not offer a public data feed, and its terms restrict automated collection from syndromictrends.com, so MN Pulse does not scrape that site.',
          'Values come from BioFire Trend CSV exports added to the project by bioMérieux or a partner lab, and from bioMérieux’s published “TRENDS” reports. See Sources & methods for how a lab can contribute.',
        ],
      },
    ],
    sources: [S.syndromic, S.biofireReports, S.meyers],
  },
  {
    id: 'ed-visits',
    title: 'Emergency department visit percentages',
    short: 'ED visits',
    summary:
      'The percent of emergency department (ED) visits for flu, COVID-19 or RSV is the share of all ED visits where that illness was diagnosed. It shows how much the illness is sending people to emergency care.',
    body: [
      'These numbers come from CDC’s National Syndromic Surveillance Program (NSSP). Participating hospitals send de-identified ED visit records to public health in near real time. CDC counts the visits with a diagnosis of each illness and divides by all ED visits that week.',
      'The values look small, a few percent at most, because emergency departments see every kind of emergency. Even a couple of percent of all ED visits for flu is a lot of people across Minnesota. What counts as “high” differs by illness, which is why MN Pulse uses CDC’s Minnesota-specific cut-points (see “Activity levels”).',
      'County values are not measured county by county. CDC reports them for health service areas (HSAs): groups of counties whose residents mostly use the same hospitals. Every county in an HSA shows the same number, and visits are counted where people sought care, which may be a neighboring county.',
    ],
    forYou:
      'A rising ED share means more people are sick enough to need urgent care. It is a good time to make sure babies, older adults and people with chronic conditions are protected, and to know the warning signs that need emergency care.',
    details: [
      {
        title: 'Things that can move the number',
        items: [
          'Diagnoses depend on how clinicians code visits. Untested flu-like illness may be coded as flu or as a general respiratory illness.',
          'It is a share: if other ED visits drop (for example during a holiday or a big storm), the respiratory share can tick up with no change in illness.',
          'The newest week can be revised as late records arrive.',
        ],
      },
      {
        title: 'Why counties share a value',
        items: [
          'Small counties have too few ED visits for a stable weekly percentage.',
          'Grouping counties by where people go to the hospital gives steadier numbers and protects patient privacy.',
        ],
      },
    ],
    sources: [S.nssp, S.cdcResp],
  },
  {
    id: 'hospital',
    title: 'Hospital admissions and rates per 100,000',
    short: 'Hospital admissions',
    summary:
      'Hospital numbers count people admitted with a lab-confirmed infection. They are the clearest sign of severe illness, but they rise later than other signals.',
    body: [
      '**NHSN admissions.** Each week, hospitals report to CDC’s National Healthcare Safety Network (NHSN) how many patients were newly admitted with laboratory-confirmed flu, COVID-19 or RSV. Since November 2024, federal rules require most hospitals to report. MN Pulse shows the Minnesota count and the same count per 100,000 residents.',
      '**RESP-NET rates.** CDC’s RESP-NET (FluSurv-NET, COVID-NET and RSV-NET), run in Minnesota by the Minnesota Department of Health’s Emerging Infections Program, actively finds residents of its catchment area who were hospitalized with a positive test. The catchment was historically the 7-county Twin Cities metro; MDH reports statewide RESP-NET coverage from the 2023–24 season. RESP-NET also reports rates by age group, which show who is hit hardest.',
      '**Per 100,000.** This makes places of different sizes comparable. Minnesota has about 5.7 million people, so a rate of 1 per 100,000 in a week means about 57 Minnesotans were admitted that week.',
    ],
    forYou:
      'Hospital rates matter most for people at higher risk: babies, adults 65 and older, pregnant people, and people with chronic conditions or weakened immune systems. If rates are climbing, act early. Antiviral medicines for flu and COVID-19 work best when started soon after symptoms begin.',
    details: [
      {
        title: 'Reading hospital numbers carefully',
        items: [
          'Only patients who were tested are counted, so changes in testing practice change the numbers.',
          'The most recent week is often revised upward as hospitals catch up on reports.',
          'Admissions usually rise one to two weeks after infections, so they confirm a wave rather than predict it.',
          'NHSN counts and RESP-NET rates come from different systems and areas. Compare each with its own past, not with each other.',
          'Age-group rates for one state rest on few patients and can jump week to week.',
        ],
      },
    ],
    sources: [S.nhsn, S.respnet, S.mdhResp],
  },
  {
    id: 'wastewater',
    title: 'Wastewater',
    short: 'Wastewater',
    summary:
      'Wastewater testing measures virus genetic material in sewage from everyone connected to a treatment plant, including people who never get tested. It often rises before clinics and hospitals get busier.',
    body: [
      '**Wastewater Viral Activity Level (WVAL).** CDC compares each plant’s current measurements with that plant’s own baseline and groups the result from Very Low to Very High. Because each plant is compared with itself, levels can be compared across places.',
      '**Normalized concentrations.** Some programs, such as WastewaterSCAN, report the amount of virus genetic material divided by a marker of human waste: PMMoV, a pepper virus people shed from their diet. This adjusts for dilution from rain and industrial water. The units differ between programs, labs and germs, so compare a plant only with its own past values.',
      '**An early signal.** People shed virus early, often before or without symptoms, so wastewater often rises several days to a couple of weeks before ED visits and hospital admissions. It does not always lead, and single weeks are noisy.',
      '**Coverage.** Only homes and businesses connected to a participating plant are represented. Homes on septic systems and towns without a participating plant are not covered, and one plant’s area (its “sewershed”) can span parts of several counties.',
      '**H5 bird flu caveat.** H5 influenza in wastewater can come from animal sources, such as milk from infected dairy cattle or wild birds, not only from people. A detection does not mean people are infected. Likewise, a single detection of a rare virus such as measles or mpox can come from one traveler.',
    ],
    forYou:
      'A rising wastewater level is an early heads-up. It is a good moment to check that vaccines are up to date, keep home tests on hand, and stay home when sick.',
    details: [
      {
        title: 'How CDC sets the levels',
        items: [
          'CDC sets a baseline for each plant from its earlier measurements and expresses the current value relative to it.',
          'National cut-points for each virus turn that value into Very Low through Very High. CDC revised the method in August 2026 and re-applied it to past data.',
          'The statewide value on MN Pulse is the median across reporting Minnesota plants, calculated by MN Pulse.',
        ],
      },
      {
        title: 'What wastewater cannot tell you',
        items: [
          'It does not count cases, and levels cannot be converted into a number of sick people.',
          'A “not detected” result does not rule out infections in the community.',
          'Raw concentrations cannot be compared between plants, programs or germs.',
        ],
      },
    ],
    sources: [S.nwss, S.wwscan],
  },
  {
    id: 'lab-positivity',
    title: 'Lab test positivity in HHS Region 5 (NREVSS)',
    short: 'Regional lab positivity',
    summary:
      'NREVSS reports the share of PCR lab tests that were positive for RSV, COVID-19 and other respiratory viruses in HHS Region 5: Minnesota and five neighboring states.',
    body: [
      'About 450 hospital, commercial and public health laboratories report weekly to CDC’s National Respiratory and Enteric Virus Surveillance System (NREVSS) how many tests they ran and how many were positive.',
      'HHS Region 5 is Minnesota, Wisconsin, Illinois, Indiana, Michigan and Ohio. Minnesota is a small part of the region by population, so these values mostly reflect the larger states. Use them for the regional direction, and for viruses that have no Minnesota-specific source on MN Pulse.',
      'Like all positivity, this is the share of tests, not of people (see “Percent positive”).',
    ],
    forYou:
      'A clear regional rise is a reason to watch Minnesota-specific signals closely. Neighboring states often move together, but not always.',
    details: [
      {
        title: 'Keep in mind',
        items: [
          'The mix of reporting labs and the number of tests change over time. Weeks with few tests are noisy.',
          'MDH publishes Minnesota’s own weekly lab results; see the link below.',
        ],
      },
    ],
    sources: [S.nrevss, S.mdhLab],
  },
  {
    id: 'rt',
    title: 'Rt and epidemic trends',
    short: 'Rt / epidemic trends',
    summary:
      'Rt is CDC’s estimate of how many people, on average, each infected person goes on to infect. Above 1 means infections are likely growing; below 1 means they are likely shrinking.',
    body: [
      'CDC’s Center for Forecasting and Outbreak Analytics (CFA) estimates Rt for COVID-19, flu and RSV from emergency department visits (NSSP), and publishes an epidemic-trend call: Growing, Likely growing, Not changing, Likely declining or Declining. MN Pulse shows CDC’s wording as published.',
      'Rt describes direction and speed, not size. A virus at very low levels can have Rt above 1, and one at a high peak can have Rt just below 1.',
      'Each estimate has an uncertainty range, recent days are revised as more data arrive, and CDC skips estimates when there are too few visits.',
    ],
    forYou:
      'Read Rt together with the activity level. “Low and growing” is an early warning; “high but declining” means the worst may be passing.',
    sources: [S.cfa],
  },
  {
    id: 'activity-levels',
    title: 'Activity levels: how MN Pulse decides “Very low” to “Very high”',
    short: 'Activity levels',
    summary:
      'Each level says how much illness is going around compared with what is normal for that exact measure and place. MN Pulse uses the publisher’s official cut-points when they exist, and otherwise compares this week with the past ~3 years.',
    body: [
      '**1. Official thresholds first.** For Minnesota’s ED visit percentages and hospital admissions per 100,000 for flu, COVID-19 and RSV, MN Pulse uses CDC’s respiratory activity-level cut-points for Minnesota, published in CDC’s open forecasting tools as “PRISM” thresholds. The exact numbers are in the tables below.',
      '**2. CDC wastewater categories.** For wastewater, MN Pulse uses CDC’s own Wastewater Viral Activity Level category.',
      '**3. Otherwise, compare with recent history.** For everything else, the latest week is ranked against the same measure’s weekly values over the past ~3 years (156 weeks). The pandemic-disrupted 2019–20 to 2021–22 seasons are skipped, and at least 52 weeks of history are required; with less, the level shows as “Not enough data”.',
    ],
    forYou:
      'Levels are relative. “Very low” on a history-based measure means lower than most recent weeks, not zero risk. For a seasonal virus, about half of all weeks are off-season, so “Very low” is common in summer.',
    details: [
      {
        title: 'Why levels are colored and labeled',
        items: [
          'Each level always appears as a colored badge with its name and a bar symbol, so it reads without color.',
          'Level colors are used only for activity levels, never for anything else.',
        ],
      },
      {
        title: 'Which level wins for an illness',
        items: [
          'An illness can have several signals, each with its own level and date. The headline uses the best up-to-date signal in this order: Minnesota ED visit percentage, Minnesota lab positivity, Minnesota hospital rate or admissions, Minnesota wastewater, flu-like illness visits, then regional BioFire and lab data, then reported cases.',
          'Signals whose newest data are out of date are skipped for the headline but still listed.',
        ],
      },
    ],
    sources: [S.prism, S.nwss, S.repo],
  },
  {
    id: 'projections',
    title: 'Projections: what the next few weeks may look like',
    short: 'Projections',
    summary:
      'Projections are statistical estimates of where a measure may go over the next 1–4 weeks, shown with ranges. They describe what is likely if current patterns continue, not what will happen.',
    body: [
      '**CDC ensemble forecasts.** Each week, research teams submit forecasts to CDC’s FluSight, COVID-19 and RSV Forecast Hubs. CDC combines them into an ensemble, which is usually more reliable than any single model, for hospital admissions and ED visit percentages up to 3 weeks ahead. When a CDC ensemble exists for a measure, MN Pulse shows it first.',
      '**MN Pulse projection.** For each weekly series, MN Pulse also runs its own “analog–trend ensemble” of three simple methods: persistence (the next weeks look like this week), a damped trend (the last 4 weeks’ growth, fading over time), and a seasonal analog (how the same weeks moved in earlier seasons, skipping 2019–20 to 2021–22). Each method is weighted by how accurate it has been for that series.',
      '**Ranges come from real past errors.** MN Pulse re-ran the method at every week of the past ~2 years (“backtesting”) and uses how far off it was to set the ranges. The darker 50% range should contain the actual value about half the time; the lighter 95% range about 19 times out of 20.',
    ],
    forYou:
      'Use projections to plan, not to predict a date. If even the low end of the range is rising, it is a good time to prepare. Ranges get wider further ahead because the future is less certain.',
    details: [
      {
        title: 'Limitations',
        items: [
          'They are extrapolations from past data. They cannot anticipate a new variant, a change in testing or reporting, holidays, or school breaks.',
          'They tend to miss turning points: a peak usually shows up in the data before any projection predicts it.',
          'The newest data are often revised, and projections start from those preliminary numbers.',
          'Skill numbers describe the past ~2 years. A very unusual season can be harder to project.',
        ],
      },
    ],
    sources: [S.flusight, S.covidhub, S.rsvhub, S.repo],
  },
  {
    id: 'limitations',
    title: 'Limitations and equity',
    short: 'Limitations & equity',
    summary: 'Surveillance data show some people and places better than others. Keep these blind spots in mind.',
    body: [],
    detailsAsCards: true,
    details: [
      {
        title: 'Testing access',
        items: [
          'People without insurance, transportation, paid sick leave or a nearby clinic are less likely to be tested, so their illness is undercounted in positivity, ED and hospital data.',
          'Communities with less access to care, including many rural, low-income, Black, Indigenous and immigrant communities, can be under-represented. Wastewater helps fill this gap where plants participate.',
        ],
      },
      {
        title: 'Reporting delays and revisions',
        items: [
          'Most sources publish one to two weeks after the week they describe. MN Pulse labels the newest weeks as preliminary when the publisher flags them.',
          'Recent values are often revised, usually upward for hospital admissions and case counts.',
          'Reported cases (CDC NNDSS) are provisional, counted by the week they were reported rather than when people got sick, and include only diagnosed and reported illness.',
        ],
      },
      {
        title: 'Small counties and regional data',
        items: [
          'In small counties a handful of people can swing a rate. County ED values are health-service-area estimates shared by neighboring counties.',
          'BioFire (Midwest) and NREVSS (HHS Region 5) data are regional and are not Minnesota-specific.',
          'Wastewater covers only people served by participating plants; homes on septic systems are not included.',
        ],
      },
      {
        title: 'Changing practices',
        items: [
          'Home tests, new reporting rules, diagnosis coding changes and new lab methods can move numbers without any change in illness.',
          'MN Pulse never fills gaps or smooths over missing weeks; missing data stay missing.',
        ],
      },
    ],
    forYou:
      'MN Pulse is for awareness, not diagnosis. If you are sick or worried, contact a health care provider. In an emergency, call 911.',
    sources: [S.cdcResp, S.nndss, S.mdhResp],
  },
]

export interface GlossaryEntry {
  term: string
  definition: string
}

export const GLOSSARY: GlossaryEntry[] = [
  { term: 'Activity level', definition: 'MN Pulse’s five-step scale (Very low, Low, Moderate, High, Very high) for how much illness a measure shows compared with normal for that measure and place.' },
  { term: 'Backtest', definition: 'Re-running a projection method on past weeks, as if it were that week, and checking how close it came to what actually happened.' },
  { term: 'BioFire panel', definition: 'A BIOFIRE® FILMARRAY® test that checks one sample for many germs at once (22 respiratory or 22 gastrointestinal targets).' },
  { term: 'Catchment area', definition: 'The defined population a surveillance system covers, used as the denominator for rates.' },
  { term: 'Co-detection', definition: 'When one test finds two or more germs in the same sample.' },
  { term: 'Detection rate', definition: 'The percent of BioFire panel tests at participating labs that found a given germ.' },
  { term: 'ED', definition: 'Emergency department (emergency room).' },
  { term: 'Ensemble forecast', definition: 'A forecast made by combining several models. CDC’s hubs combine many teams’ forecasts into one ensemble.' },
  { term: 'HHS Region 5', definition: 'A federal region made up of Minnesota, Wisconsin, Illinois, Indiana, Michigan and Ohio.' },
  { term: 'Health service area (HSA)', definition: 'A group of counties whose residents mostly use the same hospitals. CDC reports county ED data at this level.' },
  { term: 'Lab-confirmed', definition: 'Counted only when a laboratory test was positive, not on symptoms alone.' },
  { term: 'Midwest region', definition: 'The U.S. Census region of 12 states including Minnesota; the smallest area for which BioFire publishes data.' },
  { term: 'MMWR week', definition: 'CDC’s standard Sunday-to-Saturday week. MN Pulse labels each week by its ending Saturday.' },
  { term: 'NHSN', definition: 'CDC’s National Healthcare Safety Network, which collects weekly hospital admission counts.' },
  { term: 'NNDSS', definition: 'CDC’s National Notifiable Diseases Surveillance System, which publishes weekly counts of reportable diseases from each state.' },
  { term: 'NREVSS', definition: 'CDC’s National Respiratory and Enteric Virus Surveillance System, a network of labs reporting tests and positives each week.' },
  { term: 'NSSP', definition: 'CDC’s National Syndromic Surveillance Program, which tracks emergency department visits in near real time.' },
  { term: 'Per 100,000', definition: 'A rate that scales counts to a population of 100,000 so places of different sizes can be compared.' },
  { term: 'Percentile', definition: 'Where a value ranks among past values. The 90th percentile is higher than 90% of past weeks.' },
  { term: 'PMMoV', definition: 'Pepper mild mottle virus, a harmless plant virus from food that people shed. Used to adjust wastewater measurements for dilution.' },
  { term: 'Positivity', definition: 'The percent of lab tests that came back positive. It describes tests on people who were tested, not the whole population.' },
  { term: 'Preliminary (provisional)', definition: 'Recent data that are likely to change as late reports arrive.' },
  { term: 'PRISM thresholds', definition: 'CDC’s state-specific cut-points that turn ED visit percentages and hospital admission rates into activity levels.' },
  { term: 'Projection range', definition: 'The span where the future value is expected to fall: the 50% range about half the time, the 95% range about 19 times in 20.' },
  { term: 'RESP-NET', definition: 'CDC’s hospitalization surveillance networks for flu (FluSurv-NET), COVID-19 (COVID-NET) and RSV (RSV-NET).' },
  { term: 'Rt', definition: 'The effective reproduction number: the average number of people each infected person infects. Above 1 means growing.' },
  { term: 'Sewershed', definition: 'The area whose homes and businesses drain to one wastewater treatment plant.' },
  { term: 'Syndromic surveillance', definition: 'Tracking illness from visit records (like ED diagnoses) in near real time, before lab results are complete.' },
  { term: 'Trend', definition: 'Whether a measure is rising, steady or falling, based on 3-week averages two weeks apart.' },
  { term: 'WVAL', definition: 'CDC’s Wastewater Viral Activity Level: each plant’s current virus level compared with its own baseline.' },
]

// ───────────────────────── Sources & methods page ─────────────────────────

export const REPO_URL = 'https://github.com/Mjplamann/Exact-Builder-2426'
export const ISSUES_URL = `${REPO_URL}/issues`

export const PIPELINE_STEPS: { title: string; text: string }[] = [
  {
    title: 'Fetch',
    text: 'Every 3 hours an automated GitHub Actions job downloads each public source. Most sources publish weekly, so frequent runs pick up each new release within a few hours.',
  },
  {
    title: 'Isolate & fall back',
    text: 'Each source runs on its own with a time limit. If one fails, its last good data are kept and marked Stale with the reason, so one outage never blanks the dashboard. When data.cdc.gov is down, CDC datasets are read from the PopHIVE mirror kept by the Yale School of Public Health.',
  },
  {
    title: 'Check',
    text: 'Column names, dates and value ranges are checked on every run. Unexpected changes are logged, and files that fail checks are rejected rather than guessed at.',
  },
  {
    title: 'Analyze',
    text: 'Activity levels, trends and MN Pulse projections are recomputed from the stored data, using the rules explained in “Understand the numbers”.',
  },
  {
    title: 'Publish',
    text: 'The site is rebuilt and published. When observations change, the new data files are committed to the public repository, so every past version stays on record.',
  },
]

export const STALE_RULE =
  'A source is marked Stale when its newest data are more than 3 weeks old, or when its latest refresh failed and older data are being shown.'

export const NO_SYNTHETIC =
  'Every number traces to a named public source. Missing or suppressed values stay missing: MN Pulse never fills gaps with estimates or invented values, and projections are always labeled as projections.'

export const DATA_CONVENTIONS: string[] = [
  'Weekly values are labeled by the CDC (MMWR) week-ending Saturday, as ISO dates (YYYY-MM-DD).',
  'Percentages are stored as percent values: 12.5 means 12.5%.',
  'null means the publisher reported the value as missing or suppressed; weeks with no report have no point.',
  'Points on or after a series’ provisionalFrom date are preliminary.',
  'The data format is defined in shared/types.ts in the repository.',
]

export const BIOFIRE_GUIDE = {
  why: [
    'BioFire Syndromic Trends publishes only U.S. and Census-region (four regions) figures. Minnesota is part of the 12-state Midwest region, so no Minnesota-only BioFire numbers are public.',
    'bioMérieux does not offer a public data feed and its terms restrict automated collection from syndromictrends.com, so MN Pulse does not scrape the website.',
    'Instead, MN Pulse loads BioFire Trend CSV exports added to the repository by bioMérieux or a partner lab, and reads bioMérieux’s published “TRENDS Insights” reports for Midwest rates.',
  ],
  steps: [
    'Export the detection-rate CSV from BioFire Trend (or prepare the long format below). Share aggregate rates only, never patient-level data.',
    'Add the file, unchanged, to data/manual/biofire/ in the GitHub repository with a pull request, or attach it to a GitHub issue for the maintainers.',
    'The next pipeline run (within about 3 hours of merging) checks and loads it. A per-file report of accepted and skipped rows is written to data/diagnostics/biofire.json.',
  ],
  wide: {
    name: 'BioFire Trend export (wide)',
    file: 'Trend <Organism> Detection Rates <YYYY-MM-DD>.csv',
    example: 'Trend Influenza A Detection Rates 2026-10-05.csv',
    header: 'Week,US,Northeast,Midwest,West,South',
    notes: [
      'One organism per file; the organism and the download date come from the file name.',
      'Values are proportions from 0 to 1 (0.125 means 12.5%). Files with values above 1 are rejected, never rescaled.',
      'When the same week appears in several files, the newest download wins.',
    ],
  },
  long: {
    name: 'MN Pulse long format',
    header:
      'source,panel,organism_code,organism_label,geo_type,geo_code,week_start,week_end,detection_rate,smoothing,n_tests,n_positive,n_sites,provisional,retrieved_at,source_url,notes',
    notes: [
      'One row per organism × geography × week. Either week_start (a Sunday) or week_end (a Saturday) is enough.',
      'detection_rate is a proportion from 0 to 1. smoothing is 3wk_centered (default), weekly_raw or 2wk_window.',
      'geo_type national with geo_code US, or census_region with geo_code Midwest. Other regions and site-level rows are skipped for now.',
    ],
  },
}
