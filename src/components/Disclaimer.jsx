import { useState } from 'react';

export const DISCLAIMER_SHORT =
  'Budget Coach is an educational tool. It does not provide financial, investment, tax or legal advice.';

export function DisclaimerModal({ onAccept }) {
  const [checked, setChecked] = useState(false);
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="disclaimer-title">
      <div className="modal">
        <h2 id="disclaimer-title">Before you start</h2>
        <p><strong>This app is not financial advice.</strong></p>
        <ul>
          <li>Budget Coach helps you categorize spending, track savings goals and reflect on your habits. It is for educational and informational purposes only.</li>
          <li>Insights, including AI-generated ones, are produced automatically from the data you enter. They can be incomplete or wrong and are not personalised professional advice.</li>
          <li>Nothing here is a recommendation to buy, sell or hold any investment, insurance or credit product.</li>
          <li>For decisions about investing, debt, taxes or retirement, consult a qualified, licensed financial professional.</li>
          <li>Your data is stored only in this browser. When you request AI insights, an aggregated monthly summary (category totals, top merchants, budgets and goal progress - not your raw transaction list) is sent to the server to generate them.</li>
        </ul>
        <label className="checkbox">
          <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
          I understand that Budget Coach does not provide financial advice.
        </label>
        <button className="btn" disabled={!checked} onClick={onAccept}>Continue</button>
      </div>
    </div>
  );
}

export function DisclaimerBanner() {
  return (
    <footer className="disclaimer-banner" role="note">
      <strong>Not financial advice.</strong> {DISCLAIMER_SHORT} Consult a licensed professional before making financial decisions.
    </footer>
  );
}
