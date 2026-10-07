import type { PathogenProfile } from '../types'

const profile: PathogenProfile = {
  id: 'seasonal-cov',
  name: 'Seasonal (common cold) coronaviruses',
  shortName: 'Seasonal CoV',
  aka: [
    'common human coronaviruses',
    'endemic coronaviruses',
    'HCoV',
    'coronavirus 229E',
    'coronavirus HKU1',
    'coronavirus NL63',
    'coronavirus OC43',
  ],
  category: 'respiratory-viral',
  kind: 'virus',
  biofireTargets: ['Coronavirus 229E', 'Coronavirus HKU1', 'Coronavirus NL63', 'Coronavirus OC43'],
  oneLiner: 'Four common coronaviruses that cause colds, mostly in winter. They are not the virus that causes COVID-19.',
  overview:
    'Four coronaviruses, called 229E, NL63, OC43, and HKU1, cause many common colds. Two were discovered in the 1960s and two in the mid-2000s. They are different from SARS-CoV-2, the virus that causes COVID-19. Most people catch one or more of them during their lives and can catch them again, because protection fades. Infections are usually mild, but they can cause bronchitis or pneumonia (a lung infection) in babies, older adults, and people with weakened immune systems or heart or lung disease.',
  seasonality: {
    summary:
      'In Minnesota, seasonal coronaviruses spread mostly from late fall through early spring, usually peaking in January and February, around the same time as flu and RSV. Few infections are found in summer. Which of the four types is most common changes from year to year, and some types tend to have bigger seasons every other year.',
    peakMonths: [1, 2],
  },
  transmission:
    'These viruses spread mainly through droplets and tiny particles released when an infected person coughs, sneezes, or talks, and through close personal contact, such as touching or shaking hands. Less often, people catch them by touching a surface with the virus on it and then touching their eyes, nose, or mouth.',
  incubation: 'Symptoms usually start about 3 days after exposure, with a typical range of 2 to 5 days.',
  contagiousPeriod:
    'People are most likely to spread these viruses while they have symptoms, especially in the first few days. People with weakened immune systems may stay contagious longer.',
  symptoms: {
    common: [
      'Runny or stuffy nose',
      'Sore throat',
      'Cough',
      'Sneezing',
      'Headache',
      'Fever, more common in children',
      'Feeling generally unwell',
    ],
    lessCommon: [
      'Croup (a barking cough with noisy breathing) in young children, especially with the NL63 type',
      'Wheezing or an asthma flare',
      'Bronchitis (chest cold), or bronchiolitis (a lung infection in babies that causes wheezing)',
      'Pneumonia (a lung infection), mainly in babies, older adults, and people with weakened immune systems or heart or lung disease',
      'Ear infections in children',
      'Worsening of long-term conditions such as COPD (chronic obstructive pulmonary disease)',
    ],
    emergencyWarningSigns: [
      'Trouble breathing, fast breathing, or ribs or belly pulling in with each breath',
      'Bluish or gray lips, face, or fingernails',
      'In a child: noisy, high-pitched breathing (stridor) even while resting, or drooling and trouble swallowing',
      'Chest pain or pressure that does not go away',
      'Confusion, extreme sleepiness, or being hard to wake up',
      'Seizures',
      'Signs of dehydration, such as no urine (pee) for 8 hours, a very dry mouth, or no tears when crying',
      'Fever or cough that gets better but then comes back or gets worse',
      'In a baby younger than 12 weeks: any fever',
    ],
  },
  ageGroups: {
    infants: {
      risk: 'moderate',
      summary:
        'Most babies with a seasonal coronavirus have a cold. Some, especially babies born early or with heart or lung problems, can develop bronchiolitis, croup, or pneumonia and need hospital care.',
      actions: [
        'Clear a stuffy nose with saline (saltwater) drops and gentle suction, especially before feeds and sleep.',
        'Do not give cough and cold medicines or honey to babies under 1 year.',
        'Call your clinician right away for any fever of 100.4°F (38°C) or higher in a baby younger than 3 months.',
        'Get care quickly if your baby is breathing fast or hard, is feeding poorly, or has fewer wet diapers.',
        'Ask anyone with a cold to stay away from your baby during winter cold season, and have everyone wash their hands first.',
      ],
    },
    children: {
      risk: 'lower',
      summary:
        'Children catch these viruses often, usually as a cold. Young children can get croup, and children with asthma can have flare-ups.',
      actions: [
        'Keep your child home while they have a fever and until they feel well enough for normal activities.',
        'If your child has asthma, follow their asthma action plan, and keep their quick-relief inhaler handy.',
        'If your child has a croup cough, keep them calm, since crying can make breathing harder. Get care right away if breathing is noisy while resting.',
        'Teach handwashing and coughing or sneezing into an elbow.',
      ],
    },
    adults: {
      risk: 'lower',
      summary:
        'For most healthy adults, these viruses cause an ordinary cold that gets better in about a week. You can catch the same type again in a later season.',
      actions: [
        'Rest, drink fluids, and use over-the-counter medicines for symptoms if needed.',
        'Stay home when you are sick, and cover coughs and sneezes.',
        'Wash your hands often, especially before holding babies or visiting older relatives.',
      ],
    },
    'older-adults': {
      risk: 'lower',
      summary:
        'Usually a mild cold at this age. A cold can set off flare-ups of conditions such as COPD, asthma, or heart failure.',
      actions: [
        'Keep long-term conditions like COPD, asthma, and heart disease well managed.',
        'Call your clinician if a cold makes your breathing or a long-term condition worse.',
        'Wash your hands often, and avoid touching your eyes, nose, and mouth.',
      ],
    },
    seniors: {
      risk: 'moderate',
      summary:
        'Older adults, especially those with lung or heart disease, can develop pneumonia from these viruses. They can also cause outbreaks in nursing homes and other long-term care settings.',
      actions: [
        'Call your clinician if a cold comes with fever, shortness of breath, or chest pain, or if you feel much worse after a few days.',
        'If you live in a nursing home or assisted living, tell staff about cold symptoms so they can help stop the spread.',
        'Keep lung and heart conditions well managed, and take your medicines as prescribed.',
        'Ask your clinician which vaccines, such as flu, COVID-19, RSV, and pneumococcal, are right for you. They do not prevent these colds, but they protect against other serious lung infections.',
      ],
    },
    pregnant: {
      risk: 'lower',
      summary:
        'There is no evidence that seasonal coronaviruses are more serious during pregnancy. They usually cause a mild cold.',
      actions: [
        'Ask your prenatal care provider or pharmacist before taking any cold medicine.',
        'Try saline nose spray, a cool-mist humidifier, rest, and fluids to ease symptoms.',
        'Call your provider if you have a high fever, trouble breathing, or cannot keep fluids down.',
      ],
    },
    immunocompromised: {
      risk: 'higher',
      summary:
        'People with weakened immune systems, such as transplant recipients or people getting cancer treatment, can get more serious lung infections, including pneumonia, and may stay sick and contagious longer.',
      actions: [
        'Call your care team early if you get cold symptoms with fever, cough, or shortness of breath.',
        'Ask whether you need testing, since several viruses can cause the same symptoms.',
        'Ask people with colds to keep their distance, and wash your hands often.',
        'Consider a well-fitting mask in crowded indoor places during winter.',
      ],
    },
  },
  treatment: {
    summary:
      'There is no specific medicine for seasonal coronaviruses, and most people get better on their own in about a week. Medicines for COVID-19, such as Paxlovid, are approved for COVID-19 only and are not used for these viruses. Treatment focuses on easing symptoms. Antibiotics do not help unless a bacterial infection, such as an ear infection or pneumonia, develops.',
    options: [
      {
        name: 'Rest, fluids, and moist air',
        type: 'supportive',
        detail:
          'Rest and drink plenty of fluids. A cool-mist humidifier or a hot shower can ease a sore throat and cough. For babies, saline (saltwater) drops and gentle suction help clear the nose.',
        who: 'Everyone with a cold.',
      },
      {
        name: 'Pain and fever relievers (acetaminophen or ibuprofen)',
        type: 'supportive',
        detail:
          'These can ease fever, sore throat, and aches. Follow the label for age and weight, and ask before giving ibuprofen to a baby under 6 months. Never give aspirin to children or teens, because it can cause Reye’s syndrome, a rare but serious illness.',
        who: 'People with fever or pain who are uncomfortable.',
      },
      {
        name: 'Honey for cough',
        type: 'supportive',
        detail:
          'A small spoonful of honey can ease coughing in children 1 year and older. Never give honey to babies under 1 year, because it can cause infant botulism, a serious illness.',
        who: 'Children 1 year and older, and adults.',
      },
      {
        name: 'Over-the-counter cough and cold medicines',
        type: 'other',
        detail:
          'These may ease symptoms in adults and older children, but they do not make a cold go away faster. Do not give them to children under 4 unless a clinician tells you to. Read labels so you do not take two products with the same ingredient, such as acetaminophen.',
        who: 'Adults and older children who want symptom relief.',
      },
      {
        name: 'Steroid medicine for croup',
        type: 'other',
        detail:
          'For a child with croup, a clinician may give a single dose of steroid medicine to reduce swelling in the airway. Children with severe croup may need breathing treatments in a clinic or hospital.',
        who: 'Children with croup, as decided by a clinician.',
      },
      {
        name: 'Hospital care for severe illness',
        type: 'supportive',
        detail: 'People with pneumonia or severe breathing trouble may need oxygen or breathing support in the hospital.',
        who: 'People who are very sick, most often babies, older adults, and people with weakened immune systems.',
      },
    ],
    antibioticsHelp: 'no',
  },
  prevention: {
    vaccines: [],
    everyday: [
      'Wash your hands often with soap and water for at least 20 seconds, or use an alcohol-based hand sanitizer.',
      'Avoid touching your eyes, nose, and mouth with unwashed hands.',
      'Avoid close contact with people who are sick, and stay home when you are sick.',
      'Cover coughs and sneezes with a tissue or your elbow.',
      'Clean often-touched surfaces, such as doorknobs and phones.',
      'Bring in fresh air when you can, and consider a well-fitting mask in crowded indoor places in winter if you or someone you live with is at higher risk.',
    ],
  },
  testing:
    'Most people with a cold do not need a test. Hospitals and some clinics use multiplex PCR panels (one test that checks a nose swab for many germs at once), such as the BioFire Respiratory Panel, which reports each type separately: Coronavirus 229E, HKU1, NL63, and OC43. These results are separate from the SARS-CoV-2 (COVID-19) result on the same panel, so a positive result for a seasonal coronavirus does not mean you have COVID-19. Home COVID-19 tests look only for SARS-CoV-2, so they cannot detect these viruses. Seasonal coronaviruses are often found along with another virus, so a positive result does not always explain an illness.',
  whenToSeekCare: [
    'Call your clinician if cold symptoms last more than 10 days without getting better, or if a fever lasts more than 4 days.',
    'Call if symptoms such as fever or cough get better but then come back or get worse.',
    'Call if a cold makes asthma, COPD, heart disease, or another long-term condition worse.',
    'Call early if you have a weakened immune system, or if your baby is younger than 3 months and has a fever.',
    'Go to urgent care if you or your child needs to be seen today, for example for a croup cough that does not settle or ear pain, but has no emergency warning signs.',
    'Call 911 or go to the emergency department for any emergency warning sign, such as trouble breathing or bluish lips.',
  ],
  readingTheNumbers:
    'MN Pulse shows seasonal coronaviruses mainly as a BioFire detection rate: the percent of BioFire respiratory panel tests at participating labs in the Midwest (not just Minnesota) that found any of the four types (229E, HKU1, NL63, or OC43). These panels are run mostly on people sick enough to go to a hospital, emergency department, or clinic. It shows trends, not how many people are sick. This number has a clear winter season. In BioFire data it stays low in summer and can rise more than 10 times higher during the fall-to-spring respiratory season. About half of positive tests also find another virus. The size of the winter peak changes from year to year, partly because some types have bigger seasons every other year. MDH also reports weekly seasonal coronavirus results from a group of Minnesota labs that run respiratory panels. None of these numbers include COVID-19, which has its own measures on MN Pulse. Public emergency department (ED) visit data and wastewater programs do not track seasonal coronaviruses separately. A steady rise over 2 to 3 weeks in late fall or winter means cold season is picking up. For most people, that means routine steps: wash hands, cover coughs, and stay home when sick, and take extra care around babies, older adults, and anyone with a weakened immune system. Numbers for the most recent week or two may be revised.',
  watchNotes: [
    'There is no vaccine for these four coronaviruses. COVID-19 vaccines are made for SARS-CoV-2 and are not designed to prevent seasonal coronavirus colds.',
    'If a respiratory panel result says “coronavirus,” check which one. A positive result for 229E, HKU1, NL63, or OC43 means a common cold coronavirus, not COVID-19.',
  ],
  sources: [
    {
      label: 'Meyers et al. — Automated real-time collection of pathogen-specific diagnostic data (BioFire Syndromic Trends), JMIR Public Health and Surveillance, 2018',
      url: 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC6054708/',
    },
    {
      label: 'MDH — Viral respiratory illness in Minnesota: laboratory data',
      url: 'https://www.health.state.mn.us/diseases/respiratory/stats/lab.html',
    },
    {
      label: 'MDH — Viral respiratory illness in Minnesota',
      url: 'https://www.health.state.mn.us/diseases/respiratory/stats/index.html',
    },
    { label: 'BioFire Syndromic Trends (bioMérieux)', url: 'https://syndromictrends.com/' },
    {
      label: 'bioMérieux — Syndromic Trends reports',
      url: 'https://www.biomerieux.com/us/en/education/resource-hub/trends-reports.html',
    },
  ],
  lastReviewed: '2026-10-07',
}

export default profile
