import type { PathogenProfile } from '../types'

const profile: PathogenProfile = {
  id: 'sapovirus',
  name: 'Sapovirus',
  shortName: 'Sapovirus',
  aka: ['Sapporo-like virus', 'Human sapovirus'],
  category: 'gastrointestinal',
  kind: 'virus',
  biofireTargets: ['Sapovirus (I, II, IV, and V)'],
  oneLiner: 'A cousin of norovirus that causes short bouts of vomiting and diarrhea, mostly in young children and in group settings.',
  overview:
    'Sapovirus is a stomach virus in the same family as norovirus (the caliciviruses). It causes gastroenteritis (swelling and irritation of the stomach and intestines), with diarrhea, vomiting, and stomach cramps that usually pass in a few days. It is most common in young children, but outbreaks also happen in nursing homes, child care centers, and schools. The main risk is dehydration (losing too much body fluid), especially for babies, older adults, and people with weakened immune systems.',
  seasonality: {
    summary:
      'Sapovirus can spread any time of year. Across the US, most reported sapovirus outbreaks happen from November through April, so Minnesotans are most likely to run into it during the colder months.',
    peakMonths: [12, 1, 2, 3],
  },
  transmission:
    'Sapovirus spreads when tiny amounts of stool (poop), and possibly vomit, from an infected person get into someone else’s mouth. This can happen through close contact, such as caring for a sick child, or by touching a contaminated surface and then your mouth. Food handled by a sick worker, shellfish from contaminated water, and contaminated drinking water have also been linked to outbreaks. Most reported outbreaks spread from person to person in places like long-term care facilities, child care centers, and schools.',
  incubation:
    'Symptoms usually start 1 to 4 days after exposure, most often in about 2 days. A review of many studies found a median (typical) incubation of 1.7 days.',
  contagiousPeriod:
    'People are most contagious while they are sick and for the first few days after they feel better. The virus can stay in stool for days to weeks after symptoms end, and people with no symptoms can also spread it. Keep washing your hands well even after you recover.',
  symptoms: {
    common: [
      'Diarrhea (loose, watery stools)',
      'Vomiting',
      'Nausea (feeling sick to your stomach)',
      'Stomach cramps or pain',
    ],
    lessCommon: ['Low fever or chills', 'Headache', 'Muscle aches', 'Tiredness', 'Loss of appetite'],
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
        'Babies can lose fluid quickly from vomiting and diarrhea, so dehydration is the main concern. Most babies recover in a few days with extra fluids.',
      actions: [
        'Keep breastfeeding or giving full-strength formula, and offer smaller, more frequent feeds. Do not give plain water to a baby under 6 months.',
        'Ask your clinician about using an oral rehydration solution (ORS) if your baby is vomiting or has a lot of diarrhea.',
        'Count wet diapers. Fewer wet diapers is an early sign of dehydration.',
        'Call a clinician right away if your baby is younger than 3 months and has a fever of 100.4°F (38°C) or higher.',
        'Wash your hands with soap and water after every diaper change.',
      ],
    },
    children: {
      risk: 'moderate',
      summary:
        'Sapovirus is most common in children under 5. Most children feel better in a few days, but young children can become dehydrated. As rotavirus vaccines have cut rotavirus illness, viruses like sapovirus and norovirus now cause a larger share of stomach illness in young children.',
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
        'Healthy adults usually have a mild illness that passes in a few days. Many adults catch it while caring for a sick child or family member.',
      actions: [
        'Drink plenty of fluids. Water, broth, or sports drinks help with mild illness; an oral rehydration solution is best if you are losing a lot of fluid.',
        'Stay home from work while sick. Do not prepare food for others until at least 3 days after symptoms stop, as MDH advises for norovirus, a close cousin.',
        'If you work in food service, health care, or child care, follow your workplace’s return-to-work rules.',
        'Wash your hands with soap and water, especially after using the bathroom or caring for someone who is sick.',
        'Clean up vomit or diarrhea right away with a bleach solution or a disinfectant labeled for norovirus.',
      ],
    },
    'older-adults': {
      risk: 'lower',
      summary:
        'Most people in this age group have a short, mild illness. Health problems such as heart or kidney disease, or medicines like water pills (diuretics), can make dehydration more serious.',
      actions: [
        'Drink extra fluids at the first sign of illness.',
        'Ask your clinician whether to pause any regular medicines, such as water pills, while you cannot keep fluids down.',
        'Call your clinician if you feel dizzy when standing or are peeing much less than usual.',
        'Wash your hands with soap and water often. Hand sanitizer is not a substitute.',
      ],
    },
    seniors: {
      risk: 'moderate',
      summary:
        'Older adults, especially those living in nursing homes or assisted living, are more likely to become dehydrated or have complications. A study of outbreaks in Minnesota and Oregon found that most sapovirus outbreaks happened in long-term care facilities.',
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
        'There is no evidence that sapovirus is more severe during pregnancy. Still, vomiting and diarrhea can lead to dehydration, and staying hydrated is especially important while pregnant.',
      actions: [
        'Sip fluids often. An oral rehydration solution can help if you are losing a lot of fluid.',
        'Call your prenatal care provider if you cannot keep fluids down, have a fever, or feel dizzy.',
        'Ask your provider or pharmacist before taking any anti-diarrhea or anti-nausea medicine, including Pepto-Bismol.',
        'Later in pregnancy, call right away if you notice your baby is moving less than usual.',
      ],
    },
    immunocompromised: {
      risk: 'higher',
      summary:
        'People with weakened immune systems, such as transplant recipients or people getting chemotherapy, can have diarrhea that lasts much longer. They may also shed (pass) the virus in their stool for a long time.',
      actions: [
        'Call your care team early if you have vomiting or diarrhea, especially if it lasts more than a day or two.',
        'Ask whether stool testing is needed, since long-lasting diarrhea has many possible causes.',
        'Drink plenty of fluids, and ask about IV fluids if you cannot keep up.',
        'Keep washing your hands well after you feel better, because you may shed the virus longer.',
      ],
    },
  },
  treatment: {
    summary:
      'There is no medicine that kills sapovirus. Treatment focuses on replacing lost fluids until the illness passes, usually within a few days. Antibiotics do not help because sapovirus is a virus.',
    options: [
      {
        name: 'Oral rehydration solution (ORS)',
        type: 'supportive',
        detail:
          'Store-bought solutions (such as Pedialyte or store brands) have the right mix of water, salts, and sugar to replace what is lost. For someone who is vomiting, start with small sips, about a teaspoon every few minutes, and give more as it stays down.',
        who: 'Anyone with vomiting or diarrhea, especially babies, young children, and older adults.',
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
        name: 'Anti-diarrhea medicine (loperamide, such as Imodium)',
        type: 'other',
        detail:
          'This over-the-counter medicine may ease watery diarrhea in adults. Do not use it if you have a high fever or blood in your stool. Never take more than the label says; high doses can cause serious heart problems. Check with a pharmacist or clinician first if you are pregnant, have a weakened immune system, or have other health conditions.',
        who: 'Adults only. It is not recommended for children unless a clinician advises it.',
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
      'Wash your hands with soap and water for at least 20 seconds, especially after using the toilet or changing diapers and before eating or preparing food. Hand sanitizer does not work as well against stomach viruses like this one, so use it only in addition to handwashing.',
      'Stay home from work, school, or child care while sick, and follow your workplace’s or program’s return rules.',
      'Do not cook or prepare food for others while sick and for at least 3 days after symptoms stop. MDH advises this for norovirus, a close cousin of sapovirus.',
      'Clean up vomit or diarrhea right away while wearing gloves. Use a bleach solution (5 to 25 tablespoons of household bleach per gallon of water) or a disinfectant registered by the EPA (US Environmental Protection Agency) for norovirus. Never mix bleach with ammonia or other cleaners, and open a window while you clean.',
      'Wash soiled clothes and bedding in hot water with detergent, and dry them on high heat.',
      'Rinse fruits and vegetables, and cook oysters and other shellfish thoroughly.',
      'There is no vaccine for sapovirus, and rotavirus vaccine does not protect against it. These everyday steps are the best protection.',
    ],
  },
  testing:
    'Most people with a short stomach illness do not need testing. Sometimes a clinician orders a stool test. This is more likely for a person in the hospital, someone with a weakened immune system, or diarrhea that will not go away. Labs often use a multiplex PCR panel. PCR is a lab test that finds a germ’s genetic material, and a multiplex panel checks for many germs at once. The BioFire GI (gastrointestinal) Panel is one example. It detects sapovirus genogroups (strain groups) I, II, IV, and V. A positive result does not always prove sapovirus caused the symptoms. The virus can linger after an illness or show up alongside other germs. Public health labs, including MDH’s, have tested stool from outbreaks for sapovirus when norovirus tests were negative. There are no home tests.',
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
    'MN Pulse shows sapovirus as a BioFire detection rate. This is the percent of BioFire GI (stomach and gut) panel tests at participating labs in the Midwest (not just Minnesota) that found sapovirus. These panels are mostly ordered for people sick enough to see a clinician or go to the hospital. Many are young children, older adults, or people with weakened immune systems. So the number shows trends, not how many people are sick. Based on outbreak patterns, expect higher levels in the colder months. The percentage can also shift when the mix of people being tested changes. Because the rate is small, a few extra positive tests can make the line jump, so look at the trend over several weeks rather than one week’s value. A rise that lasts several weeks usually means more sapovirus is going around. For most people, that is a reminder to wash hands with soap and water, stay home when sick, and watch young children and older relatives for dehydration. Emergency department (ED) and wastewater data generally do not track sapovirus separately, and MDH does not count individual sapovirus cases.',
  watchNotes: [
    'MDH asks child care providers to report when more than 10% of children and staff are sick with diarrhea or vomiting. MDH also investigates outbreaks in places like long-term care facilities.',
    'If you think you got sick from food at a restaurant or event, call MDH’s Foodborne Illness Hotline at 1-877-366-3455.',
  ],
  sources: [
    {
      label: 'CDC Emerging Infectious Diseases: Sapovirus outbreaks in long-term care facilities, Oregon and Minnesota, 2002–2009 (PDF)',
      url: 'https://wwwnc.cdc.gov/eid/article/18/5/pdfs/11-1843.pdf',
    },
    {
      label: 'CDC Emerging Infectious Diseases: Non-norovirus viral gastroenteritis outbreaks reported to NORS, USA, 2009–2018',
      url: 'https://wwwnc.cdc.gov/eid/article/27/2/20-3943_article',
    },
    {
      label: 'Lee et al., BMC Infectious Diseases: Incubation periods of viral gastroenteritis, a systematic review',
      url: 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC3849296/',
    },
    {
      label: 'CDC: How to prevent norovirus (handwashing, cleaning, and food safety steps that also apply to sapovirus)',
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
