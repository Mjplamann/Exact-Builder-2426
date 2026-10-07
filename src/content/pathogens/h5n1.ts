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
    'H5N1 is a type of influenza A (bird flu) virus that has caused large outbreaks in wild birds and poultry, and since 2024 in U.S. dairy cattle. Since then, a small number of people in the United States have caught H5 bird flu, mostly dairy and poultry workers. Most had mild illness, such as red, irritated eyes (pink eye), but a few became very sick and two people died. No person-to-person spread has been found in the United States, and CDC rates the risk to the general public as low.',
  seasonality: {
    summary:
      'In Minnesota, bird flu outbreaks in poultry flocks tend to rise in spring and fall. That is when wild ducks, geese, and other birds migrate through the state and can carry the virus. Spring outbreaks most often come from March to May. Fall outbreaks most often come from September to November, and sometimes continue into winter. Detections in dairy cattle have not followed a clear seasonal pattern. Risk to people depends on contact with infected animals, not on the time of year.',
    peakMonths: [3, 4, 5, 9, 10, 11],
  },
  transmission:
    'Bird flu spreads mainly from infected animals to people. It can happen when virus gets into a person’s eyes, nose, or mouth, or is breathed in. This can happen after touching sick or dead birds or animals, or their droppings, saliva, or milk, and then touching your face. Contaminated surfaces and dust can also carry the virus. Many U.S. dairy workers who got sick are thought to have been infected by raw milk splashing into their eyes. Drinking raw (unpasteurized) milk from infected cows may also be a risk. Limited spread between people has happened rarely in other countries, but it did not continue, and none has been found in the United States.',
  incubation:
    'Symptoms usually start 2 to 5 days after exposure. The World Health Organization says it can sometimes take longer, up to about 17 days. Health officials watch exposed people for symptoms for 10 days after their last exposure.',
  contagiousPeriod:
    'Because H5N1 so rarely spreads between people, it is not clear how long an infected person can spread it. If you are being tested for bird flu, or have it, stay home and away from others. Wear a mask around people. Follow public health advice until you are told you can go back to normal activities.',
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
      'Trouble breathing or shortness of breath',
      'Children: fast breathing, or ribs pulling in with each breath',
      'Pain or pressure in the chest or belly that does not go away',
      'Bluish lips or face',
      'Confusion, constant dizziness, or being hard to wake up',
      'Children: not alert or not interacting when awake',
      'Seizures',
      'Not urinating (peeing), or signs of dehydration in a child such as no tears or a dry mouth',
      'Severe weakness, unsteadiness, or severe muscle pain',
      'Children: fever above 104°F, or any fever in a baby younger than 12 weeks',
      'Fever or cough that gets better but then comes back or gets worse',
      'A long-term medical condition that gets much worse',
    ],
  },
  ageGroups: {
    infants: {
      risk: 'higher',
      summary:
        'H5N1 infections in babies have been very rare in the United States. Human bird flu data are limited, so this rating reflects that babies are at higher risk of serious illness from flu viruses in general. Keep babies away from possible sources of bird flu.',
      actions: [
        'Never give a baby raw (unpasteurized) milk.',
        'Keep babies away from backyard flocks, barns, and sick or dead birds or animals.',
        'If you work with poultry or dairy cattle, change clothes and shoes and wash your hands before holding your baby.',
        'If someone in your home works with animals and your baby gets a fever, cough, or red eyes, call your baby’s clinician. Tell them about the animal contact.',
      ],
    },
    children: {
      risk: 'higher',
      summary:
        'Bird flu infections in U.S. children have been rare. But in other countries, some children with bird flu have become severely ill or died. Children on farms, in 4-H, or around backyard flocks may have more contact with infected animals.',
      actions: [
        'Teach children never to touch sick or dead birds or animals, and to tell an adult if they find one.',
        'Have children wash their hands with soap and water after touching animals, visiting barns, or working with a flock.',
        'Do not give children raw milk or raw-milk products.',
        'Teens who work with poultry or dairy cattle should wear the same protective gear adult workers use.',
        'Call your child’s clinician right away about fever, cough, or red eyes after contact with sick animals or raw milk.',
      ],
    },
    adults: {
      risk: 'lower',
      summary:
        'Most U.S. cases have been in adults who work with dairy cattle or poultry, and most had mild illness. Your chance of getting bird flu depends mainly on contact with infected animals; people with no animal contact have a very low risk. Human bird flu data are limited, so this rating is based mostly on seasonal flu.',
      actions: [
        'If you work with poultry, dairy cattle, or their milk, wear protective gear. This includes goggles or a face shield, an N95 respirator, gloves, boots, and coveralls.',
        'Watch for eye redness, fever, or cough for 10 days after working with infected or possibly infected animals. Call your clinician or public health right away if symptoms start.',
        'Do not drink raw milk or eat raw-milk cheese.',
        'If you hunt ducks or geese, wear gloves when cleaning birds, do not eat or drink while handling them, and cook game birds to 165°F.',
        'Get a yearly seasonal flu vaccine, especially if you work with animals.',
      ],
    },
    'older-adults': {
      risk: 'moderate',
      summary:
        'Bird flu risk depends mainly on contact with infected animals. If you are infected, the risk of serious flu illness goes up with age and with conditions such as heart disease, lung disease, and diabetes.',
      actions: [
        'Avoid touching sick or dead birds or animals. If you must, wear gloves, a well-fitting mask (an N95 if you have one), and eye protection such as goggles.',
        'If you keep a backyard flock, watch your birds closely. Report sudden deaths or illness to the Minnesota Board of Animal Health.',
        'Choose pasteurized milk, and cook poultry and eggs well.',
        'Call your clinician right away if you get flu symptoms or red eyes after animal contact.',
      ],
    },
    seniors: {
      risk: 'higher',
      summary:
        'Few people 65 and older in the United States have had bird flu, but the first U.S. death, in early 2025, was a person over 65 who kept a backyard flock. People 65 and older have the highest risk of serious illness and death from flu in general. Avoiding sources of the virus is the best protection.',
      actions: [
        'Avoid sick or dead birds, and keep away from barns and flocks during outbreaks.',
        'If you keep a backyard flock, wear gloves, a mask, and eye protection when handling sick or dead birds. Report them to the Minnesota Board of Animal Health.',
        'Do not drink raw milk or eat raw-milk products.',
        'Cook eggs until the yolks and whites are firm, and cook poultry to 165°F.',
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
        'Get a seasonal flu shot. CDC and ACOG (the American College of Obstetricians and Gynecologists) recommend it during pregnancy. It does not prevent bird flu.',
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
      'Bird flu is treated with flu antiviral medicine. CDC recommends starting oseltamivir (Tamiflu) as soon as possible for anyone with suspected or confirmed bird flu. This applies whether the illness is mild or severe, and even if more than 2 days have passed since symptoms began. Treatment should not wait for test results. People who had a high-risk exposure may also be offered antiviral medicine to help prevent illness.',
    options: [
      {
        name: 'Oseltamivir (Tamiflu and generics)',
        type: 'antiviral',
        detail:
          'A pill or liquid taken by mouth. For treatment, it can be used at any age, including newborns, and it is the preferred choice during pregnancy. Public health officials may also offer it to some people after close, unprotected contact with infected animals or a person with bird flu. This can lower the chance of getting sick. Your clinician will decide if this is right for a young child. The most common side effects are nausea and vomiting; taking it with food can help.',
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
        who: 'CDC recommends a yearly flu vaccine for everyone 6 months and older. The American Academy of Pediatrics also recommends it for all children 6 months and older. Health officials especially encourage it for people who work with poultry, dairy cattle, or pigs.',
        notes:
          'Seasonal flu vaccine does not protect against H5N1. For farm workers, it lowers the chance of getting seasonal flu and bird flu at the same time. That matters because the two viruses could mix into a new virus. See the Influenza profile for more about flu vaccines.',
      },
      {
        name: 'H5 bird flu vaccines',
        who: 'Not available to the general public.',
        notes:
          'FDA has licensed a few H5N1 vaccines, and the federal government keeps a stockpile of H5 vaccine for use if it is ever needed. They are not offered to the public and are not part of routine vaccine schedules.',
      },
    ],
    everyday: [
      'Do not touch sick or dead birds or other wild animals with bare hands. If you must, wear gloves, a well-fitting mask (an N95 if you have one), and eye protection such as goggles. Wash your hands with soap and water afterward.',
      'Report sick or dead poultry in a backyard flock to the Minnesota Board of Animal Health. Report groups of dead wild birds to the Minnesota Department of Natural Resources (DNR).',
      'Do not drink raw (unpasteurized) milk or eat products made from it. Pasteurized milk and dairy products are safe.',
      'Cook poultry and wild game birds, such as ducks and geese, to 165°F. Cook eggs until the yolks and whites are firm, and cook egg dishes to 160°F.',
      'Keep cats indoors, and do not feed pets raw milk or raw pet food. Cats can get very sick from bird flu.',
      'If you work with poultry or dairy cattle, wear protective gear: goggles or a face shield, an N95 respirator, gloves, boots, and coveralls. Change clothes and wash up before going home.',
    ],
  },
  testing:
    'Bird flu needs special testing. A clinician collects a swab from the nose or throat, and from the eye if the eyes are red. Public health labs, such as the Minnesota Department of Health lab, can test for H5 bird flu, and CDC confirms positive results. Rapid flu tests and many clinic tests can show influenza A, but they cannot tell bird flu apart from seasonal flu. If you have flu symptoms or red eyes after contact with sick or dead birds, infected animals, or raw milk, tell your clinician. That way the right test can be ordered. Call ahead before you go in so the clinic can protect others.',
  whenToSeekCare: [
    'Did you have contact with sick or dead birds, infected animals, or raw milk in the last 10 days? If you then get red eyes, fever, cough, or other flu symptoms, call your clinician or public health right away. Do not wait to see if it goes away.',
    'Tell the clinic about your animal or raw milk contact when you call, and wear a mask when you go in.',
    'If you have no animal contact and have flu symptoms, the cause is almost always a common virus such as seasonal flu or COVID-19. Follow your usual flu care steps.',
    'Call 911 or go to the emergency department for trouble breathing, chest pain, confusion, seizures, or other emergency warning signs.',
  ],
  readingTheNumbers:
    'The flu numbers on this dashboard are almost entirely seasonal flu. These include flu test positivity, the BioFire detection rate for influenza A, and the percent of emergency department visits for flu. Routine tests report influenza A without telling H5N1 apart, so these numbers do not measure bird flu. Some panels, such as BioFire, also sort flu A into seasonal types. A flu A result that does not match a seasonal type can be sent to the public health lab for extra testing. That is one way bird flu could be caught. Bird flu is tracked in other ways. These include rare human cases confirmed by CDC, outbreaks in poultry flocks and dairy herds, and wastewater (sewage) testing for H5 viruses. An H5 detection in wastewater does not always mean people are infected. Milk, dairy plant waste, or wild bird droppings can carry the virus into sewers. A rise in poultry outbreaks is common during spring and fall bird migration. When outbreaks rise, farm workers, backyard flock owners, and hunters should take extra care. For most people, the risk stays low. Health officials watch most closely for any sign that the virus is spreading from person to person.',
  watchNotes: [
    'As of early October 2026, bird flu has returned early to Minnesota poultry this fall. Since September 1, outbreaks have hit several flocks, mostly commercial farms, starting with a turkey flock in Wright County. The Minnesota Board of Animal Health posts current detections.',
    'In March 2024, H5N1 was found in young goats on a Stevens County farm with infected poultry, the first U.S. detection in goats or cattle. Minnesota dairy herds were affected starting in June 2024, as part of a national outbreak in dairy cattle. No Minnesota dairy herds have been listed as affected since August 2025, and milk testing continues.',
    'In July 2025, CDC ended its emergency response for bird flu. It now updates human case counts monthly, and USDA reports detections in animals. CDC continues to rate the risk to the general public as low. Farm workers, backyard flock owners, and people who drink raw milk have a higher risk.',
    'In November 2025, Washington State reported the first known human case of a related bird flu virus, H5N5. The person was an older adult with a backyard flock and died. The same prevention steps apply.',
  ],
  sources: [
    { label: 'CDC — H5 bird flu: current situation', url: 'https://www.cdc.gov/bird-flu/situation-summary/index.html' },
    { label: 'CDC — H5 wastewater data', url: 'https://www.cdc.gov/nwss/rv/wwd-h5.html' },
    {
      label: 'Minnesota Department of Health — Current influenza situation (including novel flu)',
      url: 'https://www.health.state.mn.us/diseases/flu/current/current.html',
    },
    { label: 'Minnesota Board of Animal Health — H5N1 avian influenza', url: 'https://bah.state.mn.us/h5n1' },
    {
      label: 'Minnesota Department of Agriculture — H5N1 avian influenza in dairy cattle',
      url: 'https://www.mda.state.mn.us/business-dev-loans-grants/h5n1-avian-influenza-dairy-cattle',
    },
    {
      label: 'USDA APHIS — Confirmed HPAI detections in commercial and backyard flocks',
      url: 'https://www.aphis.usda.gov/livestock-poultry-disease/avian/avian-influenza/hpai-detections/commercial-backyard-flocks',
    },
    {
      label: 'CDC — Interim clinical considerations for seasonal influenza vaccines',
      url: 'https://www.cdc.gov/flu/hcp/vax-summary/seasonal-influenza-vaccines.html',
    },
    {
      label: 'HealthyChildren.org (AAP) — Flu prevention and treatment recommendations for 2026–27',
      url: 'https://www.healthychildren.org/English/news/Pages/aap-(influenza)-flu-prevention-recommendations-for-2026-27.aspx',
    },
  ],
  lastReviewed: '2026-10-07',
}

export default profile
