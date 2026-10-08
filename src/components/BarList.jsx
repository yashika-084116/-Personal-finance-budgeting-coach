import { formatMoney } from '../lib/finance.js';

/**
 * Horizontal single-series bar chart, sorted by the caller.
 * One hue for every bar (magnitude, not identity); labels and values stay in text ink.
 * Optional `limit` per row draws a budget marker.
 */
export default function BarList({ rows, currency, label }) {
  const max = Math.max(...rows.map((r) => Math.max(r.value, r.limit || 0)), 1);
  return (
    <figure className="barlist" aria-label={label}>
      {rows.map((r) => (
        <div className="barlist-row" key={r.name} title={`${r.name}: ${formatMoney(r.value, currency)}${r.note ? ` · ${r.note}` : ''}`}>
          <span className="barlist-name">{r.name}</span>
          <span className="barlist-track">
            <span className={`barlist-bar${r.over ? ' over' : ''}`} style={{ width: `${(r.value / max) * 100}%` }} />
            {r.limit ? <span className="barlist-limit" style={{ left: `${(r.limit / max) * 100}%` }} aria-hidden="true" /> : null}
          </span>
          <span className="barlist-value">
            {formatMoney(r.value, currency)}
            {r.note ? <span className="muted small"> {r.note}</span> : null}
          </span>
        </div>
      ))}
    </figure>
  );
}
