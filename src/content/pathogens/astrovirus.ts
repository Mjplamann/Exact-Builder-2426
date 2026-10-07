import type { PathogenProfile } from '../types'

const profile: PathogenProfile = {
  id: 'astrovirus',
  name: 'Astrovirus',
  shortName: 'Astrovirus',
  aka: ['Human astrovirus', 'HAstV'],
  category: 'gastrointestinal',
  kind: 'virus',
  biofireTargets: ['Astrovirus'],
  oneLiner: 'A common stomach virus in babies and young children that causes watery diarrhea, usually mild and gone in a few days.',
  overview:
    'Astrovirus is a stomach virus named for its star-like shape under a microscope. It mostly infects babies and children under 5, causing watery diarrhea that is usually milder than rotavirus illness. Most people are infected in early childhood, so adults get sick less often. Older adults in group settings and people with weakened immune systems can also be affected.',
  seasonality: {
    summary:
      'In places with cold winters like Minnesota, astrovirus tends to be most common in winter and early spring and less common in summer. Minnesota-specific data are limited, and it can show up any time of year.',
    peakMonths: [1, 2, 3, 4],
  },
  transmission:
    'Astrovirus spreads when tiny amounts of stool (poop) from an infected person get into someone else’s mouth. This happens through close contact, hands that were not washed well, and contaminated surfaces such as diaper-changing areas and toys. Contaminated food or water can also spread it. It spreads easily in child care centers, schools, and nursing homes.',
  incubation:
    'Symptoms usually start 1 to 5 days after exposure. One review of many studies estimated a median (typical) incubation of about 4.5 days.',
  contagiousPeriod:
    'The virus is in stool while a person is sick and can stay there for several days or longer after diarrhea stops. People with weakened immune systems can shed (pass) it in their stool for weeks or even months. People with no symptoms can also spread it.',
  symptoms: {
    common: ['Watery diarrhea', 'Stomach pain or cramps', 'Nausea or vomiting', 'Loss of appetite'],
    lessCommon: [
      'Low fever',
      'Headache',
      'Tiredness or body aches',
      'Diarrhea that lasts much longer than usual (more likely with a weakened immune system)',
    ],
    emergencyWarningSigns: [
      'Signs of severe dehydration: no pee for many hours, a very dry mouth, crying with no tears, or sunken eyes',
      'In a baby: no wet diaper for many hours, or a sunken soft spot on the head',
      'Fainting, confusion, or being very sleepy, limp, or hard to wake',
      'Cannot keep any fluids down and is getting weaker',
      'Green or bloody vomit, or vomit that looks like coffee grounds',
      'Black, tar-like stool, or a lot of blood in the stool',
      'Severe belly pain that does not go away, or a swollen, hard belly',
    ],
  },
  ageGroups: {
    infants: {
      risk: 'higher',
      summary:
        'Astrovirus is most common in babies and toddlers. The illness is usually mild, but babies can become dehydrated quickly.',
      actions: [
        'Keep breastfeeding or giving full-strength formula, and offer smaller, more frequent feeds. Do not give plain water to a baby under 6 months.',
        'Ask your clinician about using an oral rehydration solution (ORS) if your baby has a lot of diarrhea or is vomiting.',
        'Count wet diapers. Fewer wet diapers is an early sign of dehydration.',
        'Call a clinician right away if your baby is younger than 3 months and has a fever of 100.4°F (38°C) or higher.',
        'Wash your hands with soap and water after every diaper change.',
      ],
    },
    children: {
      risk: 'moderate',
      summary:
        'Most astrovirus infections happen before age 5. Children usually recover in a few days, but young children can become dehydrated. Older children and teens are less likely to get sick.',
      actions: [
        'Offer small sips of an oral rehydration solution often, and let your child go back to regular foods as soon as they are hungry.',
        'Keep your child home from child care or school while they have diarrhea or vomiting, and follow the program’s return rules.',
        'Teach handwashing with soap and water after using the toilet and before eating.',
        'Do not give anti-diarrhea medicine to a child unless a clinician tells you to.',
        'Do not give Pepto-Bismol (bismuth subsalicylate) to children or teens. It is related to aspirin and is linked to Reye’s syndrome, a rare but serious illness.',
      ],
    },
    adults: {
      risk: 'lower',
      summary:
        'Most adults have some protection from childhood infections and have mild or no symptoms. Parents and child care workers can still catch it from children.',
      actions: [
        'Drink plenty of fluids if you get sick. An oral rehydration solution is best if you are losing a lot of fluid.',
        'Wash your hands with soap and water after changing diapers, using the bathroom, or caring for someone who is sick.',
        'Stay home from work while sick. Do not prepare food for others until at least 3 days after symptoms stop, as MDH advises for norovirus, which spreads the same way.',
        'If you work in food service, health care, or child care, follow your workplace’s return-to-work rules.',
        'Clean diaper-changing areas and bathrooms with a bleach solution or a disinfectant labeled as effective against norovirus.',
      ],
    },
    'older-adults': {
      risk: 'lower',
      summary:
        'Illness is uncommon in this age group and is usually mild. Health problems such as heart or kidney disease, or medicines like water pills (diuretics), can make dehydration more serious.',
      actions: [
        'Drink extra fluids at the first sign of illness.',
        'Ask your clinician whether to pause any regular medicines, such as water pills, while you cannot keep fluids down.',
        'Call your clinician if you feel dizzy when standing or are peeing much less than usual.',
        'Wash your hands with soap and water often, especially when caring for grandchildren.',
      ],
    },
    seniors: {
      risk: 'moderate',
      summary:
        'Astrovirus outbreaks can happen in nursing homes and other long-term care facilities. Older adults are more likely to become dehydrated from vomiting or diarrhea.',
      actions: [
        'Drink fluids often, even if you do not feel thirsty.',
        'Call your clinician early if you cannot keep fluids down, feel dizzy, or seem confused.',
        'Ask your clinician whether any regular medicines should be paused while you are sick.',
        'If you live in or visit a care facility, follow its outbreak rules and put off visits when you are sick.',
      ],
    },
    pregnant: {
      risk: 'lower',
      summary:
        'There is no evidence that astrovirus is more severe during pregnancy. Staying hydrated is still important if you get vomiting or diarrhea.',
      actions: [
        'Sip fluids often. An oral rehydration solution can help if you are losing a lot of fluid.',
        'Call your prenatal care provider if you cannot keep fluids down, have a fever, or feel dizzy.',
        'Ask your provider or pharmacist before taking any anti-diarrhea or anti-nausea medicine, including Pepto-Bismol.',
        'Wash your hands well, especially if you care for young children.',
      ],
    },
    immunocompromised: {
      risk: 'higher',
      summary:
        'People with weakened immune systems, such as children getting cancer treatment or transplant recipients, can have longer-lasting diarrhea. They can shed (pass) the virus in their stool for weeks to months. Very rarely, less common astrovirus strains have caused brain infections (encephalitis or meningitis) in people with severely weakened immune systems.',
      actions: [
        'Call your care team early if you have vomiting or diarrhea, especially if it lasts more than a day or two.',
        'Ask whether stool testing is needed, since long-lasting diarrhea has many possible causes.',
        'Get care right away for a severe headache, stiff neck, confusion, or seizure.',
        'Keep washing your hands well after you feel better, because you may shed the virus longer.',
      ],
    },
  },
  treatment: {
    summary:
      'There is no medicine that kills astrovirus. Most people get better on their own in a few days. Treatment focuses on replacing lost fluids. Antibiotics do not help because astrovirus is a virus.',
    options: [
      {
        name: 'Oral rehydration solution (ORS)',
        type: 'supportive',
        detail:
          'Store-bought solutions (such as Pedialyte or store brands) have the right mix of water, salts, and sugar to replace what is lost. For someone who is vomiting, start with small sips, about a teaspoon every few minutes, and give more as it stays down.',
        who: 'Anyone with diarrhea or vomiting, especially babies, young children, and older adults.',
      },
      {
        name: 'Other fluids and regular food',
        type: 'supportive',
        detail:
          'For older children and adults with mild illness, water, broth, or sports drinks can help, but they do not replace salts as well as an oral rehydration solution. Babies and young children should keep breastfeeding or getting full-strength formula, plus an oral rehydration solution if needed. Do not give plain water to babies under 6 months, and do not water down formula. Return to normal foods as soon as the person is hungry.',
        who: 'Older children and adults with mild illness. Babies and young children need breast milk or formula, plus ORS if needed.',
      },
      {
        name: 'Anti-nausea medicine (such as ondansetron)',
        type: 'other',
        detail:
          'A clinician may prescribe this to ease vomiting so a person can keep fluids down. It requires a prescription.',
        who: 'Some children and adults with frequent vomiting, as decided by a clinician.',
      },
      {
        name: 'IV (intravenous) fluids',
        type: 'supportive',
        detail:
          'Fluids given through a vein at a clinic, urgent care, or hospital to quickly treat dehydration.',
        who: 'People with moderate to severe dehydration or who cannot keep liquids down.',
      },
    ],
    antibioticsHelp: 'no',
  },
  prevention: {
    vaccines: [],
    everyday: [
      'Wash your hands with soap and water for at least 20 seconds after using the toilet or changing diapers and before eating or preparing food. Use hand sanitizer only in addition to handwashing, not instead of it.',
      'Keep sick children home from child care or school while they have diarrhea or vomiting, and follow the program’s return rules.',
      'Change diapers on a surface you can clean, and disinfect it after each use.',
      'Clean toys, bathrooms, and other high-touch surfaces with a bleach solution or a disinfectant registered by the EPA (US Environmental Protection Agency) as effective against norovirus, a similarly hard-to-kill stomach virus. Follow label directions, and never mix bleach with ammonia or other cleaners.',
      'Do not prepare food for others while sick and for at least 3 days after symptoms stop, as MDH advises for norovirus.',
      'There is no vaccine for astrovirus. These everyday steps are the best protection.',
    ],
  },
  testing:
    'Most people with a short bout of diarrhea do not need testing. Sometimes a clinician orders a stool test. This is more likely for a very sick child, a person with a weakened immune system, or diarrhea that will not go away. Labs often use a multiplex PCR panel. PCR is a lab test that finds a germ’s genetic material, and a multiplex panel checks for many germs at once. The BioFire GI (gastrointestinal) Panel is one example, and it includes astrovirus. A positive result does not always prove astrovirus caused the symptoms. The virus can linger after an illness or show up alongside other germs. The rare astrovirus strains linked to brain infections are different from the common stomach strains, and routine stool panels may not detect them. Astrovirus outbreaks are rarely identified: only 10 were reported to CDC’s national outbreak reporting system from 2009 through 2018. CDC researchers recommend testing for viruses like astrovirus when outbreak samples test negative for norovirus. There are no home tests.',
  whenToSeekCare: [
    'Call a clinician or your clinic’s nurse line if vomiting is so frequent that liquids will not stay down.',
    'Call the same day for early signs of dehydration: peeing less than usual, fewer wet diapers, a dry mouth, crying with few tears, or feeling dizzy when standing.',
    'Call if diarrhea lasts more than 3 days without getting better.',
    'Call the same day if there is a fever over 102°F (38.9°C) or a small amount of blood in the stool.',
    'Call early for babies, adults 65 and older, pregnant people, and anyone with a weakened immune system who has vomiting or diarrhea.',
    'Go to urgent care the same day if there are signs of dehydration and the person cannot drink enough to catch up.',
    'Go to an emergency department for any emergency warning sign. Call 911 for fainting, confusion, or trouble staying awake.',
  ],
  readingTheNumbers:
    'MN Pulse shows astrovirus as a BioFire detection rate. This is the percent of BioFire GI (stomach and gut) panel tests at participating labs in the Midwest (not just Minnesota) that found astrovirus. These panels are mostly ordered for people sick enough to see a clinician or go to the hospital, so the number shows trends, not how many people are sick. Most positive tests come from babies and toddlers, but panels are run on people of all ages. So the percentage can shift when the mix of people being tested changes. For example, if many more adults are tested during a norovirus surge, this number can dip. Some detections are also in children with mild or no symptoms. In cold-winter climates, levels tend to be higher in winter and early spring. When a detection rate is small, a few extra positive tests can make the line jump, so look at the trend over several weeks. A sustained rise usually means more astrovirus is circulating among young children. For families, that is a reminder to wash hands, clean diaper areas, and watch young children for dehydration. Emergency department (ED) and wastewater data generally do not track astrovirus separately, and MDH does not count individual astrovirus cases.',
  watchNotes: [
    'MDH asks child care providers to report when more than 10% of children and staff are sick with diarrhea or vomiting.',
    'If you think you got sick from food at a restaurant or event, call MDH’s Foodborne Illness Hotline at 1-877-366-3455.',
  ],
  sources: [
    {
      label: 'CDC Emerging Infectious Diseases: Non-norovirus viral gastroenteritis outbreaks reported to NORS, USA, 2009–2018',
      url: 'https://wwwnc.cdc.gov/eid/article/27/2/20-3943_article',
    },
    {
      label: 'Lee et al., BMC Infectious Diseases: Incubation periods of viral gastroenteritis, a systematic review',
      url: 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC3849296/',
    },
    {
      label: 'CDC Stacks: Persistent infections with diverse co-circulating astroviruses in pediatric oncology patients, Memphis, Tennessee',
      url: 'https://stacks.cdc.gov/view/cdc/44391',
    },
    {
      label: 'Beyond the gastrointestinal tract: the emerging and diverse tissue tropisms of astroviruses (review)',
      url: 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8145421/',
    },
    {
      label: 'CDC: How to prevent norovirus (handwashing, cleaning, and disinfection steps for stomach viruses)',
      url: 'https://www.cdc.gov/norovirus/prevention/index.html',
    },
    {
      label: 'CDC: About norovirus (symptoms and signs of dehydration)',
      url: 'https://www.cdc.gov/norovirus/about/index.html',
    },
    {
      label: 'MDH: Norovirus infection (including advice on preparing food after illness)',
      url: 'https://www.health.state.mn.us/diseases/norovirus/index.html',
    },
    {
      label: 'MDH: Specific disease exclusion guidelines for child care and preschool',
      url: 'https://www.health.state.mn.us/diseases/foodborne/exclusions.html',
    },
    {
      label: 'MDH: Child care provider information on diarrheal illness',
      url: 'https://www.health.state.mn.us/diseases/foodborne/daycare.html',
    },
    {
      label: 'bioMérieux: BioFire FilmArray Gastrointestinal (GI) Panel',
      url: 'https://www.biomerieux.com/corp/en/our-offer/clinical-products/biofire-filmarray-gastrointestinal-panel.html',
    },
  ],
  lastReviewed: '2026-10-07',
}

export default profile
