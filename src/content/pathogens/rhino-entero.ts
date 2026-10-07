import type { PathogenProfile } from '../types'

const profile: PathogenProfile = {
  id: 'rhino-entero',
  name: 'Rhinovirus and enterovirus',
  shortName: 'Rhino/entero',
  aka: [
    'rhinovirus',
    'enterovirus',
    'common cold',
    'RV/EV',
    'HRV/EV',
    'enterovirus D68 (EV-D68)',
    'coxsackievirus',
    'hand, foot, and mouth disease',
  ],
  category: 'respiratory-viral',
  kind: 'virus',
  biofireTargets: ['Human Rhinovirus/Enterovirus'],
  oneLiner: 'The top cause of the common cold. Usually mild, but it can trigger asthma flares, and some enteroviruses cause rarer illness.',
  overview:
    'Rhinoviruses are the most common cause of the common cold. Enteroviruses are close relatives. They include enterovirus D68 (EV-D68), which can cause serious breathing trouble, mostly in children with asthma, and coxsackieviruses, which cause hand, foot, and mouth disease. The BioFire respiratory test reports these viruses together because they are so alike. Most infections are mild, but rhinoviruses are a leading trigger of asthma attacks, and rarely an enterovirus can cause serious illness of the heart, brain, or nerves.',
  seasonality: {
    summary:
      'Rhinoviruses spread all year in Minnesota. They usually rise in late August and September, when children go back to school, and again in spring. Enteroviruses, including EV-D68 and the viruses that cause hand, foot, and mouth disease, spread mostly in summer and early fall. In the past, EV-D68 caused larger outbreaks about every other year, usually peaking in late summer, but the pattern can vary.',
    peakMonths: [9, 10],
  },
  transmission:
    'These viruses spread through droplets and tiny particles when an infected person coughs, sneezes, or talks, and through close contact such as touching or shaking hands. You can also pick up the virus by touching a surface or a hand that has it on it, and then touching your eyes, nose, or mouth. The enteroviruses that cause hand, foot, and mouth disease also spread through fluid from blisters and through stool (poop), for example during diaper changes.',
  incubation:
    'Cold symptoms from rhinovirus usually start about 2 days after exposure. Enterovirus illnesses, such as hand, foot, and mouth disease, usually start 3 to 6 days after exposure.',
  contagiousPeriod:
    'People with a cold spread the virus most in the first few days of symptoms, but they can spread it for a week or more. People with hand, foot, and mouth disease are usually most contagious during the first week of illness. Enteroviruses can stay in stool (poop) for weeks after symptoms go away, and some people spread these viruses without ever feeling sick.',
  symptoms: {
    common: [
      'Runny or stuffy nose',
      'Sneezing',
      'Sore or scratchy throat',
      'Cough',
      'Headache or mild body aches',
      'Low fever, more often in children',
      'Wheezing or an asthma flare in people with asthma',
    ],
    lessCommon: [
      'Hand, foot, and mouth disease (from coxsackieviruses and other enteroviruses): fever, painful mouth sores, and a rash or blisters on the hands and feet, and sometimes the knees, elbows, buttocks, or diaper area',
      'Peeling skin, or loss of fingernails or toenails, a few weeks after hand, foot, and mouth disease (the nails grow back)',
      'Ear infections or sinus infections after a cold',
      'Severe breathing trouble from EV-D68, mostly in children with asthma',
      'Viral meningitis (swelling of the lining around the brain and spinal cord), with fever, headache, and a stiff neck',
      'Very rarely, swelling of the heart muscle (myocarditis) or the brain (encephalitis)',
      'Very rarely, acute flaccid myelitis (AFM), a sudden weakness in an arm or leg linked mainly to EV-D68',
    ],
    emergencyWarningSigns: [
      'Trouble breathing, fast breathing, or ribs or belly pulling in with each breath',
      'Wheezing or shortness of breath that does not get better after using a quick-relief (rescue) inhaler as an asthma action plan directs',
      'Bluish or gray lips, face, or fingernails',
      'Sudden weakness or floppiness in an arm or leg',
      'Face drooping, trouble moving the eyes, drooping eyelids, trouble swallowing, or slurred speech',
      'Severe headache with a stiff neck, confusion, or being very hard to wake up',
      'Seizures',
      'Signs of dehydration, such as no urine (pee) for 8 hours, a very dry mouth, or no tears when crying, often because mouth sores make drinking painful',
      'In a baby younger than 12 weeks: any fever, poor feeding, or unusual sleepiness',
    ],
  },
  ageGroups: {
    infants: {
      risk: 'higher',
      summary:
        'Babies catch many colds, and most are mild. After RSV, rhinovirus is a common cause of bronchiolitis (a lung infection that causes wheezing and fast breathing) in babies. Rarely, newborns in the first weeks of life can get very sick from an enterovirus that affects the heart, liver, or brain.',
      actions: [
        'Clear a stuffy nose with saline (saltwater) drops and gentle suction, especially before feeds and sleep.',
        'Do not give cough and cold medicines or honey to babies under 1 year.',
        'Call your clinician right away for any fever of 100.4°F (38°C) or higher in a baby younger than 3 months.',
        'Get care quickly if your baby is breathing fast or hard, is feeding poorly, or has fewer wet diapers.',
        'Ask anyone with a cold to stay away from your baby, and have everyone wash their hands before holding the baby.',
      ],
    },
    children: {
      risk: 'moderate',
      summary:
        'Children catch colds more often than adults. Rhinoviruses are the most common trigger of asthma flares in children, and asthma attacks often jump in September after school starts. EV-D68 can cause serious breathing problems, mostly in children with asthma, and very rarely AFM. Hand, foot, and mouth disease is most common in children under 5.',
      actions: [
        'If your child has asthma, give their daily controller medicine as prescribed, and keep an up-to-date asthma action plan at home and at school.',
        'Make sure your child has a quick-relief inhaler that is not expired and knows how to use it, especially in late summer and fall.',
        'Teach handwashing and coughing or sneezing into an elbow.',
        'For hand, foot, and mouth disease, offer cool drinks and soft foods, and keep your child home while they have a fever or feel too sick for normal activities. Check your child care or school’s rules.',
        'Get care right away for trouble breathing or sudden weakness in an arm or leg.',
      ],
    },
    adults: {
      risk: 'lower',
      summary:
        'Most adults get a few colds a year. They are usually mild and last about 7 to 10 days. Adults with asthma or COPD (chronic obstructive pulmonary disease, a long-term lung disease) can have flare-ups.',
      actions: [
        'Rest, drink fluids, and use over-the-counter medicines for symptoms if needed.',
        'If you have asthma or COPD, follow your action plan, and call your clinician if your breathing gets worse.',
        'Stay home when you are sick, and cover coughs and sneezes.',
        'Wash your hands often, especially if you care for babies or young children.',
      ],
    },
    'older-adults': {
      risk: 'lower',
      summary:
        'Colds are usually mild at this age. But they can set off flare-ups of lung and heart conditions, such as COPD, asthma, and heart failure.',
      actions: [
        'Keep long-term conditions like COPD, asthma, diabetes, and heart disease well managed.',
        'Call your clinician if a cold makes your breathing or a long-term condition worse.',
        'Wash your hands often, and avoid touching your eyes, nose, and mouth.',
      ],
    },
    seniors: {
      risk: 'moderate',
      summary:
        'Rhinoviruses are not just a childhood illness. In older adults, especially those with lung or heart disease, they can lead to pneumonia (a lung infection), and they can cause outbreaks in nursing homes.',
      actions: [
        'Call your clinician if a cold comes with fever, shortness of breath, or chest pain, or if you feel much worse after a few days.',
        'If you live in a nursing home or assisted living, tell staff about cold symptoms so they can help stop the spread.',
        'Keep lung and heart conditions well managed, and take your medicines as prescribed.',
        'Ask your clinician which vaccines, such as flu, COVID-19, RSV, and pneumococcal, are right for you. They do not prevent colds, but they protect against other serious lung infections.',
      ],
    },
    pregnant: {
      risk: 'lower',
      summary:
        'Colds are not known to be more serious during pregnancy, though a stuffy nose may feel worse because pregnancy itself can cause congestion. Hand, foot, and mouth disease is usually mild in adults. Rarely, an enterovirus infection right before delivery can pass to the newborn, who can get very sick.',
      actions: [
        'Ask your prenatal care provider or pharmacist before taking any cold medicine.',
        'Try saline nose spray, a cool-mist humidifier, rest, and fluids to ease symptoms.',
        'Tell your provider if you have a fever, a rash, or mouth sores close to your due date.',
        'Wash your hands often, especially after changing diapers or caring for young children.',
      ],
    },
    immunocompromised: {
      risk: 'higher',
      summary:
        'People with weakened immune systems, such as transplant recipients or people getting cancer treatment, can get more serious lung infections from rhinoviruses and may stay sick and contagious longer. People whose bodies cannot make normal antibodies can rarely get long-lasting enterovirus infections.',
      actions: [
        'Call your care team early if you get cold symptoms with fever, cough, or shortness of breath.',
        'Ask whether you need testing, since several viruses can cause the same symptoms.',
        'Wash your hands often, and ask people with colds to keep their distance.',
        'Consider a well-fitting mask in crowded indoor places during the fall and spring cold seasons.',
      ],
    },
  },
  treatment: {
    summary:
      'There is no cure and no antiviral medicine for rhinovirus or enterovirus infections. Most people get better on their own. Colds usually last 7 to 10 days, and hand, foot, and mouth disease usually clears up in 7 to 10 days. Treatment focuses on easing symptoms, preventing dehydration, and keeping asthma under control. Antibiotics do not help unless a bacterial infection, such as an ear infection or pneumonia, develops.',
    options: [
      {
        name: 'Rest, fluids, and moist air',
        type: 'supportive',
        detail:
          'Rest and drink plenty of fluids. A cool-mist humidifier can ease a stuffy nose and cough. For babies, saline (saltwater) drops and gentle suction help clear the nose.',
        who: 'Everyone with a cold or enterovirus illness.',
      },
      {
        name: 'Pain and fever relievers (acetaminophen or ibuprofen)',
        type: 'supportive',
        detail:
          'These can ease fever, sore throat, and painful mouth sores. Follow the label for age and weight, and ask before giving ibuprofen to a baby under 6 months. Never give aspirin to children or teens, because it can cause Reye’s syndrome, a rare but serious illness.',
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
        name: 'Asthma medicines',
        type: 'other',
        detail:
          'Follow your asthma action plan: keep taking daily controller medicine and use your quick-relief inhaler as directed. For a serious flare, a clinician may prescribe a short course of steroid medicine or other treatment.',
        who: 'Children and adults with asthma whose cold triggers a flare.',
      },
      {
        name: 'Hospital care for severe illness',
        type: 'supportive',
        detail:
          'Severe breathing problems may need oxygen or breathing support in the hospital. There is no specific treatment for AFM. Care focuses on support and on physical and occupational therapy to help with weakness, guided by specialists.',
        who: 'People with severe breathing trouble, AFM, meningitis, or other serious complications.',
      },
    ],
    antibioticsHelp: 'no',
  },
  prevention: {
    vaccines: [],
    everyday: [
      'Wash your hands often with soap and water for at least 20 seconds, especially after diaper changes, using the toilet, and wiping noses.',
      'Avoid touching your eyes, nose, and mouth with unwashed hands.',
      'Avoid close contact, such as kissing, hugging, and sharing cups or utensils, with people who are sick.',
      'Clean and disinfect toys and often-touched surfaces, such as doorknobs and phones, especially when someone at home is sick.',
      'Cover coughs and sneezes with a tissue or your elbow, and stay home when you are sick.',
      'If you or your child has asthma, keep it well controlled. That is one of the best defenses against a serious flare from a cold.',
    ],
  },
  testing:
    'Most colds and cases of hand, foot, and mouth disease are diagnosed by symptoms and an exam, with no test needed. Hospitals and some clinics use multiplex PCR panels (one test that checks a nose swab for many germs at once), such as the BioFire Respiratory Panel. This panel reports “Human Rhinovirus/Enterovirus” as a single result because the two viruses are so alike. It cannot tell which one is present, or which type, such as EV-D68. Finding EV-D68 takes special testing, usually done by a public health lab. These panels can stay positive for weeks after a cold, and they often find rhinovirus in people with mild or no symptoms, so a positive result does not always explain an illness. Home tests for COVID-19 and flu do not detect these viruses.',
  whenToSeekCare: [
    'Call your clinician if cold symptoms last more than 10 days without getting better, or if a fever lasts more than 4 days.',
    'Call if symptoms such as fever or cough get better but then come back or get worse.',
    'Call if you have ear pain or sinus pain that does not go away.',
    'Call your clinician if a cold makes asthma, COPD, or another long-term condition worse, or if you need your quick-relief inhaler more often than your action plan allows.',
    'Go to urgent care the same day if a child with mouth sores will not drink and is peeing less, but is alert and breathing comfortably.',
    'Call 911 or go to the emergency department for any emergency warning sign, especially trouble breathing or sudden weakness in an arm or leg.',
  ],
  readingTheNumbers:
    'MN Pulse shows this virus group mainly as a BioFire detection rate: the percent of BioFire respiratory panel tests at participating labs in the Midwest (not just Minnesota) that found rhinovirus or enterovirus. These panels are run mostly on people sick enough to go to a hospital, emergency department, or clinic, and many are children. Rhinovirus/enterovirus is the virus these panels find most often. It is found all year, in at least about 1 in 10 tests even in winter, and it often shows up along with another virus. So a high number here is normal and is not a warning sign by itself. Watch the direction instead: the rate usually climbs 2 to 3 times higher in early fall and again in spring. A rise in late August or September often lines up with more colds and asthma flares as school starts. MDH also reports weekly rhinovirus/enterovirus results from a group of Minnesota labs that run respiratory panels. Because the test cannot tell rhinovirus from enterovirus, these numbers cannot show an EV-D68 outbreak on their own. WastewaterSCAN tests sewage from four Minnesota treatment plants (Rochester, Mankato, Red Wing, and St. Cloud) for EV-D68 specifically. Public emergency department (ED) visit data do not break out this virus group. For an average person, a fall rise means: wash hands often, keep sick kids home, and if your child has asthma, make sure they take their controller medicine and have a quick-relief inhaler on hand. Numbers for the most recent week or two may be revised.',
  watchNotes: [
    'Late summer and early fall is the usual season for EV-D68. In the U.S., large EV-D68 outbreaks happened every other year in 2014, 2016, and 2018. Each was followed by more cases of AFM, which peaked in September, about a month after EV-D68 peaked. AFM is rare, but if a child suddenly develops weakness in an arm or leg, get medical care right away.',
    'There is no vaccine in the U.S. for rhinoviruses, EV-D68, or the enteroviruses that cause hand, foot, and mouth disease. Polio vaccine protects only against poliovirus.',
    'WastewaterSCAN switched to an updated EV-D68 wastewater test in September 2026, so Minnesota EV-D68 wastewater levels from before and after the switch may not line up exactly.',
  ],
  sources: [
    {
      label: 'Meyers et al. — Automated real-time collection of pathogen-specific diagnostic data (BioFire Syndromic Trends), JMIR Public Health and Surveillance, 2018',
      url: 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC6054708/',
    },
    {
      label: 'Park et al. — Epidemiological dynamics of enterovirus D68 in the US: implications for acute flaccid myelitis (preprint; later published in Science Translational Medicine)',
      url: 'https://doi.org/10.1101/2020.07.23.20069468',
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
    { label: 'WastewaterSCAN data dashboard', url: 'https://data.wastewaterscan.org/' },
  ],
  lastReviewed: '2026-10-07',
}

export default profile
