import type { PathogenProfile } from '../types'

const profile: PathogenProfile = {
  id: 'babesiosis',
  name: 'Babesiosis',
  shortName: 'Babesiosis',
  aka: ['Babesia microti', 'Babesia infection'],
  category: 'vector-borne',
  kind: 'parasite',
  oneLiner:
    'A parasite spread by blacklegged (deer) ticks that infects red blood cells. Often mild, but it can be serious for some people.',
  overview:
    'Babesiosis is caused by tiny parasites, mainly Babesia microti, that infect and destroy red blood cells. In Minnesota, it spreads mostly through the bite of an infected blacklegged (deer) tick, and it can also spread through blood transfusions. Many people have no symptoms or a mild flu-like illness. It can be severe or even life-threatening for people without a spleen, people with weakened immune systems, and older adults.',
  seasonality: {
    summary:
      'Most Minnesota cases begin in summer, from about June through August, after bites from young blacklegged ticks (nymphs) in late spring and early summer. Because symptoms can take weeks to start, illnesses often show up a little later than the bites. Cases linked to blood transfusions can happen any time of year.',
    peakMonths: [6, 7, 8],
  },
  transmission:
    'Babesiosis usually spreads through the bite of an infected blacklegged tick, the same tick that spreads Lyme disease. Most often it is a nymph about the size of a poppy seed. The tick generally needs to stay attached for more than a day to pass on the parasite, so removing ticks quickly helps. It can also spread through a blood transfusion from a donor who has the parasite but feels well. Rarely, it passes from a pregnant person to the baby. It does not spread through casual contact.',
  incubation:
    'When symptoms happen, they usually start about 1 to 4 weeks after a tick bite. After a blood transfusion, symptoms usually start within about 1 to 9 weeks, but it can take longer.',
  contagiousPeriod:
    'Babesiosis does not spread from person to person through touching, coughing, or sharing a home. The parasite can stay in the blood for weeks to months, even in people who feel well. That is how it can spread through donated blood. Rarely, it passes from a pregnant person to the baby during pregnancy or delivery.',
  symptoms: {
    common: [
      'Fever, which may come and go',
      'Chills and sweats',
      'Tiredness and weakness',
      'Headache',
      'Muscle or joint aches',
      'Loss of appetite or nausea',
    ],
    lessCommon: [
      'No symptoms at all (common in otherwise healthy people)',
      'Dark urine',
      'Yellow skin or eyes (jaundice)',
      'Shortness of breath or cough',
      'Low red blood cell count (anemia), which can cause pale skin and tiredness',
      'Enlarged spleen or liver',
    ],
    emergencyWarningSigns: [
      'Trouble breathing',
      'Confusion or being very hard to wake',
      'Very dark (tea- or cola-colored) urine, or peeing much less than usual',
      'Yellow skin or eyes with extreme weakness',
      'Fainting, a very fast heartbeat, or cold, clammy skin',
      'Unusual bleeding or bruising',
      'Any fever in a person who does not have a spleen',
    ],
  },
  ageGroups: {
    infants: {
      risk: 'moderate',
      summary:
        'Babesiosis is rare in babies. It can happen after a blood transfusion or, rarely, be passed from the birth parent. Babies who get it can develop anemia (too few red blood cells) and may need hospital care.',
      actions: [
        'Call your baby’s health care provider right away for any fever in a baby younger than 3 months.',
        'Tell the provider if the birth parent had babesiosis or another tick-borne illness during pregnancy.',
        'Tell the provider if your baby had a blood transfusion and later has fever or pale or yellow skin.',
        'Protect babies from ticks with netting and clothing. Do not use repellent on babies younger than 2 months.',
      ],
    },
    children: {
      risk: 'lower',
      summary:
        'Most children have mild illness or no symptoms. Children without a spleen, or with a weakened immune system, can become seriously ill.',
      actions: [
        'Use a repellent registered with the U.S. Environmental Protection Agency (EPA), and do tick checks after outdoor play.',
        'Call your clinician for fever, tiredness, or pale or yellow skin after tick exposure.',
        'Does your child have no spleen, or a spleen that does not work well (for example, from sickle cell disease)? Seek care right away for any fever.',
        'The usual Lyme antibiotics do not treat babesiosis. Call your clinician if fever continues during Lyme treatment.',
      ],
    },
    adults: {
      risk: 'lower',
      summary:
        'Healthy adults often have mild symptoms or none. Some have a flu-like illness that can last weeks. Treatment helps people with symptoms recover.',
      actions: [
        'Use repellent on skin and permethrin-treated clothing in tick areas.',
        'See a clinician for fever, chills, and tiredness after tick exposure in summer.',
        'Tell your clinician if fever continues while you are being treated for Lyme disease.',
        'If you have had babesiosis, tell blood donation staff before donating.',
      ],
    },
    'older-adults': {
      risk: 'moderate',
      summary:
        'The risk of severe babesiosis starts to rise in this age range, especially for people with other health problems. Early testing and treatment help.',
      actions: [
        'Seek care promptly for fever, chills, and tiredness after time outdoors in summer.',
        'Tell your clinician if you have had your spleen removed or take medicines that weaken your immune system.',
        'Check for ticks after yard work, hunting, or hiking.',
        'Get emergency care for trouble breathing, confusion, or very dark urine.',
      ],
    },
    seniors: {
      risk: 'higher',
      summary:
        'Older adults are more likely to have severe babesiosis, which can include severe anemia, breathing problems, and kidney or liver problems. Prompt treatment improves recovery.',
      actions: [
        'Call your clinician the same day for fever or unusual tiredness after possible tick exposure.',
        'Get emergency care for trouble breathing, confusion, fainting, or very dark urine.',
        'Check for ticks after gardening or time at the cabin or lake.',
        'Bring a full list of your medicines to your visit, since treatment medicines can interact with others.',
      ],
    },
    pregnant: {
      risk: 'moderate',
      summary:
        'Babesiosis during pregnancy is rare, and the parasite can rarely pass to the baby. Your clinician will choose a treatment that balances benefits and risks for you and your baby.',
      actions: [
        'Call your prenatal care provider for fever after a tick bite or time outdoors.',
        'Use an EPA-registered repellent. These are safe during pregnancy when used as directed.',
        'Do a tick check every day during tick season.',
        'If you had babesiosis during pregnancy, tell your baby’s health care provider.',
      ],
    },
    immunocompromised: {
      risk: 'highest',
      summary:
        'People without a spleen and people with weakened immune systems have the highest risk of severe babesiosis. Immune systems can be weakened by cancer treatment, an organ transplant, HIV, or medicines such as rituximab. Illness can last a long time or come back, and treatment often lasts 6 weeks or longer.',
      actions: [
        'Seek care right away for any fever, especially if you do not have a spleen.',
        'Limit time in tick habitat in late spring and summer. When you go, use repellent and permethrin-treated clothing.',
        'Check for ticks every day and remove them quickly.',
        'Expect follow-up blood tests during and after treatment to make sure the parasite is gone.',
        'Tell your care team about any tick exposure or recent blood transfusion.',
      ],
    },
  },
  treatment: {
    summary:
      'People with symptoms are treated with two medicines taken together, usually for 7 to 10 days. These are atovaquone (an antiparasitic) and azithromycin (an antibiotic). Severe illness is treated in the hospital. This may include medicine through a vein (IV) and, in some cases, an exchange transfusion. People with weakened immune systems often need 6 weeks or more of treatment. The antibiotics used for Lyme disease, such as doxycycline and amoxicillin, do not treat babesiosis. People with no symptoms usually do not need treatment, unless tests show the parasite is still in the blood after about 3 months.',
    options: [
      {
        name: 'Atovaquone plus azithromycin',
        type: 'antiparasitic',
        detail:
          'The preferred treatment for most people. Both are usually taken by mouth for 7 to 10 days. For severe illness, azithromycin may be given through a vein. Take atovaquone with food, which helps the body absorb it.',
        who: 'Most people with symptoms, including children.',
      },
      {
        name: 'Clindamycin plus quinine',
        type: 'antiparasitic',
        detail:
          'An older combination that works but causes more side effects, such as ringing in the ears and upset stomach.',
        who: 'People who cannot take atovaquone and azithromycin, as decided by a clinician.',
      },
      {
        name: 'Exchange transfusion',
        type: 'other',
        detail:
          'In very severe cases, some of the patient’s blood is removed and replaced with donor blood. This quickly lowers the number of infected red blood cells.',
        who: 'People with very high parasite levels, severe anemia, or organ problems.',
      },
      {
        name: 'Hospital and supportive care',
        type: 'supportive',
        detail: 'Fluids, oxygen, and blood transfusions may be needed for severe anemia or breathing problems.',
        who: 'People with severe illness.',
      },
    ],
    antibioticsHelp: 'yes',
  },
  prevention: {
    vaccines: [],
    everyday: [
      'Use a repellent registered with the U.S. Environmental Protection Agency (EPA). Look for one of these active ingredients: DEET, picaridin, IR3535, oil of lemon eucalyptus (OLE), para-menthane-diol (PMD), or 2-undecanone. Follow the label.',
      'Treat clothing, boots, and gear with 0.5% permethrin (an insect-killing treatment for clothing), or buy pre-treated items. Do not put permethrin on skin.',
      'Walk in the center of trails. Avoid brushy areas, tall grass, and leaf litter.',
      'Check your whole body for ticks every day after time outdoors, and remove them right away with fine-tipped tweezers.',
      'Shower within 2 hours of coming indoors. Tumble dry clothes on high heat for 10 minutes to kill ticks.',
      'If you do not have a spleen or have a weakened immune system, take extra care to avoid tick bites from late spring through summer.',
      'If you have ever had babesiosis, tell blood donation staff before donating.',
    ],
  },
  testing:
    'Babesiosis is diagnosed with blood tests. A lab can look for the parasite inside red blood cells under a microscope (a blood smear). A PCR test can also find its genetic material. Antibody tests can show past or current infection, but they cannot confirm a current illness on their own. Routine blood tests may show anemia, low platelets, or signs that red blood cells are breaking down. Ask about babesiosis testing if you have fever after a tick bite, especially if Lyme treatment is not helping. There is no home test.',
  whenToSeekCare: [
    'Call your clinician for fever, chills, sweats, or unusual tiredness within a few weeks of possible tick exposure or after a blood transfusion.',
    'Call if you are being treated for Lyme disease and still have fever after a few days. This can be a sign of babesiosis or another tick-borne infection.',
    'If you do not have a spleen or have a weakened immune system, seek care the same day for any fever.',
    'Go to an emergency department for trouble breathing, confusion, fainting, very dark urine, or yellow skin with extreme weakness.',
  ],
  readingTheNumbers:
    'Babesiosis is tracked through cases that clinicians and labs report to the Minnesota Department of Health (MDH). CDC’s weekly national tables do not currently list Minnesota babesiosis counts, so this page may not show a current number. MDH publishes yearly totals, which are more complete. Babesiosis is much less common in Minnesota than Lyme disease or anaplasmosis. For example, MDH counted 61 confirmed and probable cases in 2022. Counts this small can jump up or down from year to year by chance. Reports lag behind real time. They also miss people with mild or no symptoms who are never tested. Babesiosis is not on the respiratory or stool BioFire panels. It also has no test positivity measure like the ones used for flu or COVID-19. Most cases appear in summer. For you, a rise in cases is a reminder that infected ticks are active. Most people are not at high risk. People without a spleen, people with weakened immune systems, and older adults should take extra care. They should prevent tick bites and get care quickly for fever.',
  watchNotes: [
    'Minnesota is one of a small number of states where babesiosis is regularly found, along with Wisconsin and several states in the Northeast.',
    'Blood donations collected in Minnesota and other higher-risk states are tested for Babesia, or treated to kill germs, as the FDA recommends. This greatly lowers, but does not remove, the risk of getting it from a transfusion.',
    'The same tick spreads Lyme disease and anaplasmosis. Having more than one of these infections at once is possible and can make illness worse or last longer.',
    'October and November are adult tick season. Babesiosis is mostly spread by nymphs in summer, but fall tick bites are still worth preventing.',
  ],
  sources: [
    { label: 'CDC: About Babesiosis', url: 'https://www.cdc.gov/babesiosis/about/index.html' },
    { label: 'CDC: How Babesiosis Spreads', url: 'https://www.cdc.gov/babesiosis/spreads/index.html' },
    {
      label: 'CDC: Clinical Care of Babesiosis (for health professionals)',
      url: 'https://www.cdc.gov/babesiosis/hcp/clinical-care/index.html',
    },
    {
      label: 'Minnesota Department of Health: About Babesiosis',
      url: 'https://www.health.state.mn.us/diseases/babesiosis/basics.html',
    },
    {
      label: 'Minnesota Department of Health: Babesiosis Statistics',
      url: 'https://www.health.state.mn.us/diseases/babesiosis/statistics.html',
    },
    {
      label: 'Minnesota Department of Health: Diseases That Can Be Transmitted by Ticks',
      url: 'https://www.health.state.mn.us/diseases/tickborne/diseases.html',
    },
    {
      label: 'IDSA: 2020 Guideline on Diagnosis and Management of Babesiosis',
      url: 'https://www.idsociety.org/practice-guideline/babesiosis/',
    },
    { label: 'U.S. EPA: Repellents: Protection Against Mosquitoes, Ticks and Other Arthropods', url: 'https://www.epa.gov/insect-repellents' },
  ],
  lastReviewed: '2026-10-07',
}

export default profile
