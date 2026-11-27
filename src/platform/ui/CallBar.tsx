/** 000, Poisons and healthdirect, for the top of First aid and Emergency. Tappable on phones. */
export function CallBar() {
  return (
    <div className="aid-call" role="region" aria-label="Emergency numbers">
      <a className="aid-000" href="tel:000">
        <span className="aid-000-n">000</span>
        <span>Ambulance, fire, police</span>
      </a>
      <a className="aid-num" href="tel:131126">
        <strong>13 11 26</strong>
        <span>Poisons Information</span>
      </a>
      <a className="aid-num" href="tel:1800022222">
        <strong>1800 022 222</strong>
        <span>healthdirect nurse</span>
      </a>
    </div>
  )
}

