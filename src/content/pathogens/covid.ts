import type { PathogenProfile } from '../types'

const profile: PathogenProfile = {
  id: 'covid',
  name: 'COVID-19 (SARS-CoV-2)',
  shortName: 'COVID-19',
  aka: ['COVID', 'SARS-CoV-2', 'coronavirus'],
  category: 'respiratory-viral',
  kind: 'virus',
  biofireTargets: ['Severe Acute Respiratory Syndrome Coronavirus 2 (SARS-CoV-2)'],
  oneLiner: 'The virus behind COVID-19 spreads year-round, often in summer and winter waves. Vaccines and early treatment cut serious illness.',
  overview:
    'COVID-19 is a respiratory illness caused by the SARS-CoV-2 coronavirus. The virus keeps changing into new variants, and the ones spreading now all come from the Omicron family. Most people recover in a week or so, but COVID-19 can still be severe, especially for older adults and people with weakened immune systems. Some people develop long COVID, with symptoms that last for months.',
  seasonality: {
    summary:
      'COVID-19 spreads all year in Minnesota. In recent years, activity has often risen in late summer (August and September) and again in winter (December and January). New variants can cause waves at other times.',
    peakMonths: [1, 8, 9, 12],
  },
  transmission:
    'The virus spreads when an infected person breathes out droplets and very small particles. Others breathe them in, especially at close range or in crowded indoor spaces with poor airflow, where particles can build up. Less often, it spreads by touching a surface and then your eyes, nose, or mouth. People can spread it before they have symptoms, and even if they never feel sick.',
  incubation: 'Symptoms usually start about 2 to 5 days after exposure, but can take up to 14 days.',
  contagiousPeriod:
    'People can spread the virus starting a day or two before symptoms begin. They are most contagious in the first few days of illness. Most people with mild illness are unlikely to spread the virus after about 10 days. People with weakened immune systems can stay contagious longer.',
  symptoms: {
    common: [
      'Sore throat',
      'Runny or stuffy nose',
      'Cough',
      'Tiredness (fatigue)',
      'Fever or chills',
      'Headache',
      'Muscle or body aches',
    ],
    lessCommon: [
      'Shortness of breath or trouble breathing',
      'New loss of taste or smell',
      'Nausea or vomiting',
      'Diarrhea',
      'Long COVID: symptoms such as fatigue, brain fog, shortness of breath, or feeling worse after activity that last 3 months or longer',
    ],
    emergencyWarningSigns: [
      'Trouble breathing',
      'Pain or pressure in the chest that does not go away',
      'New confusion',
      'Not able to wake up or stay awake',
      'Pale, gray, or blue-colored skin, lips, or nail beds, depending on skin tone',
      'Children: fast breathing, or ribs pulling in with each breath',
      'Children: signs of dehydration, such as no urine (pee) for 8 hours or not able to keep fluids down',
      'Babies younger than 12 weeks: any fever',
      'Children: severe stomach pain, especially in the weeks after COVID-19 (a possible sign of MIS-C)',
    ],
  },
  ageGroups: {
    infants: {
      risk: 'higher',
      summary:
        'Babies under 6 months are too young for a COVID-19 vaccine and have higher hospital rates than older children. Most recover, but young babies can have trouble breathing or feeding.',
      actions: [
        'ACOG (American College of Obstetricians and Gynecologists) recommends a COVID-19 vaccine during pregnancy. Antibodies pass to the baby and help protect it in the first months of life.',
        'Starting at 6 months, talk with your clinician about the 2026–27 COVID-19 vaccine. The American Academy of Pediatrics recommends it for all children 6 to 23 months. CDC leaves the choice for healthy babies to families and clinicians. Not every brand is approved for babies, so ask about availability and insurance coverage.',
        'Call your clinician if your baby has a fever, is feeding poorly, or has fewer wet diapers. Get prompt care for any fever in a baby younger than 12 weeks.',
        'Keep people who are sick away from your baby.',
      ],
    },
    children: {
      risk: 'lower',
      summary:
        'Most children have a mild illness, but kids with certain medical conditions can get very sick. A rare but serious problem called MIS-C (multisystem inflammatory syndrome in children) can appear 2 to 6 weeks after infection.',
      actions: [
        'Talk with your child’s clinician about the 2026–27 COVID-19 vaccine. The American Academy of Pediatrics recommends it for all children 6 to 23 months and for older children at higher risk. CDC recommends it for children with weakened immune systems. For other children, CDC says families and clinicians should decide together (shared decision-making).',
        'Test your child if they have symptoms, especially before visiting older or high-risk relatives.',
        'Keep sick children home until they have had no fever for at least 24 hours without fever medicine and feel better overall.',
        'Get care right away if your child has a lasting fever with stomach pain, vomiting, rash, red eyes, or unusual sleepiness in the weeks after COVID-19. These can be signs of MIS-C.',
      ],
    },
    adults: {
      risk: 'lower',
      summary:
        'Most healthy adults recover in about a week. Conditions such as obesity, diabetes, and heart or lung disease raise the risk of severe illness. Some people develop long COVID.',
      actions: [
        'Ask your clinician or pharmacist about a 2026–27 COVID-19 vaccine. CDC and the American Academy of Family Physicians recommend it for all adults. FDA approval for people under 65 covers those with a higher-risk condition.',
        'Test if you have symptoms. If a home test is negative, test again 48 hours later.',
        'If you have a higher-risk condition and test positive, contact a clinician the same day about treatment.',
        'Stay home while sick, and take extra care around others for 5 days after you return to normal activities.',
      ],
    },
    'older-adults': {
      risk: 'moderate',
      summary:
        'The risk of severe COVID-19 rises with age and with long-term health conditions, which are common in this age group. Early treatment can lower the chance of a hospital stay.',
      actions: [
        'Talk with your clinician or pharmacist about a 2026–27 COVID-19 vaccine this fall. CDC recommends it for all adults. FDA approval for people under 65 covers those with a higher-risk condition, which many people 50 to 64 have.',
        'If you test positive and have a long-term condition, ask about treatment right away. Pills like Paxlovid need to be started within 5 days of symptoms.',
        'Keep a few home tests on hand, and check their expiration dates.',
        'Ask about other vaccines you may be due for, such as flu, RSV, and pneumococcal.',
      ],
    },
    seniors: {
      risk: 'highest',
      summary:
        'People 65 and older, especially those 75 and older, have the highest risk of hospital stays and death from COVID-19. Staying up to date on vaccines and getting early treatment greatly lower that risk.',
      actions: [
        'Get a 2026–27 COVID-19 vaccine this fall. CDC recommends a second dose about 6 months later.',
        'If you test positive, contact your clinician the same day, even if symptoms are mild. Treatment pills need to be started within 5 days of symptoms (IV remdesivir within 7 days).',
        'Wear a well-fitting mask in crowded indoor places when COVID-19 is rising.',
        'If you live in a nursing home or assisted living, tell staff about symptoms right away.',
      ],
    },
    pregnant: {
      risk: 'higher',
      summary:
        'Pregnancy raises the risk of severe COVID-19, and infection can raise the chance of early (preterm) birth and other problems. Antibodies from a vaccine during pregnancy can help protect the baby in the first months of life.',
      actions: [
        'Talk with your clinician about a 2026–27 COVID-19 vaccine. ACOG (American College of Obstetricians and Gynecologists) recommends it during pregnancy, when planning pregnancy, after delivery, and while breastfeeding. Federal guidance for pregnancy changed in 2025.',
        'If you test positive, contact your clinician. Some COVID-19 treatments can be used during pregnancy.',
        'Treat fever with acetaminophen, as your clinician advises.',
      ],
    },
    immunocompromised: {
      risk: 'highest',
      summary:
        'People with moderately or severely weakened immune systems have a higher risk of severe COVID-19. Vaccines may work less well, and you may stay contagious longer.',
      actions: [
        'Get a 2026–27 COVID-19 vaccine. You may need more than one dose, so ask your care team for your schedule.',
        'Test at the first symptom and contact your care team the same day. Early treatment matters.',
        'Ask your specialist whether a preventive antibody treatment is available and right for you.',
        'Wear a well-fitting mask and look for good airflow in crowded indoor places. Ask the people you live with to stay up to date on vaccines.',
      ],
    },
  },
  treatment: {
    summary:
      'Most people recover at home with rest and fluids. For people at higher risk of severe illness, antiviral medicines lower the chance of a hospital stay or death. They need to be started early: within 5 days of symptoms for pills, or within 7 days for remdesivir. Contact a clinician as soon as you test positive if you are 65 or older or have a higher-risk condition. Antibiotics do not treat COVID-19, but your clinician may prescribe them for a bacterial infection that follows it.',
    options: [
      {
        name: 'Nirmatrelvir with ritonavir (Paxlovid)',
        type: 'antiviral',
        detail:
          'Pills taken twice a day for 5 days, started within 5 days of the first symptoms. It interacts with many common medicines, such as some statins, blood thinners, and heart rhythm drugs. Give your clinician or pharmacist a full list of what you take. Tell your clinician if you have kidney or liver disease, because the dose may need to change or another treatment may be better. Some people notice a bad taste. Symptoms sometimes return briefly after treatment ends.',
        who: 'Adults at higher risk of severe COVID-19. Teens 12 and older who weigh at least 88 pounds may also qualify; ask your clinician.',
      },
      {
        name: 'Remdesivir (Veklury)',
        type: 'antiviral',
        detail:
          'Given through a vein (IV) in a clinic for 3 days in a row, started within 7 days of the first symptoms. It is also used in the hospital.',
        who: 'Adults and children at higher risk of severe COVID-19, especially when pills are not a good fit. Babies must be at least 4 weeks old and weigh at least about 7 pounds.',
      },
      {
        name: 'Molnupiravir (Lagevrio)',
        type: 'antiviral',
        detail:
          'Pills taken twice a day for 5 days, started within 5 days of the first symptoms. It is used when other treatments are not available or not a good fit. It is not recommended during pregnancy.',
        who: 'Adults 18 and older at higher risk of severe COVID-19.',
      },
      {
        name: 'Hospital care',
        type: 'other',
        detail:
          'People who are hospitalized may get oxygen, steroid medicines such as dexamethasone, and other treatments that calm the immune system. Steroids help only people who need extra oxygen. They are not recommended for mild COVID-19 at home.',
        who: 'People with severe COVID-19.',
      },
      {
        name: 'Rest, fluids, and fever reducers',
        type: 'supportive',
        detail:
          'Rest and drink plenty of fluids. Acetaminophen or ibuprofen can ease fever and aches; follow the label for age and weight. Do not give aspirin to children or teens.',
        who: 'Everyone with COVID-19.',
      },
    ],
    antibioticsHelp: 'no',
  },
  prevention: {
    vaccines: [
      {
        name: '2026–27 COVID-19 vaccines (Pfizer-BioNTech Comirnaty, Moderna Spikevax and mNEXSPIKE, Novavax Nuvaxovid)',
        who: 'CDC recommends a 2026–27 dose for all adults 18 and older, plus a second dose about 6 months later for adults 65 and older. For children 6 months to 17 years, CDC recommends it for those with a moderately or severely weakened immune system. For other children, CDC says families and clinicians should decide together (shared decision-making). The American Academy of Family Physicians recommends it for all adults. The American Academy of Pediatrics recommends it for all children 6 to 23 months and for older children at higher risk. ACOG recommends it during pregnancy. The Minnesota Department of Health bases its guidance on these professional groups’ recommendations.',
        notes:
          'FDA approved these updated vaccines in late August 2026. They target XFG, a strain in the JN.1 family of Omicron variants (the group of COVID-19 variants spreading now). FDA approval covers adults 65 and older and younger people with at least one condition that raises their risk. Age limits vary by brand, and not every brand is approved for young children. Comirnaty, Spikevax, and mNEXSPIKE are mRNA vaccines, which give your cells instructions to make a harmless piece of the virus. Nuvaxovid is a protein-based (non-mRNA) option. People with weakened immune systems may need more than one dose. If you recently had COVID-19, you may consider waiting about 3 months. A rare side effect of mRNA vaccines is myocarditis (heart inflammation), seen mostly in teen and young adult males.',
      },
    ],
    everyday: [
      'Keep home tests on hand and test when you have symptoms or before visiting someone at higher risk.',
      'Stay home when sick until you have had no fever for at least 24 hours (without fever medicine) and feel better overall. Then take extra care, like masking, for 5 more days.',
      'Bring in fresh air: open windows when you can, and use good filters in your heating and cooling system or a portable HEPA air cleaner.',
      'Consider a well-fitting mask in crowded indoor places when COVID-19 is rising, especially if you or someone you live with is at higher risk.',
      'Wash your hands often and cover coughs and sneezes.',
    ],
  },
  testing:
    'Rapid antigen home tests give results in about 15 minutes. If you have symptoms and test negative, test again 48 hours later. If you were exposed but feel fine, wait at least 5 days, then test up to 3 times, 48 hours apart. Lab molecular (PCR) tests are more sensitive and can find the virus earlier. Some home tests check for both COVID-19 and flu. Check the expiration date; FDA has extended the dates on many home tests.',
  whenToSeekCare: [
    'If you test positive and are 65 or older, live in a nursing home, or have a condition that raises your risk, contact a clinician the same day. Treatment pills are meant to be started within 5 days of symptoms (7 days for IV remdesivir), so do not wait. If it has been longer, still call, especially if you are getting sicker.',
    'Call your clinician if symptoms get worse after the first few days or you feel short of breath with normal activity.',
    'Talk with your clinician if symptoms last more than 4 weeks or new symptoms appear after you recover. Symptoms that last 3 months or longer are called long COVID.',
    'Use telehealth, a same-day clinic, or urgent care if you need help today but have no emergency warning signs.',
    'Call 911 or go to the emergency department for any emergency warning sign, such as trouble breathing, chest pain, or new confusion.',
  ],
  readingTheNumbers:
    'COVID-19 test positivity is the share of lab COVID-19 tests that come back positive. Most people now test at home, and those results usually are not reported. So lab numbers mostly reflect people who see a clinician or go to the hospital. They show how much illness among people who get tested is COVID-19, not how many Minnesotans are infected. That makes them better for spotting trends than for counting cases. The BioFire detection rate is the share of multi-virus respiratory panel tests at participating labs in the Midwest that find SARS-CoV-2. These panels are run mostly in hospitals and emergency departments. The rate shows how much COVID-19 adds to all the respiratory illness going around. The ED-visit percent is the share of all emergency department visits diagnosed as COVID-19. Since 2023 in Minnesota, it has ranged from under 0.1% at the quietest times to about 4.5% at the highest peak (December 2023). Waves since then have been smaller. Weekly COVID-19 hospital admissions count people with lab-confirmed COVID-19 newly admitted to Minnesota hospitals, as reported to CDC. The rate per 100,000 residents makes it easier to compare with other places and past seasons. Wastewater levels measure virus in sewage from a whole community, including people who never test. They can rise before clinic and hospital numbers do. A steady rise over 2 to 3 weeks means more virus is spreading. For most people, that means: stay home when sick and keep tests on hand. If you are at higher risk, consider masking in crowded indoor places and have a plan to get treatment quickly. Numbers for the most recent week or two are often revised.',
  watchNotes: [
    'As of the week ending September 26, 2026, COVID-19 made up about 0.3% of emergency department visits in Minnesota. There were 29 new COVID-19 hospital admissions statewide that week. Numbers had risen since early August, but this late-summer rise was much smaller than in 2024 or 2025.',
    'Updated 2026–27 COVID-19 vaccines target XFG, a strain in the JN.1 Omicron family. FDA advisers chose XFG in May 2026, and FDA approved the vaccines in late August 2026.',
    'Recommendations differ by group. CDC’s current COVID-19 vaccine guidance reflects a March 2026 federal court order that paused votes of the reconstituted CDC vaccine advisory committee. A federal appeals court heard arguments on October 6, 2026, and had not yet ruled, so federal guidance may change.',
    'The American Academy of Pediatrics, the American Academy of Family Physicians, ACOG, and IDSA issued their own 2026–27 COVID-19 vaccine recommendations in September 2026. The Minnesota Department of Health follows these professional groups’ recommendations. Talk with a clinician or pharmacist about what fits you.',
    'Variant names change often. All current variants come from the Omicron family; CDC’s variant tracking shows which ones are spreading now.',
    'MDH tests wastewater (sewage) from sites around Minnesota for COVID-19, flu, and RSV. It gives an early look at COVID-19 trends, including infections in people who never test.',
  ],
  sources: [
    {
      label: 'CDC — Interim clinical considerations for use of COVID-19 vaccines',
      url: 'https://www.cdc.gov/covid/hcp/vaccine-considerations/index.html',
    },
    {
      label: 'CDC — Overview of COVID-19 vaccines and vaccination',
      url: 'https://www.cdc.gov/covid/hcp/vaccine-considerations/overview.html',
    },
    {
      label: 'CDC — COVID-19 vaccination guidance (routine schedule)',
      url: 'https://www.cdc.gov/covid/hcp/vaccine-considerations/routine-guidance.html',
    },
    { label: 'CDC — COVID-19 treatment options', url: 'https://www.cdc.gov/covid/treatment/index.html' },
    { label: 'CDC — Testing and respiratory viruses', url: 'https://www.cdc.gov/respiratory-viruses/prevention/testing.html' },
    {
      label: 'FDA — COVID-19 vaccines (2026–2027 Formula) for use beginning fall 2026',
      url: 'https://www.fda.gov/vaccines-blood-biologics/industry-biologics/covid-19-vaccines-2026-2027-formula-use-united-states-beginning-fall-2026',
    },
    {
      label: 'Immunize.org — Ask the Experts: COVID-19',
      url: 'https://www.immunize.org/ask-experts/topic/covid-19/',
    },
    {
      label: 'Contemporary Pediatrics (news) — AAP recommends 2026–27 COVID-19 vaccine for infants 6–23 months and at-risk children',
      url: 'https://www.contemporarypediatrics.com/view/aap-recommends-2026-2027-covid-19-vaccine-for-infants-and-at-risk-children',
    },
    {
      label: 'IDSA — 2026 guidelines on seasonal vaccines for immunocompromised patients',
      url: 'https://www.idsociety.org/practice-guideline/Seasonal-RTI-Vaccinations-in-Immunocompromised-Patients/',
    },
    { label: 'MDH: Viral respiratory illness in Minnesota', url: 'https://www.health.state.mn.us/diseases/respiratory/stats/index.html' },
    { label: 'MDH — Wastewater monitoring in Minnesota', url: 'https://www.health.state.mn.us/diseases/wastewater/stats/index.html' },
    { label: 'MDH — Respiratory virus vaccines', url: 'https://www.health.state.mn.us/diseases/respiratory/vaccine/index.html' },
    {
      label: 'MPR News (Sept. 2026) — What to know about COVID-19 and flu vaccines in Minnesota this fall',
      url: 'https://www.mprnews.org/story/2026/09/25/heres-what-you-need-to-know-about-covid19-and-flu-vaccines-in-minnesota-this-fall',
    },
    {
      label: 'CDC: Emergency department visits for COVID-19, flu, and RSV',
      url: 'https://www.cdc.gov/respiratory-viruses/data/emergency-department-visits.html',
    },
    { label: 'CDC — Wastewater data for respiratory illnesses (NWSS)', url: 'https://www.cdc.gov/nwss/rv/index.html' },
    { label: 'BIOFIRE Syndromic Trends (bioMérieux)', url: 'https://syndromictrends.com/' },
    {
      label: 'IDSA — Federal judge blocks immunization schedule changes, stays ACIP appointments (2026)',
      url: 'https://www.idsociety.org/news--publications-new/articles/2026/federal-judge-blocks-immunization-schedule-changes-stays-acip-member-appointments/',
    },
    {
      label: 'Congressional Research Service — Changes to CDC vaccine recommendations in 2025 and 2026',
      url: 'https://www.congress.gov/crs-product/IN12684',
    },
    {
      label: 'Congressional Research Service — CDC’s updated childhood vaccine schedule litigation',
      url: 'https://www.congress.gov/crs-product/LSB11427',
    },
  ],
  lastReviewed: '2026-10-07',
}

export default profile
