import type { PathogenProfile } from '../types'

const profile: PathogenProfile = {
  id: 'parainfluenza',
  name: 'Human parainfluenza viruses (HPIV)',
  shortName: 'Parainfluenza',
  aka: ['HPIV', 'PIV', 'Parainfluenza types 1–4'],
  category: 'respiratory-viral',
  kind: 'virus',
  biofireTargets: ['Parainfluenza Virus 1', 'Parainfluenza Virus 2', 'Parainfluenza Virus 3', 'Parainfluenza Virus 4'],
  oneLiner: 'Four related viruses that cause colds and croup (a barking cough) in young children, with seasons in fall and spring.',
  overview:
    'Human parainfluenza viruses (HPIVs) are a group of four related viruses, called types 1, 2, 3, and 4, and people can catch them more than once. Despite the name, they are not a kind of influenza (flu). They commonly cause colds, and they are the most common cause of croup, a swelling around the voice box and windpipe that gives young children a barking cough. Type 3 can also cause bronchiolitis (swelling of the small airways) and pneumonia in babies, and HPIVs can be serious for people with weakened immune systems.',
  seasonality: {
    summary:
      'Each type has its own season. Types 1 and 2 usually cause croup in the fall (about September through November), and type 1 has often had bigger fall seasons every other year. Type 3 usually peaks in spring and early summer but can be found all year. Type 4 is less well understood. Across the U.S., including the Upper Midwest, this often means two rises a year, one in fall and one in spring. Patterns were disrupted during the COVID-19 pandemic and can vary from year to year.',
    peakMonths: [4, 5, 6, 10, 11],
  },
  transmission:
    'Parainfluenza spreads through droplets when a sick person coughs or sneezes. It also spreads through close contact, like shaking hands, and by touching a surface with the virus on it and then touching your mouth, nose, or eyes.',
  incubation: 'Symptoms usually start 2 to 6 days after a person is infected.',
  contagiousPeriod:
    'People are most likely to spread parainfluenza while they have symptoms, and they may spread it shortly before symptoms start. Young children and people with weakened immune systems can spread the virus for longer, sometimes for weeks.',
  symptoms: {
    common: ['Runny or stuffy nose', 'Cough', 'Fever', 'Sore throat', 'Sneezing'],
    lessCommon: [
      'Croup in young children: a barking, seal-like cough, hoarse voice, and stridor (a high-pitched, noisy sound when breathing in), often worse at night',
      'Wheezing (a whistling sound when breathing out)',
      'Ear pain or ear infection',
      'Fussiness and eating less in young children',
      'Bronchiolitis (swelling of the small airways in the lungs) or pneumonia, especially in babies, older adults, and people with weak immune systems',
    ],
    emergencyWarningSigns: [
      'Stridor (a high-pitched, noisy sound when breathing in) while resting, or stridor that is getting louder',
      'Struggling to breathe, or skin pulling in between or below the ribs or at the neck with each breath',
      'Drooling or trouble swallowing',
      'Unable to speak or cry because of trouble breathing',
      'Bluish or gray color of the lips, tongue, nails, or skin',
      'Very sleepy, hard to wake, or very restless and anxious from trouble breathing',
      'Not drinking, with few or no wet diapers or very little urine',
      'Fast breathing, or pauses in breathing, in a baby',
      'High fever in a child who looks very sick or is getting worse quickly',
    ],
  },
  ageGroups: {
    infants: {
      risk: 'higher',
      summary:
        'Babies can get croup, and type 3 is a common cause of bronchiolitis and pneumonia in the first year of life. Most recover at home, but some need hospital care for breathing or feeding problems.',
      actions: [
        'Keep sick people away from your baby and ask visitors to wash their hands.',
        'Use saline drops and gentle suction to clear a stuffy nose, especially before feeds.',
        'Call your clinician right away if a baby younger than 3 months has a fever of 100.4°F (38°C) or higher, taken rectally (in the bottom).',
        'Seek emergency care for noisy breathing at rest, fast or hard breathing, or trouble feeding.',
      ],
    },
    children: {
      risk: 'moderate',
      summary:
        'Croup is most common in children younger than 5, especially from about 6 months to 3 years. Most cases are mild and last a few days, but croup can be scary because the barking cough and noisy breathing often get worse at night.',
      actions: [
        'Stay calm and comfort your child; crying and fear can make breathing harder.',
        'Hold your child upright and offer fluids.',
        'Call your clinician if your child has croup with stridor, even if it comes and goes; a steroid medicine can help.',
        'Keep children home from school or child care while they have a fever.',
        'Teach handwashing and coughing into an elbow.',
      ],
    },
    adults: {
      risk: 'lower',
      summary:
        'Most healthy adults have a mild cold or no symptoms. Adults with asthma, COPD (chronic obstructive pulmonary disease), or a weakened immune system can have more trouble.',
      actions: [
        'Rest, drink fluids, and stay home while you have a fever.',
        'Stay away from babies, older relatives, and people with weak immune systems while you are sick.',
        'If you have asthma or COPD, follow your action plan and call your clinician if your breathing gets worse.',
      ],
    },
    'older-adults': {
      risk: 'lower',
      summary:
        'Most adults 50 to 64 have a mild illness. Those with chronic heart or lung disease can have worse breathing problems.',
      actions: [
        'Wash hands often and avoid close contact with people who are sick.',
        'Call your clinician early if a cold makes your breathing, asthma, COPD, or heart failure worse.',
        'Stay home while you have a fever.',
      ],
    },
    seniors: {
      risk: 'moderate',
      summary:
        'Older adults can develop pneumonia from parainfluenza, and outbreaks can happen in nursing homes and other long-term care settings.',
      actions: [
        'Wash hands often and avoid close contact with people who are sick.',
        'Seek care early for worsening shortness of breath, chest pain, or confusion.',
        'If you live in or visit a long-term care facility, follow its guidance during respiratory outbreaks.',
      ],
    },
    pregnant: {
      risk: 'lower',
      summary:
        'Little is known about parainfluenza in pregnancy, and most pregnant people seem to have a mild cold. Pregnancy can make breathing illnesses harder to handle, so take breathing problems seriously.',
      actions: [
        'Wash hands often and avoid close contact with people who are sick.',
        'Call your clinician if you have trouble breathing or a fever that does not go away.',
        'Ask your clinician which fever and cold medicines are safe during pregnancy.',
      ],
    },
    immunocompromised: {
      risk: 'higher',
      summary:
        'People with weakened immune systems, especially transplant recipients and people getting cancer treatment, can develop severe pneumonia from parainfluenza, most often type 3. They may stay sick and contagious for weeks.',
      actions: [
        'Contact your care team early if you get cold symptoms with fever or trouble breathing.',
        'Ask household members to wash hands often and stay away when they are sick.',
        'Avoid crowded indoor spaces and consider wearing a well-fitting mask when respiratory viruses are rising.',
      ],
    },
  },
  treatment: {
    summary:
      'There is no approved antiviral medicine for parainfluenza. Colds get better on their own with rest and fluids. For croup, a clinician can give a steroid medicine that reduces swelling in the airway, and children with more serious croup may get a breathing treatment in the emergency department. People with pneumonia or trouble breathing may need hospital care. Antibiotics do not help unless a bacterial infection develops.',
    options: [
      {
        name: 'Home care and comfort',
        type: 'supportive',
        detail:
          'Rest, fluids, and fever relief with acetaminophen or ibuprofen, following the label or your clinician’s advice for age and weight. Call your clinician before giving any fever medicine to a baby younger than 3 months, and do not give ibuprofen to babies under 6 months unless your clinician says to. Never give aspirin to children or teens. For croup, keep your child calm and upright. Some families find cool night air or a steamy bathroom soothing, but studies have not shown that mist treatments work, and hot steam or boiling water can cause burns.',
        who: 'Most people with mild illness, and children with mild croup',
      },
      {
        name: 'Steroid medicine for croup (such as dexamethasone)',
        type: 'other',
        detail:
          'A single dose, usually by mouth, given by a clinician. It reduces swelling around the voice box and windpipe and usually starts helping within a few hours. It is used for mild, moderate, and severe croup.',
        who: 'Children with croup, as decided by a clinician',
      },
      {
        name: 'Breathing treatment for serious croup (nebulized epinephrine)',
        type: 'other',
        detail:
          'A medicine breathed in as a mist that quickly reduces airway swelling. It is given in an emergency department or hospital, and children are watched for a few hours afterward because the effect wears off.',
        who: 'Children with moderate to severe croup or stridor at rest',
      },
      {
        name: 'Hospital care',
        type: 'supportive',
        detail: 'Oxygen, fluids through an IV, and close monitoring, and sometimes breathing support.',
        who: 'People with severe croup, pneumonia, low oxygen, or dehydration',
      },
      {
        name: 'Antibiotics (only for a bacterial complication)',
        type: 'antibiotic',
        detail:
          'Antibiotics do not work against parainfluenza. A clinician may prescribe them only if a bacterial infection, such as an ear infection or bacterial pneumonia, develops.',
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
    'Croup is usually diagnosed from the barking cough and a clinician’s exam; most children do not need a test or X-ray. Parainfluenza can be found with a lab (PCR) test on a nose swab, most often as part of a multi-virus panel that also reports the type (1, 2, 3, or 4). These panels are mostly used for people in the hospital or emergency department, young children, and people with weakened immune systems. Home tests sold for COVID-19 and flu do not detect parainfluenza.',
  whenToSeekCare: [
    'Call 911 or go to the emergency department for any emergency warning sign, such as stridor while resting, struggling to breathe, drooling, or blue or gray lips.',
    'Call your clinician right away if a baby younger than 3 months has a fever of 100.4°F (38°C) or higher, taken rectally (in the bottom).',
    'Call your clinician the same day if a child has croup with stridor that comes and goes, or a barking cough that is not getting better.',
    'Call your clinician if a child is drinking much less than usual, a fever lasts more than 2 to 3 days, or there is ear pain.',
    'Adults 65 and older, and anyone with lung disease or a weakened immune system, should call early if breathing gets worse.',
    'Urgent care can check mild croup or ear pain when your regular clinic is closed. Go to the emergency department, not urgent care, for trouble breathing or stridor at rest.',
  ],
  readingTheNumbers:
    'MN Pulse tracks parainfluenza with lab test positivity. Test positivity is the share of parainfluenza lab (PCR) tests that come back positive among people who were tested. It comes from Minnesota labs that run multi-virus panels and report to MDH, and from CDC’s lab network for Minnesota and five nearby states (HHS Region 5). It is not the share of people infected. Parainfluenza has 4 types, and each has its own season, so a combined number can rise in both fall and spring. These lab tests are mostly done for hospital, emergency department, and child patients. So the numbers show how much serious breathing illness is due to parainfluenza, not how many people are infected. When available, MN Pulse can also show a BioFire detection rate: the share of multi-virus panel tests at participating labs in the Midwest (or nationwide, when regional data are not available) that find parainfluenza. BioFire reports types 1, 2, 3, and 4 separately, and no Minnesota-only BioFire data are public. CDC’s public emergency department data do not track parainfluenza, and Minnesota wastewater testing has not tracked it since 2024. A fall rise, usually in types 1 or 2, often means croup season: expect more barking coughs in young children, especially at night. A spring or early summer rise, usually type 3, can mean more bronchiolitis and pneumonia in babies. For most adults, a rise just means a higher chance a cold is parainfluenza, which is usually mild. Numbers for the most recent week or two may be revised.',
  watchNotes: [
    'Fall is the usual season for croup caused by types 1 and 2, so more barking coughs in young children are expected in October and November.',
    'There is no vaccine or approved antiviral medicine for parainfluenza.',
  ],
  sources: [
    { label: 'CDC — About human parainfluenza viruses', url: 'https://www.cdc.gov/parainfluenza/about/index.html' },
    { label: 'CDC — Clinical overview of human parainfluenza viruses', url: 'https://www.cdc.gov/parainfluenza/hcp/clinical-overview/index.html' },
    { label: 'MDH — Viral respiratory illness in Minnesota', url: 'https://www.health.state.mn.us/diseases/respiratory/stats/index.html' },
    { label: 'MDH — Respiratory laboratory surveillance data', url: 'https://www.health.state.mn.us/diseases/respiratory/stats/lab.html' },
    { label: 'CDC NREVSS — Respiratory virus lab test positivity dashboard', url: 'https://www.cdc.gov/nrevss/php/dashboard/index.html' },
    { label: 'BIOFIRE Syndromic Trends (bioMérieux)', url: 'https://syndromictrends.com/' },
  ],
  lastReviewed: '2026-10-07',
}

export default profile
