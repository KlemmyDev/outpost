/**
 * The Library's hub: everything on the shelves brought together by subject,
 * so reading starts from "water" or "food" rather than from a book.
 *
 * Shared between the server and the pages. No Node imports.
 */

/** A page from any book, ready for a card: its picture and first lines. */
export interface Preview {
  contentId: string
  bookTitle: string
  path: string
  title: string
  excerpt: string
  /** Through Outpost's raw proxy, or null when the page has no picture worth showing. */
  image: string | null
  /** A PDF, opened as published. */
  pdf?: boolean
}

export interface Topic {
  id: string
  title: string
  blurb: string
  /** One emoji-free glyph drawn by the page; keeps the tiles light. */
  icon: TopicIcon
  /** What's looked up across every book for the topic's reading list. */
  queries: string[]
  /** Collections that are about this, by name or title. */
  books: RegExp
  /** What to get when nothing on the shelves covers it yet. */
  suggest: string
}

export type TopicIcon = 'cross' | 'pot' | 'drop' | 'flame' | 'bolt' | 'leaf' | 'alert' | 'book'

export const TOPICS: readonly Topic[] = [
  {
    id: 'health',
    title: 'Health and first aid',
    blurb: 'Injuries, illness and medicines, for when the doctor is a long way off.',
    icon: 'cross',
    queries: ['first aid', 'snake bite', 'burns', 'dehydration', 'fever', 'wound infection', 'asthma', 'fracture'],
    books: /med|health|first.?aid|wikem|anzcor|au-guides|nhs/i,
    suggest: 'WikiMed (the medical encyclopedia) and the Australian guides',
  },
  {
    id: 'food',
    title: 'Food and cooking',
    blurb: 'Recipes from the pantry, preserving, and cooking without the usual kitchen.',
    icon: 'pot',
    queries: ['bread', 'preserving', 'rice', 'soup', 'lentils', 'pickling', 'fermentation', 'pancakes'],
    books: /cook|food|recipe|cuisine|nutrition|grimgrains|eat/i,
    suggest: 'a cookbook from the Cooking picks',
  },
  {
    id: 'water',
    title: 'Water',
    blurb: 'Finding it, storing it and making it safe to drink.',
    icon: 'drop',
    queries: ['water purification', 'drinking water', 'rainwater tank', 'water filter', 'boiling water', 'water storage'],
    books: /water/i,
    suggest: 'Wikipedia or the Be prepared picks',
  },
  {
    id: 'shelter',
    title: 'Shelter and warmth',
    blurb: 'Staying warm, cool and dry, and handling fire safely.',
    icon: 'flame',
    queries: ['shelter', 'campfire', 'hypothermia', 'heat stroke', 'insulation', 'tent', 'firewood'],
    books: /shelter|outdoor|camp|bushcraft|survival/i,
    suggest: 'Wikipedia or the Be prepared picks',
  },
  {
    id: 'power',
    title: 'Power and fixing things',
    blurb: 'Batteries, solar, generators, radios and repairs that keep the house running.',
    icon: 'bolt',
    queries: ['solar panel', 'lead acid battery', 'generator', 'inverter', 'radio', 'repair', 'knot'],
    books: /ifixit|repair|appropedia|energy|solar|diy|wikihow/i,
    suggest: 'iFixit or Appropedia',
  },
  {
    id: 'growing',
    title: 'Growing and foraging',
    blurb: 'Vegetables, soil, compost, chickens and what grows wild.',
    icon: 'leaf',
    queries: ['vegetable garden', 'compost', 'seed saving', 'soil', 'chicken', 'edible plants', 'permaculture'],
    books: /garden|farm|permaculture|plant|agric|grow/i,
    suggest: 'Appropedia or Wikipedia',
  },
  {
    id: 'emergencies',
    title: 'Emergencies',
    blurb: 'Bushfire, flood, storm and cyclone: getting ready and getting through.',
    icon: 'alert',
    queries: ['bushfire', 'flood', 'cyclone', 'evacuation', 'storm', 'emergency kit', 'heatwave'],
    books: /au-guides|ready|disaster|emergency|prepar/i,
    suggest: 'the Australian guides',
  },
  {
    id: 'reference',
    title: 'Learning and reference',
    blurb: 'The encyclopedia, dictionaries and books for school at the kitchen table.',
    icon: 'book',
    queries: ['mathematics', 'history of australia', 'geography', 'biology', 'grammar', 'astronomy'],
    books: /wikipedia|wiktionary|wikibooks|wikiversity|gutenberg|khan|ted|phet|wikisource/i,
    suggest: 'Wikipedia',
  },
]

export function topic(id: string): Topic | undefined {
  return TOPICS.find((t) => t.id === id)
}

/** A topic's reading list. */
export interface TopicReads {
  topic: string
  reads: Preview[]
  /** Books on the shelves that are about the topic. */
  books: { contentId: string; title: string; uuid: string }[]
  builtAt: number
}

/** What the hub's tiles show for each topic: how much there is and a few pictures. */
export interface TopicSummary {
  id: string
  count: number
  images: string[]
}

export interface Discover {
  day: string
  items: Preview[]
}
