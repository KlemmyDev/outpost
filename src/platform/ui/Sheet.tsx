import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/** Matches the CSS animation length, so the panel is removed once it has slid away. */
const LEAVE_MS = 220

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * The drill-in panel: slides in from the right with the details behind a
 * summary card, and slides back out when closed. Escape or the backdrop
 * closes it, focus moves into it, and goes back to whatever opened it.
 */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const titleId = useId()
  const panel = useRef<HTMLDivElement>(null)
  const done = useRef<HTMLButtonElement>(null)
  const [leaving, setLeaving] = useState(false)
  const closing = useRef(false)

  // Play the leave animation, then tell the parent to unmount us.
  const requestClose = useCallback(() => {
    if (closing.current) return
    closing.current = true
    setLeaving(true)
    window.setTimeout(onClose, prefersReducedMotion() ? 0 : LEAVE_MS)
  }, [onClose])

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    done.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') requestClose()
      if (e.key === 'Tab' && panel.current) {
        // Keep Tab inside the panel while it's open.
        const focusable = panel.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
        )
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last?.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first?.focus()
        }
      }
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
      opener?.focus()
    }
  }, [requestClose])

  // Rendered into <body>: an ancestor with backdrop-filter (like the sticky
  // header) would otherwise trap position: fixed inside itself. Sheets only
  // open after a click, so this never runs during server rendering.
  return createPortal(
    <div className={`sheet-layer${leaving ? ' leaving' : ''}`}>
      <button type="button" className="sheet-backdrop" aria-label="Close details" tabIndex={-1} onClick={requestClose} />
      <div ref={panel} className="sheet" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="sheet-head">
          <h2 id={titleId}>{title}</h2>
          <button ref={done} type="button" className="btn" onClick={requestClose}>
            Done
          </button>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>,
    document.body,
  )
}
