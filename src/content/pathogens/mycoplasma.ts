// Verified 2026-10-07 from search results: CDC surveillance (NSSP national ED data; 2024 wave peaked in
// August 2024, largest rise in ages 2-4; decreasing since early 2025 but elevated in some regions into 2026).
// Research notes: Mycoplasma is not reportable in Minnesota and is not in NNDSS.
// TODO(verify): clinical details (incubation, macrolide/doxycycline/fluoroquinolone use, AAP doxycycline
// note, FDA fluoroquinolone and clarithromycin-in-pregnancy warnings) follow long-standing CDC, AAP Red Book,
// IDSA/ATS and FDA label information but were not re-checked live (WebSearch budget exhausted; cdc.gov
// blocked). Before publishing, add URLs from search results for: CDC Mycoplasma "About" and clinical
// overview pages, AAP Red Book Mycoplasma chapter, IDSA/ATS community-acquired pneumonia guideline.
import type { PathogenProfile } from '../types'

const profile: PathogenProfile = {
  id: 'mycoplasma',
  name: 'Mycoplasma pneumoniae (walking pneumonia)',
  shortName: 'Mycoplasma',
  aka: ['Walking pneumonia', 'M. pneumoniae', 'Atypical pneumonia'],
  category: 'respiratory-bacterial',
  kind: 'bacterium',
  biofireTargets: ['Mycoplasma pneumoniae'],
  oneLiner: 'A common bacterium that causes chest colds and “walking pneumonia,” with a cough that can linger for weeks.',
  overview:
    'Mycoplasma pneumoniae is a type of bacteria that infects the airways and lungs. Most people get a chest cold (tracheobronchitis), but some get pneumonia (a lung infection). It is often called “walking pneumonia” because many people feel well enough to keep going about their day. It spreads most where people are close together, such as homes, schools, and college dorms, and large waves of illness come every few years.',
  seasonality: {
    summary:
      'Walking pneumonia can happen any time of year. In Minnesota, as in the rest of the U.S., it tends to be more common in late summer and fall. It also follows multi-year cycles, with large waves every few years (often 3 to 7 years apart) and quieter years in between. After several very quiet years during the COVID-19 pandemic, cases rose sharply across the U.S. in 2024. CDC data show cases have been dropping since early 2025, though they stayed higher than usual in some regions into 2026.',
    peakMonths: [8, 9, 10, 11],
  },
  transmission:
    'It spreads when a sick person coughs or sneezes and others breathe in the droplets. Spread usually takes close, lasting contact, like living in the same home or sharing a classroom or dorm. Most people who are around someone with walking pneumonia for a short time do not get sick. Some people, especially children, carry the bacteria in their throat without feeling sick.',
  incubation:
    'Symptoms usually start 1 to 4 weeks after exposure. Because of this long delay, illness often moves slowly through a household or school over several weeks.',
  contagiousPeriod:
    'Exactly how long people can spread it is not well known. People are most likely to spread it while they are coughing, and the bacteria can stay in the nose and throat for weeks, even after antibiotics. Children can usually return to school or child care once they have no fever and feel well enough to take part; follow your school’s and clinician’s advice.',
  symptoms: {
    common: [
      'A cough that slowly gets worse and can last for weeks or even months',
      'Sore throat',
      'Feeling very tired',
      'Fever',
      'Headache',
      'In children under 5: cold-like symptoms such as sneezing, a stuffy or runny nose, watery eyes, and wheezing',
    ],
    lessCommon: [
      'Vomiting or diarrhea, mostly in young children',
      'Ear infection',
      'Wheezing or an asthma flare-up',
      'Pneumonia that needs hospital care',
      'A skin rash. Rarely, painful sores in the mouth, eyes, or genitals, sometimes with skin blisters (Mycoplasma-induced rash and mucositis)',
      'Rarely, swelling of the brain (encephalitis), breakdown of red blood cells (hemolytic anemia), or heart or kidney problems',
    ],
    emergencyWarningSigns: [
      'Fast, hard, or labored breathing, or skin pulling in between the ribs with each breath',
      'Bluish or gray color of the lips, face, or nails',
      'Chest pain or pressure that does not go away',
      'New confusion, a seizure, or being very sleepy and hard to wake',
      'Painful sores or blisters in the mouth, eyes, or genitals, or skin that blisters or peels',
      'Not drinking enough, with few or no wet diapers or very little urine',
    ],
  },
  ageGroups: {
    infants: {
      risk: 'moderate',
      summary:
        'Walking pneumonia is less common in babies than in older children, and it often looks like a cold. Because babies have small airways, any lung infection can make it harder for them to breathe or feed.',
      actions: [
        'Call your clinician right away if a baby younger than 3 months has a fever of 100.4°F (38°C) or higher.',
        'Get care quickly for fast or hard breathing, poor feeding, or fewer wet diapers.',
        'Keep people with a cough away from your baby, and have everyone wash their hands before holding the baby.',
        'Use saline drops and gentle suction for a stuffy nose. Do not give cough and cold medicines unless your clinician says to.',
      ],
    },
    children: {
      risk: 'moderate',
      summary:
        'School-age children get walking pneumonia most often, and the 2024 national wave also hit many children ages 2 to 4. Most children recover at home, but some need antibiotics or a hospital stay. Children with asthma, sickle cell disease, or other chronic conditions can get sicker.',
      actions: [
        'Call your clinician if your child has a cough that keeps getting worse, a fever that lasts more than 2 to 3 days, or fast breathing.',
        'If an antibiotic is prescribed, give every dose as directed, and call back if your child is not better after 2 to 3 days.',
        'Keep your child home while they have a fever and until they feel well enough for school or child care.',
        'If your child has asthma, follow their asthma action plan and call if wheezing gets worse.',
        'Teach your child to cover coughs and wash hands often.',
      ],
    },
    adults: {
      risk: 'lower',
      summary:
        'Most healthy adults under 50 get a chest cold or a mild pneumonia and recover at home, though the cough can drag on for weeks. Young adults in dorms, military housing, and other crowded places are more likely to catch it.',
      actions: [
        'Rest, drink fluids, and stay home while you have a fever.',
        'See a clinician if you have a fever with a cough that keeps getting worse, shortness of breath, or chest pain.',
        'If you are prescribed an antibiotic, take it exactly as directed, and call if you are not better after 2 to 3 days.',
        'Cover coughs and wash hands often to protect others at home.',
      ],
    },
    'older-adults': {
      risk: 'lower',
      summary:
        'Walking pneumonia is less common at this age than in children and young adults. People with asthma, COPD (chronic obstructive pulmonary disease), or other chronic conditions may have a harder time.',
      actions: [
        'See a clinician if you have a fever with a worsening cough, shortness of breath, or chest pain.',
        'If you have asthma or COPD, follow your action plan and call early if your breathing gets worse.',
        'Tell your clinician about all your medicines, because some antibiotics used for walking pneumonia can interact with other drugs or affect heart rhythm.',
        'Rest, drink fluids, and stay home while you have a fever.',
        'Ask your clinician whether you are due for flu or pneumococcal vaccines. They do not prevent walking pneumonia, but they lower your risk from other causes of pneumonia.',
      ],
    },
    seniors: {
      risk: 'moderate',
      summary:
        'Older adults get walking pneumonia less often than children, but pneumonia of any kind tends to be more serious with age, especially for people with heart or lung disease. Outbreaks can happen in nursing homes and other group living settings.',
      actions: [
        'Seek care promptly for fever with a worsening cough, shortness of breath, chest pain, or new confusion.',
        'Tell your clinician about all your medicines, since some antibiotics can interact with them or affect heart rhythm.',
        'If you live in a care facility, tell staff right away if you or others develop a cough and fever.',
        'Ask your clinician about vaccines that protect against other causes of pneumonia, such as pneumococcal and flu vaccines. They do not prevent walking pneumonia, but they lower your overall risk of lung infections.',
      ],
    },
    pregnant: {
      risk: 'lower',
      summary:
        'There is little evidence that walking pneumonia itself is worse during pregnancy, but pneumonia of any kind should be checked by a clinician. Some antibiotics used for walking pneumonia are usually avoided in pregnancy, so treatment choices differ.',
      actions: [
        'Call your clinician or prenatal care provider if you have a fever with a worsening cough or any shortness of breath.',
        'Make sure every clinician knows you are pregnant. Doxycycline and fluoroquinolones are usually avoided during pregnancy, and azithromycin is commonly used instead.',
        'Rest, drink fluids, and ask before taking over-the-counter cold or fever medicines.',
      ],
    },
    immunocompromised: {
      risk: 'higher',
      summary:
        'People with weakened immune systems, such as those getting cancer treatment or living with a transplant, can develop more severe pneumonia and other complications.',
      actions: [
        'Contact your care team early if you develop a fever, cough, or shortness of breath.',
        'Ask household members to wash hands often and cover coughs, especially if someone at home has a lingering cough.',
        'Tell your care team about all your medicines so they can choose an antibiotic that is safe with your treatment.',
      ],
    },
  },
  treatment: {
    summary:
      'Many people, especially those with only a chest cold, get better without antibiotics. When walking pneumonia is diagnosed or strongly suspected, a clinician may prescribe an antibiotic. Common antibiotics such as penicillin and amoxicillin do not work against Mycoplasma, because these bacteria have no cell wall for those drugs to attack. A cough can last for weeks even after treatment, and that alone does not mean the antibiotic failed.',
    options: [
      {
        name: 'Azithromycin and similar antibiotics (macrolides)',
        type: 'antibiotic',
        detail:
          'Azithromycin is the usual first choice, especially for children. Clarithromycin and erythromycin are in the same group. Most Mycoplasma in the U.S. still responds to these drugs, but some strains are resistant, and resistance is much more common in parts of Asia. Call your clinician if symptoms are not improving after about 2 to 3 days.',
        who: 'Children and adults with walking pneumonia. Azithromycin is the macrolide usually used during pregnancy; clarithromycin is generally avoided.',
      },
      {
        name: 'Doxycycline',
        type: 'antibiotic',
        detail:
          'A tetracycline-family antibiotic that is an option for adults and children, especially when a macrolide is not working or resistance is suspected. The American Academy of Pediatrics says short courses (21 days or less) can be used in children of any age. It is usually avoided during pregnancy.',
        who: 'Adults, and children when their clinician decides it is the best choice',
      },
      {
        name: 'Fluoroquinolones (levofloxacin, moxifloxacin)',
        type: 'antibiotic',
        detail:
          'Used mainly for adults, sometimes when other antibiotics do not work. They are generally not used in children or during pregnancy unless there is no better option. FDA warns that these drugs can rarely cause serious side effects involving the tendons, nerves, heart rhythm, and the body’s main artery (aorta).',
        who: 'Mainly adults',
      },
      {
        name: 'Home care: rest, fluids, and fever relief',
        type: 'supportive',
        detail:
          'Rest and drink plenty of fluids. Acetaminophen or ibuprofen can ease fever and aches; follow the label or your clinician’s advice for age and weight. Call your clinician before giving any fever medicine to a baby younger than 3 months, and never give aspirin to children or teens.',
        who: 'Most people with mild illness',
      },
      {
        name: 'Hospital care',
        type: 'supportive',
        detail: 'Oxygen, fluids through an IV, and antibiotics through a vein for people with severe pneumonia or complications.',
        who: 'People with trouble breathing, low oxygen, dehydration, or serious complications',
      },
    ],
    antibioticsHelp: 'sometimes',
  },
  prevention: {
    vaccines: [],
    everyday: [
      'Wash hands often with soap and water for at least 20 seconds.',
      'Cover coughs and sneezes with a tissue or your elbow.',
      'Stay home while you have a fever, and keep sick children home from school or child care.',
      'Avoid sharing cups and utensils, and limit close contact with people who are sick.',
      'If someone at home has a lingering cough, take extra care around babies, older relatives, and people with weak immune systems.',
      'Do not smoke or vape, and avoid secondhand smoke, which makes lung infections worse.',
    ],
  },
  testing:
    'A clinician often diagnoses walking pneumonia from symptoms and an exam, sometimes with a chest X-ray. A PCR test (a lab test that finds the germ’s genetic material) on a throat or nose swab can confirm it. Hospitals and emergency departments often use a test that checks for many germs at once. Because some people carry the bacteria without being sick, a positive test does not always mean it is causing the illness, so clinicians look at the whole picture. Blood antibody tests are less useful for deciding on treatment. Home COVID-19 and flu tests do not detect Mycoplasma.',
  whenToSeekCare: [
    'Call 911 or go to the emergency department for any emergency warning sign, such as struggling to breathe, blue or gray lips, or blistering sores in the mouth or eyes.',
    'Call your clinician if you or your child has a fever with a cough that keeps getting worse or a fever lasting more than 2 to 3 days. Also call for a cough lasting more than 3 weeks.',
    'Call your clinician if you are taking an antibiotic and are not better after 2 to 3 days, or if you get better and then get worse.',
    'Call right away if a baby younger than 3 months has a fever of 100.4°F (38°C) or higher.',
    'People with asthma, sickle cell disease, or a weakened immune system should call early if they develop a fever and cough.',
    'Urgent care can check a worsening cough or possible pneumonia when your clinic is closed. Go to the emergency department, not urgent care, for trouble breathing.',
  ],
  readingTheNumbers:
    'MN Pulse tracks Mycoplasma mainly through the BioFire detection rate: the share of multi-pathogen respiratory panel tests at participating Midwest labs that find M. pneumoniae. These panels are mostly run for people sick enough to visit a hospital, emergency department, or clinic, often children. So the number shows the share of tested people with breathing symptoms who had Mycoplasma found, not how many people in the region are infected. Most walking pneumonia is treated without any test and is never counted. Mycoplasma is not a reportable disease in Minnesota, so there is no state case count. CDC publishes national emergency department data for Mycoplasma, but not data for Minnesota alone. The detection rate is usually low between epidemic waves. During a wave it can climb for months, because the illness spreads slowly and has a long incubation period. Waves often build through late summer and fall. Some detections are bacteria a person carries without being sick, so small week-to-week changes mean little. A steady rise over several weeks means walking pneumonia is spreading in the region. For most people, that means a lingering cough with fever is more likely to be Mycoplasma. Mention it to your clinician, because amoxicillin, a common first choice for other pneumonia, does not treat it.',
  watchNotes: [
    'As of 2026, CDC reports that U.S. Mycoplasma infections have been dropping since early 2025. They stayed higher than usual in some regions into 2026.',
    'Background: walking pneumonia rose sharply across the U.S. in 2024 after several quiet years during the COVID-19 pandemic. CDC data showed the rise peaked in August 2024. It was especially notable in children ages 2 to 4, who were thought to get it less often in the past.',
    'Mycoplasma is not a reportable disease in Minnesota, so MN Pulse relies on Midwest BioFire lab data to track it.',
    'Large waves usually come every few years, so quieter periods often follow a big wave.',
    'Most Mycoplasma in the U.S. still responds to azithromycin. Clinicians watch for resistance, which is common in parts of Asia.',
    'There is no vaccine for Mycoplasma pneumoniae.',
  ],
  sources: [
    {
      label: 'CDC: Mycoplasma pneumoniae infection surveillance and trends',
      url: 'https://www.cdc.gov/mycoplasma/php/surveillance/index.html',
    },
    { label: 'BIOFIRE Syndromic Trends (bioMérieux)', url: 'https://syndromictrends.com/' },
  ],
  lastReviewed: '2026-10-07',
}

export default profile
