import { useEffect, useRef, useState } from 'react'

const TINTS = ['var(--dusk)', 'var(--eucalypt)', 'var(--ochre)', 'var(--ironbark)']

/** A book's icon from Kiwix, or its first letter on a tint when there isn't one. */
export function BookIcon({ uuid, title, size = 40, src }: { uuid?: string; title: string; size?: number; src?: string | null }) {
  const [broken, setBroken] = useState(false)
  const img = useRef<HTMLImageElement>(null)
  // A server-rendered image can fail before React is listening for it.
  useEffect(() => {
    if (img.current?.complete && img.current.naturalWidth === 0) setBroken(true)
  }, [])
  const url = src ?? (uuid ? `/api/library/icon/${uuid}` : null)
  const tint = TINTS[[...title].reduce((n, c) => n + c.charCodeAt(0), 0) % TINTS.length]
  if (url && !broken) {
    return <img ref={img} className="book-icon" src={url} alt="" width={size} height={size} style={{ width: size, height: size }} onError={() => setBroken(true)} />
  }
  return (
    <span className="book-icon letter" aria-hidden="true" style={{ width: size, height: size, background: tint, fontSize: size * 0.45 }}>
      {title.trim().charAt(0).toUpperCase() || '?'}
    </span>
  )
}
