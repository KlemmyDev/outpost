import { Link } from '@tanstack/react-router'
import type { CSSProperties, ReactNode } from 'react'

/** A link to a page in a book. An empty path is the book's main page. */
export function ReadLink({ book, path, className, style, children, title }: { book: string; path: string; className?: string; style?: CSSProperties; children: ReactNode; title?: string }) {
  return (
    <Link to="/library/read/$book/$" params={{ book, _splat: path }} className={className} style={style} title={title}>
      {children}
    </Link>
  )
}
