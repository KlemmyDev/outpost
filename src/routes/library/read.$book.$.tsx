import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { getArticle } from '#/features/library/library.functions'
import { Reader } from '#/features/library/Reader'

/** /library/read/<book>/<path>: a page in a book. No path is the book's main page. */
export const Route = createFileRoute('/library/read/$book/$')({
  loader: async ({ params }) => {
    const result = await getArticle({ data: { book: params.book, path: params._splat ?? '' } })
    if (result.kind === 'redirect') throw redirect({ to: '/library/read/$book/$', params: { book: params.book, _splat: result.path }, replace: true })
    return result
  },
  head: ({ loaderData }) => ({ meta: [{ title: `${loaderData?.kind === 'article' ? `${loaderData.title} · ` : ''}Library · Outpost` }] }),
  component: function ReadRoute() {
    const result = Route.useLoaderData()
    if (result.kind === 'article') return <Reader key={`${result.contentId}/${result.path}`} article={result} />
    return (
      <main className="page lib-page">
        <section className="card" style={{ maxWidth: 640 }}>
          {result.kind === 'file' ? (
            <>
              <h1 style={{ fontSize: 28 }}>This is a file, not a page</h1>
              <p className="muted" style={{ margin: 0 }}>It opens in its own tab.</p>
              <a className="btn accent" href={result.url} target="_blank" rel="noopener" style={{ alignSelf: 'flex-start' }}>
                Open the file
              </a>
            </>
          ) : result.kind === 'missing' ? (
            <>
              <h1 style={{ fontSize: 28 }}>Page not found</h1>
              <p className="muted" style={{ margin: 0, lineHeight: 1.55 }}>{result.reason}</p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Link to="/library" className="btn secondary">
                  Back to the library
                </Link>
                {result.path && (
                  <Link to="/library/search" search={{ q: result.path.replace(/_/g, ' ').split('/').pop() ?? '' }} className="btn accent">
                    Search for it
                  </Link>
                )}
              </div>
            </>
          ) : null}
        </section>
      </main>
    )
  },
})
