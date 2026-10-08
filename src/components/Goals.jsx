import { useState } from 'react';
import { formatMoney, goalProgress } from '../lib/finance.js';
import { uid } from '../lib/storage.js';

const STATUS = {
  complete: ['✓ Complete', 'ok'],
  'on-track': ['✓ On track', 'ok'],
  behind: ['! Behind pace', 'near'],
  overdue: ['⚠ Past deadline', 'over'],
  'in-progress': ['In progress', 'neutral'],
  'not-started': ['Not started', 'neutral'],
};

export default function Goals({ state, update, currency }) {
  const money = (n) => formatMoney(n, currency);
  const setGoals = (fn) => update((s) => ({ goals: fn(s.goals) }));

  return (
    <div className="stack">
      <NewGoal onAdd={(g) => setGoals((gs) => [...gs, g])} />
      {state.goals.length === 0 && <p className="muted">No savings goals yet. Create one above to start tracking.</p>}
      <div className="goal-grid">
        {state.goals.map((g) => (
          <GoalCard
            key={g.id}
            goal={g}
            money={money}
            onContribute={(c) => setGoals((gs) => gs.map((x) => (x.id === g.id ? { ...x, contributions: [...x.contributions, c] } : x)))}
            onDelete={() => confirm(`Delete goal "${g.name}"?`) && setGoals((gs) => gs.filter((x) => x.id !== g.id))}
          />
        ))}
      </div>
    </div>
  );
}

function NewGoal({ onAdd }) {
  const [form, setForm] = useState({ name: '', target: '', deadline: '' });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const submit = (e) => {
    e.preventDefault();
    if (!form.name.trim() || !(Number(form.target) > 0)) return;
    onAdd({ id: uid(), name: form.name.trim(), target: Number(form.target), deadline: form.deadline || null, contributions: [] });
    setForm({ name: '', target: '', deadline: '' });
  };
  return (
    <section className="card">
      <h3>New savings goal</h3>
      <form className="add-form" onSubmit={submit}>
        <label className="field grow"><span className="small">Goal</span><input placeholder="e.g. Emergency fund" value={form.name} onChange={set('name')} required /></label>
        <label className="field"><span className="small">Target amount</span><input type="number" min="1" value={form.target} onChange={set('target')} required /></label>
        <label className="field"><span className="small">Target date (optional)</span><input type="date" value={form.deadline} onChange={set('deadline')} /></label>
        <button className="btn" type="submit">Create goal</button>
      </form>
    </section>
  );
}

function GoalCard({ goal, money, onContribute, onDelete }) {
  const p = goalProgress(goal);
  const [amount, setAmount] = useState('');
  const [label, tone] = STATUS[p.status];

  const add = (e) => {
    e.preventDefault();
    const n = Number(amount);
    if (!n) return;
    onContribute({ id: uid(), date: new Date().toISOString().slice(0, 10), amount: n });
    setAmount('');
  };

  return (
    <section className="card goal">
      <div className="row-between">
        <h3>{goal.name}</h3>
        <button className="icon-btn" onClick={onDelete} aria-label={`Delete ${goal.name}`}>✕</button>
      </div>
      <div className="row-between">
        <span className="tile-value">{money(p.saved)}</span>
        <span className="muted">of {money(goal.target)}</span>
      </div>
      <div className="progress big" role="progressbar" aria-valuenow={p.pct} aria-valuemin="0" aria-valuemax="100"><span style={{ width: `${p.pct}%` }} /></div>
      <div className="row-between small">
        <span className={`badge ${tone}`}>{label}</span>
        <span className="muted">{p.pct}% saved</span>
      </div>
      <dl className="facts">
        <div><dt>Remaining</dt><dd>{money(p.remaining)}</dd></div>
        <div><dt>Target date</dt><dd>{goal.deadline || '—'}</dd></div>
        <div><dt>Months left</dt><dd>{p.monthsLeft ?? '—'}</dd></div>
        <div><dt>Needed / month</dt><dd>{p.requiredMonthly != null ? money(p.requiredMonthly) : '—'}</dd></div>
        <div><dt>Your pace / month</dt><dd>{p.pace ? money(p.pace) : '—'}</dd></div>
      </dl>
      {p.status !== 'complete' && (
        <form className="row" onSubmit={add}>
          <input type="number" placeholder="Amount (negative to withdraw)" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <button className="btn" type="submit">Add</button>
        </form>
      )}
      {goal.contributions.length > 0 && (
        <details>
          <summary className="small">History ({goal.contributions.length})</summary>
          <ul className="plain small">
            {[...goal.contributions].reverse().map((c) => (
              <li key={c.id} className="row-between"><span>{c.date}</span><span>{c.amount > 0 ? '+' : ''}{money(c.amount)}</span></li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
