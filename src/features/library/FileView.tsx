import { Link } from '@tanstack/react-router'
import type { ArticleResult } from './types'

type File = Extract<ArticleResult, { kind: 'file' }>

/**
 * A PDF guide or an app-like book (an offline map), shown full width under
 * the Library's breadcrumb with a way to open it on its own. PDFs use the
 * browser's own viewer; maps run sandboxed (see the raw route).
 */
export function FileView({ file }: { file: File }) {
  return (
    <div className="file-view">
      <div className="reader-bar file-bar">
        <nav aria-label="Breadcrumb" className="reader-crumbs">
          <Link to="/library">Library</Link>
          <span aria-hidden="true">›</span>
          <span>{file.bookTitle && file.bookTitle !== file.title ? file.bookTitle : file.title}</span>
        </nav>
        <div className="reader-tools">
          {file.source && (
            <a className="tool-btn" href={file.source.url} target="_blank" rel="noopener noreferrer" title={`From ${file.source.publisher}`}>
              Original ↗
            </a>
          )}
          <a className="tool-btn" href={file.url} target="_blank" rel="noopener">
            {file.pdf ? 'Open PDF' : 'Full screen'}
          </a>
        </div>
      </div>
      <div className="file-head">
        <h1>{file.title}</h1>
        {file.source && (
          <span className="muted">
            {file.source.publisher} · saved {new Date(file.source.fetchedAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
          </span>
        )}
      </div>
      {file.pdf ? (
        <object className="file-frame" data={file.url} type="application/pdf" aria-label={file.title ?? 'PDF'}>
          <div className="file-fallback">
            <p>This browser can't show PDFs inside the page.</p>
            <a className="btn accent" href={file.url} target="_blank" rel="noopener">
              Open the PDF
            </a>
          </div>
        </object>
      ) : (
        <iframe className="file-frame" src={file.url} title={file.title ?? 'File'} />
      )}
    </div>
  )
}
