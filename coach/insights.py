"""Monthly insights: Claude-generated when an API key is configured, rule-based otherwise."""

from __future__ import annotations

import json

import anthropic
from pydantic import BaseModel, Field

from .finance import format_money, month_label

DISCLAIMER = (
    "These insights are generated automatically for educational and informational purposes only. "
    "They are not financial, investment, tax, or legal advice. Consult a qualified, licensed professional "
    "before making financial decisions."
)

DEFAULT_MODEL = "claude-opus-5-5"


class Suggestion(BaseModel):
    title: str
    detail: str
    estimatedMonthlySavings: float = Field(description="Rough monthly amount this could free up; 0 if not applicable")


class Insights(BaseModel):
    headline: str = Field(description="One-sentence summary of the month")
    highlights: list[str] = Field(description="2-4 notable observations about spending patterns")
    suggestions: list[Suggestion] = Field(description="2-4 concrete, general budgeting habits to consider")
    goalNotes: list[str] = Field(description="One short note per savings goal, or empty if no goals")


SYSTEM_PROMPT = """You are a friendly budgeting coach inside a personal finance app.
You receive an aggregated summary of one month of the user's transactions (no raw bank data),
their category budgets, and their savings goals. Write monthly insights that are specific to
the numbers given: cite categories, amounts and month-over-month changes.

Boundaries - you are an educational budgeting tool, not a financial advisor:
- Talk about budgeting habits, spending patterns and saving behaviour only.
- Do not recommend specific investments, securities, funds, crypto, insurance or loan products,
  and do not give tax or legal advice. If the data invites that, suggest consulting a licensed professional.
- Do not invent numbers that are not in the data. Keep the tone encouraging and non-judgmental.
- Use the currency given in the data."""


class InsightsError(Exception):
    pass


def generate_ai_insights(payload: dict, api_key: str, model: str = DEFAULT_MODEL) -> dict:
    """Ask Claude for structured insights. Raises InsightsError so the caller can fall back."""
    client = anthropic.Anthropic(api_key=api_key)
    try:
        response = client.beta.messages.parse(
            model=model,
            max_tokens=16000,
            output_config={"effort": "medium"},
            output_format=Insights,
            # If a safety classifier declines, re-run on Anthropic's recommended fallback model.
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
            system=SYSTEM_PROMPT,
            messages=[{
                "role": "user",
                "content": f"Here is my data for {payload['summary']['month']}:\n\n{json.dumps(payload, indent=2)}",
            }],
        )
    except anthropic.AuthenticationError as e:
        raise InsightsError("invalid API key") from e
    except anthropic.RateLimitError as e:
        raise InsightsError("rate limited, try again shortly") from e
    except anthropic.APIStatusError as e:
        raise InsightsError(f"API error {e.status_code}") from e
    except anthropic.APIConnectionError as e:
        raise InsightsError("could not reach the Claude API") from e

    if response.stop_reason == "refusal":
        raise InsightsError("the model declined to generate insights for this data")
    if response.stop_reason == "max_tokens" or response.parsed_output is None:
        raise InsightsError("the insights response was incomplete")
    return response.parsed_output.model_dump()


def generate_rule_insights(payload: dict) -> dict:
    """Deterministic insights used when no API key is configured or the API call fails."""
    summary = payload["summary"]
    comparison = payload.get("comparison", [])
    budgets = payload.get("budgets", [])
    goals = payload.get("goals", [])
    currency = payload.get("currency", "INR")

    def money(n):
        return format_money(n, currency)

    month = month_label(summary["month"])
    highlights: list[str] = []
    suggestions: list[dict] = []

    if summary["categories"]:
        top = summary["categories"][0]
        highlights.append(f"{top['category']} was your largest spending category at {money(top['total'])} "
                          f"({top['share']}% of spending).")
    if summary["savingsRate"] is not None:
        highlights.append(
            f"You kept {summary['savingsRate']}% of your income this month ({money(summary['net'])})."
            if summary["savingsRate"] >= 0 else f"You spent {money(-summary['net'])} more than you earned this month."
        )
    for r in [c for c in comparison if c["previous"] > 0 and c["change"] > 0 and (c["changePct"] or 0) >= 20][:2]:
        highlights.append(f"{r['category']} rose {r['changePct']}% vs last month (+{money(r['change'])}).")
    for d in [c for c in comparison if c["change"] < 0 and c["previous"] > 0][:1]:
        highlights.append(f"Nice work: {d['category']} fell by {money(-d['change'])} compared with last month.")

    for b in [b for b in budgets if b["status"] != "ok"][:2]:
        suggestions.append({
            "title": f"Review your {b['category']} budget",
            "detail": f"You've used {b['pct']}% of your {money(b['limit'])} {b['category']} budget. Check recent "
                      f"{b['category'].lower()} transactions for anything you could pause or reduce.",
            "estimatedMonthlySavings": max(round(b["spent"] - b["limit"]), 0),
        })

    disc_total = sum(c["total"] for c in summary["categories"] if c["category"] in ("Dining", "Shopping", "Entertainment"))
    if disc_total > 0:
        suggestions.append({
            "title": "Try a 10% trim on discretionary spending",
            "detail": f"Dining, shopping and entertainment came to {money(disc_total)}. Setting a weekly cap for "
                      f"these could free up about {money(disc_total * 0.1)} a month.",
            "estimatedMonthlySavings": round(disc_total * 0.1),
        })
    subs = next((c for c in summary["categories"] if c["category"] == "Subscriptions"), None)
    if subs:
        suggestions.append({
            "title": "Audit your subscriptions",
            "detail": f"Subscriptions cost {money(subs['total'])} this month. Cancel any you haven't used in the last 30 days.",
            "estimatedMonthlySavings": 0,
        })
    if summary["savingsRate"] is not None and summary["savingsRate"] < 20:
        suggestions.append({
            "title": "Automate a savings transfer",
            "detail": "Moving a fixed amount to savings right after payday makes saving the default instead of "
                      "whatever is left over.",
            "estimatedMonthlySavings": 0,
        })

    goal_notes = []
    for g in goals:
        if g["status"] == "complete":
            goal_notes.append(f'"{g["name"]}" is fully funded - congratulations!')
        elif g["requiredMonthly"] is None:
            goal_notes.append(f'"{g["name"]}": {money(g["remaining"])} to go. Adding a target date helps plan monthly contributions.')
        else:
            pace = " - currently behind pace" if g["status"] == "behind" else " - on track" if g["status"] == "on-track" else ""
            goal_notes.append(f'"{g["name"]}": {money(g["remaining"])} to go; about {money(g["requiredMonthly"])}/month needed{pace}.')

    return {
        "headline": f"No spending recorded for {month} yet." if summary["spending"] == 0
        else f"In {month} you earned {money(summary['income'])} and spent {money(summary['spending'])}.",
        "highlights": highlights,
        "suggestions": suggestions[:4],
        "goalNotes": goal_notes,
    }
