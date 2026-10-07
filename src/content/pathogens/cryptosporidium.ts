import type { PathogenProfile } from '../types'

const profile: PathogenProfile = {
  id: 'cryptosporidium',
  name: 'Cryptosporidium (cryptosporidiosis)',
  shortName: 'Crypto',
  aka: ['Crypto', 'Cryptosporidiosis'],
  category: 'gastrointestinal',
  kind: 'parasite',
  biofireTargets: ['Cryptosporidium'],
  oneLiner:
    'A parasite that survives pool chlorine. It spreads through swimming water and farm animals like calves and causes watery diarrhea.',
  overview:
    'Cryptosporidium, or “Crypto,” is a tiny parasite that causes watery diarrhea. It survives for days in properly chlorinated pools and is the leading cause of U.S. outbreaks linked to pools and water playgrounds. Young calves and other farm animals, such as at farms, fairs, and petting zoos, are another known source. Most healthy people get better on their own within about 2 weeks, but Crypto can be severe and long-lasting for people with weakened immune systems.',
  seasonality: {
    summary:
      'Crypto is reported all year in Minnesota, but cases rise in summer and peak in late summer. That is when pools, splash pads, and lakes are busiest, and when fairs and farm visits bring more people into contact with animals. Infections from calves and other farm animals can happen in any season.',
    peakMonths: [7, 8, 9],
  },
  transmission:
    'Crypto spreads when people swallow something contaminated with stool (poop) from an infected person or animal. You can get it by swallowing water from pools, splash pads, lakes, or rivers, or by drinking untreated water. You can also get it by touching calves, goats, lambs, or their pens and then your mouth. Close contact with a sick person spreads it too, especially in child care or when changing diapers. Drinking unpasteurized (raw) milk or apple cider is another risk. One person with diarrhea can release huge numbers of parasites into a pool, and swallowing just a few can make someone sick.',
  incubation: 'About 1 week on average. Symptoms usually start 2 to 10 days after swallowing the parasite.',
  contagiousPeriod:
    'From the time symptoms start until weeks after diarrhea stops, because the parasite stays in stool. People with no symptoms can also spread it. Children should stay home from child care until diarrhea has stopped. CDC advises everyone to stay out of pools, splash pads, and other swimming water for 2 weeks after diarrhea has completely stopped.',
  symptoms: {
    common: [
      'Watery diarrhea',
      'Stomach cramps or pain',
      'Nausea (upset stomach)',
      'Vomiting',
      'Dehydration (losing too much body fluid)',
    ],
    lessCommon: [
      'Fever',
      'Weight loss',
      'Symptoms that seem to get better and then get worse again before going away',
      'Severe or long-lasting diarrhea in people with weakened immune systems',
      'No symptoms at all (some people)',
    ],
    emergencyWarningSigns: [
      'Signs of serious dehydration: peeing very little or not at all, very dry mouth, or feeling dizzy or faint when standing',
      'In babies and young children: no wet diapers for many hours, crying with few or no tears, sunken eyes, or being unusually sleepy, limp, or fussy',
      'A fever of 100.4°F (38°C) or higher in a baby younger than 3 months',
      'Not able to keep any liquids down',
      'Confusion or being very hard to wake',
      'Severe belly pain, or bloody or black stools',
      'Ongoing heavy diarrhea in someone with a weakened immune system',
    ],
  },
  ageGroups: {
    infants: {
      risk: 'higher',
      summary:
        'Young children get Crypto more often than adults, and babies can become dehydrated quickly from watery diarrhea. Babies in diapers can also easily spread it in pools and child care.',
      actions: [
        'Keep breastfeeding or formula feeding during diarrhea.',
        'Call your baby’s health care provider if your baby has diarrhea, especially if drinking less than usual.',
        'Keep babies with diarrhea out of pools, splash pads, and lakes, and for 2 weeks after it stops.',
        'Change diapers in a changing area away from the water, and wash your hands with soap and water after.',
        'Use only safe, treated water for mixing formula.',
      ],
    },
    children: {
      risk: 'moderate',
      summary:
        'Children often catch Crypto at pools, splash pads, child care, and farm visits. Most recover in 1 to 2 weeks, but younger children can get dehydrated.',
      actions: [
        'Keep kids out of the water while sick with diarrhea and for 2 weeks after it stops.',
        'Teach kids not to swallow pool, splash pad, or lake water.',
        'Have kids wash hands with soap and water right after touching calves, goats, or other farm animals.',
        'Offer plenty of fluids, and use an oral rehydration solution (a drink made to replace fluids and salts) if your child is drinking poorly.',
        'Keep children home from child care while they have diarrhea.',
      ],
    },
    adults: {
      risk: 'lower',
      summary:
        'Most healthy adults recover without treatment in about 1 to 2 weeks. Farmers, veterinary workers, and people who care for calves have more chances to be exposed.',
      actions: [
        'Do not swim while sick with diarrhea or for 2 weeks after it stops.',
        'Wash your hands with soap and water after working with calves or other livestock. Hand sanitizer does not work well against Crypto.',
        'Drink plenty of fluids while sick.',
        'Ask your clinician about testing if watery diarrhea lasts more than a few days.',
      ],
    },
    'older-adults': {
      risk: 'lower',
      summary:
        'Most people in this age group recover fully. Ongoing health problems can make dehydration harder to handle.',
      actions: [
        'Drink plenty of fluids and watch for dizziness when standing.',
        'Wash your hands with soap and water after farm or animal contact.',
        'Ask your clinician about testing if watery diarrhea lasts more than a few days.',
        'Drink only pasteurized milk and cider.',
      ],
    },
    seniors: {
      risk: 'moderate',
      summary:
        'Older adults can become dehydrated more easily from watery diarrhea, and illness can be harder on the body. Early care helps.',
      actions: [
        'Call your clinician early if you have watery diarrhea that lasts more than a day or two.',
        'Sip fluids often, even if you are not thirsty.',
        'Ask whether any of your regular medicines should be paused while you are sick.',
        'Wash hands with soap and water after visiting farms or caring for grandchildren in diapers.',
      ],
    },
    pregnant: {
      risk: 'moderate',
      summary:
        'Pregnancy does not make Crypto more likely. But watery diarrhea can last 1 to 2 weeks, and dehydration during pregnancy needs prompt attention. Medicine choices are also more limited, so talk with your clinician before taking any medicine.',
      actions: [
        'Call your prenatal care provider if you have diarrhea that lasts more than a day or two.',
        'Drink plenty of fluids.',
        'Wash your hands with soap and water after animal contact and diaper changes.',
        'Drink only pasteurized milk and juice, and avoid untreated water.',
      ],
    },
    immunocompromised: {
      risk: 'highest',
      summary:
        'People with weakened immune systems, such as from advanced HIV, an organ transplant, or certain inherited immune disorders, can get severe, long-lasting diarrhea. It can be life-threatening. Medicine works less well in this group, so your care team will focus on your immune health.',
      actions: [
        'Contact your care team right away if you have watery diarrhea.',
        'If you have HIV, keep taking your HIV medicines as prescribed. A stronger immune system helps clear Crypto.',
        'Do not stop or lower transplant, cancer, or other immune-suppressing medicines on your own. Your care team may adjust them if needed.',
        'Avoid swallowing water from pools, lakes, and rivers. Ask your care team whether you should boil or filter your drinking water.',
        'Avoid contact with calves, lambs, and other young farm animals, or wear gloves and wash hands with soap and water after.',
      ],
    },
  },
  treatment: {
    summary:
      'Most healthy people recover without medicine in about 1 to 2 weeks. The most important thing is to drink plenty of fluids. A prescription medicine called nitazoxanide is FDA-approved to treat Crypto diarrhea in people 1 year and older. It is an antiparasitic medicine, not an antibiotic. Common antibiotics do not work against Crypto. For people with HIV, effective HIV treatment is the main way to clear the infection. Other people with weakened immune systems should follow their care team’s plan.',
    options: [
      {
        name: 'Fluids and oral rehydration',
        type: 'supportive',
        detail:
          'Drink plenty of fluids to replace what is lost through diarrhea. Oral rehydration solutions (drinks made to replace fluids and salts) help, especially for young children and older adults. Some people need IV fluids (fluids given through a vein).',
        who: 'Everyone with diarrhea.',
      },
      {
        name: 'Nitazoxanide (Alinia)',
        type: 'antiparasitic',
        detail:
          'A 3-day course taken by mouth, as a liquid or tablet. It can shorten illness in people with healthy immune systems. It has not been shown to work well in people with weakened immune systems.',
        who: 'People 1 year and older whose clinician recommends treatment.',
      },
      {
        name: 'Treating the immune problem',
        type: 'other',
        detail:
          'For people with HIV, effective HIV treatment that rebuilds the immune system is the most important step in clearing Crypto. For people who take transplant, cancer, or other immune-suppressing medicines, any change to those medicines should be made only by their care team.',
        who: 'People with weakened immune systems.',
      },
      {
        name: 'Anti-diarrhea medicines',
        type: 'supportive',
        detail:
          'Adults may be able to use anti-diarrhea medicine after checking with a health care provider. Do not give these medicines to children unless a health care provider tells you to.',
        who: 'Some adults, with a clinician’s OK.',
      },
    ],
    antibioticsHelp: 'no',
  },
  prevention: {
    vaccines: [],
    everyday: [
      'Wash your hands with soap and water after using the bathroom, changing diapers, and touching animals, and before eating. Alcohol-based hand sanitizers do not work well against Crypto.',
      'Do not swim, and keep children out of the water, while sick with diarrhea and for 2 weeks after diarrhea stops.',
      'Try not to swallow water from pools, splash pads, lakes, or rivers. Pool chlorine does not kill Crypto quickly.',
      'Take young children on frequent bathroom breaks, and change diapers in a changing area away from the water.',
      'Wash hands right after touching calves, goats, lambs, or their pens, especially at farms, fairs, and petting zoos.',
      'Drink only pasteurized milk, juice, and cider.',
      'Do not drink untreated water from lakes, rivers, or springs. Bring it to a rolling boil for 1 minute, or use a filter made to remove Crypto.',
    ],
  },
  testing:
    'Crypto is diagnosed with a stool (poop) test. Many labs do not check for Crypto unless a health care provider asks for it, so mention swimming, untreated water, or animal contact. More than one stool sample, collected on different days, may be needed. Stool panels that check for many germs at once (such as BioFire) include Crypto. There is no home test. Crypto is a reportable disease in Minnesota, so MDH may contact you to learn where you might have been exposed.',
  whenToSeekCare: [
    'Call your clinician if watery diarrhea lasts more than a few days. This matters most after swimming, drinking untreated water, or contact with calves or other farm animals.',
    'Call early if you are pregnant, are 65 or older, or are caring for a baby with diarrhea.',
    'If you have a weakened immune system, contact your care team as soon as watery diarrhea starts.',
    'Go to urgent care or an emergency department for signs of dehydration or if you can’t keep liquids down. Also go right away for bloody stools or severe belly pain.',
    'To report a suspected foodborne or waterborne illness in Minnesota, call the MDH Foodborne Illness Hotline at 1-877-FOOD-ILL (1-877-366-3455).',
  ],
  readingTheNumbers:
    'MN Pulse shows the BioFire detection rate: the percent of BioFire stool panel tests at participating Midwest labs (not just Minnesota) that found Crypto. These panels are mostly ordered for people with significant or lasting diarrhea, often at hospitals. So the number shows the share of tested people whose sample had Crypto. It does not count how many Minnesotans are infected, because most people with diarrhea are never tested. Crypto detections usually climb through summer and peak in late summer, then fall off in autumn. A sharp rise during swim season can mean outbreaks linked to pools, splash pads, or animal contact somewhere in the region. For you, a rising number is a reminder to stay out of the water when you have diarrhea, and for 2 weeks after. Avoid swallowing pool or lake water, and wash hands with soap and water after touching farm animals. Pool chlorine alone does not protect you from Crypto.',
  sources: [
    {
      label: 'MDH: Specific disease exclusion guidelines for child care and preschool',
      url: 'https://www.health.state.mn.us/diseases/foodborne/exclusions.html',
    },
    {
      label: 'MDH: Child care provider information on diarrheal illness',
      url: 'https://www.health.state.mn.us/diseases/foodborne/daycare.html',
    },
    {
      label: 'bioMérieux: BIOFIRE FILMARRAY Gastrointestinal Panel',
      url: 'https://www.biomerieux.com/corp/en/our-offer/clinical-products/biofire-filmarray-gastrointestinal-panel.html',
    },
  ],
  lastReviewed: '2026-10-07',
}

export default profile
