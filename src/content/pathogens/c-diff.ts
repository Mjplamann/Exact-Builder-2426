// TODO(verify): drafted from long-standing CDC, IDSA/SHEA and FDA-label information WITHOUT live web
// verification (the shared WebSearch budget was exhausted). Verify current (Oct 2026) treatment
// guidance and add authoritative source URLs before publishing.
import type { PathogenProfile } from '../types'

const profile: PathogenProfile = {
  id: 'c-diff',
  name: 'Clostridioides difficile (C. diff)',
  shortName: 'C. diff',
  aka: ['C. difficile', 'Clostridium difficile (former name)', 'C. diff infection (CDI)'],
  category: 'gastrointestinal',
  kind: 'bacterium',
  biofireTargets: ['Clostridioides (Clostridium) difficile toxin A/B'],
  oneLiner: 'A germ that causes severe diarrhea, most often after taking antibiotics. Its spores are hard to kill and spread on hands and surfaces.',
  overview:
    'C. diff is a bacterium that can cause diarrhea and colitis (inflammation of the colon). It usually strikes after antibiotics upset the healthy bacteria in the gut, letting C. diff grow and make toxins. It is a common infection linked to hospitals and nursing homes, but many cases now begin in the community, in people who have not recently stayed in a hospital. C. diff forms spores (a tough, resting form) that can last on surfaces for months and are not killed by alcohol hand sanitizer.',
  seasonality: {
    summary:
      'C. diff happens year-round in Minnesota and does not have a strong season. Changes over time are usually tied to antibiotic use and health care exposures rather than to weather.',
    peakMonths: [],
  },
  transmission:
    'C. diff spreads through spores in the stool (poop) of people who have it. Spores get on hands, toilets, bathroom fixtures, bed rails and medical equipment, and then into the mouth. Many people swallow spores without getting sick; illness is most likely when antibiotics have disrupted the normal gut bacteria. Alcohol hand sanitizer does not kill the spores. Washing with soap and water removes them, and bleach-based or other spore-killing disinfectants kill them on surfaces.',
  incubation:
    'Symptoms often start while taking antibiotics or within a few weeks after finishing them. Risk is highest during antibiotic use and the month after, and it stays higher for up to a few months.',
  contagiousPeriod:
    'People spread spores mainly while they have diarrhea. Some people carry C. diff without symptoms and can still shed spores. Because spores last on surfaces for months, cleaning matters even after symptoms stop.',
  symptoms: {
    common: [
      'Frequent watery diarrhea (3 or more loose stools in a day)',
      'Stomach cramps, pain or tenderness',
      'Fever',
      'Loss of appetite',
      'Nausea',
    ],
    lessCommon: ['Mucus in the stool', 'Dehydration', 'Blood in the stool'],
    emergencyWarningSigns: [
      'Severe belly pain, or a swollen, hard belly',
      'Fever with a fast heartbeat, confusion or feeling faint',
      'Diarrhea that suddenly stops while belly pain or swelling gets worse',
      'Signs of serious dehydration: very little or no urine, a very dry mouth, or dizziness when standing',
      'A lot of blood in the stool',
    ],
  },
  ageGroups: {
    infants: {
      risk: 'lower',
      summary:
        'Many healthy babies carry C. diff in their gut without getting sick, so it rarely causes illness at this age. Testing babies under 1 year is usually not recommended, and diarrhea in babies is more often caused by viruses.',
      actions: [
        'Ask your baby’s clinician what is causing the diarrhea; C. diff testing is usually not useful at this age',
        'Keep feeding and watch for signs of dehydration',
        'Wash your hands with soap and water after diaper changes',
        'Give antibiotics only when a clinician prescribes them',
      ],
    },
    children: {
      risk: 'lower',
      summary:
        'C. diff is less common in children but can happen, especially after antibiotics or in children with ongoing bowel conditions or other health problems. Many cases in children begin outside the hospital.',
      actions: [
        'Give antibiotics only when prescribed, exactly as directed',
        'Call your child’s clinician about diarrhea during or after antibiotics',
        'Teach handwashing with soap and water',
        'Do not give anti-diarrhea medicine unless a clinician says to',
      ],
    },
    adults: {
      risk: 'lower',
      summary:
        'Healthy adults can get C. diff, usually after taking antibiotics. Risk is highest while taking antibiotics and in the month after.',
      actions: [
        'Take antibiotics only when needed; it is OK to ask whether one is truly necessary',
        'Tell your clinician if you have watery diarrhea 3 or more times a day during or after antibiotics',
        'Wash hands with soap and water, not just sanitizer',
        'Do not take anti-diarrhea medicine for this kind of diarrhea without talking to a clinician',
      ],
    },
    'older-adults': {
      risk: 'moderate',
      summary:
        'Risk rises with age, chronic health conditions, hospital stays, and medicines such as antibiotics and stomach-acid reducers.',
      actions: [
        'Ask whether an antibiotic is truly needed before starting one',
        'Ask your clinician whether you still need daily stomach-acid medicine, such as a proton pump inhibitor',
        'Tell every care team if you have had C. diff before',
        'Wash hands with soap and water, especially before eating',
      ],
    },
    seniors: {
      risk: 'highest',
      summary:
        'Adults 65 and older are the most likely to get C. diff and to become seriously ill or die from it, especially after a hospital or nursing home stay.',
      actions: [
        'Call your clinician quickly about diarrhea during or after antibiotics',
        'Tell every care team, including dentists and urgent care, if you have had C. diff before',
        'In hospitals and nursing homes, it is OK to ask staff and visitors to wash their hands',
        'Ask your clinician whether you still need daily stomach-acid medicine',
      ],
    },
    pregnant: {
      risk: 'lower',
      summary:
        'C. diff is uncommon during pregnancy, but antibiotics during pregnancy or around delivery can raise the risk. Report diarrhea during or after antibiotics.',
      actions: [
        'Call your prenatal or postpartum care provider about diarrhea during or after antibiotics',
        'Ask which treatments are safe during pregnancy and breastfeeding',
        'Drink plenty of fluids',
        'Wash hands with soap and water',
      ],
    },
    immunocompromised: {
      risk: 'higher',
      summary:
        'People with weakened immune systems, including those getting chemotherapy and organ transplant recipients, are more likely to get C. diff, become severely ill, or have it come back. People with inflammatory bowel disease are also at higher risk.',
      actions: [
        'Report new diarrhea to your care team right away',
        'Remind clinicians if you have had C. diff before, especially before new antibiotics',
        'Clean the bathroom with a bleach-based or spore-killing product if someone at home has C. diff',
        'Wash hands with soap and water',
      ],
    },
  },
  treatment: {
    summary:
      'C. diff is treated with specific antibiotics taken by mouth that target it. If possible, your clinician will also stop the antibiotic that led to the infection. C. diff often comes back after treatment, so call your clinician if diarrhea returns. Products made from healthy gut bacteria can help prevent repeat infections in some adults.',
    options: [
      {
        name: 'Fidaxomicin (Dificid)',
        type: 'antibiotic',
        detail:
          'An antibiotic taken by mouth, usually for about 10 days. Infectious disease guidelines (IDSA/SHEA) prefer it for adults because the infection comes back less often than with vancomycin. It can cost more, so insurance coverage may matter.',
        who: 'Adults with a first or repeat C. diff infection; also approved for children 6 months and older',
      },
      {
        name: 'Vancomycin taken by mouth',
        type: 'antibiotic',
        detail:
          'A standard treatment and an accepted alternative to fidaxomicin, usually for about 10 days. For repeat infections, clinicians may use a longer, slowly tapering schedule. Vancomycin given through a vein (IV) does not treat C. diff in the gut.',
        who: 'Adults and children with C. diff infection',
      },
      {
        name: 'Metronidazole',
        type: 'antibiotic',
        detail:
          'An older option. For adults, guidelines suggest it only for mild illness when fidaxomicin or vancomycin cannot be used. It is still sometimes used for mild C. diff in children.',
        who: 'Selected patients with mild illness',
      },
      {
        name: 'Fecal microbiota products (Rebyota, Vowst) and fecal transplant',
        type: 'other',
        detail:
          'These restore healthy gut bacteria to help keep C. diff from coming back. Rebyota is given into the rectum and Vowst is taken as capsules by mouth, both after antibiotic treatment for a repeat infection. A fecal microbiota transplant (FMT) may be offered after several recurrences.',
        who: 'Adults 18 and older whose C. diff has come back',
      },
      {
        name: 'Fluids and care for severe illness',
        type: 'supportive',
        detail:
          'Drink plenty of fluids. Do not take anti-diarrhea medicines unless your clinician says it is OK. Severe infections may need hospital care, and rarely surgery.',
        who: 'Everyone with C. diff; hospital care for severe illness',
      },
    ],
    antibioticsHelp: 'yes',
  },
  prevention: {
    vaccines: [],
    everyday: [
      'Take antibiotics only when you need them. Colds, most sore throats and most stomach bugs do not need antibiotics.',
      'Wash hands with soap and water after using the bathroom and before eating, especially if someone at home has C. diff. Alcohol hand sanitizer does not kill C. diff spores.',
      'If someone at home has C. diff, clean the toilet, bathroom and high-touch surfaces with a bleach-based cleaner or another product labeled to kill C. diff spores, following the label directions.',
      'Wash soiled clothes and linens right away with detergent.',
      'Tell your clinicians if you have had C. diff before, especially before starting a new antibiotic.',
      'Ask your clinician whether you still need daily stomach-acid medicine.',
    ],
  },
  testing:
    'C. diff is diagnosed with a stool test, usually only for people with new, unexplained diarrhea (3 or more loose stools in 24 hours). Labs use tests that find the germ’s genes (PCR) or its toxins, sometimes in steps. Because some people carry C. diff without being sick, testing is not recommended for people without diarrhea, for babies under 1 year, or after treatment to “prove” it is gone. There is no home test.',
  whenToSeekCare: [
    'Call a health care provider if you have watery diarrhea 3 or more times in a day while taking antibiotics or in the weeks after.',
    'Call if diarrhea comes back after C. diff treatment; it may be a recurrence that needs different treatment.',
    'Do not stop a prescribed antibiotic on your own; call your clinician first.',
    'Go to urgent care or an emergency department for severe belly pain, a swollen belly, fever with feeling very ill, a lot of blood in the stool, or signs of dehydration.',
    'Call 911 for confusion, fainting or trouble staying awake.',
  ],
  readingTheNumbers:
    'C. diff numbers mostly come from stool testing, such as the share of BioFire stomach (gastrointestinal) panel tests that detect C. diff toxin genes. Read these with care: a positive panel result can mean infection, but it can also mean someone carries C. diff without being sick, which is common in babies and some adults. So panel detection can look higher than true illness. C. diff does not have a strong season, and changes are usually gradual. A rise is more often tied to antibiotic use and health care settings than to the fast community spread seen with flu. For an average person, the best steps are the same any time of year: avoid antibiotics you do not need, and call your clinician about diarrhea during or after antibiotics.',
  watchNotes: [
    'There is no approved C. diff vaccine.',
    'Two FDA-approved products made from healthy gut bacteria (Rebyota and Vowst) can help prevent repeat C. diff in adults. Ask your clinician whether one is right for you.',
  ],
  sources: [],
  lastReviewed: '2026-10-07',
}

export default profile
