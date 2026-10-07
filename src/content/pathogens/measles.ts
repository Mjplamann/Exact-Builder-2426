import type { PathogenProfile } from '../types'

const profile: PathogenProfile = {
  id: 'measles',
  name: 'Measles',
  shortName: 'Measles',
  aka: ['Rubeola'],
  category: 'vaccine-preventable',
  kind: 'virus',
  oneLiner: 'A very contagious virus that spreads through the air. Two doses of MMR vaccine give about 97% protection.',
  overview:
    'Measles is one of the most contagious diseases known. It causes a high fever, cough, runny nose, red eyes and a rash that spreads over the body. It can lead to pneumonia (lung infection), brain swelling and death, especially in young children. About 1 in 5 unvaccinated people in the U.S. who get measles needs hospital care. The MMR vaccine is safe and very effective, and most Minnesotans are protected.',
  seasonality: {
    summary:
      'Measles can show up in Minnesota at any time of year. Today, most cases start when someone gets infected while traveling, then spreads it to people who are not vaccinated. Travel during school breaks and holidays can bring new cases. Before vaccines, measles in places with cold winters peaked in late winter and spring, but recent U.S. outbreaks have not followed a set season.',
    peakMonths: [],
  },
  transmission:
    'Measles spreads through the air when an infected person breathes, coughs or sneezes. The virus can stay in the air for up to 2 hours after the sick person has left the room. Up to 9 out of 10 people who are not protected will catch measles if they are near someone who has it. You can catch it just by being in the same room, such as a clinic waiting room, store or airport.',
  incubation:
    'Symptoms usually start 7 to 14 days after exposure, but it can take up to 21 days. The rash usually appears about 2 weeks after exposure.',
  contagiousPeriod:
    'People with measles can spread it from 4 days before the rash appears through 4 days after the rash appears. This means people often spread it before they know they have measles. People with weakened immune systems may be contagious longer.',
  symptoms: {
    common: [
      'High fever, which may go above 104°F when the rash starts',
      'Cough',
      'Runny nose',
      'Red, watery eyes',
      'Tiny white spots inside the mouth (Koplik spots), 2 to 3 days after symptoms start',
      'A red, blotchy rash 3 to 5 days after symptoms start. It begins on the face at the hairline and spreads down to the neck, body, arms and legs',
    ],
    lessCommon: [
      'Ear infection, a common problem in children with measles',
      'Diarrhea',
      'Eyes that are sensitive to light',
      'Pneumonia (lung infection), the most common cause of measles deaths in young children',
    ],
    emergencyWarningSigns: [
      'Trouble breathing, fast breathing or chest pain',
      'Bluish lips or face',
      'A seizure',
      'Confusion, a severe headache, a stiff neck, or being very sleepy or hard to wake',
      'Signs of dehydration (losing too much body fluid), such as little or no urine, no tears or a very dry mouth',
      'A baby or young child who will not drink, is unusually floppy, or cannot be comforted',
    ],
  },
  ageGroups: {
    infants: {
      risk: 'highest',
      summary:
        'Babies are usually too young for the MMR vaccine, which starts at 12 months, so they depend on the people around them for protection. Children under 5 are among the most likely to have serious problems such as pneumonia, brain swelling or death.',
      actions: [
        'Make sure everyone who lives with or cares for your baby has had MMR or is otherwise protected',
        'If your baby is 6 to 11 months old and you plan to travel outside the U.S., get an early MMR dose at least 2 weeks before you leave. Your baby will still need 2 more doses starting at 12 months',
        'Ask about an early dose if health officials recommend one during an outbreak where you live',
        'If your baby is exposed, call your clinician right away. Immune globulin (a shot of antibodies) works best within 6 days, and babies 6 months and older may get MMR within 72 hours instead',
      ],
    },
    children: {
      risk: 'higher',
      summary:
        'Unvaccinated children are the group most often hit in U.S. outbreaks. Young children are at higher risk of ear infections, pneumonia and hospital care. Children who have had 2 doses of MMR are very well protected.',
      actions: [
        'Get MMR on time: the first dose at 12 to 15 months and the second at 4 to 6 years',
        'Check your child’s records. Your clinic can look them up in the Minnesota Immunization Information Connection (MIIC)',
        'Before international travel, children 12 months and older need 2 doses at least 28 days apart',
        'If your child has a fever and rash, call the clinic before going in',
        'If your child is exposed and not protected, they may need to stay home from school or child care for up to 21 days',
      ],
    },
    adults: {
      risk: 'moderate',
      summary:
        'Most adults in this age group got MMR as children and are protected. Adults over 20 who do catch measles are more likely to have serious problems than older children are.',
      actions: [
        'If you were born in 1957 or later and do not have records of MMR or a blood test showing immunity, get at least 1 dose',
        'Get 2 doses at least 28 days apart if you are a college student, a health care worker or traveling outside the U.S.',
        'If you are not sure, ask your clinician. There is no harm in getting another dose of MMR',
        'If you are exposed and not protected, call a clinician right away. MMR within 72 hours can prevent measles or make it milder',
      ],
    },
    'older-adults': {
      risk: 'moderate',
      summary:
        'Most people in this age group were vaccinated as children or had measles. Some got a type of measles vaccine used from 1963 to 1967 that does not protect well, and many got only 1 dose, since a second dose became routine later.',
      actions: [
        'If you got a measles shot between 1963 and 1967 and do not know the type, get at least 1 dose of MMR',
        'One documented dose is enough for most adults, but get a second dose before international travel or if you work in health care',
        'If you have no records, ask your clinician about MMR or a blood test',
      ],
    },
    seniors: {
      risk: 'lower',
      summary:
        'People born before 1957 almost all had measles as children and are considered immune. Measles can still be serious in older adults who are not protected.',
      actions: [
        'If you were born before 1957, you are generally considered protected. Health care workers in this age group should ask their employer about MMR',
        'If you were born in 1957 or later and have no records, ask your clinician whether you need MMR',
        'Help protect grandchildren under 12 months by making sure the adults around them are protected',
      ],
    },
    pregnant: {
      risk: 'higher',
      summary:
        'Measles during pregnancy can be more severe and raises the risk of miscarriage, stillbirth, early (preterm) birth and low birth weight. MMR cannot be given during pregnancy because it contains a weakened live virus.',
      actions: [
        'If you are planning a pregnancy, check that you are protected. If you need MMR, wait at least 1 month after the shot before getting pregnant',
        'If you are pregnant and not protected, get MMR right after you give birth. It is safe while breastfeeding',
        'If you are pregnant and may have been exposed, call your prenatal care provider right away. Immune globulin within 6 days can help',
        'Make sure others in your home are up to date on MMR',
      ],
    },
    immunocompromised: {
      risk: 'highest',
      summary:
        'People with severely weakened immune systems can get very sick from measles, sometimes without the usual rash, and may stay contagious longer. Many cannot get MMR because it is a live vaccine, and the vaccine may not protect them even if they had it before.',
      actions: [
        'Ask your care team whether you can safely get MMR. Some people, such as many people with HIV, can',
        'If you may have been exposed, call your care team right away, even if you were vaccinated. You may need immune globulin within 6 days',
        'Make sure everyone you live with is protected with MMR',
        'Watch MDH exposure notices during outbreaks and avoid listed places and times',
      ],
    },
  },
  treatment: {
    summary:
      'There is no medicine that cures measles. Care focuses on easing symptoms and preventing or treating problems such as dehydration, ear infections and pneumonia. Antibiotics do not work against the measles virus itself.',
    options: [
      {
        name: 'Home care: rest, fluids and fever relief',
        type: 'supportive',
        detail:
          'Rest, drink plenty of fluids and stay home away from others. Acetaminophen or ibuprofen can ease fever and aches; follow the label or your clinician’s advice for age and weight. Never give aspirin to children or teens.',
        who: 'Most people with measles, while following public health advice to stay home',
      },
      {
        name: 'Vitamin A (only with a clinician)',
        type: 'other',
        detail:
          'For children with measles, especially those sick enough to need hospital care, clinicians may give vitamin A for 2 days. It is given in an amount based on age and only under a clinician’s care. Too much vitamin A can damage the liver and cause other harm. Vitamin A does not prevent measles and is not a substitute for the vaccine.',
        who: 'Children with measles, as decided by their clinician',
      },
      {
        name: 'Hospital care',
        type: 'supportive',
        detail:
          'Oxygen, IV (intravenous) fluids and close monitoring for people with pneumonia, dehydration, brain swelling or other serious problems. Hospitals use special airborne isolation rooms to keep measles from spreading.',
        who: 'People with serious complications',
      },
      {
        name: 'Antibiotics (only for a bacterial complication)',
        type: 'antibiotic',
        detail:
          'Antibiotics do not work against measles. A clinician may prescribe them only if a bacterial infection, such as an ear infection or bacterial pneumonia, develops.',
        who: 'Only people diagnosed with a bacterial infection',
      },
    ],
    antibioticsHelp: 'no',
  },
  prevention: {
    vaccines: [
      {
        name: 'MMR vaccine (measles, mumps and rubella): M-M-R II or Priorix',
        who: 'All children: first dose at 12 to 15 months and second dose at 4 to 6 years. Teens and adults born in 1957 or later without proof of immunity: at least 1 dose, and 2 doses for college students, health care workers and international travelers. Infants 6 to 11 months: 1 early dose before international travel or when health officials recommend it during an outbreak. CDC and the American Academy of Pediatrics both recommend 2 doses for all children.',
        notes:
          'One dose is about 93% effective and two doses about 97% effective, and protection is long-lasting. The second dose can be given as soon as 28 days after the first. An early infant dose does not count toward the 2 routine doses. MMR contains a weakened live virus, so it is not given during pregnancy or to people with severely weakened immune systems. Some people get a mild fever or rash 1 to 2 weeks after the shot; this is not measles and does not spread to others. Getting MMR within 72 hours after an exposure can prevent measles or make it milder.',
      },
      {
        name: 'MMRV vaccine (ProQuad: measles, mumps, rubella and chickenpox)',
        who: 'Children 12 months through 12 years, as an option for routine doses.',
        notes:
          'For a child’s first dose at 12 to 47 months, separate MMR and chickenpox shots are generally recommended because the combined shot has a slightly higher chance of fever-related seizures. The combined shot is often used for the second dose at 4 to 6 years.',
      },
      {
        name: 'Immune globulin (IG) after exposure (not a vaccine)',
        who: 'People exposed to measles who cannot get MMR or are at high risk: babies under 12 months, pregnant people who are not protected, and people with severely weakened immune systems even if they were vaccinated.',
        notes:
          'IG is a shot or IV infusion of ready-made antibodies. It works best within 6 days of exposure and gives short-term protection only. After IG, MMR must be put off for several months, so ask your clinician when to get it.',
      },
    ],
    everyday: [
      'Check your family’s vaccine records. Your clinic can look them up in the Minnesota Immunization Information Connection (MIIC).',
      'Make sure everyone is protected at least 2 weeks before any international travel, including trips to Canada and Mexico.',
      'If you have a fever and rash, or think you have measles, call your clinic or urgent care before going in so staff can keep others from being exposed.',
      'If you have measles, stay home and away from others, especially babies, pregnant people and people with weakened immune systems, until 4 days after the rash starts or until public health says it is safe.',
      'If you are told you were exposed and are not protected, follow public health advice. You may need to stay home from day 5 through day 21 after the exposure.',
      'Watch for MDH notices that list public places and times where people may have been exposed.',
    ],
  },
  testing:
    'Measles is diagnosed with a lab test, usually a PCR test (a test that finds the virus’s genetic material) on a swab from the throat or nose, often along with a urine sample and a blood test for antibodies. Call ahead before going in for testing. The MDH Public Health Laboratory helps confirm cases and can tell measles from the harmless vaccine virus. Measles is not part of the BioFire respiratory panel. A blood test can also check whether you are immune, but it is usually not needed if you have records of 2 doses of MMR. Clinicians must report suspected measles to MDH right away.',
  whenToSeekCare: [
    'Call a health care provider right away if you were exposed to measles and are not sure you are protected. MMR works best within 72 hours and immune globulin within 6 days.',
    'Call if you or your child has a fever with cough, runny nose or red eyes, followed by a rash, especially after travel or a known exposure. Call before going in.',
    'Call if a child with measles has ear pain, diarrhea, or a cough that is getting worse.',
    'Call early for babies, pregnant people and anyone with a weakened immune system.',
    'Go to the emergency department or call 911 for trouble breathing, a seizure, confusion or signs of serious dehydration. Tell them measles is possible before you arrive.',
  ],
  readingTheNumbers:
    'Measles is not tracked like flu or COVID-19. It is not on the BioFire respiratory panel, and test positivity or emergency visit percentages are not useful for a disease this rare. Instead, public health counts confirmed cases. Each one is checked with lab testing and reported to MDH and CDC. Many years in Minnesota have few or no cases, but outbreaks among unvaccinated people have caused dozens of cases in some years, such as 2017. Because people spread measles before the rash appears, one case can expose many others. New cases tied to an exposure usually show up 1 to 3 weeks later, so counts often keep rising for a while after an outbreak is found. Even 1 or 2 new cases is a public health event: MDH traces contacts and posts places where people may have been exposed. A rising count means an outbreak is growing, usually among people who are not vaccinated. If you and your family have 2 doses of MMR, your risk stays low. The best response is to check your records, catch up on missed doses and watch MDH exposure notices. Some wastewater programs now also test for measles. A wastewater detection is an early alert that health officials follow up on, not a count of cases.',
  watchNotes: [
    'The U.S. had more than 2,000 confirmed measles cases in 2025, the most in more than 30 years, and 3 deaths. Most cases were in people who were not vaccinated or whose vaccination status was unknown.',
    'Large outbreaks continued into 2026 in several states. Canada and Mexico have also had large outbreaks since 2025, so make sure everyone is protected before any international travel.',
    'For current Minnesota case counts and public exposure locations, check the MDH measles page.',
    'CDC and the American Academy of Pediatrics both recommend 2 doses of MMR for all children. Talk with your clinician if you have questions about your family’s schedule.',
  ],
  sources: [
    { label: 'CDC: About Measles', url: 'https://www.cdc.gov/measles/about/index.html' },
    { label: 'CDC: Measles Symptoms and Complications', url: 'https://www.cdc.gov/measles/signs-symptoms/index.html' },
    { label: 'CDC: Measles Cases and Outbreaks', url: 'https://www.cdc.gov/measles/data-research/index.html' },
    { label: 'CDC: Measles Vaccine', url: 'https://www.cdc.gov/measles/vaccines/index.html' },
    { label: 'CDC: Clinical Overview of Measles', url: 'https://www.cdc.gov/measles/hcp/clinical-overview/index.html' },
    {
      label: 'CDC Pink Book: Measles',
      url: 'https://www.cdc.gov/pinkbook/hcp/table-of-contents/chapter-13-measles.html',
    },
    {
      label: 'CDC MMWR: Prevention of Measles, Rubella, Congenital Rubella Syndrome, and Mumps (ACIP, 2013)',
      url: 'https://www.cdc.gov/mmwr/preview/mmwrhtml/rr6204a1.htm',
    },
    { label: 'MDH: Measles', url: 'https://www.health.state.mn.us/diseases/measles/index.html' },
    { label: 'WHO: Measles fact sheet', url: 'https://www.who.int/news-room/fact-sheets/detail/measles' },
  ],
  lastReviewed: '2026-10-07',
}

export default profile
