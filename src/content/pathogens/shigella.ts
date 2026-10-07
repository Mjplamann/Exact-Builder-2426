import type { PathogenProfile } from '../types'

const profile: PathogenProfile = {
  id: 'shigella',
  name: 'Shigella (shigellosis)',
  shortName: 'Shigella',
  aka: ['Shigellosis', 'Bacillary dysentery'],
  category: 'gastrointestinal',
  kind: 'bacterium',
  biofireTargets: ['Shigella/Enteroinvasive E. coli (EIEC)'],
  oneLiner:
    'A very contagious cause of diarrhea that spreads easily in child care and households. Some strains resist many antibiotics.',
  overview:
    'Shigella bacteria cause diarrhea (sometimes bloody), fever, and stomach pain, an illness called shigellosis. It takes only a few germs to make someone sick, so it spreads easily among young children, in child care, within households, and through sexual contact. Symptoms usually last about a week, and most people recover without antibiotics. Drug-resistant strains, including extensively drug-resistant (XDR) Shigella, are a growing concern in the United States.',
  seasonality: {
    summary:
      'In Minnesota, Shigella cases tend to follow outbreaks more than the calendar, so yearly counts can swing up and down. Nationally, cases tend to rise in late summer and early fall. But an outbreak in a child care center, school, or close-knit community can cause a spike in any month.',
    peakMonths: [7, 8, 9],
  },
  transmission:
    'Shigella spreads when tiny amounts of poop from a sick person get into another person’s mouth. This can happen through unwashed hands, for example after changing diapers or caring for someone who is sick. It can also spread through contaminated food or drinks, swallowing contaminated water while swimming, and sexual contact. Toddlers who are not fully toilet-trained spread it easily in child care. International travel is another source.',
  incubation: 'Usually 1 to 2 days after exposure, but it can take up to about a week.',
  contagiousPeriod:
    'People can spread Shigella while they have diarrhea and for several weeks after it ends, even after they feel better. Some people never have symptoms but can still spread it. Effective antibiotics can shorten the time the germ stays in stool.',
  symptoms: {
    common: [
      'Diarrhea, which can be bloody or last more than 3 days',
      'Fever',
      'Stomach pain or cramps',
      'Feeling the need to pass stool even when the bowels are empty',
    ],
    lessCommon: [
      'Nausea and vomiting',
      'Seizures in young children, usually with a high fever',
      'Joint pain after the infection (reactive arthritis)',
      'Bloodstream infection, mostly in people with weakened immune systems',
    ],
    emergencyWarningSigns: [
      'Signs of serious dehydration (losing too much fluid): peeing very little or not at all, a very dry mouth and throat, or feeling dizzy when standing up',
      'In a baby or young child: far fewer wet diapers than usual, crying without tears, or being unusually sleepy, floppy, or hard to wake',
      'A seizure (convulsion)',
      'A fever of 100.4°F (38°C) or higher in a baby younger than 3 months',
      'Vomiting so often that you can’t keep any liquids down',
      'Severe belly pain, or high fever with shaking chills or confusion, especially in someone with a weakened immune system',
    ],
  },
  ageGroups: {
    infants: {
      risk: 'higher',
      summary:
        'Babies can catch Shigella from older siblings, family members, or child care, and they become dehydrated quickly. Fever or bloody diarrhea in a baby needs prompt care.',
      actions: [
        'Call your baby’s clinician right away for diarrhea with fever or blood.',
        'Get care right away for any fever of 100.4°F (38°C) or higher in a baby younger than 3 months.',
        'Keep breastfeeding or formula feeding, and ask about an oral rehydration solution (ORS).',
        'Wash your hands with soap and water after every diaper change, and throw diapers away in a covered bin.',
      ],
    },
    children: {
      risk: 'higher',
      summary:
        'Children younger than 5 are the most likely to get shigellosis, and it spreads quickly in child care and to family members. A high fever can occasionally cause seizures in young children.',
      actions: [
        'Keep your child home from child care or school until your clinician or health department says it’s OK; negative stool tests may be required.',
        'Supervise handwashing with soap and water after the toilet and before eating.',
        'Keep children with diarrhea out of pools, splash pads, and lakes.',
        'Don’t give anti-diarrhea medicine unless your child’s clinician says to.',
        'Offer fluids often, and use an oral rehydration solution if needed.',
      ],
    },
    adults: {
      risk: 'lower',
      summary:
        'Most healthy adults recover in about a week. Adults often catch Shigella from sick children, travel, or sexual contact. Gay, bisexual, and other men who have sex with men are at higher risk, and drug-resistant strains have been more common in this group.',
      actions: [
        'Wash hands with soap and water after using the toilet or changing diapers, and before preparing food.',
        'Don’t prepare food for others while you have diarrhea.',
        'Avoid sex while you have diarrhea and for at least 2 weeks after it ends.',
        'If you are prescribed an antibiotic, take it exactly as directed and call back if you aren’t improving.',
        'Food, child care, and health care workers should not go back to work until cleared by their employer or health department.',
      ],
    },
    'older-adults': {
      risk: 'lower',
      summary:
        'Most adults 50 to 64 recover in about a week. Call your clinician sooner if you have a long-term health condition or a weakened immune system.',
      actions: [
        'Drink fluids and watch for dizziness or peeing less than usual.',
        'Wash hands carefully, especially when caring for grandchildren in diapers.',
        'Call your clinician for bloody diarrhea, high fever, or diarrhea lasting more than 3 days.',
      ],
    },
    seniors: {
      risk: 'moderate',
      summary:
        'Older adults can become dehydrated more quickly and are more likely to have other health conditions, so prompt care matters.',
      actions: [
        'Call your clinician early if you have diarrhea with fever or blood.',
        'Sip fluids often, and get help right away for dizziness, confusion, or very little urine.',
        'Wash hands with soap and water after the bathroom and before eating.',
      ],
    },
    pregnant: {
      risk: 'moderate',
      summary:
        'Pregnant people get Shigella the same ways as others. Fever, bloody diarrhea, or dehydration during pregnancy should be checked by a health care provider, who can choose an antibiotic that is safe in pregnancy if one is needed.',
      actions: [
        'Call your prenatal care provider if you have diarrhea with fever or blood, or can’t keep fluids down.',
        'Drink plenty of fluids.',
        'Ask before taking any anti-diarrhea medicine.',
        'Wash hands carefully, especially if you have young children at home.',
      ],
    },
    immunocompromised: {
      risk: 'higher',
      summary:
        'People with weakened immune systems, including people living with HIV, are more likely to have severe or longer-lasting illness and, rarely, a bloodstream infection. Drug-resistant strains have been reported more often in people with HIV.',
      actions: [
        'Call your care team at the first sign of diarrhea with fever or blood.',
        'Ask for a stool culture so the lab can test which antibiotics will work.',
        'Take any antibiotic exactly as prescribed, and call back if you aren’t getting better.',
        'Avoid sex while you have diarrhea and for at least 2 weeks after it ends.',
      ],
    },
  },
  treatment: {
    summary:
      'Most people recover in about a week with fluids and rest. Antibiotics can shorten illness and help prevent spread. But resistance is common, so clinicians use them mainly for severe illness, for people with weakened immune systems, or to help control outbreaks. When possible, a lab test guides which drug to use. CDC has warned about rising extensively drug-resistant (XDR) Shigella, which commonly used antibiotics cannot treat.',
    options: [
      {
        name: 'Fluids and oral rehydration',
        type: 'supportive',
        detail:
          'Drink extra fluids. Oral rehydration solutions (ORS) from a drugstore replace water, salts, and sugar in the right balance. People who are very dehydrated may need IV fluids.',
        who: 'Everyone with diarrhea.',
      },
      {
        name: 'Antibiotics',
        type: 'antibiotic',
        detail:
          'Can shorten illness and the time the germ stays in stool. Because resistance is common, a stool culture with antibiotic testing helps pick a drug that works. XDR strains resist all of the commonly recommended antibiotics (azithromycin, ciprofloxacin, ceftriaxone, trimethoprim-sulfamethoxazole, and ampicillin); clinicians may consult an infectious disease specialist.',
        who: 'People with severe illness or weakened immune systems, and sometimes to stop spread in households, child care, or other group settings.',
      },
      {
        name: 'Anti-diarrhea medicines (such as loperamide)',
        type: 'other',
        detail:
          'Avoid them if you have a fever or bloody diarrhea, which are common with Shigella. Don’t give them to children unless a clinician says to.',
        who: 'Ask a clinician or pharmacist before using.',
      },
    ],
    antibioticsHelp: 'sometimes',
  },
  prevention: {
    vaccines: [],
    everyday: [
      'Wash hands with soap and water for at least 20 seconds after using the toilet or changing diapers, and before eating or preparing food.',
      'Throw away soiled diapers in a covered trash can, and clean diaper-changing areas after each use.',
      'Don’t prepare food for others while you have diarrhea.',
      'Stay out of pools, splash pads, lakes, and hot tubs while you have diarrhea, and try not to swallow water when swimming.',
      'Avoid sex while you or a partner has diarrhea and for at least 2 weeks after it ends.',
      'When traveling internationally, follow safe food and water practices.',
    ],
  },
  testing:
    'A stool (poop) test is needed. Fast multiplex PCR panels, such as the BioFire GI Panel, report “Shigella/Enteroinvasive E. coli (EIEC)” because the test can’t tell Shigella apart from a close relative called enteroinvasive E. coli. A stool culture (growing the bacteria) confirms Shigella and lets the lab test which antibiotics will work, which is important because of drug resistance. Minnesota labs send positive samples to MDH so strains can be compared to find outbreaks. There are no home tests.',
  whenToSeekCare: [
    'Call your clinician for bloody diarrhea, diarrhea lasting more than 3 days, or a fever higher than 102°F.',
    'Call early if a baby, an older adult, a pregnant person, or someone with a weakened immune system has diarrhea.',
    'If you’re taking an antibiotic and not getting better after a few days, call back; the strain may be resistant.',
    'Tell your clinician about recent travel, a sick household or child care contact, or a sex partner with diarrhea; this helps them test and treat correctly.',
    'Go to urgent care (or call your clinic’s nurse line) the same day if you can’t keep fluids down for several hours.',
    'If you think food or an event made you sick, also call the MDH Foodborne Illness Hotline at 1-877-FOOD-ILL (1-877-366-3455).',
  ],
  readingTheNumbers:
    'MN Pulse does not have a current weekly number for Shigella in Minnesota. CDC’s weekly tables of reported diseases leave Minnesota’s Shigella counts blank during the year, because Minnesota appears to send them to CDC after the year ends, so a blank does not mean zero. MDH’s yearly reports are the best guide to Minnesota totals. When available, MN Pulse can also show a BioFire detection rate: the share of GI panel stool tests that are positive for “Shigella/EIEC” (Shigella or its close relative, enteroinvasive E. coli). Most people tested are sick enough to see a clinician, so mild cases are missed. Shigella spreads from person to person. So numbers can jump with an outbreak in a child care center or community instead of following a smooth seasonal curve. A rising number means more Shigella is showing up among people seeking care. For an average person, it’s a reminder to wash hands with soap and water and keep children with diarrhea home and out of pools. See a clinician for bloody diarrhea or high fever. A positive panel result is not the same as a culture-confirmed case (one where the lab grew Shigella to confirm it). Emergency department data for stomach illness include many causes, not just Shigella.',
  watchNotes: [
    'In 2023, CDC issued a health advisory about a rise in extensively drug-resistant (XDR) Shigella in the United States. About 5% of Shigella infections reported to CDC in 2022 were XDR, up from 0% in 2015. XDR Shigella was seen most often among gay, bisexual, and other men who have sex with men; people experiencing homelessness; international travelers; and people living with HIV. But XDR strains can spread to anyone, including children.',
    'If you are prescribed an antibiotic for Shigella and are not improving after a few days, contact your clinician; a culture can show whether the strain is resistant.',
    'In Minnesota, child care outbreaks of Shigella can last for weeks. MDH or your local health department may require negative stool tests before children or staff with Shigella return.',
  ],
  sources: [
    { label: 'CDC: About Shigella Infection', url: 'https://www.cdc.gov/shigella/about/index.html' },
    { label: 'CDC: Signs and Symptoms of Shigella Infection', url: 'https://www.cdc.gov/shigella/signs-symptoms/index.html' },
    {
      label: 'CDC: Preventing Shigella Infection Among Young Children',
      url: 'https://www.cdc.gov/shigella/prevention/preventing-shigella-infection-among-young-children.html',
    },
    {
      label: 'CDC Health Alert Network (HAN) 00486: Extensively Drug-Resistant (XDR) Shigella (2023)',
      url: 'https://www.cdc.gov/han/2023/han00486.html',
    },
    { label: 'CDC: Food Poisoning Symptoms', url: 'https://www.cdc.gov/food-safety/signs-symptoms/index.html' },
    {
      label: 'MDH: Childcare Provider Information on Shigellosis',
      url: 'https://www.health.state.mn.us/diseases/shigellosis/childcare.html',
    },
    {
      label: 'MDH: Specific disease exclusion guidelines for child care and preschool',
      url: 'https://www.health.state.mn.us/diseases/foodborne/exclusions.html',
    },
    {
      label: 'MDH: Foodborne and Enteric Diseases, Annual Summary',
      url: 'https://www.health.mn.gov/diseases/reportable/dcn/enteric.html',
    },
    {
      label: 'CDC MMWR (via PMC): FoodNet report on foodborne infection trends and fast (culture-independent) tests',
      url: 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11221634/',
    },
    {
      label: 'bioMérieux: BioFire FilmArray Gastrointestinal (GI) Panel',
      url: 'https://www.biomerieux.com/corp/en/our-offer/clinical-products/biofire-filmarray-gastrointestinal-panel.html',
    },
  ],
  lastReviewed: '2026-10-07',
}

export default profile
