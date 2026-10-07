import type { PathogenProfile } from '../types'

const profile: PathogenProfile = {
  id: 'hepatitis-a',
  name: 'Hepatitis A',
  shortName: 'Hepatitis A',
  aka: ['Hep A', 'HAV', 'Hepatitis A virus'],
  category: 'vaccine-preventable',
  kind: 'virus',
  oneLiner: 'A liver infection spread through contaminated food, water or close contact. A 2-dose vaccine gives long-lasting protection.',
  overview:
    'Hepatitis A is a liver infection caused by the hepatitis A virus. It can make adults sick for weeks, with tiredness, nausea and yellow skin or eyes (jaundice). It does not become a long-term (chronic) infection, and most people recover fully. Rarely, it causes liver failure, mostly in older adults and people with other liver disease. A safe vaccine prevents it, and since 2016 large outbreaks in many states have spread mainly among people who use drugs or are experiencing homelessness.',
  seasonality: {
    summary:
      'Hepatitis A does not have a strong season in Minnesota and can happen any time of year. Cases often follow travel to countries where the virus is common, eating a contaminated food, or close contact with someone who has it. Outbreaks can last for months when the virus spreads person to person.',
    peakMonths: [],
  },
  transmission:
    'The virus is in the stool (poop) of infected people. It spreads when a tiny, unseen amount gets into someone’s mouth. This can happen through close contact, such as living with or caring for someone who has it, sex, or sharing drug-use equipment. It can also spread through food or drinks handled by an infected person who did not wash their hands well, or through contaminated food or water, such as some imported fresh or frozen produce. The virus can live on surfaces and hands for a long time.',
  incubation:
    'Symptoms usually start about 4 weeks after exposure, but it can be anywhere from 15 to 50 days.',
  contagiousPeriod:
    'People are most contagious in the 1 to 2 weeks before symptoms start, when they do not yet know they are sick. The risk then drops and is low by about 1 week after jaundice (yellow skin or eyes) begins. Young children and people with weakened immune systems can spread it longer. Children with no symptoms can still spread it.',
  symptoms: {
    common: [
      'Feeling very tired',
      'Loss of appetite',
      'Nausea and vomiting',
      'Stomach pain',
      'Fever',
      'Dark urine and pale or clay-colored stool',
      'Yellow skin or yellow whites of the eyes (jaundice)',
    ],
    lessCommon: [
      'Joint pain',
      'Diarrhea, more common in children',
      'Itchy skin',
      'Symptoms that come back or last up to 6 months, which happens in a small number of people',
      'No symptoms at all, which is common in children under 6',
    ],
    emergencyWarningSigns: [
      'Confusion, unusual sleepiness, or being hard to wake (possible signs of liver failure)',
      'Unusual bleeding or bruising, such as nosebleeds or bleeding gums',
      'Vomiting so much you cannot keep fluids down, or signs of dehydration such as little or no urine',
      'Severe belly pain or a swollen belly',
      'Jaundice that gets worse along with any of the signs above',
    ],
  },
  ageGroups: {
    infants: {
      risk: 'lower',
      summary:
        'Babies with hepatitis A usually have mild or no symptoms, but they can pass the virus to others without anyone knowing. The routine vaccine starts at age 1.',
      actions: [
        'If your baby is 6 to 11 months old and you plan to travel outside the U.S., ask about a hepatitis A vaccine dose before the trip. It does not count toward the 2 routine doses later',
        'If your baby is under 12 months and is exposed, call your clinician within 2 weeks. Babies this age get immune globulin (a shot of antibodies) instead of the vaccine',
        'Wash your hands with soap and water after every diaper change and before preparing food',
      ],
    },
    children: {
      risk: 'lower',
      summary:
        'Most children under 6 have no symptoms or a mild illness, but they can spread the virus to family members and caregivers. Older children and teens are more likely to have symptoms such as jaundice.',
      actions: [
        'Get the 2-dose hepatitis A vaccine starting at age 1, with the doses at least 6 months apart',
        'If your child missed the vaccine, ask about catching up at any age through 18',
        'Teach and supervise handwashing with soap and water after using the toilet and before eating',
        'If your child is exposed, call your clinician within 2 weeks about a vaccine dose',
      ],
    },
    adults: {
      risk: 'moderate',
      summary:
        'Most adults with hepatitis A have symptoms, often including jaundice, and may miss weeks of work or school. Most recover fully without lasting liver damage.',
      actions: [
        'Get vaccinated if you are at higher risk: before international travel, if you use drugs, are experiencing homelessness, are a man who has sex with men, have HIV or chronic liver disease, or work where you could be exposed. Any adult who wants protection can get it',
        'If you are exposed, call a clinician within 2 weeks. A vaccine dose can prevent illness',
        'If you work with food, in child care or in health care and get hepatitis A, tell your employer and follow public health rules before returning to work',
        'Avoid alcohol while you are sick and ask before taking any medicines or supplements',
      ],
    },
    'older-adults': {
      risk: 'higher',
      summary:
        'The chance of severe illness and liver failure rises with age, especially after 50. Having hepatitis B or C, cirrhosis or another liver disease raises the risk even more.',
      actions: [
        'Ask your clinician whether you have had the hepatitis A vaccine. If you have liver disease, you should get it',
        'Get vaccinated before international travel. If you leave in less than 2 weeks, ask whether you should also get immune globulin',
        'If you are exposed, call a clinician within 2 weeks. You may get both the vaccine and immune globulin',
        'Ask before taking pain relievers or supplements when you are sick, since some can strain the liver',
      ],
    },
    seniors: {
      risk: 'highest',
      summary:
        'Older adults are the most likely to need hospital care or to die from hepatitis A, though deaths are still rare. Recovery can take longer.',
      actions: [
        'Ask your clinician whether the hepatitis A vaccine is right for you, especially before travel or if you have liver disease',
        'If you are exposed, call a clinician within 2 weeks about the vaccine and immune globulin',
        'Get care quickly for jaundice, confusion or vomiting that will not stop',
        'Wash hands with soap and water before eating and after using the bathroom',
      ],
    },
    pregnant: {
      risk: 'moderate',
      summary:
        'Hepatitis A during pregnancy is usually similar to illness in other adults. The vaccine is an inactivated (non-live) vaccine and is recommended during pregnancy for people at risk of infection or of severe illness.',
      actions: [
        'Ask your prenatal care provider about the vaccine if you plan to travel, have liver disease, use drugs, or have another risk',
        'If you are exposed, call your prenatal care provider within 2 weeks',
        'Wash hands with soap and water, especially after changing diapers or caring for young children',
      ],
    },
    immunocompromised: {
      risk: 'higher',
      summary:
        'People with weakened immune systems, including people with HIV, may be sick longer and spread the virus longer. The vaccine is safe because it is not live, but it may work less well, so your care team may check your response.',
      actions: [
        'Get the hepatitis A vaccine. It is recommended for people with HIV and is safe for people with weakened immune systems',
        'If you are exposed, call your care team within 2 weeks. You may need both the vaccine and immune globulin',
        'Ask your care team whether a blood test should confirm that the vaccine worked',
      ],
    },
  },
  treatment: {
    summary:
      'There is no medicine that cures hepatitis A. The body clears the virus on its own, usually within 2 months. Treatment focuses on rest, fluids and protecting the liver while it heals. Antibiotics do not help.',
    options: [
      {
        name: 'Home care: rest, fluids and food',
        type: 'supportive',
        detail:
          'Rest, drink plenty of fluids and eat small meals when you can. Avoid alcohol until your clinician says your liver has healed. Ask your clinician or pharmacist before taking any medicine, including acetaminophen (Tylenol), or herbal products and supplements, since some can strain the liver.',
        who: 'Most people with hepatitis A',
      },
      {
        name: 'Hospital care',
        type: 'supportive',
        detail:
          'IV (intravenous) fluids for dehydration and close monitoring of liver function. In very rare cases of liver failure, a liver transplant may be needed.',
        who: 'People with severe vomiting, dehydration or signs of liver failure',
      },
    ],
    antibioticsHelp: 'no',
  },
  prevention: {
    vaccines: [
      {
        name: 'Hepatitis A vaccine (Havrix or Vaqta)',
        who: 'All children starting at age 1, with catch-up through age 18. Adults at higher risk: international travelers, people who use drugs, people experiencing homelessness, men who have sex with men, people with HIV or chronic liver disease, people with job-related exposure, and close contacts of a newly adopted child from a country where hepatitis A is common. Any adult who wants protection. Infants 6 to 11 months traveling outside the U.S. can get 1 early dose. The American Academy of Pediatrics recommends it for all children.',
        notes:
          'Two doses, at least 6 months apart. Protection lasts at least 20 years and probably for life, and booster doses are not needed. One dose given any time before travel protects most healthy people. A dose within 2 weeks after an exposure can prevent illness. It is an inactivated (non-live) vaccine.',
      },
      {
        name: 'Combined hepatitis A and B vaccine (Twinrix)',
        who: 'Adults 18 and older who need protection against both hepatitis A and hepatitis B.',
        notes: 'Usually given as 3 doses over 6 months. A faster schedule exists for people who need protection sooner.',
      },
      {
        name: 'Immune globulin (IG) after exposure or before travel (not a vaccine)',
        who: 'Babies under 12 months who are exposed, people with weakened immune systems or chronic liver disease (along with the vaccine), and people who cannot get the vaccine. Babies under 6 months traveling outside the U.S. Some adults over 40 may get it along with the vaccine, based on a clinician’s judgment.',
        notes:
          'IG is a shot of ready-made antibodies that gives short-term protection. After an exposure, it should be given within 2 weeks.',
      },
    ],
    everyday: [
      'Wash hands with soap and water after using the bathroom or changing diapers, and before preparing or eating food. Soap and water is the best choice; hand sanitizer may not work as well against hepatitis A.',
      'When traveling to countries where hepatitis A is common, get vaccinated and drink bottled or boiled water.',
      'If you have hepatitis A, do not prepare food for others, and stay home from work, school or child care until public health says you can return.',
      'Clean bathrooms and other surfaces with a bleach-based cleaner when someone in the home has hepatitis A.',
      'Do not share towels, toothbrushes, eating utensils, or drug-use equipment.',
      'Follow food recall notices. Cooking food thoroughly kills the virus.',
    ],
  },
  testing:
    'Hepatitis A is diagnosed with a blood test that looks for a type of antibody (IgM) the body makes early in the infection. Your clinician may also check your liver with blood tests. A different antibody test can show if you are already immune from a past infection or the vaccine. Hepatitis A is not part of the BioFire stomach (gastrointestinal) panel, which tests stool. Hepatitis A is a reportable disease in Minnesota, so MDH follows up on each case to find others who may need a vaccine.',
  whenToSeekCare: [
    'Call a health care provider within 2 weeks if you were exposed, such as through someone you live with, a sex partner, or a restaurant or event named by health officials. The vaccine or immune globulin works best when given early.',
    'Call if you have yellow skin or eyes, dark urine or pale stool, or several days of nausea, tiredness and loss of appetite.',
    'Call before taking medicines or supplements while you are sick.',
    'Call early if you are over 50, have liver disease, are pregnant, or have a weakened immune system.',
    'Go to the emergency department or call 911 for confusion, unusual sleepiness, unusual bleeding, severe belly pain, or vomiting that will not stop.',
  ],
  readingTheNumbers:
    'Hepatitis A is tracked by counting confirmed cases reported to MDH and CDC. It is not on the BioFire stomach panel, and there is no test positivity or emergency visit percentage for it. Because symptoms take 2 to 7 weeks to appear, a case reported today usually reflects an exposure weeks earlier, and outbreaks can take a while to recognize. Many young children have no symptoms and are never tested, so case counts miss some infections. A rise in cases usually means a cluster or outbreak, such as spread among people who are experiencing homelessness or using drugs, or illness linked to a contaminated food. For most people, the right response is to check that you and your children are vaccinated. If health officials name a restaurant or event, people who were there in the past 2 weeks may be offered a vaccine to prevent illness.',
  watchNotes: [
    'Since 2016, large hepatitis A outbreaks in many U.S. states have spread person to person, mainly among people who use drugs or are experiencing homelessness. Vaccination and access to handwashing are key to stopping them.',
    'Some U.S. outbreaks in recent years have been linked to imported fresh or frozen berries. Watch for recall notices.',
    'The American Academy of Pediatrics recommends hepatitis A vaccine for all children starting at age 1. Federal childhood vaccine guidance changed several times in 2025 and 2026, and parts of it have been challenged in court, so ask your child’s clinician what applies now.',
  ],
  sources: [
    { label: 'CDC: About Hepatitis A', url: 'https://www.cdc.gov/hepatitis-a/about/index.html' },
    {
      label: 'CDC MMWR: Prevention of Hepatitis A Virus Infection in the United States (ACIP, 2020)',
      url: 'https://www.cdc.gov/mmwr/volumes/69/rr/rr6905a1.htm',
    },
    {
      label: 'CDC Pink Book: Hepatitis A',
      url: 'https://www.cdc.gov/pinkbook/hcp/table-of-contents/chapter-9-hepatitis-a.html',
    },
    {
      label: 'CDC Yellow Book: Hepatitis A',
      url: 'https://www.cdc.gov/yellow-book/hcp/travel-associated-infections-diseases/hepatitis-a.html',
    },
    { label: 'MDH: Hepatitis A', url: 'https://www.health.state.mn.us/diseases/hepatitis/a/index.html' },
    { label: 'WHO: Hepatitis A fact sheet', url: 'https://www.who.int/news-room/fact-sheets/detail/hepatitis-a' },
  ],
  lastReviewed: '2026-10-07',
}

export default profile
