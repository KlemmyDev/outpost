import { useState } from 'react'
import { savePlan } from '../emergency.functions'
import type { Person, Plan } from '../types'

const ROLES = ['Household', 'Out-of-area contact', 'Neighbour', 'Family', 'Doctor', 'Vet', 'School or work']

const newPerson = (): Person => ({ id: `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, name: '', phone: '', role: 'Household', medical: '' })

/**
 * The household's plan: who to call, where to meet, how to turn things off,
 * and what else matters. Kept on this server for everyone at home, and
 * printable to stick on the fridge.
 */
export function PlanTab({ initial, onSaved }: { initial: Plan; onSaved: (p: Plan) => void }) {
  const [plan, setPlan] = useState<Plan>(initial.people.length ? initial : { ...initial, people: [newPerson()] })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null)
  const set = (patch: Partial<Plan>) => setPlan((p) => ({ ...p, ...patch }))
  const setPerson = (id: string, patch: Partial<Person>) => set({ people: plan.people.map((x) => (x.id === id ? { ...x, ...patch } : x)) })

  async function save() {
    setBusy(true)
    setMsg(null)
    try {
      const saved = await savePlan({ data: plan })
      onSaved(saved)
      setPlan(saved.people.length ? saved : { ...saved, people: [newPerson()] })
      setMsg({ tone: 'good', text: 'Saved. Everyone at home sees the same plan.' })
    } catch (err) {
      setMsg({ tone: 'bad', text: (err as Error).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      className="em-plan"
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
    >
      <div className="em-plan-head no-print">
        <p className="muted" style={{ margin: 0, lineHeight: 1.5 }}>
          Fill it in together, then print a copy for the fridge and the kit: it's useful when the screen isn't.
          {initial.updatedAt ? ` Last saved ${new Date(initial.updatedAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}.` : ''}
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn secondary" onClick={() => window.print()}>
            Print
          </button>
          <button type="submit" className="btn accent" disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
      {msg && <div className={`notice ${msg.tone} no-print`}>{msg.text}</div>}

      <h1 className="print-only">Household emergency plan</h1>

      <section className="card" aria-labelledby="people">
        <h2 id="people">People and numbers</h2>
        <p className="muted em-sub">Everyone at home, an out-of-area contact (someone everyone checks in with), neighbours, the doctor and the vet. Add medical details that responders should know.</p>
        <div className="em-people">
          {plan.people.map((p) => (
            <div key={p.id} className="em-person">
              <label className="field">
                <span>Name</span>
                <input value={p.name} onChange={(e) => setPerson(p.id, { name: e.target.value })} maxLength={80} />
              </label>
              <label className="field">
                <span>Phone</span>
                <input value={p.phone} onChange={(e) => setPerson(p.id, { phone: e.target.value })} maxLength={40} inputMode="tel" />
              </label>
              <label className="field">
                <span>Who</span>
                <select value={p.role} onChange={(e) => setPerson(p.id, { role: e.target.value })}>
                  {[...new Set([...ROLES, p.role])].map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
              </label>
              <label className="field wide">
                <span>Medical: conditions, medicines, allergies</span>
                <input value={p.medical} onChange={(e) => setPerson(p.id, { medical: e.target.value })} maxLength={1000} />
              </label>
              <button type="button" className="link-btn no-print" onClick={() => set({ people: plan.people.filter((x) => x.id !== p.id) })} aria-label={`Remove ${p.name || 'this person'}`}>
                Remove
              </button>
            </div>
          ))}
        </div>
        <button type="button" className="tool-btn no-print" onClick={() => set({ people: [...plan.people, newPerson()] })} style={{ alignSelf: 'flex-start' }}>
          Add someone
        </button>
      </section>

      <section className="card" aria-labelledby="meet">
        <h2 id="meet">Where to meet</h2>
        <div className="em-fields">
          <Text label="Close to home (if you can't get back inside)" value={plan.meetNear} onChange={(v) => set({ meetNear: v })} placeholder="e.g. the letterbox, or the park on the corner" />
          <Text label="Away from the area (if you have to leave)" value={plan.meetAway} onChange={(v) => set({ meetAway: v })} placeholder="e.g. Aunty Sue's in Toowoomba" />
        </div>
        <p className="muted em-sub no-print">Meeting points can also go on the Map as waypoints.</p>
      </section>

      <section className="card" aria-labelledby="off">
        <h2 id="off">Turning things off</h2>
        <div className="em-fields">
          <Text label="Power: the main switch" value={plan.power} onChange={(v) => set({ power: v })} placeholder="e.g. meter box, left of the front door" />
          <Text label="Gas" value={plan.gas} onChange={(v) => set({ gas: v })} placeholder="e.g. the valve by the meter, turn a quarter turn" />
          <Text label="Water: the mains tap" value={plan.water} onChange={(v) => set({ water: v })} placeholder="e.g. under the cover near the footpath" />
        </div>
      </section>

      <section className="card" aria-labelledby="else">
        <h2 id="else">Everything else</h2>
        <div className="em-fields">
          <Text label="Pets: who takes them, where they go" value={plan.pets} onChange={(v) => set({ pets: v })} long />
          <Text label="Insurance: company, policy numbers, how to claim" value={plan.insurance} onChange={(v) => set({ insurance: v })} long />
          <Text label="Notes: what to grab, who checks on whom, the plan for a bushfire or flood" value={plan.notes} onChange={(v) => set({ notes: v })} long />
        </div>
      </section>
    </form>
  )
}

function Text({ label, value, onChange, placeholder, long = false }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; long?: boolean }) {
  return (
    <label className="field">
      <span>{label}</span>
      {long ? <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={3} placeholder={placeholder} /> : <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />}
    </label>
  )
}
