import { useMemo, useState } from 'react';
import { budgetStatus, compareMonths, formatMoney, goalProgress, previousMonth, summarizeMonth } from '../lib/finance.js';
import { MonthPicker, monthLabel } from './Dashboard.jsx';

export default function Insights({ state, month, setMonth, months, currency }) {
  const [result, setResult] = useState(null); // { month, data }
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Only aggregates leave the browser - never the raw transaction list.
  const payload = useMemo(() => {
    const summary = summarizeMonth(state.transactions, month);
    const prev = summarizeMonth(state.transactions, previousMonth(month));
    return {
      currency,
      summary,
      previousMonth: prev.transactionCount ? { month: prev.month, income: prev.income, spending: prev.spending, savingsRate: prev.savingsRate } : null,
      comparison: compareMonths(summary, prev.transactionCount ? prev : null),
      budgets: budgetStatus(summary, state.budgets),
      goals: state.goals.map((g) => ({ name: g.name, target: g.target, deadline: g.deadline, ...goalProgress(g) })),
    };
  }, [state.transactions, state.budgets, state.goals, month, currency]);

  const generate = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
      setResult({ month, data });
    } catch (e) {
      setError(e.message === 'Failed to fetch' ? 'Could not reach the insights server. Is it running (npm run dev)?' : e.message);
    } finally {
      setLoading(false);
    }
  };

  const current = result?.month === month ? result.data : null;
  const money = (n) => formatMoney(n, currency);

  return (
    <div className="stack">
      <div className="section-head">
        <h2>Monthly insights</h2>
        <MonthPicker month={month} setMonth={setMonth} months={months} />
      </div>

      <div className="notice" role="note">
        <strong>Not financial advice.</strong> Insights are generated automatically (by AI when configured) from your
        own data, for educational purposes only. They may be inaccurate and are not a substitute for advice from a
        licensed financial professional.
      </div>

      <section className="card">
        <p>
          Generate a coaching summary for <strong>{monthLabel(month)}</strong>: {payload.summary.transactionCount} transactions,
          {' '}{money(payload.summary.spending)} spent.
        </p>
        <p className="muted small">Sent to the server: category totals, top merchants, budgets and goal progress. Your individual transactions are not sent.</p>
        <button className="btn" onClick={generate} disabled={loading || !payload.summary.transactionCount}>
          {loading ? 'Generating…' : current ? 'Regenerate insights' : 'Generate insights'}
        </button>
        {error && <p className="error">{error}</p>}
      </section>

      {current && (
        <>
          <div className="row small">
            <span className={`tag ${current.source === 'ai' ? 'learned' : 'rule'}`}>
              {current.source === 'ai' ? '✦ AI-generated' : 'Rule-based'}
            </span>
            {current.notice && <span className="muted">{current.notice}</span>}
          </div>

          <section className="card accent">
            <h3>{current.insights.headline}</h3>
            <ul>
              {current.insights.highlights.map((h, i) => <li key={i}>{h}</li>)}
            </ul>
          </section>

          {current.insights.suggestions.length > 0 && (
            <section className="card">
              <h3>Ideas to consider</h3>
              <div className="suggestions">
                {current.insights.suggestions.map((s, i) => (
                  <div key={i} className="suggestion">
                    <strong>{s.title}</strong>
                    <p>{s.detail}</p>
                    {s.estimatedMonthlySavings > 0 && <span className="badge ok">≈ {money(s.estimatedMonthlySavings)}/month</span>}
                  </div>
                ))}
              </div>
            </section>
          )}

          {current.insights.goalNotes.length > 0 && (
            <section className="card">
              <h3>Savings goals</h3>
              <ul>{current.insights.goalNotes.map((n, i) => <li key={i}>{n}</li>)}</ul>
            </section>
          )}

          <p className="muted small disclaimer-inline">{current.disclaimer}</p>
        </>
      )}
    </div>
  );
}
