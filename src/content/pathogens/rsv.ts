import type { PathogenProfile } from '../types'

const profile: PathogenProfile = {
  id: 'rsv',
  name: 'Respiratory syncytial virus (RSV)',
  shortName: 'RSV',
  aka: ['Human respiratory syncytial virus'],
  category: 'respiratory-viral',
  kind: 'virus',
  biofireTargets: ['Respiratory Syncytial Virus'],
  oneLiner: 'A common winter virus that feels like a cold for most people but can be serious for babies and older adults.',
  overview:
    'RSV is a very common virus: almost all children have had it by their second birthday, and people can catch it again throughout life. In most people it causes a cold, but it can spread to the lungs and cause bronchiolitis (swelling of the small airways) or pneumonia. RSV is the leading cause of hospital stays for babies in the U.S., and it also puts many older adults in the hospital each winter. Babies can be protected by a vaccine given during pregnancy or by an antibody shot, and many older adults can get a one-time vaccine.',
  seasonality: {
    summary:
      'In Minnesota, RSV usually starts to rise in October or November, peaks between December and February, and fades by spring. The exact timing shifts from year to year. Recent Minnesota peaks have come as early as mid-November (2022) and as late as early March (2026). Infant RSV protection is timed to this season, which runs about October through March in most of the U.S.',
    peakMonths: [12, 1, 2],
  },
  transmission:
    'RSV spreads when an infected person coughs or sneezes and droplets reach your eyes, nose, or mouth. It also spreads through direct contact, such as kissing a baby’s face, and by touching a surface with the virus on it and then touching your face. RSV can live for many hours on hard surfaces like tables and crib rails, and for a shorter time on hands and tissues.',
  incubation: 'Symptoms usually start 4 to 6 days after a person is infected.',
  contagiousPeriod:
    'People with RSV are usually contagious for 3 to 8 days, and may be contagious a day or two before they feel sick. Some babies and people with weakened immune systems can keep spreading the virus for as long as 4 weeks, even after symptoms stop.',
  symptoms: {
    common: [
      'Runny or stuffy nose',
      'Cough',
      'Sneezing',
      'Fever',
      'Eating or drinking less (babies may feed poorly)',
      'Wheezing (a whistling sound when breathing out)',
    ],
    lessCommon: [
      'In very young babies, fussiness, low energy, and trouble breathing may be the only signs, sometimes with no fever',
      'Ear infection',
      'Sore throat or headache',
      'Bronchiolitis (swelling of the small airways in the lungs) or pneumonia',
      'Worsening of asthma, COPD (chronic obstructive pulmonary disease), or heart failure in adults',
    ],
    emergencyWarningSigns: [
      'Fast, hard, or shallow breathing',
      'Skin pulling in between or below the ribs or at the neck with each breath, flaring nostrils, grunting, or head bobbing',
      'Pauses in breathing in a baby',
      'Bluish or gray color of the lips, tongue, nails, or skin',
      'Not drinking or feeding, with few or no wet diapers or very little urine',
      'Very sleepy, hard to wake, limp, or not responding',
      'In adults: severe shortness of breath, chest pain or pressure, new confusion, or a sudden worsening of heart or lung disease',
    ],
  },
  ageGroups: {
    infants: {
      risk: 'highest',
      summary:
        'Babies, especially those younger than 6 months and those born early, are the most likely to get very sick from RSV. RSV can inflame the small airways and make it hard for a baby to breathe or feed.',
      actions: [
        'Ask your clinician about one dose of an RSV antibody (Beyfortus or Enflonsia) for your baby’s first RSV season. Most babies do not need it if the mother got the RSV vaccine at least 14 days before birth. In a few special cases, a clinician may still advise it.',
        'If your baby is born October through March, the antibody is best given in the first week of life, often before leaving the hospital. If your baby was born April through September, plan for it shortly before RSV season starts, usually in October.',
        'Keep sick people away from your baby, ask visitors to wash their hands, and avoid kissing a baby’s face when you are sick.',
        'Use saline drops and gentle suction to clear a stuffy nose, especially before feeds.',
        'Call your clinician right away if a baby younger than 3 months has a fever of 100.4°F (38°C) or higher, taken rectally (in the bottom).',
      ],
    },
    children: {
      risk: 'moderate',
      summary:
        'Toddlers and young children often get RSV in child care or school. Most have a cold, but children under 5 and those with asthma, heart or lung disease, or weak immune systems can get wheezing or pneumonia.',
      actions: [
        'Ask whether your child qualifies for an RSV antibody before a second RSV season. This applies to some children 8 to 19 months old. One example is lung disease from being born early that needed treatment in the 6 months before the season. A severely weakened immune system, or cystic fibrosis with severe lung disease or poor growth, can also qualify.',
        'American Indian and Alaska Native children 8 to 19 months old are also recommended to get an RSV antibody before their second season.',
        'Keep children home from school or child care while they have a fever.',
        'Teach handwashing and coughing into an elbow, and keep sick siblings away from newborns.',
        'If your child has asthma, follow their asthma action plan and call if wheezing gets worse.',
      ],
    },
    adults: {
      risk: 'lower',
      summary:
        'Most healthy adults under 50 have a cold-like illness that gets better in 1 to 2 weeks. Risk is higher for adults with chronic heart or lung disease or a weakened immune system.',
      actions: [
        'Rest, drink fluids, and stay home while you have a fever.',
        'Stay away from babies, older relatives, and people with weak immune systems while you are sick.',
        'If you have a chronic heart or lung condition or a weakened immune system, ask your clinician about RSV vaccine. Some RSV vaccines are FDA-approved for adults under 50 at higher risk, but CDC’s recommendation starts at age 50.',
        'If you are pregnant, see the pregnancy guidance.',
      ],
    },
    'older-adults': {
      risk: 'moderate',
      summary:
        'Adults 50 to 64 with chronic health conditions can get seriously ill from RSV, and it can trigger flare-ups of COPD, asthma, or heart failure. CDC recommends a single RSV vaccine dose for people in this age group who are at increased risk.',
      actions: [
        'Ask your clinician about one dose of RSV vaccine if you have a condition that raises your risk. These include long-term heart or lung disease, advanced kidney disease or dialysis, chronic liver disease, diabetes with complications or that needs insulin, or a weakened immune system.',
        'Other conditions also count, such as sickle cell disease, nerve or muscle conditions that make it hard to cough or breathe, severe obesity, or living in a nursing home. Your clinician can also consider frailty or other health problems.',
        'Get it in late summer or early fall if you can, before RSV season, though it can be given at any time.',
        'Remember it is one dose, not a yearly shot. If you already had an RSV vaccine, another dose is not recommended at this time.',
        'Call your clinician early if your breathing, heart failure, COPD, or asthma gets worse.',
      ],
    },
    seniors: {
      risk: 'highest',
      summary:
        'Risk of severe RSV rises with age and is greatest at 75 and older. Each winter RSV puts many older adults in the hospital, and it can worsen heart and lung disease. CDC recommends a single RSV vaccine dose for everyone 75 and older and for adults 65 to 74 at increased risk.',
      actions: [
        'If you are 75 or older, ask about one dose of RSV vaccine (Arexvy, Abrysvo, or mResvia). If you are 65 to 74, ask about it if you have heart or lung disease or another condition that raises your risk, or if you live in a nursing home.',
        'Aim for late summer or early fall, before RSV season.',
        'If you already got an RSV vaccine in an earlier season, you do not need another dose at this time.',
        'Seek care early for worsening shortness of breath, chest pain, or confusion.',
        'Stay away from newborns and young babies when you have cold symptoms.',
      ],
    },
    pregnant: {
      risk: 'lower',
      summary:
        'For most pregnant people, RSV feels like a cold. The main concern is the baby: an RSV vaccine late in pregnancy passes protection to the baby for the first months of life.',
      actions: [
        'Ask about the RSV vaccine (Abrysvo) at 32 through 36 weeks of pregnancy if those weeks fall between September and January.',
        'Talk with your clinician about choosing the maternal vaccine or an antibody shot for your baby after birth. Most babies need one or the other, not both.',
        'If you got an RSV vaccine in an earlier pregnancy, plan for your baby to get an RSV antibody instead. Another vaccine dose is not currently recommended.',
        'Call your clinician if you have trouble breathing or a fever that does not go away.',
      ],
    },
    immunocompromised: {
      risk: 'higher',
      summary:
        'People with weakened immune systems, such as transplant recipients or people getting cancer treatment, can get more severe RSV and may stay sick and contagious longer.',
      actions: [
        'If you are 50 or older, ask about one dose of RSV vaccine. If you are younger than 50, ask your clinician whether a vaccine makes sense for you. IDSA’s 2026 guideline supports RSV vaccination for many people with weakened immune systems.',
        'Children 8 to 19 months old with a severely weakened immune system may qualify for an RSV antibody before their second season.',
        'Contact your care team early if you get cold symptoms with fever or trouble breathing.',
        'Ask household members to wash hands often and stay away when they are sick.',
      ],
    },
  },
  treatment: {
    summary:
      'There is no medicine that cures RSV. Most people get better on their own in 1 to 2 weeks with rest and fluids. Babies and older adults who have trouble breathing or cannot drink enough may need hospital care for oxygen and fluids, and most hospital stays last a few days. For babies with bronchiolitis, the American Academy of Pediatrics advises against routine use of inhalers, steroids, or antibiotics because they usually do not help. RSV antibody shots and vaccines prevent illness; they are not a treatment for someone who is already sick.',
    options: [
      {
        name: 'Home care: rest, fluids, and fever relief',
        type: 'supportive',
        detail:
          'Rest and drink plenty of fluids. Acetaminophen or ibuprofen can ease fever and aches; follow the label or your clinician’s advice for age and weight. Call your clinician before giving any fever medicine to a baby younger than 3 months, and do not give ibuprofen to babies under 6 months unless your clinician says to. Never give aspirin to children or teens.',
        who: 'Most people with mild illness',
      },
      {
        name: 'Saline drops and nasal suction',
        type: 'supportive',
        detail:
          'Saline (salt-water) drops and a bulb syringe or nasal aspirator can clear mucus so a baby can breathe and feed more easily. Do not give over-the-counter cough and cold medicines to children under 4 unless your clinician says it is OK.',
        who: 'Babies and young children with a stuffy nose',
      },
      {
        name: 'Hospital care',
        type: 'supportive',
        detail:
          'Oxygen, fluids through an IV or feeding tube, suctioning of mucus, and sometimes breathing support. For a few people with severely weakened immune systems, specialists may consider an antiviral medicine.',
        who: 'People with trouble breathing, low oxygen, or dehydration',
      },
      {
        name: 'Antibiotics (only for a bacterial complication)',
        type: 'antibiotic',
        detail:
          'Antibiotics do not work against RSV. A clinician may prescribe them only if a bacterial infection, such as an ear infection or bacterial pneumonia, develops.',
        who: 'Only people diagnosed with a bacterial infection',
      },
    ],
    antibioticsHelp: 'no',
  },
  prevention: {
    vaccines: [
      {
        name: 'Nirsevimab (Beyfortus), an infant RSV antibody',
        who: 'Babies younger than 8 months in their first RSV season (about October through March). This applies if the mother did not get the RSV vaccine in pregnancy or it is not known whether she did. It also applies if the baby was born less than 14 days after her vaccine. Some children 8 to 19 months old can get a dose before their second season. This includes children with lung disease from being born early, a severely weakened immune system, or cystic fibrosis with severe lung disease, and American Indian and Alaska Native children.',
        notes:
          'One shot. It is a ready-made antibody, not a vaccine, so protection starts right away and lasts through the season. Recommended by CDC and the American Academy of Pediatrics. Of the two long-acting infant antibodies, it is the only one recommended for a second season. In rare cases, a clinician may advise it even after the maternal vaccine.',
      },
      {
        name: 'Clesrovimab (Enflonsia), an infant RSV antibody',
        who: 'Babies younger than 8 months in their first RSV season who are not protected by a maternal vaccine.',
        notes:
          'FDA-approved in June 2025 for a baby’s first RSV season only. The American Academy of Pediatrics lists it as an equal choice to nirsevimab for the first season, and CDC’s infant RSV guidance lists it alongside nirsevimab. CDC’s vaccine advisory committee voted to recommend it in June 2025. That committee’s votes are part of an ongoing federal court case (see the notes below), so ask your clinician about availability and coverage.',
      },
      {
        name: 'Maternal RSV vaccine (Abrysvo)',
        who: 'Pregnant people at 32 through 36 weeks of pregnancy, given September through January in most of the continental U.S., so the baby is born with protection.',
        notes:
          'Recommended by CDC and the American College of Obstetricians and Gynecologists. Abrysvo is the only RSV vaccine approved for use in pregnancy. It is given only at 32 through 36 weeks as a precaution, because studies raised a possible small risk of early (preterm) birth. If the vaccine was given in an earlier pregnancy, the baby should get an RSV antibody instead of a repeat vaccine dose.',
      },
      {
        name: 'Adult RSV vaccines (Arexvy, Abrysvo, mResvia)',
        who: 'CDC recommends a single dose for all adults 75 and older and for adults 50 to 74 at increased risk. Increased risk includes long-term heart or lung disease, advanced kidney disease or dialysis, chronic liver disease, and diabetes with complications or that needs insulin. It also includes sickle cell disease and other blood disorders, and nerve or muscle conditions that make it hard to cough or breathe. So do severe obesity, a weakened immune system, living in a nursing home, and other conditions your clinician thinks raise your risk, such as frailty.',
        notes:
          'One dose, not a yearly shot. If you already had one, another dose is not recommended at this time. Best given in late summer or early fall. Some of these vaccines are FDA-approved for adults under 50 at higher risk; talk with your clinician. FDA added a warning about a small risk of Guillain-Barré syndrome (a rare nerve disorder) to the Abrysvo and Arexvy labels.',
      },
    ],
    everyday: [
      'Wash hands often with soap and water for at least 20 seconds.',
      'Cover coughs and sneezes with a tissue or your elbow.',
      'Stay home when you are sick, and keep sick children home from child care and school.',
      'Keep people with colds away from newborns, and avoid kissing babies’ faces when you are sick.',
      'Clean often-touched surfaces such as toys, doorknobs, and phones.',
      'Do not smoke or vape around babies and children.',
    ],
  },
  testing:
    'A clinician can test a nose swab with a rapid test or a lab (PCR) test. This is sometimes part of a multi-virus panel that also checks for flu, COVID-19, and other viruses. Testing matters most for babies, older adults, people in the hospital, and people with weakened immune systems. Healthy people with a mild cold often do not need a test. If you use a home test, check the label: many home tests detect only COVID-19 and flu. A negative rapid test does not always rule out RSV, especially in adults.',
  whenToSeekCare: [
    'Call 911 or go to the emergency department for any emergency warning sign, such as struggling to breathe, pauses in breathing, or blue or gray lips.',
    'Call your clinician right away if a baby younger than 3 months has a fever of 100.4°F (38°C) or higher, taken rectally (in the bottom).',
    'Call your clinician the same day if a baby or young child is feeding or drinking much less than usual or has fewer wet diapers.',
    'Call your clinician if symptoms get worse after a few days, a fever lasts more than 2 to 3 days, or a child has ear pain.',
    'Adults 65 and older, and anyone with heart or lung disease or a weakened immune system, should call early if breathing gets worse.',
    'Urgent care can help with a worsening cough or ear pain when your regular clinic is closed. Go to the emergency department, not urgent care, for trouble breathing.',
  ],
  readingTheNumbers:
    'MN Pulse shows several RSV signals. Test positivity is the share of RSV lab tests that come back positive among people who were tested. It comes from Minnesota labs that report to MDH and from CDC’s lab network for Minnesota and five nearby states (HHS Region 5). It is not the share of people infected. In recent winters, regional positivity peaked at about 10% to 25%, and it was under 1% in late summer 2026. BioFire detection rate is the share of multi-virus panel tests at participating labs in the Midwest (or nationwide, when regional data are not available) that find RSV. No Minnesota-only BioFire data are public. These lab tests are mostly done for babies, young children, and people sick enough to go to a hospital or emergency department. So they show how much serious breathing illness is due to RSV, not how many people are infected. ED-visit % is the share of all emergency department visits diagnosed as RSV. Most RSV emergency visits are for babies and young children, so the statewide share stays small even at the peak. It peaked at about 0.9% to 2.4% in each of the last four winters and is close to 0% in late summer. Watch the trend, not the size of the number. A small statewide rise can mean busy children’s emergency departments. Hospital numbers show weekly RSV hospital admissions in Minnesota and hospital rates per 100,000 people, and MDH also reports RSV hospital rates by county. Wastewater testing at Minnesota treatment plants measures RSV in sewage and can show a change early. RSV numbers often start rising in October or November. A steady rise for two or more weeks means RSV is spreading in your community. For most people, that means a higher chance a winter cold is RSV. It is also the time to make sure babies, pregnant people at 32 to 36 weeks, and older adults who qualify are protected. Keep sick people away from newborns. Numbers for the most recent week or two may be revised.',
  watchNotes: [
    'In the week ending September 26, 2026, Minnesota had very few RSV emergency visits (about 0.01% of all visits) and RSV hospital admissions, which is typical before the season starts. The 2026–27 window for infant antibodies runs about October through March, and the maternal vaccine is given September through January.',
    'In January 2026, the U.S. Department of Health and Human Services (HHS) issued a revised childhood immunization schedule that narrowed several recommendations. In March 2026, a federal court paused that schedule and the votes of CDC’s vaccine advisory committee, whose members were replaced in 2025. The case is still ongoing, so federal guidance could change. Ask your clinician what applies now.',
    'In its 2026–27 guidance, the American Academy of Pediatrics continues to recommend an RSV antibody (nirsevimab or clesrovimab, with no preference) for all babies younger than 8 months entering their first RSV season. The exception is when the mother got the RSV vaccine at least 14 days before birth.',
    'For 2026–27, CDC and the American Academy of Family Physicians recommend one dose of RSV vaccine for everyone 75 and older and for adults 50 to 74 at increased risk. Repeat doses are not recommended at this time.',
  ],
  sources: [
    { label: 'CDC — RSV vaccines', url: 'https://www.cdc.gov/rsv/vaccines/index.html' },
    { label: 'CDC — RSV in infants and young children', url: 'https://www.cdc.gov/rsv/infants-young-children/index.html' },
    { label: 'CDC — RSV vaccines for adults', url: 'https://www.cdc.gov/rsv/vaccines/adults.html' },
    { label: 'CDC — RSV vaccine guidance for adults (for clinicians)', url: 'https://www.cdc.gov/rsv/hcp/vaccine-clinical-guidance/adults.html' },
    { label: 'CDC — RSV immunization: information for health care providers', url: 'https://www.cdc.gov/vaccines/hcp/by-disease/rsv.html' },
    { label: 'CDC — Clinical overview of RSV', url: 'https://www.cdc.gov/rsv/hcp/clinical-overview/index.html' },
    { label: 'CDC — How RSV spreads', url: 'https://www.cdc.gov/rsv/causes/index.html' },
    { label: 'American Academy of Pediatrics — RSV resources', url: 'https://www.aap.org/rsv' },
    {
      label: 'Pharmacy Times (Sept. 2026) — AAP issues 2026–2027 guidance on RSV and COVID-19 immunization',
      url: 'https://www.pharmacytimes.com/view/aap-issue-2026-2027-guidance-on-rsv-and-covid-19-immunization',
    },
    {
      label: 'Contemporary OB/GYN (Sept. 2026) — ACOG 2026–27 respiratory virus immunization recommendations in pregnancy',
      url: 'https://www.contemporaryobgyn.net/view/acog-2026-27-respiratory-virus-immunization-recommendations-pregnancy',
    },
    {
      label: 'American Academy of Family Physicians — 2026–2027 influenza, RSV, and COVID-19 vaccine guidance (PDF)',
      url: 'https://www.aafp.org/assets/image/upload/v1788277985/pdf_2026_through_2027_influenza_rsv_sars_covid_2_guidance.pdf',
    },
    {
      label: 'Guideline Central — IDSA 2026 guideline on seasonal vaccines for immunocompromised patients (summary)',
      url: 'https://www.guidelinecentral.com/insights/sep-2026-idsa-seasonalvaccinesimmunocompromisedpatients-guideline-spotlight/',
    },
    {
      label: 'American College of Physicians (March 2026) — Federal judge blocks immunization schedule changes, stays ACIP member appointments',
      url: 'https://www.acponline.org/acp-newsroom/federal-judge-blocks-immunization-schedule-changes-stays-acip-member-appointments',
    },
    {
      label: 'MDH health advisory (Jan. 2026) — MDH aligns with medical association immunization recommendations',
      url: 'https://www2cdn.web.health.state.mn.us/communities/ep/han/2026/jan7imz.pdf',
    },
    { label: 'MDH — Viral respiratory illness in Minnesota', url: 'https://www.health.state.mn.us/diseases/respiratory/stats/index.html' },
    { label: 'MDH — Respiratory laboratory surveillance data', url: 'https://www.health.state.mn.us/diseases/respiratory/stats/lab.html' },
    {
      label: 'MDH — Respiratory hospitalizations (RESP-NET), including by county',
      url: 'https://www.health.state.mn.us/diseases/respiratory/stats/hosp.html',
    },
    { label: 'CDC NREVSS — Respiratory virus lab test positivity dashboard', url: 'https://www.cdc.gov/nrevss/php/dashboard/index.html' },
    { label: 'CDC RESP-NET — Respiratory virus hospitalization dashboard', url: 'https://www.cdc.gov/resp-net/dashboard/index.html' },
    {
      label: 'CDC NSSP — Emergency department visit data by state and county',
      url: 'https://data.cdc.gov/Public-Health-Surveillance/NSSP-Emergency-Department-Visit-Trajectories-by-St/rdmq-nq56',
    },
    { label: 'WastewaterSCAN data dashboard', url: 'https://data.wastewaterscan.org/' },
    { label: 'BIOFIRE Syndromic Trends (bioMérieux)', url: 'https://syndromictrends.com/' },
  ],
  lastReviewed: '2026-10-07',
}

export default profile
