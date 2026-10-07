// "What to do this week" — practical, conservative guidance keyed by the overall respiratory activity
// band × audience. Written for the general public (plain language, short imperative bullets).
//
// Basis (checked 2026-10-07; pending clinical review):
//   * CDC respiratory virus prevention guidance: core prevention (immunizations, hygiene, cleaner air,
//     treatment) for everyone; when sick, stay home until 24 hours fever-free without fever-reducing
//     medicine AND symptoms improving, then 5 days of added precautions (masks, distance, hygiene,
//     cleaner air, testing).
//   * MDH (January 2026 health advisory) aligned its immunization recommendations with medical
//     associations such as AAP, AAFP and ACOG. Annual flu vaccine for everyone 6 months and older
//     (CDC, AAP, AAFP). 2026–27 COVID-19 vaccines are FDA-approved for everyone 65+ and for younger
//     people with a higher-risk condition; AAFP recommends them for all adults, AAP for children
//     6–23 months and higher-risk children, ACOG in pregnancy.
//   * Flu antivirals work best started within 48 hours of symptoms; higher-risk people should seek
//     care early (CDC recommends treatment for them even after 48 hours). COVID-19 antiviral pills
//     must start within 5 days of symptoms for eligible people.
//   * RSV infant protection: maternal RSV vaccine (32–36 weeks, September–January) OR an infant RSV
//     antibody (nirsevimab / clesrovimab); RSV vaccine for adults 75+ and 50–74 at increased risk.
//   * Masks in crowded indoor spaces for higher-risk people (and those around them) when activity is up.
//   * Children with asthma: daily controller medicine and an asthma action plan (CDC EV-D68 guidance); the
//     yearly fall rhinovirus/enterovirus rise after school starts is a common asthma trigger.
// Band summaries stay generic ("respiratory viruses are spreading…"): the band follows the statewide level,
// and the panel links the currently notable illnesses separately, so no step names which virus is driving
// activity (that would go stale between data updates).
// Everything here is educational, not medical advice.
import type { ActivityLevel, AgeGroupId, PathogenId } from '../../shared/types'
import type { SourceLink } from './types'

/** Overall activity band the guidance is keyed by. */
export type LevelBand = 'low' | 'elevated' | 'high'

export interface GuidanceAction {
  /** Short imperative step (one sentence). */
  text: string
  /** Optional one-line "why" shown on demand. */
  why?: string
  /** Pathogen pages this step relates to. */
  pathogens?: PathogenId[]
}

export interface ActionSection {
  band: LevelBand
  audience: AgeGroupId
  /** One-sentence framing for this band and audience. */
  summary: string
  /** Most important first. */
  actions: GuidanceAction[]
  sources: SourceLink[]
  /** ISO date the content was last checked against sources. */
  lastReviewed: string
}

export const ACTIONS_LAST_REVIEWED = '2026-10-07'

/** minimal|low → low; moderate → elevated; high|very-high → high. Unknown falls back to everyday basics. */
export function bandForLevel(level: ActivityLevel): LevelBand {
  if (level === 'moderate') return 'elevated'
  if (level === 'high' || level === 'very-high') return 'high'
  return 'low'
}

export const BAND_LABEL: Record<LevelBand, string> = {
  low: 'Everyday protection',
  elevated: 'Extra care',
  high: 'Take precautions now',
}

// ───────────────────────────── sources ─────────────────────────────

const SRC = {
  cdcGuidance: { label: 'CDC — Preventing respiratory illnesses', url: 'https://www.cdc.gov/respiratory-viruses/prevention/index.html' },
  cdcWhenSick: {
    label: 'CDC — Preventing spread of respiratory viruses when you’re sick',
    url: 'https://www.cdc.gov/respiratory-viruses/prevention/precautions-when-sick.html',
  },
  cdcMasks: { label: 'CDC — Masks and respiratory virus prevention', url: 'https://www.cdc.gov/respiratory-viruses/prevention/masks.html' },
  cdcTesting: { label: 'CDC — Testing and respiratory viruses', url: 'https://www.cdc.gov/respiratory-viruses/prevention/testing.html' },
  cdcFluVaccine: { label: 'CDC — Seasonal flu vaccine basics', url: 'https://www.cdc.gov/flu/vaccines/index.html' },
  cdcFluTreatment: { label: 'CDC — Treatment of flu', url: 'https://www.cdc.gov/flu/treatment/index.html' },
  cdcCovidTreatment: { label: 'CDC — Types of COVID-19 treatment', url: 'https://www.cdc.gov/covid/treatment/index.html' },
  cdcRsvInfants: { label: 'CDC — RSV in infants and young children', url: 'https://www.cdc.gov/rsv/infants-young-children/index.html' },
  cdcRsvOlder: { label: 'CDC — RSV vaccines for adults', url: 'https://www.cdc.gov/rsv/vaccines/adults.html' },
  cdcHands: { label: 'CDC — About handwashing', url: 'https://www.cdc.gov/clean-hands/about/index.html' },
  cdcEvd68: { label: 'CDC — About enterovirus D68 (asthma and fall respiratory illness)', url: 'https://www.cdc.gov/non-polio-enterovirus/about/about-enterovirus-d68.html' },
  mdhFlu: { label: 'MDH — Influenza situation update', url: 'https://www.health.state.mn.us/diseases/flu/stats/index.html' },
  mdhImmunize: {
    label: 'MDH health advisory (Jan. 2026) — MDH aligns with medical association immunization recommendations',
    url: 'https://www2cdn.web.health.state.mn.us/communities/ep/han/2026/jan7imz.pdf',
  },
  mdhResp: { label: 'MDH — Viral respiratory illness in Minnesota', url: 'https://www.health.state.mn.us/diseases/respiratory/stats/index.html' },
  aapFlu: {
    label: 'HealthyChildren.org (AAP) — Flu prevention and treatment, 2026–27',
    url: 'https://www.healthychildren.org/English/news/Pages/aap-(influenza)-flu-prevention-recommendations-for-2026-27.aspx',
  },
  aapRsv: { label: 'American Academy of Pediatrics — RSV resources', url: 'https://www.aap.org/rsv' },
  aafpVaccines: {
    label: 'AAFP — 2026–2027 influenza, RSV and COVID-19 vaccine guidance (PDF)',
    url: 'https://www.aafp.org/assets/image/upload/v1788277985/pdf_2026_through_2027_influenza_rsv_sars_covid_2_guidance.pdf',
  },
  acogPregnancy: {
    label: 'Contemporary OB/GYN (Sept. 2026) — ACOG 2026–27 respiratory virus immunization recommendations in pregnancy',
    url: 'https://www.contemporaryobgyn.net/view/acog-2026-27-respiratory-virus-immunization-recommendations-pregnancy',
  },
  idsaImmuno: {
    label: 'Guideline Central — IDSA 2026 guideline on seasonal vaccines for immunocompromised patients (summary)',
    url: 'https://www.guidelinecentral.com/insights/sep-2026-idsa-seasonalvaccinesimmunocompromisedpatients-guideline-spotlight/',
  },
} satisfies Record<string, SourceLink>

// ───────────────────────────── shared steps ─────────────────────────────

const RESP: PathogenId[] = ['influenza', 'covid', 'rsv']

const A = {
  fluShot: {
    text: 'Get this season’s flu vaccine. It’s recommended every year for everyone 6 months and older.',
    why: 'Protection builds over about 2 weeks, so getting it before flu climbs gives the most benefit.',
    pathogens: ['influenza'],
  },
  covidAsk: {
    text: 'Ask a pharmacist or clinician whether the 2026–27 COVID-19 vaccine is right for you.',
    why: 'It matters most for people 65 and older and anyone with a health condition that raises their risk.',
    pathogens: ['covid'],
  },
  stayHome: {
    text: 'If you get sick, stay home until you’ve had no fever for 24 hours (without fever medicine) and feel better overall.',
    why: 'Then take extra care for 5 more days: wear a mask around others, keep some distance, wash hands and test if you can.',
    pathogens: RESP,
  },
  hands: {
    text: 'Wash hands with soap and water for 20 seconds, especially before eating and after the bathroom.',
    why: 'Hand sanitizer helps with many germs but does not work well against norovirus (stomach flu).',
    pathogens: ['norovirus'],
  },
  coverAir: {
    text: 'Cover coughs and sneezes, and bring in fresh air when people gather indoors.',
    why: 'Opening a window, running the HVAC fan with a good filter, or using a portable HEPA cleaner lowers the amount of virus in the air.',
  },
  test: {
    text: 'If you have symptoms, test for COVID-19. Some home tests check for flu too.',
    why: 'Knowing which virus you have tells you whether early treatment could help and how careful to be around others.',
    pathogens: ['covid', 'influenza'],
  },
  skipVisits: {
    text: 'If you’re sick, postpone visits with newborns, older relatives, pregnant people or anyone with a weak immune system.',
    pathogens: RESP,
  },
  antiviralPlan: {
    text: 'If you’re at higher risk, know how you’d reach a clinician quickly (including telehealth) if you get sick.',
    why: 'Flu antivirals work best within 2 days of symptoms; COVID-19 antiviral pills must start within 5 days.',
    pathogens: ['influenza', 'covid'],
  },
  actEarly: {
    text: 'At higher risk and feeling sick? Contact a clinician the same day. Don’t wait to see if it gets worse.',
    why: 'Flu antivirals work best within 2 days of symptoms; COVID-19 antiviral pills must start within 5 days.',
    pathogens: ['influenza', 'covid'],
  },
  maskHighRisk: {
    text: 'If you or people you live with are at higher risk, consider a well-fitting mask (N95 or KN95) in crowded indoor places.',
    pathogens: RESP,
  },
  maskCrowded: {
    text: 'Wear a well-fitting mask (N95 or KN95) in crowded indoor places like stores, clinics and public transit.',
    pathogens: RESP,
  },
  rsvOlder: {
    text: 'If you’re 75 or older, or 50–74 with a heart, lung or other long-term condition, ask about a one-time RSV vaccine.',
    why: 'It’s a single dose, not a yearly shot. If you already had one, you don’t need another at this time.',
    pathogens: ['rsv'],
  },
} satisfies Record<string, GuidanceAction>

// ───────────────────────────── sections ─────────────────────────────

type Draft = Omit<ActionSection, 'band' | 'audience' | 'lastReviewed'>

const LOW: Record<AgeGroupId, Draft> = {
  all: {
    summary: 'Activity is low. This is the best time to get protected before respiratory viruses rise.',
    actions: [A.fluShot, A.covidAsk, A.hands, A.stayHome, A.coverAir],
    sources: [SRC.cdcGuidance, SRC.cdcWhenSick, SRC.cdcFluVaccine, SRC.mdhImmunize, SRC.cdcHands],
  },
  infants: {
    summary: 'Activity is low. Set up your baby’s protection now, before RSV and flu season.',
    actions: [
      {
        text: 'Ask about an RSV antibody shot (nirsevimab or clesrovimab) for babies under 8 months, unless the mother got the RSV vaccine at least 2 weeks before birth.',
        why: 'One dose protects your baby through their first RSV season. Babies born October through March usually get it in their first week.',
        pathogens: ['rsv'],
      },
      {
        text: 'Make sure everyone who lives with or cares for your baby gets a flu vaccine.',
        why: 'Babies can get their own flu vaccine starting at 6 months: 2 doses, 4 weeks apart, the first time.',
        pathogens: ['influenza'],
      },
      {
        text: 'Ask your baby’s clinician about the COVID-19 vaccine starting at 6 months.',
        why: 'The American Academy of Pediatrics recommends it for children 6 to 23 months.',
        pathogens: ['covid'],
      },
      { text: 'Wash hands before feeding or holding your baby, and keep people with cold symptoms away.', pathogens: RESP },
      {
        text: 'Call your clinician right away for a fever of 100.4°F (38°C) or higher in a baby under 3 months.',
      },
    ],
    sources: [SRC.cdcRsvInfants, SRC.aapRsv, SRC.cdcFluVaccine, SRC.aapFlu, SRC.mdhImmunize, SRC.cdcGuidance],
  },
  children: {
    summary: 'Activity is low. Fall is the time to get kids vaccinated before school-season germs pick up.',
    actions: [
      {
        text: 'Get your child a flu vaccine this fall. Children under 9 who have not had at least 2 flu vaccine doses before need 2 doses, 4 weeks apart.',
        pathogens: ['influenza'],
      },
      {
        text: 'Ask your child’s clinician about the COVID-19 vaccine, especially for kids under 2 or with health conditions.',
        pathogens: ['covid'],
      },
      {
        text: 'If your child has asthma, keep giving their daily controller medicine and keep an up-to-date asthma action plan at home and at school.',
        why: 'Colds spread quickly after school starts each fall and are a common trigger of asthma attacks.',
        pathogens: ['rhino-entero'],
      },
      { ...A.hands, text: 'Teach hand-washing with soap and water for 20 seconds, especially before eating and after the bathroom.' },
      {
        text: 'Keep sick kids home from school or child care until they’ve had no fever for 24 hours without fever medicine and feel better.',
        pathogens: RESP,
      },
    ],
    sources: [SRC.aapFlu, SRC.cdcFluVaccine, SRC.mdhImmunize, SRC.cdcWhenSick, SRC.cdcHands, SRC.cdcEvd68],
  },
  adults: {
    summary: 'Activity is low. A few minutes now — a flu shot and good habits — protect you and people around you.',
    actions: [A.fluShot, A.covidAsk, A.hands, A.stayHome, A.coverAir],
    sources: [SRC.cdcGuidance, SRC.cdcWhenSick, SRC.cdcFluVaccine, SRC.aafpVaccines, SRC.mdhImmunize, SRC.cdcHands],
  },
  'older-adults': {
    summary: 'Activity is low. Good time to catch up on vaccines before winter.',
    actions: [
      A.fluShot,
      A.rsvOlder,
      { ...A.covidAsk, text: 'Ask whether you’re due for COVID-19 or pneumococcal (pneumonia) vaccines.' },
      A.antiviralPlan,
      A.hands,
    ],
    sources: [SRC.cdcFluVaccine, SRC.cdcRsvOlder, SRC.aafpVaccines, SRC.mdhImmunize, SRC.cdcFluTreatment, SRC.cdcCovidTreatment],
  },
  seniors: {
    summary: 'Activity is low. Get your fall vaccines now and have a plan for getting treatment fast if you get sick.',
    actions: [
      {
        text: 'Get a flu vaccine made for older adults, such as high-dose, adjuvanted or recombinant. If none is available, any flu vaccine is better than none.',
        pathogens: ['influenza'],
      },
      {
        text: 'Ask about the 2026–27 COVID-19 vaccine. It’s approved for everyone 65 and older.',
        pathogens: ['covid'],
      },
      { ...A.rsvOlder, text: 'If you’re 75 or older, or 65–74 with a long-term health condition, ask about a one-time RSV vaccine.' },
      { ...A.antiviralPlan, text: 'Know how you’d reach a clinician quickly (including telehealth) if you get sick.' },
      A.hands,
    ],
    sources: [SRC.cdcFluVaccine, SRC.cdcRsvOlder, SRC.aafpVaccines, SRC.mdhImmunize, SRC.cdcFluTreatment, SRC.cdcCovidTreatment],
  },
  pregnant: {
    summary: 'Activity is low. Vaccines during pregnancy protect you and pass protection to your baby.',
    actions: [
      { text: 'Get a flu shot. It’s safe in any trimester and helps protect your baby for months after birth.', pathogens: ['influenza'] },
      {
        text: 'At 32–36 weeks between September and January, ask about the RSV vaccine. Otherwise plan an RSV antibody shot for your baby.',
        why: 'Most babies need one or the other, not both.',
        pathogens: ['rsv'],
      },
      {
        text: 'Ask about the COVID-19 vaccine. ACOG recommends it during pregnancy.',
        pathogens: ['covid'],
      },
      { text: 'Get a Tdap (whooping cough) shot at 27–36 weeks of every pregnancy.', pathogens: ['pertussis'] },
      A.hands,
    ],
    sources: [SRC.cdcFluVaccine, SRC.cdcRsvInfants, SRC.acogPregnancy, SRC.mdhImmunize, SRC.cdcGuidance],
  },
  immunocompromised: {
    summary: 'Activity is low. Use this window to update vaccines and make a fast-treatment plan with your care team.',
    actions: [
      {
        text: 'Get a flu shot (not the nasal spray, which contains a weakened live virus).',
        pathogens: ['influenza'],
      },
      {
        text: 'Ask your care team about COVID-19 vaccine timing. Some people need extra doses.',
        pathogens: ['covid'],
      },
      {
        text: 'Make a plan with your care team to start flu or COVID-19 antivirals quickly if you get sick.',
        why: 'Flu antivirals work best within 2 days of symptoms; COVID-19 antiviral pills must start within 5 days.',
        pathogens: ['influenza', 'covid'],
      },
      { text: 'Ask the people you live with to get their flu and COVID-19 vaccines too.', pathogens: ['influenza', 'covid'] },
      A.hands,
    ],
    sources: [SRC.idsaImmuno, SRC.cdcFluVaccine, SRC.cdcFluTreatment, SRC.cdcCovidTreatment, SRC.mdhImmunize, SRC.cdcGuidance],
  },
}

const ELEVATED: Record<AgeGroupId, Draft> = {
  all: {
    summary: 'Respiratory viruses are spreading at moderate levels. Add a few extra steps, especially if you’re at higher risk.',
    actions: [A.fluShot, A.stayHome, A.test, A.antiviralPlan, A.maskHighRisk, A.hands],
    sources: [SRC.cdcGuidance, SRC.cdcWhenSick, SRC.cdcTesting, SRC.cdcMasks, SRC.cdcFluTreatment, SRC.cdcCovidTreatment, SRC.mdhResp],
  },
  infants: {
    summary: 'Viruses are spreading at moderate levels. Babies, especially under 6 months, are among the most likely to get very sick.',
    actions: [
      {
        text: 'If your baby hasn’t had RSV protection, ask about the RSV antibody shot now (nirsevimab or clesrovimab).',
        pathogens: ['rsv'],
      },
      { text: 'Ask visitors with any cold symptoms to wait, and have everyone wash hands before holding your baby.', pathogens: RESP },
      {
        text: 'Make sure everyone around your baby has had a flu vaccine (babies can get their own from 6 months).',
        pathogens: ['influenza'],
      },
      {
        text: 'Call the same day if your baby has flu symptoms. Antiviral medicine is recommended for children under 2 with flu.',
        pathogens: ['influenza'],
      },
      { text: 'Call right away for a fever of 100.4°F (38°C) or higher in a baby under 3 months.' },
    ],
    sources: [SRC.cdcRsvInfants, SRC.aapRsv, SRC.aapFlu, SRC.cdcFluTreatment, SRC.cdcGuidance],
  },
  children: {
    summary: 'Viruses are spreading at moderate levels in Minnesota. A few habits keep kids in school and out of the clinic.',
    actions: [
      { text: 'If your child hasn’t had a flu vaccine yet this season, get one now.', pathogens: ['influenza'] },
      {
        text: 'Keep sick kids home until they’ve had no fever for 24 hours without fever medicine and feel better.',
        pathogens: RESP,
      },
      {
        text: 'If your child is under 5 or has asthma or another long-term condition, call early for flu symptoms.',
        why: 'Flu antivirals work best when started within 2 days of symptoms.',
        pathogens: ['influenza'],
      },
      A.test,
      { text: 'Never give aspirin to children or teens with a flu-like illness. It can cause Reye’s syndrome.', pathogens: ['influenza'] },
    ],
    sources: [SRC.aapFlu, SRC.cdcFluTreatment, SRC.cdcWhenSick, SRC.cdcTesting, SRC.mdhFlu],
  },
  adults: {
    summary: 'Viruses are spreading at moderate levels. Protect yourself and avoid passing illness to people at higher risk.',
    actions: [A.fluShot, A.stayHome, A.test, A.skipVisits, A.hands],
    sources: [SRC.cdcGuidance, SRC.cdcWhenSick, SRC.cdcTesting, SRC.cdcFluVaccine, SRC.mdhResp],
  },
  'older-adults': {
    summary: 'Viruses are spreading at moderate levels. If you have a long-term health condition, be ready to act early.',
    actions: [
      { ...A.fluShot, text: 'If you haven’t had a flu vaccine this season, get one now.' },
      A.test,
      {
        text: 'Have a heart, lung or other long-term condition? Call a clinician the same day if flu or COVID-19 symptoms start.',
        why: 'Flu antivirals work best within 2 days of symptoms; COVID-19 antiviral pills must start within 5 days.',
        pathogens: ['influenza', 'covid'],
      },
      A.maskHighRisk,
      A.hands,
    ],
    sources: [SRC.cdcFluTreatment, SRC.cdcCovidTreatment, SRC.cdcTesting, SRC.cdcMasks, SRC.cdcGuidance, SRC.mdhResp],
  },
  seniors: {
    summary: 'Viruses are spreading at moderate levels. People 65 and older benefit most from fast testing and early treatment.',
    actions: [
      {
        text: 'Test as soon as symptoms start, and call a clinician the same day if you might have flu or COVID-19.',
        why: 'Antivirals are recommended for everyone 65+ with flu and work best within 2 days; COVID-19 pills must start within 5 days.',
        pathogens: ['influenza', 'covid'],
      },
      { text: 'If you haven’t had this season’s flu and COVID-19 vaccines, get them now.', pathogens: ['influenza', 'covid'] },
      { ...A.maskCrowded, text: 'Consider a well-fitting mask (N95 or KN95) in crowded indoor places.' },
      { text: 'Ask visitors to stay away if they’re sick.', pathogens: RESP },
      A.hands,
    ],
    sources: [SRC.cdcFluTreatment, SRC.cdcCovidTreatment, SRC.cdcTesting, SRC.cdcMasks, SRC.cdcFluVaccine, SRC.cdcGuidance],
  },
  pregnant: {
    summary: 'Viruses are spreading at moderate levels. Pregnancy raises the risk of severe flu and COVID-19, so act early.',
    actions: [
      { text: 'If you haven’t had a flu shot this season, get one now.', pathogens: ['influenza'] },
      {
        text: 'Call your clinician right away for flu symptoms during pregnancy or in the 2 weeks after delivery.',
        why: 'Flu antivirals are recommended during pregnancy and work best within 2 days of symptoms.',
        pathogens: ['influenza'],
      },
      A.test,
      {
        text: 'At 32–36 weeks, ask about the RSV vaccine, or plan an RSV antibody shot for your baby.',
        pathogens: ['rsv'],
      },
      A.hands,
    ],
    sources: [SRC.cdcFluTreatment, SRC.cdcRsvInfants, SRC.cdcTesting, SRC.cdcFluVaccine, SRC.cdcGuidance],
  },
  immunocompromised: {
    summary: 'Viruses are spreading at moderate levels. Extra layers of protection make sense for you now.',
    actions: [
      { text: 'Wear a well-fitting mask (N95 or KN95) in crowded indoor places.', pathogens: RESP },
      {
        text: 'Test at the first sign of illness and contact your care team the same day.',
        why: 'Flu antivirals work best within 2 days of symptoms; COVID-19 antiviral pills must start within 5 days.',
        pathogens: ['influenza', 'covid'],
      },
      { text: 'If you haven’t had this season’s flu and COVID-19 vaccines, ask your care team now.', pathogens: ['influenza', 'covid'] },
      { text: 'Choose well-ventilated or outdoor places to gather when you can.' },
      A.hands,
    ],
    sources: [SRC.idsaImmuno, SRC.cdcMasks, SRC.cdcTesting, SRC.cdcFluTreatment, SRC.cdcCovidTreatment, SRC.cdcGuidance],
  },
}

const HIGH: Record<AgeGroupId, Draft> = {
  all: {
    summary: 'Respiratory viruses are spreading widely. Take precautions now, and act fast if you or someone you care for gets sick.',
    actions: [A.stayHome, A.actEarly, A.maskHighRisk, A.test, A.skipVisits, A.fluShot],
    sources: [SRC.cdcGuidance, SRC.cdcWhenSick, SRC.cdcMasks, SRC.cdcTesting, SRC.cdcFluTreatment, SRC.cdcCovidTreatment, SRC.mdhResp],
  },
  infants: {
    summary: 'Viruses are spreading widely. Limit your baby’s exposure and know the warning signs.',
    actions: [
      { text: 'Avoid crowded indoor places with young babies when you can, and keep sick people away.', pathogens: RESP },
      {
        text: 'Watch for fast or hard breathing, poor feeding or fewer wet diapers, and call right away if you see them.',
        why: 'Call 911 for blue or gray lips or skin, or pauses in breathing.',
        pathogens: ['rsv', 'influenza'],
      },
      { text: 'Call right away for a fever of 100.4°F (38°C) or higher in a baby under 3 months.' },
      {
        text: 'Call the same day if your baby has flu symptoms. Antiviral medicine is recommended for children under 2 with flu.',
        pathogens: ['influenza'],
      },
      {
        text: 'If your baby hasn’t had RSV protection this season, ask about the antibody shot now.',
        pathogens: ['rsv'],
      },
    ],
    sources: [SRC.cdcRsvInfants, SRC.aapRsv, SRC.aapFlu, SRC.cdcFluTreatment, SRC.cdcGuidance],
  },
  children: {
    summary: 'Viruses are spreading widely. Keep sick kids home and call early if your child is at higher risk.',
    actions: [
      {
        text: 'Keep sick kids home until they’ve had no fever for 24 hours without fever medicine and feel better.',
        pathogens: RESP,
      },
      {
        text: 'If your child is under 5 or has asthma or another long-term condition, call the same day for flu symptoms.',
        why: 'Flu antivirals work best when started within 2 days of symptoms.',
        pathogens: ['influenza'],
      },
      {
        text: 'Get care right away for fast or hard breathing, ribs pulling in, signs of dehydration, or a child who is hard to wake.',
      },
      { text: 'Never give aspirin to children or teens with a flu-like illness. It can cause Reye’s syndrome.', pathogens: ['influenza'] },
      { text: 'It’s not too late for a flu vaccine if your child hasn’t had one.', pathogens: ['influenza'] },
    ],
    sources: [SRC.aapFlu, SRC.cdcFluTreatment, SRC.cdcWhenSick, SRC.mdhFlu, SRC.cdcGuidance],
  },
  adults: {
    summary: 'Viruses are spreading widely. Help slow the spread, especially to people at higher risk.',
    actions: [
      A.stayHome,
      A.test,
      A.skipVisits,
      { ...A.maskHighRisk, text: 'If you live with or care for someone at higher risk, consider a well-fitting mask in crowded indoor places.' },
      {
        text: 'Pregnant, or have asthma, diabetes or another long-term condition? Call a clinician early if you get sick.',
        why: 'Flu antivirals work best within 2 days of symptoms; COVID-19 antiviral pills must start within 5 days.',
        pathogens: ['influenza', 'covid'],
      },
      { ...A.fluShot, text: 'It’s not too late for a flu vaccine if you haven’t had one this season.' },
    ],
    sources: [SRC.cdcGuidance, SRC.cdcWhenSick, SRC.cdcTesting, SRC.cdcMasks, SRC.cdcFluTreatment, SRC.mdhResp],
  },
  'older-adults': {
    summary: 'Viruses are spreading widely. If you have a long-term condition, take extra precautions and act early.',
    actions: [
      {
        text: 'Have a heart, lung or other long-term condition? Call a clinician the same day if symptoms start.',
        why: 'Flu antivirals work best within 2 days of symptoms; COVID-19 antiviral pills must start within 5 days.',
        pathogens: ['influenza', 'covid'],
      },
      A.test,
      A.maskHighRisk,
      A.stayHome,
      { ...A.fluShot, text: 'It’s not too late for a flu vaccine if you haven’t had one this season.' },
    ],
    sources: [SRC.cdcFluTreatment, SRC.cdcCovidTreatment, SRC.cdcTesting, SRC.cdcMasks, SRC.cdcWhenSick, SRC.mdhResp],
  },
  seniors: {
    summary: 'Viruses are spreading widely. People 65 and older are most likely to be hospitalized, so take precautions and act fast.',
    actions: [
      {
        text: 'Test as soon as symptoms start, and call a clinician the same day.',
        why: 'Antivirals are recommended for everyone 65+ with flu and work best within 2 days; COVID-19 pills must start within 5 days.',
        pathogens: ['influenza', 'covid'],
      },
      { ...A.maskCrowded, text: 'Wear a well-fitting mask (N95 or KN95) in crowded indoor places, or choose less crowded times.' },
      { text: 'Ask visitors to stay away if they’re sick, and gather in well-ventilated spaces.', pathogens: RESP },
      {
        text: 'Get emergency care for trouble breathing, chest pain or pressure, new confusion, or being hard to wake.',
      },
      { text: 'It’s not too late for flu and COVID-19 vaccines if you haven’t had them this season.', pathogens: ['influenza', 'covid'] },
    ],
    sources: [SRC.cdcFluTreatment, SRC.cdcCovidTreatment, SRC.cdcTesting, SRC.cdcMasks, SRC.cdcGuidance, SRC.mdhResp],
  },
  pregnant: {
    summary: 'Viruses are spreading widely. Take precautions and call your clinician early if you get sick.',
    actions: [
      {
        text: 'Call your clinician right away for flu or COVID-19 symptoms during pregnancy or in the 2 weeks after delivery.',
        why: 'Flu antivirals are recommended during pregnancy and work best within 2 days of symptoms.',
        pathogens: ['influenza', 'covid'],
      },
      { text: 'Consider a well-fitting mask (N95 or KN95) in crowded indoor places.', pathogens: RESP },
      { text: 'Avoid close contact with people who are sick.', pathogens: RESP },
      { text: 'Get emergency care for trouble breathing, chest pain, or a high fever that doesn’t come down.' },
      { text: 'It’s not too late for a flu shot if you haven’t had one this season.', pathogens: ['influenza'] },
    ],
    sources: [SRC.cdcFluTreatment, SRC.cdcCovidTreatment, SRC.cdcMasks, SRC.cdcFluVaccine, SRC.cdcGuidance],
  },
  immunocompromised: {
    summary: 'Viruses are spreading widely. Use every layer of protection and treat illness early.',
    actions: [
      { text: 'Wear a well-fitting mask (N95 or KN95) indoors around others, and avoid crowded places when you can.', pathogens: RESP },
      {
        text: 'Test at the first sign of illness and contact your care team the same day.',
        why: 'Flu antivirals work best within 2 days of symptoms; COVID-19 antiviral pills must start within 5 days.',
        pathogens: ['influenza', 'covid'],
      },
      { text: 'Ask anyone in your home who gets sick to test, mask and keep their distance from you.', pathogens: RESP },
      { text: 'Bring in fresh air or use a portable HEPA air cleaner at home when others are sick.' },
      { text: 'If you haven’t had this season’s flu and COVID-19 vaccines, ask your care team now.', pathogens: ['influenza', 'covid'] },
    ],
    sources: [SRC.idsaImmuno, SRC.cdcMasks, SRC.cdcTesting, SRC.cdcFluTreatment, SRC.cdcCovidTreatment, SRC.cdcGuidance],
  },
}

function build(band: LevelBand, drafts: Record<AgeGroupId, Draft>): Record<AgeGroupId, ActionSection> {
  const out = {} as Record<AgeGroupId, ActionSection>
  for (const [audience, d] of Object.entries(drafts) as [AgeGroupId, Draft][]) {
    out[audience] = { band, audience, ...d, lastReviewed: ACTIONS_LAST_REVIEWED }
  }
  return out
}

export const ACTIONS: Record<LevelBand, Record<AgeGroupId, ActionSection>> = {
  low: build('low', LOW),
  elevated: build('elevated', ELEVATED),
  high: build('high', HIGH),
}

/** Guidance for an activity level and audience (falls back to "everyone"). */
export function getActions(level: ActivityLevel, audience: AgeGroupId): ActionSection {
  const band = bandForLevel(level)
  return ACTIONS[band][audience] ?? ACTIONS[band].all
}

/** Emergency warning signs shown with every guidance panel (CDC flu/RSV/COVID warning signs). */
export const EMERGENCY_SIGNS: { text: string; source: SourceLink } = {
  text: 'Call 911 or go to an emergency department for trouble breathing, chest pain or pressure, new confusion, being hard to wake, bluish lips or face, or a seizure. In babies, also watch for pauses in breathing or very few wet diapers.',
  source: { label: 'CDC — Flu signs and symptoms', url: 'https://www.cdc.gov/flu/signs-symptoms/index.html' },
}

/** Unique pathogen ids referenced by a section's actions, in first-mention order. */
export function sectionPathogens(section: ActionSection): PathogenId[] {
  const seen = new Set<PathogenId>()
  for (const a of section.actions) for (const p of a.pathogens ?? []) seen.add(p)
  return [...seen]
}
