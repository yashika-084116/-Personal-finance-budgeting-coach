import { useMemo, useState } from 'react';
import { CATEGORIES, budgetStatus, compareMonths, formatMoney, goalProgress, previousMonth, summarizeMonth } from '../lib/finance.js';
import BarList from './BarList.jsx';

export function MonthPicker({ month, setMonth, months }) {
  return (
    <label className="inline">
      <span className="muted small">Month</span>
      <select value={month} onChange={(e) => setMonth(e.target.value)}>
        {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
      </select>
    </label>
  );
}

export const monthLabel = (m) => {
  const [y, mo] = m.split('-').map(Number);
  return new Date(y, mo - 1, 1).toLocaleString(undefined, { month: 'long', year: 'numeric' });
};

export default function Dashboard({ state, update, month, setMonth, months, currency, goToInsights }) {
  const summary = useMemo(() => summarizeMonth(state.transactions, month), [state.transactions, month]);
  const prev = useMemo(() => summarizeMonth(state.transactions, previousMonth(month)), [state.transactions, month]);
  const budgets = budgetStatus(summary, state.budgets);
  const changes = compareMonths(summary, prev.transactionCount ? prev : null).filter((c) => c.previous > 0).slice(0, 3);
  const money = (n) => formatMoney(n, currency);

  const rows = summary.categories.map((c) => {
    const limit = state.budgets[c.category];
    return {
      name: c.category,
      value: c.total,
      limit,
      over: limit && c.total > limit,
      note: limit ? (c.total > limit ? `over ${money(limit)} budget` : `of ${money(limit)}`) : `${c.share}%`,
    };
  });

  return (
    <div className="stack">
      <div className="section-head">
        <h2>Overview</h2>
        <MonthPicker month={month} setMonth={setMonth} months={months} />
      </div>

      <div className="tiles">
        <Tile label="Income" value={money(summary.income)} />
        <Tile label="Spending" value={money(summary.spending)} delta={prev.spending ? summary.spending - prev.spending : null} money={money} invert />
        <Tile label="Net saved" value={money(summary.net)} tone={summary.net < 0 ? 'bad' : undefined} />
        <Tile label="Savings rate" value={summary.savingsRate == null ? '—' : `${summary.savingsRate}%`} />
      </div>

      <div className="grid-2">
        <section className="card">
          <h3>Spending by category</h3>
          {rows.length ? <BarList rows={rows} currency={currency} label="Spending by category" /> : <p className="muted">No spending this month.</p>}
          <p className="muted small">Bars show amount spent; the vertical tick marks your budget. Transfers are excluded.</p>
        </section>

        <div className="stack">
          <section className="card">
            <h3>Biggest changes vs {monthLabel(previousMonth(month))}</h3>
            {changes.length ? (
              <ul className="plain">
                {changes.map((c) => (
                  <li key={c.category} className="change-row">
                    <span>{c.category}</span>
                    <span className={c.change > 0 ? 'up' : 'down'}>
                      {c.change > 0 ? '▲' : '▼'} {money(Math.abs(c.change))}
                      {c.changePct != null && <span className="muted small"> ({c.changePct > 0 ? '+' : ''}{c.changePct}%)</span>}
                    </span>
                  </li>
                ))}
              </ul>
            ) : <p className="muted">No previous month to compare yet.</p>}
          </section>

          <section className="card">
            <h3>Savings goals</h3>
            {state.goals.length ? state.goals.map((g) => {
              const p = goalProgress(g);
              return (
                <div key={g.id} className="goal-mini">
                  <div className="row-between"><span>{g.name}</span><span className="muted small">{p.pct}%</span></div>
                  <div className="progress"><span style={{ width: `${p.pct}%` }} /></div>
                </div>
              );
            }) : <p className="muted">No goals yet - add one in the Goals tab.</p>}
          </section>

          <section className="card accent">
            <h3>Monthly insights</h3>
            <p>Get a personalised summary of this month with suggestions for your budget.</p>
            <button className="btn" onClick={goToInsights}>View insights</button>
          </section>
        </div>
      </div>

      <BudgetEditor budgets={state.budgets} status={budgets} update={update} currency={currency} />
    </div>
  );
}

function Tile({ label, value, delta, money, invert, tone }) {
  let deltaEl = null;
  if (delta != null && delta !== 0) {
    const worse = invert ? delta > 0 : delta < 0;
    deltaEl = (
      <span className={`small ${worse ? 'up' : 'down'}`}>
        {delta > 0 ? '▲' : '▼'} {money(Math.abs(delta))} vs last month
      </span>
    );
  }
  return (
    <div className={`tile${tone ? ` ${tone}` : ''}`}>
      <span className="muted small">{label}</span>
      <span className="tile-value">{value}</span>
      {deltaEl}
    </div>
  );
}

function BudgetEditor({ budgets, status, update, currency }) {
  const [open, setOpen] = useState(false);
  const spendCats = CATEGORIES.filter((c) => !['Income', 'Transfers'].includes(c));
  const setBudget = (cat, val) =>
    update((s) => {
      const next = { ...s.budgets };
      const n = Number(val);
      if (n > 0) next[cat] = n; else delete next[cat];
      return { budgets: next };
    });

  return (
    <section className="card">
      <div className="row-between">
        <h3>Monthly budgets</h3>
        <button className="btn ghost" onClick={() => setOpen(!open)}>{open ? 'Done' : 'Edit budgets'}</button>
      </div>
      {open ? (
        <div className="budget-grid">
          {spendCats.map((c) => (
            <label key={c} className="field">
              <span className="small">{c}</span>
              <input type="number" min="0" step="100" placeholder="No limit" value={budgets[c] ?? ''} onChange={(e) => setBudget(c, e.target.value)} />
            </label>
          ))}
        </div>
      ) : status.length ? (
        <ul className="plain">
          {status.map((b) => (
            <li key={b.category} className="change-row">
              <span>{b.category}</span>
              <span>
                <span className={`badge ${b.status}`}>{b.status === 'over' ? '⚠ Over' : b.status === 'near' ? '! Near limit' : '✓ OK'}</span>{' '}
                {formatMoney(b.spent, currency)} / {formatMoney(b.limit, currency)}
              </span>
            </li>
          ))}
        </ul>
      ) : <p className="muted">No budgets set. Budgets let the coach flag categories that are running over.</p>}
    </section>
  );
}
