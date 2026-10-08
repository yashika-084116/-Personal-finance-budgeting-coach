// Pure finance logic shared by the React client and the Node server.
// No DOM or Node APIs here so both sides (and the tests) can import it.

export const CATEGORIES = [
  'Income',
  'Housing',
  'Utilities',
  'Groceries',
  'Dining',
  'Transport',
  'Shopping',
  'Entertainment',
  'Subscriptions',
  'Health',
  'Education',
  'Travel',
  'Transfers',
  'Other',
];

// Keyword rules, checked in order. The first category with a matching keyword wins.
// A keyword must start at a word boundary ("ola" matches "OLA CABS" but not "coca cola").
export const DEFAULT_RULES = {
  Income: ['salary', 'payroll', 'stipend', 'refund', 'interest credit', 'dividend', 'freelance', 'bonus'],
  Housing: ['rent', 'mortgage', 'landlord', 'maintenance charge', 'property tax'],
  Utilities: ['electric', 'electricity', 'water bill', 'gas bill', 'internet', 'broadband', 'wifi', 'mobile recharge', 'recharge', 'airtel', 'jio', 'vodafone', 'phone bill'],
  Subscriptions: ['netflix', 'spotify', 'prime video', 'amazon prime', 'hotstar', 'youtube premium', 'icloud', 'google one', 'subscription', 'apple music', 'chatgpt', 'claude'],
  Groceries: ['grocery', 'groceries', 'supermarket', 'bigbasket', 'blinkit', 'zepto', 'dmart', 'walmart', 'whole foods', 'trader joe', 'instamart', 'kirana', 'costco'],
  Dining: ['restaurant', 'cafe', 'coffee', 'starbucks', 'swiggy', 'zomato', 'mcdonald', 'kfc', 'domino', 'pizza', 'burger', 'uber eats', 'doordash', 'dining'],
  Transport: ['uber', 'ola', 'rapido', 'lyft', 'metro', 'fuel', 'petrol', 'diesel', 'parking', 'toll', 'bus ticket', 'bus fare', 'train ticket', 'irctc', 'cab'],
  Shopping: ['amazon', 'flipkart', 'myntra', 'ajio', 'mall', 'store', 'clothing', 'electronics', 'ikea', 'target', 'nykaa'],
  Entertainment: ['movie', 'cinema', 'pvr', 'inox', 'bookmyshow', 'concert', 'game', 'steam', 'playstation', 'xbox'],
  Health: ['pharmacy', 'medical', 'hospital', 'clinic', 'doctor', 'apollo', 'gym', 'fitness', 'insurance premium', 'dental', 'medicine'],
  Education: ['tuition', 'course', 'udemy', 'coursera', 'books', 'college', 'university', 'exam fee', 'school'],
  Travel: ['flight', 'airline', 'indigo', 'air india', 'hotel', 'airbnb', 'makemytrip', 'booking.com', 'goibibo', 'trip'],
  Transfers: ['transfer to', 'upi to self', 'atm withdrawal', 'atm', 'credit card payment', 'savings transfer', 'sip', 'mutual fund'],
};

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const RULE_PATTERNS = Object.entries(DEFAULT_RULES).map(([category, keywords]) => [
  category,
  keywords.map((k) => new RegExp(`(^|[^a-z0-9])${escapeRe(k)}`)),
]);

const normalize = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();

// A "merchant key" lets the app remember a user's manual re-categorization:
// strip digits/reference numbers so "SWIGGY ORDER 8812" and "Swiggy order 1203" match.
export function merchantKey(description) {
  return normalize(description)
    .replace(/[0-9#*/\\-]+/g, ' ')
    .replace(/\b(upi|pos|ref|txn|neft|imps|order|payment|purchase)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .slice(0, 3)
    .join(' ');
}

/**
 * Categorize a transaction.
 * @param {{description: string, amount: number}} txn  amount > 0 is income, < 0 is spending
 * @param {Record<string,string>} learned  merchantKey -> category, from the user's manual edits
 * @returns {{category: string, source: 'learned'|'rule'|'fallback'}}
 */
export function categorize(txn, learned = {}) {
  const key = merchantKey(txn.description);
  if (key && learned[key]) return { category: learned[key], source: 'learned' };

  const text = normalize(txn.description);
  for (const [category, patterns] of RULE_PATTERNS) {
    // Income keywords only apply to money coming in.
    if (category === 'Income' && txn.amount < 0) continue;
    if (patterns.some((re) => re.test(text))) return { category, source: 'rule' };
  }
  return { category: txn.amount > 0 ? 'Income' : 'Other', source: 'fallback' };
}

// ---------- CSV import ----------

function splitCsvLine(line) {
  const out = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function parseAmount(raw) {
  if (raw == null) return NaN;
  let s = String(raw).trim();
  const negative = /^\(.*\)$/.test(s) || s.startsWith('-');
  s = s.replace(/[^0-9.]/g, '');
  const n = parseFloat(s);
  return negative ? -n : n;
}

export function parseDate(raw) {
  const s = String(raw || '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  // DD/MM/YYYY or DD-MM-YYYY (common for Indian bank exports)
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (m) {
    const [, d, mo, y] = m;
    const year = y.length === 2 ? `20${y}` : y;
    return `${year}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : new Date(t).toISOString().slice(0, 10);
}

/**
 * Parse a bank-statement style CSV. Accepts either a signed "amount" column,
 * or separate "debit"/"credit" (or "withdrawal"/"deposit") columns.
 * Returns { transactions, errors }.
 */
export function parseCsv(text) {
  const lines = String(text).split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { transactions: [], errors: ['CSV needs a header row and at least one data row.'] };

  const header = splitCsvLine(lines[0]).map(normalize);
  const find = (...names) => header.findIndex((h) => names.some((n) => h.includes(n)));
  const iDate = find('date');
  const iDesc = find('description', 'narration', 'details', 'merchant', 'particulars', 'memo');
  const iAmount = find('amount');
  const iDebit = find('debit', 'withdrawal');
  const iCredit = find('credit', 'deposit');
  const iCat = find('category');

  if (iDate < 0 || iDesc < 0 || (iAmount < 0 && iDebit < 0 && iCredit < 0)) {
    return {
      transactions: [],
      errors: ['Could not find the required columns. Expected: date, description, and amount (or debit/credit).'],
    };
  }

  const transactions = [];
  const errors = [];
  lines.slice(1).forEach((line, idx) => {
    const cols = splitCsvLine(line);
    const date = parseDate(cols[iDate]);
    let amount;
    if (iAmount >= 0) amount = parseAmount(cols[iAmount]);
    else {
      const debit = parseAmount(cols[iDebit]);
      const credit = parseAmount(cols[iCredit]);
      amount = (Number.isNaN(credit) ? 0 : credit) - (Number.isNaN(debit) ? 0 : Math.abs(debit));
    }
    if (!date || Number.isNaN(amount) || amount === 0) {
      errors.push(`Row ${idx + 2} skipped (invalid date or amount).`);
      return;
    }
    const csvCategory = iCat >= 0 ? CATEGORIES.find((c) => normalize(c) === normalize(cols[iCat])) : undefined;
    transactions.push({ date, description: cols[iDesc] || '(no description)', amount, category: csvCategory });
  });
  return { transactions, errors };
}

// ---------- Summaries ----------

export const monthOf = (isoDate) => isoDate.slice(0, 7); // "YYYY-MM"

export function listMonths(transactions) {
  return [...new Set(transactions.map((t) => monthOf(t.date)))].sort().reverse();
}

const round2 = (n) => Math.round(n * 100) / 100;

/** Aggregate one month: income, spending, savings rate, per-category totals, top merchants. */
export function summarizeMonth(transactions, month) {
  const txns = transactions.filter((t) => monthOf(t.date) === month);
  let income = 0;
  let spending = 0;
  const byCategory = {};
  const merchants = {};
  for (const t of txns) {
    if (t.category === 'Transfers') continue; // moving your own money is neither income nor spend
    if (t.amount > 0) income += t.amount;
    else {
      const amt = -t.amount;
      spending += amt;
      byCategory[t.category] = (byCategory[t.category] || 0) + amt;
      const key = merchantKey(t.description) || t.description;
      merchants[key] = (merchants[key] || 0) + amt;
    }
  }
  const categories = Object.entries(byCategory)
    .map(([category, total]) => ({ category, total: round2(total), share: spending ? round2((total / spending) * 100) : 0 }))
    .sort((a, b) => b.total - a.total);
  const topMerchants = Object.entries(merchants)
    .map(([merchant, total]) => ({ merchant, total: round2(total) }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);
  return {
    month,
    transactionCount: txns.length,
    income: round2(income),
    spending: round2(spending),
    net: round2(income - spending),
    savingsRate: income > 0 ? round2(((income - spending) / income) * 100) : null,
    categories,
    topMerchants,
  };
}

export function previousMonth(month) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return d.toISOString().slice(0, 7);
}

/** Category-level change vs. the previous month (only categories present in either month). */
export function compareMonths(current, previous) {
  const prev = Object.fromEntries((previous?.categories || []).map((c) => [c.category, c.total]));
  const cur = Object.fromEntries(current.categories.map((c) => [c.category, c.total]));
  const names = new Set([...Object.keys(prev), ...Object.keys(cur)]);
  return [...names]
    .map((category) => {
      const a = prev[category] || 0;
      const b = cur[category] || 0;
      return { category, previous: a, current: b, change: round2(b - a), changePct: a ? round2(((b - a) / a) * 100) : null };
    })
    .sort((x, y) => Math.abs(y.change) - Math.abs(x.change));
}

// ---------- Budgets & goals ----------

export function budgetStatus(summary, budgets) {
  return Object.entries(budgets || {})
    .filter(([, limit]) => limit > 0)
    .map(([category, limit]) => {
      const spent = summary.categories.find((c) => c.category === category)?.total || 0;
      const pct = round2((spent / limit) * 100);
      return { category, limit, spent, pct, status: pct >= 100 ? 'over' : pct >= 80 ? 'near' : 'ok' };
    })
    .sort((a, b) => b.pct - a.pct);
}

export function monthsBetween(fromIso, toIso) {
  const a = new Date(fromIso);
  const b = new Date(toIso);
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()) + (b.getDate() >= a.getDate() ? 0 : -1);
}

/**
 * Progress for a savings goal: { target, saved, deadline, contributions[] }.
 * Computes how much needs to be saved each month to hit the deadline and whether
 * the recent contribution pace is on track.
 */
export function goalProgress(goal, today = new Date().toISOString().slice(0, 10)) {
  const saved = round2((goal.contributions || []).reduce((s, c) => s + c.amount, 0));
  const remaining = round2(Math.max(goal.target - saved, 0));
  const pct = goal.target > 0 ? Math.min(round2((saved / goal.target) * 100), 100) : 0;
  const monthsLeft = goal.deadline ? Math.max(monthsBetween(today, goal.deadline), 0) : null;
  const requiredMonthly = monthsLeft == null ? null : monthsLeft === 0 ? remaining : round2(remaining / monthsLeft);

  // Average monthly pace over the months that have contributions.
  const months = new Set((goal.contributions || []).map((c) => monthOf(c.date)));
  const pace = months.size ? round2(saved / months.size) : 0;

  let status = 'not-started';
  if (remaining === 0) status = 'complete';
  else if (monthsLeft === 0) status = 'overdue';
  else if (saved > 0 && requiredMonthly != null) status = pace >= requiredMonthly ? 'on-track' : 'behind';
  else if (saved > 0) status = 'in-progress';

  return { saved, remaining, pct, monthsLeft, requiredMonthly, pace, status };
}

export function formatMoney(n, currency = 'INR') {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 0 }).format(n);
  } catch {
    return `${currency} ${Math.round(n).toLocaleString()}`;
  }
}
