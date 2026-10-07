import type { PathogenProfile } from '../types'

// TODO(verify): revised without live web verification (the shared WebSearch budget was exhausted). Before
// release, confirm by search: every source URL (especially the MDH mpox path, which may still be
// /diseases/monkeypox/), JYNNEOS approval status for ages 12–17, and current CDC booster guidance.
// Minnesota year-to-date counts come from CDC's NNDSS weekly table (data.cdc.gov x9gk-5huc), as of 2026-09-26.

const profile: PathogenProfile = {
  id: 'mpox',
  name: 'Mpox',
  shortName: 'Mpox',
  aka: ['Monkeypox', 'MPXV'],
  category: 'vaccine-preventable',
  kind: 'virus',
  oneLiner: 'A virus that causes a painful rash, spread mostly through close skin-to-skin contact. The JYNNEOS vaccine helps prevent it.',
  overview:
    'Mpox (formerly called monkeypox) is a virus related to smallpox, but it is usually much milder. It causes a rash or sores that can be very painful, often with fever and swollen glands, and most people recover in 2 to 4 weeks. Of its two main types (clades), clade II causes most U.S. cases, including the large 2022 outbreak, while clade I has historically caused more severe illness. The risk to the general public in Minnesota is low.',
  seasonality: {
    summary:
      'Mpox does not have a clear season in Minnesota, and recent cases have been reported throughout the year. Nationally, the large 2022 outbreak peaked in midsummer. Health officials often encourage vaccination before Pride events, summer festivals, large gatherings and travel.',
    peakMonths: [],
  },
  transmission:
    'Mpox spreads mainly through close, skin-to-skin contact with the rash, scabs or body fluids of a person who has it. In the U.S., most spread happens during sex and other intimate contact, such as kissing and cuddling. It can also spread through long face-to-face contact, by touching items such as bedding or towels used by someone with mpox, and from a pregnant person to the baby. It does not spread easily through brief, casual contact such as walking past someone or a short conversation.',
  incubation: 'Symptoms usually start 3 to 17 days after exposure. Health officials ask exposed people to watch for symptoms for 21 days.',
  contagiousPeriod:
    'People can spread mpox from the time symptoms start until the rash has fully healed: all scabs have fallen off and a fresh layer of skin has formed. This usually takes 2 to 4 weeks. Some people may spread it 1 to 4 days before they notice any symptoms.',
  symptoms: {
    common: [
      'A rash or sores that may be painful or itchy. It can appear on or near the genitals or anus, and on the hands, feet, chest, face or mouth',
      'Sores that change over time: flat spots, then bumps, then blisters filled with fluid or pus, then scabs',
      'Fever and chills',
      'Swollen lymph nodes (glands)',
      'Feeling very tired',
      'Muscle aches, backache and headache',
    ],
    lessCommon: [
      'Sore throat, stuffy nose or cough',
      'Rectal pain, bleeding or discharge, or pain when having a bowel movement',
      'Painful sores inside the mouth, throat or vagina',
      'A few sores or just one, without other symptoms',
    ],
    emergencyWarningSigns: [
      'Sores in or near the eye, eye pain, or changes in vision',
      'Trouble breathing or chest pain',
      'Confusion, a seizure or a severe headache',
      'Being unable to urinate or have a bowel movement because of pain or swelling',
      'Not being able to eat or drink because of mouth or throat sores',
      'A rash that spreads fast, or skin around the sores that turns red, hot, swollen and very painful',
    ],
  },
  ageGroups: {
    infants: {
      risk: 'higher',
      summary:
        'Mpox is rare in babies in the U.S., but babies are more likely to get seriously ill if infected. It usually reaches babies through close contact with an infected household member or during pregnancy or birth.',
      actions: [
        'If someone in your home has mpox, keep their sores covered and avoid skin-to-skin contact with the baby. Have another caregiver help if possible',
        'Wash the sick person’s bedding, towels and clothing separately',
        'If you have mpox and are breastfeeding, ask your clinician how to feed your baby safely',
        'Call your baby’s clinician right away if your baby gets a new rash after being around someone with mpox',
      ],
    },
    children: {
      risk: 'moderate',
      summary:
        'Children rarely get mpox in the U.S. When they do, it is usually from close contact at home. Young children and children with eczema or other skin conditions may be more likely to get very sick.',
      actions: [
        'Teach children not to touch rashes or sores on other people',
        'If someone in your home has mpox, keep sores covered and do not share towels, bedding or cups',
        'If your child is exposed, ask a clinician whether the vaccine is recommended',
        'Call a clinician if your child develops a new rash after an exposure',
      ],
    },
    adults: {
      risk: 'moderate',
      summary:
        'Most U.S. cases are in adults in this age group, mainly spread during sex. The illness can be very painful and last weeks, but it is rarely life-threatening for people with healthy immune systems.',
      actions: [
        'Get both doses of the JYNNEOS vaccine, 4 weeks apart, if you are at higher risk. This includes gay, bisexual and other men who have sex with men, and transgender and nonbinary people, with certain risks in the past 6 months. Examples are a new sexually transmitted infection, more than one sex partner, or sex at a commercial sex venue or large event. Sex partners of people at risk also qualify',
        'If you have a new rash or sores, avoid sex and close contact and get checked',
        'If you are exposed, ask about the vaccine within 4 days. It may still help up to 14 days after exposure',
        'Ask about HIV testing and HIV PrEP (medicine that prevents HIV) at the same visit',
      ],
    },
    'older-adults': {
      risk: 'lower',
      summary:
        'Fewer cases occur in this age group. Some people got a smallpox vaccine as children, before routine U.S. smallpox vaccination ended in 1972, which may offer some protection. It is not enough on its own if you are at risk.',
      actions: [
        'Get the JYNNEOS vaccine if you are at higher risk, even if you had a smallpox vaccine as a child',
        'If you have a new rash or sores, avoid sex and close contact and get checked',
        'If you are exposed, ask about the vaccine within 4 days',
      ],
    },
    seniors: {
      risk: 'lower',
      summary:
        'Mpox is uncommon at this age. Many people this age had a smallpox vaccine as children, which may offer some protection. Other health conditions or a weakened immune system can make any infection harder to recover from.',
      actions: [
        'Get the JYNNEOS vaccine if you are at higher risk',
        'Call a clinician if you have a new rash after close contact with someone who has mpox',
        'If you care for someone with mpox, wear gloves and avoid touching their sores',
      ],
    },
    pregnant: {
      risk: 'higher',
      summary:
        'Mpox can pass to the baby during pregnancy or birth and may cause pregnancy loss or serious illness in the newborn. The JYNNEOS vaccine does not contain a virus that can grow in the body.',
      actions: [
        'If you are at risk or were exposed, ask your prenatal care provider about the JYNNEOS vaccine. It can be given during pregnancy and breastfeeding',
        'Call your prenatal care provider right away if you get a new rash or sores',
        'Avoid close contact with anyone who has mpox symptoms',
      ],
    },
    immunocompromised: {
      risk: 'highest',
      summary:
        'People with weakened immune systems, especially people with HIV that is not under control, are the most likely to get severe mpox. In the 2022 outbreak, most U.S. deaths were in people with advanced HIV.',
      actions: [
        'Get the JYNNEOS vaccine if you are at risk. It is safe for people with weakened immune systems because the virus in it cannot grow in the body',
        'If you have HIV, stay on HIV treatment. If you are not on treatment, talk with a clinician about starting',
        'Call your care team as soon as you notice a new rash. You may qualify for antiviral medicine',
        'Do not get the ACAM2000 vaccine, which contains a live virus',
      ],
    },
  },
  treatment: {
    summary:
      'Most people recover on their own in 2 to 4 weeks. Treatment focuses on controlling pain, caring for the sores and preventing spread. Antiviral medicines are reserved for people with severe illness or at high risk of it. Antibiotics do not work against mpox.',
    options: [
      {
        name: 'Pain relief and sore care',
        type: 'supportive',
        detail:
          'Pain can be severe, so ask your clinician about pain relief. Over-the-counter pain relievers, warm sitz baths (sitting in a few inches of warm water), numbing gels and stool softeners can help, and some people need prescription pain medicine. Keep sores clean, dry and covered. Do not scratch or pop them, and do not shave over them.',
        who: 'Everyone with mpox',
      },
      {
        name: 'Tecovirimat (TPOXX)',
        type: 'antiviral',
        detail:
          'An antiviral medicine approved for smallpox. Large studies of clade I and clade II mpox found it did not make sores heal faster, so it is not used for most people. CDC makes it available for people with severe mpox or at high risk of severe illness, such as people with severely weakened immune systems.',
        who: 'People with severe mpox or a severely weakened immune system, as decided by a clinician with CDC',
      },
      {
        name: 'Other treatments for severe illness',
        type: 'other',
        detail:
          'For very severe cases, specialists may use other antiviral medicines or an antibody product, usually in the hospital and with guidance from CDC.',
        who: 'People hospitalized with severe mpox',
      },
      {
        name: 'Antibiotics (only for a bacterial skin infection)',
        type: 'antibiotic',
        detail:
          'Antibiotics do not work against mpox. A clinician may prescribe them if the sores become infected with bacteria, which can cause spreading redness, warmth, swelling and pus.',
        who: 'Only people diagnosed with a bacterial infection',
      },
    ],
    antibioticsHelp: 'no',
  },
  prevention: {
    vaccines: [
      {
        name: 'JYNNEOS vaccine',
        who: 'Recommended for adults at higher risk. This includes gay, bisexual and other men who have sex with men, and transgender and nonbinary people, with certain risks in the past 6 months. These risks are a new sexually transmitted infection, more than one sex partner, or sex at a commercial sex venue or at a large public event where mpox is spreading. Sex partners of people at risk can also get it, as can people who expect to be in these situations. It is also recommended after an exposure. Teens and children may be able to get it in some situations, such as after an exposure; ask a clinician.',
        notes:
          'Two shots, 4 weeks apart. Protection is strongest about 2 weeks after the second dose, so get both. After an exposure, get it within 4 days if possible; it may still lessen illness if given up to 14 days after. It is expected to protect against both clade I and clade II. The vaccine virus cannot grow in the body, so it is safe for people with weakened immune systems and can be given during pregnancy. Booster doses are not currently recommended for most people, and people who have already had mpox generally do not need the vaccine. It is sold commercially, so ask your clinic, a sexual health clinic or a pharmacy whether they offer it.',
      },
      {
        name: 'ACAM2000 vaccine',
        who: 'Rarely used. FDA-approved for mpox, but it contains a live virus that can spread from the shot site and cause serious side effects.',
        notes:
          'Not for people with weakened immune systems, eczema or other skin conditions, heart disease, or pregnancy, or for anyone who lives with someone who has these conditions. JYNNEOS is the vaccine used for most people.',
      },
    ],
    everyday: [
      'Avoid close, skin-to-skin contact with anyone who has a rash or sores that look like mpox.',
      'Talk with sex partners about any recent rash, sores or illness. Condoms may lower but do not fully prevent spread, since sores can be on other parts of the body.',
      'If you have mpox, stay home and away from others until your rash has fully healed. If you must go out, cover your sores and wear a well-fitting mask.',
      'Do not share bedding, towels, clothing, cups or utensils with someone who has mpox, and wash your hands often with soap and water or an alcohol-based hand sanitizer.',
      'If you have mpox, avoid contact with pets and other animals.',
      'Before travel to an area with an mpox outbreak, ask a clinician about vaccination if you may have sex with new partners.',
    ],
  },
  testing:
    'A clinician tests for mpox by swabbing a sore and sending it to a lab for a PCR test (a test that finds the virus’s genetic material). If you have symptoms such as rectal pain or a sore throat but no visible sores, a clinician may swab the rectum or throat. People without symptoms are generally not tested. Many commercial labs and the MDH Public Health Laboratory can test. Public health labs can do further testing to tell whether an infection is clade I or clade II. Mpox is not part of standard BioFire respiratory or stomach panels. People tested for mpox are usually also offered HIV and other sexually transmitted infection testing. Mpox is a reportable disease in Minnesota (clinicians and labs must tell MDH about every case).',
  whenToSeekCare: [
    'Call a clinic or sexual health clinic if you have a new rash or sores and may have been exposed. Cover your sores and wear a mask when you go in.',
    'If you had close contact with someone who has mpox, call a clinician or MDH right away about the vaccine. It works best within 4 days of exposure.',
    'Call if your pain is not controlled, if sores are in your mouth or rectum, or if sores look infected.',
    'Call early if you have HIV or another condition that weakens your immune system, are pregnant, or have a baby or young child with a rash after an exposure.',
    'Go to the emergency department or call 911 for eye pain or vision changes, trouble breathing, confusion, or being unable to urinate or have a bowel movement.',
  ],
  readingTheNumbers:
    'Mpox is tracked by counting confirmed cases reported to MDH and CDC. It is not on standard BioFire panels, and there is no test positivity or emergency visit percentage for it. MN Pulse shows Minnesota cases from CDC’s weekly notifiable disease tables. These counts are provisional, and Minnesota often adds cases to earlier weeks, so a blank week does not mean zero. The year-to-date total is the better guide. Because only people with symptoms get tested, counts reflect people who noticed symptoms and sought care. Since the 2022 outbreak, U.S. cases have continued at much lower levels. A rising count usually means more spread through sexual networks. It is a signal for people at higher risk to get both vaccine doses and to watch for symptoms. It does not mean everyday activities like work, school or shopping have become risky. MN Pulse also shows mpox results from wastewater testing. CDC’s national program reports how many Minnesota sites found any type of mpox each week. WastewaterSCAN tests 4 plants outside the Twin Cities, with separate tests for clade II and clade Ib (a form of clade I). One infected person or a visitor can cause a detection, so it is an early alert, not a case count. A clade I detection or case gets extra public health follow-up because this type has historically caused more severe illness.',
  watchNotes: [
    'As of late September 2026, CDC’s provisional weekly tables listed 25 Minnesota mpox cases so far in 2026, compared with 17 at the same point in 2025. Check the MDH mpox page for current Minnesota information.',
    'Clade II mpox continues to spread at low levels in the U.S., mostly during sex between men. Getting both JYNNEOS doses remains the best protection for people at higher risk.',
    'Since late 2024, a small number of clade I mpox cases have been found in the U.S. Most were in people who had traveled to affected countries, but a few in 2025 had no travel history. JYNNEOS is expected to protect against clade I.',
    'In September 2025, the World Health Organization ended the global mpox emergency it declared in August 2024. Clade I outbreaks continue in parts of central and eastern Africa.',
    'Studies found that tecovirimat (TPOXX) did not speed healing, so it is now reserved for people with severe illness or at high risk of it.',
  ],
  sources: [
    { label: 'CDC: About Mpox', url: 'https://www.cdc.gov/mpox/about/index.html' },
    { label: 'CDC: Mpox Signs and Symptoms', url: 'https://www.cdc.gov/mpox/signs-symptoms/index.html' },
    { label: 'CDC: Mpox Vaccines', url: 'https://www.cdc.gov/mpox/vaccines/index.html' },
    { label: 'CDC: Mpox Situation Summary', url: 'https://www.cdc.gov/mpox/situation-summary/index.html' },
    { label: 'FDA: JYNNEOS', url: 'https://www.fda.gov/vaccines-blood-biologics/jynneos' },
    {
      label: 'CDC: NNDSS weekly notifiable disease data (provisional)',
      url: 'https://data.cdc.gov/d/x9gk-5huc',
    },
    { label: 'WastewaterSCAN data dashboard', url: 'https://data.wastewaterscan.org/' },
    { label: 'MDH: Mpox', url: 'https://www.health.state.mn.us/diseases/mpox/index.html' },
    { label: 'WHO: Mpox fact sheet', url: 'https://www.who.int/news-room/fact-sheets/detail/mpox' },
  ],
  lastReviewed: '2026-10-07',
}

export default profile
