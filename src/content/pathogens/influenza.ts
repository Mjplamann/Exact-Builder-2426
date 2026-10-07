import type { PathogenProfile } from '../types'

const profile: PathogenProfile = {
  id: 'influenza',
  name: 'Influenza (flu)',
  shortName: 'Flu',
  aka: ['flu', 'seasonal flu', 'influenza A', 'influenza B'],
  category: 'respiratory-viral',
  kind: 'virus',
  biofireTargets: ['Influenza A', 'Influenza A H1', 'Influenza A H1-2009', 'Influenza A H3', 'Influenza B'],
  oneLiner: 'A contagious respiratory virus that peaks in Minnesota winters. Yearly vaccines and early antivirals help prevent serious illness.',
  overview:
    'Influenza (flu) is a contagious illness of the nose, throat, and lungs caused by influenza viruses. Seasonal flu comes from influenza A (mainly the H1N1 and H3N2 subtypes) and influenza B. Most people recover in a week or two, but flu causes tens of thousands of U.S. deaths in many seasons, mostly among older adults. In 2025–26 a changed H3N2 strain called subclade K spread widely, and the 2026–27 vaccine was updated to better match it.',
  seasonality: {
    summary:
      'In Minnesota, flu season usually runs from October through May. Activity most often peaks between December and February, but the timing changes from year to year. Influenza A usually drives the main winter peak. Influenza B often causes a smaller, later wave in late winter or spring.',
    peakMonths: [12, 1, 2],
  },
  transmission:
    'Flu spreads mainly through droplets and tiny particles that people with flu release when they cough, sneeze, or talk. These can reach the mouth or nose of people nearby, or be breathed in. Less often, people catch flu by touching a surface with the virus on it and then touching their mouth, nose, or eyes.',
  incubation: 'Symptoms usually start about 2 days after exposure, with a range of 1 to 4 days.',
  contagiousPeriod:
    'People are most contagious in the first 3 to 4 days after they get sick. Healthy adults can spread flu starting about 1 day before symptoms begin and up to 5 to 7 days after. Young children and people with weakened immune systems may spread it for longer.',
  symptoms: {
    common: [
      'Symptoms that come on suddenly',
      'Fever, feeling feverish, or chills (not everyone with flu has a fever)',
      'Cough',
      'Sore throat',
      'Runny or stuffy nose',
      'Muscle or body aches',
      'Headache',
      'Tiredness (fatigue), often severe',
    ],
    lessCommon: [
      'Vomiting and diarrhea (more common in children than adults)',
      'Ear infections or sinus infections (complications)',
      'Pneumonia (a lung infection), from the flu virus itself or a bacterial infection that follows',
      'Worsening of long-term conditions such as asthma, diabetes, or heart disease',
    ],
    emergencyWarningSigns: [
      'Adults: trouble breathing or shortness of breath',
      'Adults: pain or pressure in the chest or belly that does not go away',
      'Adults: constant dizziness, confusion, or being hard to wake up',
      'Adults: not urinating (peeing), severe muscle pain, or severe weakness or unsteadiness',
      'Children: fast breathing or trouble breathing, or ribs pulling in with each breath',
      'Children: bluish lips or face',
      'Children: chest pain, or muscle pain so bad the child refuses to walk',
      'Children: signs of dehydration (no urine for 8 hours, dry mouth, no tears when crying)',
      'Children: not alert or not interacting when awake',
      'Children: fever above 104°F, or any fever in a baby younger than 12 weeks',
      'Any age: seizures',
      'Any age: fever or cough that gets better but then comes back or gets worse',
      'Any age: a long-term medical condition that gets much worse',
    ],
  },
  ageGroups: {
    infants: {
      risk: 'higher',
      summary:
        'Babies are among the children most likely to be hospitalized with flu. Babies under 6 months are too young for a flu vaccine, so they depend on the people around them for protection.',
      actions: [
        'Get your baby a flu vaccine starting at 6 months. The first time, babies need 2 doses at least 4 weeks apart.',
        'Protect younger babies by making sure everyone who lives with or cares for them gets a flu vaccine.',
        'Call your clinician the same day if your baby has flu symptoms. Antiviral medicine is recommended for children under 2 with flu.',
        'Get prompt medical care for any fever in a baby younger than 12 weeks.',
      ],
    },
    children: {
      risk: 'moderate',
      summary:
        'Most healthy children get better in about a week. Children under 5, and kids with asthma, diabetes, heart disease, or brain and nerve conditions, have a higher risk of pneumonia and hospital stays. Flu kills children every year, and most who die were not vaccinated.',
      actions: [
        'Get a flu vaccine every fall. Children under 9 getting a flu vaccine for the first time need 2 doses, 4 weeks apart.',
        'Ask whether the nasal spray vaccine is an option for healthy kids 2 and older. It is not for children with weakened immune systems or some with asthma.',
        'Call your clinician early if your child is under 5 or has a long-term health condition. Antivirals work best when started within 2 days.',
        'Keep sick children home until they have had no fever for at least 24 hours without fever medicine and feel better overall.',
        'Never give aspirin to children or teens with flu. It can cause Reye’s syndrome, a rare but serious illness.',
      ],
    },
    adults: {
      risk: 'lower',
      summary:
        'Most healthy adults recover within 1 to 2 weeks, though flu can keep you in bed for days. Adults with asthma, diabetes, heart disease, severe obesity, or other long-term conditions have a higher risk of serious illness.',
      actions: [
        'Get a flu vaccine every year, ideally in September or October.',
        'If you have a long-term health condition, call your clinician within 1 to 2 days of flu symptoms to ask about antivirals.',
        'Stay home while sick, and take extra care around others for 5 days after you return to normal activities.',
        'Get vaccinated to help protect babies, older relatives, and anyone you care for.',
      ],
    },
    'older-adults': {
      risk: 'moderate',
      summary:
        'The risk of serious flu rises with age, and many people in this group have heart, lung, or other conditions that raise it further. Flu can also trigger heart attacks and strokes in the weeks after infection.',
      actions: [
        'Get a flu vaccine every fall.',
        'If you have a long-term health condition, call your clinician right away about antivirals if flu symptoms start.',
        'Keep conditions like diabetes, heart disease, and COPD (chronic obstructive pulmonary disease) well managed.',
        'Ask your clinician about other vaccines you may be due for, such as pneumococcal, RSV, and COVID-19.',
      ],
    },
    seniors: {
      risk: 'highest',
      summary:
        'People 65 and older account for most flu hospital stays and deaths. The immune system responds less strongly with age, so CDC prefers stronger flu vaccines for this group.',
      actions: [
        'Get a high-dose, adjuvanted (with an added immune booster), or recombinant flu vaccine each fall. If none is available, get any flu vaccine.',
        'Call your clinician as soon as flu symptoms start. Antivirals are recommended for everyone 65 and older with flu and work best within 2 days.',
        'If you live in a nursing home or assisted living, tell staff about symptoms right away. Antivirals may also be used to prevent flu during outbreaks.',
        'Ask about pneumococcal, RSV, and COVID-19 vaccines too.',
      ],
    },
    pregnant: {
      risk: 'higher',
      summary:
        'Pregnancy changes the immune system, heart, and lungs. This raises the risk of severe flu during pregnancy and up to 2 weeks after delivery, and flu can raise the risk of early (preterm) birth. A flu shot during pregnancy also helps protect your baby for several months after birth.',
      actions: [
        'Get a flu shot (not the nasal spray) during any trimester.',
        'Call your clinician right away if you get flu symptoms while pregnant or within 2 weeks after delivery. Antivirals are recommended, and oseltamivir is the preferred choice in pregnancy.',
        'Treat fever with acetaminophen, as your clinician advises.',
        'Ask your clinician about other vaccines recommended during pregnancy, such as Tdap and RSV.',
      ],
    },
    immunocompromised: {
      risk: 'higher',
      summary:
        'A weakened immune system, from cancer treatment, an organ transplant, HIV, or medicines that suppress the immune system, raises the risk of severe flu. You may also stay contagious longer. Vaccines may work less well, but they still offer important protection.',
      actions: [
        'Get a flu shot every year. Do not get the nasal spray vaccine, which contains a weakened live virus.',
        'Make a plan with your care team to start antivirals quickly if you get flu symptoms or are exposed.',
        'Ask the people you live with to get vaccinated. Your care team can say which vaccine type is best for them.',
        'Wear a well-fitting mask in crowded indoor places when flu activity is high.',
      ],
    },
  },
  treatment: {
    summary:
      'Most people recover at home with rest and fluids. Prescription antiviral medicines can shorten illness by about a day and lower the risk of serious complications. They work best when started within 2 days (48 hours) of the first symptoms. CDC recommends antivirals as soon as possible for anyone who is hospitalized, very sick, or at higher risk, even after 2 days, and treatment should not wait for a test result.',
    options: [
      {
        name: 'Oseltamivir (Tamiflu and generics)',
        type: 'antiviral',
        detail:
          'Pill or liquid, usually taken twice a day for 5 days. It can be used at any age, including newborns, with the amount based on weight. It is the preferred choice during pregnancy and for people in the hospital. It is sometimes used to prevent flu after a close exposure. The most common side effects are nausea and vomiting.',
        who: 'People with flu who are at higher risk, very sick, or hospitalized; others may be treated if seen within 2 days of symptoms.',
      },
      {
        name: 'Baloxavir (Xofluza)',
        type: 'antiviral',
        detail:
          'A single dose taken by mouth. It is approved for treatment and for prevention after exposure in people 5 and older. It is not recommended during pregnancy or while breastfeeding, and it is not used alone for people with severely weakened immune systems.',
        who: 'Otherwise healthy people 5 and older, and people 12 and older at higher risk, who are seen within 2 days of symptoms.',
      },
      {
        name: 'Zanamivir (Relenza)',
        type: 'antiviral',
        detail:
          'A powder breathed in through an inhaler twice a day for 5 days. It is used for treatment in people 7 and older. It is not recommended for people with asthma, COPD, or other lung disease because it can cause breathing problems.',
        who: 'People 7 and older without long-term lung disease.',
      },
      {
        name: 'Peramivir (Rapivab)',
        type: 'antiviral',
        detail: 'A single dose given through a vein (IV) in a clinic or hospital. It can be used for people 6 months and older.',
        who: 'People 6 months and older who cannot take medicine by mouth or need treatment in a clinic or hospital.',
      },
      {
        name: 'Rest, fluids, and fever reducers',
        type: 'supportive',
        detail:
          'Rest and drink plenty of fluids. Acetaminophen or ibuprofen can ease fever and aches; follow the label for age and weight, and ask before giving ibuprofen to babies under 6 months. Do not give aspirin to children or teens.',
        who: 'Everyone with flu.',
      },
    ],
    antibioticsHelp: 'no',
  },
  prevention: {
    vaccines: [
      {
        name: 'Yearly flu shot (inactivated or recombinant vaccine)',
        who: 'Everyone 6 months and older without a medical reason to skip it. CDC and the American Academy of Pediatrics both recommend it every year.',
        notes:
          'Best given in September or October, but still worth getting later while flu is spreading. Protection builds over about 2 weeks. Children 6 months to 8 years who have not had at least 2 flu vaccine doses before need 2 doses, 4 weeks apart. People with an egg allergy can get any flu vaccine that fits their age and health.',
      },
      {
        name: 'High-dose, adjuvanted, or recombinant flu vaccine',
        who: 'Preferred for adults 65 and older. If none of these is available, any age-appropriate flu vaccine should be given.',
        notes: 'These vaccines create a stronger immune response in older adults.',
      },
      {
        name: 'Nasal spray flu vaccine (FluMist)',
        who: 'Healthy, non-pregnant people ages 2 through 49.',
        notes:
          'This vaccine contains a weakened live virus. It is not for pregnant people, people with weakened immune systems, children 2 to 4 with asthma or recent wheezing, or people who recently took flu antiviral medicine. FDA approved a version that can be given at home in 2024.',
      },
    ],
    everyday: [
      'Wash your hands often with soap and water, or use an alcohol-based hand sanitizer.',
      'Cover coughs and sneezes with a tissue or your elbow.',
      'Stay home when sick until you have had no fever for at least 24 hours (without fever medicine) and feel better overall. Then take extra care, like masking, for 5 more days.',
      'Bring in fresh air: open windows when you can, and use good HVAC filters or a portable HEPA air cleaner.',
      'Consider a well-fitting mask in crowded indoor places when flu is high, especially if you or someone you live with is at higher risk.',
      'Clean surfaces that many people touch, such as doorknobs and phones.',
    ],
  },
  testing:
    'During flu season, clinicians often diagnose flu based on symptoms. Clinics can test a nose or throat swab with a rapid test or a more accurate molecular (PCR) test, often with same-day results. Rapid tests can miss flu, so a negative result does not always rule it out. Some home tests check for both flu and COVID-19. If you are at higher risk, your clinician may start antivirals without waiting for a test result.',
  whenToSeekCare: [
    'If you are at higher risk (65 or older, pregnant or recently gave birth, a child under 5, or living with a long-term condition or weakened immune system), call your clinician within the first 1 to 2 days of symptoms about antivirals.',
    'Call your clinician if you are not starting to feel better after several days, or if you have ear pain, sinus pain, or a cough that keeps getting worse.',
    'If you cannot get in quickly, try telehealth or a same-day clinic. Antivirals can often be prescribed without an in-person visit.',
    'Go to urgent care if you need to be seen today but have no emergency warning signs, for example a child who is drinking less than usual.',
    'Call 911 or go to the emergency department for any emergency warning sign, such as trouble breathing, chest pain, confusion, or a seizure.',
  ],
  readingTheNumbers:
    'Flu test positivity is the share of lab flu tests that come back positive. Tests are mostly done on people sick enough to see a clinician or go to the hospital, so this number shows how much of that illness is flu, not how many people are infected. It is usually near zero in summer, then climbs over several weeks in winter, peaks, and falls. The BioFire detection rate is the share of multi-virus respiratory panel tests, run mostly in hospitals and emergency departments on sicker patients, that find influenza A or B. Because the panel checks for many germs at once, it shows how much flu is adding to all the respiratory illness going around. The ED-visit percent is the share of all emergency department visits diagnosed as flu. It shows how much flu is sending people to urgent care. A steady rise over 2 to 3 weeks means flu season is starting or speeding up. For most people, that means: get vaccinated now if you have not (protection takes about 2 weeks), stay home when sick, and if you are at higher risk, call your clinician at the first sign of flu. Numbers for the most recent week or two are often revised.',
  watchNotes: [
    '2026–27 flu vaccines were updated for all three strains they cover, including a change aimed at the H3N2 subclade K virus that spread widely in the 2025–26 season.',
    'In March 2026, a federal court paused changes to the federal vaccine schedule and votes by the reconstituted CDC vaccine advisory committee (ACIP). CDC says its July 2025 flu recommendations stay in effect for 2026–27: a yearly flu vaccine for everyone 6 months and older. The American Academy of Pediatrics’ 2026–27 recommendations also call for yearly flu vaccine for all children 6 months and older.',
    'Bird flu (H5N1) and swine-origin “variant” flu viruses sometimes infect people who work with poultry, dairy cattle, or pigs. These are not seasonal flu and are tracked separately (see the H5N1 profile). Seasonal flu vaccine does not protect against H5N1.',
  ],
  sources: [
    {
      label: 'CDC — Interim clinical considerations for seasonal influenza vaccines',
      url: 'https://www.cdc.gov/flu/hcp/vax-summary/seasonal-influenza-vaccines.html',
    },
    { label: 'CDC — 2026–2027 flu season', url: 'https://cdc.gov/flu/season/2026-2027.html' },
    { label: 'CDC — ACIP flu recommendations summary', url: 'https://cdc.gov/flu/hcp/acip/index.html' },
    {
      label: 'HealthyChildren.org (AAP) — Flu prevention and treatment recommendations for 2026–27',
      url: 'https://www.healthychildren.org/English/news/Pages/aap-(influenza)-flu-prevention-recommendations-for-2026-27.aspx',
    },
    {
      label: 'American Academy of Pediatrics — Preparing for the 2026–27 influenza season',
      url: 'https://www.aap.org/en/patient-care/influenza/preparing-for-flu-season/',
    },
    {
      label: 'Immunize.org — Ask the Experts: influenza vaccine recommendations',
      url: 'https://www.immunize.org/ask-experts/topic/influenza/vaccine-recommendations-influenza/',
    },
    {
      label: 'IDSA — Federal judge blocks immunization schedule changes, stays ACIP appointments (2026)',
      url: 'https://www.idsociety.org/news--publications-new/articles/2026/federal-judge-blocks-immunization-schedule-changes-stays-acip-member-appointments/',
    },
    {
      label: 'IDSA — 2026 guidelines on seasonal vaccines for immunocompromised patients',
      url: 'https://www.idsociety.org/practice-guideline/Seasonal-RTI-Vaccinations-in-Immunocompromised-Patients/',
    },
    {
      label: 'Congressional Research Service — Changes to CDC vaccine recommendations in 2025 and 2026',
      url: 'https://www.congress.gov/crs-product/IN12684',
    },
  ],
  lastReviewed: '2026-10-07',
}

export default profile
