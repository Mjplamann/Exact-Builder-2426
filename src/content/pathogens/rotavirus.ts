// TODO(verify): drafted from long-standing CDC/ACIP/AAP guidance WITHOUT live web verification
// (the shared WebSearch budget was exhausted). Verify current (Oct 2026) vaccine-schedule status
// and add authoritative source URLs before publishing.
import type { PathogenProfile } from '../types'

const profile: PathogenProfile = {
  id: 'rotavirus',
  name: 'Rotavirus',
  shortName: 'Rotavirus',
  aka: ['Rotavirus gastroenteritis', 'Stomach bug'],
  category: 'gastrointestinal',
  kind: 'virus',
  biofireTargets: ['Rotavirus A'],
  oneLiner: 'A stomach virus that causes severe diarrhea and vomiting in babies and young children. Vaccines prevent most serious cases.',
  overview:
    'Rotavirus causes watery diarrhea, vomiting and fever, mostly in babies and young children. Before rotavirus vaccines became available in the U.S. in 2006, almost every child caught it by age 5, and it sent many young children to the hospital with dehydration (losing too much body fluid). Vaccines given by mouth in the first months of life have greatly reduced severe illness. Older children and adults can also get rotavirus, but it is usually milder.',
  seasonality: {
    summary:
      'Before vaccines, rotavirus surged every year in late winter and spring. Since vaccines, U.S. seasons are smaller, start later and often follow an every-other-year pattern. In Minnesota, cases are most likely from about March through May, but rotavirus can show up any time of year.',
    peakMonths: [3, 4, 5],
  },
  transmission:
    'Rotavirus spreads through the stool (poop) of infected people. Tiny amounts get on hands, toys, diaper-changing areas and other surfaces, and then into the mouth. It spreads easily within families and in child care. The virus can survive on hands and hard surfaces for some time, so handwashing and cleaning matter.',
  incubation: 'Symptoms usually start about 2 days after exposure.',
  contagiousPeriod:
    'Rotavirus is in the stool before symptoms start and while a person is sick, and it can stay there for days after symptoms end, longer in people with weak immune systems. Babies who recently got the rotavirus vaccine can pass vaccine virus in their stool for a short time, so wash hands after diaper changes.',
  symptoms: {
    common: ['Watery diarrhea, often severe', 'Vomiting', 'Fever', 'Stomach pain'],
    lessCommon: ['Loss of appetite', 'Fussiness or tiredness', 'Signs of dehydration, such as fewer wet diapers or a dry mouth'],
    emergencyWarningSigns: [
      'A baby or young child with no wet diaper or urine for many hours, no tears when crying, sunken eyes, or a sunken soft spot on the head',
      'Unusual sleepiness, floppiness, or being hard to wake',
      'Cannot keep any fluids down and is getting weaker',
      'Blood in the stool or black stool',
      'Severe or constant belly pain',
      'After a rotavirus vaccine: bouts of hard crying with legs pulled to the chest, repeated vomiting, or blood in the stool (rare signs of a bowel blockage called intussusception)',
    ],
  },
  ageGroups: {
    infants: {
      risk: 'highest',
      summary:
        'Babies and young children are the most likely to get severely dehydrated from rotavirus. Vaccination in the first months of life is the best protection.',
      actions: [
        'Ask your baby’s clinician about rotavirus vaccine at the 2-month visit; the series must be started by 14 weeks 6 days of age',
        'Keep breastfeeding or formula feeding during illness',
        'Use an oral rehydration solution if your baby’s clinician recommends it',
        'Watch for fewer wet diapers, no tears and unusual sleepiness',
        'Wash your hands with soap and water after every diaper change',
      ],
    },
    children: {
      risk: 'moderate',
      summary:
        'Toddlers and preschoolers, especially those who are not vaccinated, can still get sick and dehydrated. Older children usually have milder illness.',
      actions: [
        'Offer small, frequent sips of fluid; an oral rehydration solution works best',
        'Keep your child home from child care or school while they have diarrhea or vomiting, and follow the program’s return rules',
        'Supervise handwashing after using the toilet and before eating',
        'Clean toys, high-touch surfaces and diaper areas often',
        'Call your child’s clinician if you see signs of dehydration',
      ],
    },
    adults: {
      risk: 'lower',
      summary:
        'Adults can catch rotavirus, often from a sick child, but illness is usually mild and some people have no symptoms. Parents and child care workers are the most exposed.',
      actions: [
        'Wash hands with soap and water after changing diapers or helping with toileting',
        'Drink plenty of fluids if you get sick',
        'Stay home from work while sick, especially if you work in food service, health care or child care',
        'Help the babies in your life get their vaccines on time',
      ],
    },
    'older-adults': {
      risk: 'lower',
      summary:
        'Rotavirus is usually mild in this age group. Dehydration is more of a concern if you have chronic health conditions.',
      actions: [
        'Wash hands with soap and water after caring for young grandchildren or changing diapers',
        'Drink fluids early if you get vomiting or diarrhea',
        'Call your clinician if you cannot keep fluids down',
      ],
    },
    seniors: {
      risk: 'moderate',
      summary:
        'Older adults are more affected by dehydration from any stomach illness, and rotavirus can spread in nursing homes.',
      actions: [
        'Drink fluids as soon as symptoms begin',
        'Wash hands with soap and water, especially after contact with young children',
        'Get care quickly for dizziness, confusion or very little urine',
        'Have someone check on you if you live alone',
      ],
    },
    pregnant: {
      risk: 'lower',
      summary:
        'Rotavirus is not usually more serious during pregnancy, but dehydration from any stomach illness should be taken seriously. Pregnancy is a good time to plan for your baby’s vaccines.',
      actions: [
        'Talk with your clinician about your baby’s rotavirus vaccine before birth',
        'If you took medicines that weaken the immune system during pregnancy, tell your baby’s clinician before the rotavirus vaccine',
        'Wash hands after diaper changes if you have other young children',
        'Call your prenatal care provider if you cannot keep fluids down',
      ],
    },
    immunocompromised: {
      risk: 'higher',
      summary:
        'People with weakened immune systems can have longer or more severe rotavirus illness. Babies with severe combined immunodeficiency (SCID) should not get the rotavirus vaccine.',
      actions: [
        'Call your care team early if you have diarrhea or vomiting',
        'Ask household members to wash hands carefully, especially after diaper changes',
        'Ask your clinician about vaccinating babies in your home; if they get the vaccine, wash hands well after diaper changes',
        'Tell your care team if diarrhea lasts more than a few days',
      ],
    },
  },
  treatment: {
    summary:
      'There is no medicine that treats rotavirus itself, and antibiotics do not help because it is a virus. Care focuses on preventing and treating dehydration until the illness passes, usually within about a week.',
    options: [
      {
        name: 'Oral rehydration solution',
        type: 'supportive',
        detail:
          'Store-bought oral rehydration solutions replace water, salts and sugar in the right balance. Give small sips often, especially if your child is vomiting. Keep breastfeeding or formula feeding.',
        who: 'Babies, children and adults with diarrhea or vomiting',
      },
      {
        name: 'IV (intravenous) fluids',
        type: 'supportive',
        detail:
          'Fluids given through a vein at a clinic, urgent care, emergency department or hospital when someone is too dehydrated or cannot keep fluids down.',
        who: 'People with moderate to severe dehydration',
      },
      {
        name: 'Anti-diarrhea medicine',
        type: 'other',
        detail:
          'Not recommended for babies and young children unless a clinician advises it. Adults should ask a pharmacist or clinician first.',
        who: 'Adults only, after checking with a clinician or pharmacist',
      },
    ],
    antibioticsHelp: 'no',
  },
  prevention: {
    vaccines: [
      {
        name: 'RotaTeq (RV5)',
        who: 'Babies, given as drops by mouth in 3 doses, usually at 2, 4 and 6 months of age.',
        notes:
          'The first dose must be given by 14 weeks 6 days of age, and all doses by 8 months of age. Not for babies with a history of intussusception or with SCID.',
      },
      {
        name: 'Rotarix (RV1)',
        who: 'Babies, given as drops by mouth in 2 doses, usually at 2 and 4 months of age.',
        notes:
          'Same age limits as RotaTeq. Both vaccines carry a small risk of intussusception (a bowel blockage), mostly in the week after the first or second dose. Federal vaccine schedules changed several times in 2025–2026; the American Academy of Pediatrics recommends rotavirus vaccine for all infants. Check the current schedule with your baby’s clinician.',
      },
    ],
    everyday: [
      'Get your baby vaccinated on time; the vaccine series must start by 14 weeks 6 days of age.',
      'Wash hands with soap and water after using the toilet or changing diapers and before eating or preparing food.',
      'Clean diaper-changing areas, toys and bathroom surfaces often, using a bleach-based cleaner or another disinfectant and following the label directions.',
      'Keep sick children home from child care while they have diarrhea or vomiting.',
      'Do not swim in pools, lakes or splash pads while you have diarrhea.',
    ],
  },
  testing:
    'Clinicians often diagnose stomach illness from symptoms alone. A stool test can confirm rotavirus, using either a rapid antigen test or a PCR test (a test that finds the virus’s genetic material), often as part of a multi-germ stomach panel such as BioFire. Testing is most useful for very sick babies and young children, during outbreaks, or for people with weak immune systems. A baby who recently got the rotavirus vaccine can test positive for a short time because of vaccine virus in the stool. There is no common home test.',
  whenToSeekCare: [
    'Call your child’s clinician if your baby has vomiting or diarrhea and is not feeding well, or if your child shows early signs of dehydration, such as fewer wet diapers or a dry mouth.',
    'Call if diarrhea lasts more than several days or keeps getting worse.',
    'Call early for babies, older adults and anyone with a weakened immune system.',
    'Call right away if a baby has hard crying, vomiting or blood in the stool in the week after a rotavirus vaccine.',
    'Go to urgent care or an emergency department for signs of serious dehydration, blood in the stool or severe belly pain. Call 911 if a child is very hard to wake.',
  ],
  readingTheNumbers:
    'Rotavirus numbers mostly come from stool testing, such as the share of BioFire stomach (gastrointestinal) panel tests that find rotavirus. Most of these tests are done for babies, young children and hospital patients with diarrhea, so the number reflects people sick enough to be tested, not everyone who is ill. Because many children are vaccinated, rotavirus detection is usually low for much of the year and may rise in late winter and spring; since vaccines, some years have bigger seasons than others. Recent vaccination can cause some positive results, so small changes may not mean more illness. A clear rise means more rotavirus is spreading, mostly among young children: check that your baby’s vaccines are up to date and step up handwashing.',
  watchNotes: [
    'Federal vaccine schedules changed several times in 2025–2026. The American Academy of Pediatrics recommends rotavirus vaccine for all infants. Talk with your baby’s clinician about the current schedule and timing.',
  ],
  sources: [],
  lastReviewed: '2026-10-07',
}

export default profile
