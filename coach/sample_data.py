"""Three full months of demo data ending last month (mirrors src/lib/sampleData.js)."""

from __future__ import annotations

import re
import uuid
from datetime import date

TEMPLATE = [
    (1, "Salary credit - ACME Corp", 65000), (2, "Rent payment to landlord", -18000),
    (3, "BigBasket groceries", -2400), (4, "Netflix subscription", -649), (5, "Swiggy order", -480),
    (6, "Uber trip", -320), (7, "Electricity bill BESCOM", -1450), (8, "Airtel broadband", -799),
    (9, "Zomato order", -560), (10, "Amazon purchase", -2199), (11, "Starbucks coffee", -380),
    (12, "Apollo pharmacy", -640), (13, "Blinkit groceries", -1250), (14, "PVR cinema tickets", -900),
    (15, "Savings transfer to RD", -5000), (16, "Spotify premium", -119), (17, "Petrol fuel station", -2000),
    (18, "Myntra clothing", -1899), (19, "Swiggy order", -620), (20, "Gym membership fitness", -1500),
    (21, "Udemy course", -499), (22, "Zepto groceries", -980), (23, "Ola cab", -410),
    (24, "Restaurant dinner", -2200), (25, "Freelance payment received", 8000),
    (26, "Flipkart electronics", -3499), (27, "Swiggy order", -540),
]

# Later months spend more on dining and shopping, so month-over-month insights have something to say.
DRIFT = [
    {"dining": 0.8, "shopping": 0.7, "extra": []},
    {"dining": 1.0, "shopping": 1.0, "extra": [(22, "BookMyShow concert", -2500)]},
    {"dining": 1.35, "shopping": 1.4, "extra": [(12, "Zomato order", -720), (27, "IndiGo flight", -5400)]},
]
DINING = re.compile(r"swiggy|zomato|starbucks|restaurant", re.I)
SHOPPING = re.compile(r"amazon|myntra|flipkart", re.I)


def uid() -> str:
    return uuid.uuid4().hex[:12]


def _add_months(d: date, n: int) -> date:
    m = d.month - 1 + n
    return date(d.year + m // 12, m % 12 + 1, 1)


def sample_transactions(today: date | None = None) -> list[dict]:
    today = today or date.today()
    out = []
    for i, drift in enumerate(DRIFT):
        first = _add_months(today.replace(day=1), -(3 - i))
        for day, desc, amount in TEMPLATE + drift["extra"]:
            if DINING.search(desc):
                amount = round(amount * drift["dining"])
            elif SHOPPING.search(desc):
                amount = round(amount * drift["shopping"])
            out.append({"date": first.replace(day=day).isoformat(), "description": desc, "amount": amount})
    return out


def sample_goals(today: date | None = None) -> list[dict]:
    today = today or date.today()
    first = today.replace(day=1)

    def ago(n):
        return _add_months(first, -n).replace(day=15).isoformat()

    def ahead(n):
        return _add_months(first, n).replace(day=28).isoformat()

    return [
        {"id": uid(), "name": "Emergency fund", "target": 150000, "deadline": ahead(12),
         "contributions": [{"date": ago(n), "amount": 5000} for n in (2, 1, 0)]},
        {"id": uid(), "name": "New laptop", "target": 80000, "deadline": ahead(6),
         "contributions": [{"date": ago(1), "amount": 6000}]},
    ]


SAMPLE_BUDGETS = {"Dining": 3500, "Shopping": 5000, "Groceries": 6000, "Entertainment": 2000, "Transport": 3000}
