// TODO(verify): drafted from long-standing CDC, AAP (Red Book) and IDSA/ATS information WITHOUT live web
// verification (the shared WebSearch budget was exhausted; cdc.gov was blocked). Before publishing, add
// pathogen-specific sources: CDC Chlamydia pneumoniae "About" and clinical overview pages, AAP Red Book
// Chlamydia pneumoniae chapter, IDSA/ATS community-acquired pneumonia guideline.
import type { PathogenProfile } from '../types'

const profile: PathogenProfile = {
  id: 'chlamydia-pneumoniae',
  name: 'Chlamydia pneumoniae',
  shortName: 'C. pneumoniae',
  aka: ['Chlamydophila pneumoniae', 'C. pneumoniae', 'Atypical pneumonia'],
  category: 'respiratory-bacterial',
  kind: 'bacterium',
  biofireTargets: ['Chlamydia pneumoniae'],
  oneLiner: 'A common bacterium that causes sore throat, hoarseness, and lingering coughs. It is not the sexually transmitted chlamydia.',
  overview:
    'Chlamydia pneumoniae is a type of bacteria that infects the nose, throat, and lungs. It usually causes mild illness, such as a sore throat, a hoarse voice, or bronchitis (a chest cold), but it can also cause pneumonia (a lung infection), often a mild “walking pneumonia.” Most people are infected at some point in their lives, and people can get it more than once. It is a different germ from Chlamydia trachomatis, which causes the sexually transmitted infection, and it does not spread through sex.',
  seasonality: {
    summary:
      'Chlamydia pneumoniae spreads year-round and does not follow a strong seasonal pattern in Minnesota or elsewhere in the U.S. Outbreaks can happen at any time in places where people are close together, such as schools, college dorms, military barracks, and nursing homes.',
    peakMonths: [],
  },
  transmission:
    'It spreads when a sick person coughs or sneezes and others breathe in the droplets. It usually takes close contact, and it tends to spread slowly through households, schools, and other group settings. Some people carry the bacteria without feeling sick and may still spread it.',
  incubation: 'Symptoms usually start about 3 to 4 weeks after exposure.',
  contagiousPeriod:
    'Not well understood. People may be able to spread it for weeks, and some people carry it without symptoms. Covering coughs and washing hands help protect others while you are sick.',
  symptoms: {
    common: [
      'Sore throat',
      'Hoarseness or losing your voice',
      'Runny or stuffy nose',
      'Mild fever',
      'Feeling tired',
      'A cough that comes on slowly and can last for weeks',
    ],
    lessCommon: [
      'Headache',
      'Sinus infection (sinusitis) or ear infection',
      'Wheezing or an asthma flare-up',
      'Pneumonia, which tends to be more serious in older adults',
      'Many people have very mild symptoms or none at all',
    ],
    emergencyWarningSigns: [
      'Fast, hard, or labored breathing, or skin pulling in between the ribs with each breath',
      'Bluish or gray color of the lips, face, or nails',
      'Chest pain or pressure that does not go away',
      'New confusion, or being very sleepy and hard to wake',
      'Not drinking enough, with few or no wet diapers or very little urine',
      'A sudden worsening of breathing in someone with heart or lung disease',
    ],
  },
  ageGroups: {
    infants: {
      risk: 'moderate',
      summary:
        'Chlamydia pneumoniae is uncommon in babies. Any lung infection can be harder on a baby, though, so watch closely for trouble breathing or feeding.',
      actions: [
        'Call your clinician right away if a baby younger than 3 months has a fever of 100.4°F (38°C) or higher.',
        'Get care quickly for fast or hard breathing, poor feeding, or fewer wet diapers.',
        'Keep people with a cough away from your baby, and have everyone wash their hands before holding the baby.',
      ],
    },
    children: {
      risk: 'lower',
      summary:
        'School-age children and teens are among the most likely to catch it, but most have mild symptoms like a sore throat, a hoarse voice, or a cough. Children with asthma may wheeze more.',
      actions: [
        'Call your clinician if your child has a cough that keeps getting worse, a fever that lasts more than 2 to 3 days, or trouble breathing.',
        'If your child has asthma, follow their asthma action plan and call if wheezing gets worse.',
        'Keep your child home while they have a fever.',
        'Teach your child to cover coughs and wash hands often.',
      ],
    },
    adults: {
      risk: 'lower',
      summary:
        'Most adults have mild symptoms or none at all. When illness happens, it is often a sore throat, hoarseness, or bronchitis, and the cough can linger for weeks.',
      actions: [
        'Rest, drink fluids, and stay home while you have a fever.',
        'See a clinician if you have a fever with a cough that keeps getting worse, shortness of breath, or chest pain.',
        'If you are prescribed an antibiotic, take every dose as directed, and call if you are not better after a few days.',
        'Cover coughs and wash hands often.',
      ],
    },
    'older-adults': {
      risk: 'lower',
      summary:
        'Adults 50 to 64 usually have a mild illness, but people with asthma, COPD (chronic obstructive pulmonary disease), heart disease, or other chronic conditions can have a harder time.',
      actions: [
        'See a clinician for a fever with a worsening cough, shortness of breath, or chest pain.',
        'If you have asthma or COPD, follow your action plan and call early if your breathing gets worse.',
        'Tell your clinician about all your medicines, since some antibiotics can interact with them.',
      ],
    },
    seniors: {
      risk: 'moderate',
      summary:
        'Pneumonia from Chlamydia pneumoniae can be more serious in older adults, especially those with heart or lung disease. Outbreaks can happen in nursing homes.',
      actions: [
        'Seek care promptly for fever with a worsening cough, shortness of breath, chest pain, or new confusion.',
        'Tell your clinician about all your medicines, since some antibiotics can interact with them or affect heart rhythm.',
        'If you live in a care facility, tell staff right away if you or others develop a cough and fever.',
        'Ask your clinician about vaccines that protect against other causes of pneumonia, such as pneumococcal and flu vaccines.',
      ],
    },
    pregnant: {
      risk: 'lower',
      summary:
        'There is little evidence that Chlamydia pneumoniae is more severe during pregnancy. Pneumonia of any kind should be checked by a clinician, and some antibiotics used for it are usually avoided in pregnancy.',
      actions: [
        'Call your clinician or prenatal care provider for a fever with a worsening cough or any shortness of breath.',
        'Make sure every clinician knows you are pregnant, since doxycycline and fluoroquinolones are usually avoided during pregnancy.',
        'Rest, drink fluids, and ask before taking over-the-counter medicines.',
      ],
    },
    immunocompromised: {
      risk: 'moderate',
      summary:
        'People with weakened immune systems may have a more severe or longer-lasting illness, as with many respiratory infections.',
      actions: [
        'Contact your care team early if you develop a fever, cough, or shortness of breath.',
        'Ask household members to cover coughs and wash hands often.',
        'Tell your care team about all your medicines so they can choose an antibiotic that is safe with your treatment.',
      ],
    },
  },
  treatment: {
    summary:
      'Mild illness often gets better on its own. When a clinician diagnoses pneumonia or strongly suspects Chlamydia pneumoniae, they may prescribe an antibiotic. Penicillin and amoxicillin do not reliably treat it, because the bacteria grow inside the body’s cells where those drugs do not work well. A cough can last for weeks after treatment while the airways heal.',
    options: [
      {
        name: 'Azithromycin and other macrolide antibiotics',
        type: 'antibiotic',
        detail: 'Commonly used for children and adults. Clarithromycin and erythromycin are other choices in this group.',
        who: 'Children and adults whose illness needs treatment, including most pregnant people',
      },
      {
        name: 'Doxycycline',
        type: 'antibiotic',
        detail:
          'A tetracycline-family antibiotic often used for adults. The American Academy of Pediatrics says short courses can be used in children of any age when needed. It is usually avoided during pregnancy.',
        who: 'Mainly adults; children when their clinician decides it is the best choice',
      },
      {
        name: 'Fluoroquinolones (levofloxacin, moxifloxacin)',
        type: 'antibiotic',
        detail:
          'Used mainly for adults with pneumonia. They are generally not used in children or during pregnancy. FDA warns that these drugs can rarely cause serious side effects involving the tendons, nerves, heart rhythm, and the body’s main artery (aorta).',
        who: 'Mainly adults',
      },
      {
        name: 'Home care: rest, fluids, and fever relief',
        type: 'supportive',
        detail:
          'Rest, drink plenty of fluids, and use acetaminophen or ibuprofen for fever and aches, following the label or your clinician’s advice. Warm drinks, honey (for people over 1 year old), and resting your voice can ease a sore throat and hoarseness. Never give aspirin to children or teens.',
        who: 'Most people with mild illness',
      },
      {
        name: 'Hospital care',
        type: 'supportive',
        detail: 'Oxygen, fluids through an IV, and antibiotics through a vein for people with severe pneumonia.',
        who: 'People with trouble breathing, low oxygen, or dehydration',
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
      'Do not smoke or vape, and avoid secondhand smoke, which makes lung infections worse.',
    ],
  },
  testing:
    'Chlamydia pneumoniae is rarely tested for in everyday care. Clinicians often diagnose and treat pneumonia based on symptoms, an exam, and sometimes a chest X-ray. In hospitals and emergency departments, a PCR test (a lab test that finds the germ’s genetic material) on a nose or throat swab, often as part of a multi-germ respiratory panel, can find it. Blood antibody tests exist but are not very useful for deciding on treatment. Home COVID-19 and flu tests do not detect it.',
  whenToSeekCare: [
    'Call 911 or go to the emergency department for any emergency warning sign, such as struggling to breathe or blue or gray lips.',
    'Call your clinician if you have a fever with a cough that keeps getting worse, a fever lasting more than 2 to 3 days, or a cough lasting more than 3 weeks.',
    'Call your clinician if you are taking an antibiotic and are not better after 2 to 3 days, or if you get better and then get worse.',
    'Call right away if a baby younger than 3 months has a fever of 100.4°F (38°C) or higher.',
    'Older adults and people with heart or lung disease or a weakened immune system should call early if they develop a fever and cough.',
    'Urgent care can check a worsening cough when your clinic is closed. Go to the emergency department, not urgent care, for trouble breathing.',
  ],
  readingTheNumbers:
    'MN Pulse tracks Chlamydia pneumoniae through the BioFire detection rate: the share of multi-pathogen respiratory panel tests at participating Midwest labs that find it. These panels are mostly run for people sick enough to visit a hospital, emergency department, or clinic, so the number reflects serious respiratory illness, not how many people are infected. C. pneumoniae turns up in only a small share of these tests, so the rate is low and can bounce around from week to week because of small numbers. It has no strong season. A steady rise over several weeks may point to more spread or a local outbreak. CDC’s public emergency department data cover COVID-19, flu, and RSV, not C. pneumoniae. For an average person, a rise is mostly a reminder that a slow-building cough with a hoarse voice may be caused by bacteria like this one, and to see a clinician if it lasts or gets worse.',
  watchNotes: [
    'There is no vaccine for Chlamydia pneumoniae. It is different from the sexually transmitted chlamydia, and a positive result on a respiratory test says nothing about sexual health.',
  ],
  sources: [{ label: 'BIOFIRE Syndromic Trends (bioMérieux)', url: 'https://syndromictrends.com/' }],
  lastReviewed: '2026-10-07',
}

export default profile
