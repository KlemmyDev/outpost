/**
 * Australian guides: official first aid, emergency and health documents that
 * aren't in Kiwix's catalogue. Their publishers allow downloading for your own
 * use but not redistribution, so Outpost never ships copies: each server
 * fetches them straight from the publisher. PDFs are kept exactly as
 * published. Web pages keep their text but are restyled for the reader, with a
 * link back to the original.
 *
 * Shared between the server and the pages. No Node imports.
 */

export type GuideKind = 'pdf' | 'page'

export interface GuideSource {
  id: string
  title: string
  summary: string
  topic: GuideTopic
  publisher: string
  kind: GuideKind
  url: string
  /** Rough size, for the Sources screen before it's downloaded. */
  approxBytes: number
  /** For pages: the CSS selector holding the content. */
  selector?: string
  /** For PDFs whose address changes: the page that links to it, and how to spot the link. */
  discover?: { page: string; match: string }
}

export const GUIDE_TOPICS = ['First aid', 'Emergencies', 'Food and health'] as const
export type GuideTopic = (typeof GUIDE_TOPICS)[number]

/** The virtual book the guides appear as in the Library and reader. */
export const GUIDES_BOOK = 'au-guides'
export const GUIDES_TITLE = 'Australian guides'

const ANZCOR = 'ANZCOR (Australian Resuscitation Council)'
const ANZCOR_SELECTOR = '.c-guideline-item-page'

function anzcor(id: string, title: string, summary: string, path: string): GuideSource {
  return { id, title, summary, topic: 'First aid', publisher: ANZCOR, kind: 'page', url: `https://www.anzcor.org/home/${path}`, approxBytes: 60_000, selector: ANZCOR_SELECTOR }
}

function getReady(id: string, title: string, card: string): GuideSource {
  return {
    id,
    title,
    summary: 'Get Ready Queensland conversation card: what to talk about and do before it happens.',
    topic: 'Emergencies',
    publisher: 'Get Ready Queensland',
    kind: 'pdf',
    url: `https://www.getready.qld.gov.au/sites/default/files/2026-06/A5%20Conversation%20Cards_${card}.pdf`,
    approxBytes: 200_000,
    discover: { page: 'https://www.getready.qld.gov.au/get-ready', match: `Conversation%20Cards_${card}` },
  }
}

const EAT = 'https://www.eatforhealth.gov.au/sites/default/files/2022-09'
const NHMRC = 'NHMRC (Eat For Health)'
const nhmrcDiscover = (file: string) => ({ page: 'https://www.eatforhealth.gov.au/guidelines', match: file })

export const GUIDES: readonly GuideSource[] = [
  // First aid: the flowcharts, then ANZCOR's guidelines for bystanders.
  {
    id: 'anzcor-bls-flowchart',
    title: 'Basic life support (DRSABCD) flowchart',
    summary: 'The one-page CPR chart: danger, response, send for help, airway, breathing, CPR, defibrillation.',
    topic: 'First aid',
    publisher: ANZCOR,
    kind: 'pdf',
    url: 'https://www.anzcor.org/assets/Uploads/Basic-Life-Support-August-2023-1-v3.pdf',
    approxBytes: 2_950_000,
    discover: { page: 'https://www.anzcor.org/home/algorithms-and-flowcharts', match: 'Basic-Life-Support' },
  },
  {
    id: 'anzcor-choking-flowchart',
    title: 'Choking flowchart',
    summary: 'Back blows and chest thrusts for adults, children and infants.',
    topic: 'First aid',
    publisher: ANZCOR,
    kind: 'pdf',
    url: 'https://www.anzcor.org/assets/Uploads/Choking-August-2023-1-v3.pdf',
    approxBytes: 1_600_000,
    discover: { page: 'https://www.anzcor.org/home/algorithms-and-flowcharts', match: 'Choking' },
  },
  {
    id: 'anzcor-anaphylaxis-flowchart',
    title: 'Anaphylaxis flowchart',
    summary: 'Recognising a severe allergic reaction and using an adrenaline injector.',
    topic: 'First aid',
    publisher: ANZCOR,
    kind: 'pdf',
    url: 'https://www.anzcor.org/assets/ANZCOR-Guidelines-/2024-08-08_Anaphylaxis_Flowchart_CS.pdf',
    approxBytes: 5_700_000,
    discover: { page: 'https://www.anzcor.org/home/algorithms-and-flowcharts', match: 'Anaphylaxis_Flowchart' },
  },
  anzcor('anzcor-managing-emergency', 'Managing an emergency', 'Keeping yourself safe, calling 000 and what to do first.', 'basic-life-support/guideline-2-managing-an-emergency'),
  anzcor('anzcor-unconscious', 'The unconscious person', 'Recognising unconsciousness and the recovery position.', 'basic-life-support/guideline-3-recognition-and-first-aid-management-of-the-unconscious-person'),
  anzcor('anzcor-cpr', 'CPR', 'Cardiopulmonary resuscitation for adults, children and infants.', 'basic-life-support/guideline-8-cardiopulmonary-resuscitation-cpr'),
  anzcor('anzcor-bleeding', 'Bleeding', 'Direct pressure, wound packing and tourniquets.', 'first-aid/guideline-9-1-1-first-aid-for-management-of-bleeding'),
  anzcor('anzcor-burns', 'Burns', 'Cooling, covering and when to get help.', 'first-aid/guideline-9-1-3-first-aid-for-burns'),
  anzcor('anzcor-head-injury', 'Head injury', 'Concussion signs and what to watch for.', 'first-aid/guideline-9-1-4-head-injury'),
  anzcor('anzcor-spinal', 'Suspected spinal injury', 'Moving, or not moving, someone who may have hurt their spine.', 'first-aid/guideline-9-1-6-management-of-suspected-spinal-injury'),
  anzcor('anzcor-heart-attack', 'Heart attack', 'Warning signs and first aid, including aspirin.', 'first-aid/guideline-9-2-1-recognition-and-first-aid-management-of-suspected-heart-attack'),
  anzcor('anzcor-stroke', 'Stroke', 'Recognising a stroke fast.', 'first-aid/guideline-9-2-2-stroke'),
  anzcor('anzcor-shock', 'Shock and the seriously ill or injured', 'Recognising shock and keeping someone stable.', 'first-aid/guideline-9-2-3-shock-first-aid-management-of-the-seriously-ill-or-injured-person'),
  anzcor('anzcor-seizure', 'Seizures', 'Keeping someone safe during and after a seizure.', 'first-aid/9-2-4-first-aid-management-of-a-seizure'),
  anzcor('anzcor-asthma', 'Asthma', 'The 4 x 4 x 4 reliever method.', 'first-aid/guideline-9-2-5-first-aid-for-asthma'),
  anzcor('anzcor-anaphylaxis', 'Anaphylaxis', 'Severe allergic reactions and adrenaline.', 'first-aid/guideline-9-2-7-first-aid-management-of-anaphylaxis'),
  anzcor('anzcor-diabetic', 'Diabetic emergencies', 'Low and high blood sugar.', 'first-aid/guideline-9-2-9-first-aid-management-of-a-diabetic-emergency'),
  anzcor('anzcor-drowning', 'Drowning', 'Rescue and resuscitation after drowning.', 'first-aid/guideline-9-3-2-resuscitation-in-drowning'),
  anzcor('anzcor-hypothermia', 'Hypothermia and cold injuries', 'Warming someone safely, frostbite.', 'first-aid/guideline-9-3-3-first-aid-management-of-hypothermia-and-cold-related-injuries'),
  anzcor('anzcor-heat', 'Heat illness', 'Heat exhaustion and heat stroke, and cooling fast.', 'first-aid/guideline-9-3-4-heat-induced-illness-hyperthermia'),
  anzcor('anzcor-snake-bite', 'Snake bite', 'Australian snake bite: pressure bandage and keep still.', 'first-aid/guideline-9-4-1-first-aid-management-of-australian-snake-bite'),
  anzcor('anzcor-spider-bite', 'Spider bite', 'Funnel-web, redback and other spiders.', 'first-aid/guideline-9-4-2-first-aid-management-of-spider-bite'),
  anzcor('anzcor-ticks-stings', 'Ticks, bees, wasps and ants', 'Removing ticks and treating stings.', 'first-aid/guideline-9-4-3-envenomation-from-tick-bites-and-bee-wasp-and-ant-stings'),
  anzcor('anzcor-marine', 'Marine stings', 'Box jellyfish, Irukandji, bluebottles, stonefish and more.', 'first-aid/guideline-9-4-5-first-aid-management-of-marine-envenomation'),
  anzcor('anzcor-pressure-bandage', 'Pressure immobilisation technique', 'How to apply a pressure bandage and splint.', 'first-aid/guideline-9-4-8-envenomation-pressure-immobilisation-technique'),
  anzcor('anzcor-poisoning', 'Poisoning', 'Swallowed, inhaled and skin poisons. Poisons Information: 13 11 26.', 'first-aid/guideline-9-5-1-first-aid-management-of-poisoning'),
  anzcor('anzcor-opioid', 'Opioid overdose', 'Recognising an overdose and giving naloxone.', 'first-aid/guideline-9-5-2-first-aid-management-of-opioid-overdose'),

  // Emergencies
  {
    id: 'redcross-rediplan',
    title: 'Red Cross RediPlan',
    summary: 'A step-by-step household disaster plan: get informed, get connected, know your risks, pack a kit.',
    topic: 'Emergencies',
    publisher: 'Australian Red Cross',
    kind: 'pdf',
    url: 'https://www.redcross.org.au/globalassets/cms/documents/emergency-services/red-cross-rediplan-disaster-preparedness-guide.pdf',
    approxBytes: 2_750_000,
    discover: { page: 'https://www.redcross.org.au/prepare/', match: 'rediplan-disaster-preparedness-guide' },
  },
  {
    id: 'rfs-bush-fire-survival-plan',
    title: 'Bush Fire Survival Plan (NSW RFS)',
    summary: 'Discuss, prepare, know and keep: the NSW Rural Fire Service plan to fill in.',
    topic: 'Emergencies',
    publisher: 'NSW Rural Fire Service',
    kind: 'pdf',
    url: 'https://www.rfs.nsw.gov.au/__data/assets/pdf_file/0003/36597/BFSP-Complete.pdf',
    approxBytes: 4_750_000,
    discover: { page: 'https://www.rfs.nsw.gov.au/plan-and-prepare/bush-fire-survival-plan', match: 'BFSP-Complete' },
  },
  {
    id: 'cfa-leave-early',
    title: 'Bushfire plan: leave early (CFA)',
    summary: "Country Fire Authority Victoria's plan for leaving before a fire threatens.",
    topic: 'Emergencies',
    publisher: 'Country Fire Authority (Victoria)',
    kind: 'pdf',
    url: 'https://www.cfa.vic.gov.au/ArticleDocuments/336/CFA%20Bushfire%20Plan%20Leave%20Early%20(2022).pdf',
    approxBytes: 2_750_000,
    discover: { page: 'https://www.cfa.vic.gov.au/plan-prepare/your-bushfire-plan', match: 'Leave%20Early' },
  },
  getReady('getready-kit', 'Pack an emergency kit', 'Pack%20a%20Kit'),
  getReady('getready-bushfire', 'Bushfire', 'Bushfire'),
  getReady('getready-cyclone', 'Cyclone', 'Cyclone'),
  getReady('getready-flood', 'Flood', 'Flood'),
  getReady('getready-storm', 'Storm', 'Storm'),
  getReady('getready-heatwave', 'Heatwave', 'Heatwave'),

  // Food and health
  {
    id: 'nhmrc-dietary-guidelines',
    title: 'Australian Dietary Guidelines',
    summary: 'The full guidelines: the five food groups, how much to eat and why.',
    topic: 'Food and health',
    publisher: NHMRC,
    kind: 'pdf',
    url: `${EAT}/n55_australian_dietary_guidelines.pdf`,
    approxBytes: 1_960_000,
    discover: nhmrcDiscover('n55_australian_dietary_guidelines.pdf'),
  },
  {
    id: 'nhmrc-dietary-summary',
    title: 'Eat for Health: summary',
    summary: 'The dietary guidelines in brief, with serve sizes.',
    topic: 'Food and health',
    publisher: NHMRC,
    kind: 'pdf',
    url: `${EAT}/n55a_australian_dietary_guidelines_summary_131014_1.pdf`,
    approxBytes: 2_970_000,
    discover: nhmrcDiscover('n55a_australian_dietary_guidelines_summary'),
  },
  {
    id: 'nhmrc-adult-brochure',
    title: 'Healthy eating for adults',
    summary: 'Daily serves for adults by age, and what a serve looks like.',
    topic: 'Food and health',
    publisher: NHMRC,
    kind: 'pdf',
    url: `${EAT}/n55g_adult_brochure.pdf`,
    approxBytes: 2_520_000,
    discover: nhmrcDiscover('n55g_adult_brochure'),
  },
  {
    id: 'nhmrc-guide-poster',
    title: 'Australian Guide to Healthy Eating',
    summary: 'The plate poster of the five food groups.',
    topic: 'Food and health',
    publisher: NHMRC,
    kind: 'pdf',
    url: `${EAT}/n55j_australian_dietary_guidelines_poster.pdf`,
    approxBytes: 660_000,
    discover: nhmrcDiscover('n55j_australian_dietary_guidelines_poster'),
  },
  {
    id: 'nhmrc-infant-feeding',
    title: 'Infant feeding guidelines: summary',
    summary: 'Breastfeeding, formula and starting solids.',
    topic: 'Food and health',
    publisher: NHMRC,
    kind: 'pdf',
    url: `${EAT}/170131_n56_infant_feeding_guidelines_summary.pdf`,
    approxBytes: 855_000,
    discover: nhmrcDiscover('n56_infant_feeding_guidelines_summary'),
  },
  {
    id: 'nhmrc-pregnancy',
    title: 'Healthy eating during pregnancy',
    summary: 'What to eat, and what to avoid, while pregnant and breastfeeding.',
    topic: 'Food and health',
    publisher: NHMRC,
    kind: 'pdf',
    url: `${EAT}/n55h_healthy_eating_during_pregnancy_0_0.pdf`,
    approxBytes: 2_780_000,
    discover: nhmrcDiscover('n55h_healthy_eating_during_pregnancy'),
  },
]

export function guide(id: string): GuideSource | undefined {
  return GUIDES.find((g) => g.id === id)
}

/** Every host a guide may come from. Nothing else is fetched. */
export const GUIDE_HOSTS: ReadonlySet<string> = new Set(
  GUIDES.flatMap((g) => [new URL(g.url).hostname, ...(g.discover ? [new URL(g.discover.page).hostname] : [])]),
)

/** What a guide looks like on the Sources screen and shelf. */
export interface GuideState {
  id: string
  title: string
  summary: string
  topic: GuideTopic
  publisher: string
  kind: GuideKind
  url: string
  approxBytes: number
  /** Set once it's on this server. */
  bytes: number | null
  fetchedAt: number | null
  checkedAt: number | null
  error: string | null
  /** Waiting or being fetched right now. */
  busy: boolean
}

export interface GuidesData {
  guides: GuideState[]
  installed: number
  installedBytes: number
}
