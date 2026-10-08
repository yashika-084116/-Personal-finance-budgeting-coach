import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { formatMoney } from '../src/lib/finance.js';

export const DISCLAIMER =
  'These insights are generated automatically for educational and informational purposes only. ' +
  'They are not financial, investment, tax, or legal advice. Consult a qualified, licensed professional ' +
  'before making financial decisions.';

const MODEL = process.env.CLAUDE_MODEL || 'claude-opus-5-5';

export const InsightsSchema = z.object({
  headline: z.string().describe('One-sentence summary of the month'),
  highlights: z.array(z.string()).describe('2-4 notable observations about spending patterns'),
  suggestions: z
    .array(
      z.object({
        title: z.string(),
        detail: z.string(),
        estimatedMonthlySavings: z.number().describe('Rough monthly amount this could free up; 0 if not applicable'),
      }),
    )
    .describe('2-4 concrete, general budgeting habits to consider'),
  goalNotes: z.array(z.string()).describe('One short note per savings goal, or empty if no goals'),
});

const SYSTEM_PROMPT = `You are a friendly budgeting coach inside a personal finance app.
You receive an aggregated summary of one month of the user's transactions (no raw bank data),
their category budgets, and their savings goals. Write monthly insights that are specific to
the numbers given: cite categories, amounts and month-over-month changes.

Boundaries - you are an educational budgeting tool, not a financial advisor:
- Talk about budgeting habits, spending patterns and saving behaviour only.
- Do not recommend specific investments, securities, funds, crypto, insurance or loan products,
  and do not give tax or legal advice. If the data invites that, suggest consulting a licensed professional.
- Do not invent numbers that are not in the data. Keep the tone encouraging and non-judgmental.
- Use the currency given in the data.`;

let client;
export const aiEnabled = () => Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);

/** Ask Claude for structured insights. Throws on API errors so the caller can fall back. */
export async function generateAiInsights(payload) {
  client ??= new Anthropic();
  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    output_config: { effort: 'medium', format: zodOutputFormat(InsightsSchema) },
    // If a safety classifier declines, re-run on Anthropic's recommended fallback model.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: `Here is my data for ${payload.summary.month}:\n\n${JSON.stringify(payload, null, 2)}` }],
  });

  if (response.stop_reason === 'refusal') throw new Error('The model declined to generate insights for this data.');
  if (response.stop_reason === 'max_tokens') throw new Error('The insights response was cut off.');

  const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  return InsightsSchema.parse(JSON.parse(text));
}

/** Deterministic, rule-based insights used when no API key is configured or the API call fails. */
const monthName = (m) => {
  const [y, mo] = m.split('-').map(Number);
  return new Date(Date.UTC(y, mo - 1, 1)).toLocaleString('en', { month: 'long', year: 'numeric', timeZone: 'UTC' });
};

export function generateRuleInsights({ summary, comparison = [], budgets = [], goals = [], currency = 'INR' }) {
  const money = (n) => formatMoney(n, currency);
  const month = monthName(summary.month);
  const highlights = [];
  const suggestions = [];

  const top = summary.categories[0];
  if (top) highlights.push(`${top.category} was your largest spending category at ${money(top.total)} (${top.share}% of spending).`);

  if (summary.savingsRate != null) {
    highlights.push(
      summary.savingsRate >= 0
        ? `You kept ${summary.savingsRate}% of your income this month (${money(summary.net)}).`
        : `You spent ${money(-summary.net)} more than you earned this month.`,
    );
  }

  const rises = comparison.filter((c) => c.previous > 0 && c.change > 0 && (c.changePct ?? 0) >= 20).slice(0, 2);
  for (const r of rises) highlights.push(`${r.category} rose ${r.changePct}% vs last month (+${money(r.change)}).`);

  const drops = comparison.filter((c) => c.change < 0 && c.previous > 0).slice(0, 1);
  for (const d of drops) highlights.push(`Nice work: ${d.category} fell by ${money(-d.change)} compared with last month.`);

  for (const b of budgets.filter((b) => b.status !== 'ok').slice(0, 2)) {
    suggestions.push({
      title: `Review your ${b.category} budget`,
      detail: `You've used ${b.pct}% of your ${money(b.limit)} ${b.category} budget. Check recent ${b.category.toLowerCase()} transactions for anything you could pause or reduce.`,
      estimatedMonthlySavings: Math.max(Math.round(b.spent - b.limit), 0),
    });
  }

  const discretionary = summary.categories.filter((c) => ['Dining', 'Shopping', 'Entertainment'].includes(c.category));
  const discTotal = discretionary.reduce((s, c) => s + c.total, 0);
  if (discTotal > 0) {
    suggestions.push({
      title: 'Try a 10% trim on discretionary spending',
      detail: `Dining, shopping and entertainment came to ${money(discTotal)}. Setting a weekly cap for these could free up about ${money(discTotal * 0.1)} a month.`,
      estimatedMonthlySavings: Math.round(discTotal * 0.1),
    });
  }

  const subs = summary.categories.find((c) => c.category === 'Subscriptions');
  if (subs) {
    suggestions.push({
      title: 'Audit your subscriptions',
      detail: `Subscriptions cost ${money(subs.total)} this month. Cancel any you haven't used in the last 30 days.`,
      estimatedMonthlySavings: 0,
    });
  }

  if (summary.savingsRate != null && summary.savingsRate < 20) {
    suggestions.push({
      title: 'Automate a savings transfer',
      detail: 'Moving a fixed amount to savings right after payday makes saving the default instead of whatever is left over.',
      estimatedMonthlySavings: 0,
    });
  }

  const goalNotes = goals.map((g) => {
    if (g.status === 'complete') return `"${g.name}" is fully funded - congratulations!`;
    if (g.requiredMonthly == null) return `"${g.name}": ${money(g.remaining)} to go. Adding a target date helps plan monthly contributions.`;
    return `"${g.name}": ${money(g.remaining)} to go; about ${money(g.requiredMonthly)}/month needed${g.status === 'behind' ? ' - currently behind pace' : g.status === 'on-track' ? ' - on track' : ''}.`;
  });

  return {
    headline:
      summary.spending === 0
        ? `No spending recorded for ${month} yet.`
        : `In ${month} you earned ${money(summary.income)} and spent ${money(summary.spending)}.`,
    highlights,
    suggestions: suggestions.slice(0, 4),
    goalNotes,
  };
}
