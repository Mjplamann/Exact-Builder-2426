// Verified 2026-10-07 from search results: MDH case counts (2023: 61; 2024: more than 3,100, most since 2012;
// 2025: 1,237 or 1,283 depending on the update, so "more than 1,200"; 2026: 186 as of 9/10/2026), and the
// federal schedule litigation (March 16, 2026 stay; First Circuit argument October 6, 2026, no ruling yet).
// TODO(verify): clinical details (treatment windows, PEP groups, TMP-SMX cautions, Tdap timing and
// effectiveness) follow long-standing CDC/ACIP, AAP Red Book and ACOG guidance but were not re-checked live
// (WebSearch budget exhausted; cdc.gov blocked). Before publishing, add URLs from search results for: CDC
// pertussis clinical overview / treatment and postexposure prophylaxis, CDC Tdap-in-pregnancy page, ACOG
// Tdap committee opinion, AAP Red Book pertussis chapter, MDH school immunization requirements.
import type { PathogenProfile } from '../types'

const profile: PathogenProfile = {
  id: 'pertussis',
  name: 'Pertussis (whooping cough)',
  shortName: 'Whooping cough',
  aka: ['Whooping cough', 'Bordetella pertussis', '100-day cough'],
  category: 'respiratory-bacterial',
  kind: 'bacterium',
  biofireTargets: ['Bordetella pertussis (ptxP)'],
  oneLiner: 'A very contagious bacterial infection that causes weeks of hard coughing fits and can be deadly for babies.',
  overview:
    'Whooping cough (pertussis) is an infection of the airways caused by the bacterium Bordetella pertussis. It starts like a cold, then causes coughing fits that can last for weeks and may end with a “whoop” sound or vomiting. It spreads very easily and is most dangerous for babies, who can stop breathing and often need hospital care. Vaccines for children, teens, adults, and pregnant people are the best protection, though protection fades over time.',
  seasonality: {
    summary:
      'Whooping cough can spread any time of year, and in the U.S. cases are often higher in summer and fall. It also comes in waves every few years. After very few cases during the COVID-19 pandemic, Minnesota had a large wave that began in mid-2024 and continued through 2025 at a lower level. The Minnesota Department of Health (MDH) counted more than 3,100 cases in 2024 and more than 1,200 in 2025. Reports for 2026 have been much lower so far.',
    peakMonths: [8, 9, 10, 11],
  },
  transmission:
    'Whooping cough spreads very easily when a sick person coughs or sneezes and others breathe in the droplets. It also spreads through close contact, such as sharing a home or spending a lot of time near someone who is coughing. Many babies catch it from a brother or sister, a parent, or a caregiver. In teens and adults it can seem like a bad cold or a cough that will not go away, so they may not know they have it.',
  incubation: 'Symptoms usually start 5 to 10 days after exposure, but it can take as long as 3 weeks.',
  contagiousPeriod:
    'People are most contagious during the early, cold-like stage and the first 2 weeks after the cough starts. Without treatment, they can spread it for about 3 weeks after coughing begins. After 5 full days of the right antibiotic, a person is no longer considered contagious. Health officials advise staying home from school, child care, and work until 5 days of antibiotics are finished, or for 21 days after the cough started if not treated.',
  symptoms: {
    common: [
      'Early on (first 1 to 2 weeks): runny nose, low fever, and a mild, occasional cough, like a cold',
      'Then: fits of many fast coughs in a row, often worse at night',
      'A high-pitched “whoop” when breathing in after a coughing fit',
      'Vomiting during or after coughing fits',
      'Feeling worn out after coughing fits, but often seeming fairly well between them',
      'A cough that can last 10 weeks or more (sometimes called the “100-day cough”)',
    ],
    lessCommon: [
      'Babies may have little or no cough. Instead, they may gag, gasp, or have pauses in breathing (apnea) and turn blue',
      'Teens, adults, and vaccinated children often have a milder illness without the whoop, sometimes just a long-lasting cough',
      'Pneumonia (lung infection)',
      'Rib fractures, fainting, or loss of bladder control from hard coughing',
      'Trouble sleeping and weight loss',
      'In babies, rarely, seizures or brain damage from lack of oxygen',
    ],
    emergencyWarningSigns: [
      'Pauses in breathing (apnea) or struggling to breathe, especially in a baby',
      'Blue, purple, or gray color of the lips, face, or skin during or after coughing',
      'A baby who cannot eat or drink, or has few or no wet diapers',
      'A seizure',
      'Very sleepy, limp, or hard to wake',
      'Trouble breathing between coughing fits or a high fever, which can be signs of pneumonia',
    ],
  },
  ageGroups: {
    infants: {
      risk: 'highest',
      summary:
        'Babies, especially those younger than 6 months, are at greatest risk. Whooping cough can make them stop breathing, and many babies who get it need hospital care. Babies are not fully protected by their own shots until they have had several doses.',
      actions: [
        'Get your baby’s DTaP shots on time, starting at 2 months. During outbreaks, your clinician may give the first dose as early as 6 weeks.',
        'Protect your newborn by getting Tdap during each pregnancy, and make sure everyone who spends time with the baby is up to date on whooping cough vaccine.',
        'Keep anyone with a cough away from your baby until they have been checked or treated.',
        'If your baby was around someone with whooping cough, call your clinician right away about preventive antibiotics.',
        'Get emergency care if your baby has pauses in breathing or turns blue or gray.',
      ],
    },
    children: {
      risk: 'moderate',
      summary:
        'Children who are not vaccinated or are behind on shots can get very sick. Vaccinated children can still catch whooping cough because protection fades over time, but their illness is usually milder and shorter.',
      actions: [
        'Keep your child on schedule: 5 doses of DTaP by age 4 to 6 and a Tdap booster at age 11 or 12. Minnesota schools require DTaP for kindergarten and Tdap for 7th grade.',
        'If your child has coughing fits, a whoop, or vomits after coughing, call your clinician and ask about testing.',
        'Keep a child with whooping cough home until they have taken the right antibiotic for 5 days.',
        'Keep a coughing child away from babies and pregnant family members.',
        'If your child was exposed, ask your clinician whether preventive antibiotics are needed, especially if a baby or pregnant person lives in your home.',
      ],
    },
    adults: {
      risk: 'lower',
      summary:
        'Adults usually have a milder illness, but the cough can last for months, disrupt sleep, and even cause rib fractures or fainting. Adults with mild symptoms often spread whooping cough to babies without knowing it.',
      actions: [
        'If you never had a Tdap shot as a teen or adult, get one dose. After that, get a Td or Tdap booster every 10 years.',
        'Get up to date at least 2 weeks before spending time with a new baby.',
        'See a clinician for coughing fits or a cough that lasts more than 2 weeks, and ask about whooping cough.',
        'If you are diagnosed, take the full antibiotic course and stay home from work until you have taken it for 5 days.',
      ],
    },
    'older-adults': {
      risk: 'lower',
      summary:
        'Whooping cough in adults 50 to 64 is rarely life-threatening, but it can be long and exhausting and can worsen asthma or COPD (chronic obstructive pulmonary disease).',
      actions: [
        'Check that you have had Tdap at least once as an adult, and a Td or Tdap booster within the last 10 years.',
        'If you will be around a new grandchild or other baby, make sure your whooping cough vaccine is up to date, ideally at least 2 weeks before.',
        'See a clinician for coughing fits or a cough that lasts more than 2 weeks.',
        'If you have asthma or COPD, call early if a cough makes your breathing worse.',
      ],
    },
    seniors: {
      risk: 'moderate',
      summary:
        'Older adults can have a long, hard illness, and some need hospital care, especially those with heart or lung disease. Protection from vaccines given years ago may have faded.',
      actions: [
        'Ask your clinician whether you are due for Tdap or a Td booster. Adults 65 and older who never had Tdap should get one dose.',
        'Get your vaccine up to date before spending time with a new baby in the family.',
        'See a clinician for coughing fits or a cough that lasts more than 2 weeks.',
        'Seek care quickly for trouble breathing, high fever, or chest pain.',
      ],
    },
    pregnant: {
      risk: 'moderate',
      summary:
        'The main danger during pregnancy is to the baby: whooping cough can spread to a newborn right after birth, when babies are most at risk. A Tdap shot during each pregnancy passes protective antibodies to the baby. CDC counts people in the third trimester as high-risk contacts who should get preventive antibiotics after an exposure.',
      actions: [
        'Get Tdap during each pregnancy, ideally early in the window from 27 through 36 weeks. CDC and ACOG (American College of Obstetricians and Gynecologists) both recommend it.',
        'Get it again in every pregnancy, even if you had it before, because antibody levels drop over time.',
        'If you were exposed to whooping cough, call your clinician about preventive antibiotics, especially in the third trimester.',
        'Ask family members and caregivers to get up to date on whooping cough vaccine before the baby arrives.',
        'Tell your clinician about coughing fits or any cough lasting more than 2 weeks, especially close to your due date.',
      ],
    },
    immunocompromised: {
      risk: 'higher',
      summary:
        'People with weakened immune systems or moderate to severe asthma are among those CDC considers at higher risk, because whooping cough can make their health conditions worse. They may also get less protection from vaccines.',
      actions: [
        'Ask your care team whether you are up to date on Tdap or Td.',
        'If you were around someone with whooping cough, call your care team right away. Preventive antibiotics are recommended for people at higher risk.',
        'Ask people in your household to stay up to date on whooping cough vaccine.',
        'Contact your care team early for a cough that is getting worse or for coughing fits.',
      ],
    },
  },
  treatment: {
    summary:
      'Whooping cough is treated with antibiotics. Starting them early, ideally in the first 1 to 2 weeks before coughing fits begin, can make the illness milder. Started later, antibiotics may not shorten the cough, but they still stop the spread to others. CDC advises treating people 1 year and older within 3 weeks of when the cough started. Babies under 1 and pregnant people (especially near their due date) should be treated within 6 weeks. The cough can go on for weeks after the infection is gone, because the airways take time to heal.',
    options: [
      {
        name: 'Azithromycin and similar antibiotics (macrolides)',
        type: 'antibiotic',
        detail:
          'Azithromycin is the most common choice and is the preferred antibiotic for babies younger than 1 month. Clarithromycin and erythromycin are other options for older babies, children, and adults. Clinicians often start treatment before test results come back when whooping cough is likely, especially for babies.',
        who: 'People diagnosed with whooping cough, and close contacts who need preventive treatment',
      },
      {
        name: 'Trimethoprim-sulfamethoxazole (Bactrim, Septra)',
        type: 'antibiotic',
        detail:
          'An alternative for people who cannot take macrolide antibiotics. It is not used in babies younger than 2 months. It is usually avoided during pregnancy, especially near the due date, and while breastfeeding a baby younger than 2 months. In those cases, your clinician will choose another option.',
        who: 'People 2 months and older who cannot take azithromycin or similar antibiotics (usually not during pregnancy)',
      },
      {
        name: 'Preventive antibiotics after exposure (post-exposure prophylaxis)',
        type: 'antibiotic',
        detail:
          'The same antibiotics used for treatment can prevent illness in people who were exposed. They work best when started as soon as possible and are recommended within 21 days of the exposure. They are recommended even for people who are vaccinated, because vaccine protection is not complete.',
        who: 'Everyone in the home of a person with whooping cough. Also close contacts at higher risk: babies, people in the last 3 months of pregnancy, and people with weakened immune systems or moderate to severe asthma. Also close contacts who spend time with people in these groups, such as child care staff.',
      },
      {
        name: 'Hospital care',
        type: 'supportive',
        detail:
          'Oxygen, suctioning of mucus, fluids through an IV, and close watching for pauses in breathing. Babies are often watched in the hospital so staff can help right away if a coughing fit stops their breathing.',
        who: 'Many babies with whooping cough, and anyone with breathing trouble, pneumonia, or trouble eating and drinking',
      },
      {
        name: 'Home care',
        type: 'supportive',
        detail:
          'Rest, drink plenty of fluids, and eat small meals every few hours to help prevent vomiting after coughing. A clean cool-mist humidifier may help loosen mucus. Keep your home free of smoke, dust, and other things that trigger coughing. Cough medicines usually do not help; do not give them to young children unless your clinician says to.',
        who: 'People well enough to recover at home, along with antibiotics',
      },
    ],
    antibioticsHelp: 'yes',
  },
  prevention: {
    vaccines: [
      {
        name: 'DTaP (for babies and young children)',
        who: 'All children, as 5 doses at 2, 4, and 6 months, 15 through 18 months, and 4 through 6 years. Recommended by the CDC schedule in effect as of October 2026 and by the American Academy of Pediatrics.',
        notes:
          'DTaP also protects against diphtheria and tetanus and is often combined with other childhood vaccines to reduce the number of shots. The first dose can be given as early as 6 weeks of age. Protection is strong at first but fades over several years, which is why a booster is needed later.',
      },
      {
        name: 'Tdap (for preteens, teens, and adults)',
        who: 'One dose at age 11 or 12. Teens and adults who never had Tdap should get one dose, including adults 65 and older. Adults then get a Td or Tdap booster every 10 years.',
        notes:
          'Brands include Adacel and Boostrix. Protection from Tdap fades within a few years, so vaccinated people can still get whooping cough, but it is usually milder.',
      },
      {
        name: 'Tdap during pregnancy',
        who: 'Every pregnancy, ideally early in the window from 27 through 36 weeks. Recommended by CDC and ACOG.',
        notes:
          'The pregnant person makes antibodies that pass to the baby and protect the baby in the first months of life, before the baby can start DTaP. CDC reports that Tdap during pregnancy prevents most whooping cough cases and hospital stays in babies younger than 2 months. A person who has never had Tdap and did not get it during pregnancy should get it right after delivery, though this does not protect the newborn as well.',
      },
    ],
    everyday: [
      'See a clinician if you have coughing fits or a cough that lasts more than 2 weeks, and stay away from others until you know the cause.',
      'Keep anyone with a cough away from babies and pregnant people.',
      'Cover coughs and sneezes with a tissue or your elbow, and wash hands often.',
      'If someone in your home is diagnosed, ask your clinician about preventive antibiotics for the household right away.',
      'Finish the full course of any antibiotic prescribed for whooping cough.',
      'Make sure everyone around a new baby is up to date on whooping cough vaccine.',
    ],
  },
  testing:
    'A clinician can test a swab from the back of the nose. A PCR test (a lab test that finds the germ’s genetic material) works best in the first 3 weeks of cough and before antibiotics are started. A culture (growing the bacteria in a lab) can also confirm it. Blood antibody tests are sometimes used for older children and adults who have been coughing for a longer time. Clinicians often treat based on symptoms without waiting for results, especially for babies or after a known exposure. Home COVID-19 and flu tests do not detect whooping cough. Whooping cough is a reportable disease in Minnesota, so cases are reported to MDH, which helps find and protect close contacts.',
  whenToSeekCare: [
    'Call 911 or go to the emergency department if a baby has pauses in breathing, struggles to breathe, or turns blue or gray, or for any other emergency warning sign.',
    'Call your clinician the same day if a baby has any cough, gagging, or gasping, or if anyone has coughing fits with a whoop or vomiting.',
    'Call your clinician if a cough lasts more than 2 weeks, even if it seems mild.',
    'Call your clinician right away if you were exposed to whooping cough and you live with or care for a baby. Also call right away after an exposure if you are pregnant or have a weakened immune system or asthma.',
    'Call your clinician if someone being treated is getting worse, develops a fever, or is not drinking enough.',
    'Urgent care can test for whooping cough when your clinic is closed. Babies with breathing problems need the emergency department, not urgent care.',
  ],
  readingTheNumbers:
    'MN Pulse can show whooping cough in two ways. Reported cases are the confirmed and probable cases that clinicians and labs report to MDH. These counts often arrive in batches and are revised later, so the most recent weeks usually look lower than they will end up. MDH’s own counts are usually higher and more up to date than CDC’s weekly tables, so check the source and date. The BioFire detection rate is the share of multi-pathogen respiratory panel tests at participating Midwest labs that find Bordetella pertussis. These panels are ordered for people with breathing symptoms, often in hospitals and emergency departments, and usually not to look for whooping cough in particular. So the rate shows the share of tested patients who had the germ, not how many people in Minnesota have it. The rate is usually low, so look for a steady rise over several weeks rather than a change in one week. MN Pulse does not show emergency department data for whooping cough. Between waves, cases are uncommon. During a wave like Minnesota’s in 2024, reports can climb many times higher over several months. A steady rise means more spread in your community. For most people, it is a good reason to check that your family’s vaccines are up to date. This matters most if you are pregnant or spend time with a baby. Also see a clinician for any cough that lasts 2 weeks or more.',
  watchNotes: [
    'Minnesota had a large whooping cough wave in 2024 and 2025. MDH counted more than 3,100 cases in 2024, the most since 2012, and more than 1,200 in 2025. That compares with 61 cases in 2023.',
    'As of September 10, 2026, MDH had counted 186 cases for 2026. That is much lower than in the past two years and in line with a national decline. These counts are preliminary. Whooping cough still circulates, so babies remain at risk.',
    'Federal vaccine guidance changed several times in 2025 and 2026. In March 2026, a federal court paused changes to CDC’s childhood immunization schedule. A federal appeals court heard arguments on October 6, 2026, and had not yet ruled, so federal guidance could change. As of October 2026, the CDC schedule in effect and the American Academy of Pediatrics both recommend DTaP for young children and Tdap at age 11 or 12. CDC and ACOG recommend Tdap during every pregnancy. Talk with your clinician if you have questions.',
    'Minnesota schools require DTaP for kindergarten and Tdap for 7th grade.',
  ],
  sources: [
    {
      label: 'MDH: Pertussis disease statistics, 2026',
      url: 'https://www.health.state.mn.us/diseases/pertussis/stats/stats26.html',
    },
    {
      label: 'MDH: Pertussis disease statistics, 2025',
      url: 'https://www.health.state.mn.us/diseases/pertussis/stats/stats25.html',
    },
    {
      label: 'MDH: Pertussis disease statistics and maps',
      url: 'https://www.health.state.mn.us/diseases/pertussis/stats/index.html',
    },
    {
      label: 'MDH: Pertussis annual summary of reportable diseases',
      url: 'https://www.health.state.mn.us/diseases/reportable/dcn/pertussis.html',
    },
    {
      label: 'CDC: NNDSS weekly notifiable disease data (provisional)',
      url: 'https://data.cdc.gov/d/x9gk-5huc',
    },
    {
      label: 'CDC: Child and adolescent immunization schedule notes',
      url: 'https://www.cdc.gov/vaccines/hcp/imz-schedules/child-adolescent-notes.html',
    },
    { label: 'CDC: ACIP vaccine recommendations', url: 'https://www.cdc.gov/acip/vaccine-recommendations/index.html' },
    {
      label: 'AAP: Recommended childhood and adolescent immunization schedule, 2026',
      url: 'https://publications.aap.org/pediatrics/article/157/3/e2025075754/206175/Recommended-Childhood-and-Adolescent-Immunization',
    },
    {
      label: 'IDSA: Federal judge blocks immunization schedule changes, stays ACIP appointments (2026)',
      url: 'https://www.idsociety.org/news--publications-new/articles/2026/federal-judge-blocks-immunization-schedule-changes-stays-acip-member-appointments/',
    },
    {
      label: 'Congressional Research Service: Changes to CDC vaccine recommendations in 2025 and 2026',
      url: 'https://www.congress.gov/crs-product/IN12684',
    },
    {
      label: 'Congressional Research Service: CDC’s updated childhood vaccine schedule litigation',
      url: 'https://www.congress.gov/crs-product/LSB11427',
    },
    { label: 'BIOFIRE Syndromic Trends (bioMérieux)', url: 'https://syndromictrends.com/' },
  ],
  lastReviewed: '2026-10-07',
}

export default profile
