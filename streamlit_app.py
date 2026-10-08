"""Budget Coach - Streamlit version.

Run locally:   streamlit run streamlit_app.py
Deploy:        Streamlit Community Cloud, main file = streamlit_app.py (see README).
"""

from __future__ import annotations

import json
import os
from datetime import date

import altair as alt
import pandas as pd
import streamlit as st

from coach.finance import (
    CATEGORIES, budget_status, categorize, compare_months, format_money, goal_progress, list_months,
    merchant_key, month_label, parse_csv, previous_month, summarize_month,
)
from coach.insights import DEFAULT_MODEL, DISCLAIMER, InsightsError, generate_ai_insights, generate_rule_insights
from coach.sample_data import SAMPLE_BUDGETS, sample_goals, sample_transactions, uid

st.set_page_config(page_title="Budget Coach", page_icon="📊", layout="wide")

SOURCE_LABEL = {"rule": "Auto", "learned": "Learned", "manual": "Manual", "fallback": "Uncategorized"}
GOAL_STATUS = {
    "complete": ("✅ Complete", "green"), "on-track": ("✅ On track", "green"), "behind": ("⚠️ Behind pace", "orange"),
    "overdue": ("⛔ Past deadline", "red"), "in-progress": ("In progress", "gray"), "not-started": ("Not started", "gray"),
}
ACCENT = "#2a78d6"
OVER = "#c0362f"

# ---------------------------------------------------------------- state

ss = st.session_state
ss.setdefault("transactions", [])
ss.setdefault("learned", {})
ss.setdefault("goals", [])
ss.setdefault("budgets", {})
ss.setdefault("currency", "INR")
ss.setdefault("accepted", False)
ss.setdefault("insights", {})  # month -> result


def get_secret(name: str) -> str | None:
    try:
        if name in st.secrets:
            return st.secrets[name]
    except Exception:  # no secrets.toml present
        pass
    return os.environ.get(name)


def money(n: float) -> str:
    return format_money(n, ss.currency)


def add_transactions(txns: list[dict]) -> None:
    for t in txns:
        if t.get("category"):
            cat, src = t["category"], "manual"
        else:
            cat, src = categorize(t["description"], t["amount"], ss.learned)
        ss.transactions.append({**t, "id": uid(), "category": cat, "source": src})


def recategorize(txn_id: str, category: str) -> None:
    """Changing one transaction teaches the app: same-merchant transactions (not set by hand) follow."""
    target = next(t for t in ss.transactions if t["id"] == txn_id)
    key = merchant_key(target["description"])
    if key:
        ss.learned[key] = category
    for t in ss.transactions:
        if t["id"] == txn_id:
            t["category"], t["source"] = category, "manual"
        elif key and t["source"] != "manual" and merchant_key(t["description"]) == key:
            t["category"], t["source"] = category, "learned"


def clear_widget_state() -> None:
    """Budget inputs keep their own widget state; drop it so new data shows up."""
    for k in [k for k in ss if str(k).startswith("budget-")]:
        del ss[k]


def load_sample() -> None:
    clear_widget_state()
    ss.transactions, ss.learned, ss.insights = [], {}, {}
    ss.goals, ss.budgets = sample_goals(), dict(SAMPLE_BUDGETS)
    add_transactions(sample_transactions())


# ---------------------------------------------------------------- disclaimer gate

def disclaimer_gate() -> None:
    st.title("📊 Budget Coach")
    st.subheader("Before you start")
    st.warning("**This app is not financial advice.**", icon="⚠️")
    st.markdown(
        """
- Budget Coach helps you categorize spending, track savings goals and reflect on your habits. It is for
  **educational and informational purposes only**.
- Insights, including AI-generated ones, are produced automatically from the data you enter. They can be
  incomplete or wrong and are not personalised professional advice.
- Nothing here is a recommendation to buy, sell or hold any investment, insurance or credit product.
- For decisions about investing, debt, taxes or retirement, consult a **qualified, licensed financial professional**.
- Your data lives only in this browser session. When you request AI insights, an aggregated monthly summary
  (category totals, top merchants, budgets and goal progress - not your transaction list) is sent to the
  Claude API to generate them.
"""
    )
    ok = st.checkbox("I understand that Budget Coach does not provide financial advice.")
    if st.button("Continue", type="primary", disabled=not ok):
        ss.accepted = True
        st.rerun()


def footer() -> None:
    st.divider()
    st.caption(
        "**Not financial advice.** Budget Coach is an educational tool. It does not provide financial, investment, "
        "tax or legal advice. Consult a licensed professional before making financial decisions."
    )


# ---------------------------------------------------------------- sidebar

def sidebar(months: list[str]) -> str | None:
    with st.sidebar:
        st.header("📊 Budget Coach")
        st.caption("Personal finance & budgeting coach")
        ss.currency = st.selectbox("Currency", ["INR", "USD", "EUR", "GBP"], index=["INR", "USD", "EUR", "GBP"].index(ss.currency))
        month = st.selectbox("Month", months, format_func=month_label) if months else None

        st.button("Load sample data", on_click=load_sample, width="stretch")

        st.subheader("Save / restore")
        st.caption("Data is kept only while this tab is open. Download a backup to keep it.")
        backup = {k: ss[k] for k in ("transactions", "learned", "goals", "budgets", "currency")}
        st.download_button("Download backup (.json)", json.dumps(backup, indent=2), "budget-coach-backup.json",
                           "application/json", width="stretch")
        restore = st.file_uploader("Restore backup", type="json", key="restore")
        if restore is not None and st.button("Restore", width="stretch"):
            data = json.load(restore)
            for k in ("transactions", "learned", "goals", "budgets", "currency"):
                if k in data:
                    ss[k] = data[k]
            ss.insights = {}
            clear_widget_state()
            st.rerun()

        if st.button("Reset all data", width="stretch"):
            for k, v in (("transactions", []), ("learned", {}), ("goals", []), ("budgets", {}), ("insights", {})):
                ss[k] = v
            clear_widget_state()
            st.rerun()

        st.divider()
        st.caption("AI insights: " + ("✅ enabled" if get_secret("ANTHROPIC_API_KEY") else "⚪ off (rule-based fallback)"))
        st.info("Not financial advice - educational use only.", icon="ℹ️")
    return month


# ---------------------------------------------------------------- dashboard

def category_chart(summary: dict) -> alt.Chart:
    rows = []
    for c in summary["categories"]:
        limit = ss.budgets.get(c["category"])
        rows.append({"Category": c["category"], "Spent": c["total"], "Budget": limit,
                     "Status": "Over budget" if limit and c["total"] > limit else "Within budget / no budget",
                     "Label": money(c["total"])})
    df = pd.DataFrame(rows)
    order = df["Category"].tolist()
    base = alt.Chart(df).encode(y=alt.Y("Category:N", sort=order, title=None))
    bars = base.mark_bar(cornerRadiusEnd=4, height=14).encode(
        x=alt.X("Spent:Q", title=f"Spent ({ss.currency})"),
        color=alt.Color("Status:N", scale=alt.Scale(domain=["Within budget / no budget", "Over budget"], range=[ACCENT, OVER]),
                        legend=alt.Legend(orient="bottom", title=None)),
        tooltip=[alt.Tooltip("Category:N"), alt.Tooltip("Spent:Q", format=",.0f"), alt.Tooltip("Budget:Q", format=",.0f")],
    )
    ticks = base.transform_filter("datum.Budget > 0").mark_tick(thickness=2, size=22, color="gray").encode(
        x="Budget:Q", tooltip=[alt.Tooltip("Budget:Q", format=",.0f")]
    )
    return (bars + ticks).properties(height=max(36 * len(df), 120))


def dashboard(month: str) -> None:
    summary = summarize_month(ss.transactions, month)
    prev = summarize_month(ss.transactions, previous_month(month))
    st.header(f"Overview · {month_label(month)}")

    c1, c2, c3, c4 = st.columns(4)
    c1.metric("Income", money(summary["income"]))
    c2.metric("Spending", money(summary["spending"]),
              delta=f"{money(summary['spending'] - prev['spending'])} vs last month" if prev["spending"] else None,
              delta_color="inverse")
    c3.metric("Net saved", money(summary["net"]))
    c4.metric("Savings rate", "—" if summary["savingsRate"] is None else f"{summary['savingsRate']}%")

    left, right = st.columns([3, 2], gap="large")
    with left:
        st.subheader("Spending by category")
        if summary["categories"]:
            st.altair_chart(category_chart(summary), width="stretch")
            st.caption("Grey ticks mark your budget. Transfers are excluded.")
        else:
            st.info("No spending this month.")
    with right:
        st.subheader(f"Biggest changes vs {month_label(previous_month(month))}")
        changes = [c for c in compare_months(summary, prev if prev["transactionCount"] else None) if c["previous"] > 0][:3]
        if changes:
            for c in changes:
                arrow = "🔺" if c["change"] > 0 else "🔻"
                pct = f" ({c['changePct']:+}%)" if c["changePct"] is not None else ""
                st.markdown(f"{arrow} **{c['category']}**: {money(abs(c['change']))}{pct}")
        else:
            st.caption("No previous month to compare yet.")

        st.subheader("Savings goals")
        if ss.goals:
            for g in ss.goals:
                p = goal_progress(g)
                st.progress(p["pct"] / 100, text=f"{g['name']} · {p['pct']}%")
        else:
            st.caption("No goals yet - add one in the Goals tab.")

    st.subheader("Monthly budgets")
    status = budget_status(summary, ss.budgets)
    if status:
        badge = {"over": "⛔ Over", "near": "⚠️ Near limit", "ok": "✅ OK"}
        st.dataframe(
            pd.DataFrame([{"Category": b["category"], "Status": badge[b["status"]], "Spent": money(b["spent"]),
                           "Budget": money(b["limit"]), "Used": f"{b['pct']}%"} for b in status]),
            hide_index=True, width="stretch",
        )
    with st.expander("Edit budgets"):
        cols = st.columns(4)
        for i, cat in enumerate([c for c in CATEGORIES if c not in ("Income", "Transfers")]):
            val = cols[i % 4].number_input(cat, min_value=0, step=100, value=int(ss.budgets.get(cat, 0)), key=f"budget-{cat}",
                                           help="0 = no limit")
            if val > 0:
                ss.budgets[cat] = val
            else:
                ss.budgets.pop(cat, None)


# ---------------------------------------------------------------- transactions

def transactions(month: str | None) -> None:
    st.header("Transactions")
    with st.form("add", clear_on_submit=True):
        st.subheader("Add a transaction")
        c = st.columns([1.2, 3, 1.2, 1.2, 1.6])
        d = c[0].date_input("Date", value=date.today())
        desc = c[1].text_input("Description", placeholder="e.g. Swiggy order")
        amt = c[2].number_input("Amount", min_value=0.0, step=10.0)
        kind = c[3].selectbox("Type", ["Expense", "Income"])
        cat = c[4].selectbox("Category", ["Auto-detect"] + CATEGORIES)
        if st.form_submit_button("Add", type="primary"):
            if desc.strip() and amt > 0:
                add_transactions([{"date": d.isoformat(), "description": desc.strip(),
                                   "amount": -amt if kind == "Expense" else amt,
                                   "category": None if cat == "Auto-detect" else cat}])
                st.success("Transaction added.")
            else:
                st.error("Enter a description and an amount above 0.")

    st.subheader("Import bank statement (CSV)")
    st.caption("Needs `date`, `description` and either a signed `amount` or separate `debit`/`credit` columns. "
               "An optional `category` column is respected.")
    up = st.file_uploader("CSV file", type="csv", label_visibility="collapsed")
    if up is not None and st.button("Import CSV"):
        txns, errors = parse_csv(up.getvalue().decode("utf-8-sig", errors="replace"))
        add_transactions(txns)
        (st.success if txns else st.error)(f"Imported {len(txns)} transaction(s). " + " ".join(errors[:3]))

    if not ss.transactions or not month:
        return

    st.subheader(f"{month_label(month)}")
    st.caption("Change a category to teach the coach: other transactions from the same merchant update too, "
               "and future imports remember it.")
    c1, c2 = st.columns(2)
    flt = c1.selectbox("Filter by category", ["All"] + CATEGORIES)
    q = c2.text_input("Search", placeholder="Search descriptions…")
    rows = [t for t in ss.transactions if t["date"][:7] == month
            and (flt == "All" or t["category"] == flt) and q.lower() in t["description"].lower()]
    rows.sort(key=lambda t: t["date"], reverse=True)
    if not rows:
        st.caption("No transactions match.")
        return

    df = pd.DataFrame([{"id": t["id"], "Date": t["date"], "Description": t["description"], "Amount": t["amount"],
                        "Category": t["category"], "How": SOURCE_LABEL.get(t["source"], ""), "Delete": False} for t in rows])
    edited = st.data_editor(
        df, hide_index=True, width="stretch", key=f"editor-{month}-{flt}-{q}",
        column_config={
            "id": None,
            "Amount": st.column_config.NumberColumn(format="%.0f"),
            "Category": st.column_config.SelectboxColumn(options=CATEGORIES, required=True),
            "How": st.column_config.TextColumn(help="Auto = keyword rule, Learned = from your edits, Manual = set by you"),
            "Delete": st.column_config.CheckboxColumn(),
        },
        disabled=["Date", "Description", "Amount", "How"],
    )
    changed = False
    for before, after in zip(df.to_dict("records"), edited.to_dict("records")):
        if after["Category"] != before["Category"]:
            recategorize(before["id"], after["Category"])
            changed = True
    to_delete = {r["id"] for r in edited.to_dict("records") if r["Delete"]}
    if to_delete:
        ss.transactions = [t for t in ss.transactions if t["id"] not in to_delete]
        changed = True
    if changed:
        st.rerun()


# ---------------------------------------------------------------- goals

def goals() -> None:
    st.header("Savings goals")
    with st.form("new-goal", clear_on_submit=True):
        st.subheader("New savings goal")
        c = st.columns([3, 1.5, 1.5])
        name = c[0].text_input("Goal", placeholder="e.g. Emergency fund")
        target = c[1].number_input("Target amount", min_value=0.0, step=1000.0)
        has_deadline = st.checkbox("Set a target date", value=True)
        deadline = c[2].date_input("Target date", value=date(date.today().year + 1, date.today().month, 1))
        if st.form_submit_button("Create goal", type="primary"):
            if name.strip() and target > 0:
                ss.goals.append({"id": uid(), "name": name.strip(), "target": target,
                                 "deadline": deadline.isoformat() if has_deadline else None, "contributions": []})
            else:
                st.error("Enter a goal name and a target above 0.")

    if not ss.goals:
        st.info("No savings goals yet. Create one above to start tracking.")
        return

    cols = st.columns(2)
    for i, g in enumerate(list(ss.goals)):
        p = goal_progress(g)
        label, color = GOAL_STATUS[p["status"]]
        with cols[i % 2].container(border=True):
            st.subheader(g["name"])
            st.markdown(f"**{money(p['saved'])}** of {money(g['target'])} · :{color}[{label}]")
            st.progress(p["pct"] / 100, text=f"{p['pct']}% saved")
            m1, m2, m3 = st.columns(3)
            m1.metric("Remaining", money(p["remaining"]))
            m2.metric("Needed / month", money(p["requiredMonthly"]) if p["requiredMonthly"] is not None else "—")
            m3.metric("Your pace / month", money(p["pace"]) if p["pace"] else "—")
            st.caption(f"Target date: {g['deadline'] or '—'} · Months left: {p['monthsLeft'] if p['monthsLeft'] is not None else '—'}")
            with st.form(f"contrib-{g['id']}", clear_on_submit=True):
                a, b = st.columns([3, 1])
                amt = a.number_input("Add contribution (negative to withdraw)", step=500.0, key=f"amt-{g['id']}")
                if b.form_submit_button("Add") and amt:
                    g["contributions"].append({"date": date.today().isoformat(), "amount": amt})
                    st.rerun()
            if g["contributions"]:
                with st.expander(f"History ({len(g['contributions'])})"):
                    for c in reversed(g["contributions"]):
                        st.text(f"{c['date']}   {'+' if c['amount'] > 0 else ''}{money(c['amount'])}")
            if st.button("Delete goal", key=f"del-{g['id']}"):
                ss.goals = [x for x in ss.goals if x["id"] != g["id"]]
                st.rerun()


# ---------------------------------------------------------------- insights

def build_payload(month: str) -> dict:
    """Only aggregates are sent to the model - never the raw transaction list."""
    summary = summarize_month(ss.transactions, month)
    prev = summarize_month(ss.transactions, previous_month(month))
    has_prev = prev["transactionCount"] > 0
    return {
        "currency": ss.currency,
        "summary": summary,
        "previousMonth": {k: prev[k] for k in ("month", "income", "spending", "savingsRate")} if has_prev else None,
        "comparison": compare_months(summary, prev if has_prev else None),
        "budgets": budget_status(summary, ss.budgets),
        "goals": [{"name": g["name"], "target": g["target"], "deadline": g["deadline"], **goal_progress(g)} for g in ss.goals],
    }


def insights(month: str) -> None:
    st.header(f"Monthly insights · {month_label(month)}")
    st.warning(
        "**Not financial advice.** Insights are generated automatically (by AI when configured) from your own data, "
        "for educational purposes only. They may be inaccurate and are not a substitute for advice from a licensed "
        "financial professional.", icon="⚠️",
    )
    payload = build_payload(month)
    st.write(f"{payload['summary']['transactionCount']} transactions, {money(payload['summary']['spending'])} spent.")
    st.caption("Sent to the Claude API: category totals, top merchants, budgets and goal progress. "
               "Your individual transactions are not sent.")

    if st.button("Generate insights", type="primary", disabled=not payload["summary"]["transactionCount"]):
        api_key = get_secret("ANTHROPIC_API_KEY")
        result = {"source": "rules", "notice": "No ANTHROPIC_API_KEY configured; showing rule-based insights."}
        if api_key:
            with st.spinner("Asking Claude for insights…"):
                try:
                    result = {"source": "ai", "insights": generate_ai_insights(
                        payload, api_key, get_secret("CLAUDE_MODEL") or DEFAULT_MODEL)}
                except InsightsError as e:
                    result = {"source": "rules", "notice": f"AI insights unavailable ({e}); showing rule-based insights instead."}
        if result["source"] == "rules":
            result["insights"] = generate_rule_insights(payload)
        ss.insights[month] = result

    result = ss.insights.get(month)
    if not result:
        return
    ins = result["insights"]
    st.caption(("✦ AI-generated" if result["source"] == "ai" else "Rule-based") + (f" · {result['notice']}" if result.get("notice") else ""))
    with st.container(border=True):
        st.subheader(ins["headline"])
        for h in ins["highlights"]:
            st.markdown(f"- {h}")
    if ins["suggestions"]:
        st.subheader("Ideas to consider")
        cols = st.columns(min(len(ins["suggestions"]), 2))
        for i, s in enumerate(ins["suggestions"]):
            with cols[i % len(cols)].container(border=True):
                st.markdown(f"**{s['title']}**")
                st.write(s["detail"])
                if s["estimatedMonthlySavings"] > 0:
                    st.markdown(f":green[≈ {money(s['estimatedMonthlySavings'])}/month]")
    if ins["goalNotes"]:
        st.subheader("Savings goals")
        for n in ins["goalNotes"]:
            st.markdown(f"- {n}")
    st.caption(DISCLAIMER)


# ---------------------------------------------------------------- main

if not ss.accepted:
    disclaimer_gate()
    footer()
    st.stop()

months = list_months(ss.transactions)
month = sidebar(months)

tab_dash, tab_txn, tab_goals, tab_ins = st.tabs(["Dashboard", "Transactions", "Goals", "Insights"])
if not ss.transactions:
    with tab_dash:
        st.header("Get started")
        st.write("Add transactions or import a bank-statement CSV in the **Transactions** tab, "
                 "or click **Load sample data** in the sidebar to explore.")
        st.button("Load sample data", on_click=load_sample, type="primary", key="sample-main")
    with tab_ins:
        st.info("Add some transactions first.")
else:
    with tab_dash:
        dashboard(month)
    with tab_ins:
        insights(month)
with tab_txn:
    transactions(month)
with tab_goals:
    goals()

footer()
