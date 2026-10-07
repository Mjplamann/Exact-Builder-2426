import type { PathogenProfile } from '../types'

const profile: PathogenProfile = {
  id: 'west-nile',
  name: 'West Nile virus',
  shortName: 'West Nile',
  aka: ['WNV', 'West Nile fever', 'West Nile neuroinvasive disease'],
  category: 'vector-borne',
  kind: 'virus',
  oneLiner: 'A virus spread by mosquito bites. Most people never feel sick, but it can rarely cause serious brain illness, mostly after age 60.',
  overview:
    'West Nile virus spreads to people through the bite of an infected mosquito, and it has been found in Minnesota since the early 2000s. About 8 in 10 infected people never feel sick, and about 1 in 5 get a fever and other flu-like symptoms. About 1 in 150 get a serious brain or spinal cord infection, and about 1 in 10 of them die, most often older adults. There is no vaccine for people and no medicine that kills the virus, so preventing mosquito bites is the best protection.',
  seasonality: {
    summary:
      'In Minnesota, West Nile risk starts to build in July, as infected mosquitoes become more common. Most people who get sick become ill from late July through early September, with the most illness in August. Hot weather helps the virus spread faster in mosquitoes. Risk drops as nights cool in the fall and ends for the year after the first hard frost. Risk is highest in the farm and prairie areas of western and central Minnesota. That is where the main mosquito that spreads the virus (Culex tarsalis) lives. But cases can happen anywhere in the state, including the Twin Cities.',
    peakMonths: [8, 9],
  },
  transmission:
    'People get West Nile virus from the bite of an infected mosquito. In Minnesota, the main carriers are Culex mosquitoes, which pick up the virus by biting infected birds. These mosquitoes are most active from dusk to dawn. West Nile does not spread from person to person through touching, kissing, coughing, or caring for someone who is sick. In rare cases it has spread through blood transfusions, organ transplants, and from a mother to her baby during pregnancy, birth, or breastfeeding. Donated blood in the United States is screened for West Nile virus.',
  incubation:
    'Symptoms usually start 2 to 6 days after a bite from an infected mosquito, but can start anywhere from 2 to 14 days later. It can take longer in people with weakened immune systems.',
  contagiousPeriod:
    'People with West Nile virus are not contagious to others through everyday contact. A person also cannot pass the virus back to mosquitoes, because the amount of virus in human blood stays too low.',
  symptoms: {
    common: [
      'Fever',
      'Headache',
      'Body aches and joint pain',
      'Vomiting or diarrhea',
      'Skin rash',
      'Tiredness and weakness, which can last for weeks or months',
    ],
    lessCommon: [
      'Serious infection of the brain (encephalitis) or of the lining around the brain and spinal cord (meningitis), in about 1 in 150 infected people',
      'Sudden weakness or paralysis of an arm or leg (acute flaccid paralysis)',
      'Long-lasting problems after severe illness, such as weakness, tiredness, or trouble with memory',
    ],
    emergencyWarningSigns: [
      'Severe headache with a stiff neck',
      'High fever with confusion or disorientation (not knowing where you are)',
      'Extreme sleepiness, being hard to wake up, or passing out',
      'Seizures, tremors (shaking), or jerking movements',
      'Sudden muscle weakness, or not being able to move an arm, leg, or one side of the face',
      'Trouble breathing or swallowing',
      'Sudden loss of vision, or new numbness',
    ],
  },
  ageGroups: {
    infants: {
      risk: 'lower',
      summary:
        'Serious West Nile illness is rare in babies. Babies can still be bitten and infected, so protecting them from mosquitoes is the main step.',
      actions: [
        'Do not use insect repellent on babies younger than 2 months. Cover strollers and baby carriers with mosquito netting instead.',
        'For babies 2 months and older, use a repellent registered with the U.S. Environmental Protection Agency (EPA). Spray it on your own hands, then apply it to your baby’s skin. Avoid the hands, eyes, mouth, and any cuts.',
        'Do not use products with oil of lemon eucalyptus (OLE) or para-menthane-diol (PMD) on children under 3.',
        'Dress your baby in light clothing that covers the arms and legs, and keep windows and doors screened.',
        'Call your baby’s health care provider right away for any fever in a baby younger than 3 months. Also call right away for fever with unusual sleepiness, poor feeding, or a bulging soft spot.',
      ],
    },
    children: {
      risk: 'lower',
      summary:
        'Most children who get West Nile virus have no symptoms or a mild fever. Severe illness in children is uncommon, but it can happen.',
      actions: [
        'Have an adult apply insect repellent to younger children, and keep it out of their reach. If your child uses sunscreen, put it on first and repellent second.',
        'Have children wear long sleeves and pants outdoors in the evening until the first hard frost.',
        'Once a week, empty toys, kiddie pools, buckets, and other items that hold water so mosquitoes cannot breed.',
        'Call your child’s clinician about a milder fever with headache or body aches during mosquito season.',
        'Call 911 or go to the emergency department if your child has a fever with a stiff neck, severe headache, confusion, or trouble waking up. Do the same for new weakness or a seizure.',
      ],
    },
    adults: {
      risk: 'lower',
      summary:
        'Most adults who get infected have no symptoms or a flu-like illness that goes away on its own, though tiredness can linger for weeks. People who work or spend a lot of time outdoors in the evening get bitten more often.',
      actions: [
        'Use an EPA-registered insect repellent with DEET, picaridin, IR3535, oil of lemon eucalyptus (OLE), para-menthane-diol (PMD), or 2-undecanone. Follow the label.',
        'Wear long sleeves and pants, especially from dusk to dawn. For outdoor work, consider clothing treated with permethrin, an insecticide for clothing and gear only (never skin).',
        'Keep window and door screens in good repair.',
        'Once a week, empty, scrub, cover, or throw out items that hold water, such as tires, buckets, planters, and birdbaths.',
      ],
    },
    'older-adults': {
      risk: 'moderate',
      summary:
        'The chance of serious West Nile illness goes up with age, and people over 60 are at greater risk. Conditions such as cancer, diabetes, high blood pressure, and kidney disease also raise the risk, as does having had an organ transplant.',
      actions: [
        'Use insect repellent every time you are outdoors during mosquito season, especially from dusk to dawn.',
        'Wear long sleeves and pants outdoors in the evening from July until the first hard frost.',
        'Learn the warning signs of serious illness, and get emergency care right away if they appear.',
        'Call your clinician if you have a fever with headache or body aches in late summer or early fall. This matters most if you have a long-term health condition.',
      ],
    },
    seniors: {
      risk: 'highest',
      summary:
        'Older adults have the highest risk of serious brain and nerve illness from West Nile virus, and the risk keeps climbing with age. Most deaths from West Nile are in older adults. Recovery from severe illness can take weeks to months.',
      actions: [
        'Use insect repellent every time you go outside during mosquito season, even for short tasks like gardening or walking the dog.',
        'Limit time outdoors from dusk to dawn in late summer and early fall, or cover up and use repellent when you are out.',
        'Keep screens on windows and doors, and fix any holes.',
        'Go to the emergency department or call 911 for confusion, a stiff neck with severe headache, sudden weakness, or trouble walking.',
      ],
    },
    pregnant: {
      risk: 'lower',
      summary:
        'Pregnancy is not known to make West Nile illness more severe. In rare cases, the virus has passed from a pregnant person to the baby. EPA-registered insect repellents are safe to use during pregnancy and breastfeeding when used as directed.',
      actions: [
        'Use an EPA-registered insect repellent and follow the label.',
        'Wear long sleeves and pants outdoors in the evening during mosquito season.',
        'Tell your clinician if you get a fever, rash, or headache after mosquito bites during pregnancy.',
        'Keep breastfeeding if you live where West Nile is spreading. CDC says the benefits of breastfeeding are well known, while the risk of passing the virus through breast milk is unknown. Spread this way has been reported only rarely.',
      ],
    },
    immunocompromised: {
      risk: 'higher',
      summary:
        'A weakened immune system, especially after an organ transplant or during cancer treatment, raises the risk of serious West Nile illness. Symptoms may start later or look different than usual.',
      actions: [
        'Use insect repellent every time you are outdoors during mosquito season, and cover up from dusk to dawn.',
        'Ask your care team about extra steps to lower your risk in late summer.',
        'Call your care team right away for any fever, headache, or new weakness during mosquito season.',
        'Get emergency care for confusion, severe headache with a stiff neck, seizures, or sudden weakness.',
      ],
    },
  },
  treatment: {
    summary:
      'There is no medicine that kills West Nile virus. Most people with mild illness get better on their own with rest and fluids. People with serious illness are treated in the hospital, where care focuses on easing symptoms and supporting the body while it fights the virus. Recovery from serious illness can take weeks or months, and some people have lasting effects.',
    options: [
      {
        name: 'Rest, fluids, and pain or fever relievers',
        type: 'supportive',
        detail:
          'Rest, drink plenty of fluids, and use over-the-counter pain or fever medicine as the label directs. Ask your clinician which product is right for you. Do not give aspirin to children or teens.',
        who: 'People with mild West Nile fever.',
      },
      {
        name: 'Hospital care',
        type: 'supportive',
        detail:
          'People with brain or spinal cord infection may need IV fluids (fluids through a vein), pain control, nursing care, and help with breathing. Later, physical or occupational therapy can help them regain strength and function.',
        who: 'People with serious illness such as encephalitis, meningitis, or paralysis.',
      },
    ],
    antibioticsHelp: 'no',
  },
  prevention: {
    vaccines: [],
    everyday: [
      'Use an insect repellent registered with the U.S. Environmental Protection Agency (EPA) whenever you are outdoors during mosquito season. Choose one with DEET, picaridin, IR3535, oil of lemon eucalyptus (OLE), para-menthane-diol (PMD), or 2-undecanone, and follow the label.',
      'Wear long sleeves, long pants, and socks outdoors, especially from dusk to dawn when Culex mosquitoes bite most.',
      'Treat clothing and gear with permethrin, or buy pre-treated clothing. Do not put permethrin on skin.',
      'Keep window and door screens in good repair, and use air conditioning when you can.',
      'Once a week, empty or throw out anything that holds standing water, such as tires, buckets, planters, flowerpot saucers, toys, and birdbaths.',
      'There is no West Nile vaccine for people. Horse owners can ask their veterinarian about the West Nile vaccine for horses.',
    ],
  },
  testing:
    'A clinician can order a blood test that looks for antibodies (proteins the immune system makes to fight the virus). If the brain or spinal cord may be involved, the clinician may also test spinal fluid. Antibodies can take several days to show up, so a test done very early in the illness may need to be repeated. In people with weakened immune systems, antibodies may be slow to appear or may not appear at all. A clinician may then also test blood or spinal fluid for the virus’s genetic material (RNA). There is no home test. Many people with mild illness are never tested, because the result usually does not change their care.',
  whenToSeekCare: [
    'Call your clinician if you have a fever with headache, body aches, or a rash during mosquito season. This is especially important if you are over 60 or have a weakened immune system.',
    'Call your clinician if tiredness or weakness lasts for weeks after a summer fever.',
    'Go to urgent care if you need to be seen today for a fever and headache but have no warning signs. Warning signs include a stiff neck or confusion.',
    'Call 911 or go to the emergency department for a severe headache with a stiff neck, confusion, seizures, sudden weakness or paralysis, or trouble breathing.',
  ],
  readingTheNumbers:
    'West Nile virus is not tracked with flu-style test positivity, respiratory or stomach virus panels, or emergency department visit percentages. Instead, health officials count reported human cases (confirmed and probable). Most infected people never feel sick, and many mild cases are never tested. So reported cases are mostly people with serious illness, and they are only a small part of all infections. Cases are counted by the county where the person lives, which may not be where they were bitten. There is also a delay of several weeks between a mosquito bite, illness, testing, and the case being reported. That means this week’s numbers reflect bites from earlier in the season. Health officials also track infected blood donors and test mosquitoes. In the Twin Cities area, mosquito testing by the Metropolitan Mosquito Control District can give an earlier warning. Numbers are small and change a lot from year to year, so a county with no reported cases is not a county with no risk. A rise in reported cases means infected mosquitoes were biting people in recent weeks and are likely still active. For an average person, that is a reminder to use repellent and cover up outdoors, especially in the evening, until the first hard frost.',
  watchNotes: [
    'As of early October 2026, West Nile risk in Minnesota is winding down for the year as nights get colder. Infected mosquitoes can still bite on warm evenings until a hard frost, so keep using repellent outdoors until then.',
    '2025 was one of Minnesota’s busiest West Nile years on record, with more than 100 reported cases and at least 10 deaths, the most cases since 2003. Numbers change a lot from year to year, so check the MDH statistics page for 2026 counts.',
    'The Minnesota Department of Health posts this year’s case counts by county on its West Nile statistics page and updates them during the season.',
  ],
  sources: [
    { label: 'CDC — West Nile virus', url: 'https://www.cdc.gov/west-nile-virus/index.html' },
    { label: 'CDC — West Nile virus: current year data', url: 'https://www.cdc.gov/west-nile-virus/data-maps/current-year-data.html' },
    { label: 'CDC — ArboNET (national arboviral disease surveillance)', url: 'https://www.cdc.gov/mosquitoes/php/arbonet/index.html' },
    {
      label: 'Minnesota Department of Health — West Nile virus statistics',
      url: 'https://www.health.state.mn.us/diseases/westnile/statistics.html',
    },
    {
      label: 'Minnesota Department of Health — West Nile virus activity news release (August 2025)',
      url: 'https://www.health.state.mn.us/news/pressrel/2025/westnile082525.html',
    },
    { label: 'U.S. EPA — Insect repellents', url: 'https://www.epa.gov/insect-repellents' },
  ],
  lastReviewed: '2026-10-07',
}

export default profile
