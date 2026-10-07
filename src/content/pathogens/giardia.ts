import type { PathogenProfile } from '../types'

const profile: PathogenProfile = {
  id: 'giardia',
  name: 'Giardia (giardiasis)',
  shortName: 'Giardia',
  aka: ['Giardiasis', 'Beaver fever', 'Giardia lamblia', 'Giardia duodenalis', 'Giardia intestinalis'],
  category: 'gastrointestinal',
  kind: 'parasite',
  biofireTargets: ['Giardia lamblia'],
  oneLiner:
    'A common parasite in untreated lake, stream, and well water that causes gassy, greasy diarrhea and spreads easily in child care.',
  overview:
    'Giardia is a tiny parasite that lives in the gut and causes an illness called giardiasis. It is one of the most commonly reported intestinal parasites in Minnesota and a common cause of illness from water. People can catch it from untreated lake, river, or well water, from swallowing water while swimming, or from close contact, especially in child care. Some people never have symptoms but can still spread it, and prescription medicines treat it well.',
  seasonality: {
    summary:
      'Giardia is reported all year in Minnesota. Cases tend to rise in summer and early fall, when more people swim, camp, and spend time on lakes and rivers. Cases linked to international travel, or found in people who recently moved to the U.S., can happen in any season.',
    peakMonths: [7, 8, 9],
  },
  transmission:
    'Giardia is passed in the stool (poop) of infected people and animals. A tough outer shell lets it survive outside the body for long periods. People get sick by swallowing it. You can get it by drinking untreated water from lakes, rivers, springs, or shallow wells. You can also get it by swallowing water while swimming in lakes, rivers, pools, or splash pads. Eating contaminated food or close contact with someone who has it can also spread it. So can touching dirty surfaces, like diaper-changing tables, door handles, or toys, and then your mouth. Swallowing just a few Giardia germs can make you sick. You are unlikely to get Giardia from a dog or cat. The types that infect pets are usually not the types that infect people.',
  incubation: 'Usually 1 to 2 weeks after exposure, sometimes up to about 3 weeks.',
  contagiousPeriod:
    'A person can spread Giardia as long as the parasite is in their stool. This can continue after symptoms improve. People with no symptoms, especially young children, can still pass it to others. Treatment usually clears the parasite.',
  symptoms: {
    common: [
      'Diarrhea',
      'Gas',
      'Greasy, foul-smelling stools that may float',
      'Stomach cramps or pain',
      'Upset stomach or nausea',
      'Bloating',
    ],
    lessCommon: [
      'Loss of appetite and weight loss',
      'Vomiting',
      'Dehydration (losing too much body fluid)',
      'Symptoms that last longer than 6 weeks or keep coming back',
      'Trouble digesting milk (lactose intolerance) that lasts after the infection is gone',
      'No symptoms at all (common, especially in children)',
    ],
    emergencyWarningSigns: [
      'Signs of serious dehydration: peeing very little or not at all, very dry mouth, or feeling dizzy or faint when standing',
      'In babies and young children: no wet diapers for many hours, crying with few or no tears, sunken eyes, or being unusually sleepy, limp, or fussy',
      'A fever of 100.4°F (38°C) or higher in a baby younger than 3 months',
      'Not able to keep any liquids down',
      'Confusion or being very hard to wake',
      'Severe belly pain, or bloody or black stools',
    ],
  },
  ageGroups: {
    infants: {
      risk: 'moderate',
      summary:
        'Babies can catch Giardia in child care or from family members. Diarrhea can quickly lead to dehydration in babies, and a long-lasting infection can affect feeding and weight gain.',
      actions: [
        'Keep breastfeeding or formula feeding during diarrhea.',
        'Call your baby’s health care provider if your baby has diarrhea that lasts more than a day or is drinking less than usual.',
        'Wash your hands with soap and water after every diaper change.',
        'Clean and disinfect diaper-changing areas after each use.',
        'Use only safe, treated water for mixing formula.',
      ],
    },
    children: {
      risk: 'moderate',
      summary:
        'Giardia spreads easily among young children, especially in child care, and many children carry it without symptoms. A serious or long-lasting infection can keep children from absorbing nutrients and slow growth.',
      actions: [
        'Keep children with diarrhea home from child care and out of pools, lakes, and splash pads.',
        'Teach kids to wash hands with soap and water after using the bathroom and before eating.',
        'Remind kids not to swallow water when swimming in lakes, rivers, or pools.',
        'Call your clinician if diarrhea lasts more than a few days, or if your child is losing weight.',
      ],
    },
    adults: {
      risk: 'lower',
      summary:
        'Most healthy adults recover, and medicine works well. Without treatment, symptoms often last 2 to 6 weeks, and some people have trouble digesting milk for a while afterward.',
      actions: [
        'Boil or filter water from lakes, streams, or springs before drinking it, even if it looks clean.',
        'Ask your clinician about testing if diarrhea lasts more than a few days after camping, swimming, travel, or contact with someone who has Giardia.',
        'Wash hands with soap and water, especially if you change diapers or work in child care.',
        'Do not swim while you have diarrhea.',
      ],
    },
    'older-adults': {
      risk: 'lower',
      summary:
        'Most people in this age group recover fully with treatment. Long-lasting diarrhea can be harder on people with other health problems.',
      actions: [
        'Boil or filter untreated water at cabins, campsites, and on the trail.',
        'If you use a private well, have it tested and maintained as MDH recommends.',
        'Ask your clinician about testing if diarrhea lasts more than a few days.',
        'Drink plenty of fluids while sick.',
      ],
    },
    seniors: {
      risk: 'moderate',
      summary:
        'Older adults can become dehydrated more easily, and weeks of diarrhea and weight loss can be harder on the body. Getting tested and treated helps.',
      actions: [
        'Call your clinician early if diarrhea lasts more than a day or two.',
        'Sip fluids often, even if you are not thirsty.',
        'Ask whether any of your regular medicines should be paused while you are sick.',
        'Wash hands with soap and water after caring for grandchildren in diapers.',
      ],
    },
    pregnant: {
      risk: 'moderate',
      summary:
        'Pregnancy does not make Giardia more likely. But weeks of diarrhea, dehydration, and weight loss can affect nutrition during pregnancy. Some Giardia medicines are avoided or used with care during pregnancy, so your clinician will choose the best option.',
      actions: [
        'Call your prenatal care provider if you have diarrhea that lasts more than a day or two.',
        'Tell your clinician you are pregnant before starting any Giardia medicine.',
        'Drink plenty of fluids.',
        'Avoid untreated lake, stream, or well water.',
      ],
    },
    immunocompromised: {
      risk: 'higher',
      summary:
        'People with certain immune problems, especially conditions that cause low antibody levels, can have Giardia infections that last a long time or keep coming back. Close follow-up with your care team helps.',
      actions: [
        'Contact your care team if diarrhea lasts more than a few days.',
        'Ask whether you need a follow-up stool test after treatment.',
        'Boil or filter all untreated water, and avoid swallowing water while swimming.',
        'Wash hands with soap and water often, especially before eating.',
      ],
    },
  },
  treatment: {
    summary:
      'Several prescription medicines treat giardiasis well, including tinidazole, metronidazole, and nitazoxanide. Tinidazole and metronidazole are antibiotics that also work against some parasites, including Giardia. Nitazoxanide is an antiparasitic medicine. Common antibiotics such as amoxicillin do not work against Giardia. Your clinician will choose based on age, pregnancy, and other health factors. People who carry Giardia but have no symptoms usually do not need treatment. Their clinician may still recommend it, such as to protect a pregnant family member. Drinking plenty of fluids is important. Some people have trouble digesting milk for weeks after treatment, and this usually improves with time.',
    options: [
      {
        name: 'Tinidazole',
        type: 'antiparasitic',
        detail:
          'Usually taken as a single dose. Avoid alcohol while taking it and for a few days after. Tell your clinician if you are pregnant.',
        who: 'Commonly used for people 3 years and older.',
      },
      {
        name: 'Metronidazole (Flagyl)',
        type: 'antiparasitic',
        detail:
          'Taken by mouth for several days (often 5 to 7). It can cause nausea and a metallic taste. Avoid alcohol while taking it and for a few days after.',
        who: 'An option for many people, including babies under 1 year.',
      },
      {
        name: 'Nitazoxanide (Alinia)',
        type: 'antiparasitic',
        detail:
          'A 3-day course that comes as a liquid or tablet, which can make it easier for young children to take. FDA-approved for people 1 year and older.',
        who: 'Often used for children ages 1 to 3, and as an option for others.',
      },
      {
        name: 'Paromomycin',
        type: 'antiparasitic',
        detail:
          'An alternative a clinician may choose, especially during pregnancy. It stays mostly in the gut, and little of it is absorbed into the body.',
        who: 'Some pregnant people and others who can’t take the usual medicines.',
      },
      {
        name: 'Fluids and rest',
        type: 'supportive',
        detail:
          'Drink plenty of fluids to replace what is lost through diarrhea. Oral rehydration solutions (drinks made to replace fluids and salts) help, especially for children and older adults. Cutting back on milk for a while can help if dairy makes symptoms worse.',
        who: 'Everyone with diarrhea.',
      },
    ],
    antibioticsHelp: 'yes',
  },
  prevention: {
    vaccines: [],
    everyday: [
      'Wash your hands with soap and water after using the bathroom, after changing diapers, and before eating or preparing food.',
      'Do not drink untreated water from lakes, rivers, streams, or springs, even if it looks clean. Bring it to a rolling boil for 1 minute, or use a filter made to remove parasites.',
      'Try not to swallow water when swimming in lakes, rivers, pools, or splash pads.',
      'Do not swim, and keep children out of the water, while sick with diarrhea.',
      'If you have a private well, especially a shallow one, have it tested and maintained. Contact MDH or your county if flooding reaches your well.',
      'Clean diaper-changing areas and toys often, and stay home from child care, school, or work while you have diarrhea.',
      'Pick up after pets promptly and wash your hands afterward.',
    ],
  },
  testing:
    'Giardia is diagnosed with a stool (poop) test. Labs may look for Giardia proteins (antigen tests), its genetic material (PCR), or the parasite itself under a microscope. Because the parasite is not passed in every stool, more than one sample collected on different days may be needed. Stool panels that check for many germs at once (such as BioFire) include Giardia. There is no home test.',
  whenToSeekCare: [
    'Call your clinician if diarrhea lasts more than a few days or keeps coming back. This matters most after camping, swimming, drinking untreated water, travel, or contact with someone who has Giardia.',
    'Call if you or your child is losing weight, has greasy or foul-smelling stools for more than a few days, or has symptoms lasting weeks.',
    'Call early if you are pregnant, are 65 or older, have a weakened immune system, or are caring for a baby with diarrhea.',
    'Go to urgent care or an emergency department for signs of dehydration or if you can’t keep liquids down. Also go right away for bloody stools or severe belly pain.',
    'To report a suspected foodborne or waterborne illness in Minnesota, call the MDH Foodborne Illness Hotline at 1-877-FOOD-ILL (1-877-366-3455).',
  ],
  readingTheNumbers:
    'MN Pulse shows the BioFire detection rate: the percent of BioFire stool panel tests at participating Midwest labs (not just Minnesota) that found Giardia. These panels are mostly ordered for people with significant or lasting diarrhea, often at hospitals. So the number shows the share of tested people whose sample had Giardia. It does not count how many Minnesotans are infected, because most people with diarrhea are never tested. Giardia can live in the gut without causing symptoms, so a positive result does not always mean it caused that person’s illness. Detections usually stay fairly steady through the year, with a modest rise in summer and early fall. A summer rise often reflects more swimming, camping, and travel. It does not by itself mean city tap water is unsafe. Public water systems are treated to remove parasites like Giardia. For you, a rising number is a reminder to boil or filter untreated water and avoid swallowing water when you swim. Wash hands with soap and water, too.',
  sources: [
    { label: 'CDC: About Giardia Infection', url: 'https://www.cdc.gov/giardia/' },
    { label: 'CDC: Symptoms of Giardia Infection', url: 'https://www.cdc.gov/giardia/signs-symptoms/index.html' },
    {
      label: 'CDC: About Giardia and Pets',
      url: 'https://www.cdc.gov/giardia/about/about-giardia-and-pets.html',
    },
    {
      label: 'Minnesota Department of Health: Giardiasis Basics',
      url: 'https://www.health.state.mn.us/diseases/giardiasis/basics.html',
    },
    {
      label: 'Minnesota Department of Health: Giardiasis Information for Health Professionals',
      url: 'https://www.health.state.mn.us/diseases/giardiasis/healthcare.html',
    },
    {
      label: 'Minnesota Department of Health: Giardiasis Statistics',
      url: 'https://www.health.state.mn.us/diseases/giardiasis/statistics.html',
    },
    {
      label: 'bioMérieux: BIOFIRE FILMARRAY Gastrointestinal Panel',
      url: 'https://www.biomerieux.com/corp/en/our-offer/clinical-products/biofire-filmarray-gastrointestinal-panel.html',
    },
  ],
  lastReviewed: '2026-10-07',
}

export default profile
