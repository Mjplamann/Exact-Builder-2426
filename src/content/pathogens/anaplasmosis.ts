import type { PathogenProfile } from '../types'

const profile: PathogenProfile = {
  id: 'anaplasmosis',
  name: 'Anaplasmosis (human granulocytic anaplasmosis)',
  shortName: 'Anaplasmosis',
  aka: [
    'Human granulocytic anaplasmosis (HGA)',
    'Anaplasma phagocytophilum',
    'Human granulocytic ehrlichiosis (HGE, older name)',
  ],
  category: 'vector-borne',
  kind: 'bacterium',
  oneLiner:
    'A bacterial infection spread by blacklegged (deer) ticks that causes sudden fever, headache, and body aches. Doxycycline treats it.',
  overview:
    'Anaplasmosis is an infection caused by Anaplasma phagocytophilum bacteria, which infect white blood cells. It spreads through the bite of an infected blacklegged (deer) tick, the same tick that spreads Lyme disease, and Minnesota is one of the states where it is most common. It is usually mild to moderate when treated quickly with the antibiotic doxycycline. It can become serious if treatment is delayed, especially for older adults and people with weakened immune systems.',
  seasonality: {
    summary:
      'Most Minnesota cases start in late spring and summer, when young blacklegged ticks (nymphs) are most active. Cases often peak in June and July. Some cases also happen in the fall, especially October and November, and in early spring, when adult ticks are active on days above freezing.',
    peakMonths: [6, 7],
  },
  transmission:
    'Anaplasmosis spreads through the bite of an infected blacklegged (deer) tick. These ticks live in wooded and brushy areas in much of Minnesota. The bacteria may pass from the tick to a person faster than Lyme bacteria do, possibly in less than a day, so check for ticks and remove them quickly. Many people do not remember being bitten. Rarely, anaplasmosis has spread through blood transfusions.',
  incubation: 'Symptoms usually start 1 to 2 weeks after the tick bite.',
  contagiousPeriod:
    'Anaplasmosis does not spread from person to person through touching, coughing, or sharing a home. In rare cases it has spread through a blood transfusion.',
  symptoms: {
    common: [
      'Fever and chills',
      'Severe headache',
      'Muscle aches',
      'Feeling very tired or unwell (malaise)',
      'Nausea, vomiting, diarrhea, or loss of appetite',
    ],
    lessCommon: [
      'Mild symptoms or none at all (some people)',
      'Rash (uncommon; a rash may mean another tick-borne infection, such as Lyme disease, is also present)',
      'Confusion',
      'Routine blood tests showing low white blood cell or platelet counts, or high liver enzymes',
    ],
    emergencyWarningSigns: [
      'Trouble breathing or shortness of breath',
      'Confusion, extreme sleepiness, or being very hard to wake',
      'Unusual bleeding or bruising, such as nosebleeds, bleeding gums, or blood in vomit or stool',
      'Fainting, or feeling dizzy or faint when standing',
      'Peeing much less than usual',
    ],
  },
  ageGroups: {
    infants: {
      risk: 'moderate',
      summary:
        'Anaplasmosis is rare in babies. Any fever in a young baby needs prompt attention. If anaplasmosis is suspected, doxycycline is the recommended treatment even for very young children.',
      actions: [
        'Call your baby’s health care provider right away for any fever in a baby younger than 3 months.',
        'Tell the provider about any tick bite or time in wooded areas, even if you did not see a tick.',
        'Do not use repellent on babies younger than 2 months. Use netting over strollers and carriers.',
        'Check your baby for ticks after time outdoors, including the scalp and skin folds.',
      ],
    },
    children: {
      risk: 'lower',
      summary:
        'Children can get anaplasmosis, but it is reported less often in children than in adults. Most children recover quickly with doxycycline. Short courses are safe at any age and do not stain teeth.',
      actions: [
        'Use an EPA-registered repellent and do tick checks after outdoor play.',
        'Call your clinician if your child has fever, headache, and body aches after a tick bite or time in the woods.',
        'If doxycycline is prescribed, give the full course. It is the right medicine for children of all ages.',
        'Call back if the fever is not better within 1 to 2 days of starting treatment.',
      ],
    },
    adults: {
      risk: 'lower',
      summary:
        'Healthy adults usually recover with prompt treatment. Delays in treatment raise the risk of serious illness, and many people do not remember a tick bite.',
      actions: [
        'Use repellent on skin and permethrin-treated clothing in wooded or brushy areas.',
        'Check your body for ticks every day you spend outdoors in tick areas.',
        'See a clinician for sudden fever, headache, and body aches from spring through fall, and mention any tick exposure.',
        'Take doxycycline exactly as prescribed and finish the full course.',
      ],
    },
    'older-adults': {
      risk: 'moderate',
      summary:
        'The risk of severe illness and hospital care goes up with age. Treatment works well when it starts early.',
      actions: [
        'Get care promptly for fever with headache and body aches after time outdoors in spring, summer, or fall.',
        'Tell your clinician about tick exposure even if you did not notice a bite.',
        'Use repellent and check for ticks after yard work, hunting, or hiking.',
        'Do not take doxycycline at the same time as antacids, iron, or calcium, which can keep it from working. Ask your pharmacist how to space them.',
      ],
    },
    seniors: {
      risk: 'higher',
      summary:
        'Adults 65 and older are more likely to need hospital care and to have complications such as breathing problems or bleeding. Starting doxycycline early lowers these risks.',
      actions: [
        'Call your clinician the same day for fever, chills, and body aches after possible tick exposure.',
        'Get emergency care for trouble breathing, confusion, or unusual bleeding.',
        'Check for ticks after gardening, walks, or time at the cabin or lake.',
        'Bring a list of all your medicines to your visit.',
      ],
    },
    pregnant: {
      risk: 'moderate',
      summary:
        'Anaplasmosis during pregnancy is uncommon, and information is limited. Doxycycline is still the treatment of choice for serious illness. For milder illness, a clinician may consider another antibiotic, rifampin.',
      actions: [
        'Call your prenatal care provider promptly for fever after a tick bite or time outdoors.',
        'Use an EPA-registered repellent. These are safe during pregnancy when used as directed.',
        'Do a tick check every day during tick season.',
        'Talk with your clinician about the benefits and risks of each treatment choice.',
      ],
    },
    immunocompromised: {
      risk: 'higher',
      summary:
        'People with weakened immune systems are more likely to have severe anaplasmosis and may take longer to recover. Early treatment is important.',
      actions: [
        'Contact your care team the same day for fever after possible tick exposure.',
        'Expect your clinician to start treatment before test results come back. This is standard care.',
        'Use repellent and permethrin-treated clothing, and check for ticks every day.',
        'Get emergency care for trouble breathing, confusion, or unusual bleeding.',
      ],
    },
  },
  treatment: {
    summary:
      'Doxycycline is the treatment of choice for anaplasmosis in adults and children of all ages. Clinicians start it as soon as anaplasmosis is suspected, without waiting for test results, because delays can lead to serious illness. Fever usually gets better within 1 to 2 days. If it does not, the diagnosis may need another look. Treatment usually lasts 1 to 2 weeks.',
    options: [
      {
        name: 'Doxycycline',
        type: 'antibiotic',
        detail:
          'Usually taken by mouth; very sick people may get it through a vein (IV). Start right away when anaplasmosis is suspected. Short courses are safe at any age, including young children. Take it with a full glass of water, stay upright for at least 30 minutes afterward, and protect your skin from the sun.',
        who: 'Adults and children of all ages. It is also used for serious illness during pregnancy.',
      },
      {
        name: 'Rifampin',
        type: 'antibiotic',
        detail:
          'An alternative for some people with mild illness who cannot take doxycycline, such as during pregnancy or with a serious doxycycline allergy. It does not treat Lyme disease, which can happen at the same time.',
        who: 'Selected people with mild illness, as decided by a clinician.',
      },
      {
        name: 'Rest, fluids, and fever relief',
        type: 'supportive',
        detail:
          'Rest, drink plenty of fluids, and use fever reducers such as acetaminophen as directed. Very sick people may need hospital care.',
        who: 'Everyone who is sick.',
      },
    ],
    antibioticsHelp: 'yes',
  },
  prevention: {
    vaccines: [],
    everyday: [
      'Use an EPA-registered repellent on skin, such as DEET, picaridin, IR3535, oil of lemon eucalyptus (OLE), PMD, or 2-undecanone. Follow the label.',
      'Treat clothing, boots, and gear with 0.5% permethrin, or buy pre-treated items. Do not put permethrin on skin.',
      'Walk in the center of trails. Avoid brushy areas, tall grass, and leaf litter.',
      'Check your whole body for ticks every day after time outdoors, and remove them right away with fine-tipped tweezers.',
      'Shower within 2 hours of coming indoors. Tumble dry clothes on high heat for 10 minutes to kill ticks.',
      'Check pets for ticks and ask your veterinarian about tick prevention.',
      'Antibiotics are not recommended after a tick bite to prevent anaplasmosis. Instead, watch for fever and other symptoms for a few weeks after a bite.',
    ],
  },
  testing:
    'Clinicians often suspect anaplasmosis from symptoms, tick exposure, and routine blood tests that show low white blood cell or platelet counts or high liver enzymes. The best test in the first week of illness is a PCR test on blood, which looks for the bacteria’s genetic material. Antibody tests are less helpful early; they usually need two blood samples taken 2 to 4 weeks apart. Sometimes a lab can see the bacteria inside white blood cells on a blood smear. Treatment should not wait for test results. There is no home test.',
  whenToSeekCare: [
    'Call your clinician the same day for fever, chills, severe headache, or body aches within a few weeks of a tick bite or time in tick areas from spring through fall.',
    'Mention tick exposure even if you never saw a tick. Many people do not remember a bite.',
    'Call back if your fever is not better within 1 to 2 days of starting doxycycline.',
    'Seek care early if you are 65 or older or have a weakened immune system. Do not wait to see if it passes.',
    'Go to an emergency department for trouble breathing, confusion, unusual bleeding, or fainting.',
  ],
  readingTheNumbers:
    'Anaplasmosis is tracked through cases that clinicians and labs report to the Minnesota Department of Health (MDH). These reports lag behind real time, often by weeks or more. Diagnosis needs a lab test, so counts depend on how often clinicians test, and they miss people with mild illness who are never tested. Long-term changes can reflect both real changes in tick activity and changes in testing. Anaplasmosis is not on the respiratory or stool BioFire panels, so there is no BioFire detection rate for it, and there is no test positivity measure like the ones used for flu or COVID-19. Counts usually climb in late spring, peak in early summer, and drop by late summer, with a smaller rise in the fall. For you, a rising count means infected ticks are active where people spend time outdoors. Use tick prevention, and seek care promptly for sudden fever after time outdoors.',
  watchNotes: [
    'October and November are adult tick season in Minnesota. Adult blacklegged ticks are active on days above freezing, so fall cases can still happen.',
    'The same tick can spread more than one germ. A person can have anaplasmosis together with Lyme disease or babesiosis. A rash is unusual with anaplasmosis alone and may point to Lyme disease as well.',
    'Doxycycline is recommended for children of all ages with suspected anaplasmosis. Short courses do not stain teeth.',
    'The single dose of doxycycline sometimes given after a tick bite to prevent Lyme disease is not meant to prevent anaplasmosis. Keep watching for fever after any tick bite.',
  ],
  sources: [
    { label: 'CDC: Anaplasmosis', url: 'https://www.cdc.gov/anaplasmosis/index.html' },
    { label: 'CDC: Ticks', url: 'https://www.cdc.gov/ticks/index.html' },
    {
      label:
        'CDC MMWR: Diagnosis and Management of Tickborne Rickettsial Diseases (2016 recommendations, includes anaplasmosis)',
      url: 'https://www.cdc.gov/mmwr/volumes/65/rr/rr6502a1.htm',
    },
    {
      label: 'Minnesota Department of Health: Anaplasmosis',
      url: 'https://www.health.state.mn.us/diseases/anaplasmosis/index.html',
    },
    {
      label: 'Minnesota Department of Health: Tickborne Diseases',
      url: 'https://www.health.state.mn.us/diseases/tickborne/index.html',
    },
  ],
  lastReviewed: '2026-10-07',
}

export default profile
