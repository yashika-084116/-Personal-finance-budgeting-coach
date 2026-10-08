# Budget Coach — Personal Finance & Budgeting Coach

A web app that helps people understand where their money goes and build better saving habits.

> **Disclaimer:** Budget Coach is an educational tool. It does **not** provide financial, investment, tax or legal advice. Always consult a qualified, licensed professional before making financial decisions.

## Features

| Feature | What it does |
|---|---|
| **Spend categorization** | Transactions are auto-categorized into 14 categories (Groceries, Dining, Transport, Subscriptions, …) using keyword rules. When you change a category, the app **learns** that merchant: other transactions from it update, and future imports remember it. Each transaction shows whether its category is *Auto*, *Learned*, *Manual* or *Uncategorized*. |
| **CSV import** | Import a bank statement CSV with `date`, `description` and either a signed `amount` or separate `debit`/`credit` (`withdrawal`/`deposit`) columns. Handles `YYYY-MM-DD` and `DD/MM/YYYY` dates, quoted fields and `1,250.00`-style amounts. Try `samples/bank-statement.csv`. |
| **Dashboard & budgets** | Monthly income, spending, net saved and savings rate; spending-by-category chart with budget markers; biggest month-over-month changes; per-category monthly budgets with OK / near-limit / over status. |
| **Savings-goal tracking** | Create goals with a target and optional date, log contributions (or withdrawals). Shows progress, amount needed per month to hit the date, your actual monthly pace, and an on-track / behind status. |
| **AI-generated monthly insights** | Claude reviews the month's aggregated numbers and returns a headline, highlights, concrete suggestions with estimated savings, and notes on each goal. Without an API key (or if the API call fails) the app falls back to built-in rule-based insights with the same format. |
| **Clear disclaimer** | A first-run notice the user must acknowledge, a persistent "Not financial advice" footer, a notice on the Insights page, a disclaimer under every generated insight, and an AI system prompt that keeps Claude to budgeting habits (no investment, product, tax or legal recommendations). |

### Privacy
All data lives in your browser's `localStorage`. Nothing is stored on a server. When you generate insights, only an **aggregated monthly summary** (category totals, top merchants, budgets, goal progress) is sent to the server — never the full transaction list.

## Getting started

Requires **Node.js 20+**.

```bash
npm install
cp .env.example .env        # optional: add ANTHROPIC_API_KEY to enable AI insights
npm run dev                 # web app on http://localhost:5173, API on :3001
```

Open http://localhost:5173, accept the disclaimer and click **Load sample data** to explore.

### Production build

```bash
npm run build
npm start                   # serves the built app and API on http://localhost:3001
```

### Tests

```bash
npm test
```

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | Enables Claude-generated insights. Get one at https://console.anthropic.com. |
| `CLAUDE_MODEL` | `claude-opus-5-5` | Model used for insights. |
| `PORT` | `3001` | API / production server port. |

## Project structure

```
server/
  index.js        Express API: GET /api/health, POST /api/insights; serves dist/ in production
  insights.js     Claude call (structured JSON output) + rule-based fallback + disclaimer text
src/
  lib/finance.js  Categorization rules, merchant learning, CSV parsing, monthly summaries, budgets, goal math
  lib/storage.js  localStorage persistence
  lib/sampleData.js  Demo transactions, goals and budgets
  components/     Dashboard, Transactions, Goals, Insights, Disclaimer, BarList chart
tests/            Unit tests (node:test)
samples/          Example bank-statement CSV
```

## How the AI insights work

1. The browser computes a summary for the selected month (`summarizeMonth`, `compareMonths`, `budgetStatus`, `goalProgress`).
2. `POST /api/insights` sends that summary to the server.
3. The server calls Claude with a system prompt that defines it as a budgeting coach with explicit boundaries (no investment/product/tax/legal advice, no invented numbers) and a JSON schema (`InsightsSchema`) so the response is always structured.
4. If no key is configured, the request fails, or the model declines, the server returns rule-based insights instead and the UI labels which source was used.
