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
      'In places with cold winters like Minnesota, astrovirus is most common in late winter and spring and is less common in summer. It can still show up any time of year.',
    peakMonths: [1, 2, 3, 4],
  },
  transmission:
    'Astrovirus spreads by the fecal-oral route: tiny amounts of stool (poop) from an infected person get into someone else’s mouth. This happens through close contact, hands that were not washed well, and contaminated surfaces such as diaper-changing areas and toys. Contaminated food or water can also spread it. It spreads easily in child care centers, schools, and nursing homes.',
  incubation:
    'Symptoms usually start about 3 to 5 days after exposure. A review of many studies found a median (typical) incubation of about 4.5 days.',
  contagiousPeriod:
    'The virus can be in stool starting about a day before symptoms and for several days after diarrhea stops. People with weakened immune systems can shed it for weeks or even months. People with no symptoms can also spread it.',
  symptoms: {
    common: ['Watery diarrhea', 'Stomach pain or cramps', 'Nausea or vomiting', 'Loss of appetite'],
    lessCommon: [
      'Low fever',
      'Headache',
      'Tiredness or body aches',
      'Diarrhea that lasts much longer than usual (more likely with a weakened immune system)',
    ],
    emergencyWarningSigns: [
      'Signs of serious dehydration: peeing very little or not at all, a very dry mouth, no tears when crying, or feeling dizzy or faint when standing up',
      'In a baby or young child: very few wet diapers, a sunken soft spot on the head, sunken eyes, or being unusually sleepy, limp, or fussy',
      'Confusion, extreme sleepiness, or being hard to wake up',
      'Green or bloody vomit, or vomit that looks like coffee grounds',
      'Bloody or black, tar-like stool',
      'Severe stomach pain that does not go away',
    ],
  },
  ageGroups: {
    infants: {
      risk: 'higher',
      summary:
        'Astrovirus is most common in babies and toddlers. The illness is usually mild, but babies can become dehydrated quickly.',
      actions: [
        'Keep breastfeeding or formula feeding, and offer smaller, more frequent feeds.',
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
        'Offer small sips of an oral rehydration solution often, especially after each bout of diarrhea or vomiting.',
        'Let your child go back to regular foods as soon as they are hungry.',
        'Keep your child home from child care or school until at least 24 hours after diarrhea and vomiting stop.',
        'Teach handwashing with soap and water after using the toilet and before eating.',
        'Do not give anti-diarrhea medicine to a child unless a clinician tells you to.',
      ],
    },
    adults: {
      risk: 'lower',
      summary:
        'Most adults have some protection from childhood infections and have mild or no symptoms. Parents and child care workers can still catch it from children.',
      actions: [
        'Drink plenty of fluids if you get sick. An oral rehydration solution is best if you are losing a lot of fluid.',
        'Wash your hands with soap and water after changing diapers, using the bathroom, or caring for someone who is sick.',
        'Stay home from work while sick, and avoid preparing food for others until you are well.',
        'Clean diaper-changing areas and bathrooms with a bleach-based cleaner or an EPA-registered disinfectant.',
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
        'Ask your provider or pharmacist before taking any anti-diarrhea or anti-nausea medicine.',
        'Wash your hands well, especially if you care for young children.',
      ],
    },
    immunocompromised: {
      risk: 'higher',
      summary:
        'People with weakened immune systems, such as children getting cancer treatment or transplant recipients, can have longer-lasting diarrhea and shed the virus for weeks to months. Very rarely, some astroviruses have caused brain infections (encephalitis or meningitis) in people with severely weakened immune systems.',
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
          'For mild illness, water, broth, or sports drinks can help. Keep breastfeeding or formula feeding babies. Return to normal foods as soon as the person feels hungry.',
        who: 'Anyone with mild illness.',
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
      'Keep sick children home from child care or school until at least 24 hours after diarrhea and vomiting stop.',
      'Change diapers on a surface you can clean, and disinfect it after each use.',
      'Clean toys, bathrooms, and other high-touch surfaces with a bleach solution or an EPA-registered disinfectant, following label directions.',
      'Do not prepare food for others while you have diarrhea or vomiting.',
    ],
  },
  testing:
    'Most people with a short bout of diarrhea do not need testing. When a clinician orders a stool test, for example for a child who is very sick, a person with a weakened immune system, or diarrhea that will not go away, labs often use a multiplex PCR panel (one test that checks for many germs at once), such as the BioFire GI Panel, which includes astrovirus. A positive result means the virus’s genetic material was found. It does not always prove astrovirus caused the symptoms, because the virus can linger after an illness or show up alongside other germs. There are no home tests.',
  whenToSeekCare: [
    'Call a clinician or your clinic’s nurse line if vomiting is so frequent that liquids will not stay down.',
    'Call if diarrhea lasts more than 3 days without getting better.',
    'Call if there is a fever over 102°F (38.9°C) or any blood in the stool.',
    'Call early for babies, adults 65 and older, pregnant people, and anyone with a weakened immune system who has vomiting or diarrhea.',
    'Go to urgent care the same day if there are signs of dehydration, such as peeing much less than usual, a dry mouth, or dizziness, and the person cannot drink enough to catch up.',
    'Call 911 or go to an emergency department for any emergency warning sign.',
  ],
  readingTheNumbers:
    'MN Pulse shows astrovirus as a BioFire detection rate: the percent of BioFire GI panel tests at participating labs in the region (not just Minnesota) that found astrovirus. These panels are mostly ordered for people sick enough to see a clinician or go to the hospital, so the number shows trends, not how many people are sick. Because young children are the main group infected, the number largely reflects illness in babies and toddlers. Based on past patterns in cold-winter climates, expect higher levels in late winter and spring. When a detection rate is small, a few extra positive tests can make the line jump, so look at the trend over several weeks. A sustained rise means more astrovirus is spreading. For families, that is a reminder to wash hands, clean diaper areas, and watch young children for dehydration. Emergency department (ED) and wastewater data generally do not track astrovirus separately, and MDH does not count individual astrovirus cases.',
  watchNotes: [
    'Astrovirus outbreaks are rarely identified. Only 10 astrovirus outbreaks were reported to CDC’s national outbreak reporting system from 2009 through 2018, and CDC researchers recommend testing for viruses like astrovirus when outbreak samples test negative for norovirus.',
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
