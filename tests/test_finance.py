"""Tests for the Python (Streamlit) port. Run: python -m pytest tests/  or  python -m unittest discover tests"""
import unittest

from coach.finance import (budget_status, categorize, compare_months, goal_progress, merchant_key, parse_csv,
                           summarize_month)
from coach.insights import generate_rule_insights


class FinanceTests(unittest.TestCase):
    def test_categorize_rules(self):
        self.assertEqual(categorize("SWIGGY ORDER 8812", -450)[0], "Dining")
        self.assertEqual(categorize("Uber Eats delivery", -300)[0], "Dining")
        self.assertEqual(categorize("Uber trip", -300)[0], "Transport")
        self.assertEqual(categorize("Salary credit", 50000)[0], "Income")
        self.assertEqual(categorize("OLA CABS", -200)[0], "Transport")
        self.assertNotEqual(categorize("Coca cola vending", -40)[0], "Transport")
        self.assertEqual(categorize("XYZ", -10), ("Other", "fallback"))

    def test_learned_override(self):
        learned = {merchant_key("Amazon purchase 123"): "Groceries"}
        self.assertEqual(categorize("AMAZON PURCHASE 999", -10, learned), ("Groceries", "learned"))

    def test_parse_csv_variants(self):
        txns, errors = parse_csv('Date,Description,Amount\n2026-09-01,"Rent, September",-18000\nbad,row,1')
        self.assertEqual([(t["description"], t["amount"]) for t in txns], [("Rent, September", -18000)])
        self.assertEqual(len(errors), 1)
        txns, _ = parse_csv('Txn Date,Narration,Withdrawal Amt,Deposit Amt\n05/09/2026,Zomato,"1,250.00",\n06/09/2026,Salary,,"65,000"')
        self.assertEqual([(t["date"], t["amount"]) for t in txns], [("2026-09-05", -1250), ("2026-09-06", 65000)])

    def test_summary_budget_compare(self):
        txns = [
            {"date": "2026-09-01", "description": "Salary", "amount": 1000, "category": "Income"},
            {"date": "2026-09-02", "description": "Swiggy", "amount": -200, "category": "Dining"},
            {"date": "2026-09-03", "description": "Rent", "amount": -500, "category": "Housing"},
            {"date": "2026-09-04", "description": "To savings", "amount": -100, "category": "Transfers"},
            {"date": "2026-08-04", "description": "Swiggy", "amount": -100, "category": "Dining"},
        ]
        s = summarize_month(txns, "2026-09")
        self.assertEqual((s["income"], s["spending"], s["savingsRate"]), (1000, 700, 30))
        cmp = compare_months(s, summarize_month(txns, "2026-08"))
        self.assertEqual(next(c for c in cmp if c["category"] == "Dining")["changePct"], 100)
        self.assertEqual(budget_status(s, {"Dining": 150})[0]["status"], "over")
        out = generate_rule_insights({"summary": s, "comparison": cmp, "budgets": [], "goals": []})
        self.assertIn("September 2026", out["headline"])

    def test_goal_progress(self):
        goal = {"target": 12000, "deadline": "2027-07-01",
                "contributions": [{"date": "2026-09-10", "amount": 1000}, {"date": "2026-10-01", "amount": 1000}]}
        p = goal_progress(goal, "2026-10-01")
        self.assertEqual((p["saved"], p["monthsLeft"], p["requiredMonthly"], p["status"]), (2000, 9, 1111.11, "behind"))
        self.assertEqual(goal_progress({**goal, "target": 2000}, "2026-10-01")["status"], "complete")


if __name__ == "__main__":
    unittest.main()
