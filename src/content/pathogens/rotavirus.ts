import type { PathogenProfile } from '../types'

// TODO(verify): the vaccine-schedule status, dose ages and data-source notes are sourced below. The general
// clinical facts (incubation, contraindications, intussusception risk, Minnesota peak months) follow
// long-standing CDC/ACIP guidance but still need CDC rotavirus page URLs from a run with search budget.

const profile: PathogenProfile = {
  id: 'rotavirus',
  name: 'Rotavirus',
  shortName: 'Rotavirus',
  aka: ['Rotavirus gastroenteritis', 'Stomach bug'],
  category: 'gastrointestinal',
  kind: 'virus',
  biofireTargets: ['Rotavirus A'],
  oneLiner: 'A stomach virus that causes severe diarrhea and vomiting in babies and young children. Vaccines prevent most serious cases.',
  overview:
    'Rotavirus causes watery diarrhea, vomiting and fever, mostly in babies and young children. Before rotavirus vaccines became available in the U.S. in 2006, almost every child caught it by age 5. It sent many young children to the hospital with dehydration (losing too much body fluid). Vaccines given by mouth in the first months of life have greatly reduced severe illness. Older children and adults can also get rotavirus, but it is usually milder.',
  seasonality: {
    summary:
      'Before vaccines, rotavirus surged every year in late winter and spring. Since vaccines, U.S. seasons are smaller, start later and often follow an every-other-year pattern. In Minnesota and the upper Midwest, rotavirus is most likely in late winter and spring, roughly March through May. Some years have very little, and it can show up any time of year.',
    peakMonths: [3, 4, 5],
  },
  transmission:
    'Rotavirus spreads through the stool (poop) of infected people. Tiny amounts get on hands, toys, diaper-changing areas and other surfaces, and then into the mouth. It spreads easily within families and in child care. The virus can survive on hands and hard surfaces for some time, so handwashing and cleaning matter.',
  incubation: 'Symptoms usually start about 2 days after exposure.',
  contagiousPeriod:
    'Rotavirus is in the stool before symptoms start and while a person is sick. It can stay there for days after symptoms end, and longer in people with weak immune systems. Babies who recently got the rotavirus vaccine can pass vaccine virus in their stool for a short time, so wash hands after diaper changes.',
  symptoms: {
    common: ['Watery diarrhea, often severe', 'Vomiting', 'Fever', 'Stomach pain'],
    lessCommon: ['Loss of appetite', 'Fussiness or tiredness', 'Signs of dehydration, such as fewer wet diapers or a dry mouth'],
    emergencyWarningSigns: [
      'A baby or young child with no wet diaper or urine for many hours, no tears when crying, sunken eyes, or a sunken soft spot on the head',
      'Unusual sleepiness, floppiness, or being hard to wake',
      'Cannot keep any fluids down and is getting weaker',
      'Blood in the stool or black stool',
      'Severe or constant belly pain',
      'After a rotavirus vaccine: bouts of hard crying with legs pulled to the chest, repeated vomiting, or blood in the stool. These are rare signs of a bowel blockage called intussusception.',
    ],
  },
  ageGroups: {
    infants: {
      risk: 'highest',
      summary:
        'Babies and young children are the most likely to get severely dehydrated from rotavirus. Vaccination in the first months of life is the best protection.',
      actions: [
        'Ask your baby’s clinician about rotavirus vaccine at the 2-month visit; the first dose must be given by 14 weeks 6 days of age',
        'Keep breastfeeding or formula feeding during illness',
        'Ask your baby’s clinician about an oral rehydration solution. Do not use plain water, juice, soda or sports drinks to replace a baby’s lost fluids',
        'Watch for fewer wet diapers, no tears and unusual sleepiness',
        'Wash your hands with soap and water after every diaper change',
      ],
    },
    children: {
      risk: 'moderate',
      summary:
        'Toddlers and preschoolers, especially those who are not vaccinated, can still get sick and dehydrated. Older children usually have milder illness.',
      actions: [
        'Offer small, frequent sips of fluid; an oral rehydration solution works best',
        'Keep your child home from child care or school while they have diarrhea or vomiting, and follow the program’s return rules',
        'Supervise handwashing after using the toilet and before eating',
        'Clean toys, high-touch surfaces and diaper areas often',
        'Call your child’s clinician if you see signs of dehydration',
      ],
    },
    adults: {
      risk: 'lower',
      summary:
        'Adults can catch rotavirus, often from a sick child, but illness is usually mild and some people have no symptoms. Parents and child care workers are the most exposed.',
      actions: [
        'Wash hands with soap and water after changing diapers or helping with toileting',
        'Drink plenty of fluids if you get sick',
        'Stay home from work while sick, especially if you work in food service, health care or child care',
        'Help the babies in your life get their vaccines on time',
      ],
    },
    'older-adults': {
      risk: 'lower',
      summary:
        'Rotavirus is usually mild in this age group. Dehydration is more of a concern if you have chronic health conditions.',
      actions: [
        'Wash hands with soap and water after caring for young grandchildren or changing diapers',
        'Drink fluids early if you get vomiting or diarrhea',
        'Call your clinician if you cannot keep fluids down',
      ],
    },
    seniors: {
      risk: 'moderate',
      summary:
        'Older adults are more affected by dehydration from any stomach illness, and rotavirus can spread in nursing homes.',
      actions: [
        'Drink fluids as soon as symptoms begin',
        'Wash hands with soap and water, especially after contact with young children',
        'Get care quickly for dizziness, confusion or very little urine',
        'Have someone check on you if you live alone',
      ],
    },
    pregnant: {
      risk: 'lower',
      summary:
        'Rotavirus is not usually more serious during pregnancy, but dehydration from any stomach illness should be taken seriously. Pregnancy is a good time to plan for your baby’s vaccines.',
      actions: [
        'Talk with your clinician about your baby’s rotavirus vaccine before birth',
        'If you took medicines that weaken the immune system during pregnancy, tell your baby’s clinician before the rotavirus vaccine',
        'Wash hands after diaper changes if you have other young children',
        'Call your prenatal care provider if you cannot keep fluids down',
      ],
    },
    immunocompromised: {
      risk: 'higher',
      summary:
        'People with weakened immune systems can have longer or more severe rotavirus illness. Babies with severe combined immunodeficiency (SCID) should not get the rotavirus vaccine.',
      actions: [
        'Call your care team early if you have diarrhea or vomiting',
        'Ask household members to wash hands carefully, especially after diaper changes',
        'Babies who live with you can still get rotavirus vaccine; experts say protecting them outweighs the small chance of passing on vaccine virus. Wash hands well after diaper changes, especially in the weeks after each dose',
        'Tell your care team if diarrhea lasts more than a few days',
      ],
    },
  },
  treatment: {
    summary:
      'There is no medicine that treats rotavirus itself, and antibiotics do not help because it is a virus. Care focuses on preventing and treating dehydration until the illness passes, usually within about a week.',
    options: [
      {
        name: 'Oral rehydration solution',
        type: 'supportive',
        detail:
          'Store-bought oral rehydration solutions replace water, salts and sugar in the right balance. Give small sips often, especially if your child is vomiting. Keep breastfeeding or formula feeding.',
        who: 'Babies, children and adults with diarrhea or vomiting',
      },
      {
        name: 'IV (intravenous) fluids',
        type: 'supportive',
        detail:
          'Fluids given through a vein at a clinic, urgent care, emergency department or hospital when someone is too dehydrated or cannot keep fluids down.',
        who: 'People with moderate to severe dehydration',
      },
      {
        name: 'Anti-diarrhea medicine',
        type: 'other',
        detail:
          'Not routinely recommended for children unless a clinician advises it. Adults should ask a pharmacist or clinician first. Do not give bismuth subsalicylate (Pepto-Bismol, Kaopectate) to children or teens, because it contains a salicylate (an aspirin-like ingredient). Adults who are pregnant, take blood thinners or are allergic to aspirin should ask before using it.',
        who: 'Adults only, after checking with a clinician or pharmacist',
      },
    ],
    antibioticsHelp: 'no',
  },
  prevention: {
    vaccines: [
      {
        name: 'RotaTeq (RV5)',
        who: 'Recommended for all infants by CDC’s schedule now in effect and by the American Academy of Pediatrics. Given as drops by mouth in 3 doses, usually at 2, 4 and 6 months of age.',
        notes:
          'The first dose can be given as early as 6 weeks of age and must be given by 14 weeks 6 days. All doses must be given by 8 months of age. Not for babies who had a severe allergic reaction to a previous dose or a vaccine ingredient, who have had intussusception, or who have SCID.',
      },
      {
        name: 'Rotarix (RV1)',
        who: 'Recommended for all infants by CDC’s schedule now in effect and by the American Academy of Pediatrics. Given as drops by mouth in 2 doses, usually at 2 and 4 months of age.',
        notes:
          'Same age limits and reasons not to vaccinate as RotaTeq. Both vaccines carry a small risk of intussusception (a bowel blockage), mostly in the week after the first or second dose. CDC estimates this risk at about 1 in 20,000 to 1 in 100,000 vaccinated babies.',
      },
    ],
    everyday: [
      'Get your baby vaccinated on time; the first dose must be given by 14 weeks 6 days of age.',
      'Wash hands with soap and water after using the toilet or changing diapers and before eating or preparing food.',
      'Clean diaper-changing areas, toys and bathroom surfaces often, using a bleach-based cleaner or another disinfectant and following the label directions.',
      'Keep sick children home from child care while they have diarrhea or vomiting.',
      'Do not swim in pools, lakes or splash pads while you have diarrhea.',
    ],
  },
  testing:
    'Clinicians often diagnose stomach illness from symptoms alone. A stool test can confirm rotavirus. Labs may use a rapid antigen test (a quick test that finds virus proteins) or a PCR test (a test that finds the virus’s genetic material). PCR is often part of a multi-germ stomach panel such as BioFire. Testing is most useful for very sick babies and young children, during outbreaks, or for people with weak immune systems. A baby who recently got the rotavirus vaccine can test positive for a short time because of vaccine virus in the stool. There is no common home test.',
  whenToSeekCare: [
    'Call your child’s clinician if your baby has vomiting or diarrhea and is not feeding well. Also call if your child shows early signs of dehydration, such as fewer wet diapers or a dry mouth.',
    'Call if diarrhea lasts more than several days or keeps getting worse.',
    'Call early for babies, older adults and anyone with a weakened immune system.',
    'In the week after a rotavirus vaccine, call your baby’s clinician right away for bouts of hard crying, repeated vomiting, or blood in the stool. If you can’t reach them, go to an emergency department.',
    'Go to urgent care or an emergency department for signs of serious dehydration, blood in the stool or severe belly pain. Call 911 if a child is very hard to wake.',
  ],
  readingTheNumbers:
    'MN Pulse shows rotavirus as a BioFire detection rate. This is the percent of BioFire GI (stomach and gut) panel tests at participating labs in the Midwest (not just Minnesota) that found rotavirus. These panels are run on people of all ages who are sick enough to see a clinician, including many young children. So the number shows trends, not how many people are sick. WastewaterSCAN also tests sewage from 4 Minnesota treatment plants (Rochester, Mankato, Red Wing and St. Cloud; none in the Twin Cities) for rotavirus. Wastewater gives a community-wide signal that includes people who were never tested, but only for the areas those plants serve. Because many children are vaccinated, rotavirus is usually low for much of the year and may rise in late winter and spring. Since vaccines, some years have bigger seasons than others. Babies who were recently vaccinated can pass vaccine virus in their stool, and some tests can pick it up. So small changes may not mean more illness; look for a rise that lasts several weeks. A clear, lasting rise means more rotavirus is spreading, mostly among young children. Check that your baby’s vaccines are up to date and step up handwashing.',
  watchNotes: [
    'In January 2026, HHS changed CDC’s childhood immunization schedule. On March 16, 2026, a federal court paused those changes and the votes of the reconstituted CDC vaccine advisory committee. That restored the earlier schedule while the case continues. A federal appeals court heard arguments on October 6, 2026, and had not yet ruled.',
    'Under the CDC schedule now in effect, rotavirus vaccine is recommended for all infants. The American Academy of Pediatrics also recommends it for all infants. The age limits are strict, so talk with your baby’s clinician at the 2-month visit.',
  ],
  sources: [
    {
      label: 'CDC: Child and adolescent immunization schedule notes (rotavirus doses and age limits)',
      url: 'https://www.cdc.gov/vaccines/hcp/imz-schedules/child-adolescent-notes.html',
    },
    { label: 'CDC: ACIP vaccine recommendations', url: 'https://www.cdc.gov/acip/vaccine-recommendations/index.html' },
    {
      label: 'AAP: Recommended childhood and adolescent immunization schedule, 2026',
      url: 'https://publications.aap.org/pediatrics/article/157/3/e2025075754/206175/Recommended-Childhood-and-Adolescent-Immunization',
    },
    {
      label: 'IDSA: Federal judge blocks immunization schedule changes, stays ACIP appointments (2026)',
      url: 'https://www.idsociety.org/news--publications-new/articles/2026/federal-judge-blocks-immunization-schedule-changes-stays-acip-member-appointments/',
    },
    {
      label: 'Congressional Research Service: Changes to CDC vaccine recommendations in 2025 and 2026',
      url: 'https://www.congress.gov/crs-product/IN12684',
    },
    {
      label: 'Congressional Research Service: CDC’s updated childhood vaccine schedule litigation',
      url: 'https://www.congress.gov/crs-product/LSB11427',
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
      label: 'CDC Yellow Book: Norovirus (care for viral gastroenteritis, including medicines in children)',
      url: 'https://www.cdc.gov/yellow-book/hcp/travel-associated-infections-diseases/norovirus.html',
    },
    { label: 'WastewaterSCAN data dashboard', url: 'https://data.wastewaterscan.org/' },
    {
      label: 'bioMérieux: BioFire FilmArray Gastrointestinal (GI) Panel',
      url: 'https://www.biomerieux.com/corp/en/our-offer/clinical-products/biofire-filmarray-gastrointestinal-panel.html',
    },
    { label: 'BIOFIRE Syndromic Trends (bioMérieux)', url: 'https://syndromictrends.com/' },
  ],
  lastReviewed: '2026-10-07',
}

export default profile
