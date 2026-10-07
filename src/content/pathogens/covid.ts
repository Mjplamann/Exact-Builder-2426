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
        'Starting at 6 months, talk with your clinician about the 2026–27 COVID-19 vaccine. The American Academy of Pediatrics recommends it for all children 6 to 23 months. Moderna’s Spikevax is FDA-approved starting at 6 months for children with a higher-risk condition, and some other brands are not approved for babies. Ask about availability and insurance coverage.',
        'Call your clinician if your baby has a fever, is feeding poorly, or has fewer wet diapers. Get prompt care for any fever in a baby younger than 12 weeks.',
        'Keep people who are sick away from your baby.',
      ],
    },
    children: {
      risk: 'lower',
      summary:
        'Most children have a mild illness, but kids with certain medical conditions can get very sick. A rare but serious problem called MIS-C (multisystem inflammatory syndrome in children) can appear 2 to 6 weeks after infection.',
      actions: [
        'Talk with your child’s clinician about the 2026–27 COVID-19 vaccine. The American Academy of Pediatrics recommends it for all children 6 to 23 months and for older children at higher risk, and other children can get it if their family chooses. Federal (CDC) guidance for children has changed several times since 2025, so ask what applies now.',
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
        'Ask your clinician or pharmacist about a 2026–27 COVID-19 vaccine. The American Academy of Family Physicians recommends it for all adults. FDA approval for people under 65 covers those with a higher-risk condition.',
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
        'Talk with your clinician or pharmacist about a 2026–27 COVID-19 vaccine this fall. The American Academy of Family Physicians recommends it for all adults. FDA approval for people under 65 covers those with a higher-risk condition, which many people 50 to 64 have.',
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
        'Get a 2026–27 COVID-19 vaccine this fall. The American Academy of Family Physicians recommends a second dose about 6 months later; ask your clinician or pharmacist.',
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
        'Talk with your clinician about a 2026–27 COVID-19 vaccine. ACOG (American College of Obstetricians and Gynecologists) recommends it during pregnancy, after delivery, and while breastfeeding. Federal guidance for pregnancy changed in 2025 and is part of an ongoing court case.',
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
        who: 'The American Academy of Family Physicians recommends a 2026–27 dose for all adults, plus a second dose about 6 months later for adults 65 and older. The American Academy of Pediatrics recommends it for all children 6 to 23 months and for older children at higher risk. ACOG recommends it during pregnancy, after delivery, and while breastfeeding. IDSA recommends it for adults and children with weakened immune systems. The Minnesota Department of Health bases its guidance on professional medical groups’ recommendations. CDC’s guidance changed several times in 2025–2026 and is part of an ongoing court case, so ask a clinician or pharmacist what applies to you.',
        notes:
          'FDA approved these updated vaccines in late August 2026. They target XFG, a strain in the JN.1 family of Omicron variants (the group of COVID-19 variants spreading now). FDA approval covers adults 65 and older and younger people with at least one condition that raises their risk. Age limits vary by brand: Spikevax is approved starting at 6 months, Comirnaty at 5 years, and mNEXSPIKE at 12 years. Comirnaty, Spikevax, and mNEXSPIKE are mRNA vaccines, which give your cells instructions to make a harmless piece of the virus. Nuvaxovid is a protein-based (non-mRNA) option. People with weakened immune systems may need more than one dose. If you recently had COVID-19, you may consider waiting about 3 months. A rare side effect of mRNA vaccines is myocarditis (heart inflammation), seen mostly in teen and young adult males.',
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
    'COVID-19 test positivity is the share of lab COVID-19 tests that come back positive. Most people now test at home, and those results usually are not reported. So lab numbers mostly reflect people who see a clinician or go to the hospital. They show how much illness among people who get tested is COVID-19, not how many Minnesotans are infected. That makes them better for spotting trends than for counting cases. When available, MN Pulse can also show a BioFire detection rate: the share of multi-virus respiratory panel tests at participating labs in the Midwest that find SARS-CoV-2. These panels are run mostly in hospitals and emergency departments. The rate shows how much COVID-19 adds to all the respiratory illness going around. The ED-visit percent is the share of all emergency department visits diagnosed as COVID-19. Since 2023 in Minnesota, it has ranged from under 0.1% at the quietest times to about 4.5% at the highest peak (December 2023). Waves since then have been smaller. Weekly COVID-19 hospital admissions count people with lab-confirmed COVID-19 newly admitted to Minnesota hospitals, as reported to CDC. The rate per 100,000 residents makes it easier to compare with other places and past seasons. Wastewater levels measure virus in sewage from a whole community, including people who never test. They can rise before clinic and hospital numbers do. A steady rise over 2 to 3 weeks means more virus is spreading. For most people, that means: stay home when sick and keep tests on hand. If you are at higher risk, consider masking in crowded indoor places and have a plan to get treatment quickly. Numbers for the most recent week or two are often revised.',
  watchNotes: [
    'As of the week ending September 26, 2026, COVID-19 made up about 0.3% of emergency department visits in Minnesota. There were 29 new COVID-19 hospital admissions statewide that week. Numbers had risen since early August, but this late-summer rise was much smaller than in 2024 or 2025.',
    'Updated 2026–27 COVID-19 vaccines target XFG, a strain in the JN.1 Omicron family. FDA approved the updated vaccines in late August 2026.',
    'Federal guidance is in flux. In March 2026, a federal court paused changes made to CDC immunization schedules since mid-2025, including a May 2025 change to COVID-19 vaccine guidance, and paused votes of the reconstituted CDC vaccine advisory committee (ACIP). The case is ongoing, so federal guidance may change.',
    'The American Academy of Pediatrics, the American Academy of Family Physicians, ACOG, and IDSA issued their own 2026–27 COVID-19 vaccine recommendations in late summer 2026. Since January 2026, the Minnesota Department of Health has based its vaccine guidance on professional medical groups’ recommendations. Talk with a clinician or pharmacist about what fits you.',
    'Variant names change often. All current variants come from the Omicron family; CDC’s variant tracking shows which ones are spreading now.',
    'MDH tests wastewater (sewage) from sites around Minnesota for COVID-19, flu, and RSV. It gives an early look at COVID-19 trends, including infections in people who never test.',
  ],
  sources: [
    { label: 'CDC — Types of COVID-19 treatment', url: 'https://www.cdc.gov/covid/treatment/index.html' },
    {
      label: 'CDC — COVID-19 treatment: clinical care for outpatients',
      url: 'https://www.cdc.gov/covid/hcp/clinical-care/outpatient-treatment.html',
    },
    { label: 'CDC — Testing and respiratory viruses', url: 'https://www.cdc.gov/respiratory-viruses/prevention/testing.html' },
    {
      label: 'CDC — Preventing spread of respiratory viruses when you’re sick',
      url: 'https://www.cdc.gov/respiratory-viruses/prevention/precautions-when-sick.html',
    },
    {
      label: 'Pharmacy Times (Aug. 2026) — FDA approves XFG-adapted COVID-19 vaccine for the 2026–2027 season',
      url: 'https://www.pharmacytimes.com/view/fda-approves-xfg-adapted-covid-19-vaccine-mrna-for-the-2026-2027-season',
    },
    {
      label: 'Moderna (press release) — FDA approval for updated 2026–2027 COVID-19 vaccines',
      url: 'https://www.biospace.com/press-releases/moderna-receives-u-s-fda-approval-for-updated-2026-2027-covid-19-vaccines',
    },
    {
      label: 'American Academy of Family Physicians — 2026–2027 influenza, RSV, and COVID-19 vaccine guidance (PDF)',
      url: 'https://www.aafp.org/assets/image/upload/v1788277985/pdf_2026_through_2027_influenza_rsv_sars_covid_2_guidance.pdf',
    },
    {
      label: 'Pharmacy Times (Sept. 2026) — AAP issues 2026–2027 guidance on RSV and COVID-19 immunization',
      url: 'https://www.pharmacytimes.com/view/aap-issue-2026-2027-guidance-on-rsv-and-covid-19-immunization',
    },
    {
      label: 'Contemporary OB/GYN (Sept. 2026) — ACOG 2026–27 respiratory virus immunization recommendations in pregnancy',
      url: 'https://www.contemporaryobgyn.net/view/acog-2026-27-respiratory-virus-immunization-recommendations-pregnancy',
    },
    {
      label: 'Guideline Central — IDSA 2026 guideline on seasonal vaccines for immunocompromised patients (summary)',
      url: 'https://www.guidelinecentral.com/insights/sep-2026-idsa-seasonalvaccinesimmunocompromisedpatients-guideline-spotlight/',
    },
    {
      label: 'MDH health advisory (Jan. 2026) — MDH aligns with medical association immunization recommendations',
      url: 'https://www2cdn.web.health.state.mn.us/communities/ep/han/2026/jan7imz.pdf',
    },
    { label: 'MDH — Viral respiratory illness in Minnesota', url: 'https://www.health.state.mn.us/diseases/respiratory/stats/index.html' },
    { label: 'MDH — Wastewater monitoring in Minnesota', url: 'https://www.health.state.mn.us/diseases/wastewater/stats/index.html' },
    {
      label: 'CDC NSSP — Emergency department visit data by state and county',
      url: 'https://data.cdc.gov/Public-Health-Surveillance/NSSP-Emergency-Department-Visit-Trajectories-by-St/rdmq-nq56',
    },
    { label: 'CDC — Wastewater data for respiratory viruses by state', url: 'https://www.cdc.gov/wastewater/respiratory-viruses/state.html' },
    { label: 'BIOFIRE Syndromic Trends (bioMérieux)', url: 'https://syndromictrends.com/' },
    {
      label: 'American College of Physicians (March 2026) — Federal judge blocks immunization schedule changes, stays ACIP member appointments',
      url: 'https://www.acponline.org/acp-newsroom/federal-judge-blocks-immunization-schedule-changes-stays-acip-member-appointments',
    },
  ],
  lastReviewed: '2026-10-07',
}

export default profile
