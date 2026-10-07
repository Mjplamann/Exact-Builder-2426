import type { PathogenProfile } from '../types'

const profile: PathogenProfile = {
  id: 'adenovirus-gi',
  name: 'Enteric adenovirus (types 40 and 41)',
  shortName: 'Adenovirus 40/41',
  aka: ['Adenovirus F40/41', 'Enteric adenovirus', 'Human adenovirus species F'],
  category: 'gastrointestinal',
  kind: 'virus',
  biofireTargets: ['Adenovirus F40/41'],
  oneLiner: 'Adenovirus types 40 and 41 infect the gut and cause watery diarrhea in babies and toddlers that can last a week or more.',
  overview:
    'Adenoviruses are a large family of viruses. Most cause colds, sore throats, or pink eye, but types 40 and 41 (also called enteric, or gut, adenoviruses) mainly infect the intestines. They are a leading cause of diarrhea in children under 2, and the diarrhea often lasts longer than with other stomach viruses. Older children and adults rarely get sick from these types, which MN Pulse tracks separately from respiratory adenovirus.',
  seasonality: {
    summary:
      'Unlike many stomach viruses, enteric adenovirus does not follow a clear season. Studies have not found a consistent seasonal pattern. It can show up in Minnesota any time of year.',
    peakMonths: [],
  },
  transmission:
    'Enteric adenovirus spreads when tiny amounts of stool (poop) from an infected child get into someone else’s mouth. Common ways include diaper changing, shared toys and surfaces, and hands that were not washed well. Swallowing water contaminated with sewage can also spread these viruses, but this is less common. Adenoviruses can survive a long time on surfaces and resist some common disinfectants. Outbreaks can happen in child care centers and hospital children’s wards.',
  incubation: 'Symptoms usually start 3 to 10 days after exposure.',
  contagiousPeriod:
    'Children shed (pass) the virus in their stool while they have diarrhea. Adenoviruses can keep being shed after a person recovers, sometimes for a long time, especially in people with weakened immune systems. Shedding often happens without symptoms, so keep up handwashing and careful diaper changing after your child feels better.',
  symptoms: {
    common: [
      'Watery diarrhea, often lasting a week or longer',
      'Vomiting',
      'Low fever',
      'Stomach pain or cramps',
    ],
    lessCommon: [
      'Loss of appetite',
      'Fussiness or tiredness',
      'Diarrhea lasting 2 weeks or more',
      'Rarely, liver inflammation (hepatitis), which can cause yellow skin or eyes',
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
        'Babies and toddlers under 2 are the group most often sick from enteric adenovirus. Because the diarrhea can last a week or more, dehydration is the main concern.',
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
        'Most illness is in toddlers, especially those in child care. Older children and teens rarely get sick from these types. The diarrhea can last longer than parents expect, often a week or more.',
      actions: [
        'Offer small sips of an oral rehydration solution often, and let your child go back to regular foods as soon as they are hungry.',
        'Keep your child home from child care while they have diarrhea or vomiting, and follow the program’s return rules.',
        'Call your clinician if diarrhea is not getting better after 3 days or lasts more than a week, or sooner if your child seems dehydrated.',
        'Do not give anti-diarrhea medicine to a child unless a clinician tells you to.',
        'Do not give Pepto-Bismol (bismuth subsalicylate) to children or teens. It is related to aspirin and is linked to Reye’s syndrome, a rare but serious illness.',
      ],
    },
    adults: {
      risk: 'lower',
      summary:
        'Adults rarely get sick from adenovirus types 40 and 41. Parents and child care workers can still carry the virus on their hands to other children.',
      actions: [
        'Wash your hands with soap and water after changing diapers or helping a child in the bathroom.',
        'Disinfect changing tables, potty chairs, and toys with a product that lists adenovirus on its label, or a bleach solution.',
        'If you get diarrhea, drink plenty of fluids and stay home from work while sick.',
        'Do not prepare food for others while sick and for at least 3 days after symptoms stop, as MDH advises for norovirus, which spreads the same way.',
        'If you work in food service, health care, or child care, follow your workplace’s return-to-work rules.',
      ],
    },
    'older-adults': {
      risk: 'lower',
      summary:
        'Illness from these types is uncommon at this age. If you do get diarrhea, health problems like heart or kidney disease, or medicines like water pills (diuretics), can make dehydration more serious.',
      actions: [
        'Wash your hands well when caring for grandchildren in diapers.',
        'Drink extra fluids if you get diarrhea or vomiting.',
        'Ask your clinician whether to pause any regular medicines, such as water pills, while you cannot keep fluids down.',
      ],
    },
    seniors: {
      risk: 'lower',
      summary:
        'Illness from these types is uncommon at this age. If you do get sick, older adults can become dehydrated more quickly from any vomiting or diarrhea.',
      actions: [
        'Drink fluids often if you are sick, even if you do not feel thirsty.',
        'Call your clinician early if you cannot keep fluids down, feel dizzy, or seem confused.',
        'Wash your hands with soap and water after helping young children with diapers or the bathroom.',
      ],
    },
    pregnant: {
      risk: 'lower',
      summary:
        'There is no evidence that enteric adenovirus is more severe during pregnancy. Pregnant people who care for young children may be exposed more often.',
      actions: [
        'Wash your hands well after diaper changes and before eating.',
        'Sip fluids often if you get diarrhea or vomiting.',
        'Call your prenatal care provider if you cannot keep fluids down, have a fever, or feel dizzy.',
        'Ask your provider or pharmacist before taking any anti-diarrhea or anti-nausea medicine, including Pepto-Bismol.',
      ],
    },
    immunocompromised: {
      risk: 'higher',
      summary:
        'People with weakened immune systems, including children who have had a stem cell or organ transplant, are at higher risk of severe adenovirus illness. They can have longer-lasting diarrhea and may shed (pass) the virus for a long time.',
      actions: [
        'Call your care team early if you or your child has diarrhea, especially if it lasts more than a day or two.',
        'Ask whether stool testing is needed, since long-lasting diarrhea has many possible causes.',
        'Drink plenty of fluids, and ask about IV fluids if you cannot keep up.',
        'Keep washing hands well after recovery, because shedding can continue.',
      ],
    },
  },
  treatment: {
    summary:
      'There is no specific medicine for adenovirus stomach infections in otherwise healthy people. Treatment focuses on fluids to prevent dehydration while the illness runs its course, which can take a week or more. Antibiotics do not help because adenovirus is a virus.',
    options: [
      {
        name: 'Oral rehydration solution (ORS)',
        type: 'supportive',
        detail:
          'Store-bought solutions (such as Pedialyte or store brands) have the right mix of water, salts, and sugar to replace what is lost. For a child who is vomiting, start with small sips, about a teaspoon every few minutes, and give more as it stays down. Keep offering fluids for as long as the diarrhea lasts.',
        who: 'Anyone with diarrhea or vomiting, especially babies and young children.',
      },
      {
        name: 'Other fluids and regular food',
        type: 'supportive',
        detail:
          'Keep breastfeeding or giving full-strength formula to babies. Do not give plain water to babies under 6 months, and do not water down formula. Return to normal foods as soon as your child is hungry. Eating helps the gut recover.',
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
      {
        name: 'Antiviral medicine (such as cidofovir)',
        type: 'antiviral',
        detail:
          'No antiviral medicine is FDA-approved to treat adenovirus. Specialists sometimes use cidofovir for severe or spreading adenovirus infections in people with very weak immune systems. It can harm the kidneys and is not used for ordinary stomach illness.',
        who: 'Only people with severely weakened immune systems and serious adenovirus disease, as decided by a specialist.',
      },
    ],
    antibioticsHelp: 'no',
  },
  prevention: {
    vaccines: [],
    everyday: [
      'Wash your hands with soap and water for at least 20 seconds after diaper changes and using the toilet, and before eating or preparing food.',
      'Change diapers on a surface you can clean, and disinfect it after each use.',
      'Clean toys and high-touch surfaces with a bleach solution or a disinfectant registered by the EPA (US Environmental Protection Agency) that lists adenovirus on its label. Adenoviruses can resist some common cleaners. Never mix bleach with ammonia or other cleaners.',
      'Keep sick children home from child care while they have diarrhea or vomiting, and follow the program’s return rules.',
      'Do not prepare food for others while sick and for at least 3 days after symptoms stop.',
      'Keep children with diarrhea out of swimming pools, splash pads, and lakes.',
      'Do not share cups, utensils, or towels with someone who is sick.',
    ],
  },
  testing:
    'Most children with diarrhea do not need testing. Sometimes a clinician orders a stool test. This is more likely for a child who is very sick, has diarrhea lasting more than a week, or has a weakened immune system. Labs may use a multiplex PCR panel. PCR is a lab test that finds a germ’s genetic material, and a multiplex panel checks for many germs at once. The BioFire GI (gastrointestinal) Panel is one example; it reports “Adenovirus F40/41.” A positive result shows the virus is present. It does not always prove the virus caused the illness, because adenovirus can be shed after recovery or found alongside other germs. Respiratory adenovirus tests from a nose swab are different and do not tell you about types 40 and 41. There are no home tests.',
  whenToSeekCare: [
    'Call a clinician or your clinic’s nurse line if vomiting is so frequent that liquids will not stay down.',
    'Call the same day for early signs of dehydration: fewer wet diapers, peeing less than usual, a dry mouth, or crying with few tears.',
    'Call if diarrhea is not getting better after 3 days or lasts more than a week, even if your child seems OK otherwise.',
    'Call the same day if there is a fever over 102°F (38.9°C) or a small amount of blood in the stool.',
    'Call early for babies and for anyone with a weakened immune system who has diarrhea.',
    'Call a clinician the same day if a child develops yellow skin or yellow whites of the eyes (jaundice). Go to an emergency department if jaundice comes with confusion, extreme sleepiness, or unusual bleeding or bruising.',
    'Go to urgent care the same day if there are signs of dehydration and your child cannot drink enough to catch up.',
    'Go to an emergency department for any emergency warning sign. Call 911 for fainting, confusion, or trouble staying awake.',
  ],
  readingTheNumbers:
    'MN Pulse shows enteric adenovirus as a BioFire detection rate. This is the percent of BioFire GI (stomach and gut) panel tests at participating labs in the Midwest (not just Minnesota) that found adenovirus F40/41. Most positive tests come from babies and toddlers sick enough to need a clinic visit or hospital care. But panels are run on people of all ages, so the percentage can also shift when the mix of people being tested changes. For example, if many more adults are tested during a norovirus surge, this number can dip. Some detections are also in children with mild or no symptoms. The number shows trends, not how many people are sick. This virus does not usually follow a strong season, so look for a rise that lasts several weeks rather than expecting a winter peak. When a detection rate is small, a few extra positive tests can make the line jump. A sustained rise usually means more of this virus is circulating among young children. For families, that is a reminder to focus on handwashing, diaper hygiene, and watching for dehydration. This number is separate from the respiratory adenovirus data on MN Pulse. Public emergency department (ED) data do not track enteric adenovirus separately, and MDH does not count individual cases. Wastewater testing at some Minnesota treatment plants, through the WastewaterSCAN program, looks for these stomach types of adenovirus and can give a community-wide signal that includes people who were never tested.',
  watchNotes: [
    'As of October 2026, there is no adenovirus vaccine for the general public. The vaccine used by the US military protects only against types 4 and 7, which cause respiratory illness, not types 40 and 41.',
    'MDH asks child care providers to report when more than 10% of children and staff are sick with diarrhea or vomiting.',
  ],
  sources: [
    {
      label: 'CDC: About adenovirus',
      url: 'https://www.cdc.gov/adenovirus/about/index.html',
    },
    {
      label: 'CDC: Clinical overview of adenovirus (types 40 and 41, gastroenteritis and hepatitis)',
      url: 'https://www.cdc.gov/adenovirus/hcp/clinical-overview/index.html',
    },
    {
      label: 'CDC: Adenovirus guidelines for outbreaks (for health care providers)',
      url: 'https://www.cdc.gov/adenovirus/hcp/outbreaks/index.html',
    },
    {
      label: 'CDC: Adenovirus vaccine information statement (military vaccine for types 4 and 7)',
      url: 'https://www.cdc.gov/vaccines/hcp/current-vis/adenovirus.html',
    },
    {
      label: 'Public Health Agency of Canada: Pathogen safety data sheet, adenovirus serotypes 40 and 41',
      url: 'https://www.canada.ca/en/public-health/services/laboratory-biosafety-biosecurity/pathogen-safety-data-sheets-risk-assessment/adenovirus-serotypes-40-41.html',
    },
    {
      label: 'Burden, clinical characteristics, risk factors, and seasonality of adenovirus 40/41 diarrhea in children (MAL-ED study)',
      url: 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC9277636/',
    },
    {
      label: 'CDC Emerging Infectious Diseases: Non-norovirus viral gastroenteritis outbreaks reported to NORS, USA, 2009–2018',
      url: 'https://wwwnc.cdc.gov/eid/article/27/2/20-3943_article',
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
      label: 'WastewaterSCAN data dashboard',
      url: 'https://data.wastewaterscan.org/',
    },
    {
      label: 'bioMérieux: BioFire FilmArray Gastrointestinal (GI) Panel',
      url: 'https://www.biomerieux.com/corp/en/our-offer/clinical-products/biofire-filmarray-gastrointestinal-panel.html',
    },
  ],
  lastReviewed: '2026-10-07',
}

export default profile
