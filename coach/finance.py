"""Pure finance logic for the Streamlit app (a Python port of src/lib/finance.js)."""

from __future__ import annotations

import csv
import io
import re
from collections import defaultdict
from datetime import date, datetime

CATEGORIES = [
    "Income", "Housing", "Utilities", "Groceries", "Dining", "Transport", "Shopping",
    "Entertainment", "Subscriptions", "Health", "Education", "Travel", "Transfers", "Other",
]

# Keyword rules, checked in order. The first category with a matching keyword wins.
# A keyword must start at a word boundary ("ola" matches "OLA CABS" but not "coca cola").
DEFAULT_RULES: dict[str, list[str]] = {
    "Income": ["salary", "payroll", "stipend", "refund", "interest credit", "dividend", "freelance", "bonus"],
    "Housing": ["rent", "mortgage", "landlord", "maintenance charge", "property tax"],
    "Utilities": ["electric", "electricity", "water bill", "gas bill", "internet", "broadband", "wifi",
                  "mobile recharge", "recharge", "airtel", "jio", "vodafone", "phone bill"],
    "Subscriptions": ["netflix", "spotify", "prime video", "amazon prime", "hotstar", "youtube premium", "icloud",
                      "google one", "subscription", "apple music", "chatgpt", "claude"],
    "Groceries": ["grocery", "groceries", "supermarket", "bigbasket", "blinkit", "zepto", "dmart", "walmart",
                  "whole foods", "trader joe", "instamart", "kirana", "costco"],
    "Dining": ["restaurant", "cafe", "coffee", "starbucks", "swiggy", "zomato", "mcdonald", "kfc", "domino",
               "pizza", "burger", "uber eats", "doordash", "dining"],
    "Transport": ["uber", "ola", "rapido", "lyft", "metro", "fuel", "petrol", "diesel", "parking", "toll",
                  "bus ticket", "bus fare", "train ticket", "irctc", "cab"],
    "Shopping": ["amazon", "flipkart", "myntra", "ajio", "mall", "store", "clothing", "electronics", "ikea",
                 "target", "nykaa"],
    "Entertainment": ["movie", "cinema", "pvr", "inox", "bookmyshow", "concert", "game", "steam", "playstation", "xbox"],
    "Health": ["pharmacy", "medical", "hospital", "clinic", "doctor", "apollo", "gym", "fitness",
               "insurance premium", "dental", "medicine"],
    "Education": ["tuition", "course", "udemy", "coursera", "books", "college", "university", "exam fee", "school"],
    "Travel": ["flight", "airline", "indigo", "air india", "hotel", "airbnb", "makemytrip", "booking.com",
               "goibibo", "trip"],
    "Transfers": ["transfer to", "upi to self", "atm withdrawal", "atm", "credit card payment", "savings transfer",
                  "sip", "mutual fund"],
}

_RULE_PATTERNS = [
    (cat, [re.compile(r"(^|[^a-z0-9])" + re.escape(k)) for k in kws]) for cat, kws in DEFAULT_RULES.items()
]


def _normalize(s) -> str:
    return re.sub(r"\s+", " ", str(s or "").lower()).strip()


def merchant_key(description: str) -> str:
    """Strip reference numbers so 'SWIGGY ORDER 8812' and 'Swiggy order 1203' share a key."""
    s = re.sub(r"[0-9#*/\\-]+", " ", _normalize(description))
    s = re.sub(r"\b(upi|pos|ref|txn|neft|imps|order|payment|purchase)\b", " ", s)
    return " ".join(s.split()[:3])


def categorize(description: str, amount: float, learned: dict[str, str] | None = None) -> tuple[str, str]:
    """Return (category, source) where source is 'learned', 'rule' or 'fallback'."""
    learned = learned or {}
    key = merchant_key(description)
    if key and key in learned:
        return learned[key], "learned"
    text = _normalize(description)
    for category, patterns in _RULE_PATTERNS:
        if category == "Income" and amount < 0:
            continue  # income keywords only apply to money coming in
        if any(p.search(text) for p in patterns):
            return category, "rule"
    return ("Income" if amount > 0 else "Other"), "fallback"


# ---------- CSV import ----------

def _parse_amount(raw) -> float | None:
    if raw is None:
        return None
    s = str(raw).strip()
    if not s:
        return None
    negative = (s.startswith("(") and s.endswith(")")) or s.startswith("-")
    digits = re.sub(r"[^0-9.]", "", s)
    if not digits:
        return None
    try:
        n = float(digits)
    except ValueError:
        return None
    return -n if negative else n


def parse_date(raw) -> str | None:
    s = str(raw or "").strip()
    if re.match(r"^\d{4}-\d{2}-\d{2}", s):
        return s[:10]
    m = re.match(r"^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$", s)  # DD/MM/YYYY (common in Indian bank exports)
    if m:
        d, mo, y = m.groups()
        y = f"20{y}" if len(y) == 2 else y
        try:
            return date(int(y), int(mo), int(d)).isoformat()
        except ValueError:
            return None
    for fmt in ("%d %b %Y", "%b %d, %Y", "%d-%b-%Y"):
        try:
            return datetime.strptime(s, fmt).date().isoformat()
        except ValueError:
            pass
    return None


def parse_csv(text: str) -> tuple[list[dict], list[str]]:
    """Parse a bank-statement CSV. Accepts a signed 'amount' column or separate debit/credit columns."""
    rows = [r for r in csv.reader(io.StringIO(text)) if any(c.strip() for c in r)]
    if len(rows) < 2:
        return [], ["CSV needs a header row and at least one data row."]
    header = [_normalize(h) for h in rows[0]]

    def find(*names):
        return next((i for i, h in enumerate(header) if any(n in h for n in names)), -1)

    i_date = find("date")
    i_desc = find("description", "narration", "details", "merchant", "particulars", "memo")
    i_amount = find("amount")
    i_debit = find("debit", "withdrawal")
    i_credit = find("credit", "deposit")
    i_cat = find("category")
    if i_date < 0 or i_desc < 0 or (i_amount < 0 and i_debit < 0 and i_credit < 0):
        return [], ["Could not find the required columns. Expected: date, description, and amount (or debit/credit)."]

    def col(r, i):
        return r[i] if 0 <= i < len(r) else ""

    txns, errors = [], []
    for n, r in enumerate(rows[1:], start=2):
        d = parse_date(col(r, i_date))
        if i_amount >= 0:
            amount = _parse_amount(col(r, i_amount))
        else:
            debit = _parse_amount(col(r, i_debit)) or 0
            credit = _parse_amount(col(r, i_credit)) or 0
            amount = credit - abs(debit)
        if not d or not amount:
            errors.append(f"Row {n} skipped (invalid date or amount).")
            continue
        csv_cat = next((c for c in CATEGORIES if _normalize(c) == _normalize(col(r, i_cat))), None) if i_cat >= 0 else None
        txns.append({"date": d, "description": col(r, i_desc).strip() or "(no description)", "amount": amount,
                     "category": csv_cat})
    return txns, errors


# ---------- Summaries ----------

def month_of(iso: str) -> str:
    return iso[:7]


def list_months(txns: list[dict]) -> list[str]:
    return sorted({month_of(t["date"]) for t in txns}, reverse=True)


def previous_month(month: str) -> str:
    y, m = map(int, month.split("-"))
    return f"{y - 1}-12" if m == 1 else f"{y}-{m - 1:02d}"


def month_label(month: str) -> str:
    y, m = map(int, month.split("-"))
    return date(y, m, 1).strftime("%B %Y")


def summarize_month(txns: list[dict], month: str) -> dict:
    """Aggregate one month: income, spending, savings rate, per-category totals, top merchants."""
    rows = [t for t in txns if month_of(t["date"]) == month]
    income = spending = 0.0
    by_cat: dict[str, float] = defaultdict(float)
    merchants: dict[str, float] = defaultdict(float)
    for t in rows:
        if t["category"] == "Transfers":
            continue  # moving your own money is neither income nor spend
        if t["amount"] > 0:
            income += t["amount"]
        else:
            amt = -t["amount"]
            spending += amt
            by_cat[t["category"]] += amt
            merchants[merchant_key(t["description"]) or t["description"]] += amt
    categories = sorted(
        ({"category": c, "total": round(v, 2), "share": round(v / spending * 100, 2) if spending else 0}
         for c, v in by_cat.items()),
        key=lambda x: -x["total"],
    )
    top = sorted(({"merchant": k, "total": round(v, 2)} for k, v in merchants.items()), key=lambda x: -x["total"])[:5]
    return {
        "month": month,
        "transactionCount": len(rows),
        "income": round(income, 2),
        "spending": round(spending, 2),
        "net": round(income - spending, 2),
        "savingsRate": round((income - spending) / income * 100, 2) if income > 0 else None,
        "categories": categories,
        "topMerchants": top,
    }


def compare_months(current: dict, previous: dict | None) -> list[dict]:
    prev = {c["category"]: c["total"] for c in (previous or {}).get("categories", [])}
    cur = {c["category"]: c["total"] for c in current["categories"]}
    out = []
    for cat in set(prev) | set(cur):
        a, b = prev.get(cat, 0), cur.get(cat, 0)
        out.append({"category": cat, "previous": a, "current": b, "change": round(b - a, 2),
                    "changePct": round((b - a) / a * 100, 2) if a else None})
    return sorted(out, key=lambda x: -abs(x["change"]))


# ---------- Budgets & goals ----------

def budget_status(summary: dict, budgets: dict[str, float]) -> list[dict]:
    out = []
    for cat, limit in (budgets or {}).items():
        if not limit or limit <= 0:
            continue
        spent = next((c["total"] for c in summary["categories"] if c["category"] == cat), 0)
        pct = round(spent / limit * 100, 2)
        out.append({"category": cat, "limit": limit, "spent": spent, "pct": pct,
                    "status": "over" if pct >= 100 else "near" if pct >= 80 else "ok"})
    return sorted(out, key=lambda x: -x["pct"])


def months_between(from_iso: str, to_iso: str) -> int:
    a, b = date.fromisoformat(from_iso), date.fromisoformat(to_iso)
    return (b.year - a.year) * 12 + (b.month - a.month) + (0 if b.day >= a.day else -1)


def goal_progress(goal: dict, today: str | None = None) -> dict:
    """Progress for {target, deadline, contributions[]}: required monthly saving, pace and status."""
    today = today or date.today().isoformat()
    contribs = goal.get("contributions", [])
    saved = round(sum(c["amount"] for c in contribs), 2)
    target = goal["target"]
    remaining = round(max(target - saved, 0), 2)
    pct = min(round(saved / target * 100, 2), 100) if target > 0 else 0
    months_left = max(months_between(today, goal["deadline"]), 0) if goal.get("deadline") else None
    if months_left is None:
        required = None
    else:
        required = remaining if months_left == 0 else round(remaining / months_left, 2)
    months = {month_of(c["date"]) for c in contribs}
    pace = round(saved / len(months), 2) if months else 0

    if remaining == 0:
        status = "complete"
    elif months_left == 0:
        status = "overdue"
    elif saved > 0 and required is not None:
        status = "on-track" if pace >= required else "behind"
    elif saved > 0:
        status = "in-progress"
    else:
        status = "not-started"
    return {"saved": saved, "remaining": remaining, "pct": pct, "monthsLeft": months_left,
            "requiredMonthly": required, "pace": pace, "status": status}


CURRENCY_SYMBOLS = {"INR": "₹", "USD": "$", "EUR": "€", "GBP": "£"}


def format_money(n: float, currency: str = "INR") -> str:
    sym = CURRENCY_SYMBOLS.get(currency, currency + " ")
    sign = "-" if n < 0 else ""
    return f"{sign}{sym}{abs(n):,.0f}"
