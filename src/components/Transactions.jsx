import { useMemo, useRef, useState } from 'react';
import { CATEGORIES, formatMoney, monthOf, parseCsv } from '../lib/finance.js';
import { MonthPicker } from './Dashboard.jsx';

const SOURCE_LABEL = { rule: 'Auto', learned: 'Learned', manual: 'Manual', fallback: 'Uncategorized' };

export default function Transactions({ state, update, month, setMonth, months, currency, addTransactions, recategorize }) {
  const [filter, setFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [importMsg, setImportMsg] = useState(null);
  const fileRef = useRef();

  const rows = useMemo(
    () =>
      state.transactions
        .filter((t) => monthOf(t.date) === month)
        .filter((t) => filter === 'All' || t.category === filter)
        .filter((t) => !search || t.description.toLowerCase().includes(search.toLowerCase()))
        .sort((a, b) => b.date.localeCompare(a.date)),
    [state.transactions, month, filter, search],
  );

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const { transactions, errors } = parseCsv(await file.text());
    if (transactions.length) addTransactions(transactions);
    setImportMsg({ ok: transactions.length > 0, text: `Imported ${transactions.length} transaction(s).${errors.length ? ` ${errors.slice(0, 3).join(' ')}${errors.length > 3 ? ` (+${errors.length - 3} more)` : ''}` : ''}` });
    e.target.value = '';
  };

  const remove = (id) => update((s) => ({ transactions: s.transactions.filter((t) => t.id !== id) }));

  return (
    <div className="stack">
      <AddTransaction onAdd={(t) => addTransactions([t])} />

      <section className="card">
        <div className="row-between wrap">
          <h3>Import bank statement (CSV)</h3>
          <button className="btn ghost" onClick={() => fileRef.current.click()}>Choose CSV file</button>
          <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={onFile} />
        </div>
        <p className="muted small">
          Needs columns for <code>date</code>, <code>description</code> and either a signed <code>amount</code> or separate <code>debit</code>/<code>credit</code>.
          An optional <code>category</code> column is respected. Everything stays in your browser.
        </p>
        {importMsg && <p className={importMsg.ok ? 'ok' : 'error'}>{importMsg.text}</p>}
      </section>

      {state.transactions.length > 0 && (
        <section className="card">
          <div className="section-head wrap">
            <h3>Transactions</h3>
            <div className="row wrap">
              <MonthPicker month={month} setMonth={setMonth} months={months} />
              <label className="inline">
                <span className="muted small">Category</span>
                <select value={filter} onChange={(e) => setFilter(e.target.value)}>
                  <option>All</option>
                  {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                </select>
              </label>
              <input type="search" placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
          <p className="muted small">Change a category to teach the coach: other transactions from the same merchant update too, and future imports remember it.</p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Date</th><th>Description</th><th className="num">Amount</th><th>Category</th><th /></tr>
              </thead>
              <tbody>
                {rows.map((t) => (
                  <tr key={t.id}>
                    <td className="nowrap">{t.date}</td>
                    <td>{t.description}</td>
                    <td className={`num nowrap ${t.amount > 0 ? 'down' : ''}`}>{t.amount > 0 ? '+' : ''}{formatMoney(t.amount, currency)}</td>
                    <td>
                      <select value={t.category} onChange={(e) => recategorize(t.id, e.target.value)} aria-label={`Category for ${t.description}`}>
                        {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                      </select>
                      <span className={`tag ${t.categorySource}`}>{SOURCE_LABEL[t.categorySource] || ''}</span>
                    </td>
                    <td><button className="icon-btn" onClick={() => remove(t.id)} aria-label="Delete transaction">✕</button></td>
                  </tr>
                ))}
                {!rows.length && <tr><td colSpan="5" className="muted">No transactions match.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function AddTransaction({ onAdd }) {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({ date: today, description: '', amount: '', type: 'expense', category: '' });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = (e) => {
    e.preventDefault();
    const amt = Math.abs(Number(form.amount));
    if (!form.description.trim() || !amt) return;
    onAdd({
      date: form.date,
      description: form.description.trim(),
      amount: form.type === 'expense' ? -amt : amt,
      category: form.category || undefined, // blank = auto-categorize
    });
    setForm({ ...form, description: '', amount: '', category: '' });
  };

  return (
    <section className="card">
      <h3>Add a transaction</h3>
      <form className="add-form" onSubmit={submit}>
        <label className="field"><span className="small">Date</span><input type="date" value={form.date} onChange={set('date')} required /></label>
        <label className="field grow"><span className="small">Description</span><input placeholder="e.g. Swiggy order" value={form.description} onChange={set('description')} required /></label>
        <label className="field"><span className="small">Amount</span><input type="number" min="0" step="0.01" value={form.amount} onChange={set('amount')} required /></label>
        <label className="field"><span className="small">Type</span>
          <select value={form.type} onChange={set('type')}><option value="expense">Expense</option><option value="income">Income</option></select>
        </label>
        <label className="field"><span className="small">Category</span>
          <select value={form.category} onChange={set('category')}>
            <option value="">Auto-detect</option>
            {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
        <button className="btn" type="submit">Add</button>
      </form>
    </section>
  );
}
