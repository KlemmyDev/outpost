import { createFileRoute } from '@tanstack/react-router'
import { searchLibrary } from '#/features/library/library.functions'
import { SearchPage } from '#/features/library/SearchPage'

export const Route = createFileRoute('/library/search')({
  validateSearch: (s: Record<string, unknown>): { q: string; book?: string; start?: number } => ({
    q: typeof s.q === 'string' ? s.q : '',
    ...(typeof s.book === 'string' && s.book ? { book: s.book } : {}),
    ...(Number(s.start) > 0 ? { start: Math.floor(Number(s.start)) } : {}),
  }),
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => searchLibrary({ data: { q: deps.q, book: deps.book, start: deps.start } }),
  head: ({ match }) => ({ meta: [{ title: `${match.search.q ? `${match.search.q} · ` : ''}Search · Outpost` }] }),
  component: function SearchRoute() {
    const { book } = Route.useSearch()
    return <SearchPage results={Route.useLoaderData()} book={book ?? ''} />
  },
})
