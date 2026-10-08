import { uid } from './storage.js';

// Three full months of realistic demo transactions ending last month.
const TEMPLATE = [
  [1, 'Salary credit - ACME Corp', 65000],
  [2, 'Rent payment to landlord', -18000],
  [3, 'BigBasket groceries', -2400],
  [4, 'Netflix subscription', -649],
  [5, 'Swiggy order', -480],
  [6, 'Uber trip', -320],
  [7, 'Electricity bill BESCOM', -1450],
  [8, 'Airtel broadband', -799],
  [9, 'Zomato order', -560],
  [10, 'Amazon purchase', -2199],
  [11, 'Starbucks coffee', -380],
  [12, 'Apollo pharmacy', -640],
  [13, 'Blinkit groceries', -1250],
  [14, 'PVR cinema tickets', -900],
  [15, 'Savings transfer to RD', -5000],
  [16, 'Spotify premium', -119],
  [17, 'Petrol fuel station', -2000],
  [18, 'Myntra clothing', -1899],
  [19, 'Swiggy order', -620],
  [20, 'Gym membership fitness', -1500],
  [21, 'Udemy course', -499],
  [22, 'Zepto groceries', -980],
  [23, 'Ola cab', -410],
  [24, 'Restaurant dinner', -2200],
  [25, 'Freelance payment received', 8000],
  [26, 'Flipkart electronics', -3499],
  [27, 'Swiggy order', -540],
];

// Per-month multipliers so the months differ (later months spend more on dining/shopping).
const DRIFT = [
  { Dining: 0.8, Shopping: 0.7, extra: [] },
  { Dining: 1.0, Shopping: 1.0, extra: [[22, 'BookMyShow concert', -2500]] },
  { Dining: 1.35, Shopping: 1.4, extra: [[12, 'Zomato order', -720], [27, 'IndiGo flight', -5400]] },
];

const DINING = /swiggy|zomato|starbucks|restaurant/i;
const SHOPPING = /amazon|myntra|flipkart/i;

export function generateSampleTransactions(today = new Date()) {
  const out = [];
  for (let i = 0; i < 3; i++) {
    const monthDate = new Date(today.getFullYear(), today.getMonth() - (3 - i), 1);
    const y = monthDate.getFullYear();
    const m = String(monthDate.getMonth() + 1).padStart(2, '0');
    const drift = DRIFT[i];
    for (const [day, description, amount] of [...TEMPLATE, ...drift.extra]) {
      let amt = amount;
      if (DINING.test(description)) amt = Math.round(amount * drift.Dining);
      if (SHOPPING.test(description)) amt = Math.round(amount * drift.Shopping);
      out.push({ id: uid(), date: `${y}-${m}-${String(day).padStart(2, '0')}`, description, amount: amt });
    }
  }
  return out;
}

export function sampleGoals(today = new Date()) {
  const iso = (d) => d.toISOString().slice(0, 10);
  const inMonths = (n) => iso(new Date(today.getFullYear(), today.getMonth() + n, 28));
  const ago = (n) => iso(new Date(today.getFullYear(), today.getMonth() - n, 15));
  return [
    {
      id: uid(), name: 'Emergency fund', target: 150000, deadline: inMonths(12),
      contributions: [{ id: uid(), date: ago(2), amount: 5000 }, { id: uid(), date: ago(1), amount: 5000 }, { id: uid(), date: ago(0), amount: 5000 }],
    },
    {
      id: uid(), name: 'New laptop', target: 80000, deadline: inMonths(6),
      contributions: [{ id: uid(), date: ago(1), amount: 6000 }],
    },
  ];
}

export const sampleBudgets = { Dining: 3500, Shopping: 5000, Groceries: 6000, Entertainment: 2000, Transport: 3000 };
