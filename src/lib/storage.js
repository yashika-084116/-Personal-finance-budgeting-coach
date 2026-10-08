const KEY = 'budget-coach:v1';

export const emptyState = {
  transactions: [],
  learned: {}, // merchantKey -> category, from manual re-categorizations
  goals: [],
  budgets: {},
  currency: 'INR',
  disclaimerAccepted: false,
};

export function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...emptyState, ...JSON.parse(raw) } : emptyState;
  } catch {
    return emptyState;
  }
}

export function saveState(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Storage full or blocked (private mode); the app keeps working in memory.
  }
}

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
