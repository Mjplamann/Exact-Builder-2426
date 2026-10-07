import type { PathogenProfile } from '../types'

const profile: PathogenProfile = {
  id: 'salmonella',
  name: 'Salmonella (salmonellosis)',
  shortName: 'Salmonella',
  aka: ['Salmonellosis', 'Nontyphoidal Salmonella'],
  category: 'gastrointestinal',
  kind: 'bacterium',
  biofireTargets: ['Salmonella'],
  oneLiner:
    'A common cause of food poisoning from undercooked poultry, eggs, produce, and animal contact. Most people recover in 4–7 days.',
  overview:
    'Salmonella is a group of bacteria that causes diarrhea, fever, and stomach cramps (an illness called salmonellosis). People usually get it from contaminated food or from touching animals such as chicks, ducklings, turtles, and other reptiles. Most people get better on their own in 4 to 7 days, but babies, older adults, and people with weakened immune systems can get very sick. This page covers the common food-related types of Salmonella, not typhoid fever.',
  seasonality: {
    summary:
      'Salmonella can strike any time of year, but Minnesota cases climb in summer and stay high into early fall. Warm weather helps bacteria grow on food left out too long, and cookouts, picnics, and fairs add risk. Spring and early summer also bring illnesses linked to backyard chicks and ducklings.',
    peakMonths: [6, 7, 8, 9],
  },
  transmission:
    'Mostly by eating contaminated food: undercooked chicken, turkey, and eggs; unpasteurized (raw) milk; and fresh produce such as sprouts, peppers, and leafy greens. It also spreads by touching animals or where they live (backyard poultry, turtles, lizards, snakes, frogs, and pet food or treats) and then touching your mouth. Less often, it spreads from person to person when hands are not washed after using the toilet or changing diapers.',
  incubation:
    'Usually 12 to 72 hours after exposure, but it can be as short as 6 hours or as long as 6 days.',
  contagiousPeriod:
    'People can spread Salmonella as long as it is in their stool (poop). This often lasts several weeks after symptoms end, and sometimes longer, especially in young children. Some people have no symptoms but can still spread it.',
  symptoms: {
    common: ['Diarrhea', 'Fever', 'Stomach cramps'],
    lessCommon: [
      'Nausea or vomiting',
      'Headache',
      'Loss of appetite',
      'Chills',
      'Blood in the stool',
      'Joint pain weeks after the illness (reactive arthritis), which is uncommon',
    ],
    emergencyWarningSigns: [
      'Signs of serious dehydration (losing too much fluid): peeing very little or not at all, a very dry mouth and throat, or feeling dizzy when standing up',
      'In a baby or young child: far fewer wet diapers than usual, crying without tears, or being unusually sleepy, floppy, or hard to wake',
      'Vomiting so often that you can’t keep any liquids down',
      'A fever of 100.4°F (38°C) or higher in a baby younger than 3 months',
      'Confusion, fainting, or severe belly pain',
      'High fever with shaking chills in a baby, an older adult, or someone with a weakened immune system (possible bloodstream infection)',
    ],
  },
  ageGroups: {
    infants: {
      risk: 'highest',
      summary:
        'Babies get dehydrated quickly, and the infection is more likely to spread to the blood, especially before 3 months of age. CDC recommends antibiotics for babies younger than 12 months; the American Academy of Pediatrics recommends them mainly for babies younger than 3 months or with certain health problems. Your baby’s clinician will decide.',
      actions: [
        'Call your baby’s clinician right away for diarrhea with fever, blood in the stool, or fewer wet diapers.',
        'Get care right away for any fever of 100.4°F (38°C) or higher in a baby younger than 3 months.',
        'Keep breastfeeding or formula feeding, and ask about an oral rehydration solution (ORS).',
        'Keep babies away from chicks, ducklings, turtles, and other reptiles, and wash your hands after touching them.',
        'Wash your hands after handling raw meat and before making bottles or baby food.',
      ],
    },
    children: {
      risk: 'moderate',
      summary:
        'Children younger than 5 are more likely to get very sick from Salmonella. Older children usually recover at home in about a week.',
      actions: [
        'Offer small, frequent sips of fluids; use an oral rehydration solution if your child is losing a lot of fluid.',
        'Don’t give anti-diarrhea medicine unless your child’s clinician says it’s OK.',
        'Don’t let children under 5 handle chicks, ducklings, turtles, or other reptiles; older kids should wash hands right after.',
        'Keep kids home from child care or school until diarrhea stops, and follow the program’s and health department’s return rules.',
        'Supervise handwashing with soap and water after the bathroom and before eating.',
      ],
    },
    adults: {
      risk: 'lower',
      summary:
        'Most healthy adults have a few days to a week of diarrhea, fever, and cramps and recover without treatment.',
      actions: [
        'Rest and drink plenty of fluids.',
        'Call your clinician if diarrhea lasts more than 3 days or comes with a high fever or blood.',
        'Stay home from work while you have diarrhea; food, child care, and health care workers should check with their employer or health department before going back.',
        'Cook poultry to 165°F and eggs until firm, and check with a food thermometer.',
      ],
    },
    'older-adults': {
      risk: 'moderate',
      summary:
        'Most healthy people in this age group recover on their own. Adults over 50 who have medical problems, such as heart disease, are at higher risk of serious infection, and CDC recommends antibiotics for them.',
      actions: [
        'Call your clinician early if you have heart disease or another long-term health condition.',
        'Drink fluids and watch for dizziness or peeing less than usual.',
        'Use a food thermometer and keep raw meat away from ready-to-eat food.',
        'Wash hands after touching pets, pet food, and backyard poultry.',
      ],
    },
    seniors: {
      risk: 'higher',
      summary:
        'Adults 65 and older are more likely to get seriously ill, be hospitalized, or develop a bloodstream infection. CDC lists adults 65 and older among the groups for whom antibiotic treatment is recommended.',
      actions: [
        'Call your clinician as soon as you have diarrhea with fever. Don’t wait it out.',
        'Sip fluids often, and get help right away for dizziness, confusion, or very little urine.',
        'Skip raw or undercooked eggs, raw milk, and raw sprouts.',
        'Choose pets other than turtles and reptiles; CDC does not recommend pet turtles for adults 65 and older.',
      ],
    },
    pregnant: {
      risk: 'moderate',
      summary:
        'Most pregnant people with Salmonella recover like other adults. Pregnant people are among the groups at higher risk of food poisoning, and fever or dehydration during pregnancy should be checked by a health care provider.',
      actions: [
        'Call your prenatal care provider if you have diarrhea with fever or can’t keep fluids down.',
        'Drink plenty of fluids.',
        'Avoid raw or undercooked eggs, meat, and poultry; unpasteurized milk and juice; and raw sprouts.',
        'Ask before taking any anti-diarrhea medicine.',
      ],
    },
    immunocompromised: {
      risk: 'highest',
      summary:
        'People with weakened immune systems are more likely to get a serious bloodstream infection. This includes people with HIV, an organ transplant, or chemotherapy or other medicines that weaken the immune system; people with sickle cell disease are also at higher risk. CDC recommends antibiotics for people with weakened immune systems.',
      actions: [
        'Call your care team at the first sign of diarrhea with fever.',
        'Ask whether you need a stool test and antibiotics.',
        'Avoid raw or undercooked eggs, meat, and poultry; raw milk; and raw sprouts.',
        'Avoid contact with reptiles, amphibians, and backyard poultry, or wash your hands right after.',
      ],
    },
  },
  treatment: {
    summary:
      'Most people get better in 4 to 7 days without treatment. The most important care is replacing lost fluids. Antibiotics are saved for severe illness and for people at higher risk of the infection spreading. For mild illness, they don’t speed recovery much and can make the germ stay in your stool longer. Some Salmonella strains resist common antibiotics, so a lab test can show which medicines will work.',
    options: [
      {
        name: 'Fluids and oral rehydration',
        type: 'supportive',
        detail:
          'Drink extra fluids. Oral rehydration solutions (ORS) from a drugstore replace water, salts, and sugar in the right balance. People who are very dehydrated may need IV fluids at a clinic or hospital.',
        who: 'Everyone with diarrhea or vomiting.',
      },
      {
        name: 'Antibiotics',
        type: 'antibiotic',
        detail:
          'Not needed for most people. For mild illness, antibiotics usually don’t help you get better faster, and they can make the germ stay in your stool longer. CDC recommends them for severe illness and for groups at higher risk of serious infection. Clinicians may also consider them for people with sickle cell disease or with artificial joints, heart valves, or blood-vessel grafts. Because some strains are drug-resistant, labs may test which antibiotics will work.',
        who: 'People with severe illness, babies, adults 65 and older, adults over 50 with medical problems such as heart disease, and people with weakened immune systems. For babies, CDC says younger than 12 months; the American Academy of Pediatrics focuses on younger than 3 months.',
      },
      {
        name: 'Anti-diarrhea medicines (such as loperamide)',
        type: 'other',
        detail:
          'Usually not needed. Avoid them if you have a fever or bloody diarrhea, and don’t give them to children unless a clinician says to.',
        who: 'Ask a clinician or pharmacist before using.',
      },
    ],
    antibioticsHelp: 'sometimes',
  },
  prevention: {
    vaccines: [
      {
        name: 'Typhoid vaccine (for travel only)',
        who: 'Travelers going to places where typhoid fever is common, such as parts of South Asia. Talk with a travel clinic.',
        notes:
          'Typhoid vaccine protects against typhoid fever (caused by Salmonella Typhi). It does not protect against the common Salmonella that causes food poisoning in Minnesota, and there is no vaccine for that.',
      },
    ],
    everyday: [
      'Cook poultry to 165°F, ground beef and pork to 160°F, and eggs until the yolk and white are firm. Use a food thermometer.',
      'Don’t eat raw cookie dough or batter, and avoid raw or undercooked eggs.',
      'Keep raw meat and its juices away from produce and ready-to-eat foods; wash hands, cutting boards, and knives after handling raw meat.',
      'Refrigerate leftovers within 2 hours (within 1 hour if it’s above 90°F outside).',
      'Drink only pasteurized milk and juice.',
      'Wash hands with soap and water after touching backyard poultry, reptiles, amphibians, pet food, or animal areas, and keep chicks and ducklings out of the house.',
      'Wash hands after using the bathroom and changing diapers.',
    ],
  },
  testing:
    'A stool (poop) test confirms Salmonella. Many clinics now use fast multiplex PCR panels, such as the BioFire GI Panel, that check one sample for many germs at once. The lab may also grow the bacteria (culture) to see which antibiotics work. Minnesota labs send positive samples to the MDH Public Health Laboratory, where genetic fingerprinting (whole genome sequencing) links cases and helps find outbreaks. Blood tests are used if a bloodstream infection is suspected. There are no home tests.',
  whenToSeekCare: [
    'Call your clinician if diarrhea lasts more than 3 days or isn’t getting better.',
    'Call your clinician for bloody diarrhea or a fever higher than 102°F.',
    'Call early if the sick person is a baby, 65 or older, or pregnant. Also call early for anyone with a weakened immune system, sickle cell disease, or an artificial joint, heart valve, or blood-vessel graft.',
    'Call if you notice early signs of dehydration, such as feeling very thirsty or peeing less than usual.',
    'Go to urgent care (or call your clinic’s nurse line) the same day if you can’t keep fluids down for several hours or symptoms are getting worse quickly.',
    'If you think food from a restaurant, store, or event made you sick, also call the MDH Foodborne Illness Hotline at 1-877-FOOD-ILL (1-877-366-3455).',
  ],
  readingTheNumbers:
    'The BioFire detection rate is the share of GI panel stool tests at participating hospitals and clinics that find Salmonella. Only people sick enough to see a clinician get tested, often for fever, bloody diarrhea, or diarrhea lasting several days, so most mild cases are never counted. Salmonella detections usually rise in summer and early fall and are lower in winter. A rising number means more of the diarrhea being tested is caused by Salmonella, which can signal a normal seasonal increase or an outbreak. It does not mean your own risk is high. It’s a good reminder to cook food thoroughly, keep raw meat separate, refrigerate leftovers, and wash hands after touching animals. MDH case counts can rise partly because more clinics use fast PCR tests, not only because more people are sick. Emergency department data for stomach illness include many causes (mostly viruses like norovirus in winter), not just Salmonella.',
  watchNotes: [
    'In summer 2026, a multistate Salmonella outbreak was linked to fresh jalapeño peppers grown in Sinaloa, Mexico. Minnesota was among the states affected. The peppers were recalled, and CDC declared the outbreak over on October 2, 2026.',
    'Alfalfa sprouts from Minneapolis grower Everything Sprouts (Calco and Everything Sprouts brands) were linked in August 2026 to a multistate outbreak of both Salmonella and Shiga toxin–producing E. coli. Don’t eat recalled sprouts; throw them away.',
    'CDC’s 2026 Salmonella outbreaks linked to backyard chicks and ducklings sickened more than 1,000 people nationwide, about 1 in 5 of them children younger than 5. Minnesota helped investigate. CDC declared the outbreaks over in September 2026, but backyard flocks can carry Salmonella at any time.',
    'In 2026, MDH linked Minnesota Salmonella cases to powdered greens dietary supplements, including products made with moringa leaf powder. Small pet turtles have also caused Salmonella outbreaks again and again. CDC advises against pet turtles in homes with children under 5, adults 65 and older, or people with weakened immune systems.',
    'If MDH calls you after a positive test, please take the call. Interviews help MDH find outbreak sources quickly.',
  ],
  sources: [
    { label: 'CDC: Symptoms of Salmonella Infection', url: 'https://www.cdc.gov/salmonella/signs-symptoms/index.html' },
    { label: 'CDC: Clinical Overview of Salmonellosis', url: 'https://www.cdc.gov/salmonella/hcp/clinical-overview/index.html' },
    { label: 'CDC: Food Poisoning Symptoms', url: 'https://www.cdc.gov/food-safety/signs-symptoms/index.html' },
    {
      label: 'CDC: Salmonella Outbreaks Linked to Backyard Poultry (2026)',
      url: 'https://www.cdc.gov/salmonella/outbreaks/saintpaul-04-26/index.html',
    },
    {
      label: 'CDC: Investigation Update, Salmonella Outbreak Linked to Jalapeños (2026)',
      url: 'https://www.cdc.gov/salmonella/outbreaks/javiana-08-26/investigation.html',
    },
    {
      label: 'FDA: Outbreak Investigation of Salmonella, Jalapeño (August 2026)',
      url: 'https://www.fda.gov/food/outbreaks-foodborne-illness/outbreak-investigation-salmonella-jalapeno-august-2026',
    },
    {
      label: 'CDC: E. coli and Salmonella Outbreak Linked to Alfalfa Sprouts (2026)',
      url: 'https://www.cdc.gov/ecoli/outbreaks/alfalfa-sprouts-08-26/index.html',
    },
    { label: 'CDC: Salmonella Outbreak Linked to Turtles (2026)', url: 'https://www.cdc.gov/salmonella/outbreaks/turtles-08-26/index.html' },
    {
      label: 'CDC MMWR: Enteric Disease Outbreaks Associated with Animal Contact',
      url: 'https://www.cdc.gov/mmwr/volumes/74/ss/ss7403a1.htm',
    },
    { label: 'MDH: Salmonellosis', url: 'https://www.health.state.mn.us/diseases/salmonellosis' },
    { label: 'MDH: Salmonellosis fact sheet (PDF)', url: 'https://www.health.mn.gov/diseases/salmonellosis/salmonella.pdf' },
    {
      label: 'MDH: Foodborne and Enteric Diseases, Annual Summary',
      url: 'https://www.health.mn.gov/diseases/reportable/dcn/enteric.html',
    },
    {
      label: 'MDH: New Salmonella cases linked to moringa leaf powder in dietary supplements (2026)',
      url: 'https://www.health.state.mn.us/news/pressrel/2026/salmonella052226.html',
    },
    {
      label: 'MDH: STEC and Salmonella cases linked to alfalfa sprouts (2026)',
      url: 'https://www.health.state.mn.us/news/pressrel/2026/ecoli082026.html',
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
