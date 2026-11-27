import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const BPM = 110
const BEAT_MS = 60_000 / BPM
const BREATH_MS = 5000

type WakeLock = { release(): Promise<void> }

/**
 * A full-screen CPR beat: 110 compressions a minute, counted to 30, then a
 * pause for 2 breaths (or straight on, for compressions only). Keeps the
 * screen awake and can click along. Big enough to follow from the floor.
 */
export function CprCoach({ onClose }: { onClose: () => void }) {
  const [running, setRunning] = useState(true)
  const [onlyCompressions, setOnlyCompressions] = useState(false)
  const [sound, setSound] = useState(true)
  const [count, setCount] = useState(0)
  const [phase, setPhase] = useState<'push' | 'breathe'>('push')
  const [cycles, setCycles] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const audio = useRef<AudioContext | null>(null)
  const started = useRef(Date.now())
  const stop = useRef<HTMLButtonElement>(null)
  const live = useRef({ sound, onlyCompressions })
  live.current = { sound, onlyCompressions }

  function click(high: boolean) {
    if (!live.current.sound) return
    try {
      audio.current ??= new AudioContext()
      const ctx = audio.current
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.frequency.value = high ? 1320 : 880
      gain.gain.setValueAtTime(0.25, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.07)
      osc.connect(gain).connect(ctx.destination)
      osc.start()
      osc.stop(ctx.currentTime + 0.08)
    } catch {
      // No audio: the count on screen still works.
    }
  }

  // The beat.
  useEffect(() => {
    if (!running) return
    let timer: ReturnType<typeof setTimeout>
    let n = 0
    const beat = () => {
      n += 1
      setCount(n)
      setPhase('push')
      click(n === 30)
      if (n >= 30 && !live.current.onlyCompressions) {
        n = 0
        setCycles((c) => c + 1)
        timer = setTimeout(() => {
          setPhase('breathe')
          setCount(0)
          timer = setTimeout(beat, BREATH_MS)
        }, BEAT_MS)
        return
      }
      if (n >= 30) {
        n = 0
        setCycles((c) => c + 1)
      }
      timer = setTimeout(beat, BEAT_MS)
    }
    timer = setTimeout(beat, 400)
    return () => clearTimeout(timer)
  }, [running])

  useEffect(() => {
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - started.current) / 1000)), 1000)
    return () => clearInterval(t)
  }, [])

  // Keep the screen on, focus the stop button, Escape closes.
  useEffect(() => {
    let lock: WakeLock | null = null
    const nav = navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<WakeLock> } }
    nav.wakeLock
      ?.request('screen')
      .then((l) => (lock = l))
      .catch(() => {})
    stop.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      void lock?.release().catch(() => {})
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
      void audio.current?.close().catch(() => {})
    }
  }, [onClose])

  const mm = String(Math.floor(elapsed / 60))
  const ss = String(elapsed % 60).padStart(2, '0')

  return createPortal(
    <div className="cpr" role="dialog" aria-modal="true" aria-label="CPR helper">
      <div className="cpr-top">
        <a className="cpr-call" href="tel:000">
          Call 000
        </a>
        <span className="cpr-time" aria-label={`${mm} minutes ${ss} seconds`}>
          {mm}:{ss} · {cycles} round{cycles === 1 ? '' : 's'}
        </span>
      </div>

      <div className="cpr-centre" aria-live="assertive">
        {phase === 'breathe' ? (
          <>
            <span className="cpr-word">2 breaths</span>
            <span className="cpr-hint">Tilt the head, lift the chin, seal and breathe until the chest rises. Twice.</span>
          </>
        ) : (
          <>
            <span key={count} className={`cpr-pulse${running ? '' : ' paused'}`} aria-hidden="true" />
            <span className="cpr-count" aria-label={`Compression ${count} of 30`}>
              {count || '·'}
            </span>
            <span className="cpr-hint">{running ? 'Push hard and fast on the centre of the chest, a third of its depth. Let it come back up.' : 'Paused'}</span>
          </>
        )}
      </div>

      <div className="cpr-controls">
        <label className="cpr-toggle">
          <input type="checkbox" checked={onlyCompressions} onChange={(e) => setOnlyCompressions(e.target.checked)} />
          Compressions only
        </label>
        <label className="cpr-toggle">
          <input type="checkbox" checked={sound} onChange={(e) => setSound(e.target.checked)} />
          Beat sound
        </label>
        <button type="button" className="cpr-btn" onClick={() => setRunning((r) => !r)}>
          {running ? 'Pause' : 'Resume'}
        </button>
        <button ref={stop} type="button" className="cpr-btn stop" onClick={onClose}>
          Stop
        </button>
      </div>
      <p className="cpr-foot">110 a minute. Use a defibrillator (AED) as soon as one arrives. Keep going until they respond or help takes over.</p>
    </div>,
    document.body,
  )
}
