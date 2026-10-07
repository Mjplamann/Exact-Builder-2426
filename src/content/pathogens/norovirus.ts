import type { PathogenProfile } from '../types'

const profile: PathogenProfile = {
  id: 'norovirus',
  name: 'Norovirus',
  shortName: 'Norovirus',
  aka: ['Stomach bug', 'Winter vomiting bug', 'Norwalk virus', 'Viral gastroenteritis'],
  category: 'gastrointestinal',
  kind: 'virus',
  biofireTargets: ['Norovirus GI/GII'],
  oneLiner: 'A very contagious stomach virus that causes sudden vomiting and diarrhea. Most people feel better in 1 to 3 days.',
  overview:
    'Norovirus is a very contagious virus that causes sudden vomiting and diarrhea. People often call it the “stomach flu,” but it is not related to influenza (flu). It is the leading cause of foodborne illness outbreaks in Minnesota and spreads easily in nursing homes, schools, child care and restaurants. Most healthy people recover in 1 to 3 days, but young children, older adults and people with weak immune systems can become dehydrated (lose too much body fluid).',
  seasonality: {
    summary:
      'Norovirus can spread any time of year. In Minnesota, the season usually starts in October and is busiest in winter, roughly December through March. Nationally, outbreaks are most common from November to April. Some seasons are much bigger than others: in January 2025 alone, the Minnesota Department of Health (MDH) tracked more than 130 outbreaks, compared with about 20 a month at the peak of an average year.',
    peakMonths: [12, 1, 2, 3],
  },
  transmission:
    'Norovirus is in the stool (poop) and vomit of sick people. You can get it by eating food or drinking liquids that were contaminated, often by a sick person who prepared it. You can also get it by touching a contaminated surface and then your mouth, or by close contact with a sick person, such as caring for them or sharing food or utensils. Swimming in or drinking contaminated water can spread it too. It takes only a very small amount of virus to make someone sick.',
  incubation: 'Symptoms usually start 12 to 48 hours after exposure.',
  contagiousPeriod:
    'You are most contagious while you are sick and for the first few days after you feel better. The virus can stay in your stool for 2 weeks or more after you recover, so keep washing your hands well. MDH advises not preparing food for others until at least 3 days after your symptoms end.',
  symptoms: {
    common: ['Sudden nausea and vomiting', 'Watery diarrhea', 'Stomach pain or cramps'],
    lessCommon: ['Low fever or chills', 'Headache', 'Muscle or body aches', 'Feeling very tired'],
    emergencyWarningSigns: [
      'Signs of serious dehydration: very little or no urine, a very dry mouth, or feeling dizzy or faint when standing',
      'A baby or young child who cries with few or no tears, has far fewer wet diapers than usual, or is unusually sleepy, floppy or fussy',
      'Confusion or being hard to wake, especially in an older adult',
      'Cannot keep any fluids down and is getting weaker',
      'Blood in vomit or stool, or black, tarry stool',
      'Severe belly pain that does not go away',
    ],
  },
  ageGroups: {
    infants: {
      risk: 'higher',
      summary:
        'Babies can lose fluid quickly from vomiting and diarrhea and get dehydrated faster than older children and adults. Watch closely for signs of dehydration.',
      actions: [
        'Keep breastfeeding or formula feeding, offering small amounts often',
        'Ask your baby’s clinician whether to use an oral rehydration solution (a store-bought drink with the right mix of salts and sugar)',
        'Watch wet diapers, tears and alertness closely',
        'Wash your hands with soap and water after every diaper change',
        'Do not give anti-diarrhea or anti-nausea medicine unless a clinician tells you to',
      ],
    },
    children: {
      risk: 'moderate',
      summary:
        'Most children recover in 1 to 3 days. Younger children are more likely to get dehydrated, and norovirus spreads easily in schools and child care.',
      actions: [
        'Offer small sips of fluid often; an oral rehydration solution works best for young children',
        'Keep your child home from school or child care while they are vomiting or have diarrhea, and follow the program’s return rules',
        'Teach and supervise handwashing with soap and water',
        'Clean up vomit and diarrhea right away with a bleach solution',
        'Call your child’s clinician if you see signs of dehydration',
      ],
    },
    adults: {
      risk: 'lower',
      summary:
        'Most healthy adults feel very sick for 1 to 3 days, then recover fully. The bigger concern is spreading it to others at home or at work.',
      actions: [
        'Drink plenty of fluids without caffeine or alcohol',
        'Stay home while you are sick',
        'Do not prepare food for others until at least 3 days after symptoms end',
        'Wash hands with soap and water; hand sanitizer alone does not work well against norovirus',
        'Disinfect contaminated surfaces with a bleach solution',
      ],
    },
    'older-adults': {
      risk: 'lower',
      summary:
        'Most people in this age group recover in a few days. Dehydration is more of a concern if you have heart, kidney or other chronic conditions, or take medicines that affect your body’s fluids.',
      actions: [
        'Start sipping fluids early and keep going',
        'If you take water pills (diuretics) or other daily medicines, ask your clinician what to do when you can’t keep fluids down',
        'Avoid visiting nursing homes or hospitals while you are sick',
        'Wash hands with soap and water before eating and after using the bathroom',
      ],
    },
    seniors: {
      risk: 'highest',
      summary:
        'Older adults are more likely to become seriously dehydrated and need hospital care. Outbreaks are common in nursing homes and assisted living; in recent MDH data, about half of reported norovirus outbreaks in Minnesota were in long-term care facilities.',
      actions: [
        'Start drinking fluids as soon as symptoms begin',
        'Have someone check on you if you live alone',
        'Get care quickly for dizziness, confusion or very little urine',
        'Ask sick visitors to stay away until they have been well for a few days',
        'Wash hands with soap and water before eating',
      ],
    },
    pregnant: {
      risk: 'moderate',
      summary:
        'Norovirus usually passes in a few days. The main concern during pregnancy is dehydration, so keeping fluids down matters.',
      actions: [
        'Sip fluids often, even in small amounts',
        'Call your prenatal care provider if you cannot keep fluids down, feel dizzy or are urinating much less',
        'Ask before taking any anti-nausea or anti-diarrhea medicine',
        'Wash hands with soap and water, especially if you care for young children',
      ],
    },
    immunocompromised: {
      risk: 'higher',
      summary:
        'People with weakened immune systems, such as transplant recipients or people getting chemotherapy, can be sick longer and shed the virus longer. In some people, norovirus can last weeks to months and cause ongoing diarrhea.',
      actions: [
        'Call your care team early if you have vomiting or diarrhea',
        'Tell your care team if diarrhea lasts more than a few days',
        'Ask whether you should be tested, since other infections can look similar',
        'Ask household members to wash hands with soap and water and to disinfect with bleach when someone is sick',
      ],
    },
  },
  treatment: {
    summary:
      'There is no medicine that cures norovirus, and antibiotics do not help because it is a virus. Treatment focuses on replacing lost fluids until the illness passes, usually in 1 to 3 days.',
    options: [
      {
        name: 'Oral rehydration solution',
        type: 'supportive',
        detail:
          'Store-bought oral rehydration solutions have the right balance of water, salts and sugar and are the most helpful choice for mild dehydration. If vomiting, take small sips every few minutes. For adults with mild illness, sports drinks or other drinks without caffeine or alcohol can help, but they do not replace salts as well.',
        who: 'Anyone with vomiting or diarrhea, especially young children, older adults and people with chronic health conditions',
      },
      {
        name: 'IV (intravenous) fluids',
        type: 'supportive',
        detail:
          'Fluids given through a vein at a clinic, urgent care, emergency department or hospital when someone is too dehydrated or cannot keep fluids down.',
        who: 'People with moderate to severe dehydration',
      },
      {
        name: 'Anti-nausea or anti-diarrhea medicine',
        type: 'other',
        detail:
          'For adults, these medicines can sometimes help along with fluids. Ask a pharmacist or clinician first, especially if you have other health conditions or take other medicines. They are not routinely recommended for children.',
        who: 'Some adults; children only if their clinician advises it',
      },
    ],
    antibioticsHelp: 'no',
  },
  prevention: {
    vaccines: [],
    everyday: [
      'Wash hands with soap and water for at least 20 seconds, especially after using the toilet or changing diapers and before eating or preparing food. Alcohol hand sanitizer does not work well against norovirus, so use it only in addition to handwashing.',
      'Clean up vomit and diarrhea right away while wearing disposable gloves. Disinfect hard surfaces with a bleach solution of 5 to 25 tablespoons of household bleach per gallon of water, or use a product registered by the EPA as effective against norovirus.',
      'Wash soiled clothes and linens right away with detergent, using the longest wash cycle, then machine dry.',
      'Stay home while you are sick. Do not prepare food for others until at least 3 days after symptoms end.',
      'Rinse fruits and vegetables, and cook oysters and other shellfish thoroughly.',
      'Do not swim in pools, lakes or splash pads while you have diarrhea, and do not visit nursing homes or hospitals while you are sick.',
    ],
  },
  testing:
    'Most people with norovirus are not tested. A clinician usually diagnoses it from symptoms, especially when others nearby are sick with the same thing. When testing is needed, a lab tests a stool sample with a PCR test (a test that finds the virus’s genetic material), often as part of a multi-germ stomach panel such as BioFire. The MDH Public Health Laboratory tests samples from outbreaks to confirm the cause and track which strains are spreading. There is no common home test.',
  whenToSeekCare: [
    'Call a health care provider if symptoms last longer than 3 days or keep getting worse.',
    'Call if you or your child cannot keep fluids down or shows early signs of dehydration, such as urinating less, a dry mouth or feeling dizzy when standing.',
    'Call early for babies, older adults, pregnant people and anyone with a weakened immune system.',
    'Go to urgent care or an emergency department for signs of serious dehydration, blood in vomit or stool, severe belly pain, or confusion. Call 911 for fainting or trouble staying awake.',
    'If several people get sick after a shared meal or event, report it to MDH at 1-877-FOOD-ILL (1-877-366-3455).',
  ],
  readingTheNumbers:
    'Norovirus numbers mostly come from lab testing of stool samples, such as the share of BioFire stomach (gastrointestinal) panel tests that find norovirus. These panels are ordered mainly for people sick enough to see a clinician or go to a hospital, so the number shows the share of tested people who had norovirus. It does not count how many Minnesotans are sick, because most people with norovirus are never tested. Detection is usually lowest in late summer and climbs in late fall and winter. Because norovirus spreads so fast, the number can rise sharply within a few weeks. A rising number means more stomach bugs are going around: wash hands with soap and water, stay home when sick, and keep an oral rehydration solution at home. A falling number means less spread, but norovirus never fully goes away.',
  watchNotes: [
    'In the 2024–25 season, a newer strain called GII.17 caused about 3 in 4 U.S. norovirus outbreaks, overtaking the long-common GII.4 strain. That season started earlier than usual nationally and was unusually large in Minnesota, with more than 130 outbreaks and over 4,000 illnesses in January 2025 alone.',
    'National outbreak reports for the 2025–26 season were back in the typical range, at about half the count of the year before (CDC NoroSTAT).',
    'Early 2026–27 national outbreak reports (August to early September 2026) were within the usual range for that time of year.',
    'There is no approved norovirus vaccine. Candidate vaccines are still being tested in clinical trials.',
  ],
  sources: [
    { label: 'CDC: About Norovirus', url: 'https://www.cdc.gov/norovirus/about/index.html' },
    { label: 'CDC: How to Prevent Norovirus', url: 'https://www.cdc.gov/norovirus/prevention/index.html' },
    { label: 'CDC: Norovirus Outbreaks', url: 'https://www.cdc.gov/norovirus/outbreaks/index.html' },
    { label: 'CDC: NoroSTAT Data', url: 'https://www.cdc.gov/norovirus/php/reporting/norostat-data.html' },
    {
      label: 'CDC Yellow Book: Norovirus',
      url: 'https://www.cdc.gov/yellow-book/hcp/travel-associated-infections-diseases/norovirus.html',
    },
    {
      label: 'CDC Emerging Infectious Diseases: Increasing Predominance of Norovirus GII.17 over GII.4, United States, 2022–2025',
      url: 'https://wwwnc.cdc.gov/eid/article/31/7/25-0524_article',
    },
    { label: 'MDH: Norovirus Infection', url: 'https://www.health.state.mn.us/diseases/norovirus/index.html' },
    {
      label: 'MDH: Causes and Symptoms of Norovirus Infection',
      url: 'https://www.health.state.mn.us/diseases/norovirus/basics.html',
    },
    {
      label: 'MDH Public Health Laboratory: Flurry of Norovirus Outbreaks (2025)',
      url: 'https://www.health.state.mn.us/about/org/phl/annualreports/2025/norovirus.html',
    },
    {
      label: 'MDH: Gastrointestinal Illness Outbreaks at Facilities',
      url: 'https://www.health.state.mn.us/diseases/foodborne/outbreak/facility/index.html',
    },
    {
      label: 'MDH: 2025–2026 Norovirus Toolkit for Long-Term Care Facilities (PDF)',
      url: 'https://www.health.state.mn.us/diseases/foodborne/outbreak/facility/ltcfnorotoolkit.pdf',
    },
  ],
  lastReviewed: '2026-10-07',
}

export default profile
