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
    'Four coronaviruses, called 229E, NL63, OC43, and HKU1, cause many common colds. They are different from SARS-CoV-2, the virus that causes COVID-19. Most people catch one or more of them during their lives and can catch them again, because protection fades. Infections are usually mild, but they can cause bronchitis or pneumonia (a lung infection) in babies, older adults, and people with weakened immune systems or heart or lung disease.',
  seasonality: {
    summary:
      'In the U.S., including Minnesota, seasonal coronaviruses spread mostly from late fall through early spring, usually peaking in mid-winter (often January or February), around the same time as flu and RSV. Few infections are found in summer. Which of the four types is most common changes from year to year.',
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
      risk: 'higher',
      summary:
        'Most babies with a seasonal coronavirus have a cold. But babies are among the groups more likely to get bronchiolitis, croup, or pneumonia from these viruses, especially babies born early or with heart or lung problems. Some need hospital care.',
      actions: [
        'Clear a stuffy nose with saline (saltwater) drops and gentle suction, especially before feeds and sleep.',
        'Do not give cough and cold medicines or honey to babies under 1 year.',
        'Call your clinician right away if a baby younger than 3 months has a fever of 100.4°F (38°C) or higher, taken rectally (in the bottom). Call before giving any fever medicine.',
        'Get care quickly if your baby is breathing fast or hard, is feeding poorly, or has fewer wet diapers.',
        'Ask anyone with a cold to stay away from your baby during winter cold season, and have everyone wash their hands first.',
      ],
    },
    children: {
      risk: 'lower',
      summary:
        'Children catch these viruses often, usually as a cold. Young children can get croup, and children with asthma can have flare-ups.',
      actions: [
        'Keep your child home until their symptoms are getting better and they have had no fever for 24 hours without fever-reducing medicine.',
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
        'Ask your clinician which vaccines (flu, COVID-19, pneumococcal, and RSV if you are at higher risk) are right for you. They do not prevent these colds, but they protect against other serious lung infections.',
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
        'Seasonal coronaviruses are not known to be more serious during pregnancy. They usually cause a mild cold.',
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
      'There is no specific medicine for seasonal coronaviruses, and most people get better on their own in about a week. COVID-19 medicines, such as nirmatrelvir with ritonavir (Paxlovid), are approved for COVID-19 only and are not used for these viruses. Treatment focuses on easing symptoms. Antibiotics do not help unless a bacterial infection, such as an ear infection or pneumonia, develops.',
    options: [
      {
        name: 'Rest, fluids, and moist air',
        type: 'supportive',
        detail:
          'Rest and drink plenty of fluids. A cool-mist humidifier can ease a stuffy nose and cough. Some adults find a warm shower soothing, but do not use hot steam or boiling water with children, because it can cause burns. For babies, saline (saltwater) drops and gentle suction help clear the nose.',
        who: 'Everyone with a cold.',
      },
      {
        name: 'Pain and fever relievers (acetaminophen or ibuprofen)',
        type: 'supportive',
        detail:
          'These can ease fever, sore throat, and aches. Follow the label or your clinician’s advice for age and weight. Call your clinician before giving any fever medicine to a baby younger than 3 months, and do not give ibuprofen to babies under 6 months unless your clinician says to. Never give aspirin to children or teens, because it can cause Reye’s syndrome, a rare but serious illness.',
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
          'These may ease symptoms in adults and older children, but they do not make a cold go away faster. Do not give them to children under 4, and ask a clinician before giving them to children 4 to 6. Read labels so you do not take two products with the same ingredient, such as acetaminophen.',
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
    'Most people with a cold do not need a test. Hospitals and some clinics use multiplex PCR panels, which check one nose swab for many germs at once by finding their genetic material. The full BioFire Respiratory Panel reports each type separately: Coronavirus 229E, HKU1, NL63, and OC43. Some other panels give a single “coronavirus” result instead. Either way, this result is separate from the SARS-CoV-2 (COVID-19) result on the same panel. So a positive result for a seasonal coronavirus does not mean you have COVID-19. Home COVID-19 tests look only for SARS-CoV-2, so they cannot detect these viruses. Seasonal coronaviruses are often found along with another virus, so a positive result does not always explain an illness.',
  whenToSeekCare: [
    'Call your clinician if a child under 2 has a fever for more than 24 hours, or if anyone older has a fever for more than 3 days.',
    'Call if cold symptoms last more than 10 days without getting better, or if symptoms such as fever or cough get better but then come back or get worse.',
    'Call if a cold makes asthma, COPD, heart disease, or another long-term condition worse.',
    'Call early if you have a weakened immune system, or if your baby is younger than 3 months and has a fever.',
    'Go to urgent care if you or your child needs to be seen today but has no emergency warning signs. Examples include a croup cough that does not settle, or ear pain.',
    'Call 911 or go to the emergency department for any emergency warning sign, such as trouble breathing or bluish lips.',
  ],
  readingTheNumbers:
    'MN Pulse tracks seasonal coronaviruses with two kinds of lab data. Test positivity is the share of PCR lab tests for these viruses that come back positive. It comes from Minnesota labs that report to MDH, and from CDC’s lab network (NREVSS) for HHS Region 5: Minnesota, Wisconsin, Illinois, Indiana, Michigan, and Ohio. The BioFire detection rate is the share of BioFire panel tests at participating Midwest labs (or nationwide, when Midwest data are not available) that find any of the four types. These tests are done mostly on people sick enough to visit a clinic, emergency department, or hospital. So the numbers show trends among tested patients, not how many people are sick. None of them include COVID-19, which has its own measures on MN Pulse. These viruses have a clear winter season. In BioFire data from 2013 to 2017, they rose more than 10 times above their summer level during the October-to-March season. The size of the winter peak changes from year to year. Emergency department and wastewater data do not track these viruses. A steady rise over 2 to 3 weeks in late fall or winter means cold season is picking up. For most people, that means routine steps: wash hands, cover coughs, and stay home when sick. Take extra care around babies, older adults, and anyone with a weakened immune system. Numbers for the most recent week or two may be revised.',
  watchNotes: [
    'As of early October 2026, seasonal coronavirus season has usually not yet started. These viruses typically begin rising in late fall, so an increase over the coming weeks would be expected.',
    'There is no vaccine for these four coronaviruses. COVID-19 vaccines are made for SARS-CoV-2 and are not designed to prevent seasonal coronavirus colds.',
  ],
  sources: [
    { label: 'CDC — Common human coronaviruses (fact sheet)', url: 'https://www.cdc.gov/coronavirus/downloads/Common-HCoV-fact-sheet-508.pdf' },
    {
      label: 'CDC Emerging Infectious Diseases — Seasonality of common human coronaviruses, United States, 2014–2021',
      url: 'https://wwwnc.cdc.gov/eid/article/28/10/22-0396_article',
    },
    { label: 'CDC — Manage common cold', url: 'https://www.cdc.gov/common-cold/treatment/index.html' },
    {
      label: 'AAP HealthyChildren.org — Coughs and colds: medicines or home remedies?',
      url: 'https://www.healthychildren.org/English/health-issues/conditions/chest-lungs/Pages/Coughs-and-Colds-Medicines-or-Home-Remedies.aspx',
    },
    { label: 'CDC — NREVSS dashboard', url: 'https://www.cdc.gov/nrevss/php/dashboard/index.html' },
    {
      label: 'CDC — Preventing spread of respiratory viruses when you’re sick',
      url: 'https://www.cdc.gov/respiratory-viruses/prevention/precautions-when-sick.html',
    },
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
