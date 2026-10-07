import type { PathogenProfile } from '../types'

const profile: PathogenProfile = {
  id: 'lyme',
  name: 'Lyme disease',
  shortName: 'Lyme',
  aka: ['Lyme borreliosis', 'Borrelia burgdorferi', 'Borrelia mayonii'],
  category: 'vector-borne',
  kind: 'bacterium',
  oneLiner:
    'A bacterial infection spread by blacklegged (deer) ticks. It often starts with a growing rash, and antibiotics treat it well.',
  overview:
    'Lyme disease is an infection caused by Borrelia bacteria, mainly Borrelia burgdorferi (and, in Minnesota and Wisconsin, a related germ called Borrelia mayonii). It spreads through the bite of an infected blacklegged (deer) tick, and Minnesota is one of the states where it is most common. Most people recover fully with a short course of antibiotics, especially when treatment starts early. Untreated infection can spread to the joints, heart, and nerves.',
  seasonality: {
    summary:
      'In Minnesota, blacklegged ticks can be active any time it is above freezing and the ground is not covered with snow. Risk is highest from mid-May through July, when young ticks (nymphs, about the size of a poppy seed) are out and easy to miss. Most Lyme illnesses begin in early to mid-summer. Adult ticks are active in the fall (especially October and November) and again in early spring, so bites can happen then too.',
    peakMonths: [6, 7],
  },
  transmission:
    'Lyme disease spreads through the bite of an infected blacklegged (deer) tick. Most infections come from nymphs, which are so small that many people never notice the bite. In Minnesota, these ticks live in wooded and brushy areas and leaf litter. The tick usually must stay attached for more than a day, often 36 to 48 hours, to pass on Lyme bacteria. Finding and removing ticks quickly lowers your risk. Lyme disease does not spread from person to person. Pets do not give it to people directly, but they can carry ticks into your home.',
  incubation:
    'The rash usually appears 3 to 30 days after the tick bite, most often after about a week. If the infection is not treated, other symptoms can show up days to months after the bite.',
  contagiousPeriod:
    'Lyme disease is not contagious. It does not spread through touching, kissing, caring for a sick person, or sharing a home. Spread from a pregnant person to the baby is possible but rare. No harm to the baby has been found when the pregnant person gets prompt, proper treatment.',
  symptoms: {
    common: [
      'A red rash (erythema migrans) at or near the bite that slowly gets bigger over several days, often 2 inches across or larger. It may look like a bull’s-eye but is often solid red. On darker skin it can look like a bruise and be harder to see.',
      'Fever and chills',
      'Headache',
      'Tiredness (fatigue)',
      'Muscle and joint aches',
      'Swollen lymph nodes (glands)',
    ],
    lessCommon: [
      'No rash at all (some people)',
      'More rashes on other parts of the body',
      'Drooping on one or both sides of the face (facial palsy)',
      'Severe headache and a stiff neck',
      'Painful, swollen joints, especially the knees (Lyme arthritis), weeks to months after the bite',
      'Heart palpitations, dizziness, or an irregular heartbeat (Lyme carditis)',
      'Shooting pains, numbness, or tingling in the hands or feet',
    ],
    emergencyWarningSigns: [
      'Fainting, chest pain, shortness of breath, or a very slow or irregular heartbeat. Call 911 or go to an emergency department.',
      'Sudden face drooping, weakness in an arm or leg on one side, or trouble speaking. Call 911, because these can be signs of a stroke.',
      'Severe headache with a stiff neck, high fever, or confusion',
      'After a tick bite: high fever with trouble breathing, confusion, or unusual bleeding or bruising (these can signal other tick-borne infections)',
    ],
  },
  ageGroups: {
    infants: {
      risk: 'lower',
      summary:
        'Lyme disease is uncommon in babies because they spend less time in tick habitat. When it happens, it is treated with antibiotics, as in older children. Young babies cannot use most bug repellents, so physical protection matters most.',
      actions: [
        'Do not use insect repellent on babies younger than 2 months. Cover strollers and carriers with netting instead.',
        'For babies 2 months and older, the American Academy of Pediatrics says a repellent with up to 30% DEET can be used, applied sparingly. Do not use oil of lemon eucalyptus (OLE) or para-menthane-diol (PMD) on children under 3.',
        'Check your baby for ticks after time outdoors, including the scalp, behind the ears, and skin folds.',
        'Call your baby’s health care provider about any tick bite, growing rash, or fever. Call right away for any fever in a baby younger than 3 months.',
      ],
    },
    children: {
      risk: 'lower',
      summary:
        'School-age children are among the groups most often diagnosed with Lyme disease, likely because they play outdoors. They are not more likely than adults to get seriously ill, and most recover fully with treatment. Doxycycline can be used for short courses at any age.',
      actions: [
        'Use a repellent registered with the U.S. Environmental Protection Agency (EPA), such as DEET or picaridin. An adult should apply it, avoiding the child’s hands, eyes, and mouth.',
        'Do a full-body tick check after outdoor play, camping, or sports in grassy or wooded areas.',
        'Have your child bathe or shower within 2 hours of coming indoors to help find ticks.',
        'Call your clinician about a growing rash or fever. Also call about a deer tick that looked swollen with blood or was attached for about 36 hours or more.',
      ],
    },
    adults: {
      risk: 'lower',
      summary:
        'Adults who hike, hunt, fish, garden, or work outdoors are at risk. Most recover fully with early treatment. Untreated infection can later cause arthritis, nerve problems, or heart rhythm problems.',
      actions: [
        'Use repellent on skin and permethrin-treated clothing, shoes, and gear in wooded or brushy areas.',
        'Check your whole body for ticks every day you spend time outdoors in tick areas.',
        'Remove attached ticks right away with fine-tipped tweezers.',
        'If a deer tick was attached for about 36 hours or more, call your clinician soon. A preventive dose of doxycycline must start within 72 hours after removal.',
      ],
    },
    'older-adults': {
      risk: 'lower',
      summary:
        'Lyme disease is common in this age group, often after yard work, gardening, hunting, or hiking. Treatment works just as well as in younger adults. Heart and joint symptoms can be mistaken for other conditions, so mention any tick exposure to your clinician.',
      actions: [
        'Wear long sleeves and pants tucked into socks for yard work in brushy areas, and use repellent.',
        'Treat outdoor clothes and gear with permethrin, or buy pre-treated clothing.',
        'Tumble dry clothes on high heat for 10 minutes after coming indoors to kill ticks.',
        'Tell your clinician about tick exposure if you have a new rash, fever, joint swelling, or heart palpitations.',
      ],
    },
    seniors: {
      risk: 'lower',
      summary:
        'Lyme disease can affect active older adults, and treatment works well at any age. Older adults are more likely to have other health conditions and take several medicines. Ask your clinician which antibiotic fits best.',
      actions: [
        'Check for ticks after gardening, walking, or time at the cabin or lake.',
        'Use repellent, and wear light-colored clothing so ticks are easier to spot.',
        'Call 911 or go to an emergency department for fainting, chest pain, shortness of breath, or an irregular heartbeat.',
        'Tell your clinician about all the medicines you take before starting an antibiotic.',
      ],
    },
    pregnant: {
      risk: 'moderate',
      summary:
        'Lyme disease during pregnancy can rarely infect the placenta (the organ that nourishes the baby). No harm to the baby has been found with prompt, proper treatment. Amoxicillin or cefuroxime is usually used instead of doxycycline, although doxycycline may still be used for some other tick-borne infections, such as anaplasmosis.',
      actions: [
        'Use an EPA-registered repellent. These are safe during pregnancy and breastfeeding when used as directed.',
        'Do a tick check every day you spend time outdoors in tick areas.',
        'Call your prenatal care provider about any deer tick bite, growing rash, or fever.',
        'Do not start or stop any medicine without talking to your clinician.',
      ],
    },
    immunocompromised: {
      risk: 'moderate',
      summary:
        'Lyme disease is usually treated the same way in people with weakened immune systems. Blood tests that look for antibodies may be less reliable when the immune system is weakened. Other infections from the same tick, especially babesiosis, can be more serious for you.',
      actions: [
        'Tell your care team about any tick bite or time in tick areas.',
        'Call early for a new rash, fever, or flu-like illness from spring through fall.',
        'Ask your clinician whether a preventive dose of doxycycline makes sense after a high-risk tick bite.',
        'Use repellent and permethrin-treated clothing, and check for ticks every day.',
        'If you do not have a spleen, get care the same day for any fever after a tick bite.',
      ],
    },
  },
  treatment: {
    summary:
      'Lyme disease is treated with antibiotics, most often doxycycline taken by mouth. Early Lyme disease with a rash is usually treated for 10 to 14 days. Later stages may need longer treatment, and some cases need antibiotics through a vein (IV). Most people recover fully. A small number have tiredness, pain, or trouble thinking that lasts months after treatment. Longer antibiotic courses have not been shown to help with this.',
    options: [
      {
        name: 'Doxycycline',
        type: 'antibiotic',
        detail:
          'The most common choice. Usually taken for about 10 days for an early Lyme rash, and longer for some later forms. Short courses can be used at any age and have not been shown to stain children’s teeth. Take it with a full glass of water and stay upright for at least 30 minutes afterward. It can make you sunburn more easily, so protect your skin.',
        who: 'Most adults and children. It is usually avoided during pregnancy.',
      },
      {
        name: 'Amoxicillin or cefuroxime',
        type: 'antibiotic',
        detail:
          'Taken by mouth, usually for about 14 days for early Lyme disease. Common choices for people who cannot take doxycycline.',
        who: 'Pregnant people and others who cannot take doxycycline.',
      },
      {
        name: 'Azithromycin',
        type: 'antibiotic',
        detail: 'Works less well than the other choices for Lyme disease.',
        who: 'Only people who cannot take doxycycline, amoxicillin, or cefuroxime.',
      },
      {
        name: 'Ceftriaxone (given through a vein)',
        type: 'antibiotic',
        detail:
          'An IV antibiotic used for some people with Lyme meningitis or heart involvement, especially those who are in the hospital. Many people with nerve or heart involvement can take pills instead.',
        who: 'Some people with later or more serious forms of Lyme disease, as decided by a clinician.',
      },
      {
        name: 'Single-dose doxycycline after a tick bite (prevention)',
        type: 'antibiotic',
        detail:
          'One dose of doxycycline can lower the chance of getting Lyme disease after a high-risk bite. It may be offered if all four of these are true. The tick was a blacklegged (deer) tick. It was attached for about 36 hours or more, or it looked swollen with blood. The dose can start within 72 hours after the tick came off. The bite happened in a state where Lyme disease is common, such as Minnesota. Ticks are less common in open prairie areas, so your clinician will also consider where the bite happened. This dose does not prevent other tick-borne infections, so keep watching for symptoms for 30 days.',
        who: 'Adults and children of any age who meet all of these conditions and can safely take doxycycline. People who are pregnant or breastfeeding should talk with their clinician.',
      },
    ],
    antibioticsHelp: 'yes',
  },
  prevention: {
    vaccines: [],
    everyday: [
      'Use a repellent registered with the U.S. Environmental Protection Agency (EPA). Look for one of these active ingredients: DEET, picaridin, IR3535, oil of lemon eucalyptus (OLE), para-menthane-diol (PMD), or 2-undecanone. Follow the label.',
      'Treat clothing, boots, and camping gear with 0.5% permethrin (an insect-killing treatment for clothing), or buy pre-treated items. Do not put permethrin on skin.',
      'Walk in the center of trails. Avoid brushy areas, tall grass, and leaf litter.',
      'After being outdoors, check your whole body for ticks. Look under the arms, in and around the ears, in the belly button, and behind the knees. Also check between the legs, around the waist, and in the hair.',
      'Shower within 2 hours of coming indoors. Tumble dry clothes on high heat for 10 minutes to kill ticks.',
      'To remove a tick, grasp it close to the skin with fine-tipped tweezers and pull straight up with steady pressure. Do not use petroleum jelly, nail polish, or heat. Clean the bite and your hands afterward.',
      'Take a photo of the tick, or save it in a sealed bag, in case your clinician wants to know what kind it was.',
      'Check pets for ticks and ask your veterinarian about tick prevention.',
      'Around your home, keep grass short and put a strip of wood chips or gravel between lawns and wooded areas.',
    ],
  },
  testing:
    'A clinician can diagnose Lyme disease from the typical growing rash after possible tick exposure. No blood test is needed for that rash. Tests are often negative in the first few weeks, because the body takes time to make antibodies (infection-fighting proteins). For later symptoms, such as joint swelling or facial drooping, clinicians use a two-step antibody blood test. Antibody tests can stay positive long after treatment, so they cannot show whether treatment worked. Testing the tick itself is not recommended to decide on treatment. Ask your clinician to use standard tests, because CDC warns that some lab tests are not proven to be accurate.',
  whenToSeekCare: [
    'You do not need to see a clinician for every tick bite. Remove the tick, clean the area, and watch for symptoms for 30 days.',
    'Did you remove a deer tick that looked swollen with blood, or was attached for about 36 hours or more? Call your clinician as soon as you can. A preventive dose of doxycycline must start within 72 hours after removal.',
    'Call your clinician if you get a growing rash, fever, chills, or body aches within a month after a tick bite or tick exposure.',
    'Call if you notice new joint swelling, facial drooping, or numbness or shooting pains in the weeks or months after possible tick exposure.',
    'Call 911 or go to an emergency department (not urgent care) for fainting, chest pain, shortness of breath, or a very slow or irregular heartbeat. Call 911 for sudden face drooping with arm weakness or trouble speaking.',
  ],
  readingTheNumbers:
    'Lyme disease is tracked mainly through cases that clinicians and labs report to the Minnesota Department of Health (MDH). MDH publishes Lyme totals once a year, after the year ends, so the newest full year of data can be more than a year old. CDC’s weekly national tables do not currently list Minnesota Lyme counts, so this page may not show a current weekly number. Reported counts also undercount true infections. Many people with the typical rash are treated without a lab test, and some never see a clinician. In 2022, the national rules for counting Lyme cases changed in states where it is common, including Minnesota. Since then, MDH counts cases mainly from positive lab tests. Counts from before and after 2022 are not directly comparable. Lyme disease is not on the respiratory or stool BioFire panels. It also has no test positivity measure like the ones used for flu or COVID-19. In a typical year, cases rise in late spring, peak in early summer, drop in late summer, and show a smaller bump in the fall. For you, a rise in cases means ticks are active. Use repellent, check for ticks every day, and watch for a growing rash or fever after time outdoors.',
  watchNotes: [
    'October and November are adult tick season in Minnesota. Adult blacklegged ticks stay active on days above freezing. Deer hunters, hikers, and people doing fall yard work should keep using repellent and checking for ticks.',
    'Powassan virus is a rare but serious infection spread by the same blacklegged ticks. It can pass from a tick to a person much faster than Lyme bacteria. Many infected people have no symptoms. But it can cause swelling of the brain (encephalitis) or of the lining around the brain and spinal cord (meningitis). There is no vaccine or specific treatment, and antibiotics do not work against it. Minnesota reports a small number of cases most years. Get care right away for fever with a severe headache, confusion, weakness, or seizures after a tick bite.',
    'In Minnesota, the same tick can also spread anaplasmosis, babesiosis, Borrelia miyamotoi disease, and a type of ehrlichiosis. One bite can cause more than one infection. If you are not getting better on Lyme treatment, ask your clinician about these.',
    'A Lyme disease vaccine for people, made by Pfizer and Valneva, prevented more than 70% of Lyme cases in a large late-stage trial of people 5 and older, with results reported in 2026. In August 2026, European regulators began reviewing it. As of October 2026, it is not available in the U.S. Check with CDC, MDH, or your clinician for updates.',
    'MDH publishes information on which Minnesota counties have the highest tick-borne disease risk. Risk is highest in wooded parts of east-central, north-central, and southeastern Minnesota. Blacklegged ticks have spread to more of the state over time.',
  ],
  sources: [
    { label: 'CDC: About Lyme Disease', url: 'https://www.cdc.gov/lyme/about/index.html' },
    { label: 'CDC: Preventing Lyme Disease', url: 'https://www.cdc.gov/lyme/prevention/index.html' },
    {
      label: 'CDC: Caring for Patients After a Tick Bite (guidance for clinicians)',
      url: 'https://www.cdc.gov/lyme/media/pdfs/Caring-for-Patients-after-a-Tick-Bite.pdf',
    },
    { label: 'CDC: About Powassan Virus', url: 'https://www.cdc.gov/powassan/about/index.html' },
    {
      label: 'Minnesota Department of Health: Lyme Disease Statistics',
      url: 'https://www.health.state.mn.us/diseases/lyme/statistics.html',
    },
    {
      label: 'Minnesota Department of Health: Diseases That Can Be Transmitted by Ticks',
      url: 'https://www.health.state.mn.us/diseases/tickborne/diseases.html',
    },
    {
      label: 'AAN/ACR/IDSA: 2020 Guidelines for the Prevention, Diagnosis and Treatment of Lyme Disease',
      url: 'https://www.idsociety.org/practice-guideline/lyme-disease/',
    },
    {
      label: 'American Academy of Pediatrics (HealthyChildren.org): How to Choose an Insect Repellent for Your Child',
      url: 'https://www.healthychildren.org/English/safety-prevention/at-play/Pages/Insect-Repellents.aspx',
    },
    { label: 'U.S. EPA: Repellents: Protection Against Mosquitoes, Ticks and Other Arthropods', url: 'https://www.epa.gov/insect-repellents' },
  ],
  lastReviewed: '2026-10-07',
}

export default profile
