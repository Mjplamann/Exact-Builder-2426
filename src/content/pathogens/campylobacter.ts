import type { PathogenProfile } from '../types'

const profile: PathogenProfile = {
  id: 'campylobacter',
  name: 'Campylobacter (campylobacteriosis)',
  shortName: 'Campylobacter',
  aka: ['Campylobacteriosis', 'Campy'],
  category: 'gastrointestinal',
  kind: 'bacterium',
  biofireTargets: ['Campylobacter (jejuni, coli, and upsaliensis)'],
  oneLiner:
    'Minnesota’s most commonly reported bacterial cause of diarrhea, often from undercooked chicken or raw milk. Most recover in a week.',
  overview:
    'Campylobacter bacteria cause diarrhea (sometimes bloody), fever, and stomach cramps. It is the most commonly reported bacterial gut infection in Minnesota. Most cases come from undercooked poultry, unpasteurized (raw) milk, untreated water, or contact with animals. Most people recover in about a week without antibiotics, but rarely the infection can trigger a serious nerve condition called Guillain-Barré syndrome.',
  seasonality: {
    summary:
      'Cases rise sharply every summer in Minnesota; in 2023, reports peaked in August. Summer cookouts, swimming, and more contact with farm animals and pets may add to the summer rise. Cases fall off through autumn but occur all year.',
    peakMonths: [6, 7, 8],
  },
  transmission:
    'Mostly by eating raw or undercooked poultry, or other foods that touched raw poultry or its juices (for example, on a shared cutting board). It also spreads through raw (unpasteurized) milk and untreated water from lakes or streams. Touching animals and their poop can spread it too, including poultry, farm animals, and puppies and kittens. It rarely spreads from person to person.',
  incubation: 'Usually 2 to 5 days after exposure.',
  contagiousPeriod:
    'Campylobacter does not commonly spread from person to person, but the germ can stay in stool (poop) for a few weeks after symptoms end. Careful handwashing prevents spread, especially when caring for babies or handling food for others.',
  symptoms: {
    common: ['Diarrhea, which can be bloody', 'Stomach cramps and belly pain', 'Fever'],
    lessCommon: [
      'Nausea and vomiting',
      'Joint pain and swelling weeks later (reactive arthritis)',
      'Ongoing bowel problems after the infection (irritable bowel syndrome, or IBS)',
      'Bloodstream infection, mostly in people with weakened immune systems',
      'Guillain-Barré syndrome: muscle weakness, tingling, or paralysis that starts days to weeks after the diarrhea (rare; about 1 in every 1,000 reported cases)',
    ],
    emergencyWarningSigns: [
      'Signs of serious dehydration (losing too much fluid): peeing very little or not at all, a very dry mouth and throat, or feeling dizzy when standing up',
      'In a baby or young child: far fewer wet diapers than usual, crying without tears, or being unusually sleepy, floppy, or hard to wake',
      'Weakness or tingling in the feet or legs that spreads upward, or trouble walking, swallowing, or breathing (possible Guillain-Barré syndrome)',
      'Vomiting so often that you can’t keep any liquids down',
      'A fever of 100.4°F (38°C) or higher in a baby younger than 3 months',
      'Severe belly pain, or high fever with shaking chills or confusion, especially in someone with a weakened immune system',
    ],
  },
  ageGroups: {
    infants: {
      risk: 'moderate',
      summary:
        'Young children are among the groups that get Campylobacter most often. For babies, the main danger is dehydration from diarrhea.',
      actions: [
        'Call your baby’s clinician for diarrhea with fever, blood in the stool, or fewer wet diapers.',
        'Get care right away for any fever of 100.4°F (38°C) or higher in a baby younger than 3 months.',
        'Keep breastfeeding or formula feeding, and ask about an oral rehydration solution (ORS).',
        'Wash your hands after handling raw poultry and before making bottles or baby food.',
        'Never give raw (unpasteurized) milk to babies or children.',
      ],
    },
    children: {
      risk: 'lower',
      summary:
        'Children younger than 5 get Campylobacter more often than older kids. Most children recover in about a week with fluids and rest.',
      actions: [
        'Offer fluids often; use an oral rehydration solution if your child has a lot of diarrhea.',
        'Don’t give anti-diarrhea medicine unless your child’s clinician says to.',
        'Make sure kids wash hands after touching animals at farms, fairs, and petting zoos, and after playing with puppies and kittens.',
        'Serve only pasteurized milk.',
        'Keep kids home from child care or school until diarrhea stops, and follow the program’s and health department’s return rules.',
      ],
    },
    adults: {
      risk: 'lower',
      summary:
        'Most healthy adults have about a week of diarrhea, cramps, and fever and recover without antibiotics. International travelers and people who work with poultry or other animals get it more often.',
      actions: [
        'Drink plenty of fluids and rest.',
        'Cook chicken and turkey to 165°F, and don’t rinse raw chicken in the sink, which splashes germs.',
        'Drink only pasteurized milk and treated water; boil, filter, or treat lake and stream water when camping.',
        'Call your clinician if diarrhea lasts more than 3 days, is bloody, or comes with a high fever, especially after travel abroad.',
      ],
    },
    'older-adults': {
      risk: 'lower',
      summary:
        'Most adults 50 to 64 recover on their own within about a week. Call your clinician sooner if you have a long-term health condition or take medicines that weaken your immune system.',
      actions: [
        'Drink fluids and watch for dizziness or peeing less than usual.',
        'Use a food thermometer and keep raw poultry away from other foods.',
        'Avoid raw milk and untreated water.',
        'Get medical care right away for new weakness or tingling in your legs.',
      ],
    },
    seniors: {
      risk: 'higher',
      summary:
        'Adults 65 and older get Campylobacter more often than many other groups and are at higher risk of severe illness, including dehydration and bloodstream infection.',
      actions: [
        'Call your clinician early if you have diarrhea with fever or blood.',
        'Sip fluids often, and get help right away for dizziness, confusion, or very little urine.',
        'Avoid raw milk and undercooked poultry.',
        'Get care right away for new weakness or tingling in your legs.',
      ],
    },
    pregnant: {
      risk: 'higher',
      summary:
        'CDC lists pregnant people among those at risk for severe Campylobacter illness. Fever and dehydration during pregnancy should be checked by a health care provider.',
      actions: [
        'Call your prenatal care provider if you have diarrhea with fever or can’t keep fluids down.',
        'Avoid raw (unpasteurized) milk, soft cheeses made from it, and undercooked poultry.',
        'Ask before taking any anti-diarrhea medicine.',
        'Wash your hands after handling raw poultry or animals.',
      ],
    },
    immunocompromised: {
      risk: 'highest',
      summary:
        'People with weakened immune systems are at risk of severe or longer-lasting illness, and the infection can occasionally spread to the bloodstream.',
      actions: [
        'Call your care team at the first sign of diarrhea with fever.',
        'Ask whether you need a stool test and antibiotics.',
        'Avoid raw milk, undercooked poultry, and untreated water.',
        'Wash hands after contact with animals, especially poultry, farm animals, puppies, and kittens.',
      ],
    },
  },
  treatment: {
    summary:
      'Most people recover in about a week without antibiotics. Drinking plenty of fluids is the main treatment. Antibiotics may be used for people who are very sick or at risk of severe illness. Resistance to one common antibiotic group (fluoroquinolones, such as ciprofloxacin) is common, especially in infections picked up abroad, so a lab test may guide the choice.',
    options: [
      {
        name: 'Fluids and oral rehydration',
        type: 'supportive',
        detail:
          'Drink extra fluids. Oral rehydration solutions (ORS) from a drugstore replace water, salts, and sugar in the right balance. People who are very dehydrated may need IV fluids.',
        who: 'Everyone with diarrhea or vomiting.',
      },
      {
        name: 'Antibiotics (such as azithromycin)',
        type: 'antibiotic',
        detail:
          'Not needed for most people. Azithromycin is commonly used when treatment is needed. Fluoroquinolones (such as ciprofloxacin) are also used, but many Campylobacter strains resist them.',
        who: 'People with severe illness, or at risk of severe illness, such as people with weakened immune systems, adults 65 and older, and pregnant people.',
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
    vaccines: [],
    everyday: [
      'Cook chicken and turkey to an internal temperature of 165°F, and check with a food thermometer.',
      'Don’t wash raw chicken; it spreads germs around your sink and counters.',
      'Use separate cutting boards for raw meat and for produce, and wash hands, boards, and knives after touching raw poultry.',
      'Drink only pasteurized milk. Raw milk has caused Campylobacter outbreaks in Minnesota.',
      'Don’t drink untreated water from lakes, rivers, or streams; boil, filter, or treat it first.',
      'Wash hands after touching animals, their food, or their poop, including puppies and kittens. Puppies, including ones sold in pet stores, have been linked to Campylobacter outbreaks, some with drug-resistant strains.',
      'When traveling abroad, follow safe food and water practices.',
    ],
  },
  testing:
    'A stool (poop) test confirms Campylobacter. Many clinics use fast multiplex PCR panels, such as the BioFire GI Panel, that test for many germs at once. A culture (growing the bacteria) may follow so the lab can check for antibiotic resistance and MDH can compare strains to find outbreaks. Because PCR testing has become more common, Minnesota’s reported case counts have risen partly from more testing. There are no home tests.',
  whenToSeekCare: [
    'Call your clinician if diarrhea lasts more than 3 days or isn’t getting better.',
    'Call your clinician for bloody diarrhea or a fever higher than 102°F.',
    'Call early if the sick person is a baby, an adult 65 or older, pregnant, or has a weakened immune system.',
    'Call if you have joint pain or swelling in the weeks after the illness.',
    'Go to urgent care (or call your clinic’s nurse line) the same day if you can’t keep fluids down for several hours.',
    'If you think food, raw milk, or an event made you sick, also call the MDH Foodborne Illness Hotline at 1-877-FOOD-ILL (1-877-366-3455).',
  ],
  readingTheNumbers:
    'The BioFire detection rate is the share of GI panel stool tests at participating hospitals and clinics that find Campylobacter. Only people sick enough to see a clinician get tested, so most mild cases are never counted. In Minnesota, Campylobacter reliably rises each summer and falls in the colder months, so a summer climb is expected. A rise that is earlier, steeper, or later in the year than usual can point to an outbreak, which MDH investigates. For an average person, a rising number is not a reason to worry. It’s a reminder to cook poultry thoroughly, keep raw chicken away from other foods, and skip raw milk. MDH case counts have risen in recent years partly because more clinics use fast PCR stool tests. Emergency department data for stomach illness include many causes, not just Campylobacter.',
  watchNotes: [
    'In 2023, MDH received 1,831 Campylobacter reports, the most of any year up to that time, with cases peaking in August. Part of that rise reflected wider use of fast PCR stool tests; about 63% of 2023 reports were confirmed by culture (growing the germ in a lab).',
    'Cases usually peak in late summer and decline through fall. Keep cooking poultry to 165°F at fall gatherings and tailgates.',
    'Minnesota health officials have linked Campylobacter illnesses to raw milk. Pasteurized milk is the safe choice, especially for children, pregnant people, and older adults.',
  ],
  sources: [
    { label: 'CDC: Symptoms of Campylobacter Infection', url: 'https://www.cdc.gov/campylobacter/signs-symptoms/' },
    { label: 'CDC: Clinical Overview of Campylobacter', url: 'https://www.cdc.gov/campylobacter/hcp/clinical-overview/index.html' },
    {
      label: 'CDC: Campylobacter and Guillain-Barré Syndrome',
      url: 'https://www.cdc.gov/campylobacter/signs-symptoms/guillain-barre-syndrome.html',
    },
    { label: 'CDC: Food Poisoning Symptoms', url: 'https://www.cdc.gov/food-safety/signs-symptoms/index.html' },
    {
      label: 'CDC MMWR: Enteric Disease Outbreaks Associated with Animal Contact',
      url: 'https://www.cdc.gov/mmwr/volumes/74/ss/ss7403a1.htm',
    },
    { label: 'MDH: Campylobacteriosis basics', url: 'https://www.health.mn.gov/diseases/campylobacteriosis/basics.html' },
    { label: 'MDH: Campylobacteriosis fact sheet (PDF)', url: 'https://www.health.mn.gov/diseases/campylobacteriosis/campy.pdf' },
    {
      label: 'MDH: Campylobacteriosis, Annual Summary of Reportable Diseases',
      url: 'https://www.health.state.mn.us/diseases/reportable/dcn/campylobacteriosis.html',
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
