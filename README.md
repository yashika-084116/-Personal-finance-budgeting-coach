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
React version: data lives in your browser's `localStorage`. Streamlit version: data lives in the session and is cleared when you close the tab (use the backup download). Nothing is stored in a database. When you generate insights, only an **aggregated monthly summary** (category totals, top merchants, budgets, goal progress) is sent to the server — never the full transaction list.

## Two versions of the app

| Version | Files | Best for |
|---|---|---|
| **Streamlit (Python)** | `streamlit_app.py`, `coach/`, `requirements.txt` | Deploying free on **Streamlit Community Cloud** |
| **React + Node** | `src/`, `server/`, `package.json` | A custom web UI; deploy to Render, Railway, etc. |

Both have the same features and disclaimers. Streamlit Community Cloud only runs Python, so use the Streamlit version there.

## Run the Streamlit version locally (step by step)

1. **Install Python 3.10+** from https://www.python.org/downloads/ (on Windows, tick "Add Python to PATH").
2. **Get the code:**
   ```bash
   git clone https://github.com/yashika-084116/-Personal-finance-budgeting-coach.git
   cd -- -Personal-finance-budgeting-coach
   ```
   (`--` is needed because the folder name starts with a dash.)
3. **Create a virtual environment and install dependencies:**
   ```bash
   python -m venv .venv
   # macOS/Linux:
   source .venv/bin/activate
   # Windows (PowerShell):
   .venv\Scripts\Activate.ps1
   pip install -r requirements.txt
   ```
4. **(Optional) Turn on AI insights:** get an API key at https://console.anthropic.com, then copy
   `.streamlit/secrets.toml.example` to `.streamlit/secrets.toml` and put your key in it. Without a key the app
   still works and shows rule-based insights.
5. **Start the app:**
   ```bash
   streamlit run streamlit_app.py
   ```
   It opens at http://localhost:8501. Tick the disclaimer box, click **Continue**, then **Load sample data**.
6. **Run the tests (optional):** `python -m unittest discover -s tests -p "test_*.py"`

## Deploy on Streamlit Community Cloud (free)

1. Push this code to GitHub, on the branch you want to deploy (for example `main`).
2. Go to https://share.streamlit.io and sign in with GitHub.
3. Click **Create app** → **Deploy a public app from GitHub**.
4. Fill in:
   - **Repository:** `yashika-084116/-Personal-finance-budgeting-coach`
   - **Branch:** the branch with this code
   - **Main file path:** `streamlit_app.py`
5. (Optional, for AI insights) Open **Advanced settings** → **Secrets** and paste:
   ```toml
   ANTHROPIC_API_KEY = "sk-ant-your-key-here"
   ```
   You can also add or change this later under the app's **Settings → Secrets**.
6. Click **Deploy**. The first build takes a few minutes; you then get a public `https://<name>.streamlit.app` link.
   Every push to that branch redeploys the app automatically.

Never commit `.streamlit/secrets.toml`; it is already in `.gitignore`.

**Note on data:** in the Streamlit version, data is kept only while the browser tab is open. Use
**Download backup** in the sidebar to save it and **Restore backup** to load it again.

## Run the React + Node version locally

Requires **Node.js 20+**.

```bash
npm install
cp .env.example .env        # optional: add ANTHROPIC_API_KEY to enable AI insights
npm run dev                 # web app on http://localhost:5173, API on :3001
```

Open http://localhost:5173, accept the disclaimer and click **Load sample data** to explore.

Production build: `npm run build` then `npm start` (serves app and API on http://localhost:3001). Tests: `npm test`.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | Enables Claude-generated insights. Get one at https://console.anthropic.com. Streamlit: `.streamlit/secrets.toml` or Cloud Secrets. Node: `.env`. |
| `CLAUDE_MODEL` | `claude-opus-5-5` | Model used for insights. |
| `PORT` | `3001` | API / production server port. |

## Project structure

```
streamlit_app.py  Streamlit UI (Dashboard, Transactions, Goals, Insights tabs + disclaimer gate)
coach/            Python logic: finance.py (categorization, CSV, summaries, goals), insights.py (Claude + fallback), sample_data.py
requirements.txt  Python dependencies (used by Streamlit Cloud)
.streamlit/       Theme config and secrets example
server/
  index.js        Express API: GET /api/health, POST /api/insights; serves dist/ in production
  insights.js     Claude call (structured JSON output) + rule-based fallback + disclaimer text
src/
  lib/finance.js  Categorization rules, merchant learning, CSV parsing, monthly summaries, budgets, goal math
  lib/storage.js  localStorage persistence
  lib/sampleData.js  Demo transactions, goals and budgets
  components/     Dashboard, Transactions, Goals, Insights, Disclaimer, BarList chart
tests/            Unit tests (node:test for JS, unittest for Python)
samples/          Example bank-statement CSV
```

## How the AI insights work

1. The browser computes a summary for the selected month (`summarizeMonth`, `compareMonths`, `budgetStatus`, `goalProgress`).
2. `POST /api/insights` sends that summary to the server.
3. The server calls Claude with a system prompt that defines it as a budgeting coach with explicit boundaries (no investment/product/tax/legal advice, no invented numbers) and a JSON schema (`InsightsSchema`) so the response is always structured.
4. If no key is configured, the request fails, or the model declines, the server returns rule-based insights instead and the UI labels which source was used.
