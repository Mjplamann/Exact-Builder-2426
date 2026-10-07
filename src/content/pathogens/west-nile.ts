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
    'West Nile virus is spread to people by the bite of an infected mosquito. It is the leading cause of mosquito-borne disease in the continental United States, and it has been found in Minnesota since the early 2000s. About 8 in 10 infected people never feel sick, and about 1 in 5 get a fever and other flu-like symptoms. About 1 in 150 get a serious infection of the brain or spinal cord, and the risk of this rises with age. There is no vaccine for people and no medicine that kills the virus, so preventing mosquito bites is the best protection.',
  seasonality: {
    summary:
      'In Minnesota, West Nile risk starts to build in July, when infected mosquitoes become more common. Most people who get sick become ill in August and early September. Hot summer weather can help the virus spread faster in mosquitoes. Risk drops as nights cool in the fall and ends for the year after the first hard frost. The highest risk is in the farmland and prairie areas of western and central Minnesota, where the main mosquito that spreads the virus (Culex tarsalis) lives, but cases can happen anywhere in the state, including the Twin Cities.',
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
      'No symptoms at all (about 8 in 10 infected people)',
      'Fever',
      'Headache',
      'Body aches and joint pain',
      'Tiredness and weakness, which can last for weeks or months',
    ],
    lessCommon: [
      'Vomiting or diarrhea',
      'Skin rash',
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
        'For babies 2 months and older, use an EPA-registered repellent. Spray it on your own hands, then apply it to your baby’s skin, avoiding the hands, eyes, mouth, and any cuts.',
        'Do not use products with oil of lemon eucalyptus (OLE) or para-menthane-diol (PMD) on children under 3.',
        'Dress your baby in light clothing that covers the arms and legs, and keep windows and doors screened.',
      ],
    },
    children: {
      risk: 'lower',
      summary:
        'Most children who get West Nile virus have no symptoms or a mild fever. Severe illness in children is uncommon, but it can happen.',
      actions: [
        'Have an adult apply insect repellent to younger children. Keep repellent out of children’s reach.',
        'If your child also uses sunscreen, put sunscreen on first and repellent second.',
        'Have children wear long sleeves and pants outdoors in the evening during mosquito season.',
        'Once a week, empty toys, kiddie pools, buckets, and other items that hold water so mosquitoes cannot breed.',
        'Call your child’s clinician about a fever with a severe headache, stiff neck, or unusual sleepiness.',
      ],
    },
    adults: {
      risk: 'lower',
      summary:
        'Most adults who get infected have no symptoms or a flu-like illness that goes away on its own, though tiredness can linger for weeks. People who work or spend a lot of time outdoors in the evening get bitten more often.',
      actions: [
        'Use an EPA-registered insect repellent with DEET, picaridin, IR3535, oil of lemon eucalyptus (OLE), para-menthane-diol (PMD), or 2-undecanone. Follow the label.',
        'Wear long sleeves and pants, especially from dusk to dawn. For outdoor work, consider clothing treated with permethrin (an insecticide for clothing and gear only, never skin).',
        'Keep window and door screens in good repair.',
        'Empty, scrub, cover, or throw out items that hold water, such as tires, buckets, planters, and birdbaths, once a week.',
      ],
    },
    'older-adults': {
      risk: 'moderate',
      summary:
        'The chance of serious West Nile illness goes up with age, and people over 60 are at greater risk. Conditions such as cancer, diabetes, high blood pressure, and kidney disease also raise the risk.',
      actions: [
        'Use insect repellent every time you are outdoors during mosquito season, especially from dusk to dawn.',
        'Wear long sleeves and pants outdoors in the evening from July through September.',
        'Learn the warning signs of serious illness, and get care right away if they appear.',
        'Call your clinician if you have a fever with headache or body aches in late summer, especially if you have a long-term health condition.',
      ],
    },
    seniors: {
      risk: 'highest',
      summary:
        'Older adults have the highest risk of serious brain and nerve illness from West Nile virus, and the risk keeps climbing with age. Most deaths from West Nile are in older adults. Recovery from severe illness can take weeks to months.',
      actions: [
        'Use insect repellent every time you go outside during mosquito season, even for short tasks like gardening or walking the dog.',
        'Limit time outdoors from dusk to dawn in late summer, or cover up and use repellent when you are out.',
        'Keep screens on windows and doors, and fix any holes.',
        'Go to the emergency department or call 911 for confusion, a stiff neck with severe headache, sudden weakness, or trouble walking.',
      ],
    },
    pregnant: {
      risk: 'lower',
      summary:
        'Pregnancy is not known to make West Nile illness more severe. In rare cases, the virus has passed from a pregnant person to the baby. Insect repellents registered by the EPA are safe to use during pregnancy and breastfeeding when used as directed.',
      actions: [
        'Use an EPA-registered insect repellent and follow the label.',
        'Wear long sleeves and pants outdoors in the evening during mosquito season.',
        'Tell your clinician if you get a fever, rash, or headache after mosquito bites during pregnancy.',
        'Keep breastfeeding if you live where West Nile is spreading. Health experts say the benefits of breastfeeding outweigh the small, uncertain risk.',
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
          'People with brain or spinal cord infection may need IV fluids (fluids through a vein), pain control, nursing care, help with breathing, and later physical or occupational therapy to regain strength and function.',
        who: 'People with serious illness such as encephalitis, meningitis, or paralysis.',
      },
    ],
    antibioticsHelp: 'no',
  },
  prevention: {
    vaccines: [],
    everyday: [
      'Use an EPA-registered insect repellent with DEET, picaridin, IR3535, oil of lemon eucalyptus (OLE), para-menthane-diol (PMD), or 2-undecanone whenever you are outdoors during mosquito season. Follow the label.',
      'Wear long sleeves, long pants, and socks outdoors, especially from dusk to dawn when Culex mosquitoes bite most.',
      'Treat clothing and gear with permethrin, or buy pre-treated clothing. Do not put permethrin on skin.',
      'Keep window and door screens in good repair, and use air conditioning when you can.',
      'Once a week, empty or throw out anything that holds standing water, such as tires, buckets, planters, flowerpot saucers, toys, and birdbaths.',
      'There is no West Nile vaccine for people. Horse owners can ask their veterinarian about the West Nile vaccine for horses.',
    ],
  },
  testing:
    'A clinician can order a blood test that looks for antibodies (proteins the immune system makes to fight the virus). If the brain or spinal cord may be involved, the clinician may also test spinal fluid. Antibodies can take several days to show up, so a test done very early in the illness may need to be repeated. There is no home test. Many people with mild illness are never tested, because the result usually does not change their care.',
  whenToSeekCare: [
    'Call your clinician if you have a fever with headache, body aches, or a rash during mosquito season, especially if you are over 60 or have a weakened immune system.',
    'Call your clinician if tiredness or weakness lasts for weeks after a summer fever.',
    'Go to urgent care if you need to be seen today for a fever and headache but have no warning signs, such as a stiff neck or confusion.',
    'Call 911 or go to the emergency department for a severe headache with a stiff neck, confusion, seizures, sudden weakness or paralysis, or trouble breathing.',
  ],
  readingTheNumbers:
    'West Nile virus is not tracked with flu-style test positivity, respiratory or stomach virus panels, or emergency department visit percentages. Instead, health officials count confirmed human cases. Because most infected people never feel sick and many mild cases are never tested, reported cases are mostly people with serious illness, and they are only a small part of all infections. There is also a delay of several weeks between a mosquito bite, illness, testing, and the case being reported, so this week’s numbers reflect bites from earlier in the summer. Mosquito testing, such as the testing done by the Metropolitan Mosquito Control District in the Twin Cities area, can give an earlier warning. Numbers are small and change a lot from year to year, so a county with no reported cases is not a county with no risk. A rise in cases in August or September means infected mosquitoes are active now. For an average person, that is a reminder to use repellent and cover up outdoors, especially in the evening, until the first hard frost.',
  watchNotes: [
    'In early October, West Nile risk in Minnesota is winding down for the year as nights get colder. Infected mosquitoes can still bite on warm evenings until a hard frost, so keep using repellent outdoors until then.',
    'There is no vaccine for people. Preventing mosquito bites is the only way to lower your risk.',
    'Donated blood in the United States is screened for West Nile virus to prevent spread through transfusions.',
  ],
  sources: [],
  lastReviewed: '2026-10-07',
}

export default profile
