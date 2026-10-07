import type { PathogenProfile } from '../types'

const profile: PathogenProfile = {
  id: 'adenovirus',
  name: 'Adenovirus (respiratory)',
  shortName: 'Adenovirus',
  aka: ['adeno', 'human adenovirus', 'pharyngoconjunctival fever', 'adenovirus pink eye'],
  category: 'respiratory-viral',
  kind: 'virus',
  biofireTargets: ['Adenovirus'],
  oneLiner: 'A common year-round virus behind colds, sore throats, fever, and pink eye. Usually mild, but serious for people with weak immune systems.',
  overview:
    'Adenoviruses are a large group of common, hardy viruses that can survive a long time on surfaces. They can cause cold-like symptoms, sore throat, fever, bronchitis, pneumonia (a lung infection), and pink eye (conjunctivitis). Most infections are mild, but young children often have high fevers, and people with weakened immune systems can get very sick. This page covers respiratory and eye infections; the stomach types (40 and 41) have their own page on MN Pulse.',
  seasonality: {
    summary:
      'Adenovirus spreads all year in Minnesota and does not have a strong season like flu or RSV. It can show up at any time, often as outbreaks in child care centers, schools, college dorms, camps, and long-term care facilities. Outbreaks of sore throat and pink eye linked to swimming pools are more likely in summer.',
    peakMonths: [],
  },
  transmission:
    'Adenoviruses spread through close personal contact, such as touching or shaking hands, and through the air when an infected person coughs or sneezes. You can also catch it by touching a surface that has the virus on it and then touching your eyes, nose, or mouth before washing your hands. Some types spread through stool (poop), for example during diaper changes, and through water, such as a swimming pool without enough chlorine, but this is less common. Pink eye from adenovirus spreads easily from eyes to hands to shared items like towels and pillowcases.',
  incubation: 'Symptoms usually start about 5 to 6 days after exposure, but it can be anywhere from 2 days to 2 weeks.',
  contagiousPeriod:
    'People are most contagious while they have symptoms, especially early in the illness. Adenovirus can keep being shed (released) for weeks after symptoms end, and sometimes for months in people with weakened immune systems. Some people spread it without ever feeling sick. Pink eye from adenovirus can spread for as long as the eye is red and watery, which can be a week or two.',
  symptoms: {
    common: [
      'Fever, which can be high and last several days in children',
      'Sore throat, sometimes with white patches on the tonsils that can look like strep throat',
      'Runny or stuffy nose',
      'Cough',
      'Pink eye: red, watery, itchy, or gritty-feeling eyes',
      'Swollen glands in the neck',
      'Tiredness and body aches',
    ],
    lessCommon: [
      'Bronchitis (chest cold), or bronchiolitis (a lung infection in babies that causes wheezing)',
      'Croup (a barking cough with noisy breathing)',
      'Pneumonia (a lung infection)',
      'Ear infections',
      'Diarrhea, vomiting, or stomach pain',
      'Bladder infection with blood in the urine (pee)',
      'A severe eye infection (epidemic keratoconjunctivitis) that can cause eye pain and blurry vision for weeks',
      'Rarely, illness of the brain or spinal cord, such as meningitis or encephalitis',
    ],
    emergencyWarningSigns: [
      'Trouble breathing, fast breathing, or ribs or belly pulling in with each breath',
      'Bluish or gray lips, face, or fingernails',
      'Chest pain or pressure that does not go away',
      'Confusion, extreme sleepiness, or being hard to wake up',
      'Severe headache with a stiff neck',
      'Seizures',
      'Signs of dehydration, such as no urine (pee) for 8 hours, a very dry mouth, or no tears when crying',
      'Fever or cough that gets better but then comes back or gets worse',
      'In a child: fever above 104°F (40°C)',
      'In a baby younger than 12 weeks: any fever',
    ],
  },
  ageGroups: {
    infants: {
      risk: 'higher',
      summary:
        'Most babies with adenovirus have cold-like symptoms, fever, or diarrhea and get better at home. But babies can get serious pneumonia, especially those born early or with heart or lung problems. Rarely, newborns in the first weeks of life get a severe infection that spreads through the body.',
      actions: [
        'Call your clinician right away if a baby younger than 3 months has a fever of 100.4°F (38°C) or higher, taken rectally (in the bottom). Call before giving any fever medicine.',
        'Get care quickly if your baby is breathing fast or hard, is feeding poorly, or has fewer wet diapers.',
        'Wash your hands after diaper changes and before feeding your baby.',
        'Keep your baby away from people who are sick, including anyone with pink eye.',
        'Do not give cough and cold medicines or honey to babies under 1 year.',
      ],
    },
    children: {
      risk: 'moderate',
      summary:
        'Adenovirus is very common in young children, especially those in child care. It often causes a high fever that can last several days, along with sore throat, pink eye, or cough. Most children recover fully, but children with asthma, heart or lung disease, or weakened immune systems can have more serious illness.',
      actions: [
        'Keep your child home until their symptoms are getting better and they have had no fever for 24 hours without fever-reducing medicine.',
        'Call your clinician if a fever lasts more than 24 hours in a child under 2, or more than 3 days in an older child.',
        'Teach handwashing, and do not let children share cups, towels, or pillows.',
        'For pink eye, wipe away discharge with a clean cloth, wash hands after touching the eyes, and follow your child care or school’s rules about returning.',
        'Keep sick children out of swimming pools until they are well.',
      ],
    },
    adults: {
      risk: 'lower',
      summary:
        'Healthy adults usually have mild illness, such as a cold, sore throat, or pink eye. Outbreaks of more serious respiratory illness have happened in crowded settings such as military training camps and college dorms.',
      actions: [
        'Stay home until your symptoms are getting better and you have had no fever for 24 hours without fever-reducing medicine. Cover coughs and sneezes.',
        'Wash your hands often, and do not touch your eyes with unwashed hands.',
        'If you have pink eye, do not share towels, pillows, or eye makeup, and stop wearing contact lenses until your eyes heal.',
        'Call your clinician if you have trouble breathing, a fever that lasts more than a few days, or eye pain or blurry vision.',
      ],
    },
    'older-adults': {
      risk: 'lower',
      summary:
        'Adenovirus is usually mild at this age. People with heart or lung disease have a higher risk of serious illness.',
      actions: [
        'Keep heart and lung conditions, such as COPD (chronic obstructive pulmonary disease), well managed.',
        'Call your clinician if a respiratory illness makes your breathing or a long-term condition worse.',
        'Wash your hands often, especially when caring for grandchildren who are sick.',
        'Ask your clinician which vaccines (flu, COVID-19, pneumococcal, and RSV if you are at higher risk) are right for you. They do not prevent adenovirus, but they protect against other serious lung infections.',
      ],
    },
    seniors: {
      risk: 'moderate',
      summary:
        'Older adults, especially those with heart or lung disease, can get pneumonia from adenovirus. Adenovirus can also cause outbreaks in nursing homes and other long-term care settings.',
      actions: [
        'Call your clinician if you have a fever with cough or shortness of breath, or if you feel much worse after a few days.',
        'If you live in a nursing home or assisted living, tell staff right away about symptoms or pink eye.',
        'Wash your hands often, and avoid touching your eyes, nose, and mouth.',
        'Ask your clinician which vaccines, such as flu, COVID-19, RSV, and pneumococcal, are right for you. They do not prevent adenovirus, but they protect against other serious lung infections.',
      ],
    },
    pregnant: {
      risk: 'lower',
      summary:
        'There is no strong evidence that adenovirus is more serious during pregnancy. Pregnant people who care for young children may be exposed more often.',
      actions: [
        'Wash your hands often, especially after diaper changes and wiping noses.',
        'Ask your prenatal care provider or pharmacist before taking any cold or fever medicine.',
        'Call your provider if you have a fever, trouble breathing, or cannot keep fluids down.',
      ],
    },
    immunocompromised: {
      risk: 'highest',
      summary:
        'People with severely weakened immune systems, especially those who have had a stem cell (bone marrow) or organ transplant, have the highest risk. In them, adenovirus can spread through the body and cause serious infections of the lungs, liver, bladder, or gut. They can also shed the virus for months.',
      actions: [
        'Call your care team right away if you get a fever, cough, diarrhea, pink eye, or blood in your urine.',
        'Ask your care team whether you need testing. Some transplant programs check the blood for adenovirus.',
        'Ask the people you live with to wash their hands often and keep their distance when they are sick.',
        'Consider a well-fitting mask in crowded indoor places, and avoid close contact with people who are sick.',
      ],
    },
  },
  treatment: {
    summary:
      'Most adenovirus infections are mild and get better on their own, usually within a few days to a couple of weeks. There is no FDA-approved antiviral medicine for adenovirus, so treatment focuses on easing symptoms. Antibiotics do not help, because adenovirus is a virus. Adenovirus sore throat can look like strep throat, so your clinician may test for strep before deciding whether antibiotics are needed.',
    options: [
      {
        name: 'Rest, fluids, and fever or pain relievers',
        type: 'supportive',
        detail:
          'Rest and drink plenty of fluids. Acetaminophen or ibuprofen can ease fever, sore throat, and aches. Follow the label or your clinician’s advice for age and weight. Call your clinician before giving any fever medicine to a baby younger than 3 months, and do not give ibuprofen to babies under 6 months unless your clinician says to. Never give aspirin to children or teens, because it can cause Reye’s syndrome, a rare but serious illness.',
        who: 'Everyone with adenovirus illness.',
      },
      {
        name: 'Cool compresses and artificial tears for pink eye',
        type: 'supportive',
        detail:
          'A clean, cool, damp cloth over the eyes and lubricating eye drops (artificial tears) can ease discomfort. Antibiotic eye drops do not help viral pink eye. Use a fresh cloth each time, and do not share eye drops.',
        who: 'People with pink eye from adenovirus.',
      },
      {
        name: 'Eye care from a specialist',
        type: 'other',
        detail:
          'A severe adenovirus eye infection (epidemic keratoconjunctivitis) can cause pain, light sensitivity, and blurry vision that lasts for weeks. An eye care provider may recommend other treatments.',
        who: 'People with eye pain, light sensitivity, or vision changes.',
      },
      {
        name: 'Hospital care',
        type: 'supportive',
        detail:
          'People with severe pneumonia or dehydration may need oxygen, fluids through a vein (IV), or breathing support in the hospital.',
        who: 'People who are very sick, especially young children, older adults, and people with weakened immune systems.',
      },
      {
        name: 'Antiviral medicine (such as cidofovir)',
        type: 'antiviral',
        detail:
          'No antiviral medicine is FDA-approved to treat adenovirus. Specialists sometimes use cidofovir for severe or spreading adenovirus infections in people with very weak immune systems. It can harm the kidneys and is not used for ordinary adenovirus illness.',
        who: 'Only people with severely weakened immune systems and serious adenovirus disease, as decided by a specialist.',
      },
    ],
    antibioticsHelp: 'no',
  },
  prevention: {
    vaccines: [
      {
        name: 'Adenovirus Type 4 and Type 7 Vaccine, Live, Oral (military only)',
        who: 'U.S. military personnel ages 17 through 50, mainly recruits in basic training. It is not available to the general public.',
        notes:
          'It protects only against adenovirus types 4 and 7, which have caused outbreaks of respiratory illness among military recruits. There is no adenovirus vaccine for children or other adults.',
      },
    ],
    everyday: [
      'Wash your hands often with soap and water for at least 20 seconds.',
      'Avoid touching your eyes, nose, and mouth with unwashed hands.',
      'Avoid close contact with people who are sick, and stay home when you are sick.',
      'Cover coughs and sneezes with a tissue or your elbow.',
      'Clean shared surfaces and toys with a bleach solution or an EPA-registered disinfectant that lists adenovirus on its label. Adenoviruses resist some common cleaners.',
      'Do not share towels, pillowcases, eye drops, or eye makeup, especially when someone has pink eye.',
      'Stay out of swimming pools and hot tubs while you are sick, and try not to swallow pool water.',
    ],
  },
  testing:
    'Most adenovirus infections are diagnosed by symptoms, and testing is often not needed. A clinician may test a swab from the nose, throat, or eye with a PCR test (a lab test that finds the virus’s genetic material). This is often part of a multiplex panel, one test that checks for many germs at once, such as the BioFire Respiratory Panel. Testing is more common for babies, people in the hospital, people with weakened immune systems, and during outbreaks. Some eye clinics have a rapid in-office test for adenovirus pink eye. Adenovirus can be found for weeks after an illness, and it is often found together with other viruses. So a positive result does not always mean it caused the current illness. Because adenovirus sore throat can look like strep, your clinician may also test for strep. Home COVID-19 and flu tests do not detect adenovirus.',
  whenToSeekCare: [
    'Call your clinician if a child under 2 has a fever for more than 24 hours, or if anyone older has a fever for more than 3 days.',
    'Call if a sore throat is severe, especially with fever and no cough, because you may need a strep test.',
    'Call or see an eye care provider soon if pink eye comes with eye pain, sensitivity to light, blurry vision, or intense redness, or if it is not getting better.',
    'Call your care team early if you have a weakened immune system and get a fever, cough, diarrhea, or pink eye.',
    'Go to urgent care if you or your child needs to be seen today but has no emergency warning signs. Examples include a worsening cough, ear pain, or drinking less than usual.',
    'Call 911 or go to the emergency department for any emergency warning sign, such as trouble breathing, bluish lips, or confusion.',
  ],
  readingTheNumbers:
    'MN Pulse tracks respiratory adenovirus with two kinds of lab data. Test positivity is the share of PCR lab tests for adenovirus that come back positive. It comes from Minnesota labs that report to MDH, and from CDC’s lab network (NREVSS) for HHS Region 5: Minnesota, Wisconsin, Illinois, Indiana, Michigan, and Ohio. The BioFire detection rate is the share of BioFire respiratory panel tests at participating Midwest labs (or nationwide, when Midwest data are not available) that find adenovirus. These tests are done mostly on people sick enough to visit a clinic, emergency department, or hospital, often children and people at higher risk. So the numbers show trends among tested patients, not how many people are sick. Adenovirus has no strong season. In BioFire data it is found at a fairly steady rate all year, lower than rhinovirus/enterovirus, and often along with another virus. So small week-to-week changes are normal. A rise that lasts several weeks may mean more adenovirus is spreading, sometimes from outbreaks in schools, child care, or long-term care. Emergency department data do not track adenovirus. Minnesota wastewater testing tracks only the stomach types (40 and 41), not the respiratory types. For most people, a lasting rise is a reminder to wash hands, keep sick children home, and not share towels if someone has pink eye. Numbers for the most recent week or two may be revised.',
  watchNotes: [
    'Some adenovirus types, such as types 7 and 14, have caused uncommon but severe outbreaks of pneumonia in the U.S., sometimes even in healthy adults. Public health labs can identify the type when an outbreak is investigated.',
    'As of October 2026, adenovirus still has no FDA-approved antiviral medicine and no vaccine for the general public. Handwashing, cleaning shared surfaces, and staying home when sick remain the main ways to prevent spread.',
  ],
  sources: [
    { label: 'CDC — About adenovirus', url: 'https://www.cdc.gov/adenovirus/about/' },
    {
      label: 'CDC — Adenovirus guidelines for outbreaks (for health care providers)',
      url: 'https://www.cdc.gov/adenovirus/hcp/outbreaks/index.html',
    },
    {
      label: 'CDC — Preventing spread of respiratory viruses when you’re sick',
      url: 'https://www.cdc.gov/respiratory-viruses/prevention/precautions-when-sick.html',
    },
    { label: 'CDC — NREVSS dashboard', url: 'https://www.cdc.gov/nrevss/php/dashboard/index.html' },
    {
      label: 'Meyers et al. — Automated real-time collection of pathogen-specific diagnostic data (BioFire Syndromic Trends), JMIR Public Health and Surveillance, 2018',
      url: 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC6054708/',
    },
    {
      label: 'MDH — Viral respiratory illness in Minnesota: laboratory data',
      url: 'https://www.health.state.mn.us/diseases/respiratory/stats/lab.html',
    },
    { label: 'BioFire Syndromic Trends (bioMérieux)', url: 'https://syndromictrends.com/' },
    {
      label: 'bioMérieux — Syndromic Trends reports',
      url: 'https://www.biomerieux.com/us/en/education/resource-hub/trends-reports.html',
    },
  ],
  lastReviewed: '2026-10-07',
}

export default profile
