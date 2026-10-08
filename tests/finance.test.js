import { test } from 'node:test';
import assert from 'node:assert/strict';
import { categorize, merchantKey, parseCsv, summarizeMonth, goalProgress, budgetStatus, compareMonths } from '../src/lib/finance.js';
import { generateRuleInsights } from '../server/insights.js';

test('categorizes by keyword rules', () => {
  assert.equal(categorize({ description: 'SWIGGY ORDER 8812', amount: -450 }).category, 'Dining');
  assert.equal(categorize({ description: 'Uber Eats delivery', amount: -300 }).category, 'Dining');
  assert.equal(categorize({ description: 'Uber trip', amount: -300 }).category, 'Transport');
  assert.equal(categorize({ description: 'Salary credit', amount: 50000 }).category, 'Income');
  assert.equal(categorize({ description: 'Netflix', amount: -649 }).category, 'Subscriptions');
});

test('keywords respect word boundaries', () => {
  assert.equal(categorize({ description: 'OLA CABS', amount: -200 }).category, 'Transport');
  assert.notEqual(categorize({ description: 'Coca cola vending', amount: -40 }).category, 'Transport');
});

test('unknown merchants fall back by sign', () => {
  assert.deepEqual(categorize({ description: 'XYZ', amount: -10 }), { category: 'Other', source: 'fallback' });
  assert.deepEqual(categorize({ description: 'XYZ', amount: 10 }), { category: 'Income', source: 'fallback' });
});

test('learned merchant overrides rules', () => {
  const learned = { [merchantKey('Amazon purchase 123')]: 'Groceries' };
  assert.deepEqual(categorize({ description: 'AMAZON PURCHASE 999', amount: -10 }, learned), { category: 'Groceries', source: 'learned' });
});

test('parses CSV with signed amount and quoted fields', () => {
  const { transactions, errors } = parseCsv('Date,Description,Amount\n2026-09-01,"Rent, September",-18000\n2026-09-02,Salary,65000\nbad,row,1');
  assert.equal(transactions.length, 2);
  assert.equal(transactions[0].description, 'Rent, September');
  assert.equal(transactions[0].amount, -18000);
  assert.equal(errors.length, 1);
});

test('parses CSV with debit/credit columns and DD/MM/YYYY dates', () => {
  const { transactions } = parseCsv('Txn Date,Narration,Withdrawal Amt,Deposit Amt\n05/09/2026,Zomato,"1,250.00",\n06/09/2026,Salary,,"65,000"');
  assert.deepEqual(transactions.map((t) => [t.date, t.amount]), [['2026-09-05', -1250], ['2026-09-06', 65000]]);
});

test('summarizes a month and excludes transfers', () => {
  const txns = [
    { date: '2026-09-01', description: 'Salary', amount: 1000, category: 'Income' },
    { date: '2026-09-02', description: 'Swiggy', amount: -200, category: 'Dining' },
    { date: '2026-09-03', description: 'Rent', amount: -500, category: 'Housing' },
    { date: '2026-09-04', description: 'To savings', amount: -100, category: 'Transfers' },
    { date: '2026-08-04', description: 'Swiggy', amount: -100, category: 'Dining' },
  ];
  const s = summarizeMonth(txns, '2026-09');
  assert.equal(s.income, 1000);
  assert.equal(s.spending, 700);
  assert.equal(s.savingsRate, 30);
  assert.equal(s.categories[0].category, 'Housing');
  const cmp = compareMonths(s, summarizeMonth(txns, '2026-08'));
  assert.equal(cmp.find((c) => c.category === 'Dining').changePct, 100);
  assert.equal(budgetStatus(s, { Dining: 150 })[0].status, 'over');
});

test('goal progress computes required monthly saving and status', () => {
  const goal = { target: 12000, deadline: '2027-07-01', contributions: [{ date: '2026-09-10', amount: 1000 }, { date: '2026-10-01', amount: 1000 }] };
  const p = goalProgress(goal, '2026-10-01');
  assert.equal(p.saved, 2000);
  assert.equal(p.monthsLeft, 9);
  assert.equal(p.requiredMonthly, 1111.11);
  assert.equal(p.status, 'behind');
  assert.equal(goalProgress({ ...goal, target: 2000 }, '2026-10-01').status, 'complete');
});

test('rule-based insights produce the same shape as AI insights', () => {
  const summary = summarizeMonth([
    { date: '2026-09-01', description: 'Salary', amount: 1000, category: 'Income' },
    { date: '2026-09-02', description: 'Swiggy', amount: -300, category: 'Dining' },
  ], '2026-09');
  const out = generateRuleInsights({ summary, comparison: [], budgets: [], goals: [], currency: 'INR' });
  assert.ok(out.headline);
  assert.ok(out.highlights.length > 0);
  assert.ok(Array.isArray(out.suggestions));
  assert.deepEqual(out.goalNotes, []);
});
