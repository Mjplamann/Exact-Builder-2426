// TODO(verify): drafted from long-standing CDC, IDSA (2012 pharyngitis guideline), AAP (Red Book) and AHA
// information WITHOUT live web verification (the shared WebSearch budget was exhausted; cdc.gov and
// health.state.mn.us were blocked). Minnesota STSS counts come from CDC's NNDSS weekly table
// (data.cdc.gov x9gk-5huc) as downloaded on 2026-10-07. Before publishing, add pathogen-specific sources:
// CDC group A strep pages (strep throat, scarlet fever, invasive GAS, clinical guidance), CDC ABCs GAS
// reports, MDH group A strep / ABCs pages, IDSA GAS pharyngitis guideline, AAP Red Book GAS chapter.
import type { PathogenProfile } from '../types'

const profile: PathogenProfile = {
  id: 'strep-a',
  name: 'Group A strep (Streptococcus pyogenes)',
  shortName: 'Strep A',
  aka: ['Group A Streptococcus', 'Streptococcus pyogenes', 'GAS', 'Strep throat', 'Scarlet fever', 'Invasive group A strep (iGAS)'],
  category: 'respiratory-bacterial',
  kind: 'bacterium',
  oneLiner: 'Bacteria that cause strep throat and scarlet fever, and rarely serious infections of the blood, skin, and muscle.',
  overview:
    'Group A Streptococcus (strep A) is a common bacterium that causes strep throat, scarlet fever, and skin infections such as impetigo. Most infections are mild and are easily treated with antibiotics. Treating strep throat matters, because untreated infections can rarely lead to rheumatic fever, which can damage the heart, or to kidney problems. Rarely, strep A causes invasive infections, such as blood infections, “flesh-eating” infection (necrotizing fasciitis), or toxic shock syndrome, which are emergencies.',
  seasonality: {
    summary:
      'Strep throat can happen any time of year but is most common during the school year. In Minnesota, as in other northern states, it is usually highest from winter into early spring. Serious (invasive) strep infections also tend to be more common in winter and spring.',
    peakMonths: [1, 2, 3, 4],
  },
  transmission:
    'Strep A spreads easily through droplets when a sick person coughs, sneezes, or talks, and through sharing cups, utensils, or food. It can also spread by touching skin sores from impetigo or infected wounds. People who carry the bacteria in their throat without symptoms are less likely to spread it.',
  incubation:
    'Strep throat and scarlet fever usually start 2 to 5 days after exposure. Impetigo (a skin infection) usually starts 7 to 10 days after exposure.',
  contagiousPeriod:
    'People with strep throat or scarlet fever can return to school, child care, or work once they no longer have a fever and have taken antibiotics for at least 12 hours. Without antibiotics, people can stay contagious for weeks.',
  symptoms: {
    common: [
      'Sore throat that can start very quickly',
      'Pain when swallowing',
      'Fever',
      'Red, swollen tonsils, sometimes with white patches or streaks of pus',
      'Tiny red spots on the roof of the mouth',
      'Swollen, tender lymph nodes (glands) in the front of the neck',
      'Scarlet fever: a red rash that feels like sandpaper, often starting on the neck, chest, or belly, plus a red “strawberry” tongue',
    ],
    lessCommon: [
      'Headache, stomach pain, nausea, or vomiting, especially in children',
      'Impetigo: red sores, often around the nose and mouth, that break open and form honey-colored crusts',
      'Cellulitis: a red, warm, painful area of skin',
      'Rheumatic fever, weeks after untreated strep throat: fever, painful swollen joints, chest pain, shortness of breath, or jerky movements; it can damage the heart',
      'Kidney inflammation (post-streptococcal glomerulonephritis) 1 to 3 weeks after infection: dark, tea- or cola-colored urine, less urine, or swelling of the face and legs',
      'Invasive infections such as blood infection, pneumonia, necrotizing fasciitis, or streptococcal toxic shock syndrome (rare)',
    ],
    emergencyWarningSigns: [
      'Trouble breathing, or trouble swallowing with drooling',
      'A red, warm, swollen, or blistered area of skin that spreads quickly, especially with severe pain that seems worse than the skin looks, or with fever',
      'Fever with dizziness, fainting, confusion, or a very fast heartbeat or breathing, which can be signs of toxic shock or sepsis',
      'Very sleepy, limp, or hard to wake',
      'Little or no urine',
    ],
  },
  ageGroups: {
    infants: {
      risk: 'moderate',
      summary:
        'Strep throat is rare in children younger than 3. Babies can still get other strep A infections, and serious (invasive) infections are rare but can happen.',
      actions: [
        'Call your clinician right away if a baby younger than 3 months has a fever of 100.4°F (38°C) or higher.',
        'If someone at home has strep throat, keep them from sharing cups or utensils or having close face-to-face contact with the baby until they have taken antibiotics for at least 12 hours.',
        'Call your clinician about red, swollen, or crusted skin sores.',
        'Seek emergency care for a baby who is very sleepy, hard to wake, breathing fast, or has a red area of skin that spreads quickly.',
      ],
    },
    children: {
      risk: 'moderate',
      summary:
        'Strep throat is most common in children ages 5 to 15, and scarlet fever and impetigo are also common in children. Most get better quickly with antibiotics. Serious (invasive) strep infections are rare, but the risk is higher shortly after chickenpox or flu.',
      actions: [
        'See a clinician for a sudden sore throat with fever, especially without a cough or runny nose. A quick test can check for strep.',
        'If your child has strep, give every dose of the antibiotic, even after they feel better, to help prevent complications like rheumatic fever.',
        'Keep your child home until they have no fever and have taken antibiotics for at least 12 hours.',
        'Flu and chickenpox can raise the risk of serious strep infections, so keep your child up to date on those vaccines.',
        'Get care right away for a red, swollen, very painful area of skin, or if your child seems much sicker than expected.',
      ],
    },
    adults: {
      risk: 'lower',
      summary:
        'Adults get strep throat less often than children, and most adult sore throats are caused by viruses. Parents of school-age children and people who work with children get strep more often.',
      actions: [
        'See a clinician for a sudden sore throat with fever and swollen neck glands, especially without a cough. Antibiotics are needed only if a test shows strep.',
        'If you have strep, take the full antibiotic course, and stay home until you have no fever and have taken antibiotics for at least 12 hours.',
        'Clean and cover cuts, scrapes, and other wounds, and watch for redness, swelling, or pain that spreads.',
        'Get care right away for a skin infection that spreads fast or is very painful, or for fever with dizziness or confusion.',
      ],
    },
    'older-adults': {
      risk: 'moderate',
      summary:
        'Strep throat is less common at this age, but the risk of serious (invasive) strep infections goes up with age and with conditions like diabetes, heart disease, cancer, and skin wounds or skin disease.',
      actions: [
        'Keep wounds clean and covered, and take care of skin conditions and foot sores, especially if you have diabetes.',
        'Get care right away for a red, swollen, painful area of skin that spreads, or for fever with dizziness or confusion.',
        'See a clinician for a sore throat with fever and no cough to check for strep.',
        'Stay up to date on flu vaccine. Flu can raise the risk of serious strep infections.',
      ],
    },
    seniors: {
      risk: 'higher',
      summary:
        'Adults 65 and older are among those at highest risk for serious (invasive) strep A infections, especially people with chronic health conditions or wounds and people who live in long-term care facilities. Outbreaks can happen in nursing homes.',
      actions: [
        'Keep cuts, scrapes, and skin sores clean and covered, and watch for spreading redness, warmth, or pain.',
        'Get emergency care for fever with confusion, dizziness, or fainting, or for a skin infection that spreads fast or is very painful.',
        'If you live in a care facility, tell staff right away about new wounds, a sore throat, or fever.',
        'Stay up to date on flu vaccine. Flu can raise the risk of serious strep infections.',
      ],
    },
    pregnant: {
      risk: 'higher',
      summary:
        'Strep throat during pregnancy is treated much as it is for other adults. The risk of serious strep A infection is higher around childbirth and in the weeks after, when it can cause a dangerous infection of the uterus or sepsis.',
      actions: [
        'See a clinician for a sore throat with fever. Penicillin and amoxicillin are commonly used and considered safe in pregnancy.',
        'After delivery, call your clinician right away for fever, chills, severe belly pain, foul-smelling discharge, or feeling very unwell.',
        'Wash hands often, especially if older children at home have strep throat or skin sores.',
        'Know that group A strep is different from group B strep, the bacteria pregnant people are routinely tested for late in pregnancy.',
      ],
    },
    immunocompromised: {
      risk: 'higher',
      summary:
        'People with weakened immune systems are at higher risk for serious (invasive) strep infections, and infections may get worse faster.',
      actions: [
        'Contact your care team promptly for a sore throat with fever, a skin infection, or a wound that looks red or swollen.',
        'Get emergency care for fever with dizziness or confusion, or a skin infection that spreads fast or is very painful.',
        'Keep wounds clean and covered, and wash hands often.',
        'Ask household members with strep throat to finish their antibiotics and avoid sharing cups and utensils.',
      ],
    },
  },
  treatment: {
    summary:
      'Strep throat and scarlet fever are treated with antibiotics, which shorten the illness, stop the spread to others, and help prevent rare but serious problems such as rheumatic fever. Penicillin or amoxicillin is the first choice, usually for 10 days, and they still work reliably against strep A. People with a penicillin allergy have other options. Invasive strep infections are emergencies that need hospital care, strong antibiotics through a vein, and sometimes surgery.',
    options: [
      {
        name: 'Penicillin or amoxicillin',
        type: 'antibiotic',
        detail:
          'The first choice for strep throat and scarlet fever. They are usually taken by mouth for 10 days; a one-time penicillin shot is another option. Amoxicillin is often preferred for children because the liquid tastes better. Finish the full course even after you feel better.',
        who: 'People diagnosed with strep throat or scarlet fever who are not allergic to penicillin',
      },
      {
        name: 'Other antibiotics for people with a penicillin allergy',
        type: 'antibiotic',
        detail:
          'Options include cephalexin or cefadroxil (for people without a severe penicillin allergy), clindamycin, azithromycin, or clarithromycin. Strep A is becoming more resistant to azithromycin, clarithromycin, and clindamycin, so clinicians choose carefully. Many people labeled allergic to penicillin can take it safely, so ask your clinician about allergy testing.',
        who: 'People with a penicillin allergy',
      },
      {
        name: 'Pain and fever relief',
        type: 'supportive',
        detail:
          'Acetaminophen or ibuprofen can ease throat pain and fever; follow the label or your clinician’s advice for age and weight. Cold or warm drinks, soft foods, and frozen treats can help. Throat lozenges are for older children and adults only because of choking risk. Never give aspirin to children or teens.',
        who: 'Anyone with a painful sore throat, along with antibiotics if strep is confirmed',
      },
      {
        name: 'Antibiotic ointment or pills for impetigo',
        type: 'antibiotic',
        detail:
          'A few small impetigo sores may be treated with a prescription antibiotic ointment. Widespread sores need antibiotics by mouth. Keep sores covered to prevent spread.',
        who: 'People with impetigo',
      },
      {
        name: 'Hospital care for invasive infections',
        type: 'supportive',
        detail:
          'Invasive strep A infections, such as blood infections, necrotizing fasciitis, or streptococcal toxic shock syndrome, need hospital care with antibiotics through a vein (often penicillin plus clindamycin), fluids, and support for blood pressure and breathing. Necrotizing fasciitis usually needs emergency surgery to remove infected tissue.',
        who: 'Anyone with a serious, invasive strep A infection',
      },
    ],
    antibioticsHelp: 'yes',
  },
  prevention: {
    vaccines: [],
    everyday: [
      'Wash hands often with soap and water, especially after coughing or sneezing and before eating or preparing food.',
      'Cover coughs and sneezes, and do not share cups, utensils, or water bottles.',
      'Stay home until there is no fever and antibiotics have been taken for at least 12 hours.',
      'Clean cuts, scrapes, and other wounds, and keep them covered until they heal.',
      'Get flu and chickenpox vaccines as recommended, because these infections can raise the risk of serious strep A infections.',
      'There is no vaccine for strep A.',
    ],
  },
  testing:
    'A clinician tests for strep throat by swabbing the throat. A rapid strep test gives results in minutes. If a rapid test is negative in a child or teen, clinicians often send a throat culture (growing the bacteria in a lab) to be sure, because rapid tests can miss some cases; adults usually do not need a backup culture. A cough, runny nose, hoarse voice, pink eye, or mouth sores usually point to a virus instead, and testing is often not needed. Children younger than 3 are usually not tested unless they have a reason to, such as a brother or sister with strep. Some people carry strep A in their throat without being sick, which is one reason clinicians test only when symptoms suggest strep. Invasive strep A infections are found by testing blood or other body fluids or tissue in the hospital.',
  whenToSeekCare: [
    'Call 911 or go to the emergency department for trouble breathing, drooling or not being able to swallow, a fast-spreading or very painful red area of skin, or fever with confusion, dizziness, or fainting.',
    'See a clinician the same day for severe throat pain on one side, a muffled voice, or trouble opening the mouth, which can be signs of an abscess (a pocket of pus).',
    'Call your clinician for a sudden sore throat with fever, especially with swollen neck glands and no cough or runny nose, or for a sandpaper-like rash.',
    'Call your clinician if you are not better after 48 hours of antibiotics.',
    'Call your clinician if, in the weeks after a strep infection, you notice dark urine, swelling of the face or legs, joint pain, or chest pain.',
    'Urgent care and many retail clinics can test for strep throat when your clinic is closed. Go to the emergency department for any emergency warning sign.',
  ],
  readingTheNumbers:
    'Strep A is harder to track than many respiratory germs. Strep throat is diagnosed with quick tests in clinics and is not reported to the state, so there is no direct count of how much is going around. Strep A is also not part of the standard multi-pathogen respiratory panel behind BioFire detection rates, and CDC’s public emergency department data cover COVID-19, flu, and RSV, not strep. Numbers MN Pulse may show for strep A come from reports of serious disease. Invasive group A strep is a reportable disease in Minnesota, and MDH tracks it as part of CDC’s Active Bacterial Core surveillance (ABCs) program. Streptococcal toxic shock syndrome, a rare and severe complication, also appears in CDC’s weekly notifiable disease tables. These counts are small and are often updated weeks later, so one week’s number means little; look at trends over months and years. A rise in invasive strep does not mean strep throat is more dangerous for a typical person. It is a reminder to treat strep throat fully, care for wounds, and get care fast for any emergency warning sign.',
  watchNotes: [
    'Invasive group A strep infections rose across the U.S. starting in late 2022, first among children, and stayed higher than before the pandemic among adults. CDC lists higher risk for adults 65 and older, people with chronic conditions or wounds, people who inject drugs, people experiencing homelessness, residents of long-term care facilities, and American Indian and Alaska Native people.',
    'In CDC’s provisional notifiable disease data, Minnesota reports of streptococcal toxic shock syndrome rose to 41 in 2023, up from 10 in 2022, then fell to 15 in 2024.',
    'Strep A is becoming more resistant to azithromycin and clindamycin, but penicillin and amoxicillin still work reliably.',
    'Several strep A vaccines are being studied, but none are approved.',
  ],
  sources: [
    {
      label: 'CDC: NNDSS weekly notifiable disease data (provisional)',
      url: 'https://data.cdc.gov/d/x9gk-5huc',
    },
  ],
  lastReviewed: '2026-10-07',
}

export default profile
