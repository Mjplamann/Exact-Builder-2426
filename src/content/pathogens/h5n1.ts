import type { PathogenProfile } from '../types'

const profile: PathogenProfile = {
  id: 'h5n1',
  name: 'H5N1 avian influenza (bird flu)',
  shortName: 'H5N1 bird flu',
  aka: ['bird flu', 'avian influenza', 'avian flu', 'highly pathogenic avian influenza (HPAI)', 'H5 flu'],
  category: 'zoonotic',
  kind: 'virus',
  oneLiner: 'A bird flu virus that infects wild birds, poultry, and dairy cattle. Risk to the public is low; farm workers face more risk.',
  overview:
    'H5N1 is a type of influenza A virus that mainly infects birds. The version spreading now (called clade 2.3.4.4b) has caused large outbreaks in wild birds and poultry, and since 2024 it has also spread in U.S. dairy cattle and infected some other mammals, including cats. Since 2024, a small number of people in the United States, mostly dairy and poultry workers, have caught H5N1. Most had mild illness, such as red, irritated eyes (pink eye), but some became very sick and at least one person died. It has not been found to spread easily from person to person, and health officials have rated the risk to the general public as low.',
  seasonality: {
    summary:
      'In Minnesota, bird flu outbreaks in poultry flocks tend to rise during spring and fall, when wild ducks, geese, and other birds migrate through the state and can carry the virus. Spring outbreaks often peak from March to May, and fall outbreaks from October to November. Detections in dairy cattle have not followed the same clear seasonal pattern. Risk to people depends on contact with infected animals, not on the time of year.',
    peakMonths: [3, 4, 5, 10, 11],
  },
  transmission:
    'Bird flu spreads mainly from infected animals to people. It can happen when virus gets into a person’s eyes, nose, or mouth, or is breathed in. This can happen after touching sick or dead birds or animals, their droppings, saliva, or milk, or surfaces and dust contaminated by them, and then touching your face. Many U.S. dairy workers who got sick are thought to have been infected by raw milk splashing into their eyes. Drinking raw (unpasteurized) milk from infected cows may also be a risk. Spread from one person to another has been very rare and has not continued from person to person.',
  incubation:
    'Symptoms usually start a few days after exposure, but sometimes take longer. Health officials watch exposed people for symptoms for 10 days after their last exposure.',
  contagiousPeriod:
    'Because H5N1 so rarely spreads between people, it is not clear how long an infected person can spread it. People who are being tested for, or have, bird flu are asked to stay home and away from others, wear a mask around other people, and follow public health advice until they are told they can return to normal activities.',
  symptoms: {
    common: [
      'Red, itchy, watery, or irritated eyes (pink eye, also called conjunctivitis)',
      'Fever or feeling feverish (not everyone has a fever)',
      'Cough',
      'Sore throat',
      'Runny or stuffy nose',
      'Muscle or body aches, headache, and tiredness',
    ],
    lessCommon: [
      'Shortness of breath or trouble breathing',
      'Nausea, vomiting, or diarrhea',
      'Pneumonia (a serious lung infection) that needs hospital care',
      'Seizures or changes in alertness (rare)',
    ],
    emergencyWarningSigns: [
      'Trouble breathing or shortness of breath, or fast breathing in a child',
      'Pain or pressure in the chest or belly that does not go away',
      'Bluish lips or face',
      'Confusion, constant dizziness, or being hard to wake up',
      'Seizures',
      'Not urinating (peeing), or signs of dehydration in a child such as no tears or a dry mouth',
      'Severe weakness or muscle pain',
      'Fever or cough that gets better but then comes back or gets worse',
    ],
  },
  ageGroups: {
    infants: {
      risk: 'higher',
      summary:
        'H5N1 infections in babies have been very rare in the United States. Babies are at higher risk of serious illness from any flu virus, so they should be kept away from possible sources of bird flu.',
      actions: [
        'Never give a baby raw (unpasteurized) milk.',
        'Keep babies away from backyard flocks, barns, and sick or dead birds or animals.',
        'If you work with poultry or dairy cattle, change clothes and shoes and wash your hands before holding your baby.',
        'If someone in your home works with animals and your baby gets a fever, cough, or red eyes, call your baby’s clinician and tell them about the animal contact.',
      ],
    },
    children: {
      risk: 'moderate',
      summary:
        'Bird flu infections in U.S. children have been rare. Children on farms, in 4-H, or around backyard flocks may have more contact with animals. Young children and kids with long-term health conditions have a higher risk of serious illness from flu.',
      actions: [
        'Teach children never to touch sick or dead birds or animals, and to tell an adult if they find one.',
        'Have children wash their hands with soap and water after touching animals, visiting barns, or working with a flock.',
        'Do not give children raw milk or raw-milk products.',
        'Teens who work with poultry or dairy cattle should wear the same protective gear adult workers use.',
      ],
    },
    adults: {
      risk: 'lower',
      summary:
        'Most U.S. cases have been in adults who work with dairy cattle or poultry, and most had mild illness. Your chance of getting bird flu depends mainly on contact with infected animals. People with no animal contact have a very low risk.',
      actions: [
        'If you work with poultry, dairy cattle, or their milk, wear protective gear: safety goggles or a face shield, an N95 respirator, gloves, boots, and coveralls.',
        'Watch for eye redness, fever, or cough for 10 days after working with infected or possibly infected animals, and call your clinician or public health right away if symptoms start.',
        'Do not drink raw milk or eat raw-milk cheese.',
        'If you hunt ducks or geese, wear gloves when cleaning birds, do not eat or drink while handling them, and cook game to 165°F.',
        'Get a yearly seasonal flu vaccine, especially if you work with animals.',
      ],
    },
    'older-adults': {
      risk: 'moderate',
      summary:
        'Bird flu risk depends mainly on contact with infected animals. If you are infected, the risk of serious flu illness goes up with age and with conditions such as heart disease, lung disease, and diabetes.',
      actions: [
        'Avoid touching sick or dead birds or animals. Wear gloves and a mask if you must handle them.',
        'If you keep a backyard flock, watch your birds closely and report sudden deaths or illness to the Minnesota Board of Animal Health.',
        'Choose pasteurized milk and cook poultry and eggs well.',
        'Call your clinician right away if you get flu symptoms or red eyes after animal contact.',
      ],
    },
    seniors: {
      risk: 'higher',
      summary:
        'Few older adults have had bird flu in the United States, but people 65 and older have the highest risk of serious illness and death from flu in general. Avoiding sources of the virus is the best protection.',
      actions: [
        'Avoid sick or dead birds, and keep away from barns and flocks during outbreaks.',
        'Do not drink raw milk or eat raw-milk products.',
        'Cook poultry and eggs until the yolks and whites are firm and poultry reaches 165°F.',
        'Call your clinician right away about flu symptoms or red eyes after any animal contact. Antiviral medicine works best when started early.',
      ],
    },
    pregnant: {
      risk: 'higher',
      summary:
        'Pregnancy raises the risk of serious illness from flu viruses. Bird flu in pregnancy has been rare, but pregnant people should take extra care to avoid infected animals and raw milk.',
      actions: [
        'Do not drink raw milk or eat raw-milk cheese. It can carry bird flu and other germs that are harmful in pregnancy.',
        'If possible, avoid working with sick animals or in barns or poultry houses during outbreaks. Talk with your employer and clinician about your risk.',
        'Call your clinician right away if you get fever, cough, or red eyes after animal contact. Oseltamivir is the preferred flu antiviral during pregnancy.',
        'Get your yearly seasonal flu shot, which is recommended during pregnancy.',
      ],
    },
    immunocompromised: {
      risk: 'higher',
      summary:
        'A weakened immune system raises the risk of serious illness from flu viruses, and you may stay sick longer. Avoiding contact with infected animals is especially important.',
      actions: [
        'Avoid handling sick or dead birds or animals, and stay away from barns and flocks during outbreaks.',
        'Do not drink raw milk or feed raw milk or raw pet food to your pets.',
        'Make a plan with your care team for quick testing and antiviral treatment if you are exposed or get symptoms.',
        'Get a yearly seasonal flu shot. It does not prevent bird flu, but it protects against seasonal flu.',
      ],
    },
  },
  treatment: {
    summary:
      'Bird flu is treated with flu antiviral medicine. CDC recommends starting oseltamivir (Tamiflu) as soon as possible for anyone with suspected or confirmed bird flu, whether the illness is mild or severe, and even if more than 2 days have passed since symptoms began. Treatment should not wait for test results. People who had a high-risk exposure may also be offered antiviral medicine to help prevent illness.',
    options: [
      {
        name: 'Oseltamivir (Tamiflu and generics)',
        type: 'antiviral',
        detail:
          'A pill or liquid taken by mouth. It can be used at any age, including for babies, and it is the preferred choice during pregnancy. Public health officials may also offer it to people who had close, unprotected contact with infected animals or with a person who has bird flu, to lower the chance of getting sick. The most common side effects are nausea and vomiting; taking it with food can help.',
        who: 'Anyone with suspected or confirmed bird flu, and some people after a high-risk exposure.',
      },
      {
        name: 'Rest, fluids, and fever relievers',
        type: 'supportive',
        detail:
          'Rest and drink plenty of fluids. Over-the-counter fever and pain medicine can ease symptoms; follow the label and ask your clinician what is right for you. Do not give aspirin to children or teens. Stay home and away from others while you are sick, as public health officials advise.',
        who: 'People with mild illness, along with antiviral medicine.',
      },
      {
        name: 'Hospital care',
        type: 'supportive',
        detail: 'People with pneumonia or trouble breathing may need oxygen, breathing support, and other care in the hospital, along with antiviral medicine.',
        who: 'People with severe illness.',
      },
    ],
    antibioticsHelp: 'no',
  },
  prevention: {
    vaccines: [
      {
        name: 'Seasonal flu vaccine (does not prevent bird flu)',
        who: 'Recommended every year for everyone 6 months and older. Health officials especially encourage it for people who work with poultry, dairy cattle, or pigs.',
        notes:
          'Seasonal flu vaccine does not protect against H5N1. For farm workers, it lowers the chance of being infected with seasonal flu and bird flu at the same time, which could let the two viruses mix into a new virus.',
      },
      {
        name: 'H5 bird flu vaccines',
        who: 'Not available to the general public.',
        notes:
          'FDA has licensed some H5N1 vaccines for adults, and the federal government keeps a supply of H5 vaccine for use if it is ever needed. They are not part of routine vaccine schedules.',
      },
    ],
    everyday: [
      'Do not touch sick or dead birds or other wild animals with bare hands. If you must, wear gloves and a mask, and wash your hands with soap and water afterward.',
      'Report sick or dead poultry in a backyard flock to the Minnesota Board of Animal Health. Report groups of dead wild birds to the Minnesota Department of Natural Resources (DNR).',
      'Do not drink raw (unpasteurized) milk or eat products made from it. Pasteurized milk and dairy products are safe.',
      'Cook poultry, eggs, and wild game to an internal temperature of 165°F. Cook eggs until the yolks and whites are firm.',
      'Keep cats indoors, and do not feed pets raw milk or raw pet food. Cats can get very sick from bird flu.',
      'If you work with poultry or dairy cattle, wear protective gear (goggles or a face shield, an N95 respirator, gloves, boots, and coveralls), and change clothes and wash up before going home.',
    ],
  },
  testing:
    'Bird flu needs special testing. A clinician collects a swab from the nose or throat, and from the eye if the eyes are red. Public health labs, such as the Minnesota Department of Health lab, can confirm H5N1. Regular rapid flu tests and many clinic tests can show influenza A, but they cannot tell bird flu apart from seasonal flu. If you have flu symptoms or red eyes after contact with sick or dead birds, infected animals, or raw milk, tell your clinician about the exposure so the right test is ordered. Call ahead before you go in so the clinic can protect others.',
  whenToSeekCare: [
    'If you get red eyes, fever, cough, or other flu symptoms within 10 days of contact with sick or dead birds, infected animals, or raw milk, call your clinician or public health right away. Do not wait to see if it goes away.',
    'Tell the clinic about your animal or raw milk contact when you call, and wear a mask when you go in.',
    'If you have no animal contact and have flu symptoms, the cause is almost always a common virus such as seasonal flu or COVID-19. Follow your usual flu care steps.',
    'Call 911 or go to the emergency department for trouble breathing, chest pain, confusion, seizures, or other emergency warning signs.',
  ],
  readingTheNumbers:
    'The flu numbers on this dashboard, such as flu test positivity, the BioFire detection rate for influenza A, and the percent of emergency department visits for flu, are almost entirely seasonal flu. Routine tests report influenza A without telling H5N1 apart, so these numbers do not measure bird flu. Bird flu is tracked in other ways: confirmed human cases (rare, and confirmed by public health labs), outbreaks in poultry flocks and dairy herds, and testing of wastewater (sewage) for the H5 virus. An H5 detection in wastewater does not always mean people are infected, because milk, dairy plant waste, or wild bird droppings can carry the virus into sewers. A rise in poultry outbreaks is common during spring and fall bird migration. When outbreaks rise, farm workers, backyard flock owners, and hunters should take extra care. For most people, the risk stays low. Health officials watch most closely for any sign that the virus is spreading from person to person.',
  watchNotes: [
    'Minnesota has had repeated bird flu outbreaks in commercial turkey, chicken, and backyard flocks since 2022, mostly during spring and fall migration. Fall outbreaks often pick up in October and November. The Minnesota Board of Animal Health posts current detections.',
    'H5N1 was first found in Minnesota livestock in 2024, part of a national outbreak in dairy cattle that began that year.',
    'Health officials have rated the risk to the general public as low. People who work with poultry or dairy cattle, people with backyard flocks, and people who drink raw milk have a higher risk.',
    'Seasonal flu vaccine does not protect against bird flu, but it is still recommended, especially for farm workers.',
  ],
  sources: [],
  lastReviewed: '2026-10-07',
}

export default profile
