import type { PathogenProfile } from '../types'

const profile: PathogenProfile = {
  id: 'stec',
  name: 'Shiga toxin–producing E. coli (STEC)',
  shortName: 'STEC',
  aka: ['E. coli O157:H7', 'Shiga toxin–producing Escherichia coli', 'Enterohemorrhagic E. coli (EHEC)'],
  category: 'gastrointestinal',
  kind: 'bacterium',
  biofireTargets: ['Shiga-like toxin-producing E. coli (STEC) stx1/stx2', 'E. coli O157'],
  oneLiner:
    'E. coli strains that make Shiga toxin and cause bloody diarrhea. Can lead to kidney failure (HUS), mostly in young children.',
  overview:
    'Most E. coli bacteria are harmless, but some make a poison called Shiga toxin. These Shiga toxin–producing E. coli (STEC), including the well-known E. coli O157:H7, cause severe stomach cramps and diarrhea that often turns bloody. About 5 to 10 out of every 100 people diagnosed with E. coli O157 develop hemolytic uremic syndrome (HUS), a serious condition that can cause kidney failure; young children and older adults are at highest risk. Antibiotics and anti-diarrhea medicines are generally not recommended because they may raise the risk of HUS.',
  seasonality: {
    summary:
      'STEC infections happen year-round but rise in summer and early fall in Minnesota. That’s when people grill more ground beef, eat more fresh produce, swim in lakes, and visit farms, petting zoos, and fairs.',
    peakMonths: [6, 7, 8, 9],
  },
  transmission:
    'STEC lives in the guts of cattle and other animals such as sheep, goats, and deer. People get sick by swallowing tiny amounts of animal or human poop. This often happens through undercooked ground beef, raw (unpasteurized) milk or juice, raw sprouts, or leafy greens. Swallowing contaminated water, including lake or pool water while swimming, can also spread it. Touching animals or their surroundings at farms, petting zoos, and fairs is another common route. It also spreads easily from person to person, especially among young children and in child care.',
  incubation: 'Usually 3 to 4 days after exposure, but it can range from 1 to 10 days.',
  contagiousPeriod:
    'People can spread STEC as long as it is in their stool (poop). This can last for weeks after symptoms end, especially in young children. Only a very small amount of the germ is needed to make someone sick, so careful handwashing matters.',
  symptoms: {
    common: ['Severe stomach cramps', 'Diarrhea, which often becomes bloody', 'Vomiting'],
    lessCommon: [
      'Fever, which is usually not very high (under 101°F)',
      'Hemolytic uremic syndrome (HUS): usually starts about a week after diarrhea begins, often just as the diarrhea is improving',
    ],
    emergencyWarningSigns: [
      'Peeing much less than usual, or not at all (a possible sign of HUS)',
      'Feeling very tired, or losing pink color in the cheeks and inside the lower eyelids (looking pale), especially in the week or two after diarrhea starts',
      'Signs of serious dehydration: a very dry mouth and throat, or feeling dizzy when standing up',
      'In a baby or young child: far fewer wet diapers than usual, crying without tears, or being unusually sleepy, floppy, or hard to wake',
      'Vomiting so often that you can’t keep any liquids down',
      'Confusion, a seizure, or severe belly pain',
    ],
  },
  ageGroups: {
    infants: {
      risk: 'highest',
      summary:
        'Babies and children younger than 5 are at the highest risk of hemolytic uremic syndrome (HUS), which can damage the kidneys. Babies also become dehydrated quickly.',
      actions: [
        'Call your baby’s clinician right away for any bloody diarrhea.',
        'Don’t give antibiotics or anti-diarrhea medicines unless a clinician who knows about the diarrhea advises it.',
        'Watch closely for fewer wet diapers, paleness, or unusual tiredness, which can be signs of HUS.',
        'Never give raw (unpasteurized) milk or juice.',
        'Wash hands well after every diaper change.',
      ],
    },
    children: {
      risk: 'highest',
      summary:
        'Children younger than 5 have the highest risk of HUS, and children of all ages can become seriously ill. STEC spreads easily in child care and among siblings.',
      actions: [
        'Call your child’s clinician the same day for bloody diarrhea or severe stomach cramps.',
        'Avoid anti-diarrhea medicines, and never give leftover antibiotics.',
        'In the 1 to 2 weeks after diarrhea starts, watch for peeing less, paleness, or extreme tiredness, and get care right away if you see them.',
        'Wash hands after visiting farms, petting zoos, and fairs, and don’t eat, drink, or use pacifiers in animal areas.',
        'Keep a child with STEC out of child care, school, and swimming until your clinician or health department says it’s OK; negative stool tests may be required.',
      ],
    },
    adults: {
      risk: 'lower',
      summary:
        'Most adults get better in 5 to 7 days. STEC can still cause severe bloody diarrhea in healthy young adults, but HUS is less common in this age group.',
      actions: [
        'Drink plenty of fluids and rest.',
        'See a clinician for bloody diarrhea and ask about a stool test.',
        'Avoid antibiotics and anti-diarrhea medicines unless your clinician advises them.',
        'Cook ground beef to 160°F, measured with a food thermometer.',
        'Stay home from work while sick; food, child care, and health care workers may need negative stool tests before going back.',
      ],
    },
    'older-adults': {
      risk: 'moderate',
      summary:
        'Most people in this age group recover in about a week. The risk of severe illness rises with age and with long-term health problems.',
      actions: [
        'See a clinician for bloody diarrhea or severe cramps.',
        'Avoid antibiotics and anti-diarrhea medicines unless your clinician advises them.',
        'Drink fluids and watch for dizziness or peeing less than usual.',
        'Cook ground beef to 160°F and skip raw milk and unpasteurized juice.',
      ],
    },
    seniors: {
      risk: 'higher',
      summary:
        'Older adults are more likely than younger adults to develop severe illness and HUS.',
      actions: [
        'Call your clinician the same day for bloody diarrhea.',
        'Avoid anti-diarrhea medicines and antibiotics unless your clinician recommends them.',
        'Get care right away for peeing less, confusion, or extreme tiredness.',
        'Skip raw sprouts, raw milk, unpasteurized juice, and undercooked ground beef.',
      ],
    },
    pregnant: {
      risk: 'moderate',
      summary:
        'Pregnant people get STEC the same ways as everyone else. Bloody diarrhea, fever, or dehydration during pregnancy should be checked right away.',
      actions: [
        'Call your prenatal care provider right away for bloody diarrhea.',
        'Avoid raw sprouts, unpasteurized milk and juice, and undercooked ground beef.',
        'Don’t take anti-diarrhea medicines or antibiotics unless your provider advises them.',
        'Drink plenty of fluids.',
      ],
    },
    immunocompromised: {
      risk: 'higher',
      summary:
        'People with weakened immune systems are more likely to get seriously ill from foodborne infections, including STEC. Call your care team early.',
      actions: [
        'Call your care team early for diarrhea, especially if it’s bloody.',
        'Don’t start antibiotics or anti-diarrhea medicines on your own.',
        'Avoid raw sprouts, raw milk, unpasteurized juice, and undercooked ground beef.',
        'Wash hands after any contact with farm animals or their surroundings.',
      ],
    },
  },
  treatment: {
    summary:
      'There is no specific cure. Care focuses on fluids, rest, and watching closely for HUS. Antibiotics are generally not recommended for STEC because they have not been shown to help and may raise the risk of HUS. Anti-diarrhea medicines should also be avoided. People who develop HUS need hospital care.',
    options: [
      {
        name: 'Fluids and oral rehydration',
        type: 'supportive',
        detail:
          'Drink extra fluids. Oral rehydration solutions (ORS) replace water and salts. People who are very sick or dehydrated may need IV fluids. Your clinician may order blood and urine tests to watch for HUS.',
        who: 'Everyone with STEC.',
      },
      {
        name: 'Antibiotics',
        type: 'antibiotic',
        detail:
          'Generally NOT recommended for STEC. They have not been shown to help and may raise the risk of HUS. If you have bloody diarrhea, a stool test helps your clinician decide whether an antibiotic is safe.',
        who: 'Not recommended for STEC infection; a clinician may consider them only in unusual situations.',
      },
      {
        name: 'Anti-diarrhea medicines (such as loperamide)',
        type: 'other',
        detail: 'Avoid. Medicines that slow the gut may raise the risk of complications such as HUS.',
        who: 'Not recommended for anyone with suspected or confirmed STEC.',
      },
      {
        name: 'Hospital care for HUS',
        type: 'supportive',
        detail:
          'Treatment can include IV fluids, blood transfusions, and kidney dialysis. Most people with HUS recover within a few weeks, but some have lasting kidney damage, and HUS can be fatal.',
        who: 'Anyone who develops HUS.',
      },
    ],
    antibioticsHelp: 'no',
  },
  prevention: {
    vaccines: [],
    everyday: [
      'Cook ground beef and other ground meats to 160°F, and check with a food thermometer; color is not a reliable sign.',
      'Drink only pasteurized milk and juice, and avoid soft cheeses made from raw milk.',
      'Children, older adults, pregnant people, and people with weakened immune systems should avoid raw or lightly cooked sprouts.',
      'Rinse fresh produce under running water, and keep raw meat away from foods that won’t be cooked.',
      'Wash hands with soap and water after touching animals at farms, petting zoos, and fairs, and keep food, drinks, and pacifiers out of animal areas.',
      'Try not to swallow water when swimming in lakes, ponds, or pools, and stay out of the water when you have diarrhea.',
      'Wash hands after using the toilet and changing diapers.',
    ],
  },
  testing:
    'A stool (poop) test is needed. Labs look for Shiga toxin or the genes that make it, often with a fast multiplex PCR panel such as the BioFire GI Panel. They also try to grow the bacteria (culture). Minnesota labs send positive samples to MDH, which identifies the strain and uses genetic fingerprinting (whole genome sequencing) to link cases and find outbreaks. Blood and urine tests check for HUS. There are no home tests.',
  whenToSeekCare: [
    'Call your clinician the same day for any bloody diarrhea, or diarrhea with severe stomach cramps.',
    'Call if diarrhea lasts more than 3 days or comes with a fever higher than 102°F.',
    'Ask for a stool test, and tell your clinician about recent ground beef, raw milk, sprouts, or animal contact.',
    'If you or your child has STEC, watch for peeing less, paleness, or extreme tiredness for about 2 weeks after diarrhea starts. Get care right away if they appear.',
    'Go to urgent care (or call your clinic’s nurse line) the same day if you can’t keep fluids down for several hours.',
    'If you think food or an event made you sick, also call the MDH Foodborne Illness Hotline at 1-877-FOOD-ILL (1-877-366-3455).',
  ],
  readingTheNumbers:
    'On the BioFire GI Panel, STEC appears as “Shiga-like toxin-producing E. coli (STEC) stx1/stx2.” Stx1 and stx2 are the genes that make Shiga toxin (the poison). The panel also reports “E. coli O157,” the best-known type of STEC; other types are called non-O157. The detection rate is the share of GI panel stool tests that find Shiga toxin genes. People who get tested are mostly those sick enough to see a clinician, often with bloody diarrhea. So the numbers reflect more serious illness and miss mild cases. Detections are usually higher in summer and early fall. A rising number can mean a seasonal rise or an outbreak; MDH investigates clusters and announces outbreaks when a source is found. For an average person, a rise is a reminder to cook ground beef to 160°F, avoid raw milk and raw sprouts, and wash hands after animal contact. See a clinician promptly for bloody diarrhea, especially in children. A PCR panel detects the germ’s genetic material. Labs then grow the germ (culture) to confirm it, and MDH identifies its exact type.',
  watchNotes: [
    'Summer–fall 2026: Alfalfa sprouts from Minneapolis grower Everything Sprouts were linked to a multistate outbreak of STEC and Salmonella. The sprouts were sold under the Calco and Everything Sprouts brands, and several non-O157 types of STEC were involved. As of October 1, 2026, CDC counted 76 sick people in 16 states, 6 hospitalized and no deaths. Don’t eat recalled sprouts; throw them away.',
    'In its August 2026 announcement, MDH reported 23 Minnesotans became ill between July 8 and August 8 in the sprout outbreak. Seed suppliers have recalled the alfalfa seed lot linked to the illnesses.',
    'Fall farm visits, apple orchards, pumpkin patches, and petting zoos continue into October. Wash hands with soap and water after touching animals, especially young children.',
    'Fast PCR stool tests now find STEC types other than O157 more often than in the past. These non-O157 types can also cause serious illness and HUS.',
  ],
  sources: [
    {
      label: 'CDC: E. coli and Salmonella Outbreak Linked to Alfalfa Sprouts (2026)',
      url: 'https://www.cdc.gov/ecoli/outbreaks/alfalfa-sprouts-08-26/index.html',
    },
    {
      label: 'MDH: STEC and Salmonella cases linked to alfalfa sprouts (2026)',
      url: 'https://www.health.state.mn.us/news/pressrel/2026/ecoli082026.html',
    },
    { label: 'CDC: Food Poisoning Symptoms', url: 'https://www.cdc.gov/food-safety/signs-symptoms/index.html' },
    {
      label: 'CDC MMWR: Enteric Disease Outbreaks Associated with Animal Contact',
      url: 'https://www.cdc.gov/mmwr/volumes/74/ss/ss7403a1.htm',
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
      label: 'MDH: Specific disease exclusion guidelines for child care and preschool',
      url: 'https://www.health.state.mn.us/diseases/foodborne/exclusions.html',
    },
    {
      label: 'bioMérieux: BioFire FilmArray Gastrointestinal (GI) Panel',
      url: 'https://www.biomerieux.com/corp/en/our-offer/clinical-products/biofire-filmarray-gastrointestinal-panel.html',
    },
  ],
  lastReviewed: '2026-10-07',
}

export default profile
