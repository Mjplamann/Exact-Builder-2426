import type { PathogenProfile } from '../types'

const profile: PathogenProfile = {
  id: 'hmpv',
  name: 'Human metapneumovirus (hMPV)',
  shortName: 'hMPV',
  aka: ['HMPV', 'Metapneumovirus'],
  category: 'respiratory-viral',
  kind: 'virus',
  biofireTargets: ['Human Metapneumovirus'],
  oneLiner: 'A common late-winter and spring virus, related to RSV, that causes colds and can lead to pneumonia in babies and older adults.',
  overview:
    'Human metapneumovirus (hMPV) is a common respiratory virus related to RSV. It was first identified in 2001, but it has been spreading among people for decades and is not a new virus. Most children have had it by age 5, and people can catch it again throughout life. It usually causes a cold, but in babies, young children, older adults, and people with weak immune systems or lung disease it can cause bronchiolitis (swelling of the small airways) or pneumonia.',
  seasonality: {
    summary:
      'In Minnesota and other areas with cold winters, hMPV usually spreads in late winter and spring. It often rises after RSV peaks, with most activity from about February through April or May. It is usually low in summer and fall.',
    peakMonths: [2, 3, 4],
  },
  transmission:
    'hMPV spreads through droplets when a sick person coughs or sneezes. It also spreads through close contact, like touching or shaking hands, and by touching a surface with the virus on it and then touching your mouth, nose, or eyes.',
  incubation: 'Symptoms usually start 3 to 6 days after a person is infected.',
  contagiousPeriod:
    'People are most likely to spread hMPV while they have symptoms. Young children and people with weakened immune systems may spread the virus for longer.',
  symptoms: {
    common: ['Cough', 'Fever', 'Runny or stuffy nose', 'Sore throat', 'Shortness of breath'],
    lessCommon: [
      'Wheezing (a whistling sound when breathing out)',
      'Hoarse voice',
      'Ear infection in young children',
      'Worsening of asthma or COPD (chronic obstructive pulmonary disease)',
      'Bronchiolitis (swelling of the small airways in the lungs) or pneumonia',
    ],
    emergencyWarningSigns: [
      'Fast, hard, or shallow breathing, or struggling to breathe',
      'Skin pulling in between or below the ribs with each breath, flaring nostrils, or grunting',
      'Pauses in breathing in a baby',
      'Bluish or gray color of the lips, tongue, nails, or skin',
      'Not drinking or feeding, with few or no wet diapers or very little urine',
      'Very sleepy, hard to wake, or not responding',
      'Chest pain or pressure, or new confusion',
    ],
  },
  ageGroups: {
    infants: {
      risk: 'higher',
      summary:
        'hMPV is one of the main causes of bronchiolitis and pneumonia in babies, after RSV. Babies born early or with heart or lung problems are more likely to need hospital care.',
      actions: [
        'Keep sick people away from your baby and ask visitors to wash their hands.',
        'Use saline drops and gentle suction to clear a stuffy nose, especially before feeds.',
        'Know that RSV shots do not protect against hMPV, so everyday precautions still matter.',
        'Call your clinician right away if a baby younger than 3 months has a fever of 100.4°F (38°C) or higher, taken rectally (in the bottom).',
        'Watch for fast or hard breathing and feeding trouble, and seek care quickly if you see them.',
      ],
    },
    children: {
      risk: 'moderate',
      summary:
        'Most children catch hMPV by age 5. Most have a cold, but children under 5 and those with asthma or heart or lung disease can get wheezing or pneumonia.',
      actions: [
        'Keep children home from school or child care while they have a fever.',
        'Teach handwashing and coughing into an elbow.',
        'If your child has asthma, follow their asthma action plan and call if wheezing gets worse.',
        'Keep sick siblings away from newborns.',
      ],
    },
    adults: {
      risk: 'lower',
      summary:
        'Most healthy adults under 50 have a mild cold-like illness. Adults with asthma, COPD, or a weakened immune system can have more serious breathing problems.',
      actions: [
        'Rest, drink fluids, and stay home while you have a fever.',
        'Stay away from babies, older relatives, and people with weak immune systems while you are sick.',
        'If you have asthma or COPD, follow your action plan and call your clinician if your breathing gets worse.',
      ],
    },
    'older-adults': {
      risk: 'moderate',
      summary:
        'Adults 50 to 64 with chronic heart or lung disease can get serious illness from hMPV, and it can trigger flare-ups of asthma, COPD, or heart failure.',
      actions: [
        'Wash hands often and avoid close contact with people who are sick, especially in late winter and spring.',
        'Call your clinician early if a cold makes your breathing, asthma, COPD, or heart failure worse.',
        'Ask your clinician which respiratory vaccines fit you, such as flu, COVID-19, and RSV (recommended for adults 50 to 74 at higher risk). They prevent other illnesses that look similar.',
      ],
    },
    seniors: {
      risk: 'higher',
      summary:
        'Adults 65 and older are more likely to be hospitalized with hMPV, and outbreaks can happen in nursing homes. It can worsen heart and lung disease.',
      actions: [
        'Wash hands often and avoid close contact with people who are sick.',
        'Seek care early for worsening shortness of breath, chest pain, or confusion.',
        'If you live in or visit a long-term care facility, follow its guidance during respiratory outbreaks.',
        'Ask your clinician which respiratory vaccines fit you, such as flu, COVID-19, and RSV (recommended for everyone 75 and older and for some people 65 to 74). They prevent illnesses with similar symptoms.',
      ],
    },
    pregnant: {
      risk: 'lower',
      summary:
        'Little is known about hMPV in pregnancy, and most pregnant people seem to have a mild illness. Pregnancy can make breathing illnesses harder to handle, so take breathing problems seriously.',
      actions: [
        'Wash hands often and avoid close contact with people who are sick.',
        'Call your clinician if you have trouble breathing or a fever that does not go away.',
        'Ask your clinician which fever and cold medicines are safe during pregnancy.',
      ],
    },
    immunocompromised: {
      risk: 'higher',
      summary:
        'People with weakened immune systems, such as transplant recipients or people getting cancer treatment, can develop severe pneumonia from hMPV and may stay sick and contagious longer.',
      actions: [
        'Contact your care team early if you get cold symptoms with fever or trouble breathing.',
        'Ask household members to wash hands often and stay away when they are sick.',
        'Avoid crowded indoor spaces and consider wearing a well-fitting mask when hMPV and other respiratory viruses are rising.',
      ],
    },
  },
  treatment: {
    summary:
      'There is no specific antiviral medicine for hMPV. Most people get better on their own with rest, fluids, and fever relief. People who have trouble breathing or cannot drink enough may need hospital care for oxygen and fluids. Antibiotics do not help unless a bacterial infection develops.',
    options: [
      {
        name: 'Home care: rest, fluids, and fever relief',
        type: 'supportive',
        detail:
          'Rest and drink plenty of fluids. Acetaminophen or ibuprofen can ease fever and aches; follow the label or your clinician’s advice for age and weight. Call your clinician before giving any fever medicine to a baby younger than 3 months, and do not give ibuprofen to babies under 6 months unless your clinician says to. Never give aspirin to children or teens.',
        who: 'Most people with mild illness',
      },
      {
        name: 'Saline drops and nasal suction',
        type: 'supportive',
        detail:
          'Saline (salt-water) drops and a bulb syringe or nasal aspirator can clear mucus so a baby can breathe and feed more easily. Do not give over-the-counter cough and cold medicines to children under 4 unless your clinician says it is OK.',
        who: 'Babies and young children with a stuffy nose',
      },
      {
        name: 'Hospital care',
        type: 'supportive',
        detail: 'Oxygen, fluids through an IV, and sometimes breathing support, until the person can breathe and drink well on their own.',
        who: 'People with trouble breathing, low oxygen, or dehydration',
      },
      {
        name: 'Antibiotics (only for a bacterial complication)',
        type: 'antibiotic',
        detail:
          'Antibiotics do not work against hMPV. A clinician may prescribe them only if a bacterial infection, such as an ear infection or bacterial pneumonia, develops.',
        who: 'Only people diagnosed with a bacterial infection',
      },
    ],
    antibioticsHelp: 'no',
  },
  prevention: {
    vaccines: [],
    everyday: [
      'Wash hands often with soap and water for at least 20 seconds.',
      'Avoid touching your eyes, nose, and mouth with unwashed hands.',
      'Cover coughs and sneezes with a tissue or your elbow.',
      'Stay home when you are sick, and keep sick children home from child care and school.',
      'Avoid close contact, such as kissing or sharing cups and utensils, with people who are sick.',
      'Clean often-touched surfaces such as toys, doorknobs, and phones.',
    ],
  },
  testing:
    'hMPV is usually found with a lab (PCR) test on a nose swab, most often as part of a multi-virus panel that checks for many respiratory germs at once. These panels are mostly used for people in the hospital or emergency department, young children, and people with weakened immune systems. Healthy people with a mild cold usually do not need a test, because the result would not change their care. Home tests sold for COVID-19 and flu do not detect hMPV.',
  whenToSeekCare: [
    'Call 911 or go to the emergency department for any emergency warning sign, such as struggling to breathe, pauses in breathing, or blue or gray lips.',
    'Call your clinician right away if a baby younger than 3 months has a fever of 100.4°F (38°C) or higher, taken rectally (in the bottom).',
    'Call your clinician the same day if a baby or young child is feeding or drinking much less than usual or has fewer wet diapers.',
    'Call your clinician if symptoms get worse after a few days, a fever lasts more than 2 to 3 days, or wheezing is new or getting worse.',
    'Adults 65 and older, and anyone with heart or lung disease or a weakened immune system, should call early if breathing gets worse.',
    'Urgent care can help with a worsening cough or ear pain when your regular clinic is closed. Go to the emergency department, not urgent care, for trouble breathing.',
  ],
  readingTheNumbers:
    'MN Pulse tracks hMPV with lab test positivity and wastewater. Test positivity is the share of hMPV lab (PCR) tests that come back positive among people who were tested. It comes from Minnesota labs that run multi-virus panels and report to MDH, and from CDC’s lab network for Minnesota and five nearby states (HHS Region 5). It is not the share of people infected. These lab tests are mostly done for people sick enough to visit a hospital, emergency department, or clinic, often children. So the numbers show how much serious breathing illness is due to hMPV. They do not show how many people are infected. Wastewater levels measure hMPV in sewage at 4 Minnesota treatment plants (WastewaterSCAN; none in the Twin Cities). They can be an early signal, but they do not count cases. When available, MN Pulse can also show a BioFire detection rate: the share of multi-virus panel tests at participating labs in the Midwest (or nationwide, when regional data are not available) that find hMPV. No Minnesota-only BioFire data are public. CDC’s public emergency department data cover COVID-19, flu, and RSV but not hMPV. hMPV is usually low in summer and fall and rises in late winter and spring, often after RSV peaks. A steady rise for two or more weeks means hMPV is spreading in the region. For most people, that means a higher chance a cough or cold is hMPV. Because there is no vaccine, it is a good time for extra handwashing, keeping sick children home, and protecting babies, older adults, and people with lung disease. Numbers for the most recent week or two may be revised.',
  watchNotes: [
    'There is no vaccine or antiviral medicine for hMPV. Vaccines that would protect against both RSV and hMPV are being studied, but none are approved.',
    'In Minnesota, most hMPV activity for the 2026–27 season is expected in late winter and spring 2027, after the usual RSV peak.',
  ],
  sources: [
    { label: 'CDC — About human metapneumovirus', url: 'https://www.cdc.gov/human-metapneumovirus/about/index.html' },
    {
      label: 'CDC MMWR (2025) — Epidemiology of symptomatic human metapneumovirus infection',
      url: 'https://www.cdc.gov/mmwr/volumes/74/wr/mm7411a2.htm',
    },
    { label: 'CDC — RSV vaccines for adults', url: 'https://www.cdc.gov/rsv/vaccines/adults.html' },
    { label: 'MDH — Viral respiratory illness in Minnesota', url: 'https://www.health.state.mn.us/diseases/respiratory/stats/index.html' },
    { label: 'MDH — Respiratory laboratory surveillance data', url: 'https://www.health.state.mn.us/diseases/respiratory/stats/lab.html' },
    { label: 'CDC NREVSS — Respiratory virus lab test positivity dashboard', url: 'https://www.cdc.gov/nrevss/php/dashboard/index.html' },
    { label: 'WastewaterSCAN data dashboard', url: 'https://data.wastewaterscan.org/' },
    { label: 'BIOFIRE Syndromic Trends (bioMérieux)', url: 'https://syndromictrends.com/' },
  ],
  lastReviewed: '2026-10-07',
}

export default profile
