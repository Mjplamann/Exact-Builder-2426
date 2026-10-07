import type { PathogenProfile } from '../types'

const profile: PathogenProfile = {
  id: 'cyclospora',
  name: 'Cyclospora (cyclosporiasis)',
  shortName: 'Cyclospora',
  aka: ['Cyclosporiasis', 'Cyclospora cayetanensis'],
  category: 'gastrointestinal',
  kind: 'parasite',
  biofireTargets: ['Cyclospora cayetanensis'],
  oneLiner:
    'A parasite spread by contaminated fresh produce that causes long-lasting watery diarrhea, mostly in late spring and summer.',
  overview:
    'Cyclospora cayetanensis is a tiny parasite that causes an intestinal illness called cyclosporiasis. In the United States, most cases come from eating fresh produce, such as lettuce, herbs, or berries, that was contaminated with stool. Without treatment, the illness can last from a few days to a month or longer, and it can come back after it seems gone. A prescription antibiotic treats it.',
  seasonality: {
    summary:
      'In Minnesota and across the U.S., most cases picked up at home (not during travel) happen from late spring through summer. CDC closely tracks cases picked up in the U.S. each spring and summer, and cases usually peak in June and July. Cases at other times of year are more often linked to travel outside the U.S.',
    peakMonths: [6, 7],
  },
  transmission:
    'People get sick by eating food or drinking water that was contaminated with stool carrying the parasite. In the U.S., outbreaks are usually linked to fresh produce that is eaten raw, such as lettuce, salad mixes, fresh herbs, and berries. Cyclospora does not spread directly from person to person. The parasites passed in stool are not yet able to infect anyone. They need days to weeks in the environment first. Travel to places where Cyclospora is common also raises your risk.',
  incubation:
    'About 1 week on average after eating contaminated food. The range is about 2 days to 2 weeks or more.',
  contagiousPeriod:
    'Cyclospora is not spread directly from one person to another, so a sick person is not considered contagious in the usual sense. Parasites in stool need days to weeks outside the body before they can infect someone. Washing hands well after using the bathroom and before handling food is still important.',
  symptoms: {
    common: [
      'Watery diarrhea, often frequent and sometimes explosive',
      'Loss of appetite and weight loss',
      'Stomach cramps, bloating, and more gas than usual',
      'Nausea (upset stomach)',
      'Tiredness (fatigue)',
    ],
    lessCommon: [
      'Vomiting',
      'Low-grade fever',
      'Diarrhea that goes away and then comes back (relapse)',
      'Tiredness that lingers after the diarrhea ends',
      'No symptoms at all (some people)',
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
        'Cyclospora is uncommon in babies, who rarely eat raw produce. But any baby with diarrhea can become dehydrated (lose too much body fluid) quickly. The usual antibiotic is not used in babies younger than 2 months.',
      actions: [
        'Keep breastfeeding or formula feeding during diarrhea.',
        'Ask your clinician about an oral rehydration solution (a drink made to replace fluids and salts).',
        'Call your baby’s health care provider if your baby has diarrhea, especially a young baby or one who is drinking less than usual.',
        'Wash your hands well before making bottles or food.',
      ],
    },
    children: {
      risk: 'lower',
      summary:
        'Most children recover, especially with treatment. Younger children can get dehydrated faster than older kids and adults.',
      actions: [
        'Offer plenty of fluids; use an oral rehydration solution if your child is drinking poorly.',
        'Rinse fresh fruits and vegetables before serving.',
        'Call your clinician if watery diarrhea lasts more than a few days.',
        'Teach kids to wash hands with soap and water before eating.',
      ],
    },
    adults: {
      risk: 'lower',
      summary:
        'Healthy adults usually are not seriously ill, but diarrhea and tiredness can drag on for weeks without treatment. Treatment helps you feel better sooner.',
      actions: [
        'If watery diarrhea lasts more than a few days, ask your clinician whether to test for Cyclospora.',
        'Tell your clinician what fresh produce you ate and any recent travel.',
        'Drink plenty of fluids.',
        'Check for food recalls and throw out recalled items.',
      ],
    },
    'older-adults': {
      risk: 'lower',
      summary:
        'Most people in this age group recover fully, especially with treatment. Ongoing health problems can make dehydration harder to handle.',
      actions: [
        'Drink plenty of fluids and watch for dizziness when standing.',
        'Ask your clinician about testing if diarrhea lasts more than a few days.',
        'Tell your clinician about a sulfa allergy before starting treatment.',
        'Check for food recalls during summer outbreaks.',
      ],
    },
    seniors: {
      risk: 'moderate',
      summary:
        'Older adults can become dehydrated more easily, and long-lasting diarrhea can be harder on the body. Getting tested and treated early helps.',
      actions: [
        'Call your clinician early if you have watery diarrhea that lasts more than a day or two.',
        'Sip fluids often, even if you are not thirsty.',
        'Ask whether any of your regular medicines should be paused while you are sick.',
        'Get care right away for confusion, fainting, or very little urine.',
      ],
    },
    pregnant: {
      risk: 'moderate',
      summary:
        'Pregnancy does not make Cyclospora more likely. But long-lasting diarrhea and dehydration during pregnancy need attention. Your clinician will weigh the benefits and risks of the usual antibiotic during pregnancy.',
      actions: [
        'Call your prenatal care provider if you have diarrhea that lasts more than a day or two.',
        'Drink plenty of fluids.',
        'Do not start or stop any medicine without talking to your clinician.',
        'Rinse fresh produce well, and follow recall notices.',
      ],
    },
    immunocompromised: {
      risk: 'higher',
      summary:
        'People with weakened immune systems, such as from advanced HIV, may have longer and more severe illness. They may need a longer course of treatment, and sometimes ongoing medicine to keep it from coming back.',
      actions: [
        'Contact your care team early if you have watery diarrhea.',
        'Ask your clinician whether you need a longer treatment course or follow-up.',
        'Be extra careful with raw produce during summer outbreaks and when traveling.',
        'Watch closely for signs of dehydration.',
      ],
    },
  },
  treatment: {
    summary:
      'Cyclosporiasis is treated with a prescription antibiotic called trimethoprim-sulfamethoxazole (TMP-SMX, also known by brand names such as Bactrim). Treatment usually lasts 7 to 10 days. Drinking plenty of fluids is also important. Without treatment, illness can last a month or longer and can come back.',
    options: [
      {
        name: 'Trimethoprim-sulfamethoxazole (TMP-SMX, Bactrim)',
        type: 'antibiotic',
        detail:
          'The standard treatment, taken by mouth for about 7 to 10 days. People with weakened immune systems may need a longer course. It contains a sulfa drug, so tell your clinician about any sulfa allergy. It is not used in babies younger than 2 months. During pregnancy, your clinician will weigh the benefits and risks.',
        who: 'Most people diagnosed with cyclosporiasis.',
      },
      {
        name: 'Other antibiotics (when TMP-SMX can’t be used)',
        type: 'antibiotic',
        detail:
          'No equally effective option has been found. For people who can’t take TMP-SMX, a clinician may consider other medicines, such as ciprofloxacin, which tend to work less well.',
        who: 'People with a sulfa allergy or who cannot take TMP-SMX.',
      },
      {
        name: 'Fluids and rest',
        type: 'supportive',
        detail:
          'Drink plenty of fluids to replace what is lost through diarrhea. Oral rehydration solutions help, especially for children and older adults.',
        who: 'Everyone with diarrhea.',
      },
    ],
    antibioticsHelp: 'yes',
  },
  prevention: {
    vaccines: [],
    everyday: [
      'Wash your hands with soap and water before preparing food and after using the bathroom.',
      'Rinse fresh fruits and vegetables under running water before eating, cutting, or cooking. Washing helps but may not remove all Cyclospora.',
      'Do not wash produce with soap or bleach.',
      'Cooking produce kills Cyclospora. Raw produce carries more risk during outbreaks.',
      'Follow food recall notices and throw away recalled products.',
      'When traveling to places where Cyclospora is common, be careful with raw produce and untreated water.',
    ],
  },
  testing:
    'Cyclospora is diagnosed with a stool (poop) test. Many labs do not look for Cyclospora unless a health care provider asks for it specifically, so mention fresh produce or travel. Some labs use stool panels that check for many germs at once (such as BioFire), and these include Cyclospora. More than one stool sample, collected on different days, may be needed. There is no home test.',
  whenToSeekCare: [
    'Call your clinician if watery diarrhea lasts more than a few days. Ask about Cyclospora testing if you ate fresh produce during summer or traveled recently.',
    'Call if diarrhea comes back after you started to feel better.',
    'Call early if you are pregnant, are 65 or older, have a weakened immune system, or are caring for a baby with diarrhea.',
    'Go to urgent care or an emergency department for signs of dehydration or if you can’t keep liquids down. Also go right away for bloody stools or severe belly pain.',
    'To report a suspected foodborne illness in Minnesota, call the MDH Foodborne Illness Hotline at 1-877-FOOD-ILL (1-877-366-3455).',
  ],
  readingTheNumbers:
    'MN Pulse does not have a current weekly number for Cyclospora in Minnesota. CDC’s weekly tables of reported diseases leave Minnesota’s Cyclospora counts blank during the year, because Minnesota appears to send them to CDC after the year ends, so a blank does not mean zero. MDH’s yearly reports are the best guide to Minnesota totals. When available, MN Pulse can also show a BioFire detection rate: the percent of BioFire stool panel tests at participating Midwest labs (not just Minnesota) that found Cyclospora. These panels are mostly ordered for people with significant or lasting diarrhea, often at hospitals. So that rate shows the share of tested people whose sample had Cyclospora. It does not count how many Minnesotans are infected, because most people with diarrhea are never tested. Cyclospora detections are usually low outside late spring and summer. A rise from May through August is expected each year. A rise that is much larger or earlier than usual can mean an outbreak. That happened in 2026, when CDC received many more reports of U.S.-acquired cases than in 2025. A large multistate outbreak linked to iceberg lettuce was part of that rise. For you, a rising number means pay attention to recall news. Ask about testing if you have watery diarrhea that lasts more than a few days. MDH case counts take weeks to be reported and confirmed, so lab-panel signals often move first.',
  watchNotes: [
    'The 2026 Cyclospora season was unusually large nationwide. CDC received far more reports of U.S.-acquired cases than in 2025.',
    'CDC and FDA linked a large multistate outbreak to iceberg lettuce from Taylor Farms de Mexico, which was recalled on July 17, 2026. CDC declared that outbreak over on September 11, 2026, and the recalled lettuce is no longer sold.',
    'In late July 2026, MDH said Minnesota’s Cyclospora cases were in the usual summer range (reported by MPR News on July 31). No Minnesota outbreak had been found, and no Minnesota cases were linked to the multistate outbreak. Check MDH for the latest Minnesota counts.',
    'Cyclospora season usually winds down by fall, but cases linked to travel can occur any time of year.',
  ],
  sources: [
    { label: 'CDC: Symptoms of Cyclosporiasis', url: 'https://www.cdc.gov/cyclosporiasis/signs-symptoms/index.html' },
    { label: 'CDC: Preventing Cyclosporiasis', url: 'https://www.cdc.gov/cyclosporiasis/prevention' },
    {
      label: 'CDC: Clinical Overview of Cyclosporiasis',
      url: 'https://www.cdc.gov/cyclosporiasis/hcp/clinical-overview/index.html',
    },
    { label: 'CDC: Cyclospora Case Data', url: 'https://www.cdc.gov/cyclosporiasis/cases/index.html' },
    {
      label: 'CDC HAN: Domestically Acquired Cyclosporiasis Cases in Multiple U.S. States, 2026',
      url: 'https://www.cdc.gov/han/php/notices/han00531.html',
    },
    {
      label: 'CDC: Cyclospora Outbreak Linked to Iceberg Lettuce (2026)',
      url: 'https://www.cdc.gov/cyclosporiasis/outbreaks/07-26/index.html',
    },
    {
      label: 'FDA: Investigation of Multistate Outbreak of Cyclospora Illnesses, Iceberg Lettuce (July 2026)',
      url: 'https://www.fda.gov/food/outbreaks-foodborne-illness/investigation-multistate-outbreak-cyclospora-illnesses-iceberg-lettuce-july-2026',
    },
    {
      label: 'Minnesota Department of Health: Cyclosporiasis Basics',
      url: 'https://www.health.state.mn.us/diseases/cyclosporasis/basics.html',
    },
    {
      label: 'Minnesota Department of Health: Cyclosporiasis Statistics',
      url: 'https://www.health.state.mn.us/diseases/cyclosporasis/stats.html',
    },
    {
      label: 'MPR News: Cyclosporiasis outbreak has not reached Minnesota (July 31, 2026)',
      url: 'https://www.mprnews.org/story/2026/07/31/cyclosporiasis-outbreak-caused-by-cyclospora-has-not-reached-minnesota',
    },
    {
      label: 'bioMérieux: BIOFIRE FILMARRAY Gastrointestinal Panel',
      url: 'https://www.biomerieux.com/corp/en/our-offer/clinical-products/biofire-filmarray-gastrointestinal-panel.html',
    },
  ],
  lastReviewed: '2026-10-07',
}

export default profile
