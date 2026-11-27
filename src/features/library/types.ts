/** Shared between the Library's server side and its pages. No Node imports. */

/** A collection installed on this server and served by Kiwix. */
export interface Book {
  /** Kiwix's id for the file's place in URLs, from the file name: `wikipedia_en_all_maxi_2026-10`. */
  contentId: string
  /** The collection, the same across versions: `wikipedia_en_all`. */
  name: string
  flavour: string
  title: string
  summary: string
  language: string
  category: string
  articleCount: number
  mediaCount: number
  /** When this version was made, `YYYY-MM-DD`. */
  date: string
  sizeBytes: number | null
  /** Kiwix's book id, for its icon. */
  uuid: string
  pictures: boolean
}

/** A collection in Kiwix's online catalogue, available to download. */
export interface CatalogEntry {
  uuid: string
  name: string
  flavour: string
  title: string
  summary: string
  language: string
  category: string
  articleCount: number
  mediaCount: number
  date: string
  sizeBytes: number
  /** The `.zim` file itself (not the `.meta4` list of mirrors). */
  url: string
  /** Kiwix's content id for this version, from the file name. */
  contentId: string
  icon: string | null
  pictures: boolean
}

export interface CatalogPage {
  entries: CatalogEntry[]
  total: number
  start: number
}

/** A curated pick on the Sources screen, with each version Kiwix offers. */
export interface Recommendation {
  name: string
  title: string
  why: string
  options: CatalogEntry[]
}

export type DownloadState = 'queued' | 'downloading' | 'verifying' | 'paused' | 'failed' | 'done' | 'cancelled'

export interface Download {
  id: number
  name: string
  flavour: string
  title: string
  contentId: string
  url: string
  sizeBytes: number
  bytes: number
  state: DownloadState
  error: string | null
  /** The installed version this one replaces once it's done. */
  replaces: string | null
  createdAt: number
  updatedAt: number
  /** Live while downloading. */
  bytesPerSec: number | null
  /** How far verification has got, 0 to 1. */
  verified: number | null
}

export interface SearchHit {
  contentId: string
  bookTitle: string
  path: string
  title: string
  snippet: string
  words: number | null
}

export interface SearchGroup {
  contentId: string
  bookTitle: string
  total: number
  hits: SearchHit[]
}

export interface SearchResults {
  query: string
  groups: SearchGroup[]
  /** Set when results come from one book, for paging through it. */
  start: number
  pageLength: number
}

export interface Suggestion {
  contentId: string
  bookTitle: string
  title: string
  path: string
}

export interface TocItem {
  id: string
  text: string
  level: 2 | 3
}

export type ArticleResult =
  | { kind: 'article'; contentId: string; bookTitle: string; path: string; title: string; html: string; toc: TocItem[]; saved: boolean; words: number }
  /** The path moved; open this one instead. */
  | { kind: 'redirect'; path: string }
  /** Not a page (a PDF, an image): open it directly. */
  | { kind: 'file'; url: string }
  | { kind: 'missing'; contentId: string; path: string; reason: string }

export interface Bookmark {
  contentId: string
  bookTitle: string
  path: string
  title: string
  savedAt: number
}

export interface HistoryItem {
  contentId: string
  bookTitle: string
  path: string
  title: string
  visitedAt: number
}

export interface StorageInfo {
  libraryBytes: number
  freeBytes: number
  totalBytes: number
}

export interface LibraryHome {
  online: boolean
  books: Book[]
  history: HistoryItem[]
  saved: Bookmark[]
  downloads: Download[]
  storage: StorageInfo | null
}

export interface SourcesData {
  online: boolean
  books: Book[]
  downloads: Download[]
  storage: StorageInfo | null
  /** Newer versions in the catalogue, by installed content id. */
  updates: Record<string, CatalogEntry>
}

/** The Library's Overview card. */
export interface LibraryStatus {
  online: boolean
  books: number
  articles: number
  bytes: number
  download: { title: string; bytes: number; sizeBytes: number; state: DownloadState } | null
  queued: number
}

/** Kiwix names file versions `<name>_<flavour>_<YYYY-MM>`; this pulls the date out. */
export function dateFromContentId(contentId: string): string | null {
  const m = /_(\d{4})-(\d{2})$/.exec(contentId)
  return m ? `${m[1]}-${m[2]}` : null
}

export const FLAVOUR_WORDS: Record<string, string> = {
  maxi: 'With pictures',
  nopic: 'Text only',
  mini: 'Introductions only',
  '': 'Complete',
}

export function flavourLabel(flavour: string): string {
  return FLAVOUR_WORDS[flavour] ?? flavour.replace(/[_-]/g, ' ')
}
