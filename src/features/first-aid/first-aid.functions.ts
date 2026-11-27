import { createServerFn } from '@tanstack/react-start'
import { getPlatform } from '#/platform/server/platform.server'
import { getLibraryReady } from '#/features/library/server'
import type { Library } from '#/features/library/server'
import { FIRST_AID_GUIDES } from './topics'
import type { FirstAidData, FirstAidStatus } from './types'

async function lib(): Promise<Library> {
  if (!getPlatform().features.isEnabled('first-aid')) throw new Error('First aid is switched off.')
  const library = await getLibraryReady()
  if (!library) throw new Error('First aid needs the Library, which keeps the guides.')
  return library
}

export async function firstAidData(library: Library): Promise<FirstAidData> {
  const { guides } = library.guides.list()
  const mine = guides.filter((g) => FIRST_AID_GUIDES.includes(g.id))
  const { books } = await library.booksOrOffline()
  const wikimed = books.filter((b) => b.name === 'mdwiki_en_all').sort((a, b) => (b.sizeBytes ?? 0) - (a.sizeBytes ?? 0))[0]
  return {
    saved: mine.filter((g) => g.bytes !== null).map((g) => g.id),
    saving: mine.filter((g) => g.busy).map((g) => g.id),
    total: FIRST_AID_GUIDES.length,
    wikimed: wikimed?.contentId ?? null,
  }
}

export function firstAidStatus(d: FirstAidData): FirstAidStatus {
  return { guidesSaved: d.saved.length, guidesTotal: d.total, wikimed: !!d.wikimed }
}

export const getFirstAid = createServerFn({ method: 'GET' }).handler(async (): Promise<FirstAidData> => firstAidData(await lib()))

/** Saves every ANZCOR guide First aid links to, from ANZCOR's site. */
export const saveFirstAidGuides = createServerFn({ method: 'POST' }).handler(async (): Promise<FirstAidData> => {
  const library = await lib()
  library.guides.enqueue(FIRST_AID_GUIDES)
  return firstAidData(library)
})
