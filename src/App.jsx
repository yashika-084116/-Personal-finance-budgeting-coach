import { useEffect, useMemo, useState } from 'react';
import { categorize, listMonths, merchantKey } from './lib/finance.js';
import { loadState, saveState, uid, emptyState } from './lib/storage.js';
import { generateSampleTransactions, sampleGoals, sampleBudgets } from './lib/sampleData.js';
import { DisclaimerModal, DisclaimerBanner } from './components/Disclaimer.jsx';
import Dashboard from './components/Dashboard.jsx';
import Transactions from './components/Transactions.jsx';
import Goals from './components/Goals.jsx';
import Insights from './components/Insights.jsx';

const TABS = ['Dashboard', 'Transactions', 'Goals', 'Insights'];
const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP'];

export default function App() {
  const [state, setState] = useState(loadState);
  const [tab, setTab] = useState('Dashboard');
  const months = useMemo(() => listMonths(state.transactions), [state.transactions]);
  const [month, setMonth] = useState(() => months[0] || new Date().toISOString().slice(0, 7));

  useEffect(() => saveState(state), [state]);
  useEffect(() => {
    if (months.length && !months.includes(month)) setMonth(months[0]);
  }, [months, month]);

  const update = (patch) => setState((s) => ({ ...s, ...(typeof patch === 'function' ? patch(s) : patch) }));

  const addTransactions = (txns) =>
    update((s) => ({
      transactions: [
        ...s.transactions,
        ...txns.map((t) => {
          if (t.category) return { id: uid(), ...t, categorySource: 'manual' };
          const { category, source } = categorize(t, s.learned);
          return { id: uid(), ...t, category, categorySource: source };
        }),
      ],
    }));

  // Re-categorizing one transaction teaches the app: every other transaction from the
  // same merchant that wasn't set by hand moves too, and future imports use it.
  const recategorize = (id, category) =>
    update((s) => {
      const target = s.transactions.find((t) => t.id === id);
      const key = merchantKey(target.description);
      return {
        learned: key ? { ...s.learned, [key]: category } : s.learned,
        transactions: s.transactions.map((t) =>
          t.id === id
            ? { ...t, category, categorySource: 'manual' }
            : key && t.categorySource !== 'manual' && merchantKey(t.description) === key
              ? { ...t, category, categorySource: 'learned' }
              : t,
        ),
      };
    });

  const loadSample = () => {
    const txns = generateSampleTransactions();
    update({ transactions: [], learned: {}, goals: sampleGoals(), budgets: sampleBudgets });
    addTransactions(txns);
    setMonth(listMonths(txns)[0]);
  };

  const resetAll = () => {
    if (confirm('Delete all transactions, goals and budgets stored in this browser?')) {
      setState({ ...emptyState, disclaimerAccepted: true, currency: state.currency });
    }
  };

  const shared = { state, update, month, setMonth, months, currency: state.currency };

  return (
    <div className="app">
      {!state.disclaimerAccepted && <DisclaimerModal onAccept={() => update({ disclaimerAccepted: true })} />}

      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden="true">◧</span>
          <div>
            <h1>Budget Coach</h1>
            <p className="muted small">Personal finance &amp; budgeting coach</p>
          </div>
        </div>
        <div className="topbar-actions">
          <label className="inline">
            <span className="muted small">Currency</span>
            <select value={state.currency} onChange={(e) => update({ currency: e.target.value })}>
              {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
          <button className="btn ghost" onClick={loadSample}>Load sample data</button>
          <button className="btn ghost danger" onClick={resetAll}>Reset</button>
        </div>
      </header>

      <nav className="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'tab active' : 'tab'} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </nav>

      <main>
        {state.transactions.length === 0 && tab !== 'Goals' ? (
          <section className="card empty">
            <h2>Get started</h2>
            <p>Add transactions by hand, import a bank-statement CSV, or explore with sample data.</p>
            <div className="row">
              <button className="btn" onClick={loadSample}>Load sample data</button>
              <button className="btn ghost" onClick={() => setTab('Transactions')}>Add transactions</button>
            </div>
            {tab === 'Transactions' && <Transactions {...shared} addTransactions={addTransactions} recategorize={recategorize} />}
          </section>
        ) : (
          <>
            {tab === 'Dashboard' && <Dashboard {...shared} goToInsights={() => setTab('Insights')} />}
            {tab === 'Transactions' && <Transactions {...shared} addTransactions={addTransactions} recategorize={recategorize} />}
            {tab === 'Goals' && <Goals {...shared} />}
            {tab === 'Insights' && <Insights {...shared} />}
          </>
        )}
      </main>

      <DisclaimerBanner />
    </div>
  );
}
